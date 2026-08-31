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
    formatoLocalISO,
    sincronizarEventoPrealtaCalendar, 
    sincronizarEventoAltaConfirmadaCalendar, 
    eliminarEventoAltaSeguro,
    validarConflictoCalendarEnVivo
} from "../services/calendar.service.js?v=5.9.10";
import { calcularProximaFechaDiaHora } from "./match.module.js";

const mapaDiasCodigos = { 'D': 'Domingo', 'L': 'Lunes', 'M': 'Martes', 'X': 'Miércoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sábado' };

function isoToDatetimeLocal(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr).substring(0, 16);
    return formatoLocalISO(d).substring(0, 16);
}

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
// Duración de la clase según modalidad (Ensamble Mandalorian = 90m, otros = 60m)
// -----------------------------------------------------------------------
export function obtenerDuracionPrealtaMinutos() {
    const campoTipoEns = document.getElementById('prealta-campo-tipo-ensamble');
    if (campoTipoEns && campoTipoEns.style.display !== 'none') {
        const rMandalorian = document.querySelector('input[name="prealta-tipo-ensamble"][value="Ensamble Mandalorian"]');
        if (rMandalorian && rMandalorian.checked) return 90;
    }
    return 60;
}

// -----------------------------------------------------------------------
// Calcular nombre de grupo sugerido: DHH.MM NombreDocente
// Ej: J19.00 Nacho, M18.30 Javi, S11.00 Facu
// -----------------------------------------------------------------------
export function calcularNombreGrupoSugerido(fechaHoraStr, profeNombre) {
    if (!fechaHoraStr || !profeNombre) return '';
    const d = new Date(fechaHoraStr);
    if (isNaN(d.getTime())) return '';
    const diasMap = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
    const diaCod = diasMap[d.getDay()];
    const hh = d.getHours().toString();
    const mins = d.getMinutes();
    const mmStr = mins === 0 ? '' : `.${mins.toString().padStart(2, '0')}`;
    let pNom = (profeNombre || '').trim().split(' ')[0].replace(/[()]/g, '');
    if (!pNom || pNom.toLowerCase() === 'seleccionar') return '';
    return `${diaCod}${hh}${mmStr} ${pNom}`;
}

// -----------------------------------------------------------------------
// Autocompletar campo Grupo o Taller con DHH.MM Profe
// -----------------------------------------------------------------------
export function autoCompletarNombreGrupoPrealta() {
    const campoGrupo = document.getElementById('prealta-grupo');
    const inputFechaIni = document.getElementById('prealta-fecha-inicio');
    const selectProfe = document.getElementById('prealta-profe-select');

    if (!campoGrupo || !inputFechaIni || !selectProfe) return;

    const opt = selectProfe.selectedOptions[0];
    const profeId = selectProfe.value;
    const profeNombre = (opt && opt.dataset.nombre) ? opt.dataset.nombre : (opt ? opt.textContent.split('(')[0].trim() : '');

    if (!profeId || !inputFechaIni.value || profeNombre.toLowerCase().includes('ningún profesor') || profeNombre.toLowerCase().includes('seleccionar')) {
        campoGrupo.value = '';
        return;
    }

    const sugerido = calcularNombreGrupoSugerido(inputFechaIni.value, profeNombre);
    if (sugerido) {
        campoGrupo.value = sugerido;
    }
}

// -----------------------------------------------------------------------
// Controlar visibilidad secuencial de campos en Pre-Alta:
// 1. Fecha y Hora -> 2. Profesor Asignado -> 3. Grupo o Taller
// -----------------------------------------------------------------------
export function actualizarVisibilidadCamposPrealta(tipoSusc) {
    const inputFechaIni = document.getElementById('prealta-fecha-inicio');
    const campoProfe = document.getElementById('prealta-campo-profe');
    const selectProfe = document.getElementById('prealta-profe-select');
    const campoGrupo = document.getElementById('prealta-campo-grupo');

    const hayFecha = Boolean(inputFechaIni && inputFechaIni.value);
    const hayProfe = Boolean(selectProfe && selectProfe.value);
    const esIndividual = tipoSusc === 'individual';

    if (campoProfe) {
        campoProfe.style.display = hayFecha ? 'block' : 'none';
    }

    if (campoGrupo) {
        campoGrupo.style.display = (!esIndividual && hayFecha && hayProfe) ? 'block' : 'none';
    }
}

// -----------------------------------------------------------------------
// Refrescar profesores para pre-alta según tipo (Ensamble vs Grupal vs Individual)
// -----------------------------------------------------------------------
export async function refrescarProfesoresPrealta(tipoClase, instrumentoSeleccionado = '', profeSeleccionadoId = '') {
    const selectProfe = document.getElementById('prealta-profe-select');
    if (!selectProfe) return;
    selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
    try {
        const pSnap = await getDocs(collection(db, "profesores"));
        const profesores = [];
        pSnap.forEach(pDoc => {
            const data = pDoc.data();
            if (data.activo !== false && data.estado !== 'inactivo') {
                profesores.push({ id: pDoc.id, ...data });
            }
        });

        const esEnsamble = tipoClase === 'ensamble';
        const esGrupal = tipoClase === 'grupal';

        // Chequear disponibilidad teórica si hay fecha/hora seleccionada
        const fIniVal = document.getElementById('prealta-fecha-inicio')?.value;
        let diaCod = null;
        let slotIniMins = null;
        let slotFinMins = null;
        const durMin = obtenerDuracionPrealtaMinutos();
        if (fIniVal) {
            const dObj = new Date(fIniVal);
            if (!isNaN(dObj.getTime())) {
                const diasMap = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
                diaCod = diasMap[dObj.getDay()];
                slotIniMins = dObj.getHours() * 60 + dObj.getMinutes();
                slotFinMins = slotIniMins + durMin;
            }
        }

        const aptos = [];
        profesores.forEach(pr => {
            const profeSkills = Array.isArray(pr.skills) ? pr.skills : [];
            let estaHabilitado = false;
            let etiqueta = '';

            if (esEnsamble) {
                estaHabilitado = pr.ensambles === true;
                etiqueta = 'Ensamble';
            } else if (esGrupal) {
                const tieneAptitudGrupal = pr.grupales === true;
                const tieneSkill = instrumentoSeleccionado
                    ? profeSkills.some(s => s.toLowerCase().trim() === instrumentoSeleccionado.toLowerCase().trim())
                    : true;
                estaHabilitado = tieneAptitudGrupal && tieneSkill;
                etiqueta = `Grupal ${instrumentoSeleccionado || ''}`.trim();
            } else {
                if (instrumentoSeleccionado) {
                    estaHabilitado = profeSkills.some(s => s.toLowerCase().trim() === instrumentoSeleccionado.toLowerCase().trim());
                } else {
                    estaHabilitado = profeSkills.length > 0;
                }
                etiqueta = profeSkills.join(', ') || 'Individual';
            }

            if (estaHabilitado) {
                let cubreHorario = false;
                if (diaCod && slotIniMins !== null && pr.disponibilidad && pr.disponibilidad[diaCod]) {
                    const rangos = pr.disponibilidad[diaCod] || [];
                    cubreHorario = rangos.some(r => {
                        if (!r) return false;
                        const rIni = typeof r === 'object' ? (r.inicio || '09:00') : (r.split(/[-a]/)[0] || '09:00');
                        const rFin = typeof r === 'object' ? (r.fin || '22:00') : (r.split(/[-a]/)[1] || r.split(/[-a]/)[0] || '22:00');
                        const pStart = convertirHoraAMinutos(rIni);
                        const pEnd = convertirHoraAMinutos(rFin);
                        return slotIniMins >= pStart && slotFinMins <= pEnd;
                    });
                }

                aptos.push({ pr, etiqueta, cubreHorario });
            }
        });

        // Mostrar exclusivamente los profesores disponibles y aptos para el horario seleccionado
        if (diaCod && slotIniMins !== null) {
            const disponiblesEnHorario = aptos.filter(a => a.cubreHorario);
            disponiblesEnHorario.sort((a, b) => (a.pr.nombre || '').localeCompare(b.pr.nombre || ''));
            disponiblesEnHorario.forEach(({ pr, etiqueta }) => {
                const opt = document.createElement('option');
                opt.value = pr.id;
                opt.textContent = `${pr.nombre} (${etiqueta})`;
                opt.dataset.nombre = pr.nombre;
                opt.dataset.calId = pr.correo_calendario || '';
                opt.dataset.disponibilidad = JSON.stringify(pr.disponibilidad || {});
                if (pr.id === profeSeleccionadoId || (pr.nombre && pr.nombre === profeSeleccionadoId)) {
                    opt.selected = true;
                }
                selectProfe.appendChild(opt);
            });
        }

        if (selectProfe.options.length <= 1) {
            const opt = document.createElement('option');
            opt.value = "";
            opt.disabled = true;
            opt.selected = true;
            opt.textContent = "⚠️ Ningún profesor disponible para este horario";
            selectProfe.appendChild(opt);
        }
    } catch(e) {
        console.error("Error al refrescar profesores de prealta:", e);
    }
}

