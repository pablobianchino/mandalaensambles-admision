// =======================================================================
// src/services/calendar.service.js — Servicios e integraciones con Google Calendar
// =======================================================================

import { SCRIPT_URL, defaultCfg } from "../config/constants.js";
import { db, doc, getDoc, collection, getDocs, query, where, updateDoc } from "../config/firebase.js";

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
        titulo = esInd ? `❓${emojiInst} ${nombreAlumno}` : `❓🧩 ${nombreGrupo}`;
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
    const descP = al.descripcion 
        ? al.descripcion.replace(/<br\s*[\/]?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<[^>]*>?/gm, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() 
        : '';
    return `👤 ALUMNO:\n• Nombre: ${al.nombre}\n• Edad: ${al.edad || '-'}\n• Celular: ${al.celular || '-'}\n• Instrumento: ${instStr}\n• Suscripción: ${al.tipo_suscripcion || '-'}\n\n📝 INFORMACIÓN ADICIONAL:\n${descP || 'Sin notas adicionales.'}`;
}

export async function getCalendarIdParaAlumno(al, cfg = defaultCfg) {
    if (al.calendario_evento_alta) return al.calendario_evento_alta;
    if (al.reserva_cal_id) return al.reserva_cal_id;
    const pId = al.profesor_id || al.reserva_profe_id;
    if (pId) { 
        try {
            const pDoc = await getDoc(doc(db, "profesores", pId)); 
            if (pDoc.exists() && pDoc.data().correo_calendario) return pDoc.data().correo_calendario; 
        } catch(e) {}
    }
    const pNom = al.profesor_asignado || al.reserva_profe_nombre;
    if (pNom) { 
        try {
            const pQ = await getDocs(query(collection(db, "profesores"), where("nombre", "==", pNom))); 
            if (!pQ.empty && pQ.docs[0].data().correo_calendario) return pQ.docs[0].data().correo_calendario; 
        } catch(e) {}
    }
    return cfg.calendario_por_defecto || 'productora.mandalahouse@gmail.com';
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
        let targetCalId = al.calendario_evento_alta || await getCalendarIdParaAlumno(al, cfg);

        if (!targetEventId && !esIndividual && otrosAlumnosDelGrupo.length > 0) {
            const compConEv = otrosAlumnosDelGrupo.find(c => c.id_evento_alta);
            if (compConEv) {
                targetEventId = compConEv.id_evento_alta;
                targetCalId = compConEv.calendario_evento_alta || targetCalId;
            }
        }

        if (targetEventId && targetCalId) {
            await actualizarEventoCalendario(targetCalId, targetEventId, titulos.tituloProfe, desc);
            return { id: targetEventId, calendar: targetCalId };
        } else if (targetCalId && al.fecha_inicio_clases) {
            const dStart = new Date(al.fecha_inicio_clases);
            if (!isNaN(dStart.getTime())) {
                const dEnd = new Date(dStart.getTime() + 60 * 60000);
                const evRes = await crearEventoCalendario(targetCalId, titulos.tituloProfe, dStart.toISOString(), dEnd.toISOString(), desc);
                if (evRes && evRes.id) {
                    if (al.id) {
                        await updateDoc(doc(db, "alumnos", al.id), {
                            id_evento_alta: evRes.id,
                            calendario_evento_alta: targetCalId
                        });
                    }
                    return { id: evRes.id, calendar: targetCalId };
                }
            }
        }
    } catch(err) {
        console.warn("No se pudo actualizar/crear evento de alta confirmada en Google Calendar:", err);
    }
    return null;
}

export async function eliminarEventoAltaSeguro(al, cfg = defaultCfg) {
    let evId = al.id_evento_alta || al.id_evento_reserva || al.reserva_id_evento;
    
    // Si no tiene id directo y es grupal, buscar en otros miembros del grupo
    if (!evId && al.grupo_asignado) {
        try {
            const grpSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", al.grupo_asignado)));
            grpSnap.forEach(d => {
                const data = d.data();
                if (data.id_evento_alta && !evId) evId = data.id_evento_alta;
            });
        } catch(e) {}
    }

    if (!evId) return false;

    let calGrabado = al.calendario_evento_alta || al.calendario_evento_reserva || al.reserva_cal_id;
    let primaryCalId = await getCalendarIdParaAlumno(al, cfg);
    let fallbackCalId = cfg.calendario_por_defecto || 'productora.mandalahouse@gmail.com';
    let candidatos = [];
    if (calGrabado && !candidatos.includes(calGrabado)) candidatos.push(calGrabado);
    if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId);
    if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);

    let eliminado = false;
    for (const cal of candidatos) {
        try {
            await eliminarEventoCalendario(cal, evId);
            eliminado = true;
            break;
        } catch(e) {
            console.warn(`No se pudo eliminar evento ${evId} del calendario ${cal}:`, e.message);
        }
    }
    return eliminado;
}

