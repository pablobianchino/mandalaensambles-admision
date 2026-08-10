import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, updateDoc, deleteDoc, doc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// === CONFIGURACIÓN FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyCgAg2EwTJh4zbMdpkqG3VKTGfDeofblyg",
    authDomain: "priel-mdl-seguimientos.firebaseapp.com",
    projectId: "priel-mdl-seguimientos",
    storageBucket: "priel-mdl-seguimientos.firebasestorage.app",
    messagingSenderId: "118730133451",
    appId: "1:118730133451:web:9e407e81a9b22ae9d0704e"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/calendar.events');

function getSavedToken() {
    const token = localStorage.getItem('gCalToken');
    const time = localStorage.getItem('gCalTokenTime');
    if (token && time && (Date.now() - parseInt(time) < 55 * 60 * 1000)) return token;
    return null;
}

let googleAccessToken = getSavedToken(); 
let alumnoIdActual = null;
let estadoActualVista = 'Resumen';
window.tituloABMActual = '';
let configApp = {};
let chartGestionesInst = null;
let chartGlobalInst = null;

let clipboardDisponibilidad = null; 
let clipboardDisponibilidadProfe = null; 
let historialActual = []; 

// === INICIALIZACIÓN QUILL & DISPONIBILIDAD ===
const quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });

const diasSemana = [
    { id: 'L', nombre: 'Lunes', ind: 1 }, { id: 'M', nombre: 'Martes', ind: 2 }, { id: 'X', nombre: 'Miércoles', ind: 3 },
    { id: 'J', nombre: 'Jueves', ind: 4 }, { id: 'V', nombre: 'Viernes', ind: 5 }, { id: 'S', nombre: 'Sábado', ind: 6 }
];

const contDisp = document.getElementById('contenedor-disponibilidad');
const contDispProfe = document.getElementById('contenedor-disponibilidad-profe');

diasSemana.forEach(dia => {
    contDisp.innerHTML += `
        <div class="dia-disponibilidad">
            <label>${dia.nombre}:</label>
            <input type="time" id="disp-${dia.id}-inicio"> <span>a</span> <input type="time" id="disp-${dia.id}-fin">
            <label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer;"><input type="checkbox" id="disp-${dia.id}-all"> Todo el día</label>
            <label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer;"><input type="checkbox" id="disp-${dia.id}-none"> No disp.</label>
            <button type="button" class="btn-copy-disp" data-dia="${dia.id}" title="Copiar disponibilidad" style="background:none; border:none; cursor:pointer; font-size:1.1em; margin-left:auto;">📋</button>
            <button type="button" class="btn-paste-disp" data-dia="${dia.id}" title="Pegar disponibilidad" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📥</button>
            <span id="estado-${dia.id}" class="estado-disp" style="width:80px; text-align:right;"></span>
        </div>
    `;
    contDispProfe.innerHTML += `
        <div class="dia-disponibilidad">
            <label>${dia.nombre}:</label>
            <input type="time" id="disp-p-${dia.id}-inicio"> <span>a</span> <input type="time" id="disp-p-${dia.id}-fin">
            <label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer;"><input type="checkbox" id="disp-p-${dia.id}-all"> Todo el día</label>
            <label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer;"><input type="checkbox" id="disp-p-${dia.id}-none"> No disp.</label>
            <button type="button" class="btn-copy-disp-p" data-dia="${dia.id}" title="Copiar disponibilidad" style="background:none; border:none; cursor:pointer; font-size:1.1em; margin-left:auto;">📋</button>
            <button type="button" class="btn-paste-disp-p" data-dia="${dia.id}" title="Pegar disponibilidad" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📥</button>
            <span id="estado-p-${dia.id}" class="estado-disp" style="width:80px; text-align:right;"></span>
        </div>
    `;
});

window.updateDispStateForDay = function(dId, isProfe = false) {
    const prefix = isProfe ? 'disp-p-' : 'disp-';
    const estadoPrefix = isProfe ? 'estado-p-' : 'estado-';
    const chkAll = document.getElementById(`${prefix}${dId}-all`);
    const chkNone = document.getElementById(`${prefix}${dId}-none`);
    const tIni = document.getElementById(`${prefix}${dId}-inicio`);
    const tFin = document.getElementById(`${prefix}${dId}-fin`);
    const spanE = document.getElementById(`${estadoPrefix}${dId}`);

    if (chkAll.checked) {
        chkNone.checked = false; tIni.disabled = tFin.disabled = true; tIni.value = tFin.value = '';
        spanE.textContent = "Libre"; spanE.style.color = "#28a745";
    } else if (chkNone.checked) {
        chkAll.checked = false; tIni.disabled = tFin.disabled = true; tIni.value = tFin.value = '';
        spanE.textContent = "Bloqueado"; spanE.style.color = "#dc3545";
    } else { 
        tIni.disabled = tFin.disabled = false; spanE.textContent = ""; 
    }
}