// -----------------------------------------------------------------------
// Verificación en vivo en Google Calendar (Aulas, Baterías, Profesor)
// -----------------------------------------------------------------------
export async function verificarPrealtaEnCalendar(alumnosList = [], cfg = defaultCfg) {
    const fIni = document.getElementById('prealta-fecha-inicio')?.value;
    const selectProfe = document.getElementById('prealta-profe-select');
    const alertaValidacion = document.getElementById('prealta-alerta-validacion');
    if (!alertaValidacion) return;

    if (!fIni || !selectProfe || !selectProfe.value) {
        alertaValidacion.style.display = 'none';
        return;
    }

    const dStart = new Date(fIni);
    if (isNaN(dStart.getTime())) {
        alertaValidacion.style.display = 'none';
        return;
    }

    const durMin = obtenerDuracionPrealtaMinutos();
    const dEnd = new Date(dStart.getTime() + durMin * 60000);

    const opt = selectProfe.selectedOptions[0];
    const profeId = selectProfe.value;
    const profeNombre = opt ? (opt.dataset.nombre || opt.textContent.split('(')[0].trim()) : '';
    const profeCalId = opt ? (opt.dataset.calId || '') : '';

    const tieneBateria = alumnosList.some(al => {
        const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento || ''];
        return insts.some(i => (i || '').toLowerCase().includes('bat')) || (al.instrumento_asignado || '').toLowerCase().includes('bat');
    }) || (document.getElementById('prealta-instrumento-select')?.value || '').toLowerCase().includes('bat');

    alertaValidacion.style.display = 'block';
    alertaValidacion.style.background = '#f8fafc';
    alertaValidacion.style.color = '#64748b';
    alertaValidacion.style.border = '1px solid #e2e8f0';
    alertaValidacion.innerHTML = '🔄 Verificando disponibilidad en Google Calendar (aulas, baterías y profesor)...';

    try {
        const resVal = await validarConflictoCalendarEnVivo({
            inicioISO: dStart.toISOString(),
            finISO: dEnd.toISOString(),
            profeId,
            profeNombre,
            profeCalId,
            esBateria: tieneBateria,
            configApp: cfg
        });

        if (!resVal.valido) {
            alertaValidacion.style.background = '#fef2f2';
            alertaValidacion.style.color = '#dc2626';
            alertaValidacion.style.border = '1px solid #fecaca';
            alertaValidacion.innerHTML = `⚠️ <strong>Conflicto detectado en Calendar:</strong> ${resVal.motivo}`;
        } else {
            alertaValidacion.style.background = '#f0fdf4';
            alertaValidacion.style.color = '#16a34a';
            alertaValidacion.style.border = '1px solid #bbf7d0';
            alertaValidacion.innerHTML = `✅ <strong>Google Calendar OK:</strong> ${resVal.detalle || 'Profesor, aulas y recursos disponibles'}`;
        }
    } catch(err) {
        console.warn("No se pudo verificar disponibilidad en Google Calendar:", err);
        alertaValidacion.style.display = 'none';
    }
}
// -----------------------------------------------------------------------
// Validar requisitos de Match (Edades, Niveles y Disponibilidad) en Pre-Alta Grupal
// -----------------------------------------------------------------------
export function validarRequisitosMatchAlumnos(alumnosList, fechaHoraStr = '', durMin = 60, cfg = defaultCfg) {
    const warnings = [];
    if (!Array.isArray(alumnosList) || alumnosList.length === 0) {
        return warnings;
    }

    const esGrupo = alumnosList.length >= 2;

    // 1. Validar diferencia de edad (solo si hay 2 o más alumnos)
    if (esGrupo) {
        const edades = alumnosList.map(a => parseInt(a.edad)).filter(e => !isNaN(e) && e > 0);
        if (edades.length > 1) {
            const minEdad = Math.min(...edades);
            const maxEdad = Math.max(...edades);
            const diff = maxEdad - minEdad;
            let maxPermitido = 5;
            if (minEdad < 18) {
                maxPermitido = 3;
            } else {
                const reglas = Array.isArray(cfg?.reglas_edad_match) && cfg.reglas_edad_match.length > 0
                    ? cfg.reglas_edad_match
                    : defaultCfg.reglas_edad_match;
                let reglaAplicable = reglas[0];
                for (let r of reglas) {
                    if (minEdad >= r.desde) {
                        reglaAplicable = r;
                    }
                }
                maxPermitido = reglaAplicable ? Math.abs(reglaAplicable.rango_max - reglaAplicable.rango_min) : 8;
            }
            if (diff > maxPermitido) {
                warnings.push(`Diferencia de edad alta: el más joven tiene ${minEdad} años y el mayor ${maxEdad} años (diferencia de ${diff} años, regla sugerida: máx ${maxPermitido}).`);
            }
        }
    }

    // 2. Validar compatibilidad de niveles (solo si hay 2 o más alumnos)
    if (esGrupo) {
        const niveles = alumnosList.map(a => (a.nivel || '').toLowerCase().trim()).filter(Boolean);
        if (niveles.length > 1) {
            const tieneInicial = niveles.some(n => n.includes('inicial'));
            const tieneAvanzado = niveles.some(n => n.includes('avanzado') || n.includes('medio'));
            if (tieneInicial && tieneAvanzado) {
                warnings.push(`Incompatibilidad de niveles sugerida: integrantes con niveles dispares (${alumnosList.map(a => `${a.nombre}: ${a.nivel || '-'}`).join(', ')}).`);
            }
        }
    }

    // 3. Validar disponibilidad de los alumnos para la fecha/hora seleccionada (1 o N alumnos)
    if (fechaHoraStr) {
        const dObj = new Date(fechaHoraStr);
        if (!isNaN(dObj.getTime())) {
            const diasMap = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
            const diaCod = diasMap[dObj.getDay()];
            const mapaDiasNombres = { 'D': 'Domingo', 'L': 'Lunes', 'M': 'Martes', 'X': 'Miércoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sábado' };
            const diaNom = mapaDiasNombres[diaCod] || diaCod;
            const slotIniMins = dObj.getHours() * 60 + dObj.getMinutes();
            const slotFinMins = slotIniMins + durMin;
            const hIniStr = `${dObj.getHours().toString().padStart(2, '0')}:${dObj.getMinutes().toString().padStart(2, '0')}`;
            const hFinStr = minutosAHora(slotFinMins);

            alumnosList.forEach(al => {
                let dispResumen = '';
                if (al.disponibilidad && typeof al.disponibilidad === 'object') {
                    const diasConDisp = Object.keys(al.disponibilidad).filter(k => (al.disponibilidad[k] || []).length > 0);
                    if (diasConDisp.length > 0) {
                        dispResumen = diasConDisp.map(k => {
                            const dNom = mapaDiasNombres[k] || k;
                            const rStrs = al.disponibilidad[k].map(r => typeof r === 'object' ? `${r.inicio || '09:00'} a ${r.fin || '22:00'} hs` : r).join(', ');
                            return `${dNom} (${rStrs})`;
                        }).join(' • ');
                    }
                }

                if (al.disponibilidad && al.disponibilidad[diaCod] && al.disponibilidad[diaCod].length > 0) {
                    const rangos = al.disponibilidad[diaCod];
                    const coincide = rangos.some(r => {
                        if (!r) return false;
                        const rIni = typeof r === 'object' ? (r.inicio || '09:00') : (r.split(/[-a]/)[0] || '09:00');
                        const rFin = typeof r === 'object' ? (r.fin || '22:00') : (r.split(/[-a]/)[1] || r.split(/[-a]/)[0] || '22:00');
                        const pStart = convertirHoraAMinutos(rIni);
                        const pEnd = convertirHoraAMinutos(rFin);
                        return slotIniMins >= pStart && slotFinMins <= pEnd;
                    });
                    if (!coincide) {
                        warnings.push(`${al.nombre} tiene disponibilidad en ${diaNom} pero no cubre la franja de ${hIniStr} a ${hFinStr} hs.${dispResumen ? ` (Su disponibilidad registrada es: ${dispResumen})` : ''}`);
                    }
                } else {
                    warnings.push(`${al.nombre} no tiene disponibilidad registrada para los días ${diaNom}.${dispResumen ? ` (Su disponibilidad registrada es: ${dispResumen})` : ''}`);
                }
            });
        }
    }

    return warnings;
}

