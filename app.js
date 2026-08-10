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
    // Disp Alumnos
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
    // Disp Profes
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
// === CONFIGURACIÓN DEFAULT Y LÓGICA DE CALENDARIO ===
const defaultCfg = {
    hora_apertura: '09:00', hora_cierre: '22:00',
    identificador_bateria: '[BAT]', valor_clase: '$10.000', cantidad_aulas: '3', cantidad_baterias: '2',
    formato_evento_reserva: '? {profe} Ent {alumno}', formato_evento_confirmado: '📋🎸{instrumento} - {alumno} {edad}',
    texto_profe: "*⚠ PRE CHECK - ENTREVISTA*\n📅 *FECHA: {fecha_hora}*\n*👥 ALUMNO:*\n🔹 {nombre} ({edad})\n🔹 {instrumento} | {suscripcion}\n*INFO:*\n{descripcion}{bloque_historial}",
    texto_alumno: "📅 *Agenda de clase*\n🧩 {fecha_hora} con Profe {profe}\n✅ Inscripción: forms.gle/xxx\n💸 Valor: {valor}\n🧩 Alias: {alias_profe}",
    texto_conf_alumno: "Genial Gracias!\nTe esperamos!\n\n🧩 Día y horario: {fecha_hora}\n🧩 Profe: {profe}\n📍 *Dirección:* Av. Cabildo 2970, Piso 1, Depto C.\n\n⚠️ *A tener en cuenta:*\n\n- *Puntualidad:* La reserva del espacio es por 45 minutos. Te pido llegar puntual para aprovechar al máximo el encuentr* 🙏🏻.\n\n- *Reprogramaciones:* Se puede reprogramar una sola vez con aviso previo de 24 hs. De lo contrario, se pierde el turno y el valor abonado.\n\nEl profe te va a estar escribiendo el mismo día!",
    texto_conf_profe: "*✅ ENTREVISTA CONFIRMADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*👥 DATOS DEL ALUMNO:*\n🔹 Nombre: {nombre}\n🔹 Edad: {edad}\n🔹 Instrumento: {instrumento}\n🔹 Clase: {suscripcion}\n\n*📰 INFO PARA LA ENTREVISTA:*\n{descripcion}{bloque_historial}"
};

async function cargarConfig() {
    const docSnap = await getDoc(doc(db, "configuracion", "general"));
    configApp = docSnap.exists() ? { ...defaultCfg, ...docSnap.data() } : defaultCfg;
}

