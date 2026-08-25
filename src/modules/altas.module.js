// =======================================================================
// src/modules/altas.module.js -- Modulo de Altas, Pre-altas, Calendar & Export
// =======================================================================

import { defaultCfg } from "../config/constants.js";
import { 
    db, 
    collection, 
    getDocs, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    where 
} from "../config/firebase.js";
import { 
    detectarTipoSuscripcion, 
    sincronizarEventoPrealtaCalendar, 
    sincronizarEventoAltaConfirmadaCalendar, 
    eliminarEventoAltaSeguro 
} from "../services/calendar.service.js";
import { calcularProximaFechaDiaHora } from "./match.module.js";

const mapaDiasCodigos = { 'D': 'Domingo', 'L': 'Lunes', 'M': 'Martes', 'X': 'Miercoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sabado' };

function convertirHoraAMinutos(horaStr) {
    if (!horaStr) return 0;
    const parts = horaStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || 0, 10);
}

function minutosAHora(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function getEmojiInstrumento(inst, cfg = defaultCfg) {
    if (!inst) return '🎵';
    const s = (Array.isArray(inst) ? inst.join(' ') : String(inst)).toLowerCase();
    if (s.includes('gui') || s.includes('electr')) return cfg?.emoji_guitarra || '🎸';
    if (s.includes('bat')) return cfg?.identificador_bateria || '🥁';
    if (s.includes('canto') || s.includes('voz') || s.includes('coro')) return cfg?.emoji_canto || '🎤';
    if (s.includes('pian') || s.includes('tecl')) return cfg?.emoji_piano || '🎹';
    if (s.includes('baj')) return cfg?.emoji_bajo || '🎸';
    if (s.includes('caj')) return cfg?.emoji_cajon || '📦';
    if (s.includes('sax') || s.includes('vient')) return '🎷';
    if (s.includes('viol')) return '🎻';
    if (s.includes('ukel') || s.includes('ucu')) return '🪕';
    return '🎵';
}

// -----------------------------------------------------------------------
// Render lista interactiva de instrumentos por alumno en pre-alta grupal
// -----------------------------------------------------------------------
export async function renderListaInstrumentosAlumnos(alumnosArr, cfg = defaultCfg) {
    const wrapLista = document.getElementById('prealta-lista-alumnos-instrumentos');
    const contAlumnos = document.getElementById('prealta-alumnos-container');
    if (!wrapLista || !contAlumnos) return;
    
    wrapLista.style.display = 'block';
    contAlumnos.innerHTML = '';

    let todosInstrumentos = [];
    try {
        const iSnap = await getDocs(collection(db, "instrumentos"));
        iSnap.forEach(d => todosInstrumentos.push(d.data().nombre));
    } catch(e) {}

    alumnosArr.forEach(al => {
        const instsAlumno = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);
        const opcionesInst = instsAlumno.length > 0 ? instsAlumno : todosInstrumentos;
        const instActual = al.instrumento_asignado || instsAlumno[0] || (opcionesInst[0] || '');

        const optHtml = opcionesInst.map(i => {
            const emoji = getEmojiInstrumento(i, cfg);
            return `<option value="${i}" ${i === instActual ? 'selected' : ''}>${emoji} ${i}</option>`;
        }).join('');

        contAlumnos.innerHTML += `
            <div class="prealta-alumno-row" style="display:flex; align-items:center; justify-content:space-between; background:var(--hover-bg); border:1px solid var(--border-color); border-radius:8px; padding:10px 12px; gap:10px;">
                <div style="font-size:13px; font-weight:600; color:var(--text-main); flex:1;">
                    👤 ${al.nombre}
                    <div style="font-size:11px; color:var(--text-muted);">${al.tipo_suscripcion || 'Ensamble'} ${al.edad ? '• ' + al.edad + 'a' : ''}</div>
                </div>
                <div>
                    <select class="modern-input prealta-alumno-inst-select" data-id="${al.id}" style="width:170px; padding:6px 8px; font-size:12.5px;">
                        ${optHtml}
                    </select>
                </div>
            </div>
        `;
    });
}