export function renderizarAdvertenciasMatchPrealta(alumnosList, fechaHoraStr = '', durMin = 60, cfg = defaultCfg) {
    const cont = document.getElementById('prealta-match-warnings-container');
    const list = document.getElementById('prealta-match-warnings-list');
    if (!cont || !list) return;

    if (!alumnosList || alumnosList.length === 0) {
        cont.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    const warnings = validarRequisitosMatchAlumnos(alumnosList, fechaHoraStr, durMin, cfg);
    if (warnings.length > 0) {
        list.innerHTML = warnings.map(w => `<div>• ⚠️ ${w}</div>`).join('');
        cont.style.display = 'block';
    } else {
        list.innerHTML = '';
        cont.style.display = 'none';
    }
}

// -----------------------------------------------------------------------
// Abrir Modal Pre-alta Individual / Edicion / Modificar Alta
// -----------------------------------------------------------------------
export async function abrirModalPrealta(id, arg2 = '', arg3 = '', arg4 = {}, arg5 = {}) {
    const dSnap = await getDoc(doc(db, "alumnos", id));
    if (!dSnap.exists()) return alert("Alumno no encontrado.");
    const al = { id: dSnap.id, ...dSnap.data() };

    let esEdicionParam = false;
    let grupoPrev = '';
    let inicioPrev = '';
    let opts = {};

    // Si arg2 es boolean: fue llamado como (id, esEdicion, inicioPrev, grupoPrev, options)
    if (typeof arg2 === 'boolean') {
        esEdicionParam = arg2;
        inicioPrev = (typeof arg3 === 'string' && arg3) ? arg3 : '';
        grupoPrev = (typeof arg4 === 'string' && arg4) ? arg4 : '';
        opts = (typeof arg5 === 'object' && arg5 !== null) ? arg5 : {};
    } else {
        // Llamado estándar como (id, grupoPrev, inicioPrev, options)
        grupoPrev = (typeof arg2 === 'string' && arg2) ? arg2 : '';
        inicioPrev = (typeof arg3 === 'string' && arg3) ? arg3 : '';
        opts = (typeof arg4 === 'object' && arg4 !== null) ? arg4 : {};
        if (opts.esEdicion) esEdicionParam = true;
    }

    const configApp = opts.configApp || defaultCfg;
    const profeSugerido = opts.profeIdSugerido || '';

    document.getElementById('prealta-alumno-id').value = id;
    
    const tipoSusc = detectarTipoSuscripcion(al.tipo_suscripcion || '');
    const esIndividual = tipoSusc === 'individual';
    const esAltaConfirmada = ['Alta Efectiva', 'Alta Ilegal', 'Alta Finalizada'].includes(al.estado_agenda);
    const esEdicion = esEdicionParam || al.estado_agenda === 'Pre-alta Iniciada' || al.estado_agenda === 'Pre-alta iniciada' || esAltaConfirmada;
    const vieneDeMatch = Boolean(al.horario_match && al.horario_match !== al.reserva_fecha_texto);

    const tituloTexto = esAltaConfirmada 
        ? `Modificar Alta — ${al.nombre || 'Alumno'}`
        : `${esEdicion ? 'Editar' : 'Iniciar'} Pre-Alta — ${al.nombre || 'Alumno'}`;
    document.getElementById('titulo-prealta').textContent = tituloTexto;
    
    const campoGrupo = document.getElementById('prealta-campo-grupo');
    const campoProfe = document.getElementById('prealta-campo-profe');
    const selectProfe = document.getElementById('prealta-profe-select');
    const campoInst = document.getElementById('prealta-campo-instrumento');
    const selInstPrealta = document.getElementById('prealta-instrumento-select');
    const wrapLista = document.getElementById('prealta-lista-alumnos-instrumentos');
    const alertaValidacion = document.getElementById('prealta-alerta-validacion');
    if (alertaValidacion) alertaValidacion.style.display = 'none';
    const matchWarnCont = document.getElementById('prealta-match-warnings-container');
    if (matchWarnCont) matchWarnCont.style.display = 'none';
    const matchWarnList = document.getElementById('prealta-match-warnings-list');
    if (matchWarnList) matchWarnList.innerHTML = '';

    const instsAlumno = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);
    const instActual = al.instrumento_asignado || instsAlumno[0] || '';
    const profeActualId = profeSugerido || al.reserva_profe_id || al.profesor_id || '';

    // La fecha y hora NUNCA vienen precargadas en altas nuevas
    let fVal = '';
    let grupoVal = '';
    if (esEdicion || esAltaConfirmada) {
        if (inicioPrev) fVal = isoToDatetimeLocal(inicioPrev);
        else if (al.fecha_inicio_clases) fVal = isoToDatetimeLocal(al.fecha_inicio_clases);
        else if (al.fecha_sugerida_inicio) fVal = isoToDatetimeLocal(al.fecha_sugerida_inicio);
        else if (al.dia_match && al.horario_inicio_match) fVal = calcularProximaFechaDiaHora(al.dia_match, al.horario_inicio_match);
        grupoVal = grupoPrev || al.grupo_asignado || '';
    }
    document.getElementById('prealta-fecha-inicio').value = fVal;
    document.getElementById('prealta-grupo').value = grupoVal;

    if (esIndividual) {
        if (campoInst) campoInst.style.display = 'block';
        if (wrapLista) wrapLista.style.display = 'none';
        if (campoGrupo) campoGrupo.style.display = 'none';
        const campoTipoEns = document.getElementById('prealta-campo-tipo-ensamble');
        if (campoTipoEns) campoTipoEns.style.display = 'none';

        if (selInstPrealta) {
            selInstPrealta.innerHTML = '';
            if (instsAlumno.length > 0) {
                instsAlumno.forEach(i => {
                    selInstPrealta.innerHTML += `<option value="${i}" ${i === instActual ? 'selected' : ''}>${i}</option>`;
                });
            } else {
                selInstPrealta.innerHTML = '<option value="">Sin instrumento especificado</option>';
            }
            selInstPrealta.onchange = async () => {
                if (document.getElementById('prealta-fecha-inicio')?.value) {
                    await refrescarProfesoresPrealta('individual', selInstPrealta.value, selectProfe.value);
                }
                verificarPrealtaEnCalendar([al], configApp);
            };
        }

        if (fVal) {
            await refrescarProfesoresPrealta('individual', instActual, profeActualId);
        } else {
            selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
        }
        document.getElementById('prealta-grupo').value = 'Clase Individual';
    } else {
        if (campoInst) campoInst.style.display = 'none';
        
        // Modalidad Ensamble: SOLO visible si tipo_suscripcion es ensamble
        const campoTipoEns = document.getElementById('prealta-campo-tipo-ensamble');
        if (campoTipoEns) {
            campoTipoEns.style.display = (tipoSusc === 'ensamble') ? 'block' : 'none';
            if (tipoSusc === 'ensamble') {
                const esMandalorian = (al.tipo_suscripcion || '').toLowerCase().includes('mandalorian') || al.tipo_ensamble === 'Ensamble Mandalorian';
                const rMandalorian = document.querySelector('input[name="prealta-tipo-ensamble"][value="Ensamble Mandalorian"]');
                const rEnsamble = document.querySelector('input[name="prealta-tipo-ensamble"][value="Ensamble"]');
                if (esMandalorian && rMandalorian) rMandalorian.checked = true;
                else if (rEnsamble) rEnsamble.checked = true;
            }
        }
        await renderListaInstrumentosAlumnos([{ id, ...al }], configApp);
        if (fVal) {
            await refrescarProfesoresPrealta(tipoSusc, instActual, profeActualId);
            autoCompletarNombreGrupoPrealta();
        } else {
            selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
        }
    }

    actualizarVisibilidadCamposPrealta(tipoSusc);

    // Vincular listeners para reactividad secuencial
    const inputFechaIni = document.getElementById('prealta-fecha-inicio');
    if (inputFechaIni) {
        inputFechaIni.onchange = async () => {
            if (inputFechaIni.value) {
                await refrescarProfesoresPrealta(tipoSusc, instActual, selectProfe.value);
            } else {
                selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
            }
            autoCompletarNombreGrupoPrealta();
            actualizarVisibilidadCamposPrealta(tipoSusc);
            renderizarAdvertenciasMatchPrealta([al], inputFechaIni.value, obtenerDuracionPrealtaMinutos(), configApp);
            verificarPrealtaEnCalendar([al], configApp);
        };
        inputFechaIni.oninput = inputFechaIni.onchange;
    }
    if (selectProfe) {
        selectProfe.onchange = () => {
            autoCompletarNombreGrupoPrealta();
            actualizarVisibilidadCamposPrealta(tipoSusc);
            renderizarAdvertenciasMatchPrealta([al], inputFechaIni?.value || '', obtenerDuracionPrealtaMinutos(), configApp);
            verificarPrealtaEnCalendar([al], configApp);
        };
    }
    document.querySelectorAll('input[name="prealta-tipo-ensamble"]').forEach(radio => {
        radio.onchange = async () => {
            if (inputFechaIni && inputFechaIni.value) {
                await refrescarProfesoresPrealta(tipoSusc, instActual, selectProfe.value);
            }
            autoCompletarNombreGrupoPrealta();
            actualizarVisibilidadCamposPrealta(tipoSusc);
            verificarPrealtaEnCalendar([al], configApp);
        };
    });

    const banner = document.getElementById('prealta-info-banner');
    banner.style.display = 'block';
    if (esAltaConfirmada) {
        banner.innerHTML = `✏️ <strong>Modificar Alta de ${al.nombre} (${al.estado_agenda}):</strong> Podés forzar la edición del profesor, grupo y horario de inicio.`;
    } else if (esEdicion) {
        banner.innerHTML = `✏️ <strong>Modificar Pre-Alta de ${al.nombre}:</strong> Podés ajustar la fecha y hora de inicio, el profesor asignado y ${esIndividual ? 'el instrumento' : 'el grupo'}.`;
    } else if (vieneDeMatch) {
        banner.innerHTML = `🎯 <strong>Horario Match:</strong> ${al.horario_match} • 👨‍🏫 <strong>Profesor Asignado:</strong> ${al.reserva_profe_nombre || al.profesor_asignado || '-'}`;
    } else {
        const evaluadorTxt = al.reserva_profe_nombre ? ` • Entrevistado por: ${al.reserva_profe_nombre}` : '';
        const fechaEntTxt = al.reserva_fecha_texto ? ` (${al.reserva_fecha_texto})` : '';
        banner.innerHTML = `ℹ️ <strong>Pre-Alta desde Lista de Espera:</strong> Alumno ${esIndividual ? 'Individual' : (tipoSusc === 'grupal' ? 'Grupal' : 'Ensamble')} (${instsAlumno.join(', ')})${evaluadorTxt}${fechaEntTxt}`;
    }

    if (fVal && selectProfe?.value) {
        verificarPrealtaEnCalendar([al], configApp);
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
    const profeActualId = primerAl.reserva_profe_id || primerAl.profesor_id || '';

    document.getElementById('prealta-alumno-id').value = ids.join(',');
    document.getElementById('titulo-prealta').textContent = `Iniciar Pre-Alta Grupal (${ids.length} alumnos)`;
    
    const campoGrupo = document.getElementById('prealta-campo-grupo');
    const campoProfe = document.getElementById('prealta-campo-profe');
    const campoInst = document.getElementById('prealta-campo-instrumento');
    if (campoInst) campoInst.style.display = 'none';
    const campoTipoEns = document.getElementById('prealta-campo-tipo-ensamble');
    const todosEnsambles = alumnosList.every(a => detectarTipoSuscripcion(a.tipo_suscripcion || '') === 'ensamble');
    if (campoTipoEns) campoTipoEns.style.display = todosEnsambles ? 'block' : 'none';

    const tipoSuscGrupal = todosEnsambles ? 'ensamble' : 'grupal';

    // Fecha, Profesor y Grupo inician vacíos para nueva pre-alta grupal
    document.getElementById('prealta-fecha-inicio').value = '';
    document.getElementById('prealta-grupo').value = '';
    const selectProfe = document.getElementById('prealta-profe-select');
    if (selectProfe) {
        selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
    }

    await renderListaInstrumentosAlumnos(alumnosList, cfg);
    actualizarVisibilidadCamposPrealta(tipoSuscGrupal);
    renderizarAdvertenciasMatchPrealta(alumnosList, '', obtenerDuracionPrealtaMinutos(), cfg);

    const inputFechaIni = document.getElementById('prealta-fecha-inicio');
    if (inputFechaIni) {
        inputFechaIni.onchange = async () => {
            if (inputFechaIni.value) {
                await refrescarProfesoresPrealta(tipoSuscGrupal, '', selectProfe.value);
            } else {
                selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
            }
            autoCompletarNombreGrupoPrealta();
            actualizarVisibilidadCamposPrealta(tipoSuscGrupal);
            renderizarAdvertenciasMatchPrealta(alumnosList, inputFechaIni.value, obtenerDuracionPrealtaMinutos(), cfg);
            verificarPrealtaEnCalendar(alumnosList, cfg);
        };
        inputFechaIni.oninput = inputFechaIni.onchange;
    }
    if (selectProfe) {
        selectProfe.onchange = () => {
            autoCompletarNombreGrupoPrealta();
            actualizarVisibilidadCamposPrealta(tipoSuscGrupal);
            renderizarAdvertenciasMatchPrealta(alumnosList, inputFechaIni?.value || '', obtenerDuracionPrealtaMinutos(), cfg);
            verificarPrealtaEnCalendar(alumnosList, cfg);
        };
    }
    document.querySelectorAll('input[name="prealta-tipo-ensamble"]').forEach(radio => {
        radio.onchange = async () => {
            if (inputFechaIni && inputFechaIni.value) {
                await refrescarProfesoresPrealta(tipoSuscGrupal, '', selectProfe.value);
            }
            autoCompletarNombreGrupoPrealta();
            actualizarVisibilidadCamposPrealta(tipoSuscGrupal);
            renderizarAdvertenciasMatchPrealta(alumnosList, inputFechaIni?.value || '', obtenerDuracionPrealtaMinutos(), cfg);
            verificarPrealtaEnCalendar(alumnosList, cfg);
        };
    });

    const banner = document.getElementById('prealta-info-banner');
    if (primerAl.horario_match && primerAl.horario_match !== primerAl.reserva_fecha_texto) {
        banner.style.display = 'block';
        banner.innerHTML = `👥 <strong>Grupo:</strong> ${grupoNom || primerAl.grupo_asignado || '-'} • 🎯 <strong>Horario Match:</strong> ${primerAl.horario_match} • 👨‍🏫 <strong>Profesor Asignado:</strong> ${primerAl.reserva_profe_nombre || primerAl.profesor_asignado || '-'}`;
    } else {
        banner.style.display = 'block';
        banner.innerHTML = `👥 <strong>Grupo:</strong> ${grupoNom || primerAl.grupo_asignado || '-'} • ℹ️ <strong>Pre-Alta Grupal desde Lista de Espera (${alumnosList.length} alumnos)</strong>`;
    }

    const fValActual = document.getElementById('prealta-fecha-inicio')?.value;
    if (fValActual && selectProfe?.value) {
        verificarPrealtaEnCalendar(alumnosList, cfg);
    }

    document.getElementById('modal-iniciar-prealta')?.showModal();
}

// -----------------------------------------------------------------------
// Guardar Pre-Alta / Modificar Alta (Procesa 1 o N alumnos)
// -----------------------------------------------------------------------
export async function guardarPreAlta(btnTargetOrOptions, maybeCallbacks = {}) {
    let btnTarget = btnTargetOrOptions;
    let callbacks = maybeCallbacks;
    if (btnTargetOrOptions && !btnTargetOrOptions.tagName && typeof btnTargetOrOptions === 'object') {
        callbacks = btnTargetOrOptions;
        btnTarget = document.getElementById('btn-guardar-prealta');
    }
    const { setBotonCargando, cargarVista, generarTextoConHistorial, estadoActualVista } = callbacks;
    const mostrarLoader = window.mostrarIndicadorCarga || ((txt) => {});
    const ocultarLoader = window.ocultarIndicadorCarga || (() => {});

    const idsRaw = document.getElementById('prealta-alumno-id').value;
    const ids = idsRaw.split(',').filter(Boolean);
    const fIni = document.getElementById('prealta-fecha-inicio').value;
    const grp = document.getElementById('prealta-grupo').value.trim();
    const selProfe = document.getElementById('prealta-profe-select');
    const profeId = selProfe ? selProfe.value : '';
    const profeNombre = (selProfe && selProfe.selectedOptions[0]) ? (selProfe.selectedOptions[0].dataset.nombre || selProfe.selectedOptions[0].textContent.split('(')[0].trim()) : '';
    const profeCalId = (selProfe && selProfe.selectedOptions[0]) ? (selProfe.selectedOptions[0].dataset.calId || '') : '';

    if (ids.length === 0) return alert("Error: no hay alumno seleccionado.");
    if (!fIni) return alert("Por favor ingresa la fecha y hora de inicio.");

    const alumnosList = [];
    for (let id of ids) {
        const dSnap = await getDoc(doc(db, "alumnos", id));
        if (dSnap.exists()) alumnosList.push({ id: dSnap.id, ...dSnap.data() });
    }
    if (alumnosList.length === 0) return alert("No se encontraron los datos de los alumnos.");

    const primerAl = alumnosList[0];
    const tipoSusc = detectarTipoSuscripcion(primerAl.tipo_suscripcion || '');
    const esIndividual = tipoSusc === 'individual';

    if (esIndividual && !profeId && !primerAl.reserva_profe_id) {
        return alert("Por favor selecciona un profesor para la clase individual.");
    }
    if (!esIndividual && !grp) {
        return alert("Por favor ingresa el nombre del grupo.");
    }

    const durMin = obtenerDuracionPrealtaMinutos();

    // Validar si hay discrepancias de disponibilidad, edad o nivel
    const matchWarns = validarRequisitosMatchAlumnos(alumnosList, fIni, durMin, defaultCfg);
    if (matchWarns.length > 0) {
        const textoWarns = matchWarns.map(w => `• ${w}`).join('\n');
        const continuarConWarns = await window.confirmar(
            'Advertencias de Validación de Horario / Requisitos',
            `Se detectaron las siguientes discrepancias en el horario:\n\n${textoWarns}\n\n¿Deseas continuar y avanzar con la pre-alta de todas formas?`,
            'Forzar y Continuar',
            '⚠️',
            'Volver y Corregir'
        );
        if (!continuarConWarns) {
            if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
            return;
        }
    }

    mostrarLoader('Guardando cambios y sincronizando calendario...');
    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, true, 'Guardando...');

    const dateObj = new Date(fIni);
    if (isNaN(dateObj.getTime())) {
        ocultarLoader();
        if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
        return alert("Fecha y hora inválidas.");
    }

    const diasCodigos = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const diaCodigo = diasCodigos[dateObj.getDay()];
    const horaInicioStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
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
            ocultarLoader();
            const confirmarForzar = await window.confirmar('Disponibilidad no coincide', 'El alumno no tiene disponibilidad para el horario seleccionado. ¿Guardar de todas formas?', 'Forzar y Guardar');
            if (!confirmarForzar) {
                if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
                return;
            }
            mostrarLoader('Guardando cambios y sincronizando calendario...');
        }
    }

    // Validar disponibilidad del profesor seleccionado
    if (profeId && selProfe && selProfe.selectedOptions[0] && selProfe.selectedOptions[0].dataset.disponibilidad) {
        try {
            const dispProfe = JSON.parse(selProfe.selectedOptions[0].dataset.disponibilidad);
            if (dispProfe && dispProfe[diaCodigo]) {
                const rangosProfe = dispProfe[diaCodigo];
                const cubreProfe = rangosProfe.some(r => {
                    const rIni = convertirHoraAMinutos(r.inicio || '09:00');
                    const rFin = convertirHoraAMinutos(r.fin || '22:00');
                    const slIni = dateObj.getHours() * 60 + dateObj.getMinutes();
                    return slIni >= rIni && (slIni + durMin) <= rFin;
                });
                if (rangosProfe.length > 0 && !cubreProfe) {
                    ocultarLoader();
                    const confirmarForzarProfe = await window.confirmar('Horario fuera de rango del profesor', `El profesor ${profeNombre} no tiene disponibilidad configurada para ese día/horario. ¿Deseas continuar igualmente?`, 'Forzar y Asignar');
                    if (!confirmarForzarProfe) {
                        if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
                        return;
                    }
                    mostrarLoader('Guardando cambios y sincronizando calendario...');
                }
            }
        } catch(e) {}
    }

    // Validar conflicto estricto en Google Calendar (Aulas libres, Baterías libres y Profesor libre)
    const tieneBateria = alumnosList.some(al => {
        const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento || ''];
        return insts.some(i => (i || '').toLowerCase().includes('bat')) || (al.instrumento_asignado || '').toLowerCase().includes('bat');
    }) || (document.getElementById('prealta-instrumento-select')?.value || '').toLowerCase().includes('bat');

    try {
        const valCal = await validarConflictoCalendarEnVivo({
            inicioISO: dateObj.toISOString(),
            finISO: new Date(dateObj.getTime() + durMin * 60000).toISOString(),
            profeId: profeId,
            profeNombre: profeNombre,
            profeCalId: profeCalId,
            esBateria: tieneBateria,
            configApp: callbacks.configApp || defaultCfg
        });

        if (!valCal.valido) {
            ocultarLoader();
            const forzarConflicto = await window.confirmar(
                '⚠️ Conflicto detectado en Google Calendar',
                `Se detectó un problema en el horario seleccionado:\n\n• ${valCal.motivo}\n\n¿Deseas forzar la asignación de todas formas?`,
                'Forzar Asignación'
            );
            if (!forzarConflicto) {
                if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
                return;
            }
            mostrarLoader('Guardando cambios y sincronizando calendario...');
        }
    } catch(errVal) {
        console.warn("Error al validar conflicto en Google Calendar:", errVal);
    }

    const fInicioTexto = `${mapaDiasCodigos[diaCodigo] || diaCodigo} ${dateObj.getDate()}/${dateObj.getMonth()+1} ${horaInicioStr} hs`;
    const docNom = profeNombre || primerAl.reserva_profe_nombre || 'Docente';
    const confAgenda = await window.confirmar(
        `📅 Sincronizar agenda en Google Calendar`,
        `Se creará o actualizará la clase en Google Calendar:\n\n• Alumnos: ${ids.length > 1 ? ids.length + ' alumnos' : (primerAl.nombre || 'Alumno')}\n• Modalidad: ${esIndividual ? 'Clase Individual' : (grp || 'Ensamble')}\n• Inicio: ${fInicioTexto}\n• Docente: ${docNom}\n\n¿Confirmás sincronizar en Google Calendar y guardar?`,
        '📅 Sincronizar y Guardar'
    );
    if (!confAgenda) {
        ocultarLoader();
        if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
        return;
    }

    mostrarLoader('Guardando cambios y sincronizando calendario...');

    const fIso = dateObj.toISOString();
    const dateObjEnd = new Date(dateObj.getTime() + durMin * 60000);
    const fIsoEnd = dateObjEnd.toISOString();

    let alumnosDelGrupo = [];
    if (!esIndividual && grp) {
        try {
            const grpSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", grp)));
            grpSnap.forEach(d => {
                const data = d.data();
                if (!['Alta Finalizada', 'Alta Suspendida', 'Agenda suspendida', 'Inactivo'].includes(data.estado_agenda)) {
                    alumnosDelGrupo.push({ id: d.id, ...data });
                }
            });
        } catch(e) {}

        // Alerta interactiva si el grupo ya cuenta con cupo completo (>= 4 integrantes)
        if (window.confirmar) {
            const existentesPreviamente = alumnosDelGrupo.filter(a => !ids.includes(a.id));
            const totalIntegrantes = existentesPreviamente.length + ids.length;
            if (existentesPreviamente.length >= 4) {
                const okSobrecupo = await window.confirmar(
                    '⚠️ Cupo de Grupo Superado',
                    `El grupo "${grp}" ya cuenta con ${existentesPreviamente.length} alumnos activos. Al sumar ${ids.length > 1 ? ids.length + ' nuevos alumnos' : 'este alumno'} alcanzará un total de ${totalIntegrantes} integrantes.\n\n¿Deseas sobreasignar una vacante adicional para este grupo?`,
                    'Continuar y Asignar Vacante',
                    '⚠️',
                    'Cancelar'
                );
                if (!okSobrecupo) {
                    ocultarLoader();
                    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
                    return;
                }
            }
        }
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

        const esAltaPrevia = ['Alta Efectiva', 'Alta Ilegal', 'Alta Finalizada'].includes(al.estado_agenda);
        const estadoFinal = esAltaPrevia ? al.estado_agenda : "Pre-alta Iniciada";

        if (!evSincronizado || esIndividual) {
            if (esAltaPrevia) {
                // Si el alta ya está confirmada, no debe llevar signo de pregunta ❓
                evSincronizado = await sincronizarEventoAltaConfirmadaCalendar(alParaSync, esIndividual, alumnosDelGrupo);
            } else {
                // Pre-alta iniciada lleva el emoji ❓
                evSincronizado = await sincronizarEventoPrealtaCalendar(alParaSync, esIndividual, fIso, fIsoEnd, alumnosDelGrupo);
            }
        }

        let tipoEnsVal = al.tipo_suscripcion || 'Ensamble';
        if (!esIndividual) {
            const tipoEnsRadio = document.querySelector('input[name="prealta-tipo-ensamble"]:checked');
            if (tipoEnsRadio) tipoEnsVal = tipoEnsRadio.value;
        }

        const updates = {
            estado_agenda: estadoFinal,
            fecha_inicio_clases: fIso,
            grupo_asignado: finalGrupo,
            instrumento_asignado: instFinal,
            reserva_profe_id: finalProfeId,
            reserva_profe_nombre: finalProfeNombre,
            profesor_asignado: finalProfeNombre,
            dia_match: diaCodigo,
            horario_inicio_match: horaInicioStr,
            horario_fin_match: horaFinStr,
            horario_match: `${mapaDiasCodigos[diaCodigo] || diaCodigo} ${horaInicioStr} a ${horaFinStr} hs`
        };

        if (!esIndividual) {
            updates.tipo_suscripcion = tipoEnsVal;
            updates.tipo_ensamble = tipoEnsVal;
            updates.modalidad_ensamble = tipoEnsVal;
        }

        if (evSincronizado) {
            updates.id_evento_alta = evSincronizado.id;
            updates.calendario_evento_alta = evSincronizado.calendar;
        }

        if (!al.fecha_prealta) updates.fecha_prealta = new Date().toISOString();
        if (!al.checklist_alta && !esAltaPrevia) updates.checklist_alta = [false, false, false, false, false];
        
        const hist = al.historial || [];
        const fnHist = window.crearEntradaHistorial || ((txt, tipo) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: tipo || 'sistema' }));
        const accionDesc = esAltaPrevia 
            ? `Datos de cursada actualizados: ${updates.horario_match} con Profe ${finalProfeNombre || '-'}.`
            : `Pre-Alta iniciada para "${finalGrupo}" con Profe ${finalProfeNombre || '-'} (Inicio: ${updates.horario_match}). Evento sincronizado en Calendar.`;
        hist.push(fnHist(accionDesc, 'alta'));
        updates.historial = hist;

        await updateDoc(doc(db, "alumnos", id), updates);

        if (typeof generarTextoConHistorial === 'function') {
            const dataText = await generarTextoConHistorial(id, esAltaPrevia ? 'texto_alta_confirmada' : 'texto_prealta', updates.horario_match, finalProfeId, finalProfeNombre);
            textosCopiados.push(`--- ${al.nombre} ---\n${dataText.txt}`);
        }
    }

    if (textosCopiados.length > 0) {
        try {
            await navigator.clipboard.writeText(textosCopiados.join('\n\n'));
        } catch(clipErr) {}
    }
    
    document.getElementById('modal-iniciar-prealta')?.close();

    // Recargar vista reactivamente con los datos actualizados
    const vistaDestino = estadoActualVista || window.estadoActualVista || 'Altas - En Curso';
    if (typeof cargarVista === 'function') {
        await cargarVista(vistaDestino);
    } else if (typeof window.cargarVistaGlobal === 'function') {
        await window.cargarVistaGlobal(vistaDestino);
    }

    ocultarLoader();
    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
    alert(`✅ Datos guardados exitosamente para ${ids.length} alumno(s).\nEvento sincronizado en Google Calendar y texto copiado.`);
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