diasSemana.forEach(dia => {
    document.getElementById(`disp-${dia.id}-all`).addEventListener('change', () => window.updateDispStateForDay(dia.id, false));
    document.getElementById(`disp-${dia.id}-none`).addEventListener('change', () => window.updateDispStateForDay(dia.id, false));
    document.getElementById(`disp-p-${dia.id}-all`).addEventListener('change', () => window.updateDispStateForDay(dia.id, true));
    document.getElementById(`disp-p-${dia.id}-none`).addEventListener('change', () => window.updateDispStateForDay(dia.id, true));
});

function renderHistorial() {
    const container = document.getElementById('lista-historial');
    container.innerHTML = '';
    if(historialActual.length === 0) {
        container.innerHTML = '<p style="color:#6c757d; font-size:0.9em; margin:0;">No hay registros en el historial.</p>';
        return;
    }
    const sorted = [...historialActual].sort((a,b) => b.id - a.id);
    sorted.forEach(nota => {
        const textoLimpio = nota.texto.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
        container.innerHTML += `
            <div style="background:#f8f9fa; border:1px solid #dee2e6; padding:12px; border-radius:6px; position:relative;">
                <div style="font-size:0.8em; color:#6c757d; margin-bottom:5px; font-weight:600;">🕒 ${nota.fecha}</div>
                <div style="font-size:0.95em; color:#212529;">${textoLimpio}</div>
                <div style="position:absolute; top:10px; right:10px; display:flex; gap:5px;">
                    <button type="button" class="btn-editar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.1em;" title="Editar">✏️</button>
                    <button type="button" class="btn-eliminar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.1em;" title="Eliminar">❌</button>
                </div>
            </div>
        `;
    });
}
// === CONFIGURACIÓN DEFAULT Y UTILIDADES ===
const defaultCfg = {
    hora_apertura: '09:00', hora_cierre: '22:00',
    calendario_por_defecto: 'productora.mandalahouse@gmail.com',
    identificador_bateria: '🥁', emoji_guitarra: '🎸', emoji_cajon: '📦', emoji_canto: '🎤', emoji_piano: '🎹', emoji_bajo: '🎸',
    valor_clase: '$10.000', cantidad_aulas: '3', cantidad_baterias: '2',
    formato_evento_reserva: '❓📋 {emojiinstrumento} {alumno} {edad}', 
    formato_evento_confirmado: '✅📋 {emojiinstrumento} {alumno} {edad}',
    texto_profe: "*⚠ PRE CHECK - ENTREVISTA*\n📅 *FECHA: {fecha_hora}*\n*👥 ALUMNO:*\n🔹 {nombre} ({edad})\n🔹 {instrumento} | {suscripcion}\n*INFO:*\n{descripcion}{bloque_historial}",
    texto_alumno: "📅 *Agenda de clase*\n🧩 {fecha_hora} con Profe {profe}\n✅ Inscripción: forms.gle/xxx\n💸 Valor: {valor}\n🧩 Alias: {alias_profe}",
    texto_conf_alumno: "Genial Gracias!\nTe esperamos!\n\n🧩 Día y horario: {fecha_hora}\n🧩 Profe: {profe}\n📍 *Dirección:* Av. Cabildo 2970, Piso 1, Depto C.\n\n⚠️ *A tener en cuenta:*\n\n- *Puntualidad:* La reserva del espacio es por 45 minutos.\n\nEl profe te va a estar escribiendo el mismo día!",
    texto_conf_profe: "*✅ ENTREVISTA CONFIRMADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*👥 DATOS DEL ALUMNO:*\n🔹 Nombre: {nombre}\n🔹 Edad: {edad}\n🔹 Instrumento: {instrumento}\n🔹 Clase: {suscripcion}\n\n*📰 INFO PARA LA ENTREVISTA:*\n{descripcion}{bloque_historial}"
};

async function cargarConfig() {
    const docSnap = await getDoc(doc(db, "configuracion", "general"));
    configApp = docSnap.exists() ? { ...defaultCfg, ...docSnap.data() } : defaultCfg;
}

