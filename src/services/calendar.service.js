// =======================================================================
// src/services/calendar.service.js — Servicios e integraciones con Google Calendar
// =======================================================================

import { SCRIPT_URL, defaultCfg } from "../config/constants.js";
import { db, doc, getDoc, collection, getDocs, query, where } from "../config/firebase.js";

export function getEmojiInstrumento(instrumentoInput, cfg, al = null) {
    let instRef = '';
    if (al && al.instrumento_asignado) {
        instRef = al.instrumento_asignado;
    } else if (typeof instrumentoInput === 'string' && instrumentoInput.trim()) {
        instRef = instrumentoInput;
    } else if (Array.isArray(instrumentoInput) && instrumentoInput.length > 0) {
        instRef = instrumentoInput[0];
    }
    const c = cfg || defaultCfg;
    const instL = (instRef || '').toLowerCase();
    if (instL.includes('bater')) return c.identificador_bateria || '🥁';
    if (instL.includes('guitarra')) return c.emoji_guitarra || '🎸';
    if (instL.includes('cajón') || instL.includes('cajon')) return c.emoji_cajon || '📦';
    if (instL.includes('canto') || instL.includes('voz')) return c.emoji_canto || '🎤';
    if (instL.includes('piano') || instL.includes('teclado')) return c.emoji_piano || '🎹';
    if (instL.includes('bajo')) return c.emoji_bajo || '🎸';
    return '🎵';
}

export function reemplazarVariables(texto, datos) { 
    let res = texto; 
    for (const [key, value] of Object.entries(datos)) { 
        res = res.replaceAll(`{${key}}`, value || ''); 
    } 
    res = res.replace(/\{[a-zA-Z0-9_ ]+\}/g, ''); 
    return res; 
}

export function formatoLocalISO(date) { 
    const tzo = -date.getTimezoneOffset(), dif = tzo >= 0 ? '+' : '-', pad = num => (num < 10 ? '0' : '') + num; 
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + dif + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60); 
}

