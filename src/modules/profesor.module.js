// =======================================================================
// src/modules/profesor.module.js — Portal Docente "Mis Alumnos y Ensambles"
// =======================================================================

import {
    db,
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where
} from "../config/firebase.js";
import { 
    getEventosCalendario, 
    reprogramarClaseCalendar,
    eliminarEventoAltaSeguro,
    eliminarEventoSeguro,
    formatearFechaAmi,
    formatoLocalISO
} from "../services/calendar.service.js";
import {
    renderContenedorDisponibilidad,
    poblarDisponibilidadMultiRango,
    extraerDisponibilidadMultiRango
} from "../ui/horarios.ui.js";

function isoToDatetimeLocal(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr).substring(0, 16);
    return formatoLocalISO(d).substring(0, 16);
}

/**
 * Formatea el nombre de grupo o clase según la regla de nomenclatura:
 * - Si minutos === '00' -> DHH Profe (ej: X17 Nacho)
 * - Si minutos !== '00' -> DHH.MM Profe (ej: M18.30 Guido)
 */
export function formatearNomenclaturaGrupoOClase(diaCod, horaStr, profeNombre) {
    if (!diaCod || !horaStr) return '';
    const [hRaw, mRaw] = horaStr.split(':');
    const h = parseInt(hRaw, 10);
    const m = mRaw || '00';
    const horaFormatted = (m === '00') ? `${h}` : `${h}.${m}`;
    const profe = (profeNombre || '').trim().split(' ')[0] || 'Profe';
    return `${diaCod.toUpperCase()}${horaFormatted} ${profe}`;
}

/**
 * Parsea el nombre del grupo (DHH.MM Profe o DHH Profe) para extraer día, horario y docente.
 */
export function parsearNomenclaturaGrupoOClase(nombreStr, duracionMin = 60) {
    const match = (nombreStr || '').trim().match(/^([LMXJVSD])(\d{1,2})(?:\.(\d{2}))?\s*(.*)$/i);
    if (!match) return null;
    const diaCod = match[1].toUpperCase();
    const h = parseInt(match[2], 10);
    const m = match[3] ? parseInt(match[3], 10) : 0;
    const profe = match[4] ? match[4].trim() : '';
    const hIniStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    const totalMinIni = h * 60 + m;
    const totalMinFin = totalMinIni + (duracionMin || 60);
    const hFin = Math.floor(totalMinFin / 60) % 24;
    const mFin = totalMinFin % 60;
    const hFinStr = `${hFin.toString().padStart(2, '0')}:${mFin.toString().padStart(2, '0')}`;
    
    const mapaDias = { 'L': 'Lunes', 'M': 'Martes', 'X': 'Miércoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sábado', 'D': 'Domingo' };
    return {
        diaCod,
        diaNombre: mapaDias[diaCod] || diaCod,
        horaInicio: hIniStr,
        horaFin: hFinStr,
        horarioTexto: `${mapaDias[diaCod] || diaCod} ${hIniStr} a ${hFinStr} hs`,
        profeNombre: profe,
        duracionMin: duracionMin || 60
    };
}

let cachedProfesorDoc = null;
let slotsLibresCache = [];

export function getEmojiParaInstrumento(inst) {
    if (!inst) return '🎵';
    const s = (Array.isArray(inst) ? inst.join(' ') : String(inst)).toLowerCase();
    if (s.includes('bat')) return '🥁';
    if (s.includes('baj')) return '🎸';
    if (s.includes('gui') || s.includes('electr') || s.includes('acúst') || s.includes('acust')) return '🎸';
    if (s.includes('cajón') || s.includes('cajon') || s.includes('perc')) return '📦';
    if (s.includes('cant') || s.includes('voz') || s.includes('vocal') || s.includes('coro')) return '🎤';
    if (s.includes('pian') || s.includes('tecl')) return '🎹';
    if (s.includes('sax') || s.includes('vient')) return '🎷';
    if (s.includes('tromp')) return '🎺';
    if (s.includes('viol')) return '🎻';
    if (s.includes('ukel') || s.includes('ucu')) return '🪕';
    return '🎵';
}

/**
 * Calcula los huecos libres en la agenda del profesor entre Lunes y Sábado,
 * contrastando su disponibilidad semanal contra eventos reales de Google Calendar.
 */
export async function obtenerHorariosLibresDocente(profesorDoc, duracionMinutos = 90) {
    const mapaDias = { 'L': 'Lunes', 'M': 'Martes', 'X': 'Miércoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sábado' };
    const diasOrden = ['L', 'M', 'X', 'J', 'V', 'S'];
    const durMs = duracionMinutos * 60 * 1000;
    const pasoMs = 30 * 60 * 1000;

    let eventosAPI = [];
    if (profesorDoc && profesorDoc.correo_calendario) {
        try {
            const dStart = new Date();
            const dEnd = new Date();
            dEnd.setDate(dEnd.getDate() + 14); // 2 semanas
            const evData = await getEventosCalendario(profesorDoc.correo_calendario, dStart.toISOString(), dEnd.toISOString());
            if (evData && Array.isArray(evData.items)) {
                eventosAPI = evData.items;
            }
        } catch(e) {
            console.warn("No se pudieron cargar eventos de Google Calendar:", e);
        }
    }

    const disp = (profesorDoc && profesorDoc.disponibilidad) || {};
    const slotsLibres = [];

    // Tomamos una semana de referencia (próximo Lunes a Sábado)
    const baseDate = new Date();
    const diffToMonday = (1 + 7 - baseDate.getDay()) % 7 || 7;
    const refMonday = new Date(baseDate);
    refMonday.setDate(baseDate.getDate() + diffToMonday);
    refMonday.setHours(0,0,0,0);

    diasOrden.forEach((diaCod, idxDia) => {
        const rangos = disp[diaCod];
        if (!Array.isArray(rangos) || rangos.length === 0) return;

        const diaDate = new Date(refMonday);
        diaDate.setDate(refMonday.getDate() + idxDia);

        rangos.forEach(r => {
            if (!r.inicio || !r.fin) return;
            const [hIni, mIni] = r.inicio.split(':').map(Number);
            const [hFin, mFin] = r.fin.split(':').map(Number);

            let tIni = new Date(diaDate);
            tIni.setHours(hIni, mIni, 0, 0);

            const tFinLimite = new Date(diaDate);
            tFinLimite.setHours(hFin, mFin, 0, 0);

            while (tIni.getTime() + durMs <= tFinLimite.getTime()) {
                const inMs = tIni.getTime();
                const outMs = inMs + durMs;

                let solapa = false;
                let pegado = false;

                eventosAPI.forEach(ev => {
                    if (!ev.start || !ev.start.dateTime) return;
                    const evS = new Date(ev.start.dateTime).getTime();
                    const evE = new Date(ev.end.dateTime).getTime();

                    if (inMs < evE && outMs > evS) {
                        solapa = true;
                    }

                    if (Math.abs(evE - inMs) <= 5 * 60 * 1000 || Math.abs(evS - outMs) <= 5 * 60 * 1000) {
                        pegado = true;
                    }
                });

                if (!solapa) {
                    const horaIniStr = `${tIni.getHours().toString().padStart(2,'0')}:${tIni.getMinutes().toString().padStart(2,'0')}`;
                    const tOutDate = new Date(outMs);
                    const horaFinStr = `${tOutDate.getHours().toString().padStart(2,'0')}:${tOutDate.getMinutes().toString().padStart(2,'0')}`;
                    const texto = `${mapaDias[diaCod]} ${horaIniStr} a ${horaFinStr} hs`;

                    slotsLibres.push({
                        dia: diaCod,
                        diaNombre: mapaDias[diaCod],
                        horaInicio: horaIniStr,
                        horaFin: horaFinStr,
                        horarioTexto: `${mapaDias[diaCod]} ${horaIniStr} a ${horaFinStr}`,
                        texto: texto,
                        pegado: pegado
                    });
                }

                tIni.setTime(tIni.getTime() + pasoMs);
            }
        });
    });

    // Ordenar: primero los pegados/recomendados, luego por orden de día y hora
    slotsLibres.sort((a, b) => {
        if (a.pegado !== b.pegado) return b.pegado ? 1 : -1;
        const oA = diasOrden.indexOf(a.dia);
        const oB = diasOrden.indexOf(b.dia);
        if (oA !== oB) return oA - oB;
        return a.horaInicio.localeCompare(b.horaInicio);
    });

    return slotsLibres;
}

function setupNivelesChipsListeners() {
    const cont = document.getElementById('sol-vac-niveles-container');
    if (!cont || cont.dataset.listenersAttached === 'true') return;
    cont.dataset.listenersAttached = 'true';

    cont.querySelectorAll('.btn-chip-nivel').forEach(btn => {
        btn.addEventListener('click', () => {
            const nivel = btn.getAttribute('data-nivel');
            if (nivel === 'Cualquiera') {
                cont.querySelectorAll('.btn-chip-nivel').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = '#fff';
                    b.style.color = 'var(--text-main)';
                    b.style.borderColor = 'var(--border-color)';
                });
                btn.classList.add('active');
                btn.style.background = 'var(--accent-teal)';
                btn.style.color = '#fff';
                btn.style.borderColor = 'var(--accent-teal)';
            } else {
                const btnCualq = cont.querySelector('.btn-chip-nivel[data-nivel="Cualquiera"]');
                if (btnCualq) {
                    btnCualq.classList.remove('active');
                    btnCualq.style.background = '#fff';
                    btnCualq.style.color = 'var(--text-main)';
                    btnCualq.style.borderColor = 'var(--border-color)';
                }

                btn.classList.toggle('active');
                if (btn.classList.contains('active')) {
                    btn.style.background = 'var(--accent-teal)';
                    btn.style.color = '#fff';
                    btn.style.borderColor = 'var(--accent-teal)';
                } else {
                    btn.style.background = '#fff';
                    btn.style.color = 'var(--text-main)';
                    btn.style.borderColor = 'var(--border-color)';
                }

                const activos = cont.querySelectorAll('.btn-chip-nivel.active');
                if (activos.length === 0 && btnCualq) {
                    btnCualq.classList.add('active');
                    btnCualq.style.background = 'var(--accent-teal)';
                    btnCualq.style.color = '#fff';
                    btnCualq.style.borderColor = 'var(--accent-teal)';
                }
            }
        });
    });
}