export function formatearDetalleAltaInicio(al) {
    if (al.fecha_inicio_clases) {
        let d;
        // Soporte para Firestore Timestamp y strings ISO
        if (typeof al.fecha_inicio_clases.toDate === 'function') {
            d = al.fecha_inicio_clases.toDate();
        } else {
            d = new Date(al.fecha_inicio_clases);
        }
        if (!isNaN(d.getTime())) {
            const dia = d.getDate().toString().padStart(2, '0');
            const mes = (d.getMonth() + 1).toString().padStart(2, '0');
            return `ALTA: Inicio ${dia}/${mes}`;
        }
    }
    if (al.dia_match) {
        return `ALTA: Inicio ${al.dia_match}`;
    }
    return 'ALTA: Inicio a confirmar';
}

function resolverPrecioSuscripcion(al) {
    // 1. Precio guardado directamente en el alumno
    const precioGuardado = al.precio_suscripcion || al.valor_arancel || al.arancel || '';
    if (precioGuardado && String(precioGuardado).replace(/[^\d]/g, '').length > 0) {
        return formatearPrecioMoneda(precioGuardado);
    }
    // 2. Resolver desde window.configApp según tipo_suscripcion
    const cfg = window.configApp || {};
    const tipo = (al.tipo_suscripcion || '').toLowerCase();
    const esComunidad = !!(al.es_comunidad || al.comunidad);
    let valor = '';
    if (tipo.includes('individual') || tipo.includes('clase')) {
        if (tipo.includes('suelta') || tipo.includes('puntual')) {
            valor = cfg.arancel_individual_suelta;
        } else if (tipo.includes('quincenal')) {
            valor = cfg.arancel_individual_quincenal;
        } else {
            valor = esComunidad
                ? (cfg.arancel_individual_fullpack_comunidad || cfg.arancel_individual_fullpack)
                : cfg.arancel_individual_fullpack;
        }
    } else if (tipo.includes('ensamble') || tipo.includes('grupo')) {
        valor = esComunidad
            ? cfg.arancel_ensamble_comunidad
            : (cfg.arancel_ensamble_regular || cfg.arancel_ensamble_actual);
    }
    return valor ? formatearPrecioMoneda(valor) : '';
}