export async function reprogramarClaseCalendar({ al, esGrupo = false, alumnosGrupo = [], fIsoStart, fIsoEnd, duracionMinutos = 60, cfg = defaultCfg }) {
    try {
        const tipo = (al.estado_agenda === 'Pre-alta Iniciada') ? 'prealta' : 'confirmada';
        const titulos = construirTitulosPrealtaYAlta(al, tipo, cfg);
        const desc = construirDescripcionEventoAlta(al, esGrupo, alumnosGrupo);
        
        let evId = al.id_evento_alta;
        let calId = al.calendario_evento_alta;

        if (esGrupo && !evId && alumnosGrupo && alumnosGrupo.length > 0) {
            const comp = alumnosGrupo.find(a => a.id_evento_alta);
            if (comp) {
                evId = comp.id_evento_alta;
                calId = comp.calendario_evento_alta || calId;
            }
        }

        if (!calId) {
            calId = await getCalendarIdParaAlumno(al, cfg);
        }

        // Si existía un evento previo, lo eliminamos primero para no dejar eventos duplicados en horarios viejos
        if (evId && calId) {
            try {
                await eliminarEventoCalendario(calId, evId);
            } catch(e) {
                console.warn("No se pudo eliminar evento previo en Calendar (puede no haber existido previamente):", e);
            }
        }

        // Creamos el evento en la nueva fecha y horario solicitado
        if (calId) {
            const evRes = await crearEventoCalendario(calId, titulos.tituloProfe, fIsoStart, fIsoEnd, desc);
            if (evRes && evRes.id) {
                return { id: evRes.id, calendar: calId };
            }
        }
    } catch(err) {
        console.warn("Error en reprogramarClaseCalendar:", err);
    }
    return null;
}

// -----------------------------------------------------------------------
// AUDITORÍA Y RESINCRONIZACIÓN DE CALENDAR (BAJO DEMANDA)
// -----------------------------------------------------------------------

