// =======================================================================
// recordatorios.module.js - Motor Inteligente de Recordatorios y Alertas
// Mandala Admision v7.43
// =======================================================================

import { 
    db, 
    doc, 
    updateDoc 
} from "../config/firebase.js";

import {
    esAlumnoAltaFinalizada,
    esAlumnoAltaConfirmadaIncompleta
} from "../config/constants.js";

let timerIntervaloCheck = null;
let timerSnooze = null;
let _timeoutsReintentosRecordatorios = [];
let snoozeHastaTimestamp = 0;
let snoozePorRolMap = {};
let modalRecordatoriosInicializado = false;
let listenerVisibilidadRegistrado = false;
let _ultimoHtmlPopup = '';
let ultimoConteoPendientes = 0;

export function limpiarTodosLosTimeoutsRecordatorios() {
    if (timerSnooze) {
        clearTimeout(timerSnooze);
        timerSnooze = null;
    }
    _timeoutsReintentosRecordatorios.forEach(t => clearTimeout(t));
    _timeoutsReintentosRecordatorios = [];
}
window.limpiarTodosLosTimeoutsRecordatorios = limpiarTodosLosTimeoutsRecordatorios;

// =======================================================================
// UTILIDADES DE ENTORNO LOCAL Y SIMULADOR
// =======================================================================

export function esEntornoLocalSimulador() {
    if (typeof window === 'undefined') return false;
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1';
}
window.esEntornoLocalSimulador = esEntornoLocalSimulador;

export function obtenerRolEfectivoRecordatorios() {
    let r = (window.modoRolActivo || 'multi').toLowerCase().trim();
    if (esEntornoLocalSimulador()) {
        const simRolSelect = document.getElementById('sim-rol-select')?.value;
        if (simRolSelect && simRolSelect !== 'actual' && simRolSelect !== 'multi') {
            r = simRolSelect.toLowerCase().trim();
        }
    }
    if (r === 'profesor' || r === 'evaluador') return 'docente';
    return r;
}
window.obtenerRolEfectivoRecordatorios = obtenerRolEfectivoRecordatorios;

export function sincronizarBarraSimuladorLocal() {
    if (typeof document === 'undefined') return;
    const bar = document.getElementById('simulador-recordatorios-bar');
    if (!bar) return;
    const esLocal = esEntornoLocalSimulador();
    bar.style.display = esLocal ? 'flex' : 'none';

    if (esLocal) {
        const inputFecha = document.getElementById('sim-fecha-input');
        if (inputFecha && !inputFecha.value) {
            inputFecha.value = aFechaYMD(new Date());
        }
        const optActual = document.getElementById('sim-rol-opt-actual');
        if (optActual) {
            const u = window.usuarioActual || {};
            const nom = u.nombre || u.email?.split('@')[0] || 'Usuario';
            optActual.textContent = `Mi rol activo (${nom})`;
        }
    }
}
window.sincronizarBarraSimuladorLocal = sincronizarBarraSimuladorLocal;

export function escaparHtmlRecordatorio(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
window.escaparHtmlRecordatorio = escaparHtmlRecordatorio;

// =======================================================================
// UTILIDADES DE FECHA CALENDARIO (SIN JITTER NI HORA)
// =======================================================================

export function aFechaYMD(val) {
    if (!val) return null;
    if (typeof val === 'object' && typeof val.seconds === 'number') {
        const d = new Date(val.seconds * 1000);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dia = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dia}`;
        }
    }
    if (typeof window !== 'undefined' && typeof window.parsearFechaCualquierOrigen === 'function') {
        const d = window.parsearFechaCualquierOrigen(val);
        if (d instanceof Date && !isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dia = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dia}`;
        }
    }
    if (typeof val === 'string') {
        const limpia = val.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return limpia;
        if (limpia.includes('Z') || /[+-]\d{2}:\d{2}$/.test(limpia)) {
            const d = new Date(limpia);
            if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const dia = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${dia}`;
            }
        }
        if (/^\d{4}-\d{2}-\d{2}T/.test(limpia)) return limpia.substring(0, 10);
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(limpia)) {
            const [d, m, y] = limpia.split('/');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        const d = new Date(limpia);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dia = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dia}`;
        }
    }
    if (val instanceof Date && !isNaN(val.getTime())) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const dia = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${dia}`;
    }
    if (val && typeof val.toDate === 'function') {
        const d = val.toDate();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dia}`;
    }
    return null;
}

export function obtenerFechaReferenciaHoyYMD(fechaHoyManual = null) {
    if (fechaHoyManual) {
        const ym = aFechaYMD(fechaHoyManual);
        if (ym) return ym;
    }
    if (esEntornoLocalSimulador()) {
        const inp = document.getElementById('sim-fecha-input');
        if (inp && inp.value) {
            const ymSim = aFechaYMD(inp.value);
            if (ymSim) return ymSim;
        }
    }
    return aFechaYMD(new Date());
}
window.obtenerFechaReferenciaHoyYMD = obtenerFechaReferenciaHoyYMD;

export function diffDiasCalendario(ymd1, ymd2) {
    if (!ymd1 || !ymd2) return 0;
    const [y1, m1, d1] = ymd1.split('-').map(Number);
    const [y2, m2, d2] = ymd2.split('-').map(Number);
    const t1 = Date.UTC(y1, m1 - 1, d1);
    const t2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((t1 - t2) / (1000 * 60 * 60 * 24));
}