export function generarFilaExcelBD(al) {
    const instFinal = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || ''));
    const fechaAlta = formatearFechaAltaParaExcel(al);
    const fechaInicio = formatearFechaInicioParaExcel(al);

    const cols = [
        al.nombre || '',          // 1
        al.reserva_profe_nombre || al.profesor_asignado || '', // 2
        '',                       // 3 vacío
        al.grupo_asignado || 'Individual', // 4
        al.nivel || '',           // 5
        instFinal,                // 6
        al.tipo_suscripcion || '', // 7
        '',                       // 8 vacío
        'Alta',                   // 9
        '',                       // 10 vacío
        '',                       // 11 vacío
        '',                       // 12 vacío
        '',                       // 13 vacío
        fechaAlta,                // 14 fecha de alta
        '',                       // 15 vacío (NUEVO)
        fechaInicio               // 16 fecha y horario de inicio
    ];
    return cols.join('\t');
}

export function generarFilaExcelFacturacion(al) {
    const precio = resolverPrecioSuscripcion(al);
    const detalleAlta = formatearDetalleAltaInicio(al);

    const cols = [
        al.nombre || '',          // 1
        al.reserva_profe_nombre || al.profesor_asignado || '', // 2
        al.grupo_asignado || 'Individual', // 3
        precio,                   // 4 cuota esperada
        precio,                   // 5 valor de pago
        '',                       // 6 vacío
        '',                       // 7 vacío
        '',                       // 8 vacío (NUEVO)
        detalleAlta               // 9 ALTA: Inicio DD/MM
    ];
    return cols.join('\t');
}