function reemplazarVariables(texto, datos) { let res = texto; for (const [key, value] of Object.entries(datos)) res = res.replaceAll(`{${key}}`, value || ''); return res; }
function formatoLocalISO(date) { const tzo = -date.getTimezoneOffset(), dif = tzo >= 0 ? '+' : '-', pad = num => (num < 10 ? '0' : '') + num; return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + dif + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60); }
function formatearFechaAmi(fechaIsoStr) { const d = new Date(fechaIsoStr), dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; let min = d.getMinutes(); let minStr = min === 0 ? 'hs' : `:${min < 10 ? '0'+min : min}hs`; return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth()+1} ${d.getHours()}${minStr}`; }

// Nuevo Generador de Títulos de Evento (Maneja Emojis Dinámicos y sufijo de Profe)
function construirTitulosEvento(al, tipo, cfg) {
    let template = tipo === 'reserva' ? cfg.formato_evento_reserva : cfg.formato_evento_confirmado;
    let emojis = [];
    const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento];
    insts.forEach(i => {
        let instL = (i || '').toLowerCase();
        if (instL.includes('bater')) emojis.push(cfg.identificador_bateria || '');
        else if (instL.includes('guitarra')) emojis.push(cfg.emoji_guitarra || '');
        else if (instL.includes('cajón') || instL.includes('cajon')) emojis.push(cfg.emoji_cajon || '');
        else if (instL.includes('canto')) emojis.push(cfg.emoji_canto || '');
        else if (instL.includes('piano') || instL.includes('teclado')) emojis.push(cfg.emoji_piano || '');
        else if (instL.includes('bajo')) emojis.push(cfg.emoji_bajo || '');
    });
    
    let strEmojis = [...new Set(emojis.filter(e => e))].join(''); 

    let base = reemplazarVariables(template, {
        alumno: al.nombre,
        edad: al.edad || '',
        emoji_instrumento: strEmojis,
        emojiinstrumento: strEmojis
    }).replace(/\s+/g, ' ').trim();

    let tituloProfe = base;
    let tituloDefecto = `${base} (${al.reserva_profe_nombre})`;
    
    return { tituloProfe, tituloDefecto };
}

function interpretarFechaCSV(texto) {
    if (!texto) return null;
    const regex = /(\d{1,2})\/(\d{1,2})(?:[^\d]*?(\d{1,2})(?:[:\.](\d{2}))?(?:\s*hs)?)?/i;
    const match = texto.match(regex);
    if (match) {
        const dia = parseInt(match[1]), mes = parseInt(match[2]) - 1, hora = match[3] ? parseInt(match[3]) : 0, min = match[4] ? parseInt(match[4]) : 0;
        if (dia > 31 || mes > 11 || hora > 23 || min > 59) return null;
        return formatoLocalISO(new Date(new Date().getFullYear(), mes, dia, hora, min));
    }
    return null;
}

async function conectarGoogle() {
    try { 
        const res = await signInWithPopup(auth, provider);
        googleAccessToken = GoogleAuthProvider.credentialFromResult(res).accessToken;
        localStorage.setItem('gCalToken', googleAccessToken);
        localStorage.setItem('gCalTokenTime', Date.now());
        document.getElementById('btn-conectar-cal').style.display = 'none';
        return true;
    } catch (err) { console.error(err); alert("Se requiere acceso al calendario."); throw err; }
}

async function fetchCalendarAPI(url, method, body = null) {
    if (!googleAccessToken) { await conectarGoogle(); }
    let options = { method, headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    let res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        await conectarGoogle();
        options.headers['Authorization'] = `Bearer ${googleAccessToken}`;
        res = await fetch(url, options);
    }
    if (!res.ok && res.status !== 410 && res.status !== 404) throw new Error(`API Error: ${res.statusText}`);
    return method === 'DELETE' ? true : await res.json();
}

async function getEventosCalendario(calendarId, timeMin, timeMax) { return await fetchCalendarAPI(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`, 'GET'); }
async function crearEventoCalendario(calendarId, titulo, inicioStr, finStr) { return await fetchCalendarAPI(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, 'POST', { summary: titulo, start: { dateTime: inicioStr }, end: { dateTime: finStr } }); }
async function actualizarEventoCalendario(calendarId, eventId, titulo, descripcion) { return await fetchCalendarAPI(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, 'PATCH', { summary: titulo, description: descripcion }); }
async function eliminarEventoCalendario(calendarId, eventId) { return await fetchCalendarAPI(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, 'DELETE'); }

// --- LÓGICA DE FALLBACK DE CALENDARIOS ---
async function getCalendarIdParaAlumno(al) {
    if (al.reserva_cal_id) return al.reserva_cal_id;
    if (al.reserva_profe_id) {
        const pDoc = await getDoc(doc(db, "profesores", al.reserva_profe_id));
        if (pDoc.exists() && pDoc.data().correo_calendario) return pDoc.data().correo_calendario;
    }
    if (al.reserva_profe_nombre) {
        const pQ = await getDocs(query(collection(db, "profesores"), where("nombre", "==", al.reserva_profe_nombre)));
        if (!pQ.empty && pQ.docs[0].data().correo_calendario) return pQ.docs[0].data().correo_calendario;
    }
    return null;
}