export function formatoDiaMes(ymd) {
    if (!ymd || !ymd.includes('-')) return '-';
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}`;
}

export function textoDiasRelativo(dias) {
    if (dias === 0) return 'HOY';
    if (dias === 1) return 'ma\u00F1ana';
    if (dias === -1) return 'ayer';
    if (dias < 0) return `hace ${-dias} d`;
    return `en ${dias} d`;
}

// =======================================================================
// CATEGORÍAS DE RECORDATORIO (fuente única: sección, botón y vista destino)
// =======================================================================

// Cada categoría (cat) pertenece a una sección. Agregar una categoría nueva = agregar una fila aquí.
export const CATEGORIAS_RECORDATORIO = {
    sin_agendar: { seccion: 'inbox',         boton: { txt: '📥 Ver en Inbox',        title: 'Ir a la vista Inbox donde se encuentra este alumno' } },
    pago:        { seccion: 'altas',         boton: { txt: '🚀 Ver en Altas',        title: 'Ir a la vista Altas donde se encuentra este alumno' } },
    gest:        { seccion: 'altas',         boton: { txt: '🚀 Ver en Altas',        title: 'Ir a la vista Altas donde se encuentra este alumno' } },
    incompleta:  { seccion: 'altas',         boton: { txt: '🚀 Ver en Altas',        title: 'Ir a la vista Altas donde se encuentra este alumno' } },
    conf:        { seccion: 'entrevistas',   boton: { txt: '🗓️ Ver en Agenda',       title: 'Ir al Dashboard / Agenda' } },
    hoy:         { seccion: 'entrevistas',   boton: { txt: '🗓️ Ver en Agenda',       title: 'Ir al Dashboard / Agenda' } },
    man:         { seccion: 'entrevistas',   boton: { txt: '🗓️ Ver en Agenda',       title: 'Ir al Dashboard / Agenda' } },
    inf:         { seccion: 'entrevistas',   boton: { txt: '🗓️ Ver en Agenda',       title: 'Ir al Dashboard / Agenda' } },
    venc:        { seccion: 'seguimientos',  boton: { txt: '📞 Ver en Seguimiento',  title: 'Ir a la sección de Seguimientos' } },
    sinfb:       { seccion: 'seguimientos',  boton: { txt: '📞 Ver en Seguimiento',  title: 'Ir a la sección de Seguimientos' } },
    sinresp:     { seccion: 'seguimientos',  boton: { txt: '📞 Ver en Seguimiento',  title: 'Ir a la sección de Seguimientos' } }
};

export function seccionDeCategoria(cat) {
    return CATEGORIAS_RECORDATORIO[cat]?.seccion || cat || 'otros';
}

// =======================================================================
// PERMISOS DE VISIBILIDAD POR ROL (fuente única, usada por el motor y por la vista)
// =======================================================================

export function obtenerPermisosRecordatorios(usuario, rolEfectivo) {
    const roles = Array.isArray(usuario.roles) && usuario.roles.length > 0 ? usuario.roles : [usuario.rol || 'admisor'];
    const aptoEval = typeof window.tieneAptitudEvaluaciones === 'function' ? window.tieneAptitudEvaluaciones(usuario) : Boolean(usuario.apto_evaluaciones || usuario.entrevista);
    const aptoSeg = typeof window.tieneAptitudSeguimientos === 'function' ? window.tieneAptitudSeguimientos(usuario) : Boolean(usuario.apto_seguimientos || usuario.seguimientos);
    const esRolDocenteEfectivo = rolEfectivo === 'profesor' || rolEfectivo === 'docente';

    const email = (usuario.email || '').toLowerCase().trim();
    const esAdminPerfil = roles.includes('admin') || roles.includes('superadmin') || usuario.rol === 'admin' || email === 'productora.mandalahouse@gmail.com';
    const esModoAdminGlobal = rolEfectivo === 'admin' || (rolEfectivo === 'multi' && esAdminPerfil);
    const esCoordGlobal = rolEfectivo === 'coordinador' || rolEfectivo === 'coordinador_grupos' || (rolEfectivo === 'multi' && (roles.includes('coordinador') || roles.includes('coordinador_grupos')));

    return {
        roles, aptoEval, aptoSeg, esRolDocenteEfectivo, esModoAdminGlobal, esCoordGlobal,
        verSinAgendar: esModoAdminGlobal || rolEfectivo === 'admisor' || rolEfectivo === 'admisiones' || rolEfectivo === 'atencion_cliente' || (rolEfectivo === 'multi' && (roles.includes('admisor') || roles.includes('admisiones') || roles.includes('atencion_cliente'))),
        verAltasYValidaciones: esModoAdminGlobal || rolEfectivo === 'admisor' || rolEfectivo === 'admisiones' || (rolEfectivo === 'multi' && (roles.includes('admisor') || roles.includes('admisiones'))),
        verEntrevistas: esModoAdminGlobal || (esRolDocenteEfectivo && aptoEval) || (rolEfectivo === 'multi' && (roles.includes('evaluador') || (roles.includes('docente') && aptoEval))),
        verSeguimientos: esModoAdminGlobal || esCoordGlobal || (esRolDocenteEfectivo && aptoSeg) || (rolEfectivo === 'multi' && (roles.includes('docente') && aptoSeg))
    };
}

// =======================================================================
// POSPUESTOS POR USUARIO (cada persona pospone lo suyo; no afecta a los demás)
// =======================================================================
// Se guardan en el documento del propio usuario: recordatorios_pospuestos = { "<alumnoId>__<seccion>": "YYYY-MM-DD" }

function claveUsuarioRecordatorios(u = window.usuarioActual || {}) {
    return u.id || u.email || 'anon';
}

function claveSnooze(rolKey, u = window.usuarioActual || {}) {
    return `${claveUsuarioRecordatorios(u)}::${rolKey}`;
}

function sumarDiasYMD(ymd, dias) {
    const [y, m, d] = ymd.split('-').map(Number);
    const f = new Date(Date.UTC(y, m - 1, d + dias));
    return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}

// ¿El popup está silenciado o en pausa para este usuario y rol? Se toma el valor más tardío de todas las fuentes
// (memoria, sesión, almacenamiento local y Firestore) para que ninguna fuente desactualizada gane sobre otra más reciente.
function popupEnPausa(hoyYMD) {
    const rolKey = obtenerRolEfectivoRecordatorios();
    const u = window.usuarioActual || {};
    const uidKey = claveUsuarioRecordatorios(u);
    const kSil = `mandala_silenciado_${uidKey}_${rolKey}`;
    const kSnz = `mandala_snooze_${uidKey}_${rolKey}`;

    const fechasSilencio = [u.popup_silenciado_por_rol?.[rolKey]];
    const marcasPausa = [snoozePorRolMap[claveSnooze(rolKey)] || 0, u.popup_snooze_por_rol?.[rolKey] || 0];
    try {
        fechasSilencio.push(sessionStorage.getItem(kSil), localStorage.getItem(kSil));
        marcasPausa.push(Number(sessionStorage.getItem(kSnz)) || 0, Number(localStorage.getItem(kSnz)) || 0);
    } catch (e) {}

    const fSil = fechasSilencio.filter(f => typeof f === 'string' && f).sort().pop() || null;
    if (fSil && hoyYMD < fSil) return true;
    return Date.now() < Math.max(...marcasPausa);
}

function estaPospuestoParaUsuario(usuario, alumnoId, cat, hoyYMD) {
    const mapa = usuario && usuario.recordatorios_pospuestos;
    if (!mapa || typeof mapa !== 'object') return false;
    const hasta = mapa[`${alumnoId}__${seccionDeCategoria(cat)}`];
    return typeof hasta === 'string' && hoyYMD < hasta;
}

export async function posponerRecordatorioAlumnoManana(alumnoId, cat = '') {
    if (!alumnoId) return;

    const hoyYMD = obtenerFechaReferenciaHoyYMD();
    const mananaYMD = sumarDiasYMD(hoyYMD, 1);

    const u = window.usuarioActual || {};
    const pool = obtenerPoolAlumnos();
    const al = pool.find(a => a.id === alumnoId) || (Array.isArray(window.alumnosMockupPrueba) ? window.alumnosMockupPrueba.find(a => a.id === alumnoId) : null);

    // Si no se indicó categoría, se pospone todo lo del alumno para este usuario (todas las secciones)
    const secciones = cat ? [seccionDeCategoria(cat)] : ['inbox', 'altas', 'entrevistas', 'seguimientos'];
    const mapa = {};
    // Se conservan solo los pospuestos vigentes (poda de vencidos para que el mapa no crezca)
    Object.entries(u.recordatorios_pospuestos || {}).forEach(([k, v]) => {
        if (typeof v === 'string' && hoyYMD < v) mapa[k] = v;
    });
    secciones.forEach(s => { mapa[`${alumnoId}__${s}`] = mananaYMD; });
    u.recordatorios_pospuestos = mapa;

    if (u.id && !String(u.id).startsWith('mock_') && !alumnoId.startsWith('mock_') && !alumnoId.startsWith('test_')) {
        try {
            await updateDoc(doc(db, "usuarios_sistema", u.id), { recordatorios_pospuestos: mapa });
        } catch (e) {
            console.error("[Recordatorios] Error al guardar posposición del usuario en Firestore:", e);
            if (typeof window.mostrarToast === 'function') {
                window.mostrarToast('No se pudo guardar la posposición en el servidor: puede volver a aparecer al recargar.', 'warning');
            }
        }
    }

    if (typeof window.mostrarToast === 'function') {
        const nom = al?.nombre ? ` de ${al.nombre}` : '';
        window.mostrarToast(`🌙 Recordatorio${nom} pospuesto hasta mañana.`, 'info');
    }

    refrescarMotorRecordatorios(false);

    const pendContainer = document.getElementById('pendientes-view-container') || document.getElementById('contenedor-vistas');
    if (pendContainer && pendContainer.style.display !== 'none') {
        renderizarVistaMisPendientes(pendContainer);
    }

    const { out } = calcularPendientesRecordatorios();
    if (out.filter(o => o.popup).length === 0) {
        cerrarModalRecordatorios(0);
    } else {
        abrirModalRecordatorios(false);
    }
}
window.posponerRecordatorioAlumnoManana = posponerRecordatorioAlumnoManana;
window.omitirRecordatorioAlumno = posponerRecordatorioAlumnoManana;
export const omitirRecordatorioAlumno = posponerRecordatorioAlumnoManana;

export async function posponerPopupManana() {
    limpiarTodosLosTimeoutsRecordatorios();

    const hoyYMD = obtenerFechaReferenciaHoyYMD();
    const mananaYMD = sumarDiasYMD(hoyYMD, 1);

    const ahora = Date.now();
    const rolKey = obtenerRolEfectivoRecordatorios();
    snoozePorRolMap[claveSnooze(rolKey)] = ahora + (24 * 60 * 60 * 1000);
    snoozeHastaTimestamp = snoozePorRolMap[claveSnooze(rolKey)];

    const u = window.usuarioActual || {};
    const uidKey = claveUsuarioRecordatorios(u);
    u.popup_silenciado_por_rol = { ...(u.popup_silenciado_por_rol || {}), [rolKey]: mananaYMD };

    if (u && u.id && !u.id.startsWith('mock_')) {
        u.popup_silenciado_hasta = mananaYMD;
        try {
            const uRef = doc(db, "usuarios_sistema", u.id);
            await updateDoc(uRef, { [`popup_silenciado_por_rol.${rolKey}`]: mananaYMD, popup_silenciado_hasta: mananaYMD });
        } catch (e) {
            try {
                const uRef2 = doc(db, "usuarios", u.id);
                await updateDoc(uRef2, { [`popup_silenciado_por_rol.${rolKey}`]: mananaYMD, popup_silenciado_hasta: mananaYMD });
            } catch (err2) {
                console.warn('[Recordatorios] No se pudo persistir el silencio del popup en el servidor; queda solo en este navegador.', err2);
            }
        }
    } else if (u) {
        u.popup_silenciado_hasta = mananaYMD;
    }

    try {
        sessionStorage.setItem(`mandala_silenciado_${uidKey}_${rolKey}`, mananaYMD);
        localStorage.setItem(`mandala_silenciado_${uidKey}_${rolKey}`, mananaYMD);
    } catch (e) {}

    const dlg = document.getElementById('modal-recordatorios-bloqueante');
    if (dlg) {
        try {
            if (typeof dlg.close === 'function' && dlg.open) dlg.close();
        } catch (e) {}
        dlg.removeAttribute('open');
        dlg.style.display = 'none';
    }

    setTimeout(() => {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('🌙 Recordatorios pospuestos hasta mañana.', 'info');
        }
    }, 50);

    refrescarMotorRecordatorios(false);

    const pendContainer = document.getElementById('pendientes-view-container') || document.getElementById('contenedor-vistas');
    if (pendContainer && pendContainer.style.display !== 'none') {
        renderizarVistaMisPendientes(pendContainer);
    }
}
window.posponerPopupManana = posponerPopupManana;
window.omitirTodosRecordatorios = posponerPopupManana;
export const omitirTodosRecordatorios = posponerPopupManana;

// =======================================================================
// MOTOR DE CÁLCULO DE RECORDATORIOS
// =======================================================================
export function obtenerPoolAlumnos() {
    let pool = [];
    if (Array.isArray(window.ultimosAlumnosCargados) && window.ultimosAlumnosCargados.length > 0) {
        pool = [...window.ultimosAlumnosCargados];
    } else if (Array.isArray(window.allData) && window.allData.length > 0) {
        pool = [...window.allData];
    } else if (Array.isArray(window.cachedAlumnosData) && window.cachedAlumnosData.length > 0) {
        pool = [...window.cachedAlumnosData];
    }

    if (Array.isArray(window.alumnosMockupPrueba) && window.alumnosMockupPrueba.length > 0) {
        const idsExistentes = new Set(pool.map(a => a.id));
        window.alumnosMockupPrueba.forEach(mockAl => {
            if (!idsExistentes.has(mockAl.id)) {
                pool.push(mockAl);
            }
        });
    }
    return pool;
}

// Un seguimiento "sin responsable" es aquel al que no se le asignó ningún usuario (ni por id, ni por email, ni por nombre).
function seguimientoSinResponsable(al) {
    const seg = (al && al.seguimiento) || {};
    const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    return vacio(seg.responsable_id) && vacio(seg.responsable_email) && vacio(seg.responsable_nombre) &&
           vacio(al && al.seguimiento_responsable_id) && vacio(al && al.seguimiento_responsable_email) && vacio(al && al.seguimiento_responsable_nombre);
}

export function calcularPendientesRecordatorios(fechaHoyManual = null) {
    const pool = obtenerPoolAlumnos();
    const hoyYMD = obtenerFechaReferenciaHoyYMD(fechaHoyManual);
    const usuario = window.usuarioActual || {};
    const rolEfectivo = obtenerRolEfectivoRecordatorios();

    const {
        aptoEval, aptoSeg, esRolDocenteEfectivo, esModoAdminGlobal, esCoordGlobal,
        verSinAgendar, verAltasYValidaciones, verEntrevistas, verSeguimientos
    } = obtenerPermisosRecordatorios(usuario, rolEfectivo);

    // Si el rol efectivo es docente y no tiene ninguna aptitud, 0 alertas operativas
    if (esRolDocenteEfectivo && !aptoEval && !aptoSeg) {
        return { out: [], faltantes: [], hoyYMD };
    }









    const out = [];
    const faltantes = [];


    // 1. SIN AGENDAR (INBOX) - VISIBLE PARA ADMISOR / ADMIN
    if (verSinAgendar) {
        pool.forEach(al => {
            if (!al || !al.id) return;
            if (!al.nombre || typeof al.nombre !== 'string' || !al.nombre.trim()) return;
            if (al.nombre.trim().toLowerCase() === 'alumno sin agendar' && (!al.telefono && !al.celular && !al.email)) return;
            if (al.es_baja || al.suspendido || al.estado_agenda === 'Baja') return;


            const st = (al.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            if (st === 'pendiente procesar' || st === 'sin agendar' || (!st && (al.celular || al.telefono || al.email))) {
                const fechaRef = aFechaYMD(al.fecha_reingreso || al.fecha_ingreso || al.fecha_creacion) || hoyYMD;
                const diffDias = diffDiasCalendario(hoyYMD, fechaRef);
                const antiguedadTxt = textoDiasRelativo(-diffDias);

                let sev = 1;
                if (diffDias >= 3) sev = 3;
                else if (diffDias >= 1) sev = 2;

                const inst = al.instrumento_principal || (Array.isArray(al.instrumento) ? al.instrumento[0] : al.instrumento) || 'General';
                out.push({
                    id: al.id,
                    cat: 'sin_agendar',
                    grp: '📥 Sin Agendar (Inbox)',
                    nom: al.nombre.trim(),
                    info: `${inst} · Ingreso ${antiguedadTxt}`,
                    sev,
                    popup: false,
                    accion: 'ver',
                    alumnoId: al.id
                });
            }
        });
    }

    // 2. ALTAS PENDIENTES Y EN CURSO - VISIBLE PARA ADMISOR / ADMIN
    if (verAltasYValidaciones) {
        pool.forEach(al => {
            if (!al || !al.id) return;
            if (!al.nombre || typeof al.nombre !== 'string' || !al.nombre.trim()) return;
            if (al.es_baja || al.suspendido || al.estado_agenda === 'Baja') return;


            const st = (al.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            if (st === 'baja' || st === 'alta finalizada' || esAlumnoAltaFinalizada(al)) return;
            const esPreAlta = st === 'pre-alta pendiente' || st === 'pre-alta iniciada';
            const esAltaIncompleta = esAlumnoAltaConfirmadaIncompleta(al);

            if (esPreAlta || esAltaIncompleta) {
                const fechaAlta = aFechaYMD(al.fecha_inicio_clases || al.fecha_inicio || al.fecha_alta);
                const fechaCreacion = aFechaYMD(al.fecha_alta_iniciada || al.fecha_creacion || al.fecha_ingreso) || hoyYMD;
                const tipoClase = al.tipo_suscripcion || al.instrumento_principal || 'Individual';

                if (fechaAlta) {
                    const diasFaltan = diffDiasCalendario(fechaAlta, hoyYMD);
                    const diffAltaCreacion = diffDiasCalendario(fechaAlta, fechaCreacion);
                    const aplicaAviso = (diffAltaCreacion > 1 || diasFaltan <= 0) && !al.pago_consultado;

                    if (aplicaAviso && diasFaltan <= 2) {
                        let sev = 1;
                        let txt = '';
                        if (diasFaltan < 0) {
                            sev = 3;
                            txt = `Alta vencida (${textoDiasRelativo(diasFaltan)})`;
                        } else if (diasFaltan === 0) {
                            sev = 3;
                            txt = 'Inicio de clases HOY';
                        } else if (diasFaltan === 1) {
                            sev = 2;
                            txt = 'Inicio de clases mañana (24 hs)';
                        } else {
                            sev = 1;
                            txt = `Inicio ${formatoDiaMes(fechaAlta)} (48 hs)`;
                        }

                        out.push({
                            id: al.id,
                            cat: 'pago',
                            grp: '🚀 Altas Pendientes y en Curso',
                            nom: al.nombre.trim(),
                            info: `${tipoClase} · ${txt}`,
                            sev,
                            popup: true,
                            accion: 'consulte',
                            alumnoId: al.id,
                            fechaRef: fechaAlta
                        });
                    }
                } else if (esPreAlta) {
                    const diasSinGestion = diffDiasCalendario(hoyYMD, fechaCreacion);
                    out.push({
                        id: al.id,
                        cat: 'gest',
                        grp: '🚀 Altas Pendientes y en Curso',
                        nom: al.nombre.trim(),
                        info: `Pre-alta sin fecha asignada hace ${diasSinGestion} d`,
                        sev: diasSinGestion >= 2 ? 2 : 1,
                        popup: true,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                } else if (esAltaIncompleta) {
                    out.push({
                        id: al.id,
                        cat: 'incompleta',
                        grp: '🚀 Altas Pendientes y en Curso',
                        nom: al.nombre.trim(),
                        info: `${tipoClase} · Falta checklist / matrícula`,
                        sev: 2,
                        popup: true,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                }
            }

            // "por profe" es el nombre histórico en Firestore del estado "esperando confirmación del evaluador"
            const esSinConfirmar = st === 'pendiente validacion por profe' || st === 'pendiente validacion por evaluador' || st === 'pendiente validacion por alumno';
            if (esSinConfirmar && !al.validacion_consultada) {
                const fechaEntrevista = aFechaYMD(al.reserva_inicio || al.reserva_fecha_texto || al.reserva_fecha);
                const fechaEnvio = aFechaYMD(al.fecha_envio_validacion || al.fecha_actualizacion || al.fecha_ingreso) || hoyYMD;
                const diasDesdeEnvio = diffDiasCalendario(hoyYMD, fechaEnvio);
                const diasFaltanEntrevista = fechaEntrevista ? diffDiasCalendario(fechaEntrevista, hoyYMD) : 999;

                if (diasDesdeEnvio >= 1 || diasFaltanEntrevista < 2) {
                    const quienFalta = st.includes('alumno') ? 'alumno' : 'evaluador';
                    out.push({
                        id: al.id,
                        cat: 'conf',
                        grp: '🗓️ Clases de Admisión',
                        nom: al.nombre.trim(),
                        info: `Falta confirmar ${quienFalta}${fechaEntrevista ? ` · clase de admisión ${formatoDiaMes(fechaEntrevista)}` : ' · clase de admisión sin fecha'}`,
                        sev: diasFaltanEntrevista < 2 ? 2 : 1,
                        popup: true,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                }
            }
        });
    }

    // 3. ENTREVISTAS AGENDADAS (EVALUADOR & ADMIN)
    if (verEntrevistas) {
        pool.forEach(al => {
            if (!al || !al.id) return;
            if (!al.nombre || typeof al.nombre !== 'string' || !al.nombre.trim()) return;
            if (al.es_baja || al.suspendido || al.estado_agenda === 'Baja') return;


            const st = (al.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const esConfirmada = st === 'agenda confirmada' || st === 'entrevista confirmada' || st.startsWith('entrevista');
            if (!esConfirmada) return;

            const esMiEntrevista = typeof window.esEvaluadorDeAlumno === 'function' 
                ? window.esEvaluadorDeAlumno(usuario, al)
                : (al.evaluador === usuario?.email || al.evaluador === usuario?.nombre || al.reserva_profe_id === usuario?.id);
            const esMock = al.es_caso_prueba || (typeof al.id === 'string' && al.id.startsWith('mock_'));


            // Sin excepción para casos mock: solo admin global o entrevistas propias (los mocks propios ya pasan por esMiEntrevista)
            if (!esMiEntrevista && !esModoAdminGlobal) {
                return;
            }

            const fechaEntrevista = aFechaYMD(al.reserva_inicio || al.reserva_fecha_texto);
            if (fechaEntrevista) {
                const dif = diffDiasCalendario(fechaEntrevista, hoyYMD);
                const horaTxt = al.reserva_hora || (typeof al.reserva_inicio === 'string' && al.reserva_inicio.includes('T') ? al.reserva_inicio.substring(11, 16) : '');
                const horaStr = horaTxt ? `${horaTxt} hs` : '';

                if (dif === 0) {
                    out.push({
                        id: al.id,
                        cat: 'hoy',
                        grp: '🗓️ Clases de Admisión',
                        nom: al.nombre.trim(),
                        info: `Clase de admisión HOY ${horaStr}`.trim(),
                        sev: 3,
                        popup: true,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                } else if (dif === 1) {
                    out.push({
                        id: al.id,
                        cat: 'man',
                        grp: '🗓️ Clases de Admisión',
                        nom: al.nombre.trim(),
                        info: `Clase de admisión mañana ${horaStr}`.trim(),
                        sev: 1,
                        popup: false,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                } else if (dif < 0 && (!al.informe_admision || al.informe_admision.trim().length === 0)) {
                    const docenteTxt = al.reserva_profe_nombre || al.profesor_asignado || '';
                    const docenteSufijo = docenteTxt ? ` (${docenteTxt})` : '';
                    out.push({
                        id: al.id,
                        cat: 'inf',
                        grp: '🗓️ Clases de Admisión',
                        nom: al.nombre.trim(),
                        info: `Clase de admisión ${formatoDiaMes(fechaEntrevista)} sin informe cargado${docenteSufijo}`,
                        sev: 2,
                        popup: true,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                }
            }
        });
    }

    // 4. SEGUIMIENTOS ACTIVOS
    if (verSeguimientos) {
        pool.forEach(al => {
            if (!al || !al.id) return;
            if (!al.nombre || typeof al.nombre !== 'string' || !al.nombre.trim()) return;
            const seg = al.seguimiento || {};
            if (seg.activo !== true || seg.finalizado === true) return;
            if (al.es_baja || al.suspendido || al.estado_agenda === 'Baja') return;


            const esMiSeguimiento = typeof window.esEvaluadorDeSeguimientoDelAlumno === 'function'
                ? window.esEvaluadorDeSeguimientoDelAlumno(usuario, al)
                : false;
            const esMock = al.es_caso_prueba || (typeof al.id === 'string' && al.id.startsWith('mock_'));


            // Si el usuario no es Admin ni Coordinador, solo ve sus propios seguimientos asignados
            // Seguimiento sin responsable: lo ven admin y coordinador (su tarea es asignarlo), sin popup. Nadie más.
            if (seguimientoSinResponsable(al)) {
                if (esModoAdminGlobal || esCoordGlobal) {
                    out.push({
                        id: al.id,
                        cat: 'sinresp',
                        grp: '👤 Seguimientos sin responsable',
                        nom: al.nombre.trim(),
                        info: 'Seguimiento activo sin responsable asignado · asignar un docente',
                        sev: 2,
                        popup: false,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                }
                return;
            }

            // Con responsable: lo ve el responsable, o el admin (que ve todo, pero sin popup). El coordinador NO ve los ajenos.
            if (!esModoAdminGlobal && !esMiSeguimiento) {
                return;
            }

            const fProx = aFechaYMD(seg.fecha_proximo_seguimiento || al.fecha_proximo_seguimiento);
            if (!fProx) {
                faltantes.push(al.nombre || 'Alumno sin nombre');
                return;
            }

            if (seg.contactado) {
                const fCont = aFechaYMD(seg.fecha_contacto || seg.ultimo_contacto);
                const diasDesdeContacto = fCont ? diffDiasCalendario(hoyYMD, fCont) : 0;
                if (diasDesdeContacto >= 3) {
                    out.push({
                        id: al.id,
                        cat: 'sinfb',
                        grp: '📞 Contactos de Seguimiento',
                        nom: al.nombre.trim(),
                        info: `Contactado hace ${diasDesdeContacto} d · registrar respuesta`,
                        sev: 1,
                        popup: false,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                }
            } else {
                const diasParaProx = diffDiasCalendario(fProx, hoyYMD);
                if (diasParaProx < 0) {
                    out.push({
                        id: al.id,
                        cat: 'venc',
                        grp: '📞 Contactos de Seguimiento',
                        nom: al.nombre.trim(),
                        info: `Contacto vencido (${textoDiasRelativo(diasParaProx)})`,
                        sev: 3,
                        // El popup insiste solo los primeros 3 días de vencido; después sigue visible en Mis Pendientes sin interrumpir
                        popup: diasParaProx >= -3,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                } else if (diasParaProx === 0) {
                    out.push({
                        id: al.id,
                        cat: 'venc',
                        grp: '📞 Contactos de Seguimiento',
                        nom: al.nombre.trim(),
                        info: 'Tocar base hoy según acordado',
                        sev: 2,
                        popup: true,
                        accion: 'ver',
                        alumnoId: al.id
                    });
                }
            }
        });
    }

    // POSPUESTOS: cada usuario oculta solo lo suyo (por alumno y sección); no afecta a los demás usuarios.
    for (let i = out.length - 1; i >= 0; i--) {
        if (estaPospuestoParaUsuario(usuario, out[i].alumnoId || out[i].id, out[i].cat, hoyYMD)) out.splice(i, 1);
    }

    // REGLA ADMIN: el admin ve todo pero no recibe popups. En modo "multi" con perfil admin solo conserva
    // el popup de lo que le corresponde por asignación propia (sus entrevistas y sus seguimientos).
    if (esModoAdminGlobal) {
        const esPropio = (it) => {
            const al = pool.find(a => a && a.id === it.id);
            if (!al) return false;
            if (it.cat === 'venc' || it.cat === 'sinfb') {
                return typeof window.esEvaluadorDeSeguimientoDelAlumno === 'function' && window.esEvaluadorDeSeguimientoDelAlumno(usuario, al) === true;
            }
            if (it.cat === 'hoy' || it.cat === 'man' || it.cat === 'inf') {
                return typeof window.esEvaluadorDeAlumno === 'function' && window.esEvaluadorDeAlumno(usuario, al) === true;
            }
            return false;
        };
        out.forEach(it => {
            if (rolEfectivo === 'admin' || !esPropio(it)) it.popup = false;
        });
    }

    out.sort((a, b) => b.sev - a.sev);
    return { out, faltantes, hoyYMD };
}
// =======================================================================
// ACCIÓN "YA CONSULTÉ" Y PERSISTENCIA FIRESTORE
// =======================================================================

export async function marcarPagoConsultado(alumnoId) {
    if (!alumnoId) return;

    const ahoraIso = new Date().toISOString();

    if (Array.isArray(window.alumnosMockupPrueba)) {
        const mockAl = window.alumnosMockupPrueba.find(a => a.id === alumnoId);
        if (mockAl) {
            mockAl.pago_consultado = true;
            mockAl.fecha_pago_consultado = ahoraIso;
        }
    }

    try {
        if (typeof window.actualizarAlumnoEnMemoriaLocal === 'function') {
            window.actualizarAlumnoEnMemoriaLocal(alumnoId, {
                pago_consultado: true,
                fecha_pago_consultado: ahoraIso
            });
        }
        
        const pool = obtenerPoolAlumnos();
        const al = pool.find(a => a.id === alumnoId);
        if (al) {
            al.pago_consultado = true;
            al.fecha_pago_consultado = ahoraIso;
        }

        if (alumnoId.startsWith('mock_') || alumnoId.startsWith('test_')) {
            if (typeof window.mostrarToast === 'function') {
                window.mostrarToast('\u2705 Recordatorio apagado: Marcado como consultado (Mock).', 'success');
            }
            refrescarMotorRecordatorios(false);
            const { out } = calcularPendientesRecordatorios();
            if (out.filter(o => o.popup).length === 0) {
                cerrarModalRecordatorios(0);
            } else {
                abrirModalRecordatorios(false);
            }
            return;
        }

        const docRef = doc(db, "alumnos", alumnoId);
        await updateDoc(docRef, {
            pago_consultado: true,
            fecha_pago_consultado: ahoraIso,
            fecha_actualizacion: ahoraIso
        });

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('\u2705 Recordatorio apagado: Marcado como consultado.', 'success');
        }

        refrescarMotorRecordatorios(false);

        const { out } = calcularPendientesRecordatorios();
        if (out.filter(o => o.popup).length === 0) {
            cerrarModalRecordatorios(0);
        } else {
            abrirModalRecordatorios(false);
        }
    } catch (e) {
        console.error("[Recordatorios] Error al marcar pago consultado:", e);
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('No se pudo guardar en el servidor: el aviso quedó apagado solo en esta pantalla y puede reaparecer al recargar.', 'warning');
        }
        refrescarMotorRecordatorios(false);
        abrirModalRecordatorios(false);
    }
}
window.marcarPagoConsultado = marcarPagoConsultado;

window.marcarPagoConsultadoYRefrescarVista = async function(alumnoId) {
    await marcarPagoConsultado(alumnoId);
    const pendContainer = document.getElementById('pendientes-view-container') || document.getElementById('contenedor-vistas');
    if (pendContainer && pendContainer.style.display !== 'none') {
        renderizarVistaMisPendientes(pendContainer);
    }
};

// =======================================================================
// ACCIÓN Y MODAL DE REPROGRAMACIÓN DE FECHA DE INICIO (PRE-ALTAS)
// =======================================================================

function formatearFechaLocal(ymd) {
    if (!ymd) return '';
    const partes = ymd.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return ymd;
}

export async function reprogramarFechaInicioClases(alumnoId, nuevaFechaYMD, nuevaHoraHHmm = '18:00') {
    if (!alumnoId || !nuevaFechaYMD) return false;

    const horaVal = (nuevaHoraHHmm && /^\d{2}:\d{2}$/.test(nuevaHoraHHmm.trim())) ? nuevaHoraHHmm.trim() : '18:00';
    const fechaHoraLocal = `${nuevaFechaYMD}T${horaVal}:00`;

    if (Array.isArray(window.alumnosMockupPrueba)) {
        const mockAl = window.alumnosMockupPrueba.find(a => a.id === alumnoId);
        if (mockAl) {
            mockAl.fecha_inicio_clases = fechaHoraLocal;
            mockAl.hora_inicio_clases = horaVal;
            mockAl.reserva_hora = horaVal;
            mockAl.horario_inicio_match = horaVal;
            mockAl.fecha_inicio = fechaHoraLocal;
            mockAl.pago_consultado = false;
        }
    }

    try {
        const ahoraIso = new Date().toISOString();
        const payload = {
            fecha_inicio_clases: fechaHoraLocal,
            hora_inicio_clases: horaVal,
            reserva_hora: horaVal,
            horario_inicio_match: horaVal,
            fecha_inicio: fechaHoraLocal,
            pago_consultado: false,
            fecha_actualizacion: ahoraIso
        };

        if (typeof window.actualizarAlumnoEnMemoriaLocal === 'function') {
            window.actualizarAlumnoEnMemoriaLocal(alumnoId, payload);
        }

        const pool = obtenerPoolAlumnos();
        const al = pool.find(a => a.id === alumnoId);
        if (al) {
            al.fecha_inicio_clases = fechaHoraLocal;
            al.hora_inicio_clases = horaVal;
            al.reserva_hora = horaVal;
            al.horario_inicio_match = horaVal;
            al.fecha_inicio = fechaHoraLocal;
            al.pago_consultado = false;
        }

        if (!alumnoId.startsWith('mock_') && !alumnoId.startsWith('test_')) {
            const docRef = doc(db, "alumnos", alumnoId);
            await updateDoc(docRef, payload);
        }

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(`📅 Inicio reprogramado al ${formatearFechaLocal(nuevaFechaYMD)} a las ${horaVal} hs.`, 'success');
        }

        refrescarMotorRecordatorios(false);

        const pendContainer = document.getElementById('pendientes-view-container') || document.getElementById('contenedor-vistas');
        if (pendContainer && pendContainer.style.display !== 'none') {
            renderizarVistaMisPendientes(pendContainer);
        }

        const { out } = calcularPendientesRecordatorios();
        if (out.filter(o => o.popup).length === 0) {
            cerrarModalRecordatorios(0);
        } else {
            abrirModalRecordatorios(false);
        }

        return true;
    } catch (e) {
        console.error("[Recordatorios] Error al reprogramar fecha de inicio:", e);
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Error al reprogramar fecha de inicio.', 'error');
        }
        return false;
    }
}
window.reprogramarFechaInicioClases = reprogramarFechaInicioClases;

export function extraerFechaYHoraDeAlumno(al) {
    if (!al) return { fActual: aFechaYMD(new Date()), horaActual: '18:00' };
    let fActual = '';
    let horaActual = '';

    if (al.horario_inicio_match && /^\d{1,2}:\d{2}$/.test(al.horario_inicio_match.trim())) {
        horaActual = al.horario_inicio_match.trim().padStart(5, '0');
    } else if (al.hora_inicio_clases && /^\d{1,2}:\d{2}$/.test(al.hora_inicio_clases.trim())) {
        horaActual = al.hora_inicio_clases.trim().padStart(5, '0');
    } else if (al.reserva_hora && /^\d{1,2}:\d{2}$/.test(al.reserva_hora.trim())) {
        horaActual = al.reserva_hora.trim().padStart(5, '0');
    } else if (al.hora_inicio && /^\d{1,2}:\d{2}$/.test(al.hora_inicio.trim())) {
        horaActual = al.hora_inicio.trim().padStart(5, '0');
    } else if (al.horario_cursada || al.horario_match || al.reserva_fecha_texto) {
        const textoH = al.horario_cursada || al.horario_match || al.reserva_fecha_texto || '';
        const m = textoH.match(/(\d{1,2}:\d{2})/);
        if (m) horaActual = m[1].padStart(5, '0');
    }

    const campoFecha = al.fecha_inicio_clases || al.fecha_inicio || al.fecha_alta;
    if (campoFecha) {
        if (typeof campoFecha === 'string') {
            const limpia = campoFecha.trim();
            if (limpia.includes('Z') || /[+-]\d{2}:\d{2}$/.test(limpia)) {
                const d = new Date(limpia);
                if (!isNaN(d.getTime())) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const dia = String(d.getDate()).padStart(2, '0');
                    fActual = `${y}-${m}-${dia}`;
                    if (!horaActual) {
                        horaActual = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    }
                }
            } else if (/^\d{4}-\d{2}-\d{2}/.test(limpia)) {
                fActual = limpia.substring(0, 10);
                if (!horaActual && limpia.includes('T')) {
                    const pT = limpia.split('T')[1];
                    if (pT) horaActual = pT.substring(0, 5);
                }
            }
        } else if (campoFecha instanceof Date && !isNaN(campoFecha.getTime())) {
            const y = campoFecha.getFullYear();
            const m = String(campoFecha.getMonth() + 1).padStart(2, '0');
            const dia = String(campoFecha.getDate()).padStart(2, '0');
            fActual = `${y}-${m}-${dia}`;
            if (!horaActual) {
                horaActual = `${String(campoFecha.getHours()).padStart(2, '0')}:${String(campoFecha.getMinutes()).padStart(2, '0')}`;
            }
        }
    }

    if (!fActual) fActual = aFechaYMD(campoFecha) || aFechaYMD(new Date());
    if (!horaActual) horaActual = '18:00';

    return { fActual, horaActual };
}
window.extraerFechaYHoraDeAlumno = extraerFechaYHoraDeAlumno;

export function abrirModalReprogramarFecha(alumnoId) {
    if (!alumnoId) return;
    const pool = obtenerPoolAlumnos();
    const al = pool.find(a => a.id === alumnoId) || (Array.isArray(window.alumnosMockupPrueba) ? window.alumnosMockupPrueba.find(a => a.id === alumnoId) : null);
    if (!al) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('No se encontró el alumno para reprogramar.', 'warning');
        }
        return;
    }

    const dlg = document.getElementById('modal-reprogramar-inicio');
    if (!dlg) return;

    const inpId = document.getElementById('reprog-alumno-id');
    const nomElem = document.getElementById('reprog-alumno-nombre');
    const fecActElem = document.getElementById('reprog-fecha-actual');
    const inpNueva = document.getElementById('reprog-nueva-fecha');
    const inpHora = document.getElementById('reprog-nueva-hora');

    if (inpId) inpId.value = alumnoId;
    if (nomElem) nomElem.textContent = al.nombre || 'Alumno';

    const { fActual, horaActual } = extraerFechaYHoraDeAlumno(al);

    if (fecActElem) {
        const fTxt = fActual ? formatearFechaLocal(fActual) : 'No definida';
        fecActElem.textContent = `${fTxt} · ${horaActual} hs`;
    }
    if (inpNueva) {
        inpNueva.value = fActual || aFechaYMD(new Date());
    }
    if (inpHora) {
        inpHora.value = horaActual;
    }

    try {
        if (typeof dlg.showModal === 'function') {
            if (!dlg.open) {
                dlg.style.display = '';
                dlg.showModal();
            }
        } else {
            dlg.style.display = 'block';
            dlg.setAttribute('open', '');
        }
    } catch (e) {
        dlg.style.display = 'block';
        dlg.setAttribute('open', '');
    }
}
window.abrirModalReprogramarFecha = abrirModalReprogramarFecha;

export function cerrarModalReprogramarFecha() {
    const dlg = document.getElementById('modal-reprogramar-inicio');
    if (dlg) {
        try {
            if (typeof dlg.close === 'function' && dlg.open) dlg.close();
            else dlg.style.display = 'none';
        } catch (e) {
            dlg.style.display = 'none';
        }
    }
}
window.cerrarModalReprogramarFecha = cerrarModalReprogramarFecha;

export async function guardarReprogramacionFechaInicio(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
    const inpId = document.getElementById('reprog-alumno-id');
    const inpNueva = document.getElementById('reprog-nueva-fecha');
    const inpHora = document.getElementById('reprog-nueva-hora');
    const alumnoId = inpId?.value;
    const nuevaFecha = inpNueva?.value;
    const nuevaHora = inpHora?.value || '18:00';

    if (!alumnoId || !nuevaFecha) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Por favor seleccioná una nueva fecha de inicio.', 'warning');
        }
        return;
    }

    const btn = document.getElementById('btn-confirmar-reprogramar');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Guardando...';
    }

    try {
        const ok = await reprogramarFechaInicioClases(alumnoId, nuevaFecha, nuevaHora);
        if (ok) {
            cerrarModalReprogramarFecha();
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Guardar nueva fecha';
        }
    }
}
window.guardarReprogramacionFechaInicio = guardarReprogramacionFechaInicio;

// =======================================================================
// REDIRECCIÓN DIRECTA A LA VISTA CORRESPONDIENTE DE CADA PENDIENTE
// =======================================================================

export function irAVistaDePendiente(alumnoId, cat) {
    // 1. Cerrar el modal bloqueante si está abierto sin poner snooze
    const dlg = document.getElementById('modal-recordatorios-bloqueante');
    if (dlg) {
        try {
            if (typeof dlg.close === 'function' && dlg.open) dlg.close();
            else dlg.style.display = 'none';
        } catch (e) {
            dlg.style.display = 'none';
        }
    }

    // 2. Determinar la vista destino
    let vistaDestino = 'Inbox - Pendientes';
    const pool = obtenerPoolAlumnos();
    const al = pool.find(a => a.id === alumnoId);
    if (cat === 'sin_agendar') {
        vistaDestino = 'Inbox - Pendientes';
    } else if (cat === 'conf') {
        const stConf = (al?.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        vistaDestino = stConf.includes('alumno') ? 'Inbox - Validar Alumno' : 'Inbox - Validar Evaluador';
    } else if (cat === 'sin_agendar_dummy') {
        vistaDestino = 'Inbox - Pendientes';
    } else if (cat === 'pago' || cat === 'gest' || cat === 'incompleta') {
        vistaDestino = 'Altas - Pendientes';
    } else if (cat === 'hoy' || cat === 'man' || cat === 'inf') {
        const rEf = obtenerRolEfectivoRecordatorios();
        vistaDestino = (rEf === 'evaluador' || rEf === 'docente' || rEf === 'profesor') ? 'Inbox - Confirmadas' : 'Dashboard';
    } else if (cat === 'hoy_dummy') {
        vistaDestino = 'Dashboard';
    } else if (cat === 'sinresp') {
        vistaDestino = 'Seguimientos - Pendientes';
    } else if (cat === 'venc' || cat === 'sinfb') {
        const rEf = obtenerRolEfectivoRecordatorios();
        vistaDestino = (rEf === 'docente' || rEf === 'profesor') ? 'Seguimientos - En Curso' : 'Seguimientos - Pendientes';
    }

    // 3. Cargar vista destino
    if (typeof window.cargarVistaGlobal === 'function') {
        window.cargarVistaGlobal(vistaDestino);
    }

    // 4. Abrir la ficha del alumno en dicha vista y seleccionar pestaña adecuada
    if (alumnoId) {
        setTimeout(() => {
            const abrirFn = window.editarAlumnoModalDirecto || window.editarAlumno;
            if (typeof abrirFn === 'function') {
                abrirFn(alumnoId);
            }
            setTimeout(() => {
                if (cat === 'inf' || cat === 'hoy') {
                    const btnTabInf = document.querySelector('.tab-btn[data-target="tab-informe"]');
                    if (btnTabInf) btnTabInf.click();
                } else if (cat === 'venc' || cat === 'sinfb') {
                    const btnTabSeg = document.getElementById('btn-tab-seguimiento') || document.querySelector('.tab-btn[data-target="tab-seguimiento"]');
                    if (btnTabSeg) btnTabSeg.click();
                }
            }, 300);
        }, 250);
}
}
window.irAVistaDePendiente = irAVistaDePendiente;

function generarBotonRedireccionPendiente(alumnoId, cat, esPopup = false) {
    const pad = esPopup ? 'padding:5px 9px; font-size:12px;' : 'padding:6px 12px; font-size:12px;';
    const def = CATEGORIAS_RECORDATORIO[cat]?.boton || { txt: 'Ver en Ficha', title: 'Abrir la ficha del alumno' };
    return `<button type="button" class="btn-app btn-secondary" onclick="window.irAVistaDePendiente('${alumnoId}', '${cat}')" style="${pad} font-weight:600; border-radius:6px; cursor:pointer;" title="${def.title}">${def.txt}</button>`;
}

// =======================================================================
// SINCRONIZACIÓN DE BADGES, TÍTULO DE PESTAÑA Y TAREAS DEL SISTEMA OPERATIVO
// =======================================================================

export function actualizarBadgesRecordatorios(outOrCount) {
    let out = [];
    let totalPendientes = 0;
    if (Array.isArray(outOrCount)) {
        out = outOrCount;
        totalPendientes = out.length;
    } else if (typeof outOrCount === 'number') {
        totalPendientes = outOrCount;
        try {
            const res = calcularPendientesRecordatorios();
            out = res.out || [];
        } catch (e) {
            out = [];
        }
    } else {
        try {
            const res = calcularPendientesRecordatorios();
            out = res.out || [];
            totalPendientes = out.length;
        } catch (e) {
            out = [];
            totalPendientes = 0;
        }
    }

    ultimoConteoPendientes = totalPendientes;
    const rolEfectivo = obtenerRolEfectivoRecordatorios();
    const esProfe = rolEfectivo === 'profesor' || rolEfectivo === 'docente';
    const baseTitle = 'MDL Admisi\u00F3n';
    document.title = totalPendientes > 0 ? `(${totalPendientes}) ${baseTitle}` : baseTitle;

    if ('setAppBadge' in navigator) {
        try {
            if (totalPendientes > 0) {
                navigator.setAppBadge(totalPendientes);
            } else {
                navigator.clearAppBadge();
            }
        } catch (e) {}
    }

    // Badge en sidebar: Mis Pendientes
    const badgeSidebar = document.getElementById('badge-recordatorios-sidebar');
    if (badgeSidebar) {
        badgeSidebar.textContent = totalPendientes;
        badgeSidebar.style.display = totalPendientes > 0 ? 'inline-block' : 'none';
        if (totalPendientes > 0) {
            badgeSidebar.classList.add('badge-pulse-warning');
        } else {
            badgeSidebar.classList.remove('badge-pulse-warning');
        }
    }

    // Boton / Campana en header
    const btnHeader = document.getElementById('btn-recordatorios-header');
    const badgeHeader = document.getElementById('badge-recordatorios-header');
    if (btnHeader && badgeHeader) {
        badgeHeader.textContent = totalPendientes;
        btnHeader.style.display = totalPendientes > 0 ? 'inline-flex' : 'none';
        if (totalPendientes > 0) {
            badgeHeader.classList.add('badge-pulse-warning');
        } else {
            badgeHeader.classList.remove('badge-pulse-warning');
        }
    }

    // Badge de Altas en sidebar: titila SOLO si hay alertas activas de altas (pre-altas sin fecha, inicios en <= 48hs o vencidas)
    const alertasAltas = out.filter(item => 
        item.cat === 'pago' || 
        item.cat === 'gest' || 
        item.cat === 'incompleta' ||
        (item.grp && item.grp.toLowerCase().includes('altas'))
    ).length;

    const bAltas = document.getElementById('badge-altas');
    if (bAltas) {
        if (alertasAltas > 0) {
            bAltas.classList.add('badge-pulse-warning');
        } else {
            bAltas.classList.remove('badge-pulse-warning');
        }
    }

    // Badge de Inbox en sidebar: titila SOLO si hay alertas activas de inbox (alumnos sin agendar o validaciones con tiempo vencido/por vencer)
    const alertasInbox = out.filter(item => 
        item.cat === 'sin_agendar' || 
        item.cat === 'conf' || 
        item.cat === 'val_vencida' ||
        (item.grp && item.grp.toLowerCase().includes('inbox'))
    ).length;

    const alertasSeg = out.filter(item => item.cat === 'venc' || item.cat === 'sinfb').length;
    const bSeg = document.getElementById('badge-seguimientos');
    if (bSeg) {
        if (alertasSeg > 0) {
            bSeg.classList.add('badge-pulse-warning');
        } else {
            bSeg.classList.remove('badge-pulse-warning');
        }
    }

    const bInbox = document.getElementById('badge-inbox');
    if (bInbox) {
        if (alertasInbox > 0) {
            bInbox.classList.add('badge-pulse-warning');
        } else {
            bInbox.classList.remove('badge-pulse-warning');
        }
    }
}

// =======================================================================
// RENDER Y GESTIÓN DEL MODAL BLOQUEANTE
// =======================================================================

export function abrirModalRecordatorios(forzar = false) {
    const { out } = calcularPendientesRecordatorios();
    // NUNCA incluir 'sin_agendar' en el popup bloqueante, ni siquiera si forzar es true
    const itemsPopup = out.filter(o => o.popup === true && o.cat !== 'sin_agendar');

    if (itemsPopup.length === 0) {
        cerrarModalRecordatorios(0);
        return;
    }

    if (!forzar && popupEnPausa(obtenerFechaReferenciaHoyYMD())) {
        return;
    }

    const dlg = document.getElementById('modal-recordatorios-bloqueante');
    if (!dlg) return;

    const cont = document.getElementById('modal-recordatorios-contenido');
    if (!cont) return;

    const grupos = {};
    itemsPopup.forEach(item => {
        if (!grupos[item.grp]) grupos[item.grp] = [];
        grupos[item.grp].push(item);
    });

    let html = `
        <div style="text-align:center; padding: 12px 16px 14px 16px; border-bottom:1px solid var(--border-color);">
            <div style="font-size:36px; line-height:1; margin-bottom:6px;">⏰</div>
            <h3 style="margin:0 0 4px 0; font-size:18px; font-weight:800; color:var(--text-main);">Recordatorios que requieren tu atención</h3>
            <p style="margin:0; font-size:13px; color:var(--text-muted);">Tenés <strong>${itemsPopup.length} asunto(s) pendiente(s)</strong> clave para revisar hoy.</p>
        </div>
        <div data-scroll-popup="1" style="padding:14px 16px; flex:1 1 auto; min-height:0; max-height:60vh; overflow-y:auto; display:flex; flex-direction:column; gap:12px; scrollbar-width:thin; scrollbar-color:#cbd5e1 #f8fafc;">
    `;

    Object.keys(grupos).forEach(grpNom => {
        // flex-shrink:0 evita que las tarjetas se compriman (y oculten filas) cuando hay muchos ítems: el contenedor hace scroll
        html += `
            <div style="flex-shrink:0; background:#faf9f6; border:1px solid var(--border-color); border-radius:10px; overflow:hidden;">
                <div style="padding:8px 12px; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; color:#475569; background:#f1eee7; display:flex; justify-content:space-between; align-items:center;">
                    <span>${grpNom}</span>
                    <span style="background:#e2ded4; color:#334155; padding:1px 6px; border-radius:999px; font-size:11px;">${grupos[grpNom].length}</span>
                </div>
                <div style="display:flex; flex-direction:column;">
        `;

        grupos[grpNom].forEach(it => {
            const sevTag = it.sev >= 3 
                ? 'background:#fee2e2; color:#991b1b; border:1px solid #fecaca;' 
                : (it.sev === 2 ? 'background:#fef3c7; color:#92400e; border:1px solid #fde68a;' : 'background:#e0f2fe; color:#075985; border:1px solid #bae6fd;');
            const sevLabel = it.sev >= 3 ? 'URGENTE' : (it.sev === 2 ? 'ATENCIÓN' : 'PRÓXIMO');

            html += `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid #ece8de; font-size:13px;">
                    <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <strong style="color:var(--text-main); font-size:13.5px;">${escaparHtmlRecordatorio(it.nom)}</strong>
                            <span style="font-size:10px; font-weight:800; padding:2px 7px; border-radius:12px; ${sevTag}">${sevLabel}</span>
                        </div>
                        <div style="color:var(--text-muted); font-size:12px;">${escaparHtmlRecordatorio(it.info)}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                        ${it.accion === 'consulte' ? `
                            <button type="button" class="btn-app btn-primary" onclick="window.marcarPagoConsultado('${it.alumnoId}')" title="Registrar que ya se consultó el pago y apagar este aviso">
                                Ya consulté
                            </button>
                        ` : ''}
                        ${(it.cat === 'pago' || it.cat === 'gest' || it.cat === 'incompleta') ? `
                            <button type="button" class="btn-app btn-secondary" onclick="window.abrirModalReprogramarFecha('${it.alumnoId}')" title="Reprogramar fecha de inicio de clases">
                                📅 Reprogramar
                            </button>
                        ` : ''}
                        ${generarBotonRedireccionPendiente(it.alumnoId, it.cat, true)}
                        <button type="button" class="btn-app btn-secondary" onclick="window.posponerRecordatorioAlumnoManana('${it.alumnoId}', '${it.cat}')" title="Silenciar y recordar este alumno mañana">
                            🌙 Recordar mañana
                        </button>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    if (itemsPopup.length > 5) {
        html += `
            <div style="flex-shrink:0; text-align:center; font-size:11.5px; color:var(--text-muted); padding:4px 0;">
                ↕ Deslizá hacia abajo para recorrer todos los recordatorios (${itemsPopup.length} en total)
            </div>
        `;
    }

    html += `
        </div>
        <div style="padding:14px 16px 16px; border-top:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; background:#ffffff;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:12px; font-weight:700; color:var(--text-muted); margin-right:2px;">⏱️ Recordar en:</span>
                <button type="button" class="btn-app btn-secondary" onclick="window.cerrarModalRecordatorios(30)" title="Recordármelo en 30 minutos">
                    30 min
                </button>
                <button type="button" class="btn-app btn-secondary" onclick="window.cerrarModalRecordatorios(120)" title="Recordármelo en 2 horas">
                    2 hs
                </button>
                <button type="button" class="btn-app btn-secondary" onclick="window.cerrarModalRecordatorios(240)" title="Recordármelo en 4 horas">
                    4 hs
                </button>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" class="btn-app btn-secondary" onclick="window.posponerPopupManana()" style="min-width:150px; white-space:nowrap;" title="Silenciar alertas y recordar todo mañana">
                    🌙 Recordar mañana
                </button>
                <button type="button" class="btn-app btn-primary" onclick="window.atenderRecordatoriosAhora()" style="min-width:150px; white-space:nowrap;">
                    Atender ahora →
                </button>
            </div>
        </div>
    `;

    // Si el popup ya está abierto y no cambió nada, no se vuelve a dibujar (evita perder el scroll en cada chequeo automático)
    if (dlg.open && _ultimoHtmlPopup === html) return;
    const scrollPrevio = cont.querySelector('[data-scroll-popup]')?.scrollTop || 0;
    cont.innerHTML = html;
    _ultimoHtmlPopup = html;
    if (dlg.open && scrollPrevio) {
        const scroller = cont.querySelector('[data-scroll-popup]');
        if (scroller) scroller.scrollTop = scrollPrevio;
    }

    try {
        if (typeof dlg.showModal === 'function') {
            if (!dlg.open) {
                dlg.style.display = '';
                dlg.showModal();
            }
        } else {
            dlg.style.display = 'block';
            dlg.setAttribute('open', '');
        }
    } catch (e) {
        dlg.style.display = 'block';
        dlg.setAttribute('open', '');
    }
}
window.abrirModalRecordatorios = abrirModalRecordatorios;