// -----------------------------------------------------------------------
// Refrescar profesores para pre-alta
// -----------------------------------------------------------------------
export async function refrescarProfesoresPrealta(instrumentoSeleccionado, profeSeleccionadoId = '') {
    const selectProfe = document.getElementById('prealta-profe-select');
    if (!selectProfe) return;
    selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
    try {
        const pSnap = await getDocs(collection(db, "profesores"));
        pSnap.forEach(pDoc => {
            const pr = { id: pDoc.id, ...pDoc.data() };
            const profeSkills = pr.skills || [];
            const ensenaInst = !instrumentoSeleccionado || profeSkills.length === 0 || profeSkills.some(s => s.toLowerCase() === instrumentoSeleccionado.toLowerCase());
            if (ensenaInst) {
                const opt = document.createElement('option');
                opt.value = pr.id;
                opt.textContent = `${pr.nombre} (${(pr.skills || []).join(', ') || 'General'})`;
                opt.dataset.nombre = pr.nombre;
                opt.dataset.calId = pr.correo_calendario || '';
                opt.dataset.disponibilidad = JSON.stringify(pr.disponibilidad || {});
                if (pr.id === profeSeleccionadoId) opt.selected = true;
                selectProfe.appendChild(opt);
            }
        });
    } catch(e) {}
}

// -----------------------------------------------------------------------
// Abrir Modal Pre-alta Individual / Edicion
// -----------------------------------------------------------------------
export async function abrirModalPrealta(id, esEdicionParam = false, cfg = defaultCfg) {
    const alDoc = await getDoc(doc(db, "alumnos", id));
    const al = alDoc.exists() ? alDoc.data() : {};
    document.getElementById('prealta-alumno-id').value = id;
    
    const tipoSusc = detectarTipoSuscripcion(al.tipo_suscripcion || '');
    const esIndividual = tipoSusc === 'individual';
    const esEdicion = esEdicionParam || al.estado_agenda === 'Pre-alta Iniciada';
    const vieneDeMatch = Boolean(al.horario_match || al.reserva_fecha_texto || al.reserva_profe_id);

    document.getElementById('titulo-prealta').textContent = `${esEdicion ? 'Editar' : 'Iniciar'} Pre-Alta — ${al.nombre || 'Alumno'}`;
    
    const campoGrupo = document.getElementById('prealta-campo-grupo');
    const campoProfe = document.getElementById('prealta-campo-profe');
    const selectProfe = document.getElementById('prealta-profe-select');
    const campoInst = document.getElementById('prealta-campo-instrumento');
    const selInstPrealta = document.getElementById('prealta-instrumento-select');
    const wrapLista = document.getElementById('prealta-lista-alumnos-instrumentos');
    const alertaValidacion = document.getElementById('prealta-alerta-validacion');
    if (alertaValidacion) alertaValidacion.style.display = 'none';

    const instsAlumno = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);
    const instActual = al.instrumento_asignado || instsAlumno[0] || '';

    if (esIndividual) {
        if (campoInst) campoInst.style.display = 'block';
        if (wrapLista) wrapLista.style.display = 'none';
        if (campoGrupo) campoGrupo.style.display = 'none';
        if (campoProfe) campoProfe.style.display = 'block';

        if (selInstPrealta) {
            selInstPrealta.innerHTML = '';
            if (instsAlumno.length > 0) {
                instsAlumno.forEach(i => {
                    selInstPrealta.innerHTML += `<option value="${i}" ${i === instActual ? 'selected' : ''}>${i}</option>`;
                });
            } else {
                selInstPrealta.innerHTML = '<option value="">Sin instrumento especificado</option>';
            }
            selInstPrealta.onchange = () => refrescarProfesoresPrealta(selInstPrealta.value, selectProfe.value);
        }

        await refrescarProfesoresPrealta(instActual, al.reserva_profe_id || '');
        document.getElementById('prealta-grupo').value = 'Clase Individual';
    } else {
        if (campoInst) campoInst.style.display = 'none';
        if (campoGrupo) campoGrupo.style.display = 'block';
        if (campoProfe) campoProfe.style.display = 'none';
        document.getElementById('prealta-grupo').value = al.grupo_asignado || '';
        await renderListaInstrumentosAlumnos([{ id, ...al }], cfg);
    }
    
    let fVal = '';
    if (al.fecha_inicio_clases) fVal = al.fecha_inicio_clases.substring(0, 16);
    else if (al.fecha_sugerida_inicio) fVal = al.fecha_sugerida_inicio;
    else if (al.dia_match && al.horario_inicio_match) fVal = calcularProximaFechaDiaHora(al.dia_match, al.horario_inicio_match);
    document.getElementById('prealta-fecha-inicio').value = fVal;

    const banner = document.getElementById('prealta-info-banner');
    banner.style.display = 'block';
    if (esEdicion) {
        banner.innerHTML = `✏️ <strong>Modificar Pre-Alta de ${al.nombre}:</strong> Podés ajustar el día, la hora de la clase y el ${esIndividual ? 'profesor asignado' : 'grupo'}.`;
    } else if (vieneDeMatch) {
        banner.innerHTML = `📅 <strong>Horario Match:</strong> ${al.horario_match || al.reserva_fecha_texto || '-'} • 👨‍🏫 <strong>Profesor:</strong> ${al.reserva_profe_nombre || '-'}`;
    } else {
        banner.innerHTML = `ℹ️ <strong>Pre-Alta Directa desde Lista de Espera:</strong> Alumno ${esIndividual ? 'Individual' : 'Grupal'} (${(al.instrumento || []).join(', ')}).`;
    }
    document.getElementById('modal-iniciar-prealta')?.showModal();
}