async function crearEventoSeguro(al, titulos, inicio, fin) {
    let fallbackCalId = configApp.calendario_por_defecto;
    let primaryCalId = await getCalendarIdParaAlumno(al);

    if (primaryCalId) {
        try {
            let tituloUsar = (primaryCalId === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe;
            let ev = await crearEventoCalendario(primaryCalId, tituloUsar, inicio, fin);
            return { id: ev.id, calendar: primaryCalId };
        } catch(e) { console.warn("Falló calendario profe ("+primaryCalId+"), usando fallback", e); }
    }
    
    if (fallbackCalId && fallbackCalId !== primaryCalId) {
        try {
            let ev = await crearEventoCalendario(fallbackCalId, titulos.tituloDefecto, inicio, fin);
            return { id: ev.id, calendar: fallbackCalId };
        } catch(e) { console.error("También falló fallback", e); throw e; }
    }
    throw new Error("No se pudo crear el evento en ningún calendario.");
}

async function actualizarEventoSeguro(al, titulos, desc) {
    let calGrabado = al.calendario_evento_reserva;
    let primaryCalId = await getCalendarIdParaAlumno(al);
    let fallbackCalId = configApp.calendario_por_defecto;
    
    let candidatos = [];
    if (calGrabado) candidatos.push(calGrabado);
    if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId);
    if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);

    for (let cal of candidatos) {
        try {
            let tituloUsar = (cal === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe;
            await actualizarEventoCalendario(cal, al.id_evento_reserva, tituloUsar, desc);
            return cal; 
        } catch(e) { console.warn(`Falló al actualizar en ${cal}`, e); }
    }
    throw new Error("No se pudo actualizar en ningún calendario.");
}

async function eliminarEventoSeguro(al) {
    if (!al.id_evento_reserva) return;
    let calGrabado = al.calendario_evento_reserva;
    let primaryCalId = await getCalendarIdParaAlumno(al);
    let fallbackCalId = configApp.calendario_por_defecto;

    let candidatos = [];
    if (calGrabado) candidatos.push(calGrabado);
    if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId);
    if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);

    for (let cal of candidatos) {
        try {
            await eliminarEventoCalendario(cal, al.id_evento_reserva);
            return; 
        } catch(e) { console.warn(`Falló al eliminar en ${cal}`, e); }
    }
}
// --- FIN LÓGICA DE FALLBACK ---

function chequearDisponibilidadExacta(inicioTestMs, finTestMs, eventosAPI, cantAulas, cantBat, esBateria, cfgEmoji) {
    let picosAulas = 0; let picosBateria = 0; let profesOcupados = new Set();
    const eventosCruzados = eventosAPI.filter(ev => { if (!ev.start || !ev.start.dateTime) return false; return (inicioTestMs < new Date(ev.end.dateTime).getTime() && finTestMs > new Date(ev.start.dateTime).getTime()); });
    if (eventosCruzados.length === 0) return { valido: true, profesOcupados: new Set() };
    const puntosDeTiempo = new Set([inicioTestMs, finTestMs]);
    eventosCruzados.forEach(ev => { const i = new Date(ev.start.dateTime).getTime(); const f = new Date(ev.end.dateTime).getTime(); if (i > inicioTestMs && i < finTestMs) puntosDeTiempo.add(i); if (f > inicioTestMs && f < finTestMs) puntosDeTiempo.add(f); });
    const arrayPuntos = Array.from(puntosDeTiempo).sort((a,b) => a-b);
    for (let i = 0; i < arrayPuntos.length - 1; i++) {
        const puntoMedioMs = arrayPuntos[i] + 1000; let simultaneosAulas = 0; let simultaneosBat = 0;
        eventosCruzados.forEach(ev => {
            if (puntoMedioMs >= new Date(ev.start.dateTime).getTime() && puntoMedioMs < new Date(ev.end.dateTime).getTime()) {
                simultaneosAulas++; profesOcupados.add(ev.profeId);
                if (ev.summary && ev.summary.toLowerCase().includes(cfgEmoji.toLowerCase())) {
                    simultaneosBat++;
                }
            }
        });
        if (simultaneosAulas > picosAulas) picosAulas = simultaneosAulas;
        if (simultaneosBat > picosBateria) picosBateria = simultaneosBat;
    }
    return { valido: (picosAulas < cantAulas) && (esBateria ? picosBateria < cantBat : true), profesOcupados };
}