function resetNivelesChips() {
    setupNivelesChipsListeners();
    const cont = document.getElementById('sol-vac-niveles-container');
    if (!cont) return;
    cont.querySelectorAll('.btn-chip-nivel').forEach(b => {
        const esCualquiera = b.getAttribute('data-nivel') === 'Cualquiera';
        if (esCualquiera) {
            b.classList.add('active');
            b.style.background = 'var(--accent-teal)';
            b.style.color = '#fff';
            b.style.borderColor = 'var(--accent-teal)';
        } else {
            b.classList.remove('active');
            b.style.background = '#fff';
            b.style.color = 'var(--text-main)';
            b.style.borderColor = 'var(--border-color)';
        }
    });
}
const resetearNivelesChips = resetNivelesChips;

function obtenerNivelesSeleccionados() {
    const cont = document.getElementById('sol-vac-niveles-container');
    if (!cont) return ['Cualquiera'];
    const activos = Array.from(cont.querySelectorAll('.btn-chip-nivel.active')).map(b => b.getAttribute('data-nivel'));
    return activos.length > 0 ? activos : ['Cualquiera'];
}

async function poblarInstrumentosChips(instrumentoPre = '') {
    const cont = document.getElementById('sol-vac-instrumentos-container');
    if (!cont) return;
    cont.innerHTML = '<span style="color:var(--text-muted); font-size:12px;">Cargando instrumentos...</span>';

    try {
        const iSnap = await getDocs(collection(db, "instrumentos"));
        const insts = [];
        iSnap.forEach(d => insts.push(d.data().nombre || d.id));

        let html = '';
        insts.forEach(inst => {
            const isPre = (instrumentoPre && instrumentoPre.toLowerCase().includes(inst.toLowerCase()));
            const bg = isPre ? 'var(--accent-teal)' : '#fff';
            const col = isPre ? '#fff' : 'var(--text-main)';
            const border = isPre ? 'var(--accent-teal)' : 'var(--border-color)';
            const emoji = getEmojiParaInstrumento(inst);
            html += `
                <button type="button" class="btn-chip-instrumento ${isPre ? 'active' : ''}" data-inst="${inst}" style="padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600; border:1px solid ${border}; background:${bg}; color:${col}; cursor:pointer;">
                    ${emoji} ${inst}
                </button>
            `;
        });
        cont.innerHTML = html;

        cont.querySelectorAll('.btn-chip-instrumento').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                if (btn.classList.contains('active')) {
                    btn.style.background = 'var(--accent-teal)';
                    btn.style.color = '#fff';
                    btn.style.borderColor = 'var(--accent-teal)';
                } else {
                    btn.style.background = '#fff';
                    btn.style.color = 'var(--text-main)';
                    btn.style.borderColor = 'var(--border-color)';
                }
            });
        });
    } catch(e) {
        cont.innerHTML = '<span style="color:var(--accent-red); font-size:12px;">Error al cargar instrumentos.</span>';
    }
}

function obtenerInstrumentosSeleccionados() {
    const cont = document.getElementById('sol-vac-instrumentos-container');
    if (!cont) return [];
    return Array.from(cont.querySelectorAll('.btn-chip-instrumento.active')).map(b => b.getAttribute('data-inst'));
}

export function actualizarBotonesTipoGrupo(tipoGrp) {
    tipoGrupoSeleccionadoModal = tipoGrp;
    const modal = document.getElementById('modal-solicitar-vacante');
    if (!modal) return;

    modal.querySelectorAll('.btn-sol-tipo-grupo').forEach(btn => {
        const esEste = btn.getAttribute('data-tipo') === tipoGrp;
        btn.classList.toggle('active', esEste);
        btn.style.background = esEste ? 'var(--accent-teal)' : '#fff';
        btn.style.borderColor = esEste ? 'var(--accent-teal)' : 'var(--border-color)';
        btn.style.color = esEste ? '#fff' : 'var(--text-main)';

        const sub = btn.querySelector('.btn-sol-subtexto') || btn.querySelector('span');
        if (sub) {
            if (esEste) {
                sub.style.color = '#ffffff';
                sub.style.opacity = '0.95';
            } else if (btn.getAttribute('data-tipo') === 'Ensamble Mandalorian') {
                sub.style.color = '#9333ea';
                sub.style.opacity = '1';
            } else {
                sub.style.color = 'var(--text-muted)';
                sub.style.opacity = '1';
            }
        }
    });

    const inpDurMin = document.getElementById('sol-vac-duracion-min');
    const inpDurTexto = document.getElementById('sol-vac-duracion-texto');
    const dur = (tipoGrp === 'Ensamble Mandalorian') ? 90 : 60;
    if (inpDurMin) inpDurMin.value = dur.toString();
    if (inpDurTexto) inpDurTexto.value = dur === 90 ? '90 min (1.5h)' : `${dur} min`;
}

let tipoGrupoSeleccionadoModal = 'Clase Grupal';

export function setupModalSolicitarVacanteListeners() {
    const modal = document.getElementById('modal-solicitar-vacante');
    if (!modal || modal.dataset.listenersAttached === 'true') return;
    modal.dataset.listenersAttached = 'true';

    const selDiaModal = document.getElementById('sol-vac-dia-sel');
    const inpHoraModal = document.getElementById('sol-vac-hora-sel');
    const inpNombreModal = document.getElementById('sol-vac-nombre-input');
    const lblNombreModal = document.getElementById('sol-vac-nombre-label');
    const inpDurTexto = document.getElementById('sol-vac-duracion-texto');
    const inpDurMin = document.getElementById('sol-vac-duracion-min');
    const secTipoGrupo = document.getElementById('sol-vac-sec-tipo-grupo');
    const rModInd = document.getElementById('sol-vac-mod-ind');
    const rModGrp = document.getElementById('sol-vac-mod-grp');
    const lblModInd = document.getElementById('sol-vac-lbl-ind');
    const lblModGrp = document.getElementById('sol-vac-lbl-grp');

    const recalcularNombreModal = () => {
        const dia = selDiaModal ? selDiaModal.value : 'M';
        const hora = inpHoraModal ? inpHoraModal.value : '18:30';
        const profeNom = document.getElementById('sol-vac-profe-nombre')?.value || 'Profe';
        const nombreGenerado = formatearNomenclaturaGrupoOClase(dia, hora, profeNom);
        if (inpNombreModal) inpNombreModal.value = nombreGenerado;
    };

    const actualizarEstilosModalidad = (esIndividual) => {
        if (esIndividual) {
            if (secTipoGrupo) secTipoGrupo.style.display = 'none';
            if (inpDurMin) inpDurMin.value = '60';
            if (inpDurTexto) inpDurTexto.value = '60 min';
            if (lblNombreModal) {
                lblNombreModal.innerHTML = '<span>NOMBRE DE LA CLASE</span><span style="font-size:10.5px; text-transform:none; font-weight:500; color:var(--accent-teal);">Auto-generado (editable)</span>';
            }
            if (lblModInd) {
                lblModInd.style.borderColor = 'var(--accent-teal)';
                lblModInd.style.background = 'rgba(0,123,143,0.06)';
            }
            if (lblModGrp) {
                lblModGrp.style.borderColor = 'var(--border-color)';
                lblModGrp.style.background = 'var(--card-bg)';
            }
        } else {
            if (secTipoGrupo) secTipoGrupo.style.display = 'block';
            if (lblNombreModal) {
                lblNombreModal.innerHTML = '<span>NOMBRE DEL GRUPO</span><span style="font-size:10.5px; text-transform:none; font-weight:500; color:var(--accent-teal);">Auto-generado (editable)</span>';
            }
            if (lblModGrp) {
                lblModGrp.style.borderColor = 'var(--accent-teal)';
                lblModGrp.style.background = 'rgba(0,123,143,0.06)';
            }
            if (lblModInd) {
                lblModInd.style.borderColor = 'var(--border-color)';
                lblModInd.style.background = 'var(--card-bg)';
            }
            actualizarBotonesTipoGrupo(tipoGrupoSeleccionadoModal);
        }
        recalcularNombreModal();
    };

    rModInd?.addEventListener('change', () => actualizarEstilosModalidad(true));
    rModGrp?.addEventListener('change', () => actualizarEstilosModalidad(false));

    selDiaModal?.addEventListener('change', recalcularNombreModal);
    inpHoraModal?.addEventListener('change', recalcularNombreModal);

    modal.querySelectorAll('.btn-sol-tipo-grupo').forEach(b => {
        b.addEventListener('click', () => {
            const tipo = b.getAttribute('data-tipo') || 'Clase Grupal';
            actualizarBotonesTipoGrupo(tipo);
            recalcularNombreModal();
        });
    });

    // Botón Cancelar/Cerrar
    modal.querySelectorAll('.btn-cerrar-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.close());
    });

    // Al cerrar el modal, resetear estado del botón para que nunca quede en "Enviando..."
    modal.addEventListener('close', () => {
        const btnG = document.getElementById('btn-guardar-solicitar-vacante');
        if (btnG) {
            btnG.disabled = false;
            btnG.textContent = 'Enviar Solicitud';
        }
    });

    // Botón Eliminar Solicitud
    const btnEliminar = document.getElementById('btn-eliminar-solicitar-vacante');
    btnEliminar?.addEventListener('click', async () => {
        const solId = document.getElementById('sol-vac-id')?.value;
        const nombreGrupo = document.getElementById('sol-vac-nombre-input')?.value || '';
        if (!solId) return;
        await eliminarSolicitudVacanteDirecto(solId, nombreGrupo, async () => {
            modal.close();
            if (typeof window._onSolicitudVacanteSaved === 'function') {
                await window._onSolicitudVacanteSaved();
            }
        });
    });

    // Botón Guardar / Enviar Solicitud
    const btnGuardarSol = document.getElementById('btn-guardar-solicitar-vacante');
    btnGuardarSol?.addEventListener('click', async (e) => {
        e.preventDefault();
        const solId = document.getElementById('sol-vac-id')?.value || '';
        const textoOriginal = solId ? '💾 Guardar Cambios' : 'Enviar Solicitud';
        const pId = document.getElementById('sol-vac-profe-id')?.value || '';
        const pNom = document.getElementById('sol-vac-profe-nombre')?.value || 'Docente';
        const pEmail = document.getElementById('sol-vac-profe-email')?.value || '';
        const modalidad = document.querySelector('input[name="sol-vac-modalidad"]:checked')?.value || 'grupo';
        const durMin = parseInt(document.getElementById('sol-vac-duracion-min')?.value || '60', 10);
        const diaCod = selDiaModal ? selDiaModal.value : 'M';
        const horaInicio = inpHoraModal ? inpHoraModal.value : '18:30';
        const nombreGrupo = inpNombreModal ? inpNombreModal.value.trim() : '';

        if (!nombreGrupo) {
            return alert("Por favor ingresa un nombre para la clase o grupo.");
        }

        const instrumentos = obtenerInstrumentosSeleccionados();
        if (instrumentos.length === 0) {
            return alert("Por favor selecciona al menos un instrumento buscado.");
        }

        const niveles = obtenerNivelesSeleccionados();
        const obs = document.getElementById('sol-vac-obs')?.value.trim() || '';

        const edadMinVal = parseInt(document.getElementById('sol-vac-edad-min')?.value, 10);
        const edadMaxVal = parseInt(document.getElementById('sol-vac-edad-max')?.value, 10);
        const edadMin = (!isNaN(edadMinVal) && edadMinVal > 0) ? edadMinVal : null;
        const edadMax = (!isNaN(edadMaxVal) && edadMaxVal > 0) ? edadMaxVal : null;
        const rangoEdadTexto = (edadMin && edadMax) 
            ? `${edadMin} a ${edadMax} años` 
            : (edadMin ? `Desde ${edadMin} años` : (edadMax ? `Hasta ${edadMax} años` : ''));

        const parsed = parsearNomenclaturaGrupoOClase(nombreGrupo, durMin);
        const horarioTexto = parsed ? parsed.horarioTexto : `${diaCod} ${horaInicio} hs`;
        const tipoGrupo = (modalidad === 'individual') ? 'Clase Individual' : tipoGrupoSeleccionadoModal;

        btnGuardarSol.disabled = true;
        btnGuardarSol.textContent = 'Guardando...';

        try {
            const payload = {
                profesorId: pId,
                profesorNombre: pNom,
                profesorEmail: pEmail,
                modalidad: modalidad,
                tipoGrupo: tipoGrupo,
                duracionMinutos: durMin,
                grupoNombre: nombreGrupo,
                diaCod: parsed ? parsed.diaCod : diaCod,
                diaNombre: parsed ? parsed.diaNombre : '',
                horaInicio: parsed ? parsed.horaInicio : horaInicio,
                horaFin: parsed ? parsed.horaFin : '',
                horario: horarioTexto,
                instrumento: instrumentos.join(', '),
                instrumentosArray: instrumentos,
                nivel: niveles.join(', '),
                nivelesArray: niveles,
                edadMin: edadMin,
                edadMax: edadMax,
                rangoEdadTexto: rangoEdadTexto,
                observaciones: obs
            };

            if (solId) {
                await updateDoc(doc(db, "solicitudes_vacantes", solId), {
                    ...payload,
                    fechaActualizacion: new Date().toISOString()
                });
                alert(`✅ Solicitud "${nombreGrupo}" actualizada con éxito.`);
            } else {
                await addDoc(collection(db, "solicitudes_vacantes"), {
                    ...payload,
                    estado: "Pendiente",
                    fechaCreacion: new Date().toISOString()
                });
                alert(`✅ Solicitud para "${nombreGrupo}" enviada con éxito a Coordinación.`);
            }

            modal.close();
            btnGuardarSol.disabled = false;
            btnGuardarSol.textContent = 'Enviar Solicitud';

            if (typeof window._onSolicitudVacanteSaved === 'function') {
                await window._onSolicitudVacanteSaved();
            }
        } catch(err) {
            alert("❌ Error al guardar solicitud: " + err.message);
        } finally {
            btnGuardarSol.disabled = false;
            btnGuardarSol.textContent = 'Enviar Solicitud';
        }
    });
}