// -----------------------------------------------------------------------
// Abrir Modal Pre-alta Grupal / Masivo
// -----------------------------------------------------------------------
export async function abrirModalPrealtaGrupal(ids, grupoNom = '', cfg = defaultCfg) {
    if (!ids || ids.length === 0) return alert("No hay alumnos seleccionados.");

    const alumnosList = [];
    for (let id of ids) {
        const dSnap = await getDoc(doc(db, "alumnos", id));
        if (dSnap.exists()) alumnosList.push({ id: dSnap.id, ...dSnap.data() });
    }
    if (alumnosList.length === 0) return alert("No se encontraron datos de los alumnos.");

    const primerAl = alumnosList[0];

    document.getElementById('prealta-alumno-id').value = ids.join(',');
    document.getElementById('titulo-prealta').textContent = `Iniciar Pre-Alta Grupal (${ids.length} alumnos)`;
    
    const campoGrupo = document.getElementById('prealta-campo-grupo');
    const campoProfe = document.getElementById('prealta-campo-profe');
    const campoInst = document.getElementById('prealta-campo-instrumento');
    if (campoInst) campoInst.style.display = 'none';
    if (campoGrupo) campoGrupo.style.display = 'block';
    if (campoProfe) campoProfe.style.display = 'none';

    document.getElementById('prealta-grupo').value = grupoNom || primerAl.grupo_asignado || '';

    await renderListaInstrumentosAlumnos(alumnosList, cfg);

    let fVal = '';
    if (primerAl.fecha_inicio_clases) fVal = primerAl.fecha_inicio_clases.substring(0, 16);
    else if (primerAl.fecha_sugerida_inicio) fVal = primerAl.fecha_sugerida_inicio;
    else if (primerAl.dia_match && primerAl.horario_inicio_match) fVal = calcularProximaFechaDiaHora(primerAl.dia_match, primerAl.horario_inicio_match);
    document.getElementById('prealta-fecha-inicio').value = fVal;

    const banner = document.getElementById('prealta-info-banner');
    if (primerAl.horario_match || primerAl.reserva_fecha_texto || primerAl.reserva_profe_nombre) {
        banner.style.display = 'block';
        banner.innerHTML = `👥 <strong>Grupo:</strong> ${grupoNom || primerAl.grupo_asignado || '-'} • 📅 <strong>Horario:</strong> ${primerAl.horario_match || primerAl.reserva_fecha_texto || '-'} • 👨‍🏫 <strong>Profesor:</strong> ${primerAl.reserva_profe_nombre || '-'}`;
    } else {
        banner.style.display = 'none';
    }
    document.getElementById('modal-iniciar-prealta')?.showModal();
}

