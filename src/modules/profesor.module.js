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

let cachedProfesorDoc = null;
let slotsLibresCache = [];

export function getEmojiParaInstrumento(inst) {
    if (!inst) return '🎵';
    const s = (Array.isArray(inst) ? inst.join(' ') : String(inst)).toLowerCase();
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
                <div style="background:var(--item-bg); border:1px dashed var(--border-color); border-radius:12px; padding:35px 20px; text-align:center; color:var(--text-muted); width:100%;">
                    <div style="font-size:2.2em; margin-bottom:8px;">🔔</div>
                    <div style="font-weight:700; font-size:15px; color:var(--text-main);">No tienes solicitudes de vacantes activas en este momento</div>
                </div>
            `;
        } else {
            solicitudesHtml = misSolicitudes.map(sol => {
                let badgeEstado = '<span class="status-val-pending">⏳ Buscando</span>';
                if (sol.estado === 'Cubierta') badgeEstado = `<span class="status-val-ok">✅ Asignado ${sol.alumnoAsignadoNombre ? `(${sol.alumnoAsignadoNombre})` : ''}</span>`;
                else if (sol.estado === 'Cancelada') badgeEstado = '<span class="status-val-reject">❌ Cancelada</span>';

                return `
                    <div class="row-item" style="display:flex; justify-content:space-between; align-items:center; padding:14px 18px; margin-bottom:10px; flex-wrap:wrap; gap:10px; width:100%;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <strong style="color:var(--text-main); font-size:14px;">🎯 ${sol.instrumento}</strong>
                                <span class="match-student-tag nivel" style="font-size:11px;">Niveles: ${sol.nivel || 'Cualquiera'}</span>
                            </div>
                            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                                Grupo: <strong>${sol.grupoNombre}</strong> • ${sol.horario}
                            </div>
                        </div>
                        <div>${badgeEstado}</div>
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

                <!-- CONTENIDO TAB 3: SOLICITUDES DE VACANTES -->
                <div id="tab-content-portal-solicitudes" class="lista-filas" style="display:none; flex-direction:column; gap:10px; width:100%;">
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
            if (contenidoActivo) contenidoActivo.style.display = 'flex';
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

        // 12. Modal Solicitud de Vacante
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

                const selGrp = document.getElementById('sol-vac-grupo');
                if (selGrp) {
                    selGrp.innerHTML = '<option value="">-- Selecciona un Grupo --</option>';
                    gruposKeys.forEach(gk => {
                        const sel = (gk === grupoPre) ? 'selected' : '';
                        selGrp.innerHTML += `<option value="${gk}" ${sel}>${gk}</option>`;
                    });
                }
                const inpH = document.getElementById('sol-vac-horario');
                if (inpH) inpH.value = horarioPre || (gruposMap[grupoPre]?.horario || '');
            }

            document.getElementById('sol-vac-profe-id').value = profesorId || '';
            document.getElementById('sol-vac-profe-nombre').value = profesorNombre || '';
            document.getElementById('sol-vac-profe-email').value = profesorEmail || '';

            modal.showModal();
        };

        document.getElementById('btn-solicitar-vacante-general')?.addEventListener('click', () => abrirModalSolicitud());

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
