// =======================================================================
// src/modules/profesor.module.js — Portal Docente y Solicitudes de Vacantes
// =======================================================================

import {
    db,
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    query,
    where
} from "../config/firebase.js";
import { getEventosCalendario } from "../services/calendar.service.js";
import {
    renderContenedorDisponibilidad,
    poblarDisponibilidadMultiRango,
    extraerDisponibilidadMultiRango
} from "../ui/horarios.ui.js";

let cachedProfesorDoc = null;
let slotsLibresCache = [];

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
            html += `
                <button type="button" class="btn-chip-instrumento ${isPre ? 'active' : ''}" data-inst="${inst}" style="padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600; border:1px solid ${border}; background:${bg}; color:${col}; cursor:pointer;">
                    🎵 ${inst}
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

/**
 * Renderiza la vista principal del Portal del Profesor
 */
export async function renderPortalProfesor(cont, usuarioActual = {}, callbacks = {}) {
    const { setBotonCargando } = callbacks;
    cont.innerHTML = `
        <div style="display:flex; justify-content:center; padding:40px 0;">
            <div class="skeleton-row" style="height:120px; width:100%; max-width:900px; border-radius:12px;"></div>
        </div>
    `;

    try {
        // 1. Obtener los datos del profesor logueado
        let profesorId = usuarioActual.profesor_id || '';
        let profesorNombre = usuarioActual.nombre || usuarioActual.email || 'Profesor';
        let profesorEmail = (usuarioActual.email || '').toLowerCase();
        let profDocData = null;

        if (profesorId) {
            try {
                const pDoc = await getDoc(doc(db, "profesores", profesorId));
                if (pDoc.exists()) {
                    profDocData = { id: pDoc.id, ...pDoc.data() };
                    if (profDocData.nombre) profesorNombre = profDocData.nombre;
                }
            } catch(e) {}
        } else {
            const profsSnap = await getDocs(collection(db, "profesores"));
            profsSnap.forEach(d => {
                const data = d.data();
                if ((data.correo_calendario && data.correo_calendario.toLowerCase() === profesorEmail) ||
                    (data.nombre && data.nombre.toLowerCase() === (usuarioActual.nombre || '').toLowerCase())) {
                    profesorId = d.id;
                    profesorNombre = data.nombre || profesorNombre;
                    profDocData = { id: d.id, ...data };
                }
            });
        }

        cachedProfesorDoc = profDocData;

        // 2. Obtener alumnos asignados al docente para armar la vista de "Mis Grupos"
        const alumnosSnap = await getDocs(collection(db, "alumnos"));
        const misAlumnos = [];
        alumnosSnap.forEach(d => {
            const al = { id: d.id, ...d.data() };
            const profeAl = (al.profesor_asignado || al.reserva_profe_nombre || '').toLowerCase();
            const profeIdAl = al.profesor_id || al.reserva_profe_id || '';
            
            const coincide = (profesorId && profeIdAl === profesorId) || 
                             (profesorNombre && profeAl.includes(profesorNombre.toLowerCase())) ||
                             (profesorEmail && profeAl.includes(profesorEmail));

            if (coincide && al.grupo_asignado) {
                misAlumnos.push(al);
            }
        });

        // Agrupar alumnos por grupo
        const gruposMap = {};
        misAlumnos.forEach(al => {
            const grpNom = al.grupo_asignado || 'Sin Grupo';
            if (!gruposMap[grpNom]) {
                gruposMap[grpNom] = {
                    nombre: grpNom,
                    alumnos: [],
                    horario: al.horario_match || al.reserva_fecha_texto || 'Horario no especificado',
                    dia: al.dia_match || ''
                };
            }
            gruposMap[grpNom].alumnos.push(al);
        });

        // 3. Obtener solicitudes de vacantes del profesor
        const solicitudesSnap = await getDocs(collection(db, "solicitudes_vacantes"));
        const misSolicitudes = [];
        solicitudesSnap.forEach(d => {
            const sol = { id: d.id, ...d.data() };
            if ((sol.profesorEmail && sol.profesorEmail.toLowerCase() === profesorEmail) ||
                (sol.profesorId && sol.profesorId === profesorId)) {
                misSolicitudes.push(sol);
            }
        });
        misSolicitudes.sort((a, b) => new Date(b.fechaCreacion || 0) - new Date(a.fechaCreacion || 0));

        // 4. Renderizar la interfaz
        let gruposHtml = '';
        const gruposKeys = Object.keys(gruposMap);
        if (gruposKeys.length === 0) {
            gruposHtml = `
                <div style="background:var(--item-bg); border:1px dashed var(--border-color); border-radius:12px; padding:30px; text-align:center; color:var(--text-muted);">
                    <div style="font-size:2em; margin-bottom:8px;">👥</div>
                    <div style="font-weight:700; font-size:15px; color:var(--text-main);">No tienes grupos activos asignados actualmente</div>
                    <div style="font-size:13px; margin-top:4px;">Cuando el equipo de admisiones te asigne ensambles o clases grupales aparecerán aquí. También puedes solicitar abrir una nueva clase desde cero.</div>
                </div>
            `;
        } else {
            gruposHtml = gruposKeys.map(grpKey => {
                const grp = gruposMap[grpKey];
                const integrantesHtml = grp.alumnos.map(al => {
                    const instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'Sin inst.');
                    return `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--hover-bg); border-radius:8px; border:1px solid var(--border-color);">
                            <div>
                                <strong style="color:var(--text-main); font-size:13.5px;">👤 ${al.nombre}</strong>
                                <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">📱 ${al.celular || 'Sin celular'} • ${al.tipo_suscripcion || ''}</div>
                            </div>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <span class="profile-tag-badge" style="background:rgba(0,123,143,0.1); color:var(--accent-teal); border-color:rgba(0,123,143,0.25);">${instStr}</span>
                                ${al.nivel ? `<span class="profile-tag-badge" style="background:#f4ece1; color:#9c6500; border-color:#e2ceb1;">${al.nivel}</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="row-item" style="display:flex; flex-direction:column; gap:12px; padding:18px; margin-bottom:15px; border-left:4px solid var(--accent-teal);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                            <div>
                                <h3 style="margin:0 0 4px 0; color:var(--text-main); font-size:16px;">🧩 ${grp.nombre}</h3>
                                <div style="font-size:12.5px; color:var(--text-muted); font-weight:600;">📅 ${grp.horario} • 👥 ${grp.alumnos.length} Alumnos</div>
                            </div>
                            <button type="button" class="btn-primary btn-pedir-vacante-grupo" data-grupo="${grp.nombre}" data-horario="${grp.horario}" style="font-size:12px; padding:7px 14px;">
                                ➕ Solicitar Alumno para este Grupo
                            </button>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-top:5px;">
                            ${integrantesHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }

        let solicitudesHtml = '';
        if (misSolicitudes.length === 0) {
            solicitudesHtml = `
                <div style="color:var(--text-muted); font-size:13px; padding:15px 0;">
                    No tienes solicitudes de vacantes activas en este momento.
                </div>
            `;
        } else {
            solicitudesHtml = misSolicitudes.map(sol => {
                let badgeEstado = '<span class="status-val-pending">⏳ Buscando candidatos</span>';
                if (sol.estado === 'Cubierta') {
                    badgeEstado = `<span class="status-val-ok">✅ Alumno Asignado ${sol.alumnoAsignadoNombre ? `(${sol.alumnoAsignadoNombre})` : ''}</span>`;
                } else if (sol.estado === 'En Proceso') {
                    badgeEstado = '<span class="status-val-pending" style="background:rgba(74,140,210,0.12); color:#256bbb; border-color:rgba(74,140,210,0.25);">🔄 En proceso de asignación</span>';
                } else if (sol.estado === 'Cancelada') {
                    badgeEstado = '<span class="status-val-reject">❌ Cancelada</span>';
                }

                const badgeTipo = sol.esNuevoGrupo
                    ? '<span class="profile-tag-badge" style="background:rgba(0,123,143,0.12); color:var(--accent-teal); border-color:rgba(0,123,143,0.3); font-size:10.5px;">✨ Nueva Clase de Cero</span>'
                    : '<span class="profile-tag-badge" style="font-size:10.5px;">👥 Grupo Existente</span>';

                const nivelesStr = sol.nivel || 'Cualquiera';

                return `
                    <div style="background:white; border:1px solid var(--border-color); border-radius:10px; padding:14px 18px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                ${badgeTipo}
                                <strong style="color:var(--text-main); font-size:14px;">🎯 Vacante: ${sol.instrumento}</strong>
                                <span class="profile-tag-badge" style="font-size:11px;">Niveles: ${nivelesStr}</span>
                            </div>
                            <div style="font-size:12px; color:var(--text-muted); margin-top:3px;">
                                Grupo: <strong>${sol.grupoNombre}</strong> (${sol.horario || ''})
                                ${sol.observaciones ? ` • <em>"${sol.observaciones}"</em>` : ''}
                            </div>
                            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
                                Solicitado el ${new Date(sol.fechaCreacion).toLocaleDateString()}
                            </div>
                        </div>
                        <div>
                            ${badgeEstado}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Skills y Aptitudes del Profesor para la pestaña de datos personales
        function getEmojiParaInstrumento(inst) {
            if (!inst) return '🎵';
            const s = String(inst).toLowerCase();
            if (s.includes('bat')) return '🥁';
            if (s.includes('gui') || s.includes('electr')) return '🎸';
            if (s.includes('cajón') || s.includes('cajon') || s.includes('perc')) return '📦';
            if (s.includes('cant') || s.includes('voz') || s.includes('vocal') || s.includes('coro')) return '🎤';
            if (s.includes('pian') || s.includes('tecl')) return '🎹';
            if (s.includes('baj')) return '🎸';
            if (s.includes('sax') || s.includes('vient')) return '🎷';
            if (s.includes('tromp')) return '🎺';
            if (s.includes('viol')) return '🎻';
            if (s.includes('ukel') || s.includes('ucu')) return '🪕';
            return '🎵';
        }

        const skillsProfe = Array.isArray(profDocData?.skills) ? profDocData.skills : [];
        const skillsProfeBadges = skillsProfe.length > 0
            ? `<div style="display:flex; flex-wrap:wrap; gap:8px;">${skillsProfe.map(s => `<span class="profile-tag-badge" style="background:#f0fdfa; color:#0f766e; border-color:#99f6e4; font-size:13px; padding:6px 14px; font-weight:700;">${getEmojiParaInstrumento(s)} ${s}</span>`).join('')}</div>`
            : `<div style="color:var(--text-muted); font-size:13px; font-style:italic;">Sin instrumentos asignados actualmente.</div>`;

        let aptitudesDocente = [];
        if (profDocData?.entrevista) aptitudesDocente.push('<span class="tag-chip" style="background:#e0f2fe; color:#0369a1; font-size:12px; padding:4px 10px; font-weight:700;">🎧 Admisiones</span>');
        if (profDocData?.grupales) aptitudesDocente.push('<span class="tag-chip" style="background:#dcfce7; color:#15803d; font-size:12px; padding:4px 10px; font-weight:700;">👥 Clases Grupales</span>');
        if (profDocData?.ensambles) aptitudesDocente.push('<span class="tag-chip" style="background:#fef3c7; color:#b45309; font-size:12px; padding:4px 10px; font-weight:700;">🎵 Ensambles</span>');
        const aptitudesDocenteHtml = aptitudesDocente.length > 0 ? `<div style="display:flex; gap:8px; flex-wrap:wrap;">${aptitudesDocente.join('')}</div>` : `<div style="color:var(--text-muted); font-size:13px; font-style:italic;">Sin aptitudes especiales marcadas.</div>`;

        cont.innerHTML = `
            <div style="max-width:920px; width:100%; margin:0 auto; display:flex; flex-direction:column; gap:16px;">
                <!-- Header de bienvenida -->
                <div style="background:white; border:1px solid var(--border-color); border-radius:14px; padding:20px 24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                    <div>
                        <h2 style="margin:0 0 4px 0; color:var(--text-main); font-size:1.45em; font-weight:800; display:flex; align-items:center; gap:8px;">
                            <span>👨‍🏫 Portal Docente</span>
                        </h2>
                        <div style="color:var(--text-muted); font-size:13px;">Bienvenido, <strong style="color:var(--text-main);">${profesorNombre}</strong>.</div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <button type="button" id="btn-solicitar-vacante-general" class="btn-primary" style="padding:9px 16px; font-size:13px; display:flex; align-items:center; gap:6px;">
                            ➕ Solicitar Alumno / Vacante
                        </button>
                    </div>
                </div>

                <!-- Tabs de Navegación del Portal Docente -->
                <div style="display:flex; gap:10px; border-bottom:2px solid var(--border-color); padding-bottom:0;">
                    <button type="button" id="tab-btn-portal-grupos" class="tab-portal-profe active" style="padding:10px 18px; border:none; background:transparent; font-size:14px; font-weight:700; color:var(--accent-teal); border-bottom:3px solid var(--accent-teal); cursor:pointer; display:flex; align-items:center; gap:8px;">
                        <span>👥 Mis Grupos y Ensambles</span>
                        <span style="font-size:11.5px; background:#e0f2fe; color:#0369a1; border-radius:10px; padding:1.5px 7px; font-weight:700;">${gruposKeys.length}</span>
                    </button>
                    <button type="button" id="tab-btn-portal-solicitudes" class="tab-portal-profe" style="padding:10px 18px; border:none; background:transparent; font-size:14px; font-weight:600; color:var(--text-muted); border-bottom:3px solid transparent; cursor:pointer; display:flex; align-items:center; gap:8px;">
                        <span>🔔 Mis Solicitudes de Vacantes</span>
                        <span style="font-size:11.5px; background:var(--hover-bg); border:1px solid var(--border-color); color:var(--text-muted); border-radius:10px; padding:1.5px 7px; font-weight:700;">${misSolicitudes.length}</span>
                    </button>
                </div>

                <!-- CONTENIDO TAB 1: GRUPOS Y ENSAMBLES -->
                <div id="tab-content-portal-grupos" style="display:flex; flex-direction:column; gap:16px;">
                    <div style="background:white; border:1px solid var(--border-color); border-radius:14px; padding:22px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                        <div id="lista-mis-grupos">
                            ${gruposHtml}
                        </div>
                    </div>
                </div>

                <!-- CONTENIDO TAB 2: SOLICITUDES DE VACANTES -->
                <div id="tab-content-portal-solicitudes" style="display:none; flex-direction:column; gap:16px;">
                    <div style="background:white; border:1px solid var(--border-color); border-radius:14px; padding:22px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                        <div id="lista-mis-solicitudes">
                            ${solicitudesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Control de Tabs del Portal Docente
        const btnTabGrupos = document.getElementById('tab-btn-portal-grupos');
        const btnTabSolicitudes = document.getElementById('tab-btn-portal-solicitudes');
        const contentGrupos = document.getElementById('tab-content-portal-grupos');
        const contentSolicitudes = document.getElementById('tab-content-portal-solicitudes');

        if (btnTabGrupos && btnTabSolicitudes) {
            btnTabGrupos.addEventListener('click', () => {
                btnTabGrupos.classList.add('active');
                btnTabGrupos.style.color = 'var(--accent-teal)';
                btnTabGrupos.style.borderBottomColor = 'var(--accent-teal)';
                btnTabGrupos.style.fontWeight = '700';

                btnTabSolicitudes.classList.remove('active');
                btnTabSolicitudes.style.color = 'var(--text-muted)';
                btnTabSolicitudes.style.borderBottomColor = 'transparent';
                btnTabSolicitudes.style.fontWeight = '600';

                if (contentGrupos) contentGrupos.style.display = 'flex';
                if (contentSolicitudes) contentSolicitudes.style.display = 'none';
            });

            btnTabSolicitudes.addEventListener('click', () => {
                btnTabSolicitudes.classList.add('active');
                btnTabSolicitudes.style.color = 'var(--accent-teal)';
                btnTabSolicitudes.style.borderBottomColor = 'var(--accent-teal)';
                btnTabSolicitudes.style.fontWeight = '700';

                btnTabGrupos.classList.remove('active');
                btnTabGrupos.style.color = 'var(--text-muted)';
                btnTabGrupos.style.borderBottomColor = 'transparent';
                btnTabGrupos.style.fontWeight = '600';

                if (contentGrupos) contentGrupos.style.display = 'none';
                if (contentSolicitudes) contentSolicitudes.style.display = 'flex';
            });
        }

        // Listeners para abrir modal de solicitud de vacante
        const cargarSlotsLibresEnModal = async () => {
            const selSlot = document.getElementById('sol-vac-slot-libre');
            if (!selSlot) return;
            selSlot.innerHTML = '<option value="">⏳ Consultando agenda libre y Google Calendar...</option>';

            slotsLibresCache = await obtenerHorariosLibresDocente(cachedProfesorDoc, 90);

            if (slotsLibresCache.length === 0) {
                selSlot.innerHTML = '<option value="">⚠️ No se encontraron huecos libres en tu disponibilidad declarada.</option>';
                return;
            }

            let optsHtml = '<option value="">-- Selecciona un horario libre --</option>';
            slotsLibresCache.forEach((slot, idx) => {
                const icon = slot.pegado ? '⭐' : '🕒';
                const tag = slot.pegado ? ' (Recomendado - Pegado a tu clase)' : '';
                optsHtml += `<option value="${idx}">${icon} ${slot.texto}${tag}</option>`;
            });
            selSlot.innerHTML = optsHtml;
        };

        const abrirModalSolicitud = async (grupoPre = '', horarioPre = '', forzarNuevo = false) => {
            const modal = document.getElementById('modal-solicitar-vacante');
            if (!modal) return;

            setupNivelesChipsListeners();
            resetNivelesChips();
            await poblarInstrumentosChips();

            const rExistente = document.getElementById('sol-vac-modo-existente');
            const rNuevo = document.getElementById('sol-vac-modo-nuevo');
            const secExistente = document.getElementById('sol-vac-sec-existente');
            const secNuevo = document.getElementById('sol-vac-sec-nuevo');

            if (forzarNuevo || (gruposKeys.length === 0 && !grupoPre)) {
                if (rNuevo) rNuevo.checked = true;
                if (secExistente) secExistente.style.display = 'none';
                if (secNuevo) secNuevo.style.display = 'block';
                await cargarSlotsLibresEnModal();
            } else {
                if (rExistente) rExistente.checked = true;
                if (secExistente) secExistente.style.display = 'block';
                if (secNuevo) secNuevo.style.display = 'none';
            }

            // Población de grupos
            const selGrupo = document.getElementById('sol-vac-grupo');
            if (selGrupo) {
                selGrupo.innerHTML = '<option value="">Selecciona un grupo...</option>';
                gruposKeys.forEach(k => {
                    selGrupo.innerHTML += `<option value="${k}" ${k === grupoPre ? 'selected' : ''}>${k} (${gruposMap[k].horario})</option>`;
                });
                if (grupoPre && !gruposKeys.includes(grupoPre)) {
                    selGrupo.innerHTML += `<option value="${grupoPre}" selected>${grupoPre}</option>`;
                }

                selGrupo.onchange = () => {
                    const selVal = selGrupo.value;
                    if (selVal && gruposMap[selVal]) {
                        document.getElementById('sol-vac-horario').value = gruposMap[selVal].horario || '';
                        document.getElementById('sol-vac-dia').value = gruposMap[selVal].dia || '';
                    } else {
                        document.getElementById('sol-vac-horario').value = '';
                        document.getElementById('sol-vac-dia').value = '';
                    }
                };
            }

            document.getElementById('sol-vac-horario').value = horarioPre || (grupoPre && gruposMap[grupoPre] ? gruposMap[grupoPre].horario : '');
            document.getElementById('sol-vac-profe-id').value = profesorId;
            document.getElementById('sol-vac-profe-nombre').value = profesorNombre;
            document.getElementById('sol-vac-profe-email').value = profesorEmail;
            document.getElementById('sol-vac-obs').value = '';
            document.getElementById('sol-vac-nuevo-nombre').value = '';

            // Listeners de los radio buttons
            if (rExistente) {
                rExistente.onchange = () => {
                    secExistente.style.display = 'block';
                    secNuevo.style.display = 'none';
                };
            }
            if (rNuevo) {
                rNuevo.onchange = async () => {
                    secExistente.style.display = 'none';
                    secNuevo.style.display = 'block';
                    if (slotsLibresCache.length === 0) {
                        await cargarSlotsLibresEnModal();
                    }
                };
            }

            // Listener del select de slots libres
            const selSlot = document.getElementById('sol-vac-slot-libre');
            if (selSlot) {
                selSlot.onchange = () => {
                    const idx = selSlot.value;
                    if (idx !== '' && slotsLibresCache[idx]) {
                        const s = slotsLibresCache[idx];
                        document.getElementById('sol-vac-dia').value = s.dia;
                        const sugerenciaNombre = `${s.dia}${s.horaInicio.replace(':','.')} ${profesorNombre.split(' ')[0]} (Nuevo Grupo)`;
                        document.getElementById('sol-vac-nuevo-nombre').value = sugerenciaNombre;
                    }
                };
            }

            // Listener botón recargar slots
            const btnRecargarSlots = document.getElementById('btn-recargar-slots-docente');
            if (btnRecargarSlots) {
                btnRecargarSlots.onclick = () => cargarSlotsLibresEnModal();
            }

            modal.showModal();
        };

        document.getElementById('btn-solicitar-vacante-general')?.addEventListener('click', () => abrirModalSolicitud());

        cont.querySelectorAll('.btn-pedir-vacante-grupo').forEach(btn => {
            btn.addEventListener('click', () => {
                const grp = btn.getAttribute('data-grupo');
                const hor = btn.getAttribute('data-horario');
                abrirModalSolicitud(grp, hor, false);
            });
        });

    } catch (err) {
        cont.innerHTML = `<div style="color:var(--accent-red); padding:30px; text-align:center; font-weight:700;">Error al cargar el portal docente: ${err.message}</div>`;
    }
}

// Handler de envío de solicitud de vacante
document.getElementById('btn-guardar-solicitar-vacante')?.addEventListener('click', async (e) => {
    const btn = e.target;
    const esModoNuevo = document.getElementById('sol-vac-modo-nuevo')?.checked || false;

    let grupo = '';
    let horario = '';
    let dia = document.getElementById('sol-vac-dia')?.value || '';

    if (esModoNuevo) {
        const slotIdx = document.getElementById('sol-vac-slot-libre')?.value;
        if (slotIdx === '' || !slotsLibresCache[slotIdx]) {
            alert('Debes seleccionar un horario libre de tu agenda para iniciar la nueva clase.');
            return;
        }
        const s = slotsLibresCache[slotIdx];
        horario = s.horarioTexto || s.texto;
        dia = s.dia;
        grupo = (document.getElementById('sol-vac-nuevo-nombre')?.value || '').trim() || `${s.dia}${s.horaInicio.replace(':','.')} Nueva Clase`;
    } else {
        grupo = (document.getElementById('sol-vac-grupo')?.value || '').trim();
        horario = (document.getElementById('sol-vac-horario')?.value || '').trim();
        if (!grupo) {
            alert('Debes seleccionar un grupo o ensamble existente.');
            return;
        }
    }

    const instrumentos = obtenerInstrumentosSeleccionados();
    if (instrumentos.length === 0) {
        alert('Debes seleccionar al menos un instrumento requerido para la vacante.');
        return;
    }

    const niveles = obtenerNivelesSeleccionados();
    const obs = (document.getElementById('sol-vac-obs')?.value || '').trim();
    const profeId = document.getElementById('sol-vac-profe-id')?.value || '';
    const profeNombre = document.getElementById('sol-vac-profe-nombre')?.value || 'Profesor';
    const profeEmail = (document.getElementById('sol-vac-profe-email')?.value || '').toLowerCase();

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    // Determinar día de la semana si aún no está fijado
    if (!dia) {
        const hLower = (horario + ' ' + grupo).toLowerCase();
        if (hLower.includes('lunes') || /^[lL]\d/.test(grupo)) dia = 'L';
        else if (hLower.includes('martes') || /^[mM]\d/.test(grupo)) dia = 'M';
        else if (hLower.includes('miércoles') || hLower.includes('miercoles') || /^[xX]\d/.test(grupo)) dia = 'X';
        else if (hLower.includes('jueves') || /^[jJ]\d/.test(grupo)) dia = 'J';
        else if (hLower.includes('viernes') || /^[vV]\d/.test(grupo)) dia = 'V';
        else if (hLower.includes('sábado') || hLower.includes('sabado') || /^[sS]\d/.test(grupo)) dia = 'S';
    }

    try {
        const solData = {
            grupoNombre: grupo,
            horario: horario,
            dia: dia,
            esNuevoGrupo: esModoNuevo,
            profesorId: profeId,
            profesorNombre: profeNombre,
            profesorEmail: profeEmail,
            instrumentos: instrumentos,
            instrumento: instrumentos.join(', '),
            nivel: niveles.join(', '),
            niveles: niveles,
            cantidadVacantes: 1,
            observaciones: obs,
            estado: 'Pendiente',
            alumnoAsignadoId: null,
            alumnoAsignadoNombre: null,
            fechaCreacion: new Date().toISOString()
        };

        await addDoc(collection(db, "solicitudes_vacantes"), solData);
        alert(`✅ ¡Solicitud para ${instrumentos.join(', ')} (${niveles.join(', ')}) enviada con éxito!`);
        document.getElementById('modal-solicitar-vacante')?.close();
        if (window.cargarVistaGlobal) {
            window.cargarVistaGlobal('Mis Grupos & Solicitud de Alumnos');
        }
    } catch(err) {
        alert('Error al enviar solicitud: ' + err.message);
    }

    btn.disabled = false;
    btn.textContent = 'Enviar Solicitud';
});