export function cerrarModalRecordatorios(minutosSnooze = 0) {
    // 1. Limpiar reintentos previos
    _timeoutsReintentosRecordatorios.forEach(t => clearTimeout(t));
    _timeoutsReintentosRecordatorios = [];

    // 2. Cerrar y ocultar el modal antes de disparar el toast (para no atrapar el toast adentro del modal cerrado)
    const dlg = document.getElementById('modal-recordatorios-bloqueante');
    if (dlg) {
        try {
            if (typeof dlg.close === 'function' && dlg.open) {
                dlg.close();
            }
        } catch (e) {}
        dlg.removeAttribute('open');
        dlg.style.display = 'none';
    }

    // 3. Si se especificó snooze, configurar el temporizador y persistir
    if (minutosSnooze > 0) {
        if (timerSnooze) {
            clearTimeout(timerSnooze);
            timerSnooze = null;
        }
        const rolKey = obtenerRolEfectivoRecordatorios();
        const u = window.usuarioActual || {};
        const uidKey = u.id || u.email || 'anon';
        const snoozeTs = Date.now() + (minutosSnooze * 60 * 1000);

        snoozePorRolMap[claveSnooze(rolKey)] = snoozeTs;
        snoozeHastaTimestamp = snoozeTs;

        try {
            sessionStorage.setItem(`mandala_snooze_${uidKey}_${rolKey}`, String(snoozeTs));
            if (minutosSnooze >= 30) {
                localStorage.setItem(`mandala_snooze_${uidKey}_${rolKey}`, String(snoozeTs));
            }
        } catch (e) {}

        if (u && u.id && !u.id.startsWith('mock_') && minutosSnooze >= 30) {
            u.popup_snooze_por_rol = { ...(u.popup_snooze_por_rol || {}), [rolKey]: snoozeTs };
            try {
                const uRef = doc(db, "usuarios_sistema", u.id);
                updateDoc(uRef, { [`popup_snooze_por_rol.${rolKey}`]: snoozeTs }).catch(e => console.warn('[Recordatorios] No se pudo persistir la pausa en el servidor; queda solo en este navegador.', e));
            } catch (e) {}
        }

        // +1,5 s de margen: los temporizadores del navegador pueden disparar unos ms antes y el popup quedaría en pausa hasta el próximo chequeo
        timerSnooze = setTimeout(() => {
            abrirModalRecordatorios(false);
        }, minutosSnooze * 60 * 1000 + 1500);

        const txt = minutosSnooze >= 1440 ? '24 horas' : (minutosSnooze >= 60 ? `${Math.round(minutosSnooze/60)} horas` : `${minutosSnooze} minutos`);
        setTimeout(() => {
            if (typeof window.mostrarToast === 'function') {
                window.mostrarToast(`⏱️ Recordatorio pospuesto por ${txt}.`, 'info');
            }
        }, 50);
    }
}
window.cerrarModalRecordatorios = cerrarModalRecordatorios;
export function atenderRecordatoriosAhora() {
    cerrarModalRecordatorios(0);
    const { out } = calcularPendientesRecordatorios();
    const primer = out.find(o => o.popup);
    if (!primer) return;

    // Pausa corta solo en memoria: mientras la persona atiende el pendiente, el popup no vuelve a abrirse al cambiar de pestaña
    snoozePorRolMap[claveSnooze(obtenerRolEfectivoRecordatorios())] = Date.now() + 15 * 60 * 1000;

    irAVistaDePendiente(primer.alumnoId, primer.cat);
}
window.atenderRecordatoriosAhora = atenderRecordatoriosAhora;