export async function abrirModalSolicitudVacante(solicitudParam = null, onSavedCallback = null) {
    const modal = document.getElementById('modal-solicitar-vacante');
    if (!modal) return;

    setupModalSolicitarVacanteListeners();

    let sol = null;
    if (typeof solicitudParam === 'string' && solicitudParam.trim()) {
        try {
            const dSnap = await getDoc(doc(db, "solicitudes_vacantes", solicitudParam));
            if (dSnap.exists()) sol = { id: dSnap.id, ...dSnap.data() };
        } catch(e) {
            console.error("Error al cargar solicitud:", e);
        }
    } else if (solicitudParam && typeof solicitudParam === 'object') {
        sol = solicitudParam;
    }

    const inpId = document.getElementById('sol-vac-id');
    const txtTitulo = document.getElementById('sol-vac-modal-titulo');
    const txtSubtitulo = document.getElementById('sol-vac-modal-subtitulo');
    const btnGuardar = document.getElementById('btn-guardar-solicitar-vacante');
    const btnEliminar = document.getElementById('btn-eliminar-solicitar-vacante');

    const inpProfeId = document.getElementById('sol-vac-profe-id');
    const inpProfeNom = document.getElementById('sol-vac-profe-nombre');
    const inpProfeEmail = document.getElementById('sol-vac-profe-email');

    const rModInd = document.getElementById('sol-vac-mod-ind');
    const rModGrp = document.getElementById('sol-vac-mod-grp');
    const secTipoGrupo = document.getElementById('sol-vac-sec-tipo-grupo');
    const lblNombre = document.getElementById('sol-vac-nombre-label');
    const inpNombreModal = document.getElementById('sol-vac-nombre-input');
    const selDiaModal = document.getElementById('sol-vac-dia-sel');
    const inpHoraModal = document.getElementById('sol-vac-hora-sel');
    const inpDurMin = document.getElementById('sol-vac-duracion-min');
    const inpDurTexto = document.getElementById('sol-vac-duracion-texto');
    const inpObs = document.getElementById('sol-vac-obs');

    window._onSolicitudVacanteSaved = onSavedCallback;

    if (sol && sol.id) {
        // MODO EDICIÓN
        if (inpId) inpId.value = sol.id;
        if (txtTitulo) txtTitulo.textContent = '✏️ Editar Solicitud de Vacante';
        if (txtSubtitulo) txtSubtitulo.textContent = `Modificá los datos o elimina la solicitud para ${sol.grupoNombre || 'el grupo'}.`;
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.textContent = '💾 Guardar Cambios';
        }
        if (btnEliminar) btnEliminar.style.display = 'inline-flex';

        if (inpProfeId) inpProfeId.value = sol.profesorId || '';
        if (inpProfeNom) inpProfeNom.value = sol.profesorNombre || '';
        if (inpProfeEmail) inpProfeEmail.value = sol.profesorEmail || '';

        const esInd = sol.modalidad === 'individual' || sol.tipoGrupo === 'Clase Individual';
        if (rModInd && rModGrp) {
            rModInd.checked = esInd;
            rModGrp.checked = !esInd;
            rModInd.dispatchEvent(new Event('change'));
            rModGrp.dispatchEvent(new Event('change'));
        }

        const tipoGrp = sol.tipoGrupo || (esInd ? 'Clase Individual' : 'Clase Grupal');
        actualizarBotonesTipoGrupo(tipoGrp);

        if (selDiaModal) selDiaModal.value = sol.diaCod || 'M';
        if (inpHoraModal) inpHoraModal.value = sol.horaInicio || '18:30';
        if (inpNombreModal) inpNombreModal.value = sol.grupoNombre || '';
        if (inpObs) inpObs.value = sol.observaciones || '';

        const inpEdadMin = document.getElementById('sol-vac-edad-min');
        const inpEdadMax = document.getElementById('sol-vac-edad-max');
        if (inpEdadMin) inpEdadMin.value = (sol.edadMin !== undefined && sol.edadMin !== null) ? sol.edadMin : '';
        if (inpEdadMax) inpEdadMax.value = (sol.edadMax !== undefined && sol.edadMax !== null) ? sol.edadMax : '';

        const instsPre = sol.instrumentosArray || (sol.instrumento ? sol.instrumento.split(',').map(s => s.trim()) : []);
        await poblarInstrumentosChips(instsPre.join(','));

        setupNivelesChipsListeners();
        const nivelesPre = sol.nivelesArray || (sol.nivel ? sol.nivel.split(',').map(s => s.trim()) : ['Cualquiera']);
        const contNiv = document.getElementById('sol-vac-niveles-container');
        if (contNiv) {
            contNiv.querySelectorAll('.btn-chip-nivel').forEach(b => {
                const niv = b.getAttribute('data-nivel');
                const esActivo = nivelesPre.includes(niv);
                b.classList.toggle('active', esActivo);
                b.style.background = esActivo ? 'var(--accent-teal)' : '#fff';
                b.style.color = esActivo ? '#fff' : 'var(--text-main)';
                b.style.borderColor = esActivo ? 'var(--accent-teal)' : 'var(--border-color)';
            });
        }
    } else {
        // MODO CREACIÓN
        if (inpId) inpId.value = '';
        if (txtTitulo) txtTitulo.textContent = '➕ Solicitar Alumno / Vacante';
        if (txtSubtitulo) txtSubtitulo.textContent = 'Completá los datos para solicitar alumnos a Coordinación.';
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Enviar Solicitud';
        }
        if (btnEliminar) btnEliminar.style.display = 'none';

        const u = window.usuarioActual || {};
        if (inpProfeId) inpProfeId.value = (sol && sol.profesorId) || u.profesor_id || '';
        if (inpProfeNom) inpProfeNom.value = (sol && sol.profesorNombre) || u.nombre || '';
        if (inpProfeEmail) inpProfeEmail.value = (sol && sol.profesorEmail) || u.email || '';

        const inpEdadMin = document.getElementById('sol-vac-edad-min');
        const inpEdadMax = document.getElementById('sol-vac-edad-max');
        if (inpEdadMin) inpEdadMin.value = (sol && sol.edadMin !== undefined && sol.edadMin !== null) ? sol.edadMin : '';
        if (inpEdadMax) inpEdadMax.value = (sol && sol.edadMax !== undefined && sol.edadMax !== null) ? sol.edadMax : '';

        if (rModGrp) {
            rModGrp.checked = true;
            rModGrp.dispatchEvent(new Event('change'));
        }

        actualizarBotonesTipoGrupo('Clase Grupal');

        if (selDiaModal) selDiaModal.value = 'M';
        if (inpHoraModal) inpHoraModal.value = '18:30';

        if (sol && sol.grupoNombre) {
            if (inpNombreModal) inpNombreModal.value = sol.grupoNombre;
            const parsed = parsearNomenclaturaGrupoOClase(sol.grupoNombre);
            if (parsed && selDiaModal) selDiaModal.value = parsed.diaCod;
            if (parsed && inpHoraModal) inpHoraModal.value = parsed.horaInicio;
        } else {
            const profeNom = (sol && sol.profesorNombre) || u.nombre || 'Profe';
            const nombreGenerado = formatearNomenclaturaGrupoOClase('M', '18:30', profeNom);
            if (inpNombreModal) inpNombreModal.value = nombreGenerado;
        }

        if (inpObs) inpObs.value = '';
        await poblarInstrumentosChips();
        resetNivelesChips();
    }

    modal.showModal();
}
window.abrirModalSolicitudVacante = abrirModalSolicitudVacante;