function chequearProfeDisponible(pr, hIniB, finMs, lDia) {
    if (!pr.disponibilidad || !pr.disponibilidad[lDia] || pr.disponibilidad[lDia].length === 0) return false; 
    const slotStartMins = hIniB.getHours() * 60 + hIniB.getMinutes();
    let endH = new Date(finMs).getHours(); let endM = new Date(finMs).getMinutes();
    if (endH === 0 && endM === 0) endH = 24;
    const slotEndMins = endH * 60 + endM; let disponible = false;
    pr.disponibilidad[lDia].forEach(rango => {
        const pStartMins = parseInt(rango.inicio.split(':')[0])*60 + parseInt(rango.inicio.split(':')[1]);
        const pEndMins = parseInt(rango.fin.split(':')[0])*60 + parseInt(rango.fin.split(':')[1]);
        if (slotStartMins >= pStartMins && slotEndMins <= pEndMins) { disponible = true; }
    });
    return disponible;
}

function generarOpcionesAgenda(dispAl, eventosAPI, esBateria, todosLosProfes, profesFiltradosIDs, dStart, dEnd, cfg) {
    const opciones = [], mapaDias = { 0:"D", 1:"L", 2:"M", 3:"X", 4:"J", 5:"V", 6:"S" };
    const durMs = 60*60*1000; const slotPasoMs = 30*60*1000; const cantAulas = parseInt(cfg.cantidad_aulas)||3; const cantBat = parseInt(cfg.cantidad_baterias)||2;
    const diffDays = Math.floor(Math.abs(dEnd - dStart) / (1000*60*60*24));

    for (let i = 0; i <= diffDays; i++) {
        const fEval = new Date(dStart); fEval.setDate(fEval.getDate() + i); const lDia = mapaDias[fEval.getDay()];
        if (dispAl[lDia] && dispAl[lDia].length > 0) {
            dispAl[lDia].forEach(rango => {
                if (!rango.inicio || !rango.fin) return;
                const hIniB = new Date(fEval); hIniB.setHours(parseInt(rango.inicio.split(':')[0]), parseInt(rango.inicio.split(':')[1]), 0, 0);
                const hFinR = new Date(fEval); hFinR.setHours(parseInt(rango.fin.split(':')[0]), parseInt(rango.fin.split(':')[1]), 0, 0);
                if (hIniB < new Date()) { let curr = new Date(); curr.setMinutes(curr.getMinutes() + (30 - (curr.getMinutes() % 30)), 0, 0); hIniB.setTime(curr.getTime()); }

                while (hIniB.getTime() + durMs <= hFinR.getTime()) {
                    const inMs = hIniB.getTime(), finMs = inMs + durMs;
                    const evalOverlap = chequearDisponibilidadExacta(inMs, finMs, eventosAPI, cantAulas, cantBat, esBateria, cfg.identificador_bateria);
                    if (evalOverlap.valido) {
                        todosLosProfes.forEach(pr => {
                            if (profesFiltradosIDs.includes(pr.id) && !evalOverlap.profesOcupados.has(pr.id)) {
                                if (chequearProfeDisponible(pr, hIniB, finMs, lDia)) {
                                    opciones.push({
                                        fechaTextoAmi: formatearFechaAmi(hIniB.toISOString()), profeId: pr.id, profeNombre: pr.nombre, calId: pr.calId,
                                        inicioData: formatoLocalISO(hIniB), finData: formatoLocalISO(new Date(finMs))
                                    });
                                }
                            }
                        });
                    }
                    hIniB.setTime(hIniB.getTime() + slotPasoMs);
                }
            });
        }
    }
    return opciones;
}
// === CONFIGURACIÓN DEFAULT Y UTILIDADES ===
const defaultCfg = {
    hora_apertura: '09:00', hora_cierre: '22:00',
    calendario_por_defecto: 'productora.mandalahouse@gmail.com',
    identificador_bateria: '🥁', emoji_guitarra: '🎸', emoji_cajon: '📦', emoji_canto: '🎤', emoji_piano: '🎹', emoji_bajo: '🎸',
    valor_clase: '$10.000', cantidad_aulas: '3', cantidad_baterias: '2',
    formato_evento_reserva: '❓📋 {emojiinstrumento} {alumno} {edad}', 
    formato_evento_confirmado: '✅📋 {emojiinstrumento} {alumno} {edad}',
    texto_profe: "*⚠ PRE CHECK - ENTREVISTA*\n📅 *FECHA: {fecha_hora}*\n*👥 ALUMNO:*\n🔹 {nombre} ({edad})\n🔹 {instrumento} | {suscripcion}\n*INFO:*\n{descripcion}{bloque_historial}",
    texto_alumno: "📅 *Agenda de clase*\n🧩 {fecha_hora} con Profe {profe}\n✅ Inscripción: forms.gle/xxx\n💸 Valor: {valor}\n🧩 Alias: {alias_profe}",
    texto_conf_alumno: "Genial Gracias!\nTe esperamos!\n\n🧩 Día y horario: {fecha_hora}\n🧩 Profe: {profe}\n📍 *Dirección:* Av. Cabildo 2970, Piso 1, Depto C.\n\n⚠️ *A tener en cuenta:*\n\n- *Puntualidad:* La reserva del espacio es por 45 minutos.\n\nEl profe te va a estar escribiendo el mismo día!",
    texto_conf_profe: "*✅ ENTREVISTA CONFIRMADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*👥 DATOS DEL ALUMNO:*\n🔹 Nombre: {nombre}\n🔹 Edad: {edad}\n🔹 Instrumento: {instrumento}\n🔹 Clase: {suscripcion}\n\n*📰 INFO PARA LA ENTREVISTA:*\n{descripcion}{bloque_historial}"
};