// -----------------------------------------------------------------------
// Guardar Pre-Alta (Procesa 1 o N alumnos)
// -----------------------------------------------------------------------
export async function guardarPreAlta(btnTarget, callbacks = {}) {
    const { setBotonCargando, cargarVista, generarTextoConHistorial, estadoActualVista } = callbacks;

    const idsRaw = document.getElementById('prealta-alumno-id').value;
    const ids = idsRaw.split(',').filter(Boolean);
    const fIni = document.getElementById('prealta-fecha-inicio').value;
    const grp = document.getElementById('prealta-grupo').value.trim();
    const selProfe = document.getElementById('prealta-profe-select');
    const profeId = selProfe ? selProfe.value : '';
    const profeNombre = selProfe && selProfe.selectedOptions[0] ? selProfe.selectedOptions[0].dataset.nombre : '';

    if (!fIni) return alert("Por favor ingresa la fecha y hora de la primera clase.");

    const primerDoc = await getDoc(doc(db, "alumnos", ids[0]));
    const primerAl = primerDoc.exists() ? primerDoc.data() : {};
    const tipoSusc = detectarTipoSuscripcion(primerAl.tipo_suscripcion || '');
    const esIndividual = tipoSusc === 'individual';

    if (esIndividual && !profeId && !primerAl.reserva_profe_id) {
        return alert("Por favor selecciona un profesor para la clase individual.");
    }
    if (!esIndividual && !grp) {
        return alert("Por favor ingresa el nombre del grupo.");
    }

    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, true);

    const dateObj = new Date(fIni);
    if (isNaN(dateObj.getTime())) {
        if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
        return alert("Fecha y hora invalidas.");
    }

    const diasCodigos = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const diaCodigo = diasCodigos[dateObj.getDay()];
    const horaInicioStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
    const durMin = 60;
    const horaFinMin = dateObj.getHours() * 60 + dateObj.getMinutes() + durMin;
    const horaFinStr = minutosAHora(horaFinMin);

    // Validar disponibilidad del alumno
    if (primerAl.disponibilidad && primerAl.disponibilidad[diaCodigo]) {
        const rangosAl = primerAl.disponibilidad[diaCodigo];
        const cubreAl = rangosAl.some(r => {
            const rIni = convertirHoraAMinutos(r.inicio || '09:00');
            const rFin = convertirHoraAMinutos(r.fin || '22:00');
            const slIni = dateObj.getHours() * 60 + dateObj.getMinutes();
            return slIni >= rIni && (slIni + durMin) <= rFin;
        });
        if (rangosAl.length > 0 && !cubreAl) {
            const confirmarForzar = await window.confirmar('Disponibilidad no coincide', 'El alumno no tiene disponibilidad para el horario seleccionado. ?Iniciar la Pre-Alta de todas formas?', 'Forzar Pre-Alta');
            if (!confirmarForzar) {
                if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
                return;
            }
        }
    }

    const fIso = dateObj.toISOString();
    const dateObjEnd = new Date(dateObj.getTime() + durMin * 60000);
    const fIsoEnd = dateObjEnd.toISOString();

    let alumnosDelGrupo = [];
    if (!esIndividual && grp) {
        try {
            const grpSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", grp)));
            grpSnap.forEach(d => alumnosDelGrupo.push({ id: d.id, ...d.data() }));
        } catch(e) {}
    }

    let evSincronizado = null;
    let textosCopiados = [];

    for (let id of ids) {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        const al = alDoc.exists() ? alDoc.data() : {};
        const finalGrupo = esIndividual ? 'Clase Individual' : (grp || al.grupo_asignado || 'Grupo Sin Nombre');
        const rowSelect = document.querySelector(`.prealta-alumno-inst-select[data-id="${id}"]`);
        const instSeleccionado = rowSelect ? rowSelect.value : (document.getElementById('prealta-instrumento-select')?.value || '');
        const instFinal = instSeleccionado || al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || ''));

        const finalProfeId = profeId || al.reserva_profe_id || '';
        const finalProfeNombre = profeNombre || al.reserva_profe_nombre || '';
        const alParaSync = {
            ...al,
            reserva_profe_id: finalProfeId,
            reserva_profe_nombre: finalProfeNombre,
            grupo_asignado: finalGrupo,
            instrumento_asignado: instFinal,
            instrumento: al.instrumento || []
        };

        if (!esIndividual) {
            if (!alumnosDelGrupo.some(a => a.id === id)) {
                alumnosDelGrupo.push({ id, ...alParaSync });
            }
        }

        if (!evSincronizado || esIndividual) {
            evSincronizado = await sincronizarEventoPrealtaCalendar(alParaSync, esIndividual, fIso, fIsoEnd, alumnosDelGrupo);
        }

        const updates = {
            estado_agenda: "Pre-alta Iniciada",
            fecha_inicio_clases: fIso,
            grupo_asignado: finalGrupo,
            instrumento_asignado: instFinal,
            reserva_profe_id: finalProfeId,
            reserva_profe_nombre: finalProfeNombre,
            dia_match: diaCodigo,
            horario_inicio_match: horaInicioStr,
            horario_fin_match: horaFinStr,
            horario_match: `${mapaDiasCodigos[diaCodigo] || diaCodigo} ${horaInicioStr} a ${horaFinStr} hs`
        };

        if (evSincronizado) {
            updates.id_evento_alta = evSincronizado.id;
            updates.calendario_evento_alta = evSincronizado.calendar;
        }

        if (!al.fecha_prealta) updates.fecha_prealta = new Date().toISOString();
        if (!al.checklist_alta) updates.checklist_alta = [false, false, false, false, false];
        
        const hist = al.historial || [];
        const fnHist = window.crearEntradaHistorial || ((txt, tipo) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: tipo || 'sistema' }));
        hist.push(fnHist(`Pre-Alta iniciada para "${finalGrupo}" con Profe ${finalProfeNombre} (Inicio: ${updates.horario_match}).`, 'alta'));
        updates.historial = hist;

        await updateDoc(doc(db, "alumnos", id), updates);

        if (typeof generarTextoConHistorial === 'function') {
            const dataText = await generarTextoConHistorial(id, 'texto_prealta', updates.horario_match, finalProfeId, finalProfeNombre);
            textosCopiados.push(`--- ${al.nombre} ---\n${dataText.txt}`);
        }
    }

    if (textosCopiados.length > 0) {
        await navigator.clipboard.writeText(textosCopiados.join('\n\n'));
    }
    
    document.getElementById('modal-iniciar-prealta')?.close();
    ids.forEach(id => {
        if (typeof window.removerFilaOptimista === 'function') window.removerFilaOptimista(id);
    });
    if (typeof cargarVista === 'function') await cargarVista(estadoActualVista || 'Altas - En Curso');
    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
    alert(`✅ Pre-Alta iniciada para ${ids.length} alumno(s).\nEvento agendado en Google Calendar con formato 🚀 y texto copiado.`);
}