export async function verificarEstadoEventoCalendar(al, cfg = defaultCfg) {
    if (!al) return { estado: 'ERROR', mensaje: 'Datos de alumno no provistos.' };
    
    const evId = al.id_evento_alta || al.id_evento_reserva || al.reserva_id_evento;
    const calId = al.calendario_evento_alta || al.calendario_evento_reserva || await getCalendarIdParaAlumno(al, cfg);
    const fechaRef = al.fecha_inicio_clases || al.reserva_inicio || al.reserva_fecha_texto;

    if (!calId) {
        return {
            estado: 'SIN_CALENDARIO',
            mensaje: 'No se encontró un calendario de Google asociado (profe o Mandala).',
            calId: null,
            evId
        };
    }

    if (!evId && !fechaRef) {
        return {
            estado: 'SIN_EVENTO',
            mensaje: 'El alumno no tiene evento ni fecha agendada en el sistema.',
            calId,
            evId: null
        };
    }

    // Definir ventana de búsqueda (+- 60 días alrededor de la fecha de referencia)
    let tMin, tMax;
    if (fechaRef) {
        const dRef = new Date(fechaRef);
        if (!isNaN(dRef.getTime())) {
            tMin = new Date(dRef.getTime() - 45 * 86400000).toISOString();
            tMax = new Date(dRef.getTime() + 60 * 86400000).toISOString();
        }
    }
    if (!tMin) {
        const now = Date.now();
        tMin = new Date(now - 30 * 86400000).toISOString();
        tMax = new Date(now + 90 * 86400000).toISOString();
    }

    try {
        const data = await getEventosCalendario(calId, tMin, tMax);
        const items = (data && Array.isArray(data.items)) ? data.items : [];

        // 1. Buscar coincidencia exacta por Event ID
        let evFound = evId ? items.find(item => item.id === evId) : null;

        // 2. Si no se encontró por ID, buscar coincidencia por nombre de alumno en el título
        if (!evFound && al.nombre) {
            const nomL = al.nombre.trim().toLowerCase();
            evFound = items.find(item => item.summary && item.summary.toLowerCase().includes(nomL));
        }

        if (!evFound) {
            return {
                estado: 'NO_EXISTE',
                mensaje: 'El evento no fue encontrado en Google Calendar (posiblemente fue eliminado).',
                calId,
                evId,
                fechaSistema: fechaRef
            };
        }

        // Obtener fecha de inicio en Calendar
        const evStartIso = evFound.start?.dateTime || evFound.start?.date;
        if (!evStartIso) {
            return {
                estado: 'DESFASAJE_HORARIO',
                mensaje: 'El evento existe pero no tiene hora de inicio válida.',
                calId,
                evId: evFound.id,
                evento: evFound,
                fechaSistema: fechaRef,
                fechaCalendar: null
            };
        }

        // Comparar fecha de Calendar vs Sistema
        if (fechaRef) {
            const dSis = new Date(fechaRef);
            const dCal = new Date(evStartIso);
            if (!isNaN(dSis.getTime()) && !isNaN(dCal.getTime())) {
                const diffMinutos = Math.abs(dSis.getTime() - dCal.getTime()) / 60000;
                // Si la diferencia es menor a 2 minutos consideramos coincidencia exacta
                if (diffMinutos <= 2) {
                    return {
                        estado: 'OK',
                        mensaje: 'El evento está sincronizado correctamente con Google Calendar.',
                        calId,
                        evId: evFound.id,
                        evento: evFound,
                        fechaSistema: fechaRef,
                        fechaCalendar: evStartIso
                    };
                } else {
                    return {
                        estado: 'DESFASAJE_HORARIO',
                        mensaje: 'Se detectó una discrepancia de horario entre el Sistema y Google Calendar.',
                        calId,
                        evId: evFound.id,
                        evento: evFound,
                        fechaSistema: fechaRef,
                        fechaCalendar: evStartIso
                    };
                }
            }
        }

        return {
            estado: 'OK',
            mensaje: 'El evento fue localizado en Google Calendar.',
            calId,
            evId: evFound.id,
            evento: evFound,
            fechaSistema: fechaRef,
            fechaCalendar: evStartIso
        };

    } catch (err) {
        return {
            estado: 'ERROR',
            mensaje: 'Error de conexión al consultar Google Calendar: ' + err.message,
            calId,
            evId
        };
    }
}