async function cargarConfig() {
    const docSnap = await getDoc(doc(db, "configuracion", "general"));
    configApp = docSnap.exists() ? { ...defaultCfg, ...docSnap.data() } : defaultCfg;
}

function reemplazarVariables(texto, datos) { let res = texto; for (const [key, value] of Object.entries(datos)) res = res.replaceAll(`{${key}}`, value || ''); return res; }
function formatoLocalISO(date) { const tzo = -date.getTimezoneOffset(), dif = tzo >= 0 ? '+' : '-', pad = num => (num < 10 ? '0' : '') + num; return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + dif + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60); }
function formatearFechaAmi(fechaIsoStr) { const d = new Date(fechaIsoStr), dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; let min = d.getMinutes(); let minStr = min === 0 ? 'hs' : `:${min < 10 ? '0'+min : min}hs`; return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth()+1} ${d.getHours()}${minStr}`; }

// Nuevo Generador de Títulos de Evento (Maneja Emojis Dinámicos y sufijo de Profe)
function construirTitulosEvento(al, tipo, cfg) {
    let template = tipo === 'reserva' ? cfg.formato_evento_reserva : cfg.formato_evento_confirmado;
    let emojis = [];
    const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento];
    insts.forEach(i => {
        let instL = (i || '').toLowerCase();
        if (instL.includes('bater')) emojis.push(cfg.identificador_bateria || '');
        else if (instL.includes('guitarra')) emojis.push(cfg.emoji_guitarra || '');
        else if (instL.includes('cajón') || instL.includes('cajon')) emojis.push(cfg.emoji_cajon || '');
        else if (instL.includes('canto')) emojis.push(cfg.emoji_canto || '');
        else if (instL.includes('piano') || instL.includes('teclado')) emojis.push(cfg.emoji_piano || '');
        else if (instL.includes('bajo')) emojis.push(cfg.emoji_bajo || '');
    });
    
    let strEmojis = [...new Set(emojis.filter(e => e))].join(''); 

    let base = reemplazarVariables(template, {
        alumno: al.nombre,
        edad: al.edad || '',
        emoji_instrumento: strEmojis,
        emojiinstrumento: strEmojis
    }).replace(/\s+/g, ' ').trim();

    let tituloProfe = base;
    let tituloDefecto = `${base} (${al.reserva_profe_nombre})`;
    
    return { tituloProfe, tituloDefecto };
}

function interpretarFechaCSV(texto) {
    if (!texto) return null;
    const regex = /(\d{1,2})\/(\d{1,2})(?:[^\d]*?(\d{1,2})(?:[:\.](\d{2}))?(?:\s*hs)?)?/i;
    const match = texto.match(regex);
    if (match) {
        const dia = parseInt(match[1]), mes = parseInt(match[2]) - 1, hora = match[3] ? parseInt(match[3]) : 0, min = match[4] ? parseInt(match[4]) : 0;
        if (dia > 31 || mes > 11 || hora > 23 || min > 59) return null;
        return formatoLocalISO(new Date(new Date().getFullYear(), mes, dia, hora, min));
    }
    return null;
}

async function conectarGoogle() {
    try { 
        const res = await signInWithPopup(auth, provider);
        googleAccessToken = GoogleAuthProvider.credentialFromResult(res).accessToken;
        localStorage.setItem('gCalToken', googleAccessToken);
        localStorage.setItem('gCalTokenTime', Date.now());
        document.getElementById('btn-conectar-cal').style.display = 'none';
        return true;
    } catch (err) { console.error(err); alert("Se requiere acceso al calendario."); throw err; }
}

async function fetchCalendarAPI(url, method, body = null) {
    if (!googleAccessToken) { await conectarGoogle(); }
    let options = { method, headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    let res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        await conectarGoogle();
        options.headers['Authorization'] = `Bearer ${googleAccessToken}`;
        res = await fetch(url, options);
    }
    if (!res.ok && res.status !== 410 && res.status !== 404) throw new Error(`API Error: ${res.statusText}`);
    return method === 'DELETE' ? true : await res.json();
}

async function getEventosCalendario(calendarId, timeMin, timeMax) { return await fetchCalendarAPI(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`, 'GET'); }
async function crearEventoCalendario(calendarId, titulo, inicioStr, finStr) { return await fetchCalendarAPI(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, 'POST', { summary: titulo, start: { dateTime: inicioStr }, end: { dateTime: finStr } }); }
async function actualizarEventoCalendario(calendarId, eventId, titulo, descripcion) { return await fetchCalendarAPI(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, 'PATCH', { summary: titulo, description: descripcion }); }
async function eliminarEventoCalendario(calendarId, eventId) { return await fetchCalendarAPI(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, 'DELETE'); }