export async function copiarFilaExcelBD(id) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const txt = generarFilaExcelBD(alDoc.data());
        await navigator.clipboard.writeText(txt);
        (window.mostrarToast || alert)("📋 Fila para BD copiada al portapapeles", "success");
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
        (window.mostrarToast || alert)("💰 Fila para Facturación copiada al portapapeles", "success");
    } catch(err) {
        alert("Error al copiar fila para Facturación: " + err.message);
    }
}

export function generarFilaExcelFacturacionAdmision(al, cfg = defaultCfg) {
    const evaluador = (al.reserva_profe_nombre || al.profesor_asignado || '').trim();
    const monto = al.valor_clase_admision || al.valor_arancel || cfg?.valor_clase || '15000';
    
    let fechaStr = '';
    if (al.reserva_fecha_inicio) {
        const d = new Date(al.reserva_fecha_inicio);
        if (!isNaN(d.getTime())) {
            const dia = String(d.getDate()).padStart(2, '0');
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const anio = String(d.getFullYear()).slice(-2);
            fechaStr = `${dia}/${mes}/${anio}`;
        }
    }
    if (!fechaStr && al.reserva_fecha_texto) {
        const m = al.reserva_fecha_texto.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
        if (m) {
            const dia = m[1].padStart(2, '0');
            const mes = m[2].padStart(2, '0');
            let anio = m[3] ? (m[3].length === 4 ? m[3].slice(-2) : m[3]) : String(new Date().getFullYear()).slice(-2);
            fechaStr = `${dia}/${mes}/${anio}`;
        }
    }
    if (!fechaStr) {
        const hoy = new Date();
        fechaStr = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${String(hoy.getFullYear()).slice(-2)}`;
    }

    const cols = [
        al.nombre || '', // 1. Alumno
        evaluador,       // 2. Evaluador
        '',              // 3. vacío
        '',              // 4. vacío
        '',              // 5. vacío
        '',              // 6. vacío
        '',              // 7. vacío
        monto,           // 8. monto del pago
        '',              // 9. vacío
        '',              // 10. vacío
        '',              // 11. vacío
        '',              // 12. vacío
        fechaStr         // 13. fecha de entrevista/agenda (dd/mm/aa)
    ];
    return cols.join('\t');
}

export async function copiarFilaExcelFacturacionAdmision(id, cfg = defaultCfg) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const txt = generarFilaExcelFacturacionAdmision(alDoc.data(), cfg);
        await navigator.clipboard.writeText(txt);
        (window.mostrarToast || alert)("💰 Registro de Facturación copiado al portapapeles", "success");
    } catch(err) {
        alert("Error al copiar facturación de admisión: " + err.message);
    }
}

export async function copiarSeleccionExcelBD() {
    const ids = window.selectedBulkIds || [];
    if (ids.length === 0) return alert("Seleccioná al menos un alumno para copiar.");
    try {
        const lineas = [];
        for (const id of ids) {
            const docSnap = await getDoc(doc(db, "alumnos", id));
            if (docSnap.exists()) {
                lineas.push(generarFilaExcelBD(docSnap.data()));
            }
        }
        if (lineas.length === 0) return alert("No se encontraron datos de los alumnos seleccionados.");
        const txt = lineas.join('\n');
        await navigator.clipboard.writeText(txt);
        (window.mostrarToast || alert)(`📋 ${lineas.length} registro(s) para BD copiados al portapapeles`, "success");
    } catch(err) {
        alert("Error al copiar registros para BD: " + err.message);
    }
}

export async function copiarSeleccionExcelFacturacion() {
    const ids = window.selectedBulkIds || [];
    if (ids.length === 0) return alert("Seleccioná al menos un alumno para copiar.");
    try {
        const lineas = [];
        for (const id of ids) {
            const docSnap = await getDoc(doc(db, "alumnos", id));
            if (docSnap.exists()) {
                lineas.push(generarFilaExcelFacturacion(docSnap.data()));
            }
        }
        if (lineas.length === 0) return alert("No se encontraron datos de los alumnos seleccionados.");
        const txt = lineas.join('\n');
        await navigator.clipboard.writeText(txt);
        (window.mostrarToast || alert)(`💰 ${lineas.length} registro(s) de Facturación copiados al portapapeles`, "success");
    } catch(err) {
        alert("Error al copiar registros de Facturación: " + err.message);
    }
}

export function formatearPrecioMoneda(val) {
    if (!val && val !== 0) return '';
    const str = String(val).trim();
    const nums = str.replace(/[^\d]/g, '');
    if (!nums) return str;
    const n = parseInt(nums, 10);
    if (isNaN(n)) return str;
    return `$${n.toLocaleString('es-AR')}`;
}

// -----------------------------------------------------------------------
// Abrir Modal de Aviso de Pre-Alta para Alumno (con selector de arancel)
// -----------------------------------------------------------------------
export async function abrirModalAvisoPrealtaAlumno(id, cfg = defaultCfg) {
    const alDoc = await getDoc(doc(db, "alumnos", id));
    if (!alDoc.exists()) return alert("Alumno no encontrado.");
    const al = alDoc.data();

    const infoBox = document.getElementById('aviso-prealta-info-box');
    const opcContainer = document.getElementById('aviso-arancel-opciones-container');
    const chkComunidad = document.getElementById('chk-aviso-comunidad');
    const inputMonto = document.getElementById('aviso-arancel-monto-final');
    const txtPreview = document.getElementById('aviso-prealta-textarea-preview');
    const idInput = document.getElementById('aviso-alumno-id');

    if (!infoBox || !opcContainer || !inputMonto || !txtPreview) return;

    idInput.value = id;

    // Obtener alias del profesor si existe
    let aliasProfe = '';
    const profeId = al.reserva_profe_id || al.profesor_id;
    if (profeId) {
        try {
            const pDoc = await getDoc(doc(db, "profesores", profeId));
            if (pDoc.exists()) aliasProfe = pDoc.data().alias_transferencia || '';
        } catch(e) {}
    }

    const tipoSusc = detectarTipoSuscripcion(al.tipo_suscripcion || '');
    const esIndividual = tipoSusc === 'individual';
    const nombreAlumno = al.nombre || 'Alumno';
    const nombreProfe = al.reserva_profe_nombre || al.profesor_asignado || '-';
    
    // Formatear cursada solo día y hora de inicio
    let horarioCursada = '';
    if (al.dia_match && al.horario_inicio_match) {
        const mapaDias = { 'L': 'Lunes', 'M': 'Martes', 'X': 'Miércoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sábado', 'D': 'Domingo' };
        const diaTxt = mapaDias[al.dia_match] || al.dia_match;
        horarioCursada = `${diaTxt} ${al.horario_inicio_match} hs`;
    } else if (al.horario_match) {
        let txt = al.horario_match.replace(/\s+a\s+\d{1,2}:\d{2}(\s*hs)?/i, ' hs').replace(/\s+hs\s+hs/i, ' hs').trim();
        if (!txt.endsWith('hs') && !txt.endsWith('hs.')) txt += ' hs';
        horarioCursada = txt;
    } else if (al.fecha_inicio_clases) {
        const d = new Date(al.fecha_inicio_clases);
        if (!isNaN(d.getTime())) {
            const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            horarioCursada = `${dias[d.getDay()]} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')} hs`;
        }
    } else {
        horarioCursada = al.reserva_fecha_texto || '-';
    }

    let fAmiInicio = '';
    if (al.fecha_inicio_clases) {
        const d = new Date(al.fecha_inicio_clases);
        if (!isNaN(d.getTime())) {
            const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            fAmiInicio = `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth()+1} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')} hs`;
        }
    }
    const fechaInicioEfectiva = fAmiInicio || horarioCursada;
    const instNom = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || ''));
    const suscripTexto = al.tipo_suscripcion ? `${al.tipo_suscripcion} (${instNom})` : (esIndividual ? `Clase Individual (${instNom})` : `Ensamble (${instNom})`);

    const grupoNomAl = al.grupo_asignado || (esIndividual ? 'Clase Individual' : '');
    const grupoHtml = grupoNomAl && !esIndividual ? ` • 👥 <strong>Grupo:</strong> ${grupoNomAl}` : '';

    infoBox.innerHTML = `
        <div style="font-weight:700; color:var(--text-main); font-size:13px; margin-bottom:4px;">
            👤 ${nombreAlumno} ${al.edad ? `<span style="font-weight:500; color:var(--text-muted);">(${al.edad} años)</span>` : ''}
        </div>
        <div style="font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:2px;">
            <div>🧩 <strong>Suscripción:</strong> ${suscripTexto}${grupoHtml}</div>
            <div>📅 <strong>Cursada:</strong> ${horarioCursada} • 🚀 <strong>Inicio:</strong> ${fechaInicioEfectiva}</div>
            <div>👨‍🏫 <strong>Docente:</strong> ${nombreProfe} • 💳 <strong>Alias:</strong> ${aliasProfe || '<em>Sin alias configurado</em>'}</div>
        </div>
    `;

    // Renderizar opciones de arancel
    const esMandalorianAl = (al.tipo_suscripcion || '').toLowerCase().includes('mandalorian') || al.tipo_ensamble === 'Ensamble Mandalorian';
    const chkComunidadLabel = document.getElementById('aviso-check-comunidad-label');

    if (esIndividual) {
        opcContainer.innerHTML = `
            <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; cursor:pointer; font-weight:600; text-transform:none; color:var(--text-main); margin:0;">
                <input type="radio" name="opt-arancel-modalidad" value="suelta" style="accent-color:var(--accent-teal);">
                Clase Suelta <span style="color:var(--accent-teal); margin-left:auto; font-weight:700;">${formatearPrecioMoneda(cfg.arancel_individual_suelta) || '$15.000'}</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; cursor:pointer; font-weight:600; text-transform:none; color:var(--text-main); margin:0;">
                <input type="radio" name="opt-arancel-modalidad" value="quincenal" style="accent-color:var(--accent-teal);">
                Quincenal <span style="color:var(--accent-teal); margin-left:auto; font-weight:700;">${formatearPrecioMoneda(cfg.arancel_individual_quincenal) || '$25.000'}</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; cursor:pointer; font-weight:600; text-transform:none; color:var(--text-main); margin:0;">
                <input type="radio" name="opt-arancel-modalidad" value="fullpack" checked style="accent-color:var(--accent-teal);">
                Full Pack (Mensual) <span id="label-monto-fullpack" style="color:var(--accent-teal); margin-left:auto; font-weight:700;">${formatearPrecioMoneda(cfg.arancel_individual_fullpack) || '$45.000'}</span>
            </label>
        `;
    } else {
        opcContainer.innerHTML = `
            <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; cursor:pointer; font-weight:600; text-transform:none; color:var(--text-main); margin:0;">
                <input type="radio" name="opt-arancel-modalidad" value="ensamble" ${!esMandalorianAl ? 'checked' : ''} style="accent-color:var(--accent-teal);">
                🎸 Ensamble <span id="label-monto-ensamble-regular" style="color:var(--accent-teal); margin-left:auto; font-weight:700;">${formatearPrecioMoneda(cfg.arancel_ensamble_regular) || '$28.000'}</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; cursor:pointer; font-weight:600; text-transform:none; color:var(--text-main); margin:0;">
                <input type="radio" name="opt-arancel-modalidad" value="ensamble_mandalorian" ${esMandalorianAl ? 'checked' : ''} style="accent-color:var(--accent-teal);">
                🎸 Ensamble Mandalorian <span id="label-monto-ensamble" style="color:var(--accent-teal); margin-left:auto; font-weight:700;">${formatearPrecioMoneda(cfg.arancel_ensamble_actual) || '$35.000'}</span>
            </label>
        `;
    }

    chkComunidad.checked = false;

    const renderizarTextoPreview = (monto, mod, esComunidad) => {
        let template = cfg.texto_prealta_alumno || "Hola {nombre}! Cómo estás? 👋\n\nTe cuento que ya tenemos todo listo para que te sumes a Mandala Ensambles! 🤟\n\n🧩 Suscripción: {suscripcion}\n\n👥 Grupo: {grupo}\n\n🧩 Día y horario de cursada: {horario_cursada}\n\n🧩 Fecha de inicio de clases: {fecha_inicio_clases}\n\n🧩 Profe: {profe}\n\n🧩 Arancel: {valor_arancel}\n\n🧩 Alias a transferir: {alias_profe}";

        const tieneInstrumentoEnTemplate = /\{instrumento\}/i.test(template);
        const emojiInst = getEmojiInstrumento(instNom, cfg);

        let suscripcionParaMsg = '';
        if (esIndividual) {
            suscripcionParaMsg = tieneInstrumentoEnTemplate ? 'Clase Individual' : `Clase Individual (${instNom || 'Instrumento'})`;
        } else if (mod === 'ensamble') {
            suscripcionParaMsg = tieneInstrumentoEnTemplate ? 'Ensamble' : `Ensamble (${instNom || 'Instrumento'})`;
        } else {
            suscripcionParaMsg = tieneInstrumentoEnTemplate ? 'Ensamble Mandalorian' : `Ensamble Mandalorian (${instNom || 'Instrumento'})`;
        }

        const variables = {
            nombre: nombreAlumno,
            edad: al.edad || '',
            instrumento: instNom || '',
            emojiinstrumento: emojiInst || '',
            suscripcion: suscripcionParaMsg,
            grupo: grupoNomAl,
            horario_cursada: horarioCursada,
            horario: horarioCursada,
            fecha_hora: horarioCursada,
            fecha_inicio_clases: fechaInicioEfectiva,
            'fecha inicio clases': fechaInicioEfectiva,
            profe: nombreProfe,
            valor_arancel: monto,
            arancel: monto,
            valor: monto,
            alias_profe: aliasProfe || '',
            alias: aliasProfe || ''
        };

        let resText = template;
        Object.keys(variables).forEach(k => {
            const regex = new RegExp(`\\{${k}\\}`, 'gi');
            resText = resText.replace(regex, variables[k]);
        });

        txtPreview.value = resText;
    };

    const actualizarMontoYPreview = () => {
        let montoCalculado = '';
        const esComunidad = chkComunidad.checked;
        const rad = document.querySelector('input[name="opt-arancel-modalidad"]:checked');
        const mod = rad ? rad.value : (esIndividual ? 'fullpack' : 'ensamble');

        if (esIndividual) {
            if (chkComunidadLabel) chkComunidadLabel.style.display = (mod === 'fullpack') ? 'flex' : 'none';
            if (mod === 'suelta') {
                montoCalculado = formatearPrecioMoneda(cfg.arancel_individual_suelta) || '$15.000';
            } else if (mod === 'quincenal') {
                montoCalculado = formatearPrecioMoneda(cfg.arancel_individual_quincenal) || '$25.000';
            } else {
                montoCalculado = esComunidad
                    ? (formatearPrecioMoneda(cfg.arancel_individual_fullpack_comunidad) || formatearPrecioMoneda(cfg.arancel_individual_fullpack) || '$40.000')
                    : (formatearPrecioMoneda(cfg.arancel_individual_fullpack) || '$45.000');
            }
        } else {
            if (mod === 'ensamble') {
                if (chkComunidadLabel) chkComunidadLabel.style.display = 'none';
                montoCalculado = formatearPrecioMoneda(cfg.arancel_ensamble_regular) || '$28.000';
            } else {
                if (chkComunidadLabel) chkComunidadLabel.style.display = 'flex';
                montoCalculado = esComunidad
                    ? (formatearPrecioMoneda(cfg.arancel_ensamble_comunidad) || formatearPrecioMoneda(cfg.arancel_ensamble_actual) || '$30.000')
                    : (formatearPrecioMoneda(cfg.arancel_ensamble_actual) || '$35.000');
            }
        }

        const labelMandalorian = document.getElementById('label-monto-ensamble');
        if (labelMandalorian) {
            labelMandalorian.textContent = esComunidad
                ? (formatearPrecioMoneda(cfg.arancel_ensamble_comunidad) || '$30.000')
                : (formatearPrecioMoneda(cfg.arancel_ensamble_actual) || '$35.000');
        }
        const labelFullpack = document.getElementById('label-monto-fullpack');
        if (labelFullpack) {
            labelFullpack.textContent = esComunidad
                ? (formatearPrecioMoneda(cfg.arancel_individual_fullpack_comunidad) || '$40.000')
                : (formatearPrecioMoneda(cfg.arancel_individual_fullpack) || '$45.000');
        }

        inputMonto.value = montoCalculado;
        renderizarTextoPreview(montoCalculado, mod, esComunidad);
    };

    // Eventos interactivos en el modal
    opcContainer.querySelectorAll('input[name="opt-arancel-modalidad"]').forEach(r => {
        r.addEventListener('change', actualizarMontoYPreview);
    });
    chkComunidad.onchange = actualizarMontoYPreview;
    inputMonto.oninput = () => {
        const rad = document.querySelector('input[name="opt-arancel-modalidad"]:checked');
        const mod = rad ? rad.value : (esIndividual ? 'fullpack' : 'ensamble');
        renderizarTextoPreview(inputMonto.value, mod, chkComunidad.checked);
    };

    actualizarMontoYPreview();
    document.getElementById('modal-aviso-prealta-alumno')?.showModal();
}