export function abrirFichaDesdeRecordatorio(alumnoId) {
    if (typeof window.editarAlumnoModalDirecto === 'function') {
        window.editarAlumnoModalDirecto(alumnoId);
    } else if (typeof window.editarAlumno === 'function') {
        window.editarAlumno(alumnoId);
    }
}
window.abrirFichaDesdeRecordatorio = abrirFichaDesdeRecordatorio;

// =======================================================================
// VISTA COMPLETA "MIS PENDIENTES"
// =======================================================================

export function renderizarVistaMisPendientes(container, fechaManual = null) {
    if (!container) container = document.getElementById('pendientes-view-container') || document.getElementById('contenedor-vistas');
    if (!container) return;

    const hoySimulada = obtenerFechaReferenciaHoyYMD(fechaManual);
    const { out, faltantes } = calcularPendientesRecordatorios(hoySimulada);
    
    const contarSeccion = (sec) => out.filter(o => seccionDeCategoria(o.cat) === sec).length;
    const sinAgendarCount = contarSeccion('inbox');
    const altasCount = contarSeccion('altas');
    const entrevistasCount = contarSeccion('entrevistas');
    const segCount = contarSeccion('seguimientos');

    const usuario = window.usuarioActual || {};
    const { verSinAgendar, verAltasYValidaciones, verEntrevistas, verSeguimientos } = obtenerPermisosRecordatorios(usuario, obtenerRolEfectivoRecordatorios());

    const grupos = {};
    out.forEach(item => {
        if (!grupos[item.grp]) grupos[item.grp] = [];
        grupos[item.grp].push(item);
    });

    let html = `
        <div class="vista-mis-pendientes" style="display:flex; flex-direction:column; gap:20px; max-width:980px; margin:0 auto; padding-bottom:40px;">
            <!-- ENCABEZADO DE VISTA -->
            <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:14px; padding:20px 24px; box-shadow:0 1px 3px rgba(0,0,0,0.03); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                <div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:26px;">🔔</span>
                        <h2 style="margin:0; font-size:20px; font-weight:800; color:var(--text-main);">Mis Pendientes y Recordatorios Operativos</h2>
                    </div>
                    <p style="margin:6px 0 0 0; font-size:13px; color:var(--text-muted); line-height:1.45;">
                        Panel de control centralizado de ingresos sin agendar, altas pendientes, clases de admisión clave y seguimientos críticos.
                    </p>
                </div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <button type="button" class="btn-app btn-primary" onclick="window.abrirModalRecordatorios(true)" style="display:inline-flex;">
                        <span>⏰</span> Abrir Popup de Alertas
                    </button>
                </div>
            </div>

            <!-- TARJETAS DE MÉTRICAS KPI -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
                <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:12px; padding:14px 18px; display:flex; flex-direction:column; gap:4px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                    <span style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.4px;">Total Pendientes</span>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span style="font-size:28px; font-weight:900; color:${out.length > 0 ? '#dc2626' : '#16a34a'};">${out.length}</span>
                        <span style="font-size:12px; color:var(--text-muted); font-weight:600;">asuntos activos</span>
                    </div>
                </div>

                ${verSinAgendar ? `
                <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:12px; padding:14px 18px; display:flex; flex-direction:column; gap:4px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                    <span style="font-size:12px; font-weight:700; color:#0369a1; text-transform:uppercase; letter-spacing:0.4px;">📥 Sin Agendar</span>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span style="font-size:28px; font-weight:900; color:#0284c7;">${sinAgendarCount}</span>
                        <span style="font-size:12px; color:var(--text-muted); font-weight:600;">ingresos Inbox</span>
                    </div>
                </div>
                ` : ''}

                ${verAltasYValidaciones ? `
                <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:12px; padding:14px 18px; display:flex; flex-direction:column; gap:4px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                    <span style="font-size:12px; font-weight:700; color:#15803d; text-transform:uppercase; letter-spacing:0.4px;">🚀 Altas en Curso</span>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span style="font-size:28px; font-weight:900; color:#16a34a;">${altasCount}</span>
                        <span style="font-size:12px; color:var(--text-muted); font-weight:600;">pagos & checklist</span>
                    </div>
                </div>
                ` : ''}

                ${(verEntrevistas || verAltasYValidaciones) ? `
                <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:12px; padding:14px 18px; display:flex; flex-direction:column; gap:4px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                    <span style="font-size:12px; font-weight:700; color:#854d0e; text-transform:uppercase; letter-spacing:0.4px;">🗓️ Clases de admisión</span>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span style="font-size:28px; font-weight:900; color:#d97706;">${entrevistasCount}</span>
                        <span style="font-size:12px; color:var(--text-muted); font-weight:600;">hoy / pend. informe</span>
                    </div>
                </div>
                ` : ''}

                ${verSeguimientos ? `
                <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:12px; padding:14px 18px; display:flex; flex-direction:column; gap:4px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                    <span style="font-size:12px; font-weight:700; color:#6d28d9; text-transform:uppercase; letter-spacing:0.4px;">📞 Seguimientos</span>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span style="font-size:28px; font-weight:900; color:#7c3aed;">${segCount}</span>
                        <span style="font-size:12px; color:var(--text-muted); font-weight:600;">vencidos / por contactar</span>
                    </div>
                </div>
                ` : ''}
            </div>
            <!-- LISTADO DE GRUPOS DE PENDIENTES -->
            <div style="display:flex; flex-direction:column; gap:16px;">
    `;

    if (out.length === 0) {
        html += `
            <div style="background:#ffffff; border:1px dashed var(--border-color); border-radius:14px; padding:40px 20px; text-align:center; color:var(--text-muted);">
                <div style="font-size:40px; margin-bottom:10px;">🎉</div>
                <h4 style="margin:0 0 6px 0; font-size:17px; font-weight:800; color:var(--text-main);">No tenés pendientes asignados para esta fecha</h4>
                <p style="margin:0; font-size:13px;">Todo tu flujo operativo asignado se encuentra al día. Podés usar el simulador superior para evaluar otras fechas o roles.</p>
            </div>
        `;
    } else {
        Object.keys(grupos).forEach(grpNom => {
            const items = grupos[grpNom];
            html += `
                <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                    <div style="padding:12px 18px; background:#f8fafc; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:14px; font-weight:800; color:#1e293b;">${grpNom}</span>
                            <span style="background:#e2ded4; color:#334155; font-size:11px; font-weight:800; padding:2px 8px; border-radius:999px;">${items.length}</span>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column;">
            `;

            items.forEach(it => {
                const sevTag = it.sev >= 3 
                    ? 'background:#fee2e2; color:#991b1b; border:1px solid #fecaca;' 
                    : (it.sev === 2 ? 'background:#fef3c7; color:#92400e; border:1px solid #fde68a;' : 'background:#e0f2fe; color:#075985; border:1px solid #bae6fd;');
                const sevLabel = it.sev >= 3 ? 'URGENTE' : (it.sev === 2 ? 'ATENCIÓN' : 'PRÓXIMO');

                html += `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 18px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap;">
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1; min-width:240px;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span style="font-size:14px; font-weight:700; color:var(--text-main);">${escaparHtmlRecordatorio(it.nom)}</span>
                                <span style="font-size:10px; font-weight:800; padding:2px 7px; border-radius:12px; ${sevTag}">${sevLabel}</span>
                            </div>
                            <span style="font-size:12.5px; color:var(--text-muted);">${escaparHtmlRecordatorio(it.info)}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                            ${it.accion === 'consulte' ? `
                                <button type="button" class="btn-app btn-primary" onclick="window.marcarPagoConsultadoYRefrescarVista('${it.alumnoId}')" title="Registrar que ya se consultó el pago y apagar este recordatorio">
                                    Ya consulté
                                </button>
                            ` : ''}
                            ${(it.cat === 'pago' || it.cat === 'gest' || it.cat === 'incompleta') ? `
                                <button type="button" class="btn-app btn-secondary" onclick="window.abrirModalReprogramarFecha('${it.alumnoId}')" title="Reprogramar fecha de inicio de clases">
                                    📅 Reprogramar
                                </button>
                            ` : ''}
                            ${generarBotonRedireccionPendiente(it.alumnoId, it.cat, false)}
                            <button type="button" class="btn-app btn-secondary" onclick="window.posponerRecordatorioAlumnoManana('${it.alumnoId}', '${it.cat}')" title="Silenciar y recordar este alumno mañana">
                                🌙 Recordar mañana
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });
    }

    if (faltantes && faltantes.length > 0) {
        html += `
            <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:10px; padding:12px 16px; font-size:12.5px; color:#92400e; display:flex; align-items:flex-start; gap:8px;">
                <span>ℹ️</span>
                <span><strong>${faltantes.length} alumno(s) en seguimiento</strong> no tienen cargada una fecha de próximo contacto (${faltantes.map(f => escaparHtmlRecordatorio(f)).join(', ')}). No se pueden controlar de forma automática.</span>
            </div>
        `;
    }

    html += `
        </div>
    `;

    container.innerHTML = html;
}
window.renderizarVistaMisPendientes = renderizarVistaMisPendientes;

// =======================================================================
// HERRAMIENTAS DEL SIMULADOR PARA PRUEBAS (ENTORNO LOCAL)
// =======================================================================

export function inyectarAlumnosMockupParaPruebas() {
    const miEmail = window.usuarioActual?.email || 'pablo@mandalahouse.com';
    const miNom = window.usuarioActual?.nombre || 'Pablo';
    const miId = window.usuarioActual?.id || 'pablo_admin';

    window.alumnosMockupPrueba = [
        {
            id: 'mock_p1',
            nombre: 'Martina Ruiz (Mockup)',
            tipo_suscripcion: 'Grupal',
            instrumento_principal: 'Canto',
            estado_agenda: 'Pre-alta Iniciada',
            fecha_inicio_clases: '2026-10-31',
            fecha_creacion: '2026-10-28T10:00:00Z',
            fecha_alta_iniciada: '2026-10-28T10:00:00Z',
            pago_consultado: false,
            es_caso_prueba: true
        },
        {
            id: 'mock_p2',
            nombre: 'Tom\u00E1s Vera (Mockup)',
            tipo_suscripcion: 'Individual',
            instrumento_principal: 'Guitarra',
            estado_agenda: 'Pre-alta Iniciada',
            fecha_inicio_clases: '2026-11-01',
            fecha_creacion: '2026-10-27T10:00:00Z',
            fecha_alta_iniciada: '2026-10-27T10:00:00Z',
            pago_consultado: false,
            es_caso_prueba: true
        },
        {
            id: 'mock_p4',
            nombre: 'Juli\u00E1n Bravo (Mockup)',
            tipo_suscripcion: 'Individual',
            instrumento_principal: 'Bater\u00EDa',
            estado_agenda: 'Pre-alta Iniciada',
            fecha_inicio_clases: '2026-10-29',
            fecha_creacion: '2026-10-20T10:00:00Z',
            fecha_alta_iniciada: '2026-10-20T10:00:00Z',
            pago_consultado: false,
            es_caso_prueba: true
        },
        {
            id: 'mock_g1',
            nombre: 'Camila Roth (Mockup)',
            tipo_suscripcion: 'Grupal',
            instrumento_principal: 'Teclado',
            estado_agenda: 'Pre-alta Pendiente',
            fecha_creacion: '2026-10-29T10:00:00Z',
            es_caso_prueba: true
        },
        {
            id: 'mock_e1',
            nombre: 'Bruno Salas (Mockup)',
            instrumento_principal: 'Bajo',
            estado_agenda: 'Pendiente Validacion por Alumno',
            reserva_inicio: '2026-11-02T15:00:00Z',
            fecha_envio_validacion: '2026-10-30T09:00:00Z',
            validacion_consultada: false,
            es_caso_prueba: true
        },
        {
            id: 'mock_v1',
            nombre: 'Ana G\u00F3mez (Mockup)',
            instrumento_principal: 'Canto',
            estado_agenda: 'Entrevista Confirmada',
            reserva_inicio: '2026-10-31T17:00:00Z',
            reserva_hora: '17:00',
            evaluador: miEmail,
            reserva_profe_id: miId,
            es_caso_prueba: true
        },
        {
            id: 'mock_s1',
            nombre: 'Felipe Gialdino (Mockup)',
            instrumento_principal: 'Guitarra',
            estado_agenda: 'Alta Finalizada',
            seguimiento: {
                activo: true,
                contactado: false,
                fecha_proximo_seguimiento: '2026-10-30',
                responsable_id: miId,
                responsable_email: miEmail,
                responsable_nombre: miNom
            },
            es_caso_prueba: true
        },
        {
            id: 'mock_s3',
            nombre: 'Mora Paz (Mockup)',
            instrumento_principal: 'Piano',
            estado_agenda: 'Alta Finalizada',
            seguimiento: {
                activo: true,
                contactado: true,
                fecha_contacto: '2026-10-27',
                fecha_proximo_seguimiento: '2026-10-31',
                responsable_id: miId,
                responsable_email: miEmail,
                responsable_nombre: miNom
            },
            es_caso_prueba: true
        }
    ];

    if (typeof window.mostrarToast === 'function') {
        window.mostrarToast('\uD83D\uDCE6 8 alumnos del mockup inyectados para prueba.', 'success');
    }
    
    refrescarMotorRecordatorios(true);
    
    const pendContainer = document.getElementById('pendientes-view-container') || document.getElementById('contenedor-vistas');
    if (pendContainer && pendContainer.style.display !== 'none') {
        renderizarVistaMisPendientes(pendContainer);
    }

    abrirModalRecordatorios(true);
}
window.inyectarAlumnosMockupParaPruebas = inyectarAlumnosMockupParaPruebas;

export function reiniciarConsultadosSimulador() {
    if (Array.isArray(window.alumnosMockupPrueba)) {
        window.alumnosMockupPrueba.forEach(a => {
            a.pago_consultado = false;
            a.validacion_consultada = false;
        });
    }
    const pool = obtenerPoolAlumnos();
    pool.forEach(a => {
        if (a.pago_consultado) a.pago_consultado = false;
        if (a.validacion_consultada) a.validacion_consultada = false;
    });
        const u = window.usuarioActual || {};
    if (u) {
        u.popup_silenciado_hasta = null;
        u.popup_silenciado_por_rol = {};
        u.popup_snooze_por_rol = {};
        u.recordatorios_pospuestos = {};
    }
    snoozePorRolMap = {};
    snoozeHastaTimestamp = 0;

    if (u && u.id && !u.id.startsWith('mock_')) {
        try {
            const uRef = doc(db, "usuarios_sistema", u.id);
            updateDoc(uRef, {
                popup_silenciado_hasta: null,
                popup_silenciado_por_rol: {},
                popup_snooze_por_rol: {},
                recordatorios_pospuestos: {}
            }).catch(e => console.warn('[Recordatorios] No se pudo reiniciar el estado en el servidor', e));
        } catch(e) {}
    }
    pool.forEach(a => {
        if (a.recordatorio_omitido) a.recordatorio_omitido = false;
        if (a.recordatorio_pospuesto_hasta) a.recordatorio_pospuesto_hasta = null;
    });
    snoozeHastaTimestamp = 0;
    try {
        localStorage.removeItem('mandala_recordatorios_silenciado_hasta');
        sessionStorage.removeItem('mandala_recordatorios_silenciado_hasta');
    } catch(e) {}
    try {
        localStorage.removeItem('mandala_recordatorios_omitidos');
        localStorage.removeItem('mandala_recordatorios_snooze');
        localStorage.removeItem('mandala_recordatorios_descartado_hoy');
        localStorage.removeItem('mandala_recordatorios_descartado_ts');
        sessionStorage.removeItem('mandala_recordatorios_descartado_ts');
        sessionStorage.removeItem('mandala_recordatorios_snooze');
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('mandala_silenciado_') || k.startsWith('mandala_snooze_')) localStorage.removeItem(k);
        });
        Object.keys(sessionStorage).forEach(k => {
            if (k.startsWith('mandala_silenciado_') || k.startsWith('mandala_snooze_')) sessionStorage.removeItem(k);
        });
    } catch(e) {}
    pool.forEach(a => { if (a.recordatorio_omitido) a.recordatorio_omitido = false; });
    if (typeof window.mostrarToast === 'function') {
        window.mostrarToast('\u21BA Estados "Ya consult\u00E9" y omitidos reiniciados.', 'info');
    }
    
    refrescarMotorRecordatorios(true);
    const pendContainer = document.getElementById('pendientes-view-container') || document.getElementById('contenedor-vistas');
    if (pendContainer && pendContainer.style.display !== 'none') {
        renderizarVistaMisPendientes(pendContainer);
    }
    abrirModalRecordatorios(true);
}
window.reiniciarConsultadosSimulador = reiniciarConsultadosSimulador;
window.resetearSilenciosRecordatorios = reiniciarConsultadosSimulador;

export function ejecutarSimulacionDesdeBarra() {
    const inputFecha = document.getElementById('sim-fecha-input');
    const selectRol = document.getElementById('sim-rol-select');
    
    const fecha = inputFecha?.value || obtenerFechaReferenciaHoyYMD();
    const rol = selectRol?.value;
    
    if (rol && rol !== 'actual' && rol !== 'multi' && window.modoRolActivo !== rol) {
        if (typeof window.cambiarModoRol === 'function') {
            window.cambiarModoRol(rol);
        }
    }
    
    const res = calcularPendientesRecordatorios(fecha);
    actualizarBadgesRecordatorios(res.out);
    
    const pendContainer = document.getElementById('pendientes-view-container') || document.getElementById('contenedor-vistas');
    if (pendContainer && pendContainer.style.display !== 'none') {
        renderizarVistaMisPendientes(pendContainer, fecha);
    }
    
    abrirModalRecordatorios(true);
}
window.ejecutarSimulacionDesdeBarra = ejecutarSimulacionDesdeBarra;

// =======================================================================
// INICIALIZADOR Y OBSERVADORES EN TIEMPO REAL
// =======================================================================

export function refrescarMotorRecordatorios(abrirPopupSiCorresponde = false) {
    const { out } = calcularPendientesRecordatorios();
    actualizarBadgesRecordatorios(out);

    if (abrirPopupSiCorresponde) {
        if (popupEnPausa(obtenerFechaReferenciaHoyYMD())) {
            return;
        }

        const itemsPopup = out.filter(o => o.popup === true && o.cat !== 'sin_agendar');
        if (itemsPopup.length > 0) {
            abrirModalRecordatorios(false);
        }
    }
}
window.refrescarMotorRecordatorios = refrescarMotorRecordatorios;

export function inicializarMotorRecordatorios() {
    sincronizarBarraSimuladorLocal();
    if (modalRecordatoriosInicializado) {
        refrescarMotorRecordatorios(true);
        return;
    }
    modalRecordatoriosInicializado = true;

    try {
        const u = window.usuarioActual || {};
        const uidKey = u.id || 'anon';
        const rolKey = obtenerRolEfectivoRecordatorios();
        const sn = sessionStorage.getItem(`mandala_snooze_${uidKey}_${rolKey}`) || localStorage.getItem(`mandala_snooze_${uidKey}_${rolKey}`);
        if (sn) {
            snoozePorRolMap[claveSnooze(rolKey)] = Number(sn);
            snoozeHastaTimestamp = Number(sn);
        }
    } catch (e) {}

    // Evaluar con reintentos para asegurar que cargue cuando Firestore complete la descarga
    limpiarTodosLosTimeoutsRecordatorios();
    [1000, 2500, 4500].forEach(delay => {
        const t = setTimeout(() => {
            refrescarMotorRecordatorios(true);
        }, delay);
        _timeoutsReintentosRecordatorios.push(t);
    });

    if (!listenerVisibilidadRegistrado) {
        listenerVisibilidadRegistrado = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && modalRecordatoriosInicializado) {
                refrescarMotorRecordatorios(true);
            }
        });
    }

    if (timerIntervaloCheck) clearInterval(timerIntervaloCheck);
    timerIntervaloCheck = setInterval(() => {
        refrescarMotorRecordatorios(true);
    }, 10 * 60 * 1000);
}
window.inicializarMotorRecordatorios = inicializarMotorRecordatorios;

// Limpia todo el estado en memoria del motor (al cerrar sesión): temporizadores, pausas, popup y contadores.
export function reiniciarEstadoMotorRecordatorios() {
    limpiarTodosLosTimeoutsRecordatorios();
    if (timerIntervaloCheck) {
        clearInterval(timerIntervaloCheck);
        timerIntervaloCheck = null;
    }
    snoozePorRolMap = {};
    snoozeHastaTimestamp = 0;
    ultimoConteoPendientes = 0;
    modalRecordatoriosInicializado = false;
    _ultimoHtmlPopup = '';
    window.alumnosMockupPrueba = [];

    const dlg = document.getElementById('modal-recordatorios-bloqueante');
    if (dlg) {
        try { if (typeof dlg.close === 'function' && dlg.open) dlg.close(); } catch (e) {}
        dlg.removeAttribute('open');
        dlg.style.display = 'none';
    }
    actualizarBadgesRecordatorios([]);
}
window.reiniciarEstadoMotorRecordatorios = reiniciarEstadoMotorRecordatorios;

export function simularRecordatorios(fechaHoyManual = null) {
    const res = calcularPendientesRecordatorios(fechaHoyManual);
    console.log(`[Simulador Recordatorios] Fecha simulada: ${fechaHoyManual || 'HOY'} | Pendientes: ${res.out.length}`, res.out);
    actualizarBadgesRecordatorios(res.out);
    abrirModalRecordatorios(true);
    return res;
}
window.simularRecordatorios = simularRecordatorios;