// --- LÓGICA DE FALLBACK DE CALENDARIOS ---
async function getCalendarIdParaAlumno(al) {
    if (al.reserva_cal_id) return al.reserva_cal_id;
    if (al.reserva_profe_id) {
        const pDoc = await getDoc(doc(db, "profesores", al.reserva_profe_id));
        if (pDoc.exists() && pDoc.data().correo_calendario) return pDoc.data().correo_calendario;
    }
    if (al.reserva_profe_nombre) {
        const pQ = await getDocs(query(collection(db, "profesores"), where("nombre", "==", al.reserva_profe_nombre)));
        if (!pQ.empty && pQ.docs[0].data().correo_calendario) return pQ.docs[0].data().correo_calendario;
    }
    return null;
}

async function crearEventoSeguro(al, titulos, inicio, fin) {
    let fallbackCalId = configApp.calendario_por_defecto;
    let primaryCalId = await getCalendarIdParaAlumno(al);

    if (primaryCalId) {
        try {
            let tituloUsar = (primaryCalId === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe;
            let ev = await crearEventoCalendario(primaryCalId, tituloUsar, inicio, fin);
            return { id: ev.id, calendar: primaryCalId };
        } catch(e) { console.warn("Falló calendario profe ("+primaryCalId+"), usando fallback", e); }
    }
    
    if (fallbackCalId && fallbackCalId !== primaryCalId) {
        try {
            let ev = await crearEventoCalendario(fallbackCalId, titulos.tituloDefecto, inicio, fin);
            return { id: ev.id, calendar: fallbackCalId };
        } catch(e) { console.error("También falló fallback", e); throw e; }
    }
    throw new Error("No se pudo crear el evento en ningún calendario.");
}

async function actualizarEventoSeguro(al, titulos, desc) {
    let calGrabado = al.calendario_evento_reserva;
    let primaryCalId = await getCalendarIdParaAlumno(al);
    let fallbackCalId = configApp.calendario_por_defecto;
    
    let candidatos = [];
    if (calGrabado) candidatos.push(calGrabado);
    if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId);
    if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);

    for (let cal of candidatos) {
        try {
            let tituloUsar = (cal === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe;
            await actualizarEventoCalendario(cal, al.id_evento_reserva, tituloUsar, desc);
            return cal; 
        } catch(e) { console.warn(`Falló al actualizar en ${cal}`, e); }
    }
    throw new Error("No se pudo actualizar en ningún calendario.");
}

async function eliminarEventoSeguro(al) {
    if (!al.id_evento_reserva) return;
    let calGrabado = al.calendario_evento_reserva;
    let primaryCalId = await getCalendarIdParaAlumno(al);
    let fallbackCalId = configApp.calendario_por_defecto;

    let candidatos = [];
    if (calGrabado) candidatos.push(calGrabado);
    if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId);
    if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);

    for (let cal of candidatos) {
        try {
            await eliminarEventoCalendario(cal, al.id_evento_reserva);
            return; 
        } catch(e) { console.warn(`Falló al eliminar en ${cal}`, e); }
    }
}
// --- FIN LÓGICA DE FALLBACK ---