export function esEstadoEntrevista(estado) {
    const est = (estado || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return [
        'pendiente procesar',
        'pendiente validacion por profe',
        'pendiente validacion por evaluador',
        'pendiente validacion por alumno',
        'agenda confirmada',
        'agenda suspendida'
    ].includes(est);
}

export async function recrearEventoFaltanteCalendar(al, cfg = defaultCfg) {
    if (!al) throw new Error("Datos de alumno requeridos.");
    const esEntrevista = esEstadoEntrevista(al.estado_agenda);
    
    let titulos, desc, targetCalId, evIdField, calIdField;
    let dStart = null;

    if (esEntrevista) {
        const tipo = (al.estado_agenda === 'Agenda confirmada') ? 'confirmada' : 'reserva';
        titulos = construirTitulosEvento(al, tipo, cfg);
        desc = al.descripcion || '';
        targetCalId = al.reserva_cal_id || al.calendario_evento_reserva || await getCalendarIdParaAlumno(al, cfg);
        evIdField = 'id_evento_reserva';
        calIdField = 'calendario_evento_reserva';
        if (al.reserva_inicio) dStart = new Date(al.reserva_inicio);
        else if (al.fecha_inicio_clases) dStart = new Date(al.fecha_inicio_clases);
    } else {
        const tipo = (al.estado_agenda === 'Pre-alta Iniciada' || al.estado_agenda === 'Pre-alta Pendiente') ? 'prealta' : 'confirmada';
        titulos = construirTitulosPrealtaYAlta(al, tipo, cfg);
        desc = construirDescripcionEventoAlta(al, detectarTipoSuscripcion(al.tipo_suscripcion || '') !== 'individual');
        targetCalId = al.calendario_evento_alta || await getCalendarIdParaAlumno(al, cfg);
        evIdField = 'id_evento_alta';
        calIdField = 'calendario_evento_alta';
        if (al.fecha_inicio_clases) dStart = new Date(al.fecha_inicio_clases);
        else if (al.reserva_inicio) dStart = new Date(al.reserva_inicio);
    }
    
    if (!targetCalId) targetCalId = cfg.calendario_por_defecto || 'productora.mandalahouse@gmail.com';

    if (!dStart || isNaN(dStart.getTime())) {
        throw new Error("El alumno no tiene una fecha/hora de inicio válida para agendar el evento.");
    }

    const duracion = esEntrevista ? 30 : 60;
    const dEnd = new Date(dStart.getTime() + duracion * 60000);
    const tituloUsar = (targetCalId === cfg.calendario_por_defecto && titulos.tituloDefecto) ? titulos.tituloDefecto : titulos.tituloProfe;
    const evRes = await crearEventoCalendario(targetCalId, tituloUsar, dStart.toISOString(), dEnd.toISOString(), desc);
    
    if (evRes && evRes.id) {
        const hist = al.historial || [];
        const fnHist = window.crearEntradaHistorial || ((txt, t) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: t || 'sistema' }));
        const fechaHoraLog = `${dStart.getDate().toString().padStart(2, '0')}/${(dStart.getMonth() + 1).toString().padStart(2, '0')}/${dStart.getFullYear()} ${dStart.getHours().toString().padStart(2, '0')}:${dStart.getMinutes().toString().padStart(2, '0')} hs`;
        hist.push(fnHist(`Evento de Google Calendar recreado tras auditoría para ${fechaHoraLog} (ID: ${evRes.id}, Cal: ${targetCalId}).`, 'sistema'));

        if (al.id) {
            const up = {
                [evIdField]: evRes.id,
                [calIdField]: targetCalId,
                historial: hist
            };
            await updateDoc(doc(db, "alumnos", al.id), up);
        }
        return { id: evRes.id, calendar: targetCalId };
    }
    throw new Error("Google Calendar no devolvió un ID de evento al recrear.");
}

export async function alinearEventoHaciaCalendar(al, cfg = defaultCfg) {
    if (!al) throw new Error("Datos de alumno requeridos.");
    const esEntrevista = esEstadoEntrevista(al.estado_agenda);

    let titulos, desc, targetCalId, targetEvId, evIdField, calIdField;
    let dStart = null;

    if (esEntrevista) {
        const tipo = (al.estado_agenda === 'Agenda confirmada') ? 'confirmada' : 'reserva';
        titulos = construirTitulosEvento(al, tipo, cfg);
        desc = al.descripcion || '';
        targetCalId = al.reserva_cal_id || al.calendario_evento_reserva || await getCalendarIdParaAlumno(al, cfg);
        targetEvId = al.id_evento_reserva || al.reserva_id_evento;
        evIdField = 'id_evento_reserva';
        calIdField = 'calendario_evento_reserva';
        if (al.reserva_inicio) dStart = new Date(al.reserva_inicio);
        else if (al.fecha_inicio_clases) dStart = new Date(al.fecha_inicio_clases);
    } else {
        const tipo = (al.estado_agenda === 'Pre-alta Iniciada' || al.estado_agenda === 'Pre-alta Pendiente') ? 'prealta' : 'confirmada';
        titulos = construirTitulosPrealtaYAlta(al, tipo, cfg);
        desc = construirDescripcionEventoAlta(al, detectarTipoSuscripcion(al.tipo_suscripcion || '') !== 'individual');
        targetCalId = al.calendario_evento_alta || await getCalendarIdParaAlumno(al, cfg);
        targetEvId = al.id_evento_alta;
        evIdField = 'id_evento_alta';
        calIdField = 'calendario_evento_alta';
        if (al.fecha_inicio_clases) dStart = new Date(al.fecha_inicio_clases);
        else if (al.reserva_inicio) dStart = new Date(al.reserva_inicio);
    }

    if (!targetCalId) targetCalId = cfg.calendario_por_defecto || 'productora.mandalahouse@gmail.com';

    if (!dStart || isNaN(dStart.getTime())) {
        throw new Error("El alumno no tiene fecha de inicio válida en el sistema.");
    }

    const duracion = esEntrevista ? 30 : 60;
    const dEnd = new Date(dStart.getTime() + duracion * 60000);

    // Si existía evento anterior lo borramos para no duplicar
    if (targetEvId && targetCalId) {
        try {
            await eliminarEventoCalendario(targetCalId, targetEvId);
        } catch(e) {
            console.warn("No se pudo eliminar evento previo:", e);
        }
    }

    // Creamos en la fecha oficial de Firestore
    const tituloUsar = (targetCalId === cfg.calendario_por_defecto && titulos.tituloDefecto) ? titulos.tituloDefecto : titulos.tituloProfe;
    const evRes = await crearEventoCalendario(targetCalId, tituloUsar, dStart.toISOString(), dEnd.toISOString(), desc);
    if (evRes && evRes.id) {
        const hist = al.historial || [];
        const fnHist = window.crearEntradaHistorial || ((txt, t) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: t || 'sistema' }));
        const fechaHoraLog = `${dStart.getDate().toString().padStart(2, '0')}/${(dStart.getMonth() + 1).toString().padStart(2, '0')}/${dStart.getFullYear()} ${dStart.getHours().toString().padStart(2, '0')}:${dStart.getMinutes().toString().padStart(2, '0')} hs`;
        hist.push(fnHist(`Google Calendar alineado con el Sistema: movido a ${fechaHoraLog} (ID: ${evRes.id}).`, 'sistema'));

        if (al.id) {
            const up = {
                [evIdField]: evRes.id,
                [calIdField]: targetCalId,
                historial: hist
            };
            await updateDoc(doc(db, "alumnos", al.id), up);
        }
        return { id: evRes.id, calendar: targetCalId };
    }
    throw new Error("No se pudo alinear el evento en Google Calendar.");
}