export function formatearFechaAmi(fechaIsoStr) { 
    const d = new Date(fechaIsoStr), dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; 
    let min = d.getMinutes(), minStr = min === 0 ? 'hs' : `:${min < 10 ? '0'+min : min}hs`; 
    return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth()+1} ${d.getHours()}${minStr}`; 
}

export async function fetchCalendarAPI(action, payload) {
    payload.action = action; payload.apiKey = "mandala-seg-2026";
    let res;
    try { 
        res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); 
    } catch (networkError) { 
        throw new Error("Falla de red al conectar con Google Apps Script. Revise su conexión."); 
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error); 
    return action === 'getEvents' ? data : (action === 'createEvent' ? { id: data.id } : true);
}

export async function getEventosCalendario(calendarId, timeMin, timeMax) { 
    return await fetchCalendarAPI('getEvents', { calendarId, timeMin, timeMax }); 
}

export async function crearEventoCalendario(calendarId, titulo, inicioStr, finStr, descripcion = "") { 
    return await fetchCalendarAPI('createEvent', { 
        calendarId, 
        summary: titulo, 
        description: descripcion,
        start: { dateTime: inicioStr }, 
        end: { dateTime: finStr } 
    }); 
}

export async function actualizarEventoCalendario(calendarId, eventId, titulo, descripcion) { 
    return await fetchCalendarAPI('updateEvent', { calendarId, eventId, summary: titulo, description: descripcion }); 
}

export async function eliminarEventoCalendario(calendarId, eventId) { 
    return await fetchCalendarAPI('deleteEvent', { calendarId, eventId }); 
}

export function construirTitulosEvento(al, tipo, cfg) {
    let template = tipo === 'reserva' ? cfg.formato_evento_reserva : cfg.formato_evento_confirmado;
    if (template === '? {profe} Ent {alumno}') template = '❓📋 {emojiinstrumento} {alumno} {edad}';
    if (template === '📋🎸{instrumento} - {alumno} {edad}') template = '✅📋 {emojiinstrumento} {alumno} {edad}';

    const instElegido = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : al.instrumento) || '';
    const strEmojis = getEmojiInstrumento(instElegido, cfg, al);

    let tituloProfe = reemplazarVariables(template, { alumno: al.nombre, edad: al.edad || '', emojiinstrumento: strEmojis, instrumento: instElegido }).replace(/\s+/g, ' ').trim();
    let profeStr = al.reserva_profe_nombre ? ` (${al.reserva_profe_nombre})` : '';
    let strEmojisConProfe = strEmojis ? `${strEmojis}${profeStr}` : profeStr.trim();
    let tituloDefecto = reemplazarVariables(template, { alumno: al.nombre, edad: al.edad || '', emojiinstrumento: strEmojisConProfe, instrumento: instElegido }).replace(/\s+/g, ' ').trim();
    return { tituloProfe, tituloDefecto };
}

export function detectarTipoSuscripcion(nombreSusc) {
    if (!nombreSusc) return 'individual';
    const s = nombreSusc.toLowerCase();
    if (s.includes('ensamble') || s.includes('banda')) return 'ensamble';
    if (s.includes('grupal') || s.includes('grupo') || s.includes('coro')) return 'grupal';
    return 'individual';
}

export function construirTitulosPrealtaYAlta(al, tipo, cfg) {
    const tipoSusc = detectarTipoSuscripcion(al.tipo_suscripcion || '');
    const esInd = tipoSusc === 'individual';
    const instElegido = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : al.instrumento) || '';
    const emojiInst = getEmojiInstrumento(instElegido, cfg, al);
    const nombreAlumno = al.nombre || 'Alumno';
    const nombreGrupo = al.grupo_asignado || 'Grupo';

    let titulo = '';
    if (tipo === 'prealta') {
        titulo = esInd ? `🚀${emojiInst} ${nombreAlumno}` : `🚀🧩 ${nombreGrupo}`;
    } else {
        titulo = esInd ? `${emojiInst} ${nombreAlumno}` : `🧩 ${nombreGrupo}`;
    }
    return { tituloProfe: titulo, tituloDefecto: titulo };
}

export function construirDescripcionEventoAlta(al, esGrupo = false, alumnosGrupo = []) {
    if (esGrupo && alumnosGrupo.length > 0) {
        const listaIntegrantes = alumnosGrupo.map(a => `• ${a.nombre} (${a.instrumento_asignado || (Array.isArray(a.instrumento) ? a.instrumento[0] : a.instrumento) || 'Instrumento'}) - Tel: ${a.celular || '-'}`).join('\n');
        return `👥 INTEGRANTES DEL GRUPO (${alumnosGrupo.length}):\n${listaIntegrantes}\n\n🏫 Grupo: ${al.grupo_asignado || '-'}\n👨‍🏫 Profe: ${al.reserva_profe_nombre || '-'}`;
    }
    const instStr = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || '-'));
    const descP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : '';
    return `👤 ALUMNO:\n• Nombre: ${al.nombre}\n• Edad: ${al.edad || '-'}\n• Celular: ${al.celular || '-'}\n• Instrumento: ${instStr}\n• Suscripción: ${al.tipo_suscripcion || '-'}\n\n📝 INFORMACIÓN ADICIONAL:\n${descP || 'Sin notas adicionales.'}`;
}

export async function getCalendarIdParaAlumno(al, cfg = defaultCfg) {
    if (al.calendario_evento_alta) return al.calendario_evento_alta;
    if (al.reserva_cal_id) return al.reserva_cal_id;
    if (al.reserva_profe_id) { 
        const pDoc = await getDoc(doc(db, "profesores", al.reserva_profe_id)); 
        if (pDoc.exists() && pDoc.data().correo_calendario) return pDoc.data().correo_calendario; 
    }
    if (al.reserva_profe_nombre) { 
        const pQ = await getDocs(query(collection(db, "profesores"), where("nombre", "==", al.reserva_profe_nombre))); 
        if (!pQ.empty && pQ.docs[0].data().correo_calendario) return pQ.docs[0].data().correo_calendario; 
    }
    return cfg.calendario_por_defecto || null;
}

export async function crearEventoSeguro(al, titulos, inicio, fin, cfg = defaultCfg) {
    let fallbackCalId = cfg.calendario_por_defecto, primaryCalId = await getCalendarIdParaAlumno(al, cfg), errorDetalle = "";
    if (primaryCalId) { 
        try { 
            let tituloUsar = (primaryCalId === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe; 
            let ev = await crearEventoCalendario(primaryCalId, tituloUsar, inicio, fin); 
            return { id: ev.id, calendar: primaryCalId }; 
        } catch(e) { 
            errorDetalle += `Fallo primario (${primaryCalId}): ${e.message}. `; 
        } 
    }
    if (fallbackCalId && fallbackCalId !== primaryCalId) { 
        try { 
            let ev = await crearEventoCalendario(fallbackCalId, titulos.tituloDefecto, inicio, fin); 
            return { id: ev.id, calendar: fallbackCalId }; 
        } catch(e) { 
            errorDetalle += `Fallo fallback (${fallbackCalId}): ${e.message}.`; 
        } 
    }
    throw new Error("No se pudo crear el evento en el calendario.\n" + errorDetalle);
}

export async function actualizarEventoSeguro(al, titulos, desc, cfg = defaultCfg) {
    if (!al.id_evento_reserva) throw new Error("El alumno no tiene un evento en calendario para actualizar.");
    let calGrabado = al.calendario_evento_reserva, primaryCalId = await getCalendarIdParaAlumno(al, cfg), fallbackCalId = cfg.calendario_por_defecto, candidatos = [];
    if (calGrabado) candidatos.push(calGrabado); 
    if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId); 
    if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);
    let lastError = "";
    for (let cal of candidatos) { 
        try { 
            let tituloUsar = (cal === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe; 
            await actualizarEventoCalendario(cal, al.id_evento_reserva, tituloUsar, desc); 
            return; 
        } catch(e) { 
            lastError = e.message; 
        } 
    }
    throw new Error("Google Calendar rechazó la actualización.\nDetalle: " + lastError);
}

export async function eliminarEventoSeguro(al, cfg = defaultCfg) {
    if (!al.id_evento_reserva) return;
    let calGrabado = al.calendario_evento_reserva, primaryCalId = await getCalendarIdParaAlumno(al, cfg), fallbackCalId = cfg.calendario_por_defecto, candidatos = [];
    if (calGrabado) candidatos.push(calGrabado); 
    if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId); 
    if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);
    let lastError = "";
    for (let cal of candidatos) { 
        try { 
            await eliminarEventoCalendario(cal, al.id_evento_reserva); 
            return; 
        } catch(e) { 
            lastError = e.message; 
        } 
    }
    throw new Error("Google Calendar rechazó la cancelación.\nDetalle: " + lastError);
}

export async function sincronizarEventoPrealtaCalendar(al, esIndividual, fIsoStart, fIsoEnd, otrosAlumnosDelGrupo = [], cfg = defaultCfg) {
    try {
        const titulos = construirTitulosPrealtaYAlta(al, 'prealta', cfg);
        const desc = construirDescripcionEventoAlta(al, !esIndividual, otrosAlumnosDelGrupo);
        let primaryCalId = await getCalendarIdParaAlumno(al, cfg);
        let fallbackCalId = cfg.calendario_por_defecto || 'productora.mandalahouse@gmail.com';

        let existingEventId = al.id_evento_alta;
        let existingCalId = al.calendario_evento_alta || primaryCalId || fallbackCalId;

        if (!esIndividual && !existingEventId && otrosAlumnosDelGrupo.length > 0) {
            const compConEv = otrosAlumnosDelGrupo.find(c => c.id_evento_alta);
            if (compConEv) {
                existingEventId = compConEv.id_evento_alta;
                existingCalId = compConEv.calendario_evento_alta || primaryCalId || fallbackCalId;
            }
        }

        if (existingEventId && existingCalId) {
            try {
                await actualizarEventoCalendario(existingCalId, existingEventId, titulos.tituloProfe, desc);
                return { id: existingEventId, calendar: existingCalId };
            } catch(e) {
                console.warn("Fallo actualización de evento:", e);
            }
        }

        if (primaryCalId) {
            try {
                const evRes = await crearEventoCalendario(primaryCalId, titulos.tituloProfe, fIsoStart, fIsoEnd, desc);
                return { id: evRes.id, calendar: primaryCalId };
            } catch(e) {
                console.warn(`Fallo crear evento en ${primaryCalId}:`, e);
            }
        }

        if (fallbackCalId && fallbackCalId !== primaryCalId) {
            try {
                const evRes = await crearEventoCalendario(fallbackCalId, titulos.tituloDefecto, fIsoStart, fIsoEnd, desc);
                return { id: evRes.id, calendar: fallbackCalId };
            } catch(e) {
                console.warn(`Fallo fallback en ${fallbackCalId}:`, e);
            }
        }
    } catch(err) {
        console.warn("No se pudo sincronizar evento de Pre-Alta en Google Calendar:", err);
    }
    return null;
}

export async function sincronizarEventoAltaConfirmadaCalendar(al, esIndividual, otrosAlumnosDelGrupo = [], cfg = defaultCfg) {
    try {
        const titulos = construirTitulosPrealtaYAlta(al, 'confirmada', cfg);
        const desc = construirDescripcionEventoAlta(al, !esIndividual, otrosAlumnosDelGrupo);
        
        let targetEventId = al.id_evento_alta;
        let targetCalId = al.calendario_evento_alta;

        if (!targetEventId && !esIndividual && otrosAlumnosDelGrupo.length > 0) {
            const compConEv = otrosAlumnosDelGrupo.find(c => c.id_evento_alta);
            if (compConEv) {
                targetEventId = compConEv.id_evento_alta;
                targetCalId = compConEv.calendario_evento_alta;
            }
        }

        if (targetEventId && targetCalId) {
            await actualizarEventoCalendario(targetCalId, targetEventId, titulos.tituloProfe, desc);
        }
    } catch(err) {
        console.warn("No se pudo actualizar evento de alta confirmada en Google Calendar:", err);
    }
}

export async function eliminarEventoAltaSeguro(al, cfg = defaultCfg) {
    const evId = al.id_evento_alta;
    const calId = al.calendario_evento_alta || await getCalendarIdParaAlumno(al, cfg);
    if (evId && calId) {
        try { await eliminarEventoCalendario(calId, evId); } catch(e) {}
    }
}