function chequearDisponibilidadExacta(inicioTestMs, finTestMs, eventosAPI, cantAulas, cantBat, esBateria, cfgEmoji) {
    let picosAulas = 0; let picosBateria = 0; let profesOcupados = new Set();
    const eventosCruzados = eventosAPI.filter(ev => { if (!ev.start || !ev.start.dateTime) return false; return (inicioTestMs < new Date(ev.end.dateTime).getTime() && finTestMs > new Date(ev.start.dateTime).getTime()); });
    if (eventosCruzados.length === 0) return { valido: true, profesOcupados: new Set() };
    const puntosDeTiempo = new Set([inicioTestMs, finTestMs]);
    eventosCruzados.forEach(ev => { const i = new Date(ev.start.dateTime).getTime(); const f = new Date(ev.end.dateTime).getTime(); if (i > inicioTestMs && i < finTestMs) puntosDeTiempo.add(i); if (f > inicioTestMs && f < finTestMs) puntosDeTiempo.add(f); });
    const arrayPuntos = Array.from(puntosDeTiempo).sort((a,b) => a-b);
    for (let i = 0; i < arrayPuntos.length - 1; i++) {
        const puntoMedioMs = arrayPuntos[i] + 1000; let simultaneosAulas = 0; let simultaneosBat = 0;
        eventosCruzados.forEach(ev => {
            if (puntoMedioMs >= new Date(ev.start.dateTime).getTime() && puntoMedioMs < new Date(ev.end.dateTime).getTime()) {
                simultaneosAulas++; profesOcupados.add(ev.profeId);
                if (ev.summary && ev.summary.toLowerCase().includes(cfgEmoji.toLowerCase())) {
                    simultaneosBat++;
                }
            }
        });
        if (simultaneosAulas > picosAulas) picosAulas = simultaneosAulas;
        if (simultaneosBat > picosBateria) picosBateria = simultaneosBat;
    }
    return { valido: (picosAulas < cantAulas) && (esBateria ? picosBateria < cantBat : true), profesOcupados };
}

function chequearProfeDisponible(pr, hIniB, finMs, lDia) {
    if (!pr.disponibilidad || !pr.disponibilidad[lDia] || pr.disponibilidad[lDia].length === 0) return false; 
    const slotStartMins = hIniB.getHours() * 60 + hIniB.getMinutes();
    let endH = new Date(finMs).getHours(); let endM = new Date(finMs).getMinutes();
    if (endH === 0 && endM === 0) endH = 24;
    const slotEndMins = endH * 60 + endM; let disponible = false;
    pr.disponibilidad[lDia].forEach(rango => {
        const pStartMins = parseInt(rango.inicio.split(':')[0])*60 + parseInt(rango.inicio.split(':')[1]);
        const pEndMins = parseInt(rango.fin.split(':')[0])*60 + parseInt(rango.fin.split(':')[1]);
        if (slotStartMins >= pStartMins && slotEndMins <= pEndMins) { disponible = true; }
    });
    return disponible;
}

function generarOpcionesAgenda(dispAl, eventosAPI, esBateria, todosLosProfes, profesFiltradosIDs, dStart, dEnd, cfg) {
    const opciones = [], mapaDias = { 0:"D", 1:"L", 2:"M", 3:"X", 4:"J", 5:"V", 6:"S" };
    const durMs = 60*60*1000; const slotPasoMs = 30*60*1000; const cantAulas = parseInt(cfg.cantidad_aulas)||3; const cantBat = parseInt(cfg.cantidad_baterias)||2;
    const diffDays = Math.floor(Math.abs(dEnd - dStart) / (1000*60*60*24));

    for (let i = 0; i <= diffDays; i++) {
        const fEval = new Date(dStart); fEval.setDate(fEval.getDate() + i); const lDia = mapaDias[fEval.getDay()];
        if (dispAl[lDia] && dispAl[lDia].length > 0) {
            dispAl[lDia].forEach(rango => {
                if (!rango.inicio || !rango.fin) return;
                const hIniB = new Date(fEval); hIniB.setHours(parseInt(rango.inicio.split(':')[0]), parseInt(rango.inicio.split(':')[1]), 0, 0);
                const hFinR = new Date(fEval); hFinR.setHours(parseInt(rango.fin.split(':')[0]), parseInt(rango.fin.split(':')[1]), 0, 0);
                if (hIniB < new Date()) { let curr = new Date(); curr.setMinutes(curr.getMinutes() + (30 - (curr.getMinutes() % 30)), 0, 0); hIniB.setTime(curr.getTime()); }

                while (hIniB.getTime() + durMs <= hFinR.getTime()) {
                    const inMs = hIniB.getTime(), finMs = inMs + durMs;
                    const evalOverlap = chequearDisponibilidadExacta(inMs, finMs, eventosAPI, cantAulas, cantBat, esBateria, cfg.identificador_bateria);
                    if (evalOverlap.valido) {
                        todosLosProfes.forEach(pr => {
                            if (profesFiltradosIDs.includes(pr.id) && !evalOverlap.profesOcupados.has(pr.id)) {
                                if (chequearProfeDisponible(pr, hIniB, finMs, lDia)) {
                                    opciones.push({
                                        fechaTextoAmi: formatearFechaAmi(hIniB.toISOString()), profeId: pr.id, profeNombre: pr.nombre, calId: pr.calId,
                                        inicioData: formatoLocalISO(hIniB), finData: formatoLocalISO(new Date(finMs))
                                    });
                                }
                            }
                        });
                    }
                    hIniB.setTime(hIniB.getTime() + slotPasoMs);
                }
            });
        }
    }
    return opciones;
}