export async function eliminarSolicitudVacanteDirecto(solId, nombreGrupo = '', onDeleted = null) {
    if (!solId) return false;
    const txt = nombreGrupo ? `para "${nombreGrupo}"` : '';
    if (!confirm(`¿Estás seguro de eliminar la solicitud de vacante ${txt}? Esta acción no se puede deshacer.`)) {
        return false;
    }
    try {
        await deleteDoc(doc(db, "solicitudes_vacantes", solId));
        alert(`🗑️ Solicitud ${txt} eliminada con éxito.`);
        if (typeof onDeleted === 'function') await onDeleted();
        return true;
    } catch(err) {
        alert("Error al eliminar solicitud: " + err.message);
        return false;
    }
}
window.eliminarSolicitudVacanteDirecto = eliminarSolicitudVacanteDirecto;

/**
 * Renderiza la vista principal del Portal del Profesor "Mis Alumnos y Ensambles"
 */
export async function renderPortalProfesor(cont, usuarioActual = {}, callbacks = {}) {
    const { setBotonCargando } = callbacks;
    cont.innerHTML = `
        <div style="display:flex; justify-content:center; padding:40px 0;">
            <div class="skeleton-row" style="height:120px; width:100%; max-width:900px; border-radius:12px;"></div>
        </div>
    `;

    try {
        let profesorId = usuarioActual.profesor_id || '';
        let profesorNombre = usuarioActual.nombre || usuarioActual.email || 'Profesor';
        let profesorEmail = (usuarioActual.email || '').toLowerCase();
        let profDocData = null;

        const rolesUsuario = Array.isArray(usuarioActual.roles) && usuarioActual.roles.length > 0
            ? usuarioActual.roles
            : (usuarioActual.rol ? [usuarioActual.rol] : []);

        const puedeCambiarDocente = rolesUsuario.some(r => ['admin', 'coordinador', 'coordinador_grupos', 'admisor', 'admisiones'].includes(String(r).toLowerCase())) ||
            profesorEmail.includes('productora.mandalahouse') ||
            profesorEmail.includes('pbianchino');

        const [profsSnap, usersSnap] = await Promise.all([
            getDocs(collection(db, "profesores")),
            getDocs(collection(db, "usuarios_sistema"))
        ]);

        const emailPorProfeId = {};
        const emailPorNombreDocente = {};
        usersSnap.forEach(d => {
            const u = d.data();
            const uMail = (u.email || '').trim().toLowerCase();
            if (uMail && !uMail.includes('@group.calendar.google.com')) {
                if (u.profesor_id && (!emailPorProfeId[u.profesor_id] || u.activo !== false)) {
                    emailPorProfeId[u.profesor_id] = uMail;
                }
                if (u.nombre) {
                    emailPorNombreDocente[u.nombre.toLowerCase().trim()] = uMail;
                }
            }
        });

        const obtenerEmailHumanoDocente = (pDoc, defaultMail = '') => {
            if (!pDoc) return defaultMail;
            if (emailPorProfeId[pDoc.id]) return emailPorProfeId[pDoc.id];
            if (pDoc.nombre && emailPorNombreDocente[pDoc.nombre.toLowerCase().trim()]) {
                return emailPorNombreDocente[pDoc.nombre.toLowerCase().trim()];
            }
            if (pDoc.email && !pDoc.email.includes('@group.calendar.google.com')) return pDoc.email;
            if (pDoc.correo && !pDoc.correo.includes('@group.calendar.google.com')) return pDoc.correo;
            if (pDoc.correo_calendario && !pDoc.correo_calendario.includes('@group.calendar.google.com')) return pDoc.correo_calendario;
            return defaultMail;
        };

        const todosLosProfes = [];
        profsSnap.forEach(d => {
            const data = d.data();
            if (data.activo !== false && data.estado !== 'inactivo') {
                todosLosProfes.push({ id: d.id, ...data });
            }
        });

        const filtroProfeId = window.filtroDocentePortalId !== undefined ? window.filtroDocentePortalId : (profesorId || '');
        let profeSeleccionado = todosLosProfes.find(p => p.id === filtroProfeId);
        if (!profeSeleccionado && !puedeCambiarDocente && profesorId) {
            profeSeleccionado = todosLosProfes.find(p => p.id === profesorId);
        }

        if (profeSeleccionado) {
            profesorId = profeSeleccionado.id;
            profesorNombre = profeSeleccionado.nombre || profesorNombre;
            profesorEmail = obtenerEmailHumanoDocente(profeSeleccionado, profesorEmail);
            profDocData = profeSeleccionado;
        } else if (puedeCambiarDocente && !filtroProfeId) {
            profesorNombre = "Todos los Profesores";
            profesorEmail = "Vista Global";
            profDocData = null;
        } else if (!puedeCambiarDocente) {
            todosLosProfes.forEach(data => {
                if ((data.correo_calendario && data.correo_calendario.toLowerCase() === profesorEmail) ||
                    (data.nombre && data.nombre.toLowerCase() === (usuarioActual.nombre || '').toLowerCase())) {
                    profesorId = data.id;
                    profesorNombre = data.nombre || profesorNombre;
                    profesorEmail = obtenerEmailHumanoDocente(data, profesorEmail);
                    profDocData = data;
                }
            });
        }

        cachedProfesorDoc = profDocData;

        // 2. Obtener alumnos asignados al docente con altas confirmadas o en curso
        const estadosValidos = ['pre-alta iniciada', 'alta efectiva', 'alta ilegal', 'alta finalizada'];
        const alumnosSnap = await getDocs(collection(db, "alumnos"));
        const misAlumnos = [];

        alumnosSnap.forEach(d => {
            const al = { id: d.id, ...d.data() };
            const estAl = (al.estado_agenda || '').toLowerCase().trim();
            if (!estadosValidos.includes(estAl)) return;

            const profeAl = (al.profesor_asignado || al.reserva_profe_nombre || '').toLowerCase();
            const profeIdAl = al.profesor_id || al.reserva_profe_id || '';
            
            let coincide = false;
            if (profesorId) {
                coincide = (profeIdAl === profesorId) || (profesorNombre && profeAl.includes(profesorNombre.toLowerCase()));
            } else if (puedeCambiarDocente && !filtroProfeId) {
                coincide = true;
            } else {
                coincide = (profesorEmail && profeAl.includes(profesorEmail));
            }

            if (coincide) {
                misAlumnos.push(al);
            }
        });

        // 3. Separar en Ensambles/Grupos vs Clases Individuales
        const gruposMap = {};
        const individualesList = [];

        misAlumnos.forEach(al => {
            const tipoSusc = (al.tipo_suscripcion || '').toLowerCase();
            const grpNom = (al.grupo_asignado || '').trim();
            const esIndividual = tipoSusc.includes('individual') || grpNom === 'Clase Individual' || (!grpNom && !tipoSusc.includes('ensamble') && !tipoSusc.includes('grupal'));

            if (!esIndividual && grpNom) {
                if (!gruposMap[grpNom]) {
                    gruposMap[grpNom] = {
                        nombre: grpNom,
                        alumnos: [],
                        horario: al.horario_match || al.reserva_fecha_texto || (al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : 'Horario a confirmar'),
                        dia: al.dia_match || '',
                        fechaInicio: al.fecha_inicio_clases || '',
                        estado: al.estado_agenda || 'Alta Efectiva'
                    };
                }
                gruposMap[grpNom].alumnos.push(al);
            } else {
                individualesList.push(al);
            }
        });

        // 4. Obtener solicitudes de vacantes del profesor
        const solicitudesSnap = await getDocs(collection(db, "solicitudes_vacantes"));
        const misSolicitudes = [];
        solicitudesSnap.forEach(d => {
            const sol = { id: d.id, ...d.data() };
            if (profesorId) {
                if (sol.profesorId === profesorId || (sol.profesorEmail && sol.profesorEmail.toLowerCase() === (profDocData?.correo_calendario || '').toLowerCase())) {
                    misSolicitudes.push(sol);
                }
            } else if (puedeCambiarDocente && !filtroProfeId) {
                misSolicitudes.push(sol);
            }
        });
        misSolicitudes.sort((a, b) => new Date(b.fechaCreacion || 0) - new Date(a.fechaCreacion || 0));

        // 5. Renderizar Ensambles / Grupos
        const gruposKeys = Object.keys(gruposMap);
        let gruposHtml = '';
        if (gruposKeys.length === 0) {
            gruposHtml = `
                <div style="background:var(--item-bg); border:1px dashed var(--border-color); border-radius:12px; padding:35px 20px; text-align:center; color:var(--text-muted); width:100%;">
                    <div style="font-size:2.2em; margin-bottom:8px;">🎸</div>
                    <div style="font-weight:700; font-size:15px; color:var(--text-main);">No hay ensambles activos asignados actualmente</div>
                    <div style="font-size:13px; margin-top:4px;">Cuando el equipo de admisiones te asigne ensambles o grupos aparecerán aquí.</div>
                </div>
            `;
        } else {
            gruposHtml = gruposKeys.map(grpKey => {
                const grp = gruposMap[grpKey];
                const repPuntual = grp.alumnos.find(a => a.reprogramacion_puntual)?.reprogramacion_puntual;
                const badgeReprogPuntual = repPuntual ? `
                    <div style="background:#fffbeb; border:1px solid #fef3c7; border-left:3px solid #f59e0b; padding:6px 12px; border-radius:6px; font-size:12px; color:#92400e; margin-top:6px; display:flex; align-items:center; gap:6px;">
                        <span>🕒</span>
                        <span><strong>Clase puntual reprogramada:</strong> Se cambió la fecha de <em>${repPuntual.fecha_original_texto}</em> a <strong>${repPuntual.fecha_nueva_texto}</strong>.</span>
                    </div>
                ` : '';

                const integrantesHtml = grp.alumnos.map(al => {
                    const instStr = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'Sin inst.'));
                    const emojiInst = getEmojiParaInstrumento(instStr);
                    const tagPrealta = (al.estado_agenda === 'Pre-alta Iniciada') ? '<span class="status-val-pending" style="font-size:11px;">⏳ Pre-alta</span>' : '<span class="status-val-ok" style="font-size:11px;">✅ Activo</span>';
                    return `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--hover-bg); border-radius:8px; border:1px solid var(--border-color); flex-wrap:wrap; gap:8px;">
                            <div>
                                <strong style="color:var(--text-main); font-size:13.5px;">👤 ${al.nombre} ${al.edad ? `<span style="font-weight:500; color:var(--text-muted);">(${al.edad} años)</span>` : ''}</strong>
                                <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">📱 ${al.celular || 'Sin celular'} • ${al.tipo_suscripcion || 'Ensamble'}</div>
                            </div>
                            <div style="display:flex; gap:6px; align-items:center; margin-left:auto;">
                                ${tagPrealta}
                                <span class="match-student-tag">${emojiInst} ${instStr}</span>
                                ${al.nivel ? `<span class="match-student-tag nivel">${al.nivel}</span>` : ''}
                                <button type="button" class="row-quick-btn secondary btn-ver-ficha-docente" data-id="${al.id}" style="font-size:11.5px; padding:3px 8px; margin-left:4px;" title="Ver ficha del alumno (Solo lectura)">
                                    👁️ Ver Ficha
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="row-item" style="display:flex; flex-direction:column; gap:12px; padding:18px 20px; margin-bottom:12px; border-left:4px solid var(--accent-teal); width:100%;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
                            <div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <h3 style="margin:0; color:var(--text-main); font-size:16px;">🧩 ${grp.nombre}</h3>
                                    <span class="status-val-ok" style="font-size:11px;">👥 ${grp.alumnos.length} Alumnos</span>
                                </div>
                                <div style="font-size:12.5px; color:var(--text-muted); font-weight:600; margin-top:4px;">
                                    📅 Cursada: <strong>${grp.horario}</strong>
                                    ${grp.fechaInicio ? ` • 🚀 Inicio: ${formatearFechaAmi(grp.fechaInicio)}` : ''}
                                </div>
                                ${badgeReprogPuntual}
                            </div>
                            <div class="row-actions-group" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-left:auto; flex-shrink:0;">
                                <button type="button" class="row-quick-btn secondary btn-reprogramar-grupo-docente" data-grupo="${grp.nombre}" data-horario="${grp.horario}" data-inicio="${grp.fechaInicio || ''}" style="font-size:12px;">
                                    📅 Reprogramar Ensamble
                                </button>
                                <button type="button" class="row-quick-btn danger btn-cancelar-grupo-docente" data-grupo="${grp.nombre}" style="font-size:12px;">
                                    🛑 Cancelar Clase
                                </button>
                                <button type="button" class="row-quick-btn primary btn-pedir-vacante-grupo" data-grupo="${grp.nombre}" data-horario="${grp.horario}" style="font-size:12px;">
                                    ➕ Pedir Vacante
                                </button>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
                            ${integrantesHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 6. Renderizar Clases Individuales
        let individualesHtml = '';
        if (individualesList.length === 0) {
            individualesHtml = `
                <div style="background:var(--item-bg); border:1px dashed var(--border-color); border-radius:12px; padding:35px 20px; text-align:center; color:var(--text-muted); width:100%;">
                    <div style="font-size:2.2em; margin-bottom:8px;">👤</div>
                    <div style="font-weight:700; font-size:15px; color:var(--text-main);">No hay alumnos individuales asignados actualmente</div>
                    <div style="font-size:13px; margin-top:4px;">Cuando se confirmen altas individuales para tus instrumentos asignados aparecerán aquí.</div>
                </div>
            `;
        } else {
            individualesHtml = individualesList.map(al => {
                const instStr = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'Sin inst.'));
                const emojiInst = getEmojiParaInstrumento(instStr);
                const horarioStr = al.horario_match || al.reserva_fecha_texto || (al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : 'Horario a confirmar');
                const tagEstado = (al.estado_agenda === 'Pre-alta Iniciada') ? '<span class="status-val-pending" style="font-size:11px;">⏳ Pre-alta</span>' : '<span class="status-val-ok" style="font-size:11px;">✅ Alta Confirmada</span>';

                const repPuntual = al.reprogramacion_puntual;
                const badgeReprogPuntual = repPuntual ? `
                    <div style="background:#fffbeb; border:1px solid #fef3c7; border-left:3px solid #f59e0b; padding:4px 8px; border-radius:6px; font-size:11.5px; color:#92400e; margin-top:4px; display:inline-flex; align-items:center; gap:5px;">
                        <span>🕒</span>
                        <span><strong>Puntual:</strong> ${repPuntual.fecha_original_texto} ➔ <strong>${repPuntual.fecha_nueva_texto}</strong></span>
                    </div>
                ` : '';

                return `
                    <div class="row-item" style="border-left:4px solid #38bdf8; padding:12px 18px; margin-bottom:8px; width:100%;">
                        <div class="row-content-wrapper" style="display:flex; width:100%; gap:15px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
                            
                            <!-- COLUMNA IZQUIERDA: Nombre, Estado y Tags -->
                            <div class="row-header" style="display:flex; align-items:center; gap:12px; flex:1; min-width:260px;">
                                <div class="row-indicator" style="width:8px; height:8px; border-radius:50%; background:#38bdf8; flex-shrink:0;"></div>
                                <div class="row-main-info" style="display:flex; flex-direction:column; align-items:flex-start; text-align:left; gap:3px;">
                                    <div class="row-name" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; text-align:left;">
                                        <strong style="color:var(--text-main); font-size:14.5px;">👤 ${al.nombre}</strong>
                                        ${al.edad ? `<span style="color:var(--text-muted); font-size:12.5px; font-weight:500;">(${al.edad} años)</span>` : ''}
                                        ${tagEstado}
                                    </div>
                                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:2px;">
                                        <span class="match-student-tag">${emojiInst} ${instStr}</span>
                                        ${al.nivel ? `<span class="match-student-tag nivel">${al.nivel}</span>` : ''}
                                        <span style="font-size:12px; color:var(--text-muted); margin-left:4px;">📱 ${al.celular || 'Sin celular'}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- COLUMNA DERECHA / META: Cursada e Inicio -->
                            <div class="row-meta" style="display:flex; flex-direction:column; align-items:flex-start; text-align:left; gap:3px; min-width:240px; font-size:12px; color:var(--text-muted);">
                                <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;"><span>📅 Cursada: <strong style="color:var(--text-main); font-weight:600;">${horarioStr}</strong></span><button type="button" class="btn-auditar-cal-fila" data-id="${al.id}" onclick="event.stopPropagation(); window.auditarCalendarioAlumnoFila('${al.id}', this);" title="Verificar sincronización con Google Calendar" style="background:none; border:none; cursor:pointer; font-size:12px; padding:1px 4px; border-radius:4px; line-height:1; vertical-align:middle; transition:transform 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)'" onmouseout="this.style.background='none'"><span class="icon-spin-fila">🔄</span></button></div>
                                ${al.fecha_inicio_clases ? `<div>🚀 Inicio: <strong style="color:var(--text-main); font-weight:600;">${formatearFechaAmi(al.fecha_inicio_clases)}</strong></div>` : ''}
                                ${badgeReprogPuntual}
                            </div>

                            <!-- COLUMNA ACCIONES: A la derecha -->
                            <div class="row-actions-group" style="display:flex; gap:8px; align-items:center; flex-shrink:0; margin-left:auto;">
                                <button type="button" class="row-quick-btn secondary btn-ver-ficha-docente" data-id="${al.id}" style="font-size:12px;" title="Ver ficha del alumno (Solo lectura)">
                                    👁️ Ver Ficha
                                </button>
                                <button type="button" class="row-quick-btn secondary btn-reprogramar-ind-docente" data-id="${al.id}" data-nombre="${al.nombre}" data-horario="${horarioStr}" data-inicio="${al.fecha_inicio_clases || ''}" style="font-size:12px;">
                                    📅 Reprogramar
                                </button>
                                <button type="button" class="row-quick-btn danger btn-cancelar-ind-docente" data-id="${al.id}" data-nombre="${al.nombre}" style="font-size:12px;">
                                    🛑 Cancelar
                                </button>
                            </div>

                        </div>
                    </div>
                `;
            }).join('');
        }

        // 7. Renderizar Solicitudes de Vacantes
        let solicitudesHtml = '';
        if (misSolicitudes.length === 0) {
            solicitudesHtml = `
                <div style="background:var(--item-bg); border:1px dashed var(--border-color); border-radius:12px; padding:35px 20px; text-align:center; color:var(--text-muted); width:100%; grid-column: 1 / -1;">
                    <div style="font-size:2.2em; margin-bottom:8px;">🔔</div>
                    <div style="font-weight:700; font-size:15px; color:var(--text-main);">No tienes solicitudes de vacantes activas en este momento</div>
                </div>
            `;
        } else {
            solicitudesHtml = misSolicitudes.map(sol => {
                let badgeEstado = '<span class="status-val-pending" style="font-size:11px; font-weight:700;">⏳ Buscando</span>';
                if (sol.estado === 'Cubierta') badgeEstado = `<span class="status-val-ok" style="font-size:11px; font-weight:700;">✅ Asignado ${sol.alumnoAsignadoNombre ? `(${sol.alumnoAsignadoNombre})` : ''}</span>`;
                else if (sol.estado === 'Cancelada') badgeEstado = '<span class="status-val-reject" style="font-size:11px; font-weight:700;">❌ Cancelada</span>';

                const durMin = sol.duracionMinutos || (sol.tipoGrupo === 'Ensamble Mandalorian' ? 90 : 60);
                const durBadge = durMin === 90 
                    ? '<span class="status-badge" style="background:#f3e8ff; color:#7e22ce; font-weight:700; font-size:11px;">⏱️ 90 min (1.5h)</span>'
                    : '<span class="status-badge" style="background:#e0f2fe; color:#0369a1; font-weight:700; font-size:11px;">⏱️ 60 min</span>';

                const edadBadge = (sol.rangoEdadTexto || (sol.edadMin || sol.edadMax)) 
                    ? `<span class="match-chip" style="background:#fdf2f8; color:#be185d; font-size:10.5px; padding:2px 6px; border-radius:6px; font-weight:700;">🎂 ${sol.rangoEdadTexto || (sol.edadMin && sol.edadMax ? `${sol.edadMin}-${sol.edadMax} años` : (sol.edadMin ? `≥ ${sol.edadMin} años` : `≤ ${sol.edadMax} años`))}</span>` 
                    : '';

                const instsArray = sol.instrumentosArray || (sol.instrumento ? sol.instrumento.split(',').map(s => s.trim()) : []);
                const chipsInstHtml = instsArray.map(inst => {
                    return `<span class="match-student-tag" style="font-size:11px; font-weight:600;">🎯 ${inst}</span>`;
                }).join(' ');

                return `
                    <div class="card-solicitud-docente" data-id="${sol.id}" style="cursor:pointer; display:flex; flex-direction:column; justify-content:space-between; padding:16px; border-radius:14px; border:1px solid var(--border-color); background:#ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.04); position:relative; min-height:220px; transition:all 0.2s ease; border-top:4px solid var(--accent-teal);" title="Haz clic en la ficha para editar esta solicitud">
                        <div>
                            <!-- Top: Grupo, Estado y Botón Único Borrar -->
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:10px;">
                                <div>
                                    <div style="font-family:monospace; font-size:16px; font-weight:800; color:var(--accent-teal); line-height:1.2;">${sol.grupoNombre}</div>
                                    <div style="margin-top:4px;">
                                        ${badgeEstado}
                                    </div>
                                </div>
                                <button type="button" class="btn-eliminar-sol-docente" data-id="${sol.id}" data-grupo="${sol.grupoNombre}" title="Eliminar solicitud" style="background:#fee2e2; border:1px solid #fca5a5; color:#dc2626; border-radius:8px; padding:5px 8px; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:background 0.2s;" onclick="event.stopPropagation();">
                                    🗑️
                                </button>
                            </div>

                            <!-- Badges Tipo y Duración -->
                            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
                                <span class="status-badge" style="background:#fef3c7; color:#92400e; font-weight:700; font-size:11px;">${sol.tipoGrupo || 'Grupo'}</span>
                                ${durBadge}
                            </div>

                            <!-- Horario Limpio (sin lapiz ni tacho duplicados) -->
                            <div style="background:#f0fdfa; border:1px solid #ccfbf1; border-radius:8px; padding:7px 10px; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                                <span style="font-size:14px;">📅</span>
                                <span style="font-weight:700; font-size:12.5px; color:var(--accent-teal);">${sol.horario || 'Sin horario'}</span>
                            </div>

                            <!-- Instrumentos, Niveles y Rango de Edad -->
                            <div style="background:#f8fafc; border-radius:8px; padding:8px 10px; font-size:11.5px; display:flex; flex-direction:column; gap:6px;">
                                <div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
                                    ${chipsInstHtml}
                                    <span class="match-student-tag nivel" style="font-size:11px;">📚 ${sol.nivel || 'Cualquiera'}</span>
                                    ${edadBadge}
                                </div>
                                ${sol.notas ? `<div style="color:var(--text-muted); font-size:11px; font-style:italic; border-top:1px solid #e2e8f0; padding-top:4px;">"${sol.notas}"</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Renderizado del Contenedor General a Ancho Completo
        cont.innerHTML = `
            <div style="width:100%; display:flex; flex-direction:column; gap:16px;">
                <!-- Header de bienvenida -->
                <div style="background:white; border:1px solid var(--border-color); border-radius:14px; padding:18px 22px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                    <div>
                        <h2 style="margin:0 0 4px 0; color:var(--text-main); font-size:1.45em; font-weight:800; display:flex; align-items:center; gap:8px;">
                            <span>👨‍🏫 Mis Alumnos y Ensambles</span>
                        </h2>
                        <div style="color:var(--text-muted); font-size:13px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span>Docente: <strong style="color:var(--text-main);">${profesorNombre}</strong> (${profesorEmail}).</span>
                            ${puedeCambiarDocente ? `
                                <div style="display:inline-flex; align-items:center; gap:6px; margin-left:8px; background:var(--hover-bg); padding:3px 8px; border-radius:8px; border:1px solid var(--border-color);">
                                    <span style="font-size:11px; font-weight:700; color:var(--accent-teal);">Ver Docente:</span>
                                    <select id="select-filtro-docente-portal" style="border:none; background:transparent; font-size:12px; font-weight:700; color:var(--text-main); cursor:pointer; outline:none;">
                                        <option value="" ${!filtroProfeId ? 'selected' : ''}>🌐 Todos los Profesores</option>
                                        ${todosLosProfes.map(p => `<option value="${p.id}" ${p.id === filtroProfeId ? 'selected' : ''}>👨‍🏫 ${p.nombre}</option>`).join('')}
                                    </select>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <button type="button" id="btn-solicitar-vacante-general" class="btn-primary" style="padding:8px 14px; font-size:12.5px; display:flex; align-items:center; gap:6px;">
                            ➕ Solicitar Vacante
                        </button>
                        <button type="button" id="btn-crear-casos-prueba-docente" class="row-quick-btn secondary" style="font-size:11.5px; padding:7px 11px;">
                            🧪 Crear Alumnos de Prueba
                        </button>
                        <button type="button" id="btn-limpiar-casos-prueba-docente" class="row-quick-btn danger" style="font-size:11.5px; padding:7px 11px;">
                            🗑️ Limpiar Pruebas
                        </button>
                    </div>
                </div>

                <!-- Tabs de Navegación del Portal Docente -->
                <div style="display:flex; gap:10px; border-bottom:2px solid var(--border-color); padding-bottom:0; flex-wrap:wrap;">
                    <button type="button" id="tab-btn-portal-grupos" class="tab-portal-profe active" style="padding:10px 18px; border:none; background:transparent; font-size:14px; font-weight:700; color:var(--accent-teal); border-bottom:3px solid var(--accent-teal); cursor:pointer; display:flex; align-items:center; gap:8px;">
                        <span>🎸 Mis Ensambles y Grupos</span>
                        <span style="font-size:11.5px; background:#e0f2fe; color:#0369a1; border-radius:10px; padding:1.5px 7px; font-weight:700;">${gruposKeys.length}</span>
                    </button>
                    <button type="button" id="tab-btn-portal-individuales" class="tab-portal-profe" style="padding:10px 18px; border:none; background:transparent; font-size:14px; font-weight:600; color:var(--text-muted); border-bottom:3px solid transparent; cursor:pointer; display:flex; align-items:center; gap:8px;">
                        <span>👤 Mis Clases Individuales</span>
                        <span style="font-size:11.5px; background:#f0fdf4; color:#15803d; border-radius:10px; padding:1.5px 7px; font-weight:700;">${individualesList.length}</span>
                    </button>
                    <button type="button" id="tab-btn-portal-solicitudes" class="tab-portal-profe" style="padding:10px 18px; border:none; background:transparent; font-size:14px; font-weight:600; color:var(--text-muted); border-bottom:3px solid transparent; cursor:pointer; display:flex; align-items:center; gap:8px;">
                        <span>🔔 Mis Solicitudes de Vacantes</span>
                        <span style="font-size:11.5px; background:var(--hover-bg); border:1px solid var(--border-color); color:var(--text-muted); border-radius:10px; padding:1.5px 7px; font-weight:700;">${misSolicitudes.length}</span>
                    </button>
                </div>

                <!-- CONTENIDO TAB 1: GRUPOS Y ENSAMBLES -->
                <div id="tab-content-portal-grupos" class="lista-filas" style="display:flex; flex-direction:column; gap:12px; width:100%;">
                    ${gruposHtml}
                </div>

                <!-- CONTENIDO TAB 2: CLASES INDIVIDUALES -->
                <div id="tab-content-portal-individuales" class="lista-filas" style="display:none; flex-direction:column; gap:10px; width:100%;">
                    ${individualesHtml}
                </div>

                <!-- CONTENIDO TAB 3: SOLICITUDES DE VACANTES (Tarjetas una al lado de la otra) -->
                <div id="tab-content-portal-solicitudes" style="display:none; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px; width:100%; box-sizing:border-box;">
                    ${solicitudesHtml}
                </div>
            </div>
        `;

        // 8. Control de Pestañas
        const btnTabGrupos = document.getElementById('tab-btn-portal-grupos');
        const btnTabInd = document.getElementById('tab-btn-portal-individuales');
        const btnTabSolicitudes = document.getElementById('tab-btn-portal-solicitudes');
        const contentGrupos = document.getElementById('tab-content-portal-grupos');
        const contentInd = document.getElementById('tab-content-portal-individuales');
        const contentSolicitudes = document.getElementById('tab-content-portal-solicitudes');

        const activarTab = (tabActivo, contenidoActivo) => {
            [btnTabGrupos, btnTabInd, btnTabSolicitudes].forEach(b => {
                if (!b) return;
                b.classList.remove('active');
                b.style.color = 'var(--text-muted)';
                b.style.borderBottomColor = 'transparent';
                b.style.fontWeight = '600';
            });
            [contentGrupos, contentInd, contentSolicitudes].forEach(c => {
                if (c) c.style.display = 'none';
            });

            if (tabActivo) {
                tabActivo.classList.add('active');
                tabActivo.style.color = 'var(--accent-teal)';
                tabActivo.style.borderBottomColor = 'var(--accent-teal)';
                tabActivo.style.fontWeight = '700';
            }
            if (contenidoActivo) {
                contenidoActivo.style.display = (contenidoActivo === contentSolicitudes ? 'grid' : 'flex');
            }
        };

        if (btnTabGrupos) btnTabGrupos.addEventListener('click', () => {
            window.tabActivoPortalDocente = 'grupos';
            activarTab(btnTabGrupos, contentGrupos);
        });
        if (btnTabInd) btnTabInd.addEventListener('click', () => {
            window.tabActivoPortalDocente = 'individuales';
            activarTab(btnTabInd, contentInd);
        });
        if (btnTabSolicitudes) btnTabSolicitudes.addEventListener('click', () => {
            window.tabActivoPortalDocente = 'solicitudes';
            activarTab(btnTabSolicitudes, contentSolicitudes);
        });

        // Restaurar pestaña activa guardada
        if (window.tabActivoPortalDocente === 'individuales') {
            activarTab(btnTabInd, contentInd);
        } else if (window.tabActivoPortalDocente === 'solicitudes') {
            activarTab(btnTabSolicitudes, contentSolicitudes);
        } else {
            activarTab(btnTabGrupos, contentGrupos);
        }

        document.getElementById('select-filtro-docente-portal')?.addEventListener('change', async (e) => {
            window.filtroDocentePortalId = e.target.value;
            await renderPortalProfesor(cont, usuarioActual, callbacks);
        });

        // 9. Listeners para Modal Reprogramar Docente
        const abrirModalReprogramar = (tipo, data) => {
            const modal = document.getElementById('modal-reprogramar-docente');
            const infoBox = document.getElementById('reprog-info-box');
            const inputId = document.getElementById('reprog-alumno-id');
            const inputGrupo = document.getElementById('reprog-grupo-nombre');
            const inputEsGrupo = document.getElementById('reprog-es-grupo');
            const inputFecha = document.getElementById('reprog-fecha-inicio');
            const selDur = document.getElementById('reprog-duracion');

            if (!modal || !infoBox) return;

            if (tipo === 'grupo') {
                window.tabActivoPortalDocente = 'grupos';
                inputEsGrupo.value = '1';
                inputGrupo.value = data.grupo;
                inputId.value = '';
                infoBox.innerHTML = `
                    <div style="font-weight:700; color:var(--text-main);">🧩 Ensamble: ${data.grupo}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Cursada actual: <strong>${data.horario || 'No especificada'}</strong></div>
                `;
            } else {
                window.tabActivoPortalDocente = 'individuales';
                inputEsGrupo.value = '0';
                inputId.value = data.id;
                inputGrupo.value = '';
                infoBox.innerHTML = `
                    <div style="font-weight:700; color:var(--text-main);">👤 Alumno: ${data.nombre}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Cursada actual: <strong>${data.horario || 'No especificada'}</strong></div>
                `;
            }

            if (data.inicio) {
                inputFecha.value = isoToDatetimeLocal(data.inicio);
            } else {
                const now = new Date();
                now.setHours(now.getHours() + 24, 0, 0, 0);
                inputFecha.value = isoToDatetimeLocal(now);
            }

            if (selDur) selDur.value = "60";
            modal.showModal();
        };

        cont.querySelectorAll('.btn-reprogramar-grupo-docente').forEach(b => {
            b.addEventListener('click', () => {
                abrirModalReprogramar('grupo', {
                    grupo: b.getAttribute('data-grupo'),
                    horario: b.getAttribute('data-horario'),
                    inicio: b.getAttribute('data-inicio')
                });
            });
        });

        cont.querySelectorAll('.btn-reprogramar-ind-docente').forEach(b => {
            b.addEventListener('click', () => {
                abrirModalReprogramar('individual', {
                    id: b.getAttribute('data-id'),
                    nombre: b.getAttribute('data-nombre'),
                    horario: b.getAttribute('data-horario'),
                    inicio: b.getAttribute('data-inicio')
                });
            });
        });

        // 10. Listeners para Modal Cancelar Docente
        const abrirModalCancelar = (tipo, data) => {
            const modal = document.getElementById('modal-cancelar-docente');
            const infoBox = document.getElementById('canc-info-box');
            const inputId = document.getElementById('canc-alumno-id');
            const inputGrupo = document.getElementById('canc-grupo-nombre');
            const inputEsGrupo = document.getElementById('canc-es-grupo');
            const inputMotivo = document.getElementById('canc-docente-motivo');

            if (!modal || !infoBox) return;

            if (inputMotivo) inputMotivo.value = '';

            if (tipo === 'grupo') {
                window.tabActivoPortalDocente = 'grupos';
                inputEsGrupo.value = '1';
                inputGrupo.value = data.grupo;
                inputId.value = '';
                infoBox.innerHTML = `
                    <div style="font-weight:700; color:var(--accent-red);">🧩 Ensamble: ${data.grupo}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Se cancelará o eliminará el evento asociado en Google Calendar.</div>
                `;
            } else {
                window.tabActivoPortalDocente = 'individuales';
                inputEsGrupo.value = '0';
                inputId.value = data.id;
                inputGrupo.value = '';
                infoBox.innerHTML = `
                    <div style="font-weight:700; color:var(--accent-red);">👤 Alumno: ${data.nombre}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Se cancelará o eliminará la clase de Google Calendar.</div>
                `;
            }
            modal.showModal();
        };

        cont.querySelectorAll('.btn-cancelar-grupo-docente').forEach(b => {
            b.addEventListener('click', () => {
                abrirModalCancelar('grupo', { grupo: b.getAttribute('data-grupo') });
            });
        });

        cont.querySelectorAll('.btn-cancelar-ind-docente').forEach(b => {
            b.addEventListener('click', () => {
                abrirModalCancelar('individual', { id: b.getAttribute('data-id'), nombre: b.getAttribute('data-nombre') });
            });
        });

        // 11. Botones de Casos de Prueba (para productora.mandalahouse@gmail.com)
        document.getElementById('btn-crear-casos-prueba-docente')?.addEventListener('click', async () => {
            if (window.mostrarIndicadorCarga) window.mostrarIndicadorCarga('Creando alumnos de prueba...');
            try {
                const pId = profesorId || 'pablo_docente_test';
                const pNom = profesorNombre || 'Pablo Bianchino';

                const alumnosPrueba = [
                    {
                        nombre: "[TEST] Lucas Benítez",
                        edad: "24",
                        celular: "+54 9 11 4444-1111",
                        instrumento: ["Canto"],
                        instrumento_asignado: "Canto",
                        tipo_suscripcion: "Ensamble",
                        grupo_asignado: "[TEST] Ensamble Rock 90s",
                        profesor_id: pId,
                        profesor_asignado: pNom,
                        reserva_profe_id: pId,
                        reserva_profe_nombre: pNom,
                        estado_agenda: "Alta Efectiva",
                        dia_match: "L",
                        horario_inicio_match: "19:00",
                        horario_fin_match: "20:00",
                        horario_match: "Lunes 19:00 hs",
                        fecha_inicio_clases: new Date(Date.now() + 86400000).toISOString(),
                        es_prueba_docente: true
                    },
                    {
                        nombre: "[TEST] Camila Navarro",
                        edad: "27",
                        celular: "+54 9 11 4444-2222",
                        instrumento: ["Guitarra"],
                        instrumento_asignado: "Guitarra",
                        tipo_suscripcion: "Ensamble",
                        grupo_asignado: "[TEST] Ensamble Rock 90s",
                        profesor_id: pId,
                        profesor_asignado: pNom,
                        reserva_profe_id: pId,
                        reserva_profe_nombre: pNom,
                        estado_agenda: "Alta Efectiva",
                        dia_match: "L",
                        horario_inicio_match: "19:00",
                        horario_fin_match: "20:00",
                        horario_match: "Lunes 19:00 hs",
                        fecha_inicio_clases: new Date(Date.now() + 86400000).toISOString(),
                        es_prueba_docente: true
                    },
                    {
                        nombre: "[TEST] Martín Gómez",
                        edad: "31",
                        celular: "+54 9 11 4444-3333",
                        instrumento: ["Batería"],
                        instrumento_asignado: "Batería",
                        tipo_suscripcion: "Clase Individual",
                        grupo_asignado: "Clase Individual",
                        profesor_id: pId,
                        profesor_asignado: pNom,
                        reserva_profe_id: pId,
                        reserva_profe_nombre: pNom,
                        estado_agenda: "Alta Efectiva",
                        dia_match: "X",
                        horario_inicio_match: "18:00",
                        horario_fin_match: "19:00",
                        horario_match: "Miércoles 18:00 hs",
                        fecha_inicio_clases: new Date(Date.now() + 172800000).toISOString(),
                        es_prueba_docente: true
                    },
                    {
                        nombre: "[TEST] Sofía Herrera",
                        edad: "22",
                        celular: "+54 9 11 4444-4444",
                        instrumento: ["Piano"],
                        instrumento_asignado: "Piano",
                        tipo_suscripcion: "Clase Individual",
                        grupo_asignado: "Clase Individual",
                        profesor_id: pId,
                        profesor_asignado: pNom,
                        reserva_profe_id: pId,
                        reserva_profe_nombre: pNom,
                        estado_agenda: "Pre-alta Iniciada",
                        dia_match: "J",
                        horario_inicio_match: "17:00",
                        horario_fin_match: "18:00",
                        horario_match: "Jueves 17:00 hs",
                        fecha_inicio_clases: new Date(Date.now() + 259200000).toISOString(),
                        es_prueba_docente: true
                    }
                ];

                for (const al of alumnosPrueba) {
                    await addDoc(collection(db, "alumnos"), al);
                }

                if (window.ocultarIndicadorCarga) window.ocultarIndicadorCarga();
                alert("✅ 4 casos de prueba creados (1 Ensamble con 2 alumnos, 1 Individual Activo, 1 Individual Pre-Alta).");
                await renderPortalProfesor(cont, usuarioActual, callbacks);
            } catch(e) {
                if (window.ocultarIndicadorCarga) window.ocultarIndicadorCarga();
                alert("❌ Error al crear pruebas: " + e.message);
            }
        });

        document.getElementById('btn-limpiar-casos-prueba-docente')?.addEventListener('click', async () => {
            const ok = await window.confirmar(
                "🗑️ Eliminar Alumnos de Prueba",
                "¿Confirmás eliminar todos los registros marcados como [TEST] creados para pruebas?",
                "Eliminar Pruebas",
                "⚠️"
            );
            if (!ok) return;

            if (window.mostrarIndicadorCarga) window.mostrarIndicadorCarga('Eliminando datos de prueba...');
            try {
                const snap = await getDocs(collection(db, "alumnos"));
                let count = 0;
                for (const d of snap.docs) {
                    const data = d.data();
                    if (data.es_prueba_docente || (data.nombre && data.nombre.includes('[TEST]')) || (data.grupo_asignado && data.grupo_asignado.includes('[TEST]'))) {
                        await deleteDoc(doc(db, "alumnos", d.id));
                        count++;
                    }
                }
                if (window.ocultarIndicadorCarga) window.ocultarIndicadorCarga();
                alert(`🗑️ ${count} registro(s) de prueba eliminados correctamente.`);
                await renderPortalProfesor(cont, usuarioActual, callbacks);
            } catch(e) {
                if (window.ocultarIndicadorCarga) window.ocultarIndicadorCarga();
                alert("❌ Error al limpiar pruebas: " + e.message);
            }
        });

        // 12. Modal Solicitud de Vacante (Crear, Editar y Eliminar)
        setupModalSolicitarVacanteListeners();

        document.getElementById('btn-solicitar-vacante-general')?.addEventListener('click', () => {
            abrirModalSolicitudVacante(null, () => renderPortalProfesor(cont, usuarioActual, callbacks));
        });

        cont.querySelectorAll('.btn-pedir-vacante-grupo').forEach(b => {
            b.addEventListener('click', () => {
                const grp = b.getAttribute('data-grupo');
                abrirModalSolicitudVacante(grp ? { grupoNombre: grp, profesorId, profesorNombre, profesorEmail } : null, () => renderPortalProfesor(cont, usuarioActual, callbacks));
            });
        });

        // Clic en la tarjeta abre el modal en modo edición
        cont.querySelectorAll('.card-solicitud-docente').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-eliminar-sol-docente')) return;
                const solId = card.getAttribute('data-id');
                const sol = misSolicitudes.find(s => s.id === solId);
                abrirModalSolicitudVacante(sol || solId, () => renderPortalProfesor(cont, usuarioActual, callbacks));
            });
        });

        // Botón único de eliminación
        cont.querySelectorAll('.btn-eliminar-sol-docente').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const solId = btn.getAttribute('data-id');
                const grp = btn.getAttribute('data-grupo');
                eliminarSolicitudVacanteDirecto(solId, grp, () => renderPortalProfesor(cont, usuarioActual, callbacks));
            });
        });

    } catch (err) {
        cont.innerHTML = `<div style="color:var(--accent-red); padding:30px; text-align:center; font-weight:700;">Error al cargar el portal docente: ${err.message}</div>`;
    }
}