function reemplazarVariables(texto, datos) { let res = texto; for (const [key, value] of Object.entries(datos)) res = res.replaceAll(`{${key}}`, value || ''); return res; }
function formatoLocalISO(date) { const tzo = -date.getTimezoneOffset(), dif = tzo >= 0 ? '+' : '-', pad = num => (num < 10 ? '0' : '') + num; return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + dif + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60); }
function formatearFechaAmi(fechaIsoStr) { const d = new Date(fechaIsoStr), dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; let min = d.getMinutes(); let minStr = min === 0 ? 'hs' : `:${min < 10 ? '0'+min : min}hs`; return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth()+1} ${d.getHours()}${minStr}`; }
function getTituloConBateria(al, baseTitle, cfg) { const arrI = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento]; const esBat = arrI.some(i => i && i.toLowerCase().includes('bater')); if (esBat && cfg.identificador_bateria) { return cfg.identificador_bateria + ' ' + baseTitle; } return baseTitle; }

async function conectarGoogle() {
    try { 
        const res = await signInWithPopup(auth, provider);
        googleAccessToken = GoogleAuthProvider.credentialFromResult(res).accessToken;
        localStorage.setItem('gCalToken', googleAccessToken);
        localStorage.setItem('gCalTokenTime', Date.now());
        document.getElementById('btn-conectar-cal').style.display = 'none';
        return true;
    } catch (err) { console.error(err); alert("Se requiere acceso al calendario para esta acción."); throw err; }
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
                if (ev.summary && ev.summary.toLowerCase().includes(cfgEmoji.toLowerCase())) simultaneosBat++;
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
    let endH = new Date(finMs).getHours(), endM = new Date(finMs).getMinutes(); if (endH === 0 && endM === 0) endH = 24;
    const slotEndMins = endH * 60 + endM; let disponible = false;
    pr.disponibilidad[lDia].forEach(rango => {
        const pStartMins = parseInt(rango.inicio.split(':')[0])*60 + parseInt(rango.inicio.split(':')[1]);
        const pEndMins = parseInt(rango.fin.split(':')[0])*60 + parseInt(rango.fin.split(':')[1]);
        if (slotStartMins >= pStartMins && slotEndMins <= pEndMins) disponible = true;
    });
    return disponible;
}

function generarOpcionesAgenda(dispAl, eventosAPI, esBateria, todosLosProfes, profesFiltradosIDs, dStart, dEnd, cfg) {
    const opciones = [], mapaDias = { 0:"D", 1:"L", 2:"M", 3:"X", 4:"J", 5:"V", 6:"S" };
    const durMs = 60*60*1000, slotPasoMs = 30*60*1000, cantAulas = parseInt(cfg.cantidad_aulas)||3, cantBat = parseInt(cfg.cantidad_baterias)||2;
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
                                    opciones.push({ fechaTextoAmi: formatearFechaAmi(hIniB.toISOString()), profeId: pr.id, profeNombre: pr.nombre, calId: pr.calId, inicioData: formatoLocalISO(hIniB), finData: formatoLocalISO(new Date(finMs)) });
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
// === GENERADOR DE TARJETAS Y VISTAS ===
function generarTarjetaAlumno(al, id, vista) {
    const instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento;
    let tags = '', acciones = '', extraClass = '';

    if (vista === 'Resumen') {
        if ((al.estado_agenda === 'Pendiente validación por profe' || al.estado_agenda === 'Pendiente validación por alumno') && al.reserva_inicio) {
            let diffHs = (new Date(al.reserva_inicio) - new Date()) / (1000 * 60 * 60);
            if (diffHs < 0) { extraClass = 'urgencia-vencida'; tags += `<div class="badge-urgencia text-vencido">⚠️ Vencida (Pasó la fecha)</div>`; } 
            else if (diffHs <= 48) { extraClass = 'urgencia-roja'; tags += `<div class="badge-urgencia text-rojo">🔴 Crítico: Faltan ${Math.floor(diffHs)}hs</div>`; } 
            else if (diffHs <= 72) { extraClass = 'urgencia-amarilla'; tags += `<div class="badge-urgencia text-amarillo">🟡 Alerta: Faltan ${Math.floor(diffHs)}hs</div>`; } 
            else { extraClass = 'urgencia-verde'; tags += `<div class="badge-urgencia text-verde">🟢 A tiempo: Faltan ${Math.floor(diffHs/24)} días</div>`; }
        } else if (al.estado_agenda === 'Agenda confirmada') { extraClass = 'item-confirmada'; }
    }

    if (vista === 'Gestiones en Curso' || vista === 'Resumen') {
        if (al.reserva_fecha_texto) {
            if (al.id_evento_reserva) tags += `<div class="badge badge-warning">🔒 Bloqueado: ${al.reserva_fecha_texto} (${al.reserva_profe_nombre})</div>`;
            else tags += `<button class="btn-bloquear-agenda badge" data-id="${id}">⏳ Propuesto: ${al.reserva_fecha_texto} (${al.reserva_profe_nombre})</button>`;
        }
        if (al.estado_agenda === 'Pendiente procesar') { acciones += `<button class="btn-buscar-agenda btn-accion-main" data-id="${id}">🔍 Buscar Agenda</button><button class="btn-abrir-suspender btn-suspender" data-id="${id}">Suspender</button>`; } 
        else if (al.estado_agenda === 'Pendiente validación por profe') { acciones += `<button class="btn-confirmada-profe btn-violeta" data-id="${id}">Agenda confirmada por profesor</button><button class="btn-reenviar-profe btn-verde-claro" data-id="${id}">Re-enviar validación</button><button class="btn-cancelar-reserva btn-suspender" data-id="${id}">Cancelar Validación</button><button class="btn-abrir-suspender btn-suspender" data-id="${id}">Suspender</button>`; } 
        else if (al.estado_agenda === 'Pendiente validación por alumno') { acciones += `<button class="btn-confirmar-entrevista btn-accion-main" data-id="${id}">Confirmar Agenda</button><button class="btn-reenviar-alumno btn-verde-claro" data-id="${id}">Re-Enviar validación p/alumno</button><button class="btn-cancelar-reserva btn-suspender" data-id="${id}">Cancelar Agenda</button><button class="btn-abrir-suspender btn-suspender" data-id="${id}">Suspender</button>`; }
    } 
    
    if (vista === 'Agendas Confirmadas' || (vista === 'Resumen' && al.estado_agenda === 'Agenda confirmada')) {
        if (vista !== 'Resumen') { extraClass = 'item-confirmada'; tags += `<div class="badge badge-success">✅ Confirmado: ${al.reserva_fecha_texto||'-'} (${al.reserva_profe_nombre||'-'})</div>`; } 
        else if (vista === 'Resumen' && !tags.includes('✅')) { tags += `<div class="badge badge-success" style="margin-bottom:8px;">✅ ${al.reserva_fecha_texto||'-'} (${al.reserva_profe_nombre||'-'})</div>`; }
        acciones += `<button class="btn-enviar-conf-profe btn-verde-claro" data-id="${id}">Enviar confirmación Profe</button><button class="btn-enviar-conf-alumno btn-verde-claro" data-id="${id}">Enviar confirmación Alumno</button><button class="btn-cancelar-reserva btn-suspender" data-id="${id}">Deshacer Confirmación</button>`;
    } else if (vista === 'Agendas Suspendidas') {
        extraClass = 'item-suspendida'; tags += `<div class="badge badge-danger">Motivo: ${al.motivo_suspension||'S/D'}</div>`;
        acciones += `<button class="btn-recuperar-agenda btn-accion-main" data-id="${id}">Recuperar Agenda</button>`;
    }

    return `<div class="alumno-item ${extraClass}" data-id="${id}"><div class="alumno-header btn-editar-alumno" data-id="${id}"><button class="btn-eliminar-alumno" title="Eliminar Alumno">❌</button><div style="width:90%;">${tags}<div class="alumno-nombre-search" style="font-size:1.1em; font-weight:700; color:#212529;">${al.nombre}</div><div style="color:#495057; font-size:0.9em; margin-top:2px;">${instStr} (${al.tipo_suscripcion})</div><div style="color:#868e96; font-size:0.8em; margin-top:5px;">Cel: ${al.celular} | Edad: ${al.edad||'-'}</div></div></div>${acciones ? `<div class="alumno-actions">${acciones}</div>` : ''}<div id="accordion-${id}" style="display:none; margin-top:10px;"></div></div>`;
}

async function cargarVista(vista) {
    estadoActualVista = vista; document.getElementById('vista-titulo').textContent = vista;
    const btnNuevo = document.getElementById('btn-nuevo-alumno'), searchGen = document.getElementById('search-container-general'), btnCargaMasiva = document.getElementById('btn-carga-masiva'), contTablero = document.getElementById('tablero-gestiones'), contResumen = document.getElementById('tablero-resumen'), contLista = document.getElementById('lista-generica'), contEstad = document.getElementById('estadisticas-container');
    const formWrapper = document.getElementById('form-alumno-wrapper'); if (formWrapper) { formWrapper.style.display = 'none'; document.body.appendChild(formWrapper); }
    btnNuevo.style.display = 'none'; searchGen.style.display = 'none'; btnCargaMasiva.style.display = 'none'; contTablero.style.display = 'none'; if(contResumen) contResumen.style.display = 'none'; contLista.style.display = 'none'; contEstad.style.display = 'none'; document.getElementById('input-buscador-general').value = '';

    if (vista === 'Resumen') {
        btnNuevo.style.display = 'block'; searchGen.style.display = 'block'; if(contResumen) contResumen.style.display = 'flex';
        const colPendientes = document.getElementById('col-resumen-pendientes'), colConfirmadas = document.getElementById('col-resumen-confirmadas');
        if(colPendientes) colPendientes.innerHTML = ''; if(colConfirmadas) colConfirmadas.innerHTML = '';
        try {
            const refAl = collection(db, "alumnos");
            const [rProfe, rAlumno, rConf] = await Promise.all([ getDocs(query(refAl, where("estado_agenda", "==", "Pendiente validación por profe"))), getDocs(query(refAl, where("estado_agenda", "==", "Pendiente validación por alumno"))), getDocs(query(refAl, where("estado_agenda", "==", "Agenda confirmada"))) ]);
            let pendientes = []; rProfe.forEach(d => pendientes.push({id: d.id, ...d.data()})); rAlumno.forEach(d => pendientes.push({id: d.id, ...d.data()}));
            let confirmadas = []; rConf.forEach(d => confirmadas.push({id: d.id, ...d.data()}));
            pendientes = pendientes.filter(a => a.reserva_inicio); confirmadas = confirmadas.filter(a => a.reserva_inicio);
            pendientes.sort((a, b) => new Date(a.reserva_inicio) - new Date(b.reserva_inicio)); confirmadas.sort((a, b) => new Date(a.reserva_inicio) - new Date(b.reserva_inicio));
            if(colPendientes) colPendientes.innerHTML = pendientes.length > 0 ? pendientes.map(a => generarTarjetaAlumno(a, a.id, vista)).join('') : '<p style="color:#6c757d;">No hay reservas pendientes.</p>';
            if(colConfirmadas) colConfirmadas.innerHTML = confirmadas.length > 0 ? confirmadas.map(a => generarTarjetaAlumno(a, a.id, vista)).join('') : '<p style="color:#6c757d;">No hay agendas confirmadas.</p>';
        } catch(e) { console.error(e); }
    } else if (vista === 'Gestiones en Curso') {
        btnNuevo.style.display = 'block'; btnCargaMasiva.style.display = 'block'; searchGen.style.display = 'block'; contTablero.style.display = 'flex';
        document.getElementById('col-1-content').innerHTML = ''; document.getElementById('col-2-content').innerHTML = ''; document.getElementById('col-3-content').innerHTML = '';
        try {
            const refAl = collection(db, "alumnos");
            const [r1, r2, r3] = await Promise.all([ getDocs(query(refAl, where("estado_agenda", "==", "Pendiente procesar"))), getDocs(query(refAl, where("estado_agenda", "==", "Pendiente validación por profe"))), getDocs(query(refAl, where("estado_agenda", "==", "Pendiente validación por alumno"))) ]);
            if(!r1.empty) document.getElementById('col-1-content').innerHTML = r1.docs.map(d => generarTarjetaAlumno(d.data(), d.id, vista)).join('');
            if(!r2.empty) document.getElementById('col-2-content').innerHTML = r2.docs.map(d => generarTarjetaAlumno(d.data(), d.id, vista)).join('');
            if(!r3.empty) document.getElementById('col-3-content').innerHTML = r3.docs.map(d => generarTarjetaAlumno(d.data(), d.id, vista)).join('');
        } catch(e) { console.error(e); }
    } else if (vista === 'Agendas Confirmadas' || vista === 'Agendas Suspendidas') {
        searchGen.style.display = 'block'; contLista.style.display = 'flex'; contLista.innerHTML = '';
        try { const estMap = { 'Agendas Confirmadas': 'Agenda confirmada', 'Agendas Suspendidas': 'Agenda suspendida' }; const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", estMap[vista]))); if(!qSnap.empty) contLista.innerHTML = qSnap.docs.map(d => generarTarjetaAlumno(d.data(), d.id, vista)).join(''); } catch(e) { console.error(e); }
    } else if (vista === 'Estadísticas') {
        contEstad.style.display = 'flex'; renderCharts();
    } else if (vista.startsWith('ABM') || vista === 'Configuración') {
        contLista.style.display = 'flex'; contLista.innerHTML = '';
        if(vista === 'Configuración') renderConfig(contLista);
        else { const colMap = { 'ABM-Profesores': 'profesores', 'ABM-Instrumentos': 'instrumentos', 'ABM-Suscripciones': 'tipos_suscripcion' }; cargarABM(colMap[vista], vista.split('-')[1], contLista); }
    }
}

async function renderCharts() {
    try {
        const qSnap = await getDocs(collection(db, "alumnos")), counts = { 'Pendiente procesar':0, 'Pendiente validación por profe':0, 'Pendiente validación por alumno':0, 'Agenda confirmada':0, 'Agenda suspendida':0 };
        qSnap.forEach(d => { if(counts[d.data().estado_agenda] !== undefined) counts[d.data().estado_agenda]++; });
        if(chartGestionesInst) chartGestionesInst.destroy(); if(chartGlobalInst) chartGlobalInst.destroy();
        chartGestionesInst = new Chart(document.getElementById('chartGestiones'), { type: 'doughnut', data: { labels: ['Sin Agendar', 'Validando Profe', 'Validando Alumno'], datasets: [{ data: [counts['Pendiente procesar'], counts['Pendiente validación por profe'], counts['Pendiente validación por alumno']], backgroundColor: ['#dc3545', '#6f42c1', '#ffc107'] }] } });
        chartGlobalInst = new Chart(document.getElementById('chartGlobal'), { type: 'pie', data: { labels: ['En Curso (Total)', 'Confirmadas', 'Suspendidas'], datasets: [{ data: [counts['Pendiente procesar']+counts['Pendiente validación por profe']+counts['Pendiente validación por alumno'], counts['Agenda confirmada'], counts['Agenda suspendida']], backgroundColor: ['#17a2b8', '#28a745', '#6c757d'] }] } });
    } catch(e) { console.error(e); }
}

// === EVENT LISTENER PRINCIPAL (DELEGACIÓN) ===
document.addEventListener('click', async (e) => {
    const target = e.target;
    if (target.classList.contains('btn-copy-disp')) { e.stopPropagation(); const d = target.getAttribute('data-dia'); clipboardDisponibilidad = { inicio: document.getElementById(`disp-${d}-inicio`).value, fin: document.getElementById(`disp-${d}-fin`).value, all: document.getElementById(`disp-${d}-all`).checked, none: document.getElementById(`disp-${d}-none`).checked }; return; }
    if (target.classList.contains('btn-paste-disp')) { e.stopPropagation(); if (!clipboardDisponibilidad) return alert("Primero copia una disponibilidad."); const d = target.getAttribute('data-dia'); document.getElementById(`disp-${d}-inicio`).value = clipboardDisponibilidad.inicio; document.getElementById(`disp-${d}-fin`).value = clipboardDisponibilidad.fin; document.getElementById(`disp-${d}-all`).checked = clipboardDisponibilidad.all; document.getElementById(`disp-${d}-none`).checked = clipboardDisponibilidad.none; window.updateDispStateForDay(d, false); return; }
    if (target.classList.contains('btn-copy-disp-p')) { e.stopPropagation(); const d = target.getAttribute('data-dia'); clipboardDisponibilidadProfe = { inicio: document.getElementById(`disp-p-${d}-inicio`).value, fin: document.getElementById(`disp-p-${d}-fin`).value, all: document.getElementById(`disp-p-${d}-all`).checked, none: document.getElementById(`disp-p-${d}-none`).checked }; return; }
    if (target.classList.contains('btn-paste-disp-p')) { e.stopPropagation(); if (!clipboardDisponibilidadProfe) return alert("Primero copia una disponibilidad."); const d = target.getAttribute('data-dia'); document.getElementById(`disp-p-${d}-inicio`).value = clipboardDisponibilidadProfe.inicio; document.getElementById(`disp-p-${d}-fin`).value = clipboardDisponibilidadProfe.fin; document.getElementById(`disp-p-${d}-all`).checked = clipboardDisponibilidadProfe.all; document.getElementById(`disp-p-${d}-none`).checked = clipboardDisponibilidadProfe.none; window.updateDispStateForDay(d, true); return; }

    if (target.classList.contains('btn-eliminar-alumno')) { e.stopPropagation(); if(confirm("¿Eliminar este alumno por completo?")) { const id = target.closest('.alumno-item').getAttribute('data-id'); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); if (al && al.id_evento_reserva) await eliminarEventoCalendario('productora.mandalahouse@gmail.com', al.id_evento_reserva); } catch(err){} await deleteDoc(doc(db, "alumnos", id)); cargarVista(estadoActualVista); } return; }

    if (target.id === 'btn-agregar-nota') { const textarea = document.getElementById('nueva-nota-texto'); const texto = textarea.value.trim(); if(!texto) return; const now = new Date(); const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`; historialActual.push({ id: Date.now(), texto: texto, fecha: fechaStr }); textarea.value = ''; renderHistorial(); return; }
    if (target.classList.contains('btn-eliminar-nota')) { const id = parseInt(target.getAttribute('data-id')); historialActual = historialActual.filter(n => n.id !== id); renderHistorial(); return; }
    if (target.classList.contains('btn-editar-nota')) { const id = parseInt(target.getAttribute('data-id')); const notaIndex = historialActual.findIndex(n => n.id === id); if (notaIndex !== -1) { document.getElementById('nueva-nota-texto').value = historialActual[notaIndex].texto; historialActual.splice(notaIndex, 1); renderHistorial(); } return; }

    const headerAl = target.closest('.btn-editar-alumno');
    if (headerAl && !target.classList.contains('btn-eliminar-alumno')) {
        const id = headerAl.getAttribute('data-id'), accDiv = document.getElementById(`accordion-${id}`), wrap = document.getElementById('form-alumno-wrapper');
        if (accDiv.contains(wrap) && wrap.style.display === 'block') { wrap.style.display = 'none'; return; }
        wrap.style.display = 'none'; document.querySelectorAll('[id^="accordion-"]').forEach(el => el.style.display = 'none');
        document.getElementById('alumno-id').value = id; await llenarFormularioAlumno(id); accDiv.appendChild(wrap); document.getElementById('form-titulo').textContent = 'Editar Alumno'; wrap.style.display = 'block'; accDiv.style.display = 'block'; return;
    }

    if (target.classList.contains('btn-buscar-agenda')) {
        if(!googleAccessToken) return alert("Requiere token. Conecta el calendario arriba.");
        alumnoIdActual = target.getAttribute('data-id'); const modal = document.getElementById('modal-agenda'), resDiv = document.getElementById('resultados-agenda'), inputBuscadorPop = document.getElementById('input-buscador-popup');
        inputBuscadorPop.style.display = 'none'; inputBuscadorPop.value = ''; resDiv.innerHTML = '';
        const hoy = new Date(); const d7 = new Date(); d7.setDate(d7.getDate()+7);
        document.getElementById('agenda-start').value = hoy.toISOString().split('T')[0]; document.getElementById('agenda-end').value = d7.toISOString().split('T')[0];
        try { const selectProfe = document.getElementById('agenda-profe-filtro'); selectProfe.innerHTML = '<option value="">Todos los profesores habilitados</option>'; const pSnap = await getDocs(collection(db, "profesores")); pSnap.forEach(p => { if(p.data().entrevista) selectProfe.innerHTML += `<option value="${p.id}">${p.data().nombre}</option>`; }); resDiv.innerHTML = '<p>Selecciona el rango y haz clic en Buscar.</p>'; modal.showModal(); } catch(err) { console.error(err); } return;
    }

    if (target.classList.contains('btn-bloquear-agenda')) {
        if(confirm("¿Reservar preventivamente este horario?")) {
            const id = target.getAttribute('data-id');
            try { const al = (await getDoc(doc(db, "alumnos", id))).data(); const instStr = Array.isArray(al.instrumento) ? al.instrumento.join('/') : al.instrumento; let tituloEv = reemplazarVariables(configApp.formato_evento_reserva, { profe: al.reserva_profe_nombre, alumno: al.nombre, instrumento: instStr }); tituloEv = getTituloConBateria(al, tituloEv, configApp); const evObj = await crearEventoCalendario('productora.mandalahouse@gmail.com', tituloEv, al.reserva_inicio, al.reserva_fin); await updateDoc(doc(db, "alumnos", id), { id_evento_reserva: evObj.id }); cargarVista(estadoActualVista); } catch(e) { console.error(e); alert("Error API Calendar."); }
        } return;
    }
    
    if (target.classList.contains('btn-confirmada-profe')) {
        const id = target.getAttribute('data-id');
        try { 
            const al = (await getDoc(doc(db, "alumnos", id))).data(); let aliasP = ''; 
            if (al.reserva_profe_id) { const pDoc = await getDoc(doc(db, "profesores", al.reserva_profe_id)); if(pDoc.exists()) aliasP = pDoc.data().alias_transferencia||''; } 
            else if (al.reserva_profe_nombre) { const pQ = await getDocs(query(collection(db, "profesores"), where("nombre", "==", al.reserva_profe_nombre))); if(!pQ.empty) aliasP = pQ.docs[0].data().alias_transferencia||''; }
            const txt = reemplazarVariables(configApp.texto_alumno, { fecha_hora: al.reserva_fecha_texto, profe: al.reserva_profe_nombre, valor: configApp.valor_clase, alias_profe: aliasP }); 
            await navigator.clipboard.writeText(txt); 
            let evId = al.id_evento_reserva; 
            if (!evId) { const instStr = Array.isArray(al.instrumento) ? al.instrumento.join('/') : al.instrumento; let tit = reemplazarVariables(configApp.formato_evento_reserva, { profe: al.reserva_profe_nombre, alumno: al.nombre, instrumento: instStr }); tit = getTituloConBateria(al, tit, configApp); evId = (await crearEventoCalendario('productora.mandalahouse@gmail.com', tit, al.reserva_inicio, al.reserva_fin)).id; } 
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente validación por alumno", id_evento_reserva: evId }); alert("Texto copiado al portapapeles y estado avanzado."); cargarVista(estadoActualVista); 
        } catch(e) { console.error(e); } return;
    }

    if (target.classList.contains('btn-confirmar-entrevista')) {
        const id = target.getAttribute('data-id');
        try { const al = (await getDoc(doc(db, "alumnos", id))).data(); const instStr = Array.isArray(al.instrumento) ? al.instrumento.join('/') : al.instrumento; const descP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : ''; let tit = reemplazarVariables(configApp.formato_evento_confirmado, { instrumento: instStr, alumno: al.nombre, edad: al.edad||'' }); tit = getTituloConBateria(al, tit, configApp); await actualizarEventoCalendario('productora.mandalahouse@gmail.com', al.id_evento_reserva, tit, descP); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda confirmada" }); alert("¡Agenda Confirmada!"); cargarVista(estadoActualVista); } catch(e) { console.error(e); } return;
    }

    if (target.classList.contains('btn-reenviar-profe') || target.classList.contains('btn-enviar-conf-profe')) {
        try {
            const id = target.getAttribute('data-id'), al = (await getDoc(doc(db, "alumnos", id))).data(), iS = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento, dP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : '';
            let bloqueHistorial = ''; if (al.historial && al.historial.length > 0) { const historyText = [...al.historial].sort((a,b)=>a.id-b.id).map(h => `[${h.fecha}] ${h.texto}`).join('\n'); bloqueHistorial = `\n\n*🕐 HISTORIAL DE CONTACTO:*\n${historyText}`; }
            let template = target.classList.contains('btn-reenviar-profe') ? configApp.texto_profe : configApp.texto_conf_profe;
            template = template.replace(/\{historial\}/g, '{bloque_historial}'); 
            if (!bloqueHistorial) { template = template.replace(/\n*\*[^\n]*HISTORIAL[^\n]*\*\n*\{bloque_historial\}/gi, ''); template = template.replace('{bloque_historial}', ''); } 
            else { template = template.replace(/\n*\*[^\n]*HISTORIAL[^\n]*\*\n*\{bloque_historial\}/gi, '{bloque_historial}'); template = template.replace('{bloque_historial}', bloqueHistorial); }
            const txt = reemplazarVariables(template, { fecha_hora: al.reserva_fecha_texto, nombre: al.nombre, edad: al.edad||'-', instrumento: iS, suscripcion: al.tipo_suscripcion, descripcion: dP });
            await navigator.clipboard.writeText(txt); alert("Texto para PROFESOR copiado al portapapeles.");
        } catch(e) { console.error(e); } return;
    }

    if (target.classList.contains('btn-reenviar-alumno') || target.classList.contains('btn-enviar-conf-alumno')) {
        try {
            const id = target.getAttribute('data-id'), al = (await getDoc(doc(db, "alumnos", id))).data();
            let aliasP = ''; if (al.reserva_profe_id) { const pDoc = await getDoc(doc(db, "profesores", al.reserva_profe_id)); if(pDoc.exists()) aliasP = pDoc.data().alias_transferencia||''; } else if (al.reserva_profe_nombre) { const pQ = await getDocs(query(collection(db, "profesores"), where("nombre", "==", al.reserva_profe_nombre))); if(!pQ.empty) aliasP = pQ.docs[0].data().alias_transferencia||''; }
            const template = target.classList.contains('btn-reenviar-alumno') ? configApp.texto_alumno : configApp.texto_conf_alumno;
            const txt = reemplazarVariables(template, { fecha_hora: al.reserva_fecha_texto, profe: al.reserva_profe_nombre, valor: configApp.valor_clase, alias_profe: aliasP });
            await navigator.clipboard.writeText(txt); alert("Texto para ALUMNO copiado al portapapeles.");
        } catch(e) { console.error(e); } return;
    }

    if (target.classList.contains('btn-cancelar-reserva')) {
        if (confirm("¿Cancelar reserva en Calendar y volver a Sin Agendar?")) { const id = target.getAttribute('data-id'); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); if (al.id_evento_reserva) await eliminarEventoCalendario('productora.mandalahouse@gmail.com', al.id_evento_reserva); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente procesar", reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null }); cargarVista(estadoActualVista); } catch(e) { console.error(e); alert("Error."); } } return;
    }

    if (target.classList.contains('btn-abrir-suspender')) { document.getElementById('susp-alumno-id').value = target.getAttribute('data-id'); document.getElementById('susp-motivo').value = ""; document.getElementById('modal-suspender').showModal(); return; }
    if (target.classList.contains('btn-recuperar-agenda')) { await updateDoc(doc(db, "alumnos", target.getAttribute('data-id')), { estado_agenda: "Pendiente procesar", motivo_suspension: null }); cargarVista(estadoActualVista); return; }
    if (target.classList.contains('btn-cerrar-modal')) { document.getElementById(target.getAttribute('data-modal')).close(); return; }
    
    if (target.id === 'btn-ejecutar-busqueda') {
        const resDiv = document.getElementById('resultados-agenda'), dStrStart = document.getElementById('agenda-start').value, dStrEnd = document.getElementById('agenda-end').value, inputBuscadorPop = document.getElementById('input-buscador-popup');
        if(!dStrStart || !dStrEnd) return alert("Fechas inválidas.");
        const selProfe = document.getElementById('agenda-profe-filtro'), fProfs = Array.from(selProfe.selectedOptions).map(o => o.value), searchAll = fProfs.length === 0 || fProfs.includes("");
        resDiv.innerHTML = '<p>Buscando...</p>';
        try {
            const al = (await getDoc(doc(db, "alumnos", alumnoIdActual))).data(), arrI = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento], esBat = arrI.some(i => i.toLowerCase().includes('bater'));
            const dMap = { 'D':0, 'L':1, 'M':2, 'X':3, 'J':4, 'V':5, 'S':6 }, diasHab = []; for (const [l, arr] of Object.entries(al.disponibilidad)) { if (arr && arr.length > 0) diasHab.push(dMap[l]); }
            const dS = new Date(dStrStart+'T00:00:00'), dE = new Date(dStrEnd+'T23:59:59'); let algunValido = false;
            for(let x = new Date(dS); x <= dE; x.setDate(x.getDate()+1)) { if(x.getDay()!==0 && diasHab.includes(x.getDay())) algunValido=true; }
            if(!algunValido) { inputBuscadorPop.style.display = 'none'; return resDiv.innerHTML = '<p style="color:#dc3545;">El rango solo abarca días domingos o "No disponible".</p>'; }

            const pS = await getDocs(collection(db, "profesores")), todosLosProfes = [], profesFiltradosIDs = [];
            pS.forEach(p => { const d = p.data(); if(d.correo_calendario) { todosLosProfes.push({ id: p.id, nombre: d.nombre, calId: d.correo_calendario, disponibilidad: d.disponibilidad }); if (d.entrevista && (searchAll || fProfs.includes(p.id))) profesFiltradosIDs.push(p.id); } });
            if(profesFiltradosIDs.length === 0) { inputBuscadorPop.style.display = 'none'; return resDiv.innerHTML = '<p>No hay profes habilitados seleccionados.</p>';}

            let allEv = [];
            for(const pr of todosLosProfes) { try { const data = await getEventosCalendario(pr.calId, dS.toISOString(), dE.toISOString()); if(data.items) allEv = allEv.concat(data.items.map(ev => ({...ev, profeId: pr.id}))); } catch(e){} }

            const opts = generarOpcionesAgenda(al.disponibilidad, allEv, esBat, todosLosProfes, profesFiltradosIDs, dS, dE, configApp);
            if(opts.length===0) { inputBuscadorPop.style.display = 'none'; resDiv.innerHTML='<p>No hay huecos libres que cumplan las condiciones.</p>';}
            else { inputBuscadorPop.style.display = 'block'; resDiv.innerHTML = opts.map(op => `<div class="opcion-horario"><span>${op.fechaTextoAmi} (${op.profeNombre})</span><button class="btn-seleccionar-profe btn-accion-main" data-calid="${op.calId}" data-profe="${op.profeNombre}" data-profeid="${op.profeId}" data-start="${op.inicioData}" data-end="${op.finData}" data-fechatxt="${op.fechaTextoAmi}">Validar con Profe</button></div>`).join(''); }
        } catch(e) { console.error(e); inputBuscadorPop.style.display = 'none'; resDiv.innerHTML='<p>Error.</p>'; } return;
    }
    
    if (target.classList.contains('btn-seleccionar-profe')) {
        try {
            const al = (await getDoc(doc(db, "alumnos", alumnoIdActual))).data(), iS = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento, dP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : '';
            let bloqueHistorial = ''; if (al.historial && al.historial.length > 0) { const historyText = [...al.historial].sort((a,b)=>a.id-b.id).map(h => `[${h.fecha}] ${h.texto}`).join('\n'); bloqueHistorial = `\n\n*🕐 HISTORIAL DE CONTACTO:*\n${historyText}`; }
            let template = configApp.texto_profe;
            template = template.replace(/\{historial\}/g, '{bloque_historial}'); 
            if (!bloqueHistorial) { template = template.replace(/\n*\*[^\n]*HISTORIAL[^\n]*\*\n*\{bloque_historial\}/gi, ''); template = template.replace('{bloque_historial}', ''); } 
            else { template = template.replace(/\n*\*[^\n]*HISTORIAL[^\n]*\*\n*\{bloque_historial\}/gi, '{bloque_historial}'); template = template.replace('{bloque_historial}', bloqueHistorial); }
            const txt = reemplazarVariables(template, { fecha_hora: target.getAttribute('data-fechatxt'), nombre: al.nombre, edad: al.edad||'-', instrumento: iS, suscripcion: al.tipo_suscripcion, descripcion: dP });
            await navigator.clipboard.writeText(txt);
            const profeId = target.getAttribute('data-profeid');
            await updateDoc(doc(db, "alumnos", alumnoIdActual), { estado_agenda: "Pendiente validación por profe", reserva_profe_id: profeId, reserva_profe_nombre: target.getAttribute('data-profe'), reserva_cal_id: target.getAttribute('data-calid'), reserva_fecha_texto: target.getAttribute('data-fechatxt'), reserva_inicio: target.getAttribute('data-start'), reserva_fin: target.getAttribute('data-end') });
            alert("Copiado al portapapeles. Estado avanzado."); document.getElementById('modal-agenda').close(); cargarVista(estadoActualVista);
        } catch(e) { console.error(e); } return;
    }
    
    if (target.id === 'btn-nuevo-alumno') {
        const wrap = document.getElementById('form-alumno-wrapper'); document.getElementById('modal-alta-alumno').appendChild(wrap); wrap.style.display = 'block'; document.getElementById('form-titulo').textContent = 'Nuevo Alumno';
        document.getElementById('alumno-id').value = ''; document.getElementById('form-alumno').reset(); quill.setContents([]); historialActual = []; renderHistorial();
        diasSemana.forEach(d => { document.getElementById(`disp-${d.id}-all`).checked=false; document.getElementById(`disp-${d.id}-none`).checked=false; document.getElementById(`estado-${d.id}`).textContent=""; });
        await cargarSelectsAlumnos(); document.getElementById('modal-alta-alumno').showModal(); return;
    }
    if (target.id === 'btn-cerrar-alumno') { const wrap = document.getElementById('form-alumno-wrapper'); wrap.style.display = 'none'; document.body.appendChild(wrap); document.getElementById('modal-alta-alumno').close(); return; }
});