// -----------------------------------------------------------------------
// Formateo y Copiado para Excel / Sheets (BD y Facturacion)
// -----------------------------------------------------------------------
export function formatearFechaAltaParaExcel(al) {
    if (al.fecha_alta_confirmada) {
        const d = new Date(al.fecha_alta_confirmada);
        if (!isNaN(d.getTime())) return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    }
    if (al.fecha_alta_finalizada) {
        const d = new Date(al.fecha_alta_finalizada);
        if (!isNaN(d.getTime())) return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    }
    if (al.fecha_prealta) {
        const d = new Date(al.fecha_prealta);
        if (!isNaN(d.getTime())) return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    }
    const now = new Date();
    return `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;
}

export function formatearFechaInicioParaExcel(al) {
    if (al.fecha_inicio_clases) {
        const d = new Date(al.fecha_inicio_clases);
        if (!isNaN(d.getTime())) {
            const dia = d.getDate().toString().padStart(2, '0');
            const mes = (d.getMonth() + 1).toString().padStart(2, '0');
            const hora = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            return `${dia}/${mes} ${hora}:${min}`;
        }
    }
    if (al.dia_match && al.horario_inicio_match) {
        return `${al.dia_match} ${al.horario_inicio_match}`;
    }
    return al.reserva_fecha_texto || "";
}

export function generarFilaExcelBD(al) {
    const instFinal = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || ''));
    const pagoStr = al.estado_agenda === 'Alta Efectiva' ? 'SI' : (al.estado_agenda === 'Alta Ilegal' ? 'NO' : '');
    const fechaAlta = formatearFechaAltaParaExcel(al);
    const fechaInicio = formatearFechaInicioParaExcel(al);

    const cols = [
        al.nombre || '',
        al.reserva_profe_nombre || '',
        '',
        al.grupo_asignado || 'Individual',
        al.nivel || '',
        instFinal,
        al.tipo_suscripcion || '',
        pagoStr,
        fechaAlta,
        fechaInicio
    ];
    return cols.join('\t');
}

export function generarFilaExcelFacturacion(al) {
    const cols = [
        al.nombre || '',
        al.celular || '',
        al.email || '',
        al.tipo_suscripcion || '',
        al.precio_suscripcion || '',
        al.metodo_pago || '',
        formatearFechaAltaParaExcel(al)
    ];
    return cols.join('\t');
}

export async function copiarFilaExcelBD(id) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const txt = generarFilaExcelBD(alDoc.data());
        await navigator.clipboard.writeText(txt);
        alert(`📋 Fila para BD de GoogleSheet copiada al portapapeles:\n\n${txt}`);
    } catch(err) {
        alert("Error al copiar fila para BD: " + err.message);
    }
}

export async function copiarFilaExcelFacturacion(id) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const txt = generarFilaExcelFacturacion(alDoc.data());
        await navigator.clipboard.writeText(txt);
        alert(`💰 Fila para Facturacion copiada al portapapeles:\n\n${txt}`);
    } catch(err) {
        alert("Error al copiar fila para Facturacion: " + err.message);
    }
}

// Window Global Bindings
window.generarFilaExcelBD = generarFilaExcelBD;
window.generarFilaExcelFacturacion = generarFilaExcelFacturacion;
window.copiarFilaExcelBD = copiarFilaExcelBD;
window.copiarFilaExcelFacturacion = copiarFilaExcelFacturacion;