// -----------------------------------------------------------------------
// Handlers Globales de Reprogramación y Cancelación del Portal Docente
// -----------------------------------------------------------------------

document.getElementById('btn-confirmar-reprogramar-docente')?.addEventListener('click', async () => {
    const esGrupo = document.getElementById('reprog-es-grupo')?.value === '1';
    const idAlumno = document.getElementById('reprog-alumno-id')?.value;
    const nombreGrupo = document.getElementById('reprog-grupo-nombre')?.value;
    const fechaIniVal = document.getElementById('reprog-fecha-inicio')?.value;
    const durMin = parseInt(document.getElementById('reprog-duracion')?.value || '60', 10);
    const alcance = document.querySelector('input[name="reprog-alcance"]:checked')?.value || 'puntual';

    if (!fechaIniVal) return alert("Selecciona la nueva fecha y hora de inicio.");

    const dStart = new Date(fechaIniVal);
    if (isNaN(dStart.getTime())) return alert("Fecha y hora inválidas.");
    const dEnd = new Date(dStart.getTime() + durMin * 60000);

    const fIsoStart = formatoLocalISO(dStart);
    const fIsoEnd = formatoLocalISO(dEnd);

    const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diasCodigos = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const diaCod = diasCodigos[dStart.getDay()];
    const diaNom = diasNombres[dStart.getDay()];
    const hIniStr = `${dStart.getHours().toString().padStart(2,'0')}:${dStart.getMinutes().toString().padStart(2,'0')}`;
    const hFinStr = `${dEnd.getHours().toString().padStart(2,'0')}:${dEnd.getMinutes().toString().padStart(2,'0')}`;
    const nuevoHorarioTexto = `${diaNom} ${hIniStr} hs`;

    const ok = await window.confirmar(
        "📅 Sincronizar Reprogramación con Google Calendar",
        `Se actualizará la clase en Google Calendar:\n\n• Destino: ${esGrupo ? 'Ensamble ' + nombreGrupo : 'Alumno Individual'}\n• Nueva Fecha/Hora: ${diaNom} ${dStart.getDate()}/${dStart.getMonth()+1} de ${hIniStr} a ${hFinStr} hs (${durMin} min)\n• Alcance: ${alcance === 'recurrente' ? '🔄 Actualizar cursada habitual permanente' : '🕒 Solo esta fecha puntual'}\n\n¿Confirmás sincronizar y guardar?`,
        "Sincronizar y Guardar",
        "📅"
    );
    if (!ok) return;

    if (window.mostrarIndicadorCarga) window.mostrarIndicadorCarga('Sincronizando evento en Google Calendar...');
    try {
        let alumnosAfectados = [];
        if (esGrupo && nombreGrupo) {
            const snap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", nombreGrupo)));
            snap.forEach(d => alumnosAfectados.push({ id: d.id, ...d.data() }));
        } else if (idAlumno) {
            const aDoc = await getDoc(doc(db, "alumnos", idAlumno));
            if (aDoc.exists()) alumnosAfectados.push({ id: aDoc.id, ...aDoc.data() });
        }

        if (alumnosAfectados.length === 0) throw new Error("No se encontraron alumnos para reprogramar.");

        const primerAl = alumnosAfectados[0];
        const resCal = await reprogramarClaseCalendar({
            al: primerAl,
            esGrupo: esGrupo,
            alumnosGrupo: alumnosAfectados,
            fIsoStart: fIsoStart,
            fIsoEnd: fIsoEnd,
            duracionMinutos: durMin
        });

        for (const al of alumnosAfectados) {
            const hist = al.historial || [];
            const horarioAnterior = al.horario_match || `${al.dia_match || ''} ${al.horario_inicio_match || ''}`.trim() || 'Horario previo';

            const updates = {
                historial: hist
            };

            if (alcance === 'recurrente') {
                // Modificación permanente de la cursada
                updates.dia_match = diaCod;
                updates.horario_inicio_match = hIniStr;
                updates.horario_fin_match = hFinStr;
                updates.horario_match = `${diaNom} ${hIniStr} a ${hFinStr} hs`;
                updates.reprogramacion_puntual = null; // Se limpia cualquier cambio puntual previo

                hist.push({
                    id: Date.now(),
                    fecha: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    texto: `📅 Reprogramación permanente de cursada: Nueva cursada habitual ${diaNom} ${hIniStr} a ${hFinStr} hs (${durMin} min). Cursada previa: ${horarioAnterior}`
                });
            } else {
                // Modificación puntual de una clase
                const fechaTextoOriginal = al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : horarioAnterior;
                const fechaTextoNueva = `${diaNom} ${dStart.getDate()}/${dStart.getMonth()+1} ${hIniStr} hs`;

                updates.reprogramacion_puntual = {
                    fecha_original_texto: fechaTextoOriginal,
                    fecha_nueva_texto: fechaTextoNueva,
                    fecha_nueva_iso: fIsoStart,
                    fecha_nueva_fin_iso: fIsoEnd,
                    duracion_minutos: durMin,
                    timestamp: Date.now()
                };

                hist.push({
                    id: Date.now(),
                    fecha: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    texto: `🕒 Reprogramación puntual de clase: Se cambió la fecha de la clase del ${fechaTextoOriginal} al ${fechaTextoNueva} (${durMin} min)`
                });
            }

            // Solo fijar fecha_inicio_clases si el alumno NO tenía fecha previa, para conservar intacto el inicio fijado por el admisor
            if (!al.fecha_inicio_clases) {
                updates.fecha_inicio_clases = fIsoStart;
            }

            if (resCal) {
                updates.id_evento_alta = resCal.id;
                updates.calendario_evento_alta = resCal.calendar;
            }

            await updateDoc(doc(db, "alumnos", al.id), updates);
        }

        if (window.ocultarIndicadorCarga) window.ocultarIndicadorCarga();
        document.getElementById('modal-reprogramar-docente')?.close();
        alert(`✅ Clase reprogramada con éxito en Google Calendar (${diaNom} ${hIniStr} hs).`);
        if (window.cargarVistaGlobal) window.cargarVistaGlobal('Mis Alumnos y Ensambles');
    } catch(e) {
        if (window.ocultarIndicadorCarga) window.ocultarIndicadorCarga();
        alert("❌ Error al reprogramar: " + e.message);
    }
});