// -----------------------------------------------------------------------
// Copiar Mensaje de Pre-Alta para Alumno y Guardar en Historial
// -----------------------------------------------------------------------
export async function copiarAvisoPrealtaAlumno(id) {
    const txtPreview = document.getElementById('aviso-prealta-textarea-preview');
    const inputMonto = document.getElementById('aviso-arancel-monto-final');
    if (!txtPreview || !txtPreview.value) return;

    const textoFinal = txtPreview.value;
    const monto = inputMonto ? inputMonto.value : '';

    try {
        await navigator.clipboard.writeText(textoFinal);

        if (id) {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (alDoc.exists()) {
                const al = alDoc.data();
                const hist = al.historial || [];
                const fnHist = window.crearEntradaHistorial || ((txt, tipo) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: tipo || 'sistema' }));
                hist.push(fnHist(`Mensaje de Pre-Alta enviado al alumno por WhatsApp (Arancel: ${monto || al.valor_arancel || '-'}).`, 'alta'));
                await updateDoc(doc(db, "alumnos", id), { 
                    historial: hist,
                    valor_arancel: monto || al.valor_arancel || ''
                });
            }
        }

        document.getElementById('modal-aviso-prealta-alumno')?.close();
        (window.mostrarToast || alert)("💬 Mensaje de Pre-Alta para el alumno copiado al portapapeles", "success");
    } catch(err) {
        alert("❌ Error al copiar mensaje: " + err.message);
    }
}

// Window Global Bindings
window.generarFilaExcelBD = generarFilaExcelBD;
window.generarFilaExcelFacturacion = generarFilaExcelFacturacion;
window.copiarFilaExcelBD = copiarFilaExcelBD;
window.copiarFilaExcelFacturacion = copiarFilaExcelFacturacion;
window.copiarSeleccionExcelBD = copiarSeleccionExcelBD;
window.copiarSeleccionExcelFacturacion = copiarSeleccionExcelFacturacion;