document.getElementById('btn-guardar-suspension').addEventListener('click', async () => { const id = document.getElementById('susp-alumno-id').value, mtv = document.getElementById('susp-motivo').value; if(!mtv) return alert("Seleccione motivo"); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); if (al.id_evento_reserva) await eliminarEventoCalendario('productora.mandalahouse@gmail.com', al.id_evento_reserva); } catch(e){} await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda suspendida", motivo_suspension: mtv, reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null }); document.getElementById('modal-suspender').close(); cargarVista(estadoActualVista); });

async function cargarSelectsAlumnos() { const sI = document.getElementById('instrumento'), sS = document.getElementById('tipo_suscripcion'); sI.innerHTML = ''; sS.innerHTML = '<option value="">Seleccione...</option>'; const iS = await getDocs(collection(db, "instrumentos")); iS.forEach(d => sI.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`); const sSp = await getDocs(collection(db, "tipos_suscripcion")); sSp.forEach(d => sS.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`); }

async function llenarFormularioAlumno(id) {
    document.getElementById('alumno-id').value = id; const d = (await getDoc(doc(db, "alumnos", id))).data(); document.getElementById('nombre').value = d.nombre; document.getElementById('celular').value = d.celular; document.getElementById('edad').value = d.edad||''; await cargarSelectsAlumnos();
    const sI = document.getElementById('instrumento'); Array.from(sI.options).forEach(o => o.selected = (d.instrumento||[]).includes(o.value)); document.getElementById('tipo_suscripcion').value = d.tipo_suscripcion; quill.root.innerHTML = d.descripcion||''; historialActual = d.historial || []; renderHistorial();
    const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00';
    diasSemana.forEach(dia => { const dD = d.disponibilidad[dia.id], tI = document.getElementById(`disp-${dia.id}-inicio`), tF = document.getElementById(`disp-${dia.id}-fin`), cA = document.getElementById(`disp-${dia.id}-all`), cN = document.getElementById(`disp-${dia.id}-none`), sE = document.getElementById(`estado-${dia.id}`); tI.disabled=false; tF.disabled=false; cA.checked=false; cN.checked=false; sE.textContent=""; if (!dD || dD.length===0) { cN.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Bloqueado"; sE.style.color="#dc3545"; } else if (dD[0].inicio===hApe && dD[0].fin===hCie) { cA.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Libre"; sE.style.color="#28a745"; } else { tI.value = dD[0].inicio; tF.value = dD[0].fin; } });
}

document.getElementById('form-alumno').addEventListener('submit', async (e) => {
    e.preventDefault(); const disp = {}, hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00';
    diasSemana.forEach(d => { const cA = document.getElementById(`disp-${d.id}-all`).checked, cN = document.getElementById(`disp-${d.id}-none`).checked; let i = document.getElementById(`disp-${d.id}-inicio`).value, f = document.getElementById(`disp-${d.id}-fin`).value; if(cN) disp[d.id] = []; else if(cA) disp[d.id] = [{inicio:hApe, fin:hCie}]; else { if(i||f) disp[d.id] = [{inicio: i||hApe, fin: f||hCie}]; else disp[d.id] = []; } });
    const selInst = document.getElementById('instrumento'), instV = Array.from(selInst.selectedOptions).map(o=>o.value), data = { nombre: document.getElementById('nombre').value, celular: document.getElementById('celular').value, edad: Number(document.getElementById('edad').value), instrumento: instV, tipo_suscripcion: document.getElementById('tipo_suscripcion').value, descripcion: quill.root.innerHTML, disponibilidad: disp, historial: historialActual };
    try { const id = document.getElementById('alumno-id').value; if (id) await updateDoc(doc(db, "alumnos", id), data); else { data.estado_agenda = "Pendiente procesar"; await addDoc(collection(db, "alumnos"), data); } const wrap = document.getElementById('form-alumno-wrapper'); wrap.style.display='none'; document.body.appendChild(wrap); document.getElementById('modal-alta-alumno').close(); cargarVista(estadoActualVista); } catch(e) { alert("Error al guardar."); }
});

function renderConfig(cont) {
    cont.innerHTML = `<div class="abm-container" style="max-width:800px; padding:30px;"><h3 style="margin-top:0; color:#212529; font-size:1.2em;">Límites y Reglas de Calendario</h3><div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"><div style="flex:1; min-width:150px;"><label style="display:block; font-weight:600; color:#495057;">Hora de Apertura:<br><input type="time" id="cfg-apertura" value="${configApp.hora_apertura||'09:00'}"></label></div><div style="flex:1; min-width:150px;"><label style="display:block; font-weight:600; color:#495057;">Hora de Cierre:<br><input type="time" id="cfg-cierre" value="${configApp.hora_cierre||'22:00'}"></label></div></div><div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"><div style="flex:1; min-width:150px;"><label style="display:block; font-weight:600; color:#495057;">Aulas totales:<br><input type="number" id="cfg-aulas" value="${configApp.cantidad_aulas}"></label></div><div style="flex:1; min-width:150px;"><label style="display:block; font-weight:600; color:#495057;">Baterías totales:<br><input type="number" id="cfg-bats" value="${configApp.cantidad_baterias}"></label></div><div style="flex:1; min-width:200px;"><label style="display:block; font-weight:600; color:#495057;">Tag Calendario (Batería):<br><input type="text" id="cfg-idbat" value="${configApp.identificador_bateria}"></label></div></div><h3 style="margin-top:0; color:#212529; font-size:1.2em; border-top:1px solid #dee2e6; padding-top:20px;">Mensajes y Textos</h3><label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Valor de Clase (Monto): <input type="text" id="cfg-valor" value="${configApp.valor_clase}"></label><label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Título Evento (Reserva): <input type="text" id="cfg-evt-res" value="${configApp.formato_evento_reserva}"></label><label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Título Evento (Confirmado): <input type="text" id="cfg-evt-conf" value="${configApp.formato_evento_confirmado}"></label><label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Texto Validación con Profe: <textarea id="cfg-txt-p" class="config-box" style="height:150px;">${configApp.texto_profe}</textarea></label><label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Texto Validación con Alumno: <textarea id="cfg-txt-a" class="config-box" style="height:150px;">${configApp.texto_alumno}</textarea></label><label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Texto Confirmación Agenda para Profe: <textarea id="cfg-txt-conf-p" class="config-box" style="height:150px;">${configApp.texto_conf_profe}</textarea></label><label style="display:block; margin-bottom:20px; font-weight:600; color:#495057;">Texto Confirmación Agenda para Alumno: <textarea id="cfg-txt-conf-a" class="config-box" style="height:200px;">${configApp.texto_conf_alumno}</textarea></label><button id="btn-guardar-cfg" class="btn-accion-main" style="padding:10px 20px; font-size:1.05em; width:100%;">Guardar Configuración</button></div>`;
    document.getElementById('btn-guardar-cfg').addEventListener('click', async () => {
        await setDoc(doc(db, "configuracion", "general"), { hora_apertura: document.getElementById('cfg-apertura').value, hora_cierre: document.getElementById('cfg-cierre').value, cantidad_aulas: document.getElementById('cfg-aulas').value, cantidad_baterias: document.getElementById('cfg-bats').value, identificador_bateria: document.getElementById('cfg-idbat').value, valor_clase: document.getElementById('cfg-valor').value, formato_evento_reserva: document.getElementById('cfg-evt-res').value, formato_evento_confirmado: document.getElementById('cfg-evt-conf').value, texto_profe: document.getElementById('cfg-txt-p').value, texto_alumno: document.getElementById('cfg-txt-a').value, texto_conf_profe: document.getElementById('cfg-txt-conf-p').value, texto_conf_alumno: document.getElementById('cfg-txt-conf-a').value }, { merge: true });
        await cargarConfig(); alert('Guardado.');
    });
}

function cargarABM(coleccion, titulo, cont) {
    window.tituloABMActual = titulo;
    getDocs(collection(db, coleccion)).then(qS => {
        let h = `<div class="abm-container" style="display:flex; gap:15px; align-items:flex-end; flex-wrap:wrap; padding:25px;"><div style="flex-grow:1; min-width:180px;"><label style="font-weight:600; font-size:0.9em; color:#495057;">Nombre</label><input type="text" id="input-nuevo-abm" placeholder="Ej: Guitarra"></div>`;
        if(coleccion === 'profesores') { h += `<div style="flex-grow:1; min-width:200px;"><label style="font-weight:600; font-size:0.9em; color:#495057;">Email Calendar</label><input type="email" id="input-correo-abm" placeholder="ejemplo@calendar..."></div><div style="flex-grow:1; min-width:150px;"><label style="font-weight:600; font-size:0.9em; color:#495057;">Celular (Para guardar)</label><input type="text" id="input-celular-abm" placeholder="Ej: 54911..."></div><div style="flex-grow:1; min-width:150px;"><label style="font-weight:600; font-size:0.9em; color:#495057;">Alias Transferencia</label><input type="text" id="input-alias-abm" placeholder="alias.mp"></div><div style="padding-bottom:10px;"><label style="white-space:nowrap; cursor:pointer; font-weight:600; color:#212529;"><input type="checkbox" id="input-entrevista-abm" checked> Entrevistas</label></div>`; }
        h += `<button id="btn-guardar-abm" class="btn-accion-main" style="height:40px; min-width:120px;">+ Agregar</button></div>`;
        
        qS.forEach(d => {
            const dt = d.data(); let ex = coleccion==='profesores' ? ` <br><small style="color:#6c757d;">${dt.correo_calendario}</small> <span class="badge ${dt.entrevista?'badge-success':'badge-danger'}" style="margin-left:10px;">${dt.entrevista?'SÍ':'NO'} Entrevistas</span>` : '';
            h += `<div class="abm-item" onclick="window.abrirEdicionABM('${d.id}', '${coleccion}', '${dt.nombre}', '${dt.correo_calendario||''}', '${dt.celular||''}', '${dt.alias_transferencia||''}', ${!!dt.entrevista})"><span style="font-weight:600; color:#212529; font-size:1.05em;">${dt.nombre}${ex}</span><button class="btn-suspender" onclick="event.stopPropagation(); window.eliminarABM('${d.id}', '${coleccion}')" style="padding:6px 10px; border:none; font-size:1.2em;" title="Eliminar">❌</button></div>`;
        });
        cont.innerHTML = h;

        document.getElementById('btn-guardar-abm').addEventListener('click', async () => {
            const n = document.getElementById('input-nuevo-abm').value.trim(); if(!n) return;
            const dO = { nombre: n };
            if(coleccion==='profesores'){ 
                dO.correo_calendario=document.getElementById('input-correo-abm').value.trim(); dO.celular=document.getElementById('input-celular-abm').value.trim(); dO.alias_transferencia=document.getElementById('input-alias-abm').value.trim(); dO.entrevista=document.getElementById('input-entrevista-abm').checked; 
                const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00', dispAllDay = [ { inicio: hApe, fin: hCie } ];
                dO.disponibilidad = { 'L': dispAllDay, 'M': dispAllDay, 'X': dispAllDay, 'J': dispAllDay, 'V': dispAllDay, 'S': dispAllDay };
            }
            await addDoc(collection(db, coleccion), dO); cargarABM(coleccion, titulo, cont);
        });
    });
}

window.abrirEdicionABM = async function(id, col, nom, cor, cel, ali, ent) {
    document.getElementById('abm-edit-id').value = id; document.getElementById('abm-edit-coleccion').value = col; document.getElementById('abm-edit-nombre').value = nom;
    if(col==='profesores') { 
        document.getElementById('div-abm-edit-profe').style.display='block'; document.getElementById('abm-edit-correo').value=cor; document.getElementById('abm-edit-celular').value=cel; document.getElementById('abm-edit-alias').value=ali; document.getElementById('abm-edit-entrevista').checked=ent; 
        try {
            const pr = (await getDoc(doc(db, col, id))).data(); const hApe = configApp.hora_apertura || '09:00'; const hCie = configApp.hora_cierre || '22:00';
            diasSemana.forEach(dia => {
                const dD = pr.disponibilidad ? pr.disponibilidad[dia.id] : []; const tI = document.getElementById(`disp-p-${dia.id}-inicio`), tF = document.getElementById(`disp-p-${dia.id}-fin`), cA = document.getElementById(`disp-p-${dia.id}-all`), cN = document.getElementById(`disp-p-${dia.id}-none`), sE = document.getElementById(`estado-p-${dia.id}`);
                tI.disabled=false; tF.disabled=false; cA.checked=false; cN.checked=false; sE.textContent="";
                if (!dD || dD.length===0) { cN.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Bloqueado"; sE.style.color="#dc3545"; }
                else if (dD[0].inicio===hApe && dD[0].fin===hCie) { cA.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Libre"; sE.style.color="#28a745"; } else { tI.value = dD[0].inicio; tF.value = dD[0].fin; }
            });
        } catch(e) {}
    } else document.getElementById('div-abm-edit-profe').style.display='none';
    document.getElementById('modal-abm-edit').showModal();
}

window.eliminarABM = async function(id, col) { if(confirm("¿Eliminar?")) { await deleteDoc(doc(db, col, id)); document.querySelector(`[data-vista="ABM-${window.tituloABMActual}"]`).click(); } }

document.getElementById('btn-guardar-abm-edit').addEventListener('click', async () => {
    const id = document.getElementById('abm-edit-id').value, col = document.getElementById('abm-edit-coleccion').value, dO = { nombre: document.getElementById('abm-edit-nombre').value };
    if(col==='profesores') { 
        dO.correo_calendario=document.getElementById('abm-edit-correo').value; dO.celular=document.getElementById('abm-edit-celular').value; dO.alias_transferencia=document.getElementById('abm-edit-alias').value; dO.entrevista=document.getElementById('abm-edit-entrevista').checked; 
        const disp = {}; const hApe = configApp.hora_apertura || '09:00'; const hCie = configApp.hora_cierre || '22:00';
        diasSemana.forEach(d => { const cA = document.getElementById(`disp-p-${d.id}-all`).checked, cN = document.getElementById(`disp-p-${d.id}-none`).checked; let i = document.getElementById(`disp-p-${d.id}-inicio`).value, f = document.getElementById(`disp-p-${d.id}-fin`).value; if(cN) disp[d.id] = []; else if(cA) disp[d.id] = [{inicio:hApe, fin:hCie}]; else { if(i||f) disp[d.id] = [{inicio: i||hApe, fin: f||hCie}]; else disp[d.id] = []; } });
        dO.disponibilidad = disp;
    }
    await updateDoc(doc(db, col, id), dO); document.getElementById('modal-abm-edit').close(); document.querySelector(`[data-vista="ABM-${window.tituloABMActual}"]`).click();
});