export async function alinearSistemaDesdeCalendar(al, fechaCalendarIso, eventoCalId = null, cfg = defaultCfg) {
    if (!al || !al.id) throw new Error("Alumno inválido.");
    const dCal = new Date(fechaCalendarIso);
    if (isNaN(dCal.getTime())) throw new Error("Fecha de Calendar no válida.");

    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaMatchNom = diasSemana[dCal.getDay()];
    const diaCodigos = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const diaMatchCod = diaCodigos[dCal.getDay()];

    const esEntrevista = esEstadoEntrevista(al.estado_agenda);
    const duracion = esEntrevista ? 30 : 60;
    const hIni = dCal.getHours().toString().padStart(2, '0') + ':' + dCal.getMinutes().toString().padStart(2, '0');
    const dFin = new Date(dCal.getTime() + duracion * 60000);
    const hFin = dFin.getHours().toString().padStart(2, '0') + ':' + dFin.getMinutes().toString().padStart(2, '0');
    const horarioMatchTexto = `${diaMatchNom} ${hIni} a ${hFin} hs`;
    const fechaHoraLog = `${dCal.getDate().toString().padStart(2, '0')}/${(dCal.getMonth() + 1).toString().padStart(2, '0')}/${dCal.getFullYear()} ${hIni} hs`;

    const hist = al.historial || [];
    const fnHist = window.crearEntradaHistorial || ((txt, t) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: t || 'sistema' }));
    hist.push(fnHist(`Sistema alineado desde Google Calendar: horario actualizado a ${horarioMatchTexto} (${fechaHoraLog}).`, 'sistema'));

    let updatePayload = { historial: hist };

    if (esEntrevista) {
        updatePayload.reserva_inicio = dCal.toISOString();
        updatePayload.reserva_fin = dFin.toISOString();
        updatePayload.reserva_fecha_texto = `${diaMatchNom.toLowerCase()} ${dCal.getDate()}/${dCal.getMonth() + 1} ${hIni}hs`;
        if (eventoCalId) updatePayload.id_evento_reserva = eventoCalId;
    } else {
        updatePayload.fecha_inicio_clases = dCal.toISOString();
        updatePayload.dia_match = diaMatchCod;
        updatePayload.horario_inicio_match = hIni;
        updatePayload.horario_fin_match = hFin;
        updatePayload.horario_match = horarioMatchTexto;
        if (eventoCalId) updatePayload.id_evento_alta = eventoCalId;
    }

    await updateDoc(doc(db, "alumnos", al.id), updatePayload);
    return updatePayload;
}