document.getElementById('btn-confirmar-cancelar-docente')?.addEventListener('click', async () => {
    const esGrupo = document.getElementById('canc-es-grupo')?.value === '1';
    const idAlumno = document.getElementById('canc-alumno-id')?.value;
    const nombreGrupo = document.getElementById('canc-grupo-nombre')?.value;
    const alcance = document.querySelector('input[name="canc-alcance"]:checked')?.value || 'puntual';
    const motivo = (document.getElementById('canc-docente-motivo')?.value || '').trim() || 'Cancelado por el docente';

    const ok = await window.confirmar(
        "🛑 Eliminar Evento en Google Calendar",
        `¿Confirmás eliminar la clase de Google Calendar?\n\n• Destino: ${esGrupo ? 'Ensamble ' + nombreGrupo : 'Alumno Individual'}\n• Alcance: ${alcance === 'serie' ? '⚠️ Este y todos los eventos siguientes' : '🗓️ Solo el evento puntual'}\n• Motivo: ${motivo}`,
        "Eliminar de Calendar",
        "🗑️"
    );
    if (!ok) return;

    if (window.mostrarIndicadorCarga) window.mostrarIndicadorCarga('Eliminando clase en Google Calendar...');
    try {
        let alumnosAfectados = [];
        if (esGrupo && nombreGrupo) {
            const snap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", nombreGrupo)));
            snap.forEach(d => alumnosAfectados.push({ id: d.id, ...d.data() }));
        } else if (idAlumno) {
            const aDoc = await getDoc(doc(db, "alumnos", idAlumno));
            if (aDoc.exists()) alumnosAfectados.push({ id: aDoc.id, ...aDoc.data() });
        }

        for (const al of alumnosAfectados) {
            await eliminarEventoAltaSeguro(al);
            const hist = al.historial || [];
            hist.push({
                id: Date.now(),
                fecha: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
                texto: `Clase cancelada/eliminada en Calendar por Docente. Alcance: ${alcance}. Motivo: ${motivo}`
            });

            const updates = { historial: hist };
            if (alcance === 'serie') {
                updates.id_evento_alta = null;
                updates.calendario_evento_alta = null;
            }
            await updateDoc(doc(db, "alumnos", al.id), updates);
        }

        if (window.ocultarIndicadorCarga) window.ocultarIndicadorCarga();
        document.getElementById('modal-cancelar-docente')?.close();
        alert("🛑 Evento cancelado/eliminado correctamente en Google Calendar.");
        if (window.cargarVistaGlobal) window.cargarVistaGlobal('Mis Alumnos y Ensambles');
    } catch(e) {
        if (window.ocultarIndicadorCarga) window.ocultarIndicadorCarga();
        alert("❌ Error al cancelar evento: " + e.message);
    }
});

// Listener global para ver ficha del alumno en modo lectura desde el portal docente
document.addEventListener('click', (e) => {
    const btnVer = e.target.closest('.btn-ver-ficha-docente');
    if (btnVer) {
        e.preventDefault();
        e.stopPropagation();
        const id = btnVer.getAttribute('data-id');
        if (id && window.abrirFichaAlumnoDocente) {
            window.abrirFichaAlumnoDocente(id);
        }
    }
});
