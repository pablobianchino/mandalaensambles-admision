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
    formatearFechaAmi,
    reemplazarVariables,
    sincronizarEventoPrealtaCalendar, 
    sincronizarEventoAltaConfirmadaCalendar, 
    eliminarEventoAltaSeguro,
    validarConflictoCalendarEnVivo,
    obtenerEventosProfesoresParaSlot
} from "../services/calendar.service.js?v=6.9.2";
import { calcularProximaFechaDiaHora } from "./match.module.js";
import { parsearNomenclaturaGrupoOClase } from "./profesor.module.js";

const mapaDiasCodigos = { 'D': 'Domingo', 'L': 'Lunes', 'M': 'Martes', 'X': 'Miércoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sábado' };

function isoToDatetimeLocal(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr).substring(0, 16);
    return formatoLocalISO(d).substring(0, 16);
}

function convertirHoraAMinutos(horaStr, esFin = false) {
    if (!horaStr) return esFin ? 1440 : 0;
    const parts = horaStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1] || 0, 10);
    if (esFin && (h === 0 || h === 24) && m === 0) return 1440;
    return h * 60 + m;
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

    if (opt && opt.dataset.ocupado === '1' && opt.dataset.eventoSummary) {
        campoGrupo.value = opt.dataset.eventoSummary;
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
// -----------------------------------------------------------------------
// Refrescar profesores para pre-alta según tipo (Ensamble vs Grupal vs Individual)
// -----------------------------------------------------------------------
export async function refrescarProfesoresPrealta(tipoClase, instrumentoSeleccionado = '', profeSeleccionadoId = '', cfg = defaultCfg) {
    const selectProfe = document.getElementById('prealta-profe-select');
    if (!selectProfe) return;
    selectProfe.innerHTML = '<option value="">Consultando profesores y agendas...</option>';
    try {
        const pSnap = await getDocs(collection(db, "profesores"));
        const profesoresMap = new Map();
        pSnap.forEach(pDoc => {
            const data = pDoc.data();
            if (data.activo !== false && data.estado !== 'inactivo' && data.nombre) {
                const key = data.nombre.toLowerCase().trim();
                if (!profesoresMap.has(key)) {
                    profesoresMap.set(key, { id: pDoc.id, ...data });
                }
            }
        });
        const profesores = Array.from(profesoresMap.values());

        const esEnsamble = tipoClase === 'ensamble';
        const esGrupal = tipoClase === 'grupal';

        // Chequear disponibilidad teórica si hay fecha/hora seleccionada
        const fIniVal = document.getElementById('prealta-fecha-inicio')?.value;
        let diaCod = null;
        let slotIniMins = null;
        let slotFinMins = null;
        const durMin = obtenerDuracionPrealtaMinutos();
        let fIsoStart = null;
        let fIsoEnd = null;

        if (fIniVal) {
            const dObj = new Date(fIniVal);
            if (!isNaN(dObj.getTime())) {
                fIsoStart = dObj.toISOString();
                fIsoEnd = new Date(dObj.getTime() + durMin * 60000).toISOString();
                const diasMap = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
                diaCod = diasMap[dObj.getDay()];
                slotIniMins = dObj.getHours() * 60 + dObj.getMinutes();
                slotFinMins = slotIniMins + durMin;
            }
        }

        // Consultar eventos en vivo de Calendar para este slot
        let ocupadosMap = {};
        if (fIsoStart && fIsoEnd) {
            try {
                const resSlot = await obtenerEventosProfesoresParaSlot({ inicioISO: fIsoStart, finISO: fIsoEnd, configApp: cfg });
                ocupadosMap = resSlot.ocupadosMap || {};
            } catch(eCal) {
                console.warn("No se pudieron consultar eventos de Calendar para el slot:", eCal);
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

                const pNomKey = (pr.nombre || '').toLowerCase().trim();
                const infoOcupado = ocupadosMap[pNomKey] || null;

                aptos.push({ 
                    pr, 
                    etiqueta, 
                    cubreHorario,
                    ocupadoConEvento: infoOcupado ? infoOcupado.summary : null,
                    eventoId: infoOcupado ? infoOcupado.id : null
                });
            }
        });

        selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';

        if (diaCod && slotIniMins !== null) {
            // Dividir en disponibles (libres) vs con clase agendada (sumar a grupo)
            const libres = aptos.filter(a => a.cubreHorario && !a.ocupadoConEvento);
            const conClase = aptos.filter(a => a.ocupadoConEvento);

            libres.sort((a, b) => (a.pr.nombre || '').localeCompare(b.pr.nombre || ''));
            conClase.sort((a, b) => (a.pr.nombre || '').localeCompare(b.pr.nombre || ''));

            if (libres.length > 0) {
                const grpLibres = document.createElement('optgroup');
                grpLibres.label = '🟢 Profesores Disponibles (Libres)';
                libres.forEach(({ pr, etiqueta }) => {
                    const opt = document.createElement('option');
                    opt.value = pr.id;
                    opt.textContent = `${pr.nombre} (${etiqueta})`;
                    opt.dataset.nombre = pr.nombre;
                    opt.dataset.calId = pr.correo_calendario || '';
                    opt.dataset.ocupado = '0';
                    opt.dataset.disponibilidad = JSON.stringify(pr.disponibilidad || {});
                    if (pr.id === profeSeleccionadoId || (pr.nombre && pr.nombre === profeSeleccionadoId)) {
                        opt.selected = true;
                    }
                    grpLibres.appendChild(opt);
                });
                selectProfe.appendChild(grpLibres);
            }

            if (conClase.length > 0) {
                const grpOcupados = document.createElement('optgroup');
                grpOcupados.label = '🟡 Profesores con Clase Agendada (Sumar a Grupo)';
                conClase.forEach(({ pr, ocupadoConEvento, eventoId }) => {
                    const opt = document.createElement('option');
                    opt.value = pr.id;
                    opt.textContent = `${pr.nombre} (Clase: "${ocupadoConEvento}")`;
                    opt.dataset.nombre = pr.nombre;
                    opt.dataset.calId = pr.correo_calendario || '';
                    opt.dataset.ocupado = '1';
                    opt.dataset.eventoSummary = ocupadoConEvento;
                    opt.dataset.eventoId = eventoId || '';
                    opt.dataset.disponibilidad = JSON.stringify(pr.disponibilidad || {});
                    if (pr.id === profeSeleccionadoId || (pr.nombre && pr.nombre === profeSeleccionadoId)) {
                        opt.selected = true;
                    }
                    grpOcupados.appendChild(opt);
                });
                selectProfe.appendChild(grpOcupados);
            }
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
    const esSumaGrupoExistente = opt && opt.dataset.ocupado === '1';
    const eventoSummaryExistente = opt ? (opt.dataset.eventoSummary || '') : '';

    // Si el usuario seleccionó un profesor con clase agendada para sumarse a ese grupo:
    if (esSumaGrupoExistente) {
        alertaValidacion.style.display = 'block';
        alertaValidacion.style.background = '#eff6ff';
        alertaValidacion.style.color = '#1d4ed8';
        alertaValidacion.style.border = '1px solid #bfdbfe';
        alertaValidacion.innerHTML = `ℹ️ <strong>Sumándose a grupo existente:</strong> Se asociará la ficha a la clase en curso de ${profeNombre} ("${eventoSummaryExistente}"). No se creará un evento duplicado en Google Calendar.`;
        return;
    }

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
            permitirProfeOcupado: false,
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

function asegurarOpcionProfesor(selectEl, profeId, profeNombre = '') {
    if (!selectEl || !profeId) return;
    let opt = Array.from(selectEl.options).find(o => o.value === profeId);
    if (!opt) {
        opt = document.createElement('option');
        opt.value = profeId;
        opt.textContent = `${profeNombre || 'Docente'} (Solicitado)`;
        selectEl.appendChild(opt);
    }
    opt.selected = true;
    selectEl.value = profeId;
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
    const sol = (opts.esMatchSolicitud && opts.solicitud) ? opts.solicitud : null;
    const esMatchSolicitud = Boolean(sol);
    const esPropuesta = Boolean(opts.esPropuesta);

    document.getElementById('prealta-alumno-id').value = id;
    const hiddenProp = document.getElementById('prealta-es-propuesta');
    if (hiddenProp) hiddenProp.value = esPropuesta ? 'true' : 'false';

    const btnGuardarPrealta = document.getElementById('btn-guardar-prealta');
    if (btnGuardarPrealta) {
        if (esPropuesta) {
            btnGuardarPrealta.textContent = '🧩 Crear Propuesta en Validación';
            btnGuardarPrealta.style.background = 'var(--accent-teal, #007b8f)';
        } else if (esEdicionParam) {
            btnGuardarPrealta.textContent = '💾 Guardar Cambios';
            btnGuardarPrealta.style.background = '';
        } else {
            btnGuardarPrealta.textContent = '🚀 Iniciar Pre-Alta y Agendar';
            btnGuardarPrealta.style.background = '';
        }
    }
    
    const tipoSusc = detectarTipoSuscripcion(al.tipo_suscripcion || '');
    const esIndividual = tipoSusc === 'individual';
    const esAltaConfirmada = ['Alta Efectiva', 'Alta Ilegal', 'Alta Finalizada'].includes(al.estado_agenda);
    const esEdicion = esEdicionParam || al.estado_agenda === 'Pre-alta Iniciada' || al.estado_agenda === 'Pre-alta iniciada' || esAltaConfirmada;
    const vieneDeMatch = Boolean(al.horario_match && al.horario_match !== al.reserva_fecha_texto);

    let tituloTexto = esAltaConfirmada 
        ? `Modificar Alta — ${al.nombre || 'Alumno'}`
        : `${esEdicion ? 'Editar' : 'Iniciar'} Pre-Alta — ${al.nombre || 'Alumno'}`;
    if (esPropuesta) {
        tituloTexto = `🧩 Nueva Propuesta de Clase (${al.nombre || 'Alumno'})`;
    }
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
    const instActual = opts.instSugerido || al.instrumento_asignado || instsAlumno[0] || '';
    const profeActualId = profeSugerido || al.reserva_profe_id || al.profesor_id || '';

    let fVal = '';
    let grupoVal = '';
    if (esMatchSolicitud) {
        const durMin = sol.duracionMinutos || (sol.tipoGrupo === 'Ensamble Mandalorian' ? 90 : 60);
        const parsed = parsearNomenclaturaGrupoOClase(sol.grupoNombre, durMin);
        const diaCod = (parsed ? parsed.diaCod : sol.diaCod) || '';
        const horaIni = (parsed ? parsed.horaInicio : sol.horaInicio) || '18:00';
        if (diaCod && horaIni) {
            fVal = calcularProximaFechaDiaHora(diaCod, horaIni);
        }
        grupoVal = sol.grupoNombre || grupoPrev || '';
    } else if (esEdicion || esAltaConfirmada || !esPropuesta) {
        if (inicioPrev) fVal = isoToDatetimeLocal(inicioPrev);
        else if (al.fecha_inicio_clases) fVal = isoToDatetimeLocal(al.fecha_inicio_clases);
        else if (al.fecha_sugerida_inicio) fVal = isoToDatetimeLocal(al.fecha_sugerida_inicio);
        else if (al.dia_match && al.horario_inicio_match) fVal = calcularProximaFechaDiaHora(al.dia_match, al.horario_inicio_match);
        grupoVal = grupoPrev || al.grupo_asignado || '';
    }
    document.getElementById('prealta-fecha-inicio').value = fVal;
    document.getElementById('prealta-grupo').value = grupoVal;

    const campoPackInd = document.getElementById('prealta-campo-pack-individual');
    if (esIndividual) {
        if (campoInst) campoInst.style.display = 'block';
        if (campoPackInd) {
            // La modalidad / pack de clases SOLO se muestra en la acción de iniciar pre-alta.
            // Para armar la propuesta / grupo NO interesa el valor ni cuántas clases son.
            if (!esPropuesta) {
                campoPackInd.style.display = 'block';
                const tagSuelta = document.getElementById('prealta-arancel-suelta-tag');
                const tagQuincenal = document.getElementById('prealta-arancel-quincenal-tag');
                const tagFullpack = document.getElementById('prealta-arancel-fullpack-tag');
                if (tagSuelta) tagSuelta.textContent = formatearPrecioMoneda(configApp.arancel_individual_suelta) || '$15.000';
                if (tagQuincenal) tagQuincenal.textContent = formatearPrecioMoneda(configApp.arancel_individual_quincenal) || '$25.000';
                if (tagFullpack) tagFullpack.textContent = formatearPrecioMoneda(configApp.arancel_individual_fullpack) || '$45.000';

                const modExistente = al.modalidad_individual || (
                    (al.tipo_suscripcion || '').toLowerCase().includes('suelta') ? 'suelta' :
                    (al.tipo_suscripcion || '').toLowerCase().includes('quincenal') ? 'quincenal' : 'fullpack'
                );
                const radioSel = document.querySelector(`input[name="prealta-pack-individual"][value="${modExistente}"]`);
                if (radioSel) radioSel.checked = true;
                else {
                    const defaultRadio = document.querySelector('input[name="prealta-pack-individual"][value="fullpack"]');
                    if (defaultRadio) defaultRadio.checked = true;
                }
            } else {
                campoPackInd.style.display = 'none';
            }
        }
        if (wrapLista) wrapLista.style.display = 'none';
        if (campoGrupo) campoGrupo.style.display = 'none';
        const campoTipoEns = document.getElementById('prealta-campo-tipo-ensamble');
        if (campoTipoEns) campoTipoEns.style.display = 'none';

        if (selInstPrealta) {
            selInstPrealta.innerHTML = '';
            const instParaSeleccionar = opts.instSugerido || instActual;
            if (instsAlumno.length > 0) {
                instsAlumno.forEach(i => {
                    selInstPrealta.innerHTML += `<option value="${i}" ${i === instParaSeleccionar ? 'selected' : ''}>${i}</option>`;
                });
            } else {
                selInstPrealta.innerHTML = '<option value="">Sin instrumento especificado</option>';
            }
            if (instParaSeleccionar && !instsAlumno.includes(instParaSeleccionar)) {
                selInstPrealta.innerHTML += `<option value="${instParaSeleccionar}" selected>${instParaSeleccionar}</option>`;
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
            if (selectProfe && profeActualId) {
                asegurarOpcionProfesor(selectProfe, profeActualId, sol ? sol.profesorNombre : opts.profeNombreSugerido);
            }
        } else {
            selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
        }
        document.getElementById('prealta-grupo').value = 'Clase Individual';
    } else {
        if (campoInst) campoInst.style.display = 'none';
        if (campoPackInd) campoPackInd.style.display = 'none';
        
        // Modalidad Ensamble: visible únicamente si es realmente un ensamble y NO una clase grupal
        const campoTipoEns = document.getElementById('prealta-campo-tipo-ensamble');
        const esSolicitudEnsamble = sol && (sol.tipoGrupo === 'Ensamble' || sol.tipoGrupo === 'Ensamble Mandalorian');
        const esSolicitudGrupal = sol && (sol.tipoGrupo === 'Clase Grupal' || sol.tipoGrupo === 'Grupal');
        const nombreGrupoUpper = (grupoVal || grupoPrev || al.grupo_asignado || '').toUpperCase();
        const esGrupoGrupal = esSolicitudGrupal 
            || nombreGrupoUpper.includes('INICIAL') 
            || nombreGrupoUpper.includes('GRUPAL') 
            || nombreGrupoUpper.includes('TALLER')
            || (al.tipo_suscripcion || '').toLowerCase().includes('grupal');
        const esRealmenteEnsamble = !esIndividual && !esGrupoGrupal && (esSolicitudEnsamble || tipoSusc === 'ensamble');

        if (campoTipoEns) {
            campoTipoEns.style.display = esRealmenteEnsamble ? 'block' : 'none';
            if (esRealmenteEnsamble) {
                const esMandalorian = (sol && sol.tipoGrupo === 'Ensamble Mandalorian') 
                    || (al.tipo_suscripcion || '').toLowerCase().includes('mandalorian') 
                    || al.tipo_ensamble === 'Ensamble Mandalorian';
                const rMandalorian = document.querySelector('input[name="prealta-tipo-ensamble"][value="Ensamble Mandalorian"]');
                const rEnsamble = document.querySelector('input[name="prealta-tipo-ensamble"][value="Ensamble"]');
                if (esMandalorian && rMandalorian) rMandalorian.checked = true;
                else if (rEnsamble) rEnsamble.checked = true;
            }
        }

        const tipoSuscEfectivo = esGrupoGrupal ? 'grupal' : tipoSusc;

        if (opts.instSugerido) {
            al.instrumento_asignado = opts.instSugerido;
        }
        await renderListaInstrumentosAlumnos([{ id, ...al }], configApp);

        if (fVal) {
            await refrescarProfesoresPrealta(tipoSuscEfectivo, instActual, profeActualId);
            if (selectProfe && profeActualId) {
                asegurarOpcionProfesor(selectProfe, profeActualId, sol ? sol.profesorNombre : opts.profeNombreSugerido);
            }
            if (!esMatchSolicitud) {
                autoCompletarNombreGrupoPrealta();
            } else {
                document.getElementById('prealta-grupo').value = sol.grupoNombre || grupoVal;
            }
        } else {
            selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
        }
    }

    actualizarVisibilidadCamposPrealta(tipoSusc);

    // Vincular listeners para reactividad secuencial
    const inputFechaIni = document.getElementById('prealta-fecha-inicio');
    if (inputFechaIni) {
        inputFechaIni.onchange = async () => {
            const grpAct = (document.getElementById('prealta-grupo')?.value || '').toUpperCase();
            const esGrupalAct = (sol && (sol.tipoGrupo === 'Clase Grupal' || sol.tipoGrupo === 'Grupal'))
                || grpAct.includes('INICIAL')
                || grpAct.includes('GRUPAL')
                || grpAct.includes('TALLER')
                || (al.tipo_suscripcion || '').toLowerCase().includes('grupal');
            const tipoSuscDin = esGrupalAct ? 'grupal' : tipoSusc;

            if (inputFechaIni.value) {
                await refrescarProfesoresPrealta(tipoSuscDin, instActual, selectProfe.value);
                if (esMatchSolicitud && selectProfe && profeActualId) {
                    asegurarOpcionProfesor(selectProfe, profeActualId, sol ? sol.profesorNombre : opts.profeNombreSugerido);
                }
            } else {
                selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
            }
            if (!esMatchSolicitud) autoCompletarNombreGrupoPrealta();
            actualizarVisibilidadCamposPrealta(tipoSuscDin);
            if (!esMatchSolicitud) {
                renderizarAdvertenciasMatchPrealta([al], inputFechaIni.value, obtenerDuracionPrealtaMinutos(), configApp);
            }
            verificarPrealtaEnCalendar([al], configApp);
        };
        inputFechaIni.oninput = inputFechaIni.onchange;
    }

    const inputGrupo = document.getElementById('prealta-grupo');
    if (inputGrupo && !esIndividual) {
        inputGrupo.oninput = () => {
            const valGrp = inputGrupo.value.toUpperCase();
            const esGrupalDyn = (sol && (sol.tipoGrupo === 'Clase Grupal' || sol.tipoGrupo === 'Grupal'))
                || valGrp.includes('INICIAL') || valGrp.includes('GRUPAL') || valGrp.includes('TALLER');
            const campoEns = document.getElementById('prealta-campo-tipo-ensamble');
            if (campoEns) {
                campoEns.style.display = (!esGrupalDyn && (esSolicitudEnsamble || tipoSusc === 'ensamble')) ? 'block' : 'none';
            }
        };
    }
    if (selectProfe) {
        selectProfe.onchange = () => {
            if (!esMatchSolicitud) autoCompletarNombreGrupoPrealta();
            actualizarVisibilidadCamposPrealta(tipoSusc);
            if (!esMatchSolicitud) {
                renderizarAdvertenciasMatchPrealta([al], inputFechaIni?.value || '', obtenerDuracionPrealtaMinutos(), configApp);
            }
            verificarPrealtaEnCalendar([al], configApp);
        };
    }
    document.querySelectorAll('input[name="prealta-tipo-ensamble"]').forEach(radio => {
        radio.onchange = async () => {
            if (inputFechaIni && inputFechaIni.value) {
                await refrescarProfesoresPrealta(tipoSusc, instActual, selectProfe.value);
                if (esMatchSolicitud && selectProfe && profeActualId) {
                    asegurarOpcionProfesor(selectProfe, profeActualId, sol ? sol.profesorNombre : opts.profeNombreSugerido);
                }
            }
            if (!esMatchSolicitud) autoCompletarNombreGrupoPrealta();
            actualizarVisibilidadCamposPrealta(tipoSusc);
            verificarPrealtaEnCalendar([al], configApp);
        };
    });

    // Mostrar discrepancias si vienen del match por solicitud
    if (opts.discrepancias && opts.discrepancias.length > 0) {
        if (matchWarnList) {
            matchWarnList.innerHTML = opts.discrepancias.map(w => `<div style="margin-bottom:4px;">⚠️ ${w}</div>`).join('');
        }
        if (matchWarnCont) matchWarnCont.style.display = 'block';
    } else if (!esMatchSolicitud) {
        renderizarAdvertenciasMatchPrealta([al], inputFechaIni?.value || '', obtenerDuracionPrealtaMinutos(), configApp);
    }

    const banner = document.getElementById('prealta-info-banner');
    banner.style.display = 'block';
    if (esPropuesta) {
        banner.innerHTML = `🧩 <strong>Nueva Propuesta de Clase:</strong> Selecciona día, hora y profesor disponible para armar la propuesta en validación. No se agendará en Google Calendar hasta que se apruebe.`;
    } else if (esMatchSolicitud && sol) {
        banner.innerHTML = `🎯 <strong>Pre-Alta desde Solicitud Docente (${sol.grupoNombre}):</strong> Docente: <strong>${sol.profesorNombre}</strong> • Horario: <strong>${sol.horario}</strong> • Instrumento: <strong>${opts.instSugerido || sol.instrumento}</strong>`;
    } else if (esAltaConfirmada) {
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
export async function abrirModalPrealtaGrupal(ids, grupoNom = '', cfg = defaultCfg, esPropuesta = false) {
    if (!ids || ids.length === 0) return alert("No hay alumnos seleccionados.");

    const hiddenProp = document.getElementById('prealta-es-propuesta');
    if (hiddenProp) hiddenProp.value = esPropuesta ? 'true' : 'false';

    const btnGuardarPrealta = document.getElementById('btn-guardar-prealta');
    if (btnGuardarPrealta) {
        if (esPropuesta) {
            btnGuardarPrealta.textContent = '🧩 Crear Propuesta en Validación';
            btnGuardarPrealta.style.background = 'var(--accent-teal, #007b8f)';
        } else {
            btnGuardarPrealta.textContent = '🚀 Iniciar Pre-Alta y Agendar';
            btnGuardarPrealta.style.background = '';
        }
    }

    const alumnosList = [];
    for (let id of ids) {
        const dSnap = await getDoc(doc(db, "alumnos", id));
        if (dSnap.exists()) alumnosList.push({ id: dSnap.id, ...dSnap.data() });
    }
    if (alumnosList.length === 0) return alert("No se encontraron datos de los alumnos.");

    const primerAl = alumnosList[0];
    const profeActualId = primerAl.reserva_profe_id || primerAl.profesor_id || '';

    document.getElementById('prealta-alumno-id').value = ids.join(',');
    document.getElementById('titulo-prealta').textContent = esPropuesta
        ? (ids.length > 1 ? `🧩 Nueva Propuesta de Grupo (${ids.length} alumnos)` : `🧩 Nueva Propuesta de Clase`)
        : `Iniciar Pre-Alta Grupal (${ids.length} alumnos)`;
    
    const campoGrupo = document.getElementById('prealta-campo-grupo');
    const campoProfe = document.getElementById('prealta-campo-profe');
    const campoInst = document.getElementById('prealta-campo-instrumento');
    if (campoInst) campoInst.style.display = 'none';
    const campoPackInd = document.getElementById('prealta-campo-pack-individual');
    if (campoPackInd) campoPackInd.style.display = 'none';
    const campoTipoEns = document.getElementById('prealta-campo-tipo-ensamble');
    const esGrupoGrupalNom = (grupoNom || primerAl.grupo_asignado || '').toUpperCase().includes('INICIAL')
        || (grupoNom || primerAl.grupo_asignado || '').toUpperCase().includes('GRUPAL')
        || (grupoNom || primerAl.grupo_asignado || '').toUpperCase().includes('TALLER');
    const todosEnsambles = !esGrupoGrupalNom && alumnosList.every(a => detectarTipoSuscripcion(a.tipo_suscripcion || '') === 'ensamble');
    if (campoTipoEns) campoTipoEns.style.display = todosEnsambles ? 'block' : 'none';

    const tipoSuscGrupal = todosEnsambles ? 'ensamble' : 'grupal';

    let fValGrupal = '';
    let grupoValGrupal = grupoNom || primerAl.grupo_asignado || '';
    if (!esPropuesta) {
        if (primerAl.fecha_inicio_clases) fValGrupal = isoToDatetimeLocal(primerAl.fecha_inicio_clases);
        else if (primerAl.fecha_sugerida_inicio) fValGrupal = isoToDatetimeLocal(primerAl.fecha_sugerida_inicio);
        else if (primerAl.dia_match && primerAl.horario_inicio_match) fValGrupal = calcularProximaFechaDiaHora(primerAl.dia_match, primerAl.horario_inicio_match);
    }
    document.getElementById('prealta-fecha-inicio').value = fValGrupal;
    document.getElementById('prealta-grupo').value = grupoValGrupal;
    const selectProfe = document.getElementById('prealta-profe-select');
    if (selectProfe) {
        if (fValGrupal && profeActualId) {
            await refrescarProfesoresPrealta(tipoSuscGrupal, '', profeActualId, cfg);
            asegurarOpcionProfesor(selectProfe, profeActualId, primerAl.reserva_profe_nombre || primerAl.profesor_asignado || 'Docente');
        } else {
            selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
        }
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
    if (banner) {
        banner.style.display = 'block';
        if (esPropuesta) {
            banner.innerHTML = `💡 <strong>Propuesta para Validación:</strong> Al guardar, los alumnos pasarán a <strong>"Grupos y Alumnos en Validación"</strong> para que el coordinador confirme disponibilidad.<br><span style="color:#0f766e; font-weight:700;">🚫 NO se genera ningún evento en Google Calendar en esta instancia.</span>`;
        } else if (primerAl.horario_match && primerAl.horario_match !== primerAl.reserva_fecha_texto) {
            banner.innerHTML = `👥 <strong>Grupo:</strong> ${grupoNom || primerAl.grupo_asignado || '-'} • 🎯 <strong>Horario Match:</strong> ${primerAl.horario_match} • 👨‍🏫 <strong>Profesor Asignado:</strong> ${primerAl.reserva_profe_nombre || primerAl.profesor_asignado || '-'}`;
        } else {
            banner.innerHTML = `📅 <strong>Pre-Alta Oficial:</strong> Se sincronizará el evento recurrente en Google Calendar con estado ❓ y los alumnos avanzarán a "Altas en Curso".`;
        }
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
        btnTarget = callbacks.btnGuardar || document.getElementById('btn-guardar-prealta');
    }
    btnTarget = btnTarget || callbacks?.btnGuardar || document.getElementById('btn-guardar-prealta');
    const { setBotonCargando, cargarVista, generarTextoConHistorial, estadoActualVista } = callbacks || {};
    const mostrarLoader = window.mostrarIndicadorCarga || ((txt) => {});
    const ocultarLoader = window.ocultarIndicadorCarga || (() => {});

    try {
        const idsRaw = document.getElementById('prealta-alumno-id').value;
        const ids = idsRaw.split(',').filter(Boolean);
        const fIni = document.getElementById('prealta-fecha-inicio').value;
        const grp = document.getElementById('prealta-grupo').value.trim();
        const selProfe = document.getElementById('prealta-profe-select');
        const profeId = selProfe ? selProfe.value : '';
        const profeNombre = (selProfe && selProfe.selectedOptions[0]) ? (selProfe.selectedOptions[0].dataset.nombre || selProfe.selectedOptions[0].textContent.split('(')[0].trim()) : '';
        const profeCalId = (selProfe && selProfe.selectedOptions[0]) ? (selProfe.selectedOptions[0].dataset.calId || '') : '';

        if (ids.length === 0) {
            if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
            return alert("Error: no hay alumno seleccionado.");
        }
        if (!fIni) {
            if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
            return alert("Por favor ingresa la fecha y hora de inicio.");
        }

        const alumnosList = [];
        for (let id of ids) {
            const dSnap = await getDoc(doc(db, "alumnos", id));
            if (dSnap.exists()) alumnosList.push({ id: dSnap.id, ...dSnap.data() });
        }
        if (alumnosList.length === 0) {
            if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
            return alert("No se encontraron los datos de los alumnos.");
        }

        const primerAl = alumnosList[0];
        const tipoSusc = detectarTipoSuscripcion(primerAl.tipo_suscripcion || '');
        const esIndividual = tipoSusc === 'individual';

        if (esIndividual && !profeId && !primerAl.reserva_profe_id) {
            if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
            return alert("Por favor selecciona un profesor para la clase individual.");
        }
        if (!esIndividual && !grp) {
            if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
            return alert("Por favor ingresa el nombre del grupo.");
        }

        const durMin = obtenerDuracionPrealtaMinutos();

        // Validar si hay discrepancias de disponibilidad, edad o nivel
        let yaConfirmoDisponibilidad = false;
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
            yaConfirmoDisponibilidad = true;
        }

        // Asegurar que no quede ningún loader abierto de acciones previas
        if (typeof ocultarLoader === 'function') ocultarLoader();

        if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, true, 'Validando...');

        const dateObj = new Date(fIni);
        if (isNaN(dateObj.getTime())) {
            if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
            return alert("Fecha y hora inválidas.");
        }

        const diasCodigos = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
        const diaCodigo = diasCodigos[dateObj.getDay()];
        const horaInicioStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
        const horaFinMin = dateObj.getHours() * 60 + dateObj.getMinutes() + durMin;
        const horaFinStr = minutosAHora(horaFinMin);

        // Validar disponibilidad del alumno (si no fue confirmada ya arriba)
        if (!yaConfirmoDisponibilidad && primerAl.disponibilidad && primerAl.disponibilidad[diaCodigo]) {
            const rangosAl = primerAl.disponibilidad[diaCodigo];
            const cubreAl = rangosAl.some(r => {
                const rIni = convertirHoraAMinutos(r.inicio || '09:00');
                const rFin = convertirHoraAMinutos(r.fin || '22:00');
                const slIni = dateObj.getHours() * 60 + dateObj.getMinutes();
                return slIni >= rIni && (slIni + durMin) <= rFin;
            });
            if (rangosAl.length > 0 && !cubreAl) {
                const confirmarForzar = await window.confirmar('Disponibilidad no coincide', 'El alumno no tiene disponibilidad para el horario seleccionado. ¿Guardar de todas formas?', 'Forzar y Guardar');
                if (!confirmarForzar) {
                    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
                    return;
                }
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
                    const confirmarForzarProfe = await window.confirmar('Horario fuera de rango del profesor', `El profesor ${profeNombre} no tiene disponibilidad configurada para ese día/horario. ¿Deseas continuar igualmente?`, 'Forzar y Asignar');
                    if (!confirmarForzarProfe) {
                        if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
                        return;
                    }
                }
            }
        } catch(e) {}
    }

    const esPropuesta = document.getElementById('prealta-es-propuesta')?.value === 'true' || Boolean(callbacks?.esPropuesta);

    // Validar conflicto estricto en Google Calendar (Aulas libres, Baterías libres y Profesor libre)
    const tieneBateria = alumnosList.some(al => {
        const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento || ''];
        return insts.some(i => (i || '').toLowerCase().includes('bat')) || (al.instrumento_asignado || '').toLowerCase().includes('bat');
    }) || (document.getElementById('prealta-instrumento-select')?.value || '').toLowerCase().includes('bat');

    const optProfeSel = selProfe ? selProfe.selectedOptions[0] : null;
    const esSumaGrupoExistente = optProfeSel && optProfeSel.dataset.ocupado === '1';
    const eventoIdExistente = optProfeSel ? (optProfeSel.dataset.eventoId || null) : null;
    const eventoSummaryExistente = optProfeSel ? (optProfeSel.dataset.eventoSummary || '') : '';

    // Si NO es propuesta y NO es suma a grupo existente, verificamos conflicto live en Google Calendar
    if (!esPropuesta && !esSumaGrupoExistente) {
        if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, true, 'Verificando agenda...');
        try {
            const valCal = await validarConflictoCalendarEnVivo({
                inicioISO: dateObj.toISOString(),
                finISO: new Date(dateObj.getTime() + durMin * 60000).toISOString(),
                profeId: profeId,
                profeNombre: profeNombre,
                profeCalId: profeCalId,
                esBateria: tieneBateria,
                permitirProfeOcupado: false,
                configApp: callbacks.configApp || defaultCfg
            });

            if (!valCal.valido) {
                const forzarConflicto = await window.confirmar(
                    '⚠️ Conflicto detectado en Google Calendar',
                    `Se detectó un problema en el horario seleccionado:\n\n• ${valCal.motivo}\n\n¿Deseas forzar la asignación de todas formas?`,
                    'Forzar Asignación'
                );
                if (!forzarConflicto) {
                    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
                    return;
                }
            }
        } catch(errVal) {
            console.warn("Error al validar conflicto en Google Calendar:", errVal);
        }
    }

    const fInicioTexto = `${mapaDiasCodigos[diaCodigo] || diaCodigo} ${dateObj.getDate()}/${dateObj.getMonth()+1} ${horaInicioStr} hs`;
    const docNom = profeNombre || primerAl.reserva_profe_nombre || 'Docente';
    const textoModalidad = esSumaGrupoExistente 
        ? `Sumar a grupo existente: "${eventoSummaryExistente}" (se actualizará la clase en Google Calendar sin duplicar evento)`
        : (esIndividual ? 'Clase Individual' : (grp || 'Ensamble'));

    // Restaurar estado del botón antes de mostrar confirmación para que no diga "Guardando..." en el fondo
    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);

    if (!esPropuesta) {
        const confAgenda = await window.confirmar(
            `📅 Sincronizar agenda en Google Calendar`,
            `Se ${esSumaGrupoExistente ? 'actualizará la clase existente' : 'creará o actualizará la clase'} en Google Calendar:\n\n• Alumnos: ${ids.length > 1 ? ids.length + ' alumnos' : (primerAl.nombre || 'Alumno')}\n• Modalidad: ${textoModalidad}\n• Inicio: ${fInicioTexto}\n• Docente: ${docNom}\n\n¿Confirmás sincronizar en Google Calendar y guardar?`,
            '📅 Sincronizar y Guardar'
        );
        if (!confAgenda) {
            if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
            return;
        }
    }

    // Activar estado de guardado únicamente en el botón
    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, true, 'Guardando...');

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
        if (esSumaGrupoExistente && eventoIdExistente) {
            alParaSync.id_evento_alta = eventoIdExistente;
        }
        if (esSumaGrupoExistente && eventoSummaryExistente) {
            alParaSync.evento_summary_original = eventoSummaryExistente;
        }

        if (!esIndividual) {
            if (!alumnosDelGrupo.some(a => a.id === id)) {
                alumnosDelGrupo.push({ id, ...alParaSync });
            }
        }

        const esAltaPrevia = ['Alta Efectiva', 'Alta Ilegal', 'Alta Finalizada'].includes(al.estado_agenda);
        let estadoFinal = esAltaPrevia ? al.estado_agenda : "Pre-alta Iniciada";
        if (esPropuesta) {
            estadoFinal = "Validando Grupo";
        }

        let modInd = 'fullpack';
        let cantClasesInd = 4;
        let arancelInd = '';
        if (esIndividual) {
            const packRadio = document.querySelector('input[name="prealta-pack-individual"]:checked');
            if (packRadio) modInd = packRadio.value;
            const cfg = callbacks.configApp || defaultCfg;
            if (modInd === 'suelta') {
                cantClasesInd = 1;
                arancelInd = cfg.arancel_individual_suelta || '$15.000';
            } else if (modInd === 'quincenal') {
                cantClasesInd = 2;
                arancelInd = cfg.arancel_individual_quincenal || '$25.000';
            } else {
                cantClasesInd = 4;
                arancelInd = cfg.arancel_individual_fullpack || '$45.000';
            }
        }

        if (!esPropuesta) {
            let opcionesAlta = {};
            if (esIndividual) {
                if (modInd === 'suelta') {
                    opcionesAlta.esRecurrente = false;
                } else if (modInd === 'quincenal') {
                    if (window.confirmar) {
                        const soloUnaClase = await window.confirmar(
                            'Modalidad de Clase Quincenal en Google Calendar',
                            `La clase individual de "${al.nombre || 'Alumno'}" es Quincenal.\n\n¿Deseas generar el evento como RECURRENTE en Google Calendar o agendar solo la primera clase puntual para que el docente coordine las fechas siguientes?`,
                            '📅 Solo primera clase puntual',
                            '❓',
                            '🔄 Recurrente en Calendar'
                        );
                        opcionesAlta.esRecurrente = !soloUnaClase;
                    } else {
                        opcionesAlta.esRecurrente = false;
                    }
                } else {
                    opcionesAlta.esRecurrente = true;
                }
            }

            if (!evSincronizado || esIndividual) {
                if (esAltaPrevia) {
                    // Si el alta ya está confirmada, no debe llevar signo de pregunta ❓
                    evSincronizado = await sincronizarEventoAltaConfirmadaCalendar(alParaSync, esIndividual, alumnosDelGrupo, callbacks.configApp || defaultCfg, opcionesAlta);
                } else {
                    // Pre-alta iniciada lleva el emoji ❓
                    evSincronizado = await sincronizarEventoPrealtaCalendar(alParaSync, esIndividual, fIso, fIsoEnd, alumnosDelGrupo, callbacks.configApp || defaultCfg);
                }
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

        if (esPropuesta) {
            updates.estado_validacion_alumno = "pendiente";
        }

        const grpUpper = (grp || '').toUpperCase();
        const esGrupoGrupal = grpUpper.includes('INICIAL') 
            || grpUpper.includes('GRUPAL') 
            || grpUpper.includes('TALLER')
            || (al.tipo_suscripcion || '').toLowerCase().includes('grupal');

        if (esIndividual) {
            if (!esPropuesta) {
                updates.modalidad_individual = modInd;
                updates.cantidad_clases_individual = cantClasesInd;
                updates.valor_arancel = formatearPrecioMoneda(arancelInd);
                if (modInd === 'suelta') updates.tipo_suscripcion = 'Clase Individual Suelta';
                else if (modInd === 'quincenal') updates.tipo_suscripcion = 'Clase Individual Quincenal';
                else updates.tipo_suscripcion = 'Clase Individual Full Pack';
            } else {
                updates.tipo_suscripcion = al.tipo_suscripcion || 'Clase Individual';
            }
        } else if (esGrupoGrupal) {
            updates.tipo_suscripcion = 'Clase Grupal';
            updates.tipo_ensamble = '';
            updates.modalidad_ensamble = '';
            if (!esPropuesta) {
                const cfg = callbacks?.configApp || defaultCfg;
                updates.valor_arancel = al.valor_arancel || formatearPrecioMoneda(cfg.arancel_grupal_regular || '$25.000');
            }
        } else {
            updates.tipo_suscripcion = tipoEnsVal;
            updates.tipo_ensamble = tipoEnsVal;
            updates.modalidad_ensamble = tipoEnsVal;
        }

        if (evSincronizado) {
            updates.id_evento_alta = evSincronizado.id;
            updates.calendario_evento_alta = evSincronizado.calendar;
        }

        if (!al.fecha_prealta && !esPropuesta) updates.fecha_prealta = new Date().toISOString();
        if (!al.checklist_alta && !esAltaPrevia && !esPropuesta) updates.checklist_alta = [false, false, false, false];
        
        const hist = al.historial || [];
        const fnHist = window.crearEntradaHistorial || ((txt, tipo) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: tipo || 'sistema' }));
        let accionDesc = '';
        if (esPropuesta) {
            accionDesc = `Propuesta de grupo "${finalGrupo}" creada en validación (${updates.horario_match}) con Profe ${finalProfeNombre || '-'}.`;
        } else if (esAltaPrevia) {
            accionDesc = `Datos de cursada actualizados: ${updates.horario_match} con Profe ${finalProfeNombre || '-'}.`;
        } else {
            accionDesc = `Pre-Alta iniciada para "${finalGrupo}" con Profe ${finalProfeNombre || '-'} (Inicio: ${updates.horario_match}). Evento sincronizado en Calendar.`;
        }
        hist.push(fnHist(accionDesc, esPropuesta ? 'match' : 'alta'));
        updates.historial = hist;

        Object.assign(al, updates);
        await updateDoc(doc(db, "alumnos", id), updates);
    }

    if (!esPropuesta) {
        try {
            const textoCoord = generarTextoAvisoCoordinadorPrealta({
                alumnos: alumnosList,
                nombreGrupo: grp,
                fechaManual: fIso,
                cfg: callbacks?.configApp || defaultCfg
            });
            if (textoCoord) {
                await navigator.clipboard.writeText(textoCoord);
            }
        } catch(clipErr) {
            console.warn("No se pudo copiar automáticamente al portapapeles:", clipErr);
        }
    }
    
    document.getElementById('modal-iniciar-prealta')?.close();

    // Recargar vista reactivamente con los datos actualizados
    const vistaDestino = esPropuesta ? 'Match - En Validacion' : (estadoActualVista || window.estadoActualVista || 'Altas - En Curso');
    if (typeof cargarVista === 'function') {
        await cargarVista(vistaDestino);
    } else if (typeof window.cargarVistaGlobal === 'function') {
        await window.cargarVistaGlobal(vistaDestino);
    }

    ocultarLoader();
    if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
    if (esPropuesta) {
        alert(`✅ Propuesta creada con éxito para ${ids.length} alumno(s).\nLos alumnos pasaron a "Grupos y Alumnos en Validación".`);
    } else {
        alert(`✅ Datos guardados exitosamente para ${ids.length} alumno(s).\nEvento sincronizado en Google Calendar y texto copiado.`);
    }
    } catch (err) {
        console.error("Error en guardarPreAlta:", err);
        ocultarLoader();
        if (typeof setBotonCargando === 'function') setBotonCargando(btnTarget, false);
        alert("Ocurrió un error al procesar la pre-alta: " + (err.message || err));
    }
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
    if (!cfg || cfg === defaultCfg) {
        cfg = window.configApp || defaultCfg;
    }
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
    const esGrupal = tipoSusc === 'grupal' || (al.tipo_suscripcion || '').toLowerCase().includes('grupal');
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
    } else if (esGrupal) {
        opcContainer.innerHTML = `
            <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; cursor:pointer; font-weight:600; text-transform:none; color:var(--text-main); margin:0;">
                <input type="radio" name="opt-arancel-modalidad" value="grupal" checked style="accent-color:var(--accent-teal);">
                👥 Clase Grupal <span id="label-monto-grupal" style="color:var(--accent-teal); margin-left:auto; font-weight:700;">${formatearPrecioMoneda(cfg.arancel_grupal_regular) || '$25.000'}</span>
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
        } else if (esGrupal) {
            suscripcionParaMsg = tieneInstrumentoEnTemplate ? 'Clase Grupal' : `Clase Grupal (${instNom || 'Instrumento'})`;
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
        const mod = rad ? rad.value : (esIndividual ? 'fullpack' : (esGrupal ? 'grupal' : 'ensamble'));

        if (chkComunidadLabel) chkComunidadLabel.style.display = 'flex';

        if (esIndividual) {
            if (mod === 'suelta') {
                montoCalculado = formatearPrecioMoneda(cfg.arancel_individual_suelta) || '$15.000';
            } else if (mod === 'quincenal') {
                montoCalculado = formatearPrecioMoneda(cfg.arancel_individual_quincenal) || '$25.000';
            } else {
                montoCalculado = esComunidad
                    ? (formatearPrecioMoneda(cfg.arancel_individual_fullpack_comunidad) || '$40.000')
                    : (formatearPrecioMoneda(cfg.arancel_individual_fullpack) || '$45.000');
            }
        } else if (esGrupal) {
            montoCalculado = esComunidad
                ? (formatearPrecioMoneda(cfg.arancel_grupal_comunidad) || '$20.000')
                : (formatearPrecioMoneda(cfg.arancel_grupal_regular) || '$25.000');
        } else {
            if (mod === 'ensamble') {
                montoCalculado = esComunidad
                    ? (formatearPrecioMoneda(cfg.arancel_ensamble_comunidad) || formatearPrecioMoneda(cfg.arancel_ensamble_regular) || '$28.000')
                    : (formatearPrecioMoneda(cfg.arancel_ensamble_regular) || '$28.000');
            } else {
                montoCalculado = esComunidad
                    ? (formatearPrecioMoneda(cfg.arancel_ensamble_comunidad) || '$30.000')
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
        const labelGrupal = document.getElementById('label-monto-grupal');
        if (labelGrupal) {
            labelGrupal.textContent = esComunidad
                ? (formatearPrecioMoneda(cfg.arancel_grupal_comunidad) || '$20.000')
                : (formatearPrecioMoneda(cfg.arancel_grupal_regular) || '$25.000');
        }
        const labelEnsambleRegular = document.getElementById('label-monto-ensamble-regular');
        if (labelEnsambleRegular) {
            labelEnsambleRegular.textContent = esComunidad
                ? (formatearPrecioMoneda(cfg.arancel_ensamble_comunidad) || '$28.000')
                : (formatearPrecioMoneda(cfg.arancel_ensamble_regular) || '$28.000');
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
        const mod = rad ? rad.value : (esIndividual ? 'fullpack' : (esGrupal ? 'grupal' : 'ensamble'));
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
                hist.push(fnHist(`Mensaje de Pre-Alta copiado para avisar al alumno (Arancel: ${monto || al.valor_arancel || '-'}).`, 'alta'));
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

// -----------------------------------------------------------------------
// Render de Vistas de Altas Agrupadas (Tarjetas de Grupo y Clases Individuales)
// -----------------------------------------------------------------------
// -----------------------------------------------------------------------
// Aprobar Todo el Grupo (Dar Alta Efectiva a todos los integrantes pendientes y actualizar Calendar sin pendientes)
// -----------------------------------------------------------------------
export async function aprobarTodoGrupoAction(grupoNombre, vista, callbacks = {}) {
    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", grupoNombre)));
        const miembros = [];
        qSnap.forEach(d => {
            const data = d.data();
            if (!['Alta Finalizada', 'Alta Suspendida', 'Agenda suspendida', 'Inactivo'].includes(data.estado_agenda)) {
                miembros.push({ id: d.id, ...data });
            }
        });

        if (miembros.length === 0) {
            alert(`No se encontraron alumnos activos para el grupo "${grupoNombre}".`);
            return;
        }

        const pendientes = miembros.filter(m => {
            const st = (m.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return !['alta confirmada', 'alta efectiva', 'alta finalizada'].includes(st);
        });

        const confirmarFn = window.confirmar || ((t, d, b, i) => Promise.resolve(confirm(`${t}\n\n${d}`)));
        const ok = await confirmarFn(
            `Aprobar Todo el Grupo: ${grupoNombre}`,
            `¿Aprobar y confirmar el alta de todos los integrantes de "${grupoNombre}" (${miembros.length} alumnos)?\n\n• Se marcarán en Alta Efectiva (${pendientes.length} pendiente(s) pasan a confirmados con pago abonado).\n• Se actualizará Google Calendar como grupo activo oficial sin pendientes.`,
            '✅ Aprobar Grupo Completo',
            '✅'
        );
        if (!ok) return;

        if (typeof window.mostrarIndicadorCarga === 'function') {
            window.mostrarIndicadorCarga(`Aprobando grupo "${grupoNombre}"...`);
        }

        const ahoraIso = new Date().toISOString();
        const fnHist = window.crearEntradaHistorial || ((txt, t) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: t || 'sistema' }));

        // 1. Actualizar en Firestore a todos los miembros pendientes a Alta Efectiva
        for (const m of pendientes) {
            const hist = m.historial || [];
            hist.push(fnHist(`Alta confirmada en grupo "${grupoNombre}" (Aprobación grupal completa).`, 'alta'));
            const checksExistentes = (Array.isArray(m.checklist_alta) && m.checklist_alta.length > 0)
                ? m.checklist_alta
                : [false, false, false, false];

            await updateDoc(doc(db, "alumnos", m.id), {
                estado_agenda: "Alta Efectiva",
                fecha_alta_confirmada: ahoraIso,
                checklist_alta: checksExistentes,
                historial: hist
            });
        }

        // 2. Obtener lista fresca de todos los miembros actualizados desde Firestore
        const freshSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", grupoNombre)));
        const miembrosActualizados = [];
        freshSnap.forEach(d => {
            const data = d.data();
            if (!['Alta Finalizada', 'Alta Suspendida', 'Agenda suspendida', 'Inactivo'].includes(data.estado_agenda)) {
                miembrosActualizados.push({ id: d.id, ...data });
            }
        });

        // 3. Sincronizar Google Calendar con todos los confirmados (cantPendientes = 0)
        const primerAl = miembrosActualizados[0] || miembros[0];
        const cfg = callbacks.configApp || defaultCfg;
        await sincronizarEventoAltaConfirmadaCalendar(primerAl, false, miembrosActualizados, cfg, { esRecurrente: true });

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(`✅ Grupo "${grupoNombre}" aprobado al 100%. Evento en Google Calendar actualizado.`, 'success');
        } else {
            alert(`✅ Grupo "${grupoNombre}" aprobado al 100%.\nEvento en Google Calendar actualizado.`);
        }

        if (typeof callbacks.cargarVista === 'function') await callbacks.cargarVista(vista);
    } catch(e) {
        console.error("Error al aprobar grupo:", e);
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast("Error al aprobar grupo: " + e.message, 'error');
        } else {
            alert("Error al aprobar grupo: " + e.message);
        }
    } finally {
        if (typeof window.ocultarIndicadorCarga === 'function') window.ocultarIndicadorCarga();
    }
}

// -----------------------------------------------------------------------
// Confirmar Inicio de Grupo (inicia oficialmente, con confirmados o todos)
// -----------------------------------------------------------------------
export async function confirmarInicioGrupoAction(grupoNombre, vista, callbacks = {}) {
    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", grupoNombre)));
        const miembros = [];
        qSnap.forEach(d => {
            const data = d.data();
            if (!['Alta Finalizada', 'Alta Suspendida', 'Agenda suspendida', 'Inactivo'].includes(data.estado_agenda)) {
                miembros.push({ id: d.id, ...data });
            }
        });

        if (miembros.length === 0) return alert(`No se encontraron alumnos activos para el grupo "${grupoNombre}".`);

        const confirmados = miembros.filter(m => {
            const st = (m.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return ['alta confirmada', 'alta efectiva', 'alta finalizada'].includes(st);
        });
        const pendientes = miembros.filter(m => !confirmados.some(c => c.id === m.id));

        if (confirmados.length === 0) {
            // Si ninguno confirmó individualmente, ofrecer aprobar a todos
            const confirmarFn = window.confirmar || ((t, d, b, i) => Promise.resolve(confirm(`${t}\n\n${d}`)));
            const okAprobarTodo = await confirmarFn(
                `Aprobar Grupo: ${grupoNombre}`,
                `Ningún alumno ha sido marcado como confirmado individualmente todavía.\n\n¿Deseas aprobar a TODOS los integrantes (${miembros.length}) e iniciar el grupo?`,
                '✅ Aprobar a Todos',
                '✅'
            );
            if (okAprobarTodo) {
                return await aprobarTodoGrupoAction(grupoNombre, vista, callbacks);
            }
            return;
        }

        let mensajeConfirmar = '';
        if (pendientes.length > 0) {
            mensajeConfirmar = `El grupo "${grupoNombre}" tiene ${confirmados.length} alumno(s) confirmado(s) y ${pendientes.length} pendiente(s) de pago.\n\n¿Deseas confirmar el inicio del grupo con los ${confirmados.length} confirmados?\n• Se creará/actualizará el evento en Google Calendar indicando los activos y los ${pendientes.length} pendientes.\n• Los integrantes pendientes permanecerán en Altas en Curso esperando su pago.`;
        } else {
            mensajeConfirmar = `Todos los integrantes (${confirmados.length}) del grupo "${grupoNombre}" tienen su alta confirmada.\n\n¿Confirmar inicio oficial del grupo y actualizar evento en Google Calendar?`;
        }

        const confirmarFn = window.confirmar || ((t, d, b, i) => Promise.resolve(confirm(`${t}\n\n${d}`)));
        const okInicio = await confirmarFn(
            `Confirmar Inicio: ${grupoNombre}`,
            mensajeConfirmar,
            '🚀 Confirmar Inicio',
            '🚀'
        );
        if (!okInicio) return;

        if (typeof window.mostrarIndicadorCarga === 'function') window.mostrarIndicadorCarga(`Confirmando inicio de "${grupoNombre}"...`);

        const primerAl = confirmados[0] || miembros[0];
        const cfg = callbacks.configApp || defaultCfg;

        // Actualizar evento en Calendar
        await sincronizarEventoAltaConfirmadaCalendar(primerAl, false, miembros, cfg, { esRecurrente: true });

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(`🚀 ¡Grupo "${grupoNombre}" iniciado con éxito! Evento actualizado en Google Calendar.`, 'success');
        } else {
            alert(`🚀 ¡Grupo "${grupoNombre}" iniciado con éxito!\nEvento actualizado en Google Calendar.`);
        }
        if (typeof callbacks.cargarVista === 'function') await callbacks.cargarVista(vista);
    } catch(e) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast("Error al confirmar inicio de grupo: " + e.message, 'error');
        } else {
            alert("Error al confirmar inicio de grupo: " + e.message);
        }
    } finally {
        if (typeof window.ocultarIndicadorCarga === 'function') window.ocultarIndicadorCarga();
    }
}

export async function confirmarAlumnoAltaAction(alumnoId, alumnoNombre, grupoNombre, vista, callbacks = {}) {
    try {
        const confirmarFn = window.confirmar || ((t, d, b, i) => Promise.resolve(confirm(`${t}\n\n${d}`)));
        const okConf = await confirmarFn(
            'Confirmar Pago y Cursada Activa',
            `¿Confirmar que ${alumnoNombre} abonó su arancel e inicia su cursada en ${grupoNombre || 'su clase individual'}?`,
            '✅ Confirmar Alta',
            '✅'
        );
        if (!okConf) return;

        const dSnap = await getDoc(doc(db, "alumnos", alumnoId));
        if (!dSnap.exists()) return;
        const al = dSnap.data();

        // Sincronizar Calendar
        const cfg = callbacks.configApp || defaultCfg;
        const esInd = !grupoNombre || grupoNombre === 'Clase Individual';

        let opcionesAlta = {};
        if (esInd) {
            const modInd = al.modalidad_individual || (
                (al.tipo_suscripcion || '').toLowerCase().includes('suelta') ? 'suelta' :
                (al.tipo_suscripcion || '').toLowerCase().includes('quincenal') ? 'quincenal' : ''
            );
            if (modInd === 'suelta') {
                opcionesAlta.esRecurrente = false;
            } else if (modInd === 'quincenal') {
                const soloPuntual = await confirmarFn(
                    'Modalidad Quincenal en Calendar',
                    `La clase individual de ${alumnoNombre} es Quincenal.\n\n¿Deseas agendar en Google Calendar solo 1 clase puntual para que el docente coordine luego, o crear una serie recurrente?`,
                    '📅 Solo 1 clase puntual',
                    '📅',
                    '🔄 Serie recurrente'
                );
                opcionesAlta.esRecurrente = !soloPuntual;
            } else if (modInd === 'fullpack') {
                opcionesAlta.esRecurrente = true;
            } else {
                const esRec = await confirmarFn(
                    'Tipo de Cursada en Calendar',
                    `¿La clase individual de ${alumnoNombre} será de cursada recurrente semanal en Google Calendar?`,
                    '🔄 Recurrente semanal',
                    '📅',
                    '📅 Solo una clase puntual'
                );
                opcionesAlta.esRecurrente = esRec;
            }
        }

        // Una vez resueltas TODAS las preguntas al usuario, recién ahora activamos el loader de procesamiento
        if (typeof window.mostrarIndicadorCarga === 'function') window.mostrarIndicadorCarga(`Confirmando a ${alumnoNombre}...`);

        const hist = al.historial || [];
        const fnHist = window.crearEntradaHistorial || ((txt, t) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: t || 'sistema' }));
        hist.push(fnHist(`Alta confirmada (pago abonado). Alumno activo en ${grupoNombre || al.grupo_asignado || 'clase'}.`, 'alta'));

        const checksExistentes = Array.isArray(al.checklist_alta) && al.checklist_alta.length > 0 
            ? al.checklist_alta 
            : [false, false, false, false];

        await updateDoc(doc(db, "alumnos", alumnoId), {
            estado_agenda: "Alta Efectiva",
            fecha_alta_confirmada: new Date().toISOString(),
            checklist_alta: checksExistentes,
            historial: hist
        });

        // Obtener lista completa y FRESCA de todos los miembros del grupo desde Firestore
        let todosMiembrosGrupo = [];
        if (!esInd && grupoNombre) {
            const grpSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", grupoNombre)));
            grpSnap.forEach(d => {
                const data = d.data();
                if (!['Alta Finalizada', 'Alta Suspendida', 'Agenda suspendida', 'Inactivo'].includes(data.estado_agenda)) {
                    todosMiembrosGrupo.push({ id: d.id, ...data });
                }
            });
        }

        await sincronizarEventoAltaConfirmadaCalendar(
            { id: alumnoId, ...al, estado_agenda: "Alta Efectiva", checklist_alta: checksExistentes }, 
            esInd, 
            todosMiembrosGrupo, 
            cfg, 
            opcionesAlta
        );

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(`✅ Alta confirmada para ${alumnoNombre}. Evento en Google Calendar actualizado.`, 'success');
        } else {
            alert(`✅ Alta confirmada para ${alumnoNombre}. Evento en Google Calendar actualizado.`);
        }
        if (typeof callbacks.cargarVista === 'function') await callbacks.cargarVista(vista);
    } catch(e) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast("Error al confirmar alumno: " + e.message, 'error');
        } else {
            alert("Error al confirmar alumno: " + e.message);
        }
    } finally {
        if (typeof window.ocultarIndicadorCarga === 'function') window.ocultarIndicadorCarga();
    }
}

// -----------------------------------------------------------------------
// Helper para renderizar Checklist interactivo de Alta (4 pasos)
// -----------------------------------------------------------------------
export function generarChecklistAltaHtml(id, al) {
    if (!id || !al) return '';
    let rawChecks = al.checklist_alta || [false, false, false, false];
    let checks = rawChecks.length === 5 ? rawChecks.slice(1) : (rawChecks.length === 4 ? rawChecks : [false, false, false, false]);
    const pasostitulos = [
        '1. Carga en Sistema',
        '2. Profesor notificado',
        '3. Bienvenida a alumno',
        '4. Alumno en grupo WhatsApp'
    ];
    const completados = checks.filter(Boolean).length;
    const porcentaje = Math.round((completados / 4) * 100);
    const barColor = completados === 4 ? 'var(--accent-teal)' : (completados >= 2 ? '#e5a93d' : 'var(--accent-red)');

    return `
        <div id="chk-wrapper-${id}" class="alta-checklist-wrapper" style="margin-top:6px; margin-bottom:2px; padding:8px 12px; background:var(--hover-bg); border-radius:10px; border:1px solid var(--border-color); cursor:pointer; min-width:215px; width:100%; box-sizing:border-box; user-select:none; height:auto; min-height:auto;" onclick="event.stopPropagation(); window.toggleChecklistPill(this);" title="Clic para ver o completar los pasos del checklist">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:12px;">
                <div style="display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; color:var(--text-main);">
                    <span id="chk-icon-${id}" style="font-size:9px; color:#64748b; transition:transform 0.2s ease; display:inline-block;">▶</span>
                    <span id="chk-title-${id}">📋 Checklist de Alta (${completados}/4)</span>
                </div>
                <span id="chk-pct-${id}" style="color:${barColor}; font-size:11.5px; font-weight:800; margin-left:auto; padding-left:16px; white-space:nowrap;">${porcentaje}%</span>
            </div>
            <div style="width:100%; height:5px; background:#e9e5de; border-radius:4px; overflow:hidden; margin-top:5px;">
                <div id="chk-bar-${id}" style="width:${porcentaje}%; height:100%; background:${barColor}; transition:width 0.3s ease, background 0.3s ease;"></div>
            </div>
            <div id="chk-list-${id}" class="checklist-items-collapsible" style="display:none; flex-wrap:wrap; gap:8px 12px; font-size:11px; color:var(--text-muted); margin-top:9px; padding-top:8px; border-top:1px dashed var(--border-color);" onclick="event.stopPropagation();">
                ${checks.map((chk, idx) => `
                    <label style="display:inline-flex; align-items:center; gap:5px; margin:0; cursor:pointer; font-weight:600; text-transform:none; color:${chk ? 'var(--text-main)' : 'var(--text-muted)'};" onclick="event.stopPropagation();">
                        <input type="checkbox" class="chk-alta-paso" data-id="${id}" data-idx="${idx}" ${chk ? 'checked' : ''} style="accent-color:var(--accent-teal); width:15px; height:15px; cursor:pointer;" onclick="event.stopPropagation();">
                        <span style="${chk ? 'text-decoration:none;' : ''}">${pasostitulos[idx] || `Paso ${idx+1}`}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

function construirAccionesFilaAlta(al, id, vista, isConfirmed, nombreGrupo, callbacks = {}) {
    const fnAccion = callbacks.generarBotonesAccion || window.generarBotonesAccion;
    const esFinalizada = typeof window.esAlumnoAltaFinalizada === 'function' ? window.esAlumnoAltaFinalizada(al) : false;

    let botonesVisibles = '';
    let botonesSecundarios = '';

    if (typeof fnAccion === 'function') {
        const alClon = { ...al };
        if (vista === 'Altas - Confirmadas' && (!alClon.estado_agenda || !alClon.estado_agenda.toLowerCase().includes('alta'))) {
            alClon.estado_agenda = 'Alta Efectiva';
        } else if (vista === 'Altas - Finalizadas' && (!alClon.estado_agenda || !alClon.estado_agenda.toLowerCase().includes('alta'))) {
            alClon.estado_agenda = 'Alta Finalizada';
        }
        botonesSecundarios = fnAccion(alClon, id, false);
    }

    if (vista === 'Altas - Pendientes') {
        if (nombreGrupo && nombreGrupo !== 'Clase Individual') {
            botonesVisibles = `<button type="button" class="row-quick-btn secondary btn-prealta-individual-row" data-id="${id}" title="Iniciar Pre-Alta solo para este alumno">⚙️ Pre-Alta Individual</button>`;
        } else {
            botonesVisibles = `<button type="button" class="row-quick-btn primary btn-prealta-individual-row" data-id="${id}" title="Iniciar Pre-Alta">⚙️ Iniciar Pre-Alta</button>`;
        }
    } else if (vista === 'Altas - En Curso') {
        if (!isConfirmed) {
            botonesVisibles = `
                <button type="button" class="row-quick-btn success btn-confirmar-alumno-row" data-id="${id}" data-nombre="${al.nombre || ''}" data-grupo="${nombreGrupo || ''}" title="Confirmar pago y marcar como alta activa">✅ Confirmar</button>
                <button type="button" class="row-quick-btn secondary btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${nombreGrupo||al.grupo_asignado||''}" title="Editar día, horario o profesor">✏️ Editar</button>
            `;
        } else {
            botonesVisibles = `
                <button type="button" class="row-quick-btn secondary btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${nombreGrupo||al.grupo_asignado||''}" title="Editar día, horario o profesor">✏️ Editar</button>
            `;
        }
    } else if (vista === 'Altas - Confirmadas') {
        botonesVisibles = `
            ${!esFinalizada ? `<button type="button" class="row-quick-btn primary btn-finalizar-alta-directa" data-id="${id}" title="Finalizar alta y cerrar admisión">🏁 Finalizar Alta</button>` : ''}
            <button type="button" class="row-quick-btn secondary btn-reenviar-alta" data-id="${id}" title="Copiar texto de confirmación">💬 Copiar texto</button>
        `;
    } else if (vista === 'Altas - Finalizadas') {
        botonesVisibles = `
            <button type="button" class="row-quick-btn secondary btn-reenviar-alta" data-id="${id}" title="Copiar texto de confirmación">💬 Copiar texto</button>
        `;
    }

    const tieneSecundarios = Boolean(botonesSecundarios && botonesSecundarios.trim().length > 0);

    return `
        <div class="row-actions-group" style="display:flex; align-items:center; gap:6px; flex-wrap:nowrap;">
            ${botonesVisibles ? `<div class="row-quick-btns-col" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">${botonesVisibles}</div>` : ''}
            ${tieneSecundarios ? `
                <div class="alumno-actions row-actions-container" style="position:relative;">
                    <button type="button" class="btn-row-action" title="Más opciones">⋮</button>
                    <div class="dropdown-menu-wrapper">
                        <div class="dropdown-menu">${botonesSecundarios}</div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

export async function renderAltasAgrupadas(container, dataFiltrada, vista, callbacks = {}) {
    if (!container) return;
    container.style.display = 'flex';
    container.innerHTML = '<div style="padding:30px; color:var(--text-muted); text-align:center;">Cargando vistas de altas...</div>';

    try {
        if (!dataFiltrada || dataFiltrada.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; background:white; border-radius:14px; border:1px solid var(--border-color); color:var(--text-muted); width:100%;">
                    <div style="font-size:2.5em; margin-bottom:10px;">📋</div>
                    <div style="font-size:16px; font-weight:700; color:var(--text-main); margin-bottom:6px;">No hay registros en ${vista}</div>
                    <div style="font-size:13px; max-width:450px; margin:0 auto;">Cuando haya alumnos en esta etapa se mostrarán agrupados aquí.</div>
                </div>
            `;
            return;
        }

        const qSnapAll = await getDocs(collection(db, "alumnos"));
        const todosAlumnos = [];
        qSnapAll.forEach(d => todosAlumnos.push({ id: d.id, ...d.data() }));

        const esGrupoFn = (al) => {
            const grp = (al.grupo_asignado || '').replace(/\s*\([⌛⏳].*?pend\)/gi, '').trim();
            return grp && grp !== 'Clase Individual' && grp !== 'Individual' && !grp.startsWith('Grupo Sin');
        };

        const gruposMap = {};
        const individuales = [];

        dataFiltrada.forEach(al => {
            if (esGrupoFn(al)) {
                const grpNom = al.grupo_asignado.replace(/\s*\([⌛⏳].*?pend\)/gi, '').trim();
                if (!gruposMap[grpNom]) gruposMap[grpNom] = [];
                gruposMap[grpNom].push(al);
            } else {
                individuales.push(al);
            }
        });

        let html = '';

        // Renderizar Tarjetas de Grupos
        for (const [nombreGrupo, integrantesEnVista] of Object.entries(gruposMap)) {
            // Contexto global del grupo en la base de datos (para métricas informativas)
            const todosMiembrosGrupo = todosAlumnos.filter(a => {
                const aGrp = (a.grupo_asignado || '').replace(/\s*\([⌛⏳].*?pend\)/gi, '').trim();
                return aGrp === nombreGrupo &&
                    !['Alta Suspendida', 'Agenda suspendida', 'Inactivo'].includes(a.estado_agenda);
            });

            // En esta tarjeta de la vista activa se renderizan ÚNICA Y EXCLUSIVAMENTE los alumnos que pertenecen a esta vista
            const miembrosRenderizar = integrantesEnVista;
            const primer = miembrosRenderizar[0] || {};
            const horario = primer.horario_match || primer.reserva_fecha_texto || 'Horario a coordinar';
            const profeNom = primer.reserva_profe_nombre || primer.profesor_asignado || 'Docente';
            const modalidad = primer.modalidad_ensamble || primer.tipo_ensamble || primer.tipo_suscripcion || 'Ensamble';

            const totalGrupo = todosMiembrosGrupo.length;
            const confirmadosTotal = todosMiembrosGrupo.filter(m => {
                const st = (m.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                return ['alta confirmada', 'alta efectiva', 'alta finalizada'].includes(st);
            }).length;
            const pendientesTotal = Math.max(0, totalGrupo - confirmadosTotal);

            let statusChipsHtml = '';
            let headerActionsHtml = '';

            if (vista === 'Altas - Pendientes') {
                statusChipsHtml = `<span class="group-member-status-chip status-val-ok">📋 ${miembrosRenderizar.length} Integrante(s) Validado(s)</span>`;
                const idsParam = miembrosRenderizar.map(m => m.id).join(',');
                headerActionsHtml = `
                    <button type="button" class="btn-action-highlight btn-avisar-admisor-grupo" data-grupo="${nombreGrupo}" data-ids="${idsParam}" style="padding:8px 14px; font-size:13px; color:var(--accent-teal); border:1.5px solid var(--accent-teal); background:#f0fdfa; border-radius:8px; font-weight:700; cursor:pointer;" title="Copiar aviso para el Admisor con los datos de este grupo">
                        📢 Avisar al Admisor
                    </button>
                    <button type="button" class="btn-primary btn-iniciar-prealta-grupo-card" data-grupo="${nombreGrupo}" data-ids="${idsParam}" style="padding:8px 16px; font-size:13px; cursor:pointer;" title="Iniciar Pre-Alta de todo el grupo y agendar en Google Calendar">
                        ⚙️ Iniciar Pre-Alta Grupal
                    </button>
                    <button type="button" class="filter-chip btn-devolver-grupo-espera" data-grupo="${nombreGrupo}" data-ids="${idsParam}" style="padding:8px 12px; font-size:13px; color:var(--accent-red); border-color:rgba(194,86,59,0.3); cursor:pointer;" title="Devolver todo el grupo a Lista de Espera">
                        ↩️ Devolver Grupo
                    </button>
                `;
            } else if (vista === 'Altas - En Curso') {
                statusChipsHtml = `<span class="group-member-status-chip status-val-pending">⏳ ${miembrosRenderizar.length} Pendiente(s) de Pago</span>`;
                if (confirmadosTotal > 0) {
                    statusChipsHtml += ` <span style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; color:#166534; background:#dcfce7; border:1px solid #bbf7d0; padding:2px 8px; border-radius:12px; font-weight:700;">🟢 ${confirmadosTotal} ya confirmaron</span>`;
                }
                const idsPendientes = miembrosRenderizar.map(p => p.id).join(',');
                headerActionsHtml = `
                    <button type="button" class="btn-action-highlight btn-avisar-coordinador-grupo" data-grupo="${nombreGrupo}" data-ids="${idsPendientes}" style="padding:8px 14px; font-size:13px; color:var(--accent-teal); border:1.5px solid var(--accent-teal); background:#f0fdfa; border-radius:8px; font-weight:700; cursor:pointer;" title="Copiar aviso para el Coordinador con los datos de este grupo">
                        📢 Avisar al Coordinador
                    </button>
                    <button type="button" class="btn-primary btn-aprobar-todo-grupo" data-grupo="${nombreGrupo}" style="background:#16a34a; border-color:#16a34a; padding:8px 14px; font-size:13px; cursor:pointer;" title="Aprobar pago y alta de los ${miembrosRenderizar.length} integrantes pendientes">
                        ✅ Aprobar Todo el Grupo (${miembrosRenderizar.length})
                    </button>
                    <button type="button" class="filter-chip btn-devolver-grupo-espera" data-grupo="${nombreGrupo}" data-ids="${idsPendientes}" style="padding:8px 12px; font-size:13px; color:var(--accent-red); border-color:rgba(194,86,59,0.3); cursor:pointer;" title="Devolver integrantes pendientes a Lista de Espera">
                        ↩️ Devolver Pendientes
                    </button>
                `;
            } else if (vista === 'Altas - Confirmadas') {
                statusChipsHtml = `<span class="group-member-status-chip status-val-ok">🟢 ${miembrosRenderizar.length} Confirmado(s)</span>`;
                if (pendientesTotal > 0) {
                    statusChipsHtml += ` <span style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; color:#92400e; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:12px; font-weight:700;">⏳ ${pendientesTotal} aún en curso</span>`;
                }
                const idsConfirmados = miembrosRenderizar.map(p => p.id).join(',');
                headerActionsHtml = `
                    <button type="button" class="btn-primary btn-finalizar-todo-grupo" data-grupo="${nombreGrupo}" data-ids="${idsConfirmados}" style="padding:8px 14px; font-size:13px; cursor:pointer;" title="Finalizar alta y cerrar ciclo para los ${miembrosRenderizar.length} integrantes confirmados">
                        🏁 Finalizar Todo el Grupo (${miembrosRenderizar.length})
                    </button>
                `;
            } else if (vista === 'Altas - Finalizadas') {
                statusChipsHtml = `<span class="group-member-status-chip status-val-ok">🏆 ${miembrosRenderizar.length} Finalizado(s)</span>`;
            } else {
                statusChipsHtml = `<span class="group-member-status-chip status-val-ok">✅ ${miembrosRenderizar.length} Alumnos</span>`;
            }

            const renderFilaMiembro = (al) => {
                const st = (al.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                const isConfirmed = ['alta confirmada', 'alta efectiva', 'alta finalizada'].includes(st);
                const instAsignado = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || 'Sin inst.'));
                const emojiInst = getEmojiInstrumento(instAsignado, callbacks.configApp || defaultCfg);

                let badgeEstado = '';
                if (vista === 'Altas - Pendientes') {
                    badgeEstado = `<span class="group-member-status-chip status-val-ok">✅ Validado</span>`;
                } else if (vista === 'Altas - En Curso') {
                    badgeEstado = isConfirmed
                        ? `<span class="group-member-status-chip status-val-ok">✅ Alta Confirmada</span>`
                        : `<span class="group-member-status-chip status-val-pending">⏳ Pendiente de Pago</span>`;
                } else if (vista === 'Altas - Finalizadas') {
                    badgeEstado = `<span class="group-member-status-chip status-val-ok">🏆 Alta Finalizada</span>`;
                } else {
                    badgeEstado = `<span class="group-member-status-chip status-val-ok">✅ Alta Confirmada</span>`;
                }

                const botonesRow = construirAccionesFilaAlta(al, al.id, vista, isConfirmed, nombreGrupo, callbacks);
                const checklistRowHtml = (vista !== 'Altas - Pendientes') ? generarChecklistAltaHtml(al.id, al) : '';

                return `
                    <div class="group-member-row" style="padding:12px 14px; align-items:center; justify-content:space-between; gap:12px;">
                        <div class="group-member-info" style="display:flex; flex-direction:column; align-items:flex-start; text-align:left; gap:3px; cursor:pointer; flex:1;" onclick="window.editarAlumnoModalDirecto('${al.id}')" title="Ver ficha de ${al.nombre}">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; text-align:left;">
                                <span class="group-member-name" style="font-size:14px; font-weight:700; color:var(--text-main);">👤 ${al.nombre}</span>
                                ${badgeEstado}
                            </div>
                            <div class="group-member-details" style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                ${al.edad ? `<span>${al.edad} años</span> • ` : ''}
                                ${al.nivel ? `<span class="match-student-tag nivel" style="font-size:10px; padding:2px 7px;">${al.nivel}</span> • ` : ''}
                                <strong style="color:var(--accent-teal); font-weight:600;">${emojiInst} ${instAsignado}</strong> • 
                                <strong style="color:var(--accent-purple); font-weight:600; font-size:12px;">🧩 ${al.tipo_suscripcion || 'Ensamble'}</strong>
                                ${al.celular ? ` • <span>📱 ${al.celular}</span>` : ''}
                            </div>
                            ${checklistRowHtml}
                        </div>
                        <div class="group-member-actions" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; flex-shrink:0;">
                            ${botonesRow}
                        </div>
                    </div>
                `;
            };

            const miembrosHtml = miembrosRenderizar.map(renderFilaMiembro).join('');

            html += `
                <div class="group-box-card" style="width:100%; margin-bottom:16px;">
                    <div class="group-box-header">
                        <div>
                            <div class="group-box-title">
                                <span>🧩 ${nombreGrupo}</span>
                                ${statusChipsHtml}
                            </div>
                            <div class="group-box-subtitle">
                                <span>📅 <strong>${horario}</strong></span>
                                <span>•</span>
                                <span>👨‍🏫 Docente: <strong>${profeNom}</strong></span>
                                <span>•</span>
                                <span style="color:var(--accent-teal); font-weight:700;">🎸 ${modalidad}</span>
                            </div>
                        </div>
                        <div class="group-box-actions">
                            ${headerActionsHtml}
                        </div>
                    </div>
                    <div class="group-box-members">
                        ${miembrosHtml}
                    </div>
                </div>
            `;
        }

        // Renderizar Clases Individuales (si existen)
        if (individuales.length > 0) {
            html += `
                <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin:24px 0 12px 0; display:flex; align-items:center; gap:8px;">
                    Clases Individuales <span style="flex:1; height:1px; background:var(--border-color);"></span>
                </div>
            `;

            individuales.forEach(al => {
                const st = (al.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                const isConfirmed = ['alta confirmada', 'alta efectiva', 'alta finalizada'].includes(st);
                const instAsignado = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || 'Piano'));
                const emojiInst = getEmojiInstrumento(instAsignado, callbacks.configApp || defaultCfg);
                const horario = al.horario_match || al.reserva_fecha_texto || 'Horario a convenir';
                const profeNom = al.reserva_profe_nombre || al.profesor_asignado || 'Docente';

                let badgeEstadoInd = '';
                if (vista === 'Altas - Pendientes') {
                    badgeEstadoInd = `<span class="group-member-status-chip status-val-ok">✅ Validada</span>`;
                } else if (vista === 'Altas - En Curso') {
                    badgeEstadoInd = isConfirmed
                        ? `<span class="group-member-status-chip status-val-ok">✅ Alta Confirmada</span>`
                        : `<span class="group-member-status-chip status-val-pending">⏳ Pendiente de Pago</span>`;
                } else if (vista === 'Altas - Finalizadas') {
                    badgeEstadoInd = `<span class="group-member-status-chip status-val-ok">🏆 Alta Finalizada</span>`;
                } else {
                    badgeEstadoInd = `<span class="group-member-status-chip status-val-ok">✅ Alta Confirmada</span>`;
                }

                const botonesIndiv = construirAccionesFilaAlta(al, al.id, vista, isConfirmed, 'Clase Individual', callbacks);
                const checklistIndivHtml = (vista !== 'Altas - Pendientes') ? generarChecklistAltaHtml(al.id, al) : '';

                html += `
                    <div class="group-box-card" style="width:100%; margin-bottom:12px; border-left:4px solid var(--accent-teal);">
                        <div class="group-member-row" style="padding:12px 14px; align-items:center; justify-content:space-between; gap:12px;">
                            <div class="group-member-info" style="display:flex; flex-direction:column; align-items:flex-start; text-align:left; gap:3px; cursor:pointer; flex:1;" onclick="window.editarAlumnoModalDirecto('${al.id}')" title="Ver ficha de ${al.nombre}">
                                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; text-align:left;">
                                    <span class="group-member-name" style="font-size:14px; font-weight:700; color:var(--text-main);">👤 ${al.nombre}</span>
                                    ${badgeEstadoInd}
                                    <span class="match-student-tag" style="font-size:10px; padding:2px 7px;">🎹 ${al.tipo_suscripcion || 'Clase Individual'}</span>
                                </div>
                                <div class="group-member-details" style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    ${al.edad ? `<span>${al.edad} años</span> • ` : ''}
                                    ${al.nivel ? `<span class="match-student-tag nivel" style="font-size:10px; padding:2px 7px;">${al.nivel}</span> • ` : ''}
                                    <strong style="color:var(--accent-teal); font-weight:600;">${emojiInst} ${instAsignado}</strong> • 
                                    <span>📅 ${horario} con <strong>${profeNom}</strong></span>
                                    ${al.celular ? ` • <span>📱 ${al.celular}</span>` : ''}
                                </div>
                                ${checklistIndivHtml}
                            </div>
                            <div class="group-member-actions" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; flex-shrink:0;">
                                ${botonesIndiv}
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        container.innerHTML = html;

        // Registrar Event Listeners locales para acciones no delegadas globalmente
        container.querySelectorAll('.btn-iniciar-prealta-grupo-card').forEach(btn => {
            btn.onclick = () => {
                const ids = (btn.dataset.ids || '').split(',').filter(Boolean);
                const grupo = btn.dataset.grupo || '';
                window.abrirModalPrealtaGrupal(ids, grupo, callbacks.configApp || defaultCfg, false);
            };
        });

        container.querySelectorAll('.btn-devolver-grupo-espera').forEach(btn => {
            btn.onclick = async () => {
                const ids = (btn.dataset.ids || '').split(',').filter(Boolean);
                const grupo = btn.dataset.grupo || '';
                if (!ids.length) return;
                const confirmarFn = window.confirmar || ((t, d, b, i) => Promise.resolve(confirm(`${t}\n\n${d}`)));
                const okDevolver = await confirmarFn(
                    'Devolver Grupo a Lista de Espera',
                    `¿Deseas devolver los integrantes del grupo "${grupo}" a Lista de Espera? Se desvincularán del grupo y se actualizará Calendar.`,
                    '↩️ Devolver Grupo',
                    '⚠️'
                );
                if (!okDevolver) return;

                if (typeof window.mostrarIndicadorCarga === 'function') window.mostrarIndicadorCarga(`Devolviendo grupo "${grupo}" a espera...`);
                try {
                    for (const id of ids) {
                        const dSnap = await getDoc(doc(db, "alumnos", id));
                        if (dSnap.exists()) {
                            const al = dSnap.data();
                            const hist = al.historial || [];
                            const fnHist = window.crearEntradaHistorial || ((txt, t) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: t || 'sistema' }));
                            hist.push(fnHist(`Devuelto a Lista de Espera desde ${vista}. Desvinculado del grupo "${grupo}".`, 'alta'));
                            await updateDoc(doc(db, "alumnos", id), {
                                estado_agenda: "Lista de espera",
                                grupo_asignado: "",
                                id_evento_alta: null,
                                historial: hist
                            });
                            await eliminarEventoAltaSeguro({ id, ...al }, callbacks.configApp || defaultCfg);
                        }
                    }
                    if (typeof callbacks.cargarVista === 'function') await callbacks.cargarVista(vista);
                    if (typeof window.mostrarToast === 'function') {
                        window.mostrarToast(`↩️ Grupo "${grupo}" devuelto a Lista de Espera.`, 'info');
                    } else {
                        alert(`↩️ Grupo "${grupo}" devuelto a Lista de Espera.`);
                    }
                } catch(e) {
                    if (typeof window.mostrarToast === 'function') {
                        window.mostrarToast("Error al devolver grupo: " + e.message, 'error');
                    } else {
                        alert("Error al devolver grupo: " + e.message);
                    }
                } finally {
                    if (typeof window.ocultarIndicadorCarga === 'function') window.ocultarIndicadorCarga();
                }
            };
        });

        container.querySelectorAll('.btn-aprobar-todo-grupo').forEach(btn => {
            btn.onclick = async () => {
                const grupo = btn.dataset.grupo || '';
                await aprobarTodoGrupoAction(grupo, vista, callbacks);
            };
        });

        container.querySelectorAll('.btn-finalizar-todo-grupo').forEach(btn => {
            btn.onclick = async () => {
                const grupo = btn.dataset.grupo || '';
                const ids = (btn.dataset.ids || '').split(',').filter(Boolean);
                if (ids.length === 0) return;
                const confirmarFn = window.confirmar || ((t, d, b, i) => Promise.resolve(confirm(`${t}\n\n${d}`)));
                const ok = await confirmarFn(
                    `Finalizar Todo el Grupo: ${grupo}`,
                    `¿Finalizar el alta de los ${ids.length} integrantes confirmados de "${grupo}"?\n\n• Se marcará el checklist completo para todos ellos.\n• Pasarán a Altas Finalizadas.`,
                    '🏁 Finalizar Grupo',
                    '🏆'
                );
                if (!ok) return;

                if (typeof window.mostrarIndicadorCarga === 'function') window.mostrarIndicadorCarga(`Finalizando grupo "${grupo}"...`);
                try {
                    const ahoraIso = new Date().toISOString();
                    const fnHist = window.crearEntradaHistorial || ((txt, t) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: t || 'sistema' }));
                    for (const id of ids) {
                        const dSnap = await getDoc(doc(db, "alumnos", id));
                        if (dSnap.exists()) {
                            const al = dSnap.data();
                            const hist = al.historial || [];
                            hist.push(fnHist(`Alta Finalizada: Todos los pasos del checklist confirmados (Cierre grupal).`, 'alta'));
                            await updateDoc(doc(db, "alumnos", id), {
                                estado_agenda: "Alta Finalizada",
                                checklist_alta: [true, true, true, true],
                                fecha_alta_finalizada: ahoraIso,
                                historial: hist
                            });
                        }
                    }
                    if (typeof callbacks.cargarVista === 'function') await callbacks.cargarVista(vista);
                    if (typeof window.mostrarToast === 'function') {
                        window.mostrarToast(`🏁 Grupo "${grupo}" finalizado con éxito.`, 'success');
                    } else {
                        alert(`🏁 Grupo "${grupo}" finalizado con éxito.`);
                    }
                } catch(e) {
                    if (typeof window.mostrarToast === 'function') {
                        window.mostrarToast("Error al finalizar grupo: " + e.message, 'error');
                    } else {
                        alert("Error al finalizar grupo: " + e.message);
                    }
                } finally {
                    if (typeof window.ocultarIndicadorCarga === 'function') window.ocultarIndicadorCarga();
                }
            };
        });

        container.querySelectorAll('.btn-confirmar-inicio-grupo').forEach(btn => {
            btn.onclick = async () => {
                const grupo = btn.dataset.grupo || '';
                await confirmarInicioGrupoAction(grupo, vista, callbacks);
            };
        });

        container.querySelectorAll('.btn-prealta-individual-row').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                if (id) window.abrirModalPrealta(id);
            };
        });

        container.querySelectorAll('.btn-confirmar-alumno-row').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const nom = btn.dataset.nombre || 'Alumno';
                const grp = btn.dataset.grupo || '';
                await confirmarAlumnoAltaAction(id, nom, grp, vista, callbacks);
            };
        });

        container.querySelectorAll('.btn-devolver-alumno-espera-row').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const nom = btn.dataset.nombre || 'Alumno';
                const grp = btn.dataset.grupo || '';
                const confirmarFn = window.confirmar || ((t, d, b, i) => Promise.resolve(confirm(`${t}\n\n${d}`)));
                const okDevolverAl = await confirmarFn(
                    'Devolver Alumno a Lista de Espera',
                    `¿Deseas devolver a "${nom}" a Lista de Espera? Se desvinculará del grupo y se actualizará Google Calendar.`,
                    '↩️ Devolver a Espera',
                    '⚠️'
                );
                if (!okDevolverAl) return;

                if (typeof window.mostrarIndicadorCarga === 'function') window.mostrarIndicadorCarga(`Moviendo a ${nom} a espera...`);
                try {
                    const dSnap = await getDoc(doc(db, "alumnos", id));
                    if (dSnap.exists()) {
                        const al = dSnap.data();
                        const hist = al.historial || [];
                        const fnHist = window.crearEntradaHistorial || ((txt, t) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: t || 'sistema' }));
                        hist.push(fnHist(`Devuelto a Lista de Espera desde ${vista}${grp ? ` (Desvinculado de ${grp})` : ''}.`, 'alta'));
                        await updateDoc(doc(db, "alumnos", id), {
                            estado_agenda: "Lista de espera",
                            grupo_asignado: "",
                            id_evento_alta: null,
                            historial: hist
                        });
                        await eliminarEventoAltaSeguro({ id, ...al }, callbacks.configApp || defaultCfg);
                    }
                    if (typeof callbacks.cargarVista === 'function') await callbacks.cargarVista(vista);
                    if (typeof window.mostrarToast === 'function') {
                        window.mostrarToast(`↩️ ${nom} devuelto a Lista de Espera.`, 'info');
                    } else {
                        alert(`↩️ ${nom} devuelto a Lista de Espera.`);
                    }
                } catch(e) {
                    if (typeof window.mostrarToast === 'function') {
                        window.mostrarToast("Error al devolver a espera: " + e.message, 'error');
                    } else {
                        alert("Error al devolver a espera: " + e.message);
                    }
                } finally {
                    if (typeof window.ocultarIndicadorCarga === 'function') window.ocultarIndicadorCarga();
                }
            };
        });

    } catch(err) {
        console.error("Error al renderizar altas agrupadas:", err);
        container.innerHTML = `<div style="padding:20px; color:var(--accent-red);">Error al cargar vista: ${err.message}</div>`;
    }
}

// =======================================================================
// Generación y Copiado de Texto de Aviso de Pre-Alta para Admisor y Coordinador
// =======================================================================

export function formatearFechaInicioClasesAviso(al, fechaManual = null) {
    const raw = fechaManual || al?.fecha_inicio_clases || al?.fecha_sugerida_inicio;
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    // 1. Si tenemos fecha explícita (Date, Timestamp, ISO string o string formateada)
    if (raw) {
        let d = null;
        if (raw instanceof Date) {
            d = isNaN(raw.getTime()) ? null : raw;
        } else if (typeof raw?.toDate === 'function') {
            d = raw.toDate();
        } else if (typeof raw === 'object' && typeof raw.seconds === 'number') {
            d = new Date(raw.seconds * 1000);
        } else if (typeof raw === 'string') {
            const rawTrim = raw.trim();
            // Si ya viene formateado tipo "Lunes 21/9 18:00 hs", devolver directamente
            if (/^[A-Za-zÁÉÍÓÚáéíóúñÑ]+\s+\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s*hs/i.test(rawTrim)) {
                return rawTrim;
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawTrim)) {
                const [y, m, day] = rawTrim.split('-').map(Number);
                const hParts = (al?.horario_inicio_match || '18:00').split(':').map(Number);
                d = new Date(y, m - 1, day, hParts[0] || 18, hParts[1] || 0);
            } else {
                const parsed = new Date(rawTrim);
                if (!isNaN(parsed.getTime())) {
                    d = parsed;
                }
            }
        }

        if (d && !isNaN(d.getTime())) {
            const diaSem = dias[d.getDay()];
            const diaNum = d.getDate();
            const mesNum = d.getMonth() + 1;
            const hora = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            return `${diaSem} ${diaNum}/${mesNum} ${hora}:${min} hs`;
        }
    }

    // 2. Si no hay fecha explícita, intentar calcular a partir de dia_match / horario_inicio_match o horario_match / raw
    let diaCodigo = al?.dia_match || '';
    let horaStr = al?.horario_inicio_match || '';

    if (!diaCodigo || !horaStr) {
        const hm = al?.horario_match || (typeof raw === 'string' ? raw : '') || al?.reserva_fecha_texto || '';
        const match = hm.match(/(Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo)\s+(\d{1,2}(?::\d{2})?)/i);
        if (match) {
            diaCodigo = match[1];
            horaStr = match[2].includes(':') ? match[2] : `${match[2]}:00`;
        }
    }

    if (diaCodigo && horaStr && typeof calcularProximaFechaDiaHora === 'function') {
        const mapNombresADiaCod = {
            'lunes': 'L', 'martes': 'M', 'miercoles': 'X', 'miércoles': 'X',
            'jueves': 'J', 'viernes': 'V', 'sabado': 'S', 'sábado': 'S', 'domingo': 'D'
        };
        const codNormalizado = mapNombresADiaCod[diaCodigo.toLowerCase()] || diaCodigo.toUpperCase().charAt(0);
        const proxIso = calcularProximaFechaDiaHora(codNormalizado, horaStr);
        if (proxIso) {
            const d = new Date(proxIso);
            if (!isNaN(d.getTime())) {
                const diaSem = dias[d.getDay()];
                const diaNum = d.getDate();
                const mesNum = d.getMonth() + 1;
                const hora = d.getHours().toString().padStart(2, '0');
                const min = d.getMinutes().toString().padStart(2, '0');
                return `${diaSem} ${diaNum}/${mesNum} ${hora}:${min} hs`;
            }
        }
    }

    // 3. Fallback a texto libre disponible
    return al?.horario_match || al?.reserva_fecha_texto || al?.reserva_fecha_texto_previo || 'Horario a coordinar';
}

export function generarTextoAvisoAdmisorPrealta(params = {}) {
    let alumnos = [];
    let alumno = null;
    let nombreGrupo = '';
    let fechaManual = null;
    let cfg = defaultCfg;

    if (Array.isArray(params)) {
        alumnos = params;
    } else if (params && typeof params === 'object') {
        if ('alumnos' in params || 'alumno' in params) {
            alumnos = params.alumnos || [];
            alumno = params.alumno || null;
            nombreGrupo = params.nombreGrupo || '';
            fechaManual = params.fechaManual || params.fecha_inicio_clases || null;
            cfg = params.cfg || defaultCfg;
        } else {
            alumno = params;
            nombreGrupo = params.grupo_asignado || '';
            fechaManual = params.fecha_inicio_clases || null;
        }
    }

    const list = alumnos && alumnos.length > 0 ? alumnos : (alumno ? [alumno] : []);
    if (list.length === 0) return '';

    const primer = list[0] || {};
    const config = cfg || window.configApp || defaultCfg;
    let template = config.texto_aviso_admisor_prealta || defaultCfg.texto_aviso_admisor_prealta || 
`*🤘🪁 LISTO PARA INICIAR PRE ALTA*

*👥 DATOS DE LA SUSCRIPCIÓN:*
🔹 Suscripción: {suscripcion} {emojiinstrumento} {instrumento}
🔹 Inicio de clases: {fecha inicio clases}
🔹 Nombre: {nombre}
🔹 Grupo: {grupo}
🔹 Profesor: {profe}`;

    const esGrupo = list.length > 1 || (nombreGrupo && nombreGrupo !== 'Clase Individual' && nombreGrupo !== 'Individual');
    const grpNom = (nombreGrupo && nombreGrupo !== 'Clase Individual') ? nombreGrupo : (primer.grupo_asignado || (esGrupo ? 'Grupo' : 'Clase Individual'));

    // Nombres: Si es 1 alumno -> nombre directo. Si son varios -> Opción A: Viñetas por renglón
    let nombreVal = '';
    if (list.length === 1) {
        nombreVal = list[0].nombre || 'Alumno';
    } else {
        nombreVal = list.map(a => {
            const inst = a.instrumento_asignado || (Array.isArray(a.instrumento) ? a.instrumento[0] : (a.instrumento || ''));
            return `\n• ${a.nombre || 'Alumno'}${inst ? ` (${inst})` : ''}`;
        }).join('');
    }

    // Suscripción:
    const suscripcionVal = primer.tipo_suscripcion || primer.modalidad_ensamble || primer.tipo_ensamble || (esGrupo ? 'Ensamble Regular' : 'Clase Individual');

    // Instrumento & Emoji:
    let instVal = '';
    let emojiVal = '';
    if (list.length === 1) {
        instVal = primer.instrumento_asignado || (Array.isArray(primer.instrumento) ? primer.instrumento[0] : (primer.instrumento || ''));
        emojiVal = getEmojiInstrumento(instVal, config);
    } else {
        instVal = primer.tipo_ensamble || primer.modalidad_ensamble || 'Ensambles';
        emojiVal = config?.emoji_guitarra || '🎸';
    }

    // Fecha inicio clases:
    const fInicioVal = formatearFechaInicioClasesAviso(primer, fechaManual);

    // Profe:
    const profeVal = primer.profesor_asignado || primer.reserva_profe_nombre || 'Docente';

    return reemplazarVariables(template, {
        'suscripcion': suscripcionVal,
        'emojiinstrumento': emojiVal,
        'instrumento': instVal,
        'fecha inicio clases': fInicioVal,
        'fecha_inicio_clases': fInicioVal,
        'nombre': nombreVal,
        'grupo': grpNom,
        'profe': profeVal
    });
}

export async function copiarAvisoAdmisorGrupo(nombreGrupo, alumnosArrOIds) {
    try {
        let miembros = [];
        if (Array.isArray(alumnosArrOIds) && alumnosArrOIds.length > 0) {
            if (typeof alumnosArrOIds[0] === 'object') {
                miembros = alumnosArrOIds;
            } else {
                const ids = alumnosArrOIds;
                const pool = Array.isArray(window.allData) ? window.allData : (Array.isArray(window.ultimosAlumnosCargados) ? window.ultimosAlumnosCargados : []);
                miembros = pool.filter(a => ids.includes(a.id));
                if (miembros.length < ids.length) {
                    for (const id of ids) {
                        if (!miembros.some(m => m.id === id)) {
                            const snap = await getDoc(doc(db, "alumnos", id));
                            if (snap.exists()) miembros.push({ id: snap.id, ...snap.data() });
                        }
                    }
                }
            }
        } else if (nombreGrupo) {
            const pool = Array.isArray(window.allData) ? window.allData : (Array.isArray(window.ultimosAlumnosCargados) ? window.ultimosAlumnosCargados : []);
            miembros = pool.filter(a => (a.grupo_asignado || '').trim() === nombreGrupo.trim());
            if (miembros.length === 0) {
                const qSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", nombreGrupo)));
                qSnap.forEach(d => miembros.push({ id: d.id, ...d.data() }));
            }
        }

        if (miembros.length === 0) {
            alert(`No se encontraron alumnos para el grupo "${nombreGrupo}".`);
            return;
        }

        const texto = generarTextoAvisoAdmisorPrealta({
            alumnos: miembros,
            nombreGrupo: nombreGrupo,
            cfg: window.configApp || defaultCfg
        });

        await navigator.clipboard.writeText(texto);
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(`📋 ¡Texto para Admisor (${nombreGrupo}) copiado al portapapeles!`, 'info');
        } else {
            alert(`📋 ¡Texto para Admisor (${nombreGrupo}) copiado al portapapeles!`);
        }
        return texto;
    } catch(err) {
        console.error("Error al copiar aviso admisor grupo:", err);
        alert("No se pudo copiar al portapapeles: " + err.message);
    }
}

export async function copiarAvisoAdmisorAlumno(alumnoIdOAlumno) {
    try {
        let al = null;
        if (typeof alumnoIdOAlumno === 'object' && alumnoIdOAlumno !== null) {
            al = alumnoIdOAlumno;
        } else {
            const id = alumnoIdOAlumno;
            const pool = Array.isArray(window.allData) ? window.allData : (Array.isArray(window.ultimosAlumnosCargados) ? window.ultimosAlumnosCargados : []);
            al = pool.find(a => a.id === id);
            if (!al) {
                const snap = await getDoc(doc(db, "alumnos", id));
                if (snap.exists()) al = { id: snap.id, ...snap.data() };
            }
        }

        if (!al) {
            alert("No se encontró el registro del alumno.");
            return;
        }

        const texto = generarTextoAvisoAdmisorPrealta({
            alumno: al,
            nombreGrupo: al.grupo_asignado || '',
            cfg: window.configApp || defaultCfg
        });

        await navigator.clipboard.writeText(texto);
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(`📋 ¡Texto para Admisor (${al.nombre || 'Alumno'}) copiado al portapapeles!`, 'info');
        } else {
            alert(`📋 ¡Texto para Admisor (${al.nombre || 'Alumno'}) copiado al portapapeles!`);
        }
        return texto;
    } catch(err) {
        console.error("Error al copiar aviso admisor alumno:", err);
        alert("No se pudo copiar al portapapeles: " + err.message);
    }
}

export function generarTextoAvisoCoordinadorPrealta(params = {}) {
    let alumnos = [];
    let alumno = null;
    let nombreGrupo = '';
    let fechaManual = null;
    let cfg = defaultCfg;

    if (Array.isArray(params)) {
        alumnos = params;
    } else if (params && typeof params === 'object') {
        if ('alumnos' in params || 'alumno' in params) {
            alumnos = params.alumnos || [];
            alumno = params.alumno || null;
            nombreGrupo = params.nombreGrupo || '';
            fechaManual = params.fechaManual || params.fecha_inicio_clases || null;
            cfg = params.cfg || defaultCfg;
        } else {
            alumno = params;
            nombreGrupo = params.grupo_asignado || '';
            fechaManual = params.fecha_inicio_clases || null;
        }
    }

    const list = alumnos && alumnos.length > 0 ? alumnos : (alumno ? [alumno] : []);
    if (list.length === 0) return '';

    const primer = list[0] || {};
    const config = cfg || window.configApp || defaultCfg;
    let template = config.texto_prealta || defaultCfg.texto_prealta || 
`*⚠ PRE ALTA INICIADA*

*👥 DATOS DE LA SUSCRIPCIÓN:*
🔹 Suscripción: {suscripcion} {emojiinstrumento} {instrumento}
🔹 Inicio de clases: {fecha inicio clases}
🔹 Nombre: {nombre}
🔹 Grupo: {grupo}
🔹 Profesor: {profe}`;

    const esGrupo = list.length > 1 || (nombreGrupo && nombreGrupo !== 'Clase Individual' && nombreGrupo !== 'Individual');
    const grpNom = (nombreGrupo && nombreGrupo !== 'Clase Individual') ? nombreGrupo : (primer.grupo_asignado || (esGrupo ? 'Grupo' : 'Clase Individual'));

    // Nombres: Si es 1 alumno -> nombre directo. Si son varios -> Opción A: Viñetas por renglón con instrumento
    let nombreVal = '';
    if (list.length === 1) {
        nombreVal = list[0].nombre || 'Alumno';
    } else {
        nombreVal = list.map(a => {
            const inst = a.instrumento_asignado || (Array.isArray(a.instrumento) ? a.instrumento[0] : (a.instrumento || ''));
            return `\n• ${a.nombre || 'Alumno'}${inst ? ` (${inst})` : ''}`;
        }).join('');
    }

    // Suscripción:
    const suscripcionVal = primer.tipo_suscripcion || primer.modalidad_ensamble || primer.tipo_ensamble || (esGrupo ? 'Ensamble Regular' : 'Clase Individual');

    // Instrumento & Emoji:
    let instVal = '';
    let emojiVal = '';
    if (list.length === 1) {
        instVal = primer.instrumento_asignado || (Array.isArray(primer.instrumento) ? primer.instrumento[0] : (primer.instrumento || ''));
        emojiVal = getEmojiInstrumento(instVal, config);
    } else {
        instVal = primer.tipo_ensamble || primer.modalidad_ensamble || 'Ensambles';
        emojiVal = config?.emoji_guitarra || '🎸';
    }

    // Fecha inicio clases:
    const fInicioVal = formatearFechaInicioClasesAviso(primer, fechaManual);

    // Profe:
    const profeVal = primer.profesor_asignado || primer.reserva_profe_nombre || 'Docente';

    return reemplazarVariables(template, {
        'suscripcion': suscripcionVal,
        'emojiinstrumento': emojiVal,
        'instrumento': instVal,
        'fecha inicio clases': fInicioVal,
        'fecha_inicio_clases': fInicioVal,
        'nombre': nombreVal,
        'grupo': grpNom,
        'profe': profeVal
    });
}

export async function copiarAvisoCoordinadorGrupo(nombreGrupo, alumnosArrOIds) {
    try {
        let miembros = [];
        if (Array.isArray(alumnosArrOIds) && alumnosArrOIds.length > 0) {
            if (typeof alumnosArrOIds[0] === 'object') {
                miembros = alumnosArrOIds;
            } else {
                const ids = alumnosArrOIds;
                const pool = Array.isArray(window.allData) ? window.allData : (Array.isArray(window.ultimosAlumnosCargados) ? window.ultimosAlumnosCargados : []);
                miembros = pool.filter(a => ids.includes(a.id));
                if (miembros.length < ids.length) {
                    for (const id of ids) {
                        if (!miembros.some(m => m.id === id)) {
                            const snap = await getDoc(doc(db, "alumnos", id));
                            if (snap.exists()) miembros.push({ id: snap.id, ...snap.data() });
                        }
                    }
                }
            }
        } else if (nombreGrupo) {
            const pool = Array.isArray(window.allData) ? window.allData : (Array.isArray(window.ultimosAlumnosCargados) ? window.ultimosAlumnosCargados : []);
            miembros = pool.filter(a => (a.grupo_asignado || '').trim() === nombreGrupo.trim());
            if (miembros.length === 0) {
                const qSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", nombreGrupo)));
                qSnap.forEach(d => miembros.push({ id: d.id, ...d.data() }));
            }
        }

        if (miembros.length === 0) {
            alert(`No se encontraron alumnos para el grupo "${nombreGrupo}".`);
            return;
        }

        const texto = generarTextoAvisoCoordinadorPrealta({
            alumnos: miembros,
            nombreGrupo: nombreGrupo,
            cfg: window.configApp || defaultCfg
        });

        await navigator.clipboard.writeText(texto);
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(`💬 ¡Texto de Pre-Alta para el Coordinador copiado al portapapeles!`, 'info');
        } else {
            alert(`💬 ¡Texto de Pre-Alta para el Coordinador copiado al portapapeles!`);
        }
        return texto;
    } catch(err) {
        console.error("Error al copiar aviso coordinador grupo:", err);
        alert("No se pudo copiar al portapapeles: " + err.message);
    }
}

export async function copiarAvisoCoordinadorAlumno(alumnoIdOAlumno) {
    try {
        let al = null;
        if (typeof alumnoIdOAlumno === 'object' && alumnoIdOAlumno !== null) {
            al = alumnoIdOAlumno;
        } else {
            const id = alumnoIdOAlumno;
            const pool = Array.isArray(window.allData) ? window.allData : [];
            al = pool.find(a => a.id === id);
            if (!al) {
                const snap = await getDoc(doc(db, "alumnos", id));
                if (snap.exists()) al = { id: snap.id, ...snap.data() };
            }
        }

        if (!al) {
            alert("No se encontró el registro del alumno.");
            return;
        }

        const texto = generarTextoAvisoCoordinadorPrealta({
            alumno: al,
            nombreGrupo: al.grupo_asignado || '',
            cfg: window.configApp || defaultCfg
        });

        await navigator.clipboard.writeText(texto);
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(`💬 ¡Texto de Pre-Alta para Coordinador (${al.nombre || 'Alumno'}) copiado!`, 'info');
        } else {
            alert(`💬 ¡Texto de Pre-Alta para Coordinador (${al.nombre || 'Alumno'}) copiado!`);
        }
        return texto;
    } catch(err) {
        console.error("Error al copiar aviso coordinador alumno:", err);
        alert("No se pudo copiar al portapapeles: " + err.message);
    }
}

// Window Global Bindings
window.generarFilaExcelBD = generarFilaExcelBD;
window.generarFilaExcelFacturacion = generarFilaExcelFacturacion;
window.copiarFilaExcelBD = copiarFilaExcelBD;
window.copiarFilaExcelFacturacion = copiarFilaExcelFacturacion;
window.copiarSeleccionExcelBD = copiarSeleccionExcelBD;
window.copiarSeleccionExcelFacturacion = copiarSeleccionExcelFacturacion;
window.renderAltasAgrupadas = renderAltasAgrupadas;
window.aprobarTodoGrupoAction = aprobarTodoGrupoAction;
window.confirmarInicioGrupoAction = confirmarInicioGrupoAction;
window.confirmarAlumnoAltaAction = confirmarAlumnoAltaAction;
window.generarChecklistAltaHtml = generarChecklistAltaHtml;
window.generarTextoAvisoAdmisorPrealta = generarTextoAvisoAdmisorPrealta;
window.copiarAvisoAdmisorGrupo = copiarAvisoAdmisorGrupo;
window.copiarAvisoAdmisorAlumno = copiarAvisoAdmisorAlumno;
window.generarTextoAvisoCoordinadorPrealta = generarTextoAvisoCoordinadorPrealta;
window.copiarAvisoCoordinadorGrupo = copiarAvisoCoordinadorGrupo;
window.copiarAvisoCoordinadorAlumno = copiarAvisoCoordinadorAlumno;