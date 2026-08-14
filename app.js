import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, updateDoc, deleteDoc, doc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// === VERSIONADO DE LA APLICACIÓN ===
const APP_VERSION = "v1.2";

// === ATENCIÓN: URL DEL SCRIPT DE GOOGLE ===
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzbDuDGOab4azS27_7Mt9KYixAHNgeygMgCOZHTL1I3Poba5yLceWM56qJd59hPx6g/exec";
// ====================================================

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

// BLOQUEO ANTI-DOBLE-CLIC (UX Móvil)
function setBotonCargando(btn, cargando) {
    if (!btn) return;
    if (cargando) {
        btn.dataset.textoOriginal = btn.innerHTML;
        btn.innerHTML = '⏳ Procesando...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.style.cursor = 'wait';
    } else {
        btn.innerHTML = btn.dataset.textoOriginal || 'Guardar';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

// CONVERTIR SELECTS A CHIPS (UX Móvil)
function syncSelectToChips(selectId, containerId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.style.display = 'none'; 
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.gap = '8px';
        container.style.marginTop = '8px';
        select.parentNode.insertBefore(container, select.nextSibling);
    }
    container.innerHTML = '';
    Array.from(select.options).forEach(opt => {
        if(opt.value === "") return;
        const chip = document.createElement('div');
        chip.textContent = opt.text;
        chip.style.padding = '8px 14px';
        chip.style.border = '1px solid #ced4da';
        chip.style.borderRadius = '20px';
        chip.style.cursor = 'pointer';
        chip.style.fontSize = '0.85em';
        chip.style.fontWeight = '500';
        chip.style.transition = 'all 0.2s ease';
        chip.style.userSelect = 'none';
        
        const updateChipStyle = () => {
            if(opt.selected) {
                chip.style.background = '#007bff';
                chip.style.color = 'white';
                chip.style.borderColor = '#007bff';
            } else {
                chip.style.background = '#f8f9fa';
                chip.style.color = '#495057';
                chip.style.borderColor = '#ced4da';
            }
        };
        
        updateChipStyle();
        
        chip.addEventListener('click', () => {
            opt.selected = !opt.selected;
            updateChipStyle();
            select.dispatchEvent(new Event('change'));
        });
        container.appendChild(chip);
    });
}

// LOGIN
async function conectarGoogle() { 
    try { 
        await signInWithPopup(auth, provider); 
    } catch (err) { 
        console.error("Error en login:", err); 
        alert("Error al intentar iniciar sesión."); 
    } 
}

window.alert = function(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return console.log(msg); 
    const toast = document.createElement('div');
    toast.className = 'toast-notification'; toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.style.opacity = '1', 10);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 5000);
};

let alumnoIdActual = null;
let estadoActualVista = 'Resumen';
window.tituloABMActual = '';
let configApp = {};
let chartAdmGestionesInst = null, chartAdmGlobalInst = null, chartAltasGlobalInst = null;
let clipboardDisponibilidad = null; 
let clipboardDisponibilidadProfe = null; 
let historialActual = []; 

let nodoAdmActivo = 'Pendiente procesar';
let nodoAltasActivo = 'Pre-alta Pendiente';
const configNodosAdm = [
    { id: 'Pendiente procesar', label: 'Sin Agendar', icon: '⏳', color: 'node-sin-agendar' },
    { id: 'Pendiente validación por profe', label: 'Validando Profe', icon: '👨‍🏫', color: 'node-val-profe' },
    { id: 'Pendiente validación por alumno', label: 'Validando Alum', icon: '🧑‍🎓', color: 'node-val-alum' },
    { id: 'Agenda confirmada', label: 'Confirmada', icon: '✅', color: 'node-adm-conf' }
];
const configNodosAltas = [
    { id: 'Pre-alta Pendiente', label: 'Pendiente', icon: '📝', color: 'node-prealta-pdte' },
    { id: 'Pre-alta Iniciada', label: 'Iniciada', icon: '🚀', color: 'node-prealta-inic' },
    { id: 'Altas Incompletas', label: 'Incompleta', icon: '⚠️', color: 'node-prealta-inc',
      filterFn: (d) => (d.estado_agenda === 'Alta Efectiva' || d.estado_agenda === 'Alta Ilegal') && (!d.checklist_alta || d.checklist_alta.includes(false))
    }
];

if (!document.getElementById('modal-nota-rapida')) {
    const dlg = document.createElement('dialog'); dlg.id = 'modal-nota-rapida';
    dlg.innerHTML = `<h3 style="margin-top:0; color:#212529; font-size:1.2em;">Agregar Nota</h3><input type="hidden" id="nota-rapida-id"><textarea id="nota-rapida-texto" rows="3" style="width:100%; border:1px solid #ced4da; border-radius:6px; padding:10px; box-sizing:border-box; margin-bottom:15px; font-family:inherit;" placeholder="Escribe el registro de contacto..."></textarea><div style="display:flex; gap:10px; justify-content:flex-end;"><button type="button" class="btn-cerrar-modal" data-modal="modal-nota-rapida" style="padding:8px 16px; border:none; border-radius:6px; cursor:pointer; background:#e9ecef; font-weight:600; color:#495057;">Cancelar</button><button id="btn-guardar-nota-rapida" style="padding:8px 16px; background:#007bff; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Guardar</button></div>`;
    document.body.appendChild(dlg);
}

const quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
const diasSemana = [{ id:'L',nombre:'Lunes'}, {id:'M',nombre:'Martes'}, {id:'X',nombre:'Miércoles'}, {id:'J',nombre:'Jueves'}, {id:'V',nombre:'Viernes'}, {id:'S',nombre:'Sábado'}];
const contDisp = document.getElementById('contenedor-disponibilidad'), contDispProfe = document.getElementById('contenedor-disponibilidad-profe');

diasSemana.forEach(dia => {
    contDisp.innerHTML += `<div class="dia-disponibilidad"><label>${dia.nombre}:</label><input type="time" id="disp-${dia.id}-inicio"> <span>a</span> <input type="time" id="disp-${dia.id}-fin"><label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer;"><input type="checkbox" id="disp-${dia.id}-all"> Todo el día</label><label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer;"><input type="checkbox" id="disp-${dia.id}-none"> No disp.</label><button type="button" class="btn-copy-disp" data-dia="${dia.id}" style="background:none; border:none; cursor:pointer; font-size:1.1em; margin-left:auto;">📋</button><button type="button" class="btn-paste-disp" data-dia="${dia.id}" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📥</button><span id="estado-${dia.id}" class="estado-disp" style="width:80px; text-align:right;"></span></div>`;
    contDispProfe.innerHTML += `<div class="dia-disponibilidad"><label>${dia.nombre}:</label><input type="time" id="disp-p-${dia.id}-inicio"> <span>a</span> <input type="time" id="disp-p-${dia.id}-fin"><label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer;"><input type="checkbox" id="disp-p-${dia.id}-all"> Todo el día</label><label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer;"><input type="checkbox" id="disp-p-${dia.id}-none"> No disp.</label><button type="button" class="btn-copy-disp-p" data-dia="${dia.id}" style="background:none; border:none; cursor:pointer; font-size:1.1em; margin-left:auto;">📋</button><button type="button" class="btn-paste-disp-p" data-dia="${dia.id}" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📥</button><span id="estado-p-${dia.id}" class="estado-disp" style="width:80px; text-align:right;"></span></div>`;
});

window.updateDispStateForDay = function(dId, isProfe = false) {
    const prefix = isProfe ? 'disp-p-' : 'disp-', estadoPrefix = isProfe ? 'estado-p-' : 'estado-';
    const chkAll = document.getElementById(`${prefix}${dId}-all`), chkNone = document.getElementById(`${prefix}${dId}-none`);
    const tIni = document.getElementById(`${prefix}${dId}-inicio`), tFin = document.getElementById(`${prefix}${dId}-fin`), spanE = document.getElementById(`${estadoPrefix}${dId}`);
    if (chkAll.checked) { chkNone.checked = false; tIni.disabled = tFin.disabled = true; tIni.value = tFin.value = ''; spanE.textContent = "Libre"; spanE.style.color = "#28a745"; } 
    else if (chkNone.checked) { chkAll.checked = false; tIni.disabled = tFin.disabled = true; tIni.value = tFin.value = ''; spanE.textContent = "Bloqueado"; spanE.style.color = "#dc3545"; } 
    else { tIni.disabled = tFin.disabled = false; spanE.textContent = ""; }
}

diasSemana.forEach(dia => {
    document.getElementById(`disp-${dia.id}-all`).addEventListener('change', () => window.updateDispStateForDay(dia.id, false));
    document.getElementById(`disp-${dia.id}-none`).addEventListener('change', () => window.updateDispStateForDay(dia.id, false));
    document.getElementById(`disp-p-${dia.id}-all`).addEventListener('change', () => window.updateDispStateForDay(dia.id, true));
    document.getElementById(`disp-p-${dia.id}-none`).addEventListener('change', () => window.updateDispStateForDay(dia.id, true));
});

// NAVEGACIÓN PESTAÑAS (MÓVIL UX)
document.addEventListener('click', (e) => {
    if(e.target.classList.contains('tab-btn')) {
        e.preventDefault();
        const modal = e.target.closest('dialog');
        modal.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
            b.style.borderBottom = 'none';
            b.style.color = '#6c757d';
        });
        e.target.classList.add('active');
        e.target.style.borderBottom = '2px solid #007bff';
        e.target.style.color = '#007bff';
        
        modal.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        const targetId = e.target.getAttribute('data-target');
        if(document.getElementById(targetId)) document.getElementById(targetId).style.display = 'block';
    }
});

function renderHistorial() {
    const container = document.getElementById('lista-historial'); container.innerHTML = '';
    if(historialActual.length === 0) { container.innerHTML = '<p style="color:#6c757d; font-size:0.9em; margin:0;">No hay registros en el historial.</p>'; return; }
    const sorted = [...historialActual].sort((a,b) => b.id - a.id);
    sorted.forEach(nota => {
        const textoLimpio = nota.texto.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
        container.innerHTML += `<div style="background:#f8f9fa; border:1px solid #dee2e6; padding:12px; border-radius:6px; position:relative;"><div style="font-size:0.8em; color:#6c757d; margin-bottom:5px; font-weight:600;">🕒 ${nota.fecha}</div><div style="font-size:0.95em; color:#212529;">${textoLimpio}</div><div style="position:absolute; top:10px; right:10px; display:flex; gap:5px;"><button type="button" class="btn-editar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.1em;">✏️</button><button type="button" class="btn-eliminar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.1em;">❌</button></div></div>`;
    });
}

const defaultCfg = { hora_apertura: '09:00', hora_cierre: '22:00', calendario_por_defecto: 'productora.mandalahouse@gmail.com', identificador_bateria: '🥁', emoji_guitarra: '🎸', emoji_cajon: '📦', emoji_canto: '🎤', emoji_piano: '🎹', emoji_bajo: '🎸', valor_clase: '$10.000', cantidad_aulas: '3', cantidad_baterias: '2', texto_nombre_agendar: 'MDL {nombre} {edad} {año_actual} @{instrumento} @{suscripcion}', formato_evento_reserva: '❓📋 {emojiinstrumento} {alumno} {edad}', formato_evento_confirmado: '✅📋 {emojiinstrumento} {alumno} {edad}', texto_profe: "*⚠ PRE CHECK - ENTREVISTA*\n📅 *FECHA: {fecha_hora}*\n*👥 ALUMNO:*\n🔹 {nombre} ({edad})\n🔹 {instrumento} | {suscripcion}\n*INFO:*\n{descripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", texto_opciones_multiples: "*⚠ PRE CHECK - ENTREVISTA*\n*🎈 CONFIRMAR ASISTENCIA*\n\n📅 OPCIONES DE FECHA:\n{opciones}\n\n*Por favor confirmar asistencia y agendar en tu calendario. En cuanto reciba el OK y pago del alumno, te aviso con la confirmación definitiva.*\n\n*📰 INFO PARA LA ENTREVISTA:*\n{descripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", texto_alumno: "📅 *Agenda de clase*\n🧩 {fecha_hora} con Profe {profe}\n✅ Inscripción: forms.gle/xxx\n💸 Valor: {valor}\n🧩 Alias: {alias_profe}", texto_conf_alumno: "Genial Gracias!\nTe esperamos!\n\n🧩 Día y horario: {fecha_hora}\n🧩 Profe: {profe}\n📍 *Dirección:* Av. Cabildo 2970\n\nEl profe te va a estar escribiendo el mismo día!", texto_conf_profe: "*✅ ENTREVISTA CONFIRMADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*👥 DATOS DEL ALUMNO:*\n🔹 Nombre: {nombre}\n🔹 Edad: {edad}\n🔹 Instrumento: {instrumento}\n🔹 Clase: {suscripcion}\n\n*📰 INFO PARA LA ENTREVISTA:*\n{descripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", texto_cancela_alumno: "*❗ PRE CHECK - ENTREVISTA*\n*❌ RESERVA CANCELADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*👥 DATOS DEL ALUMNO:*\n🔹 Nombre: {nombre}\n🔹 Edad: {edad}\n🔹 Instrumento: {instrumento}\n🔹 Clase: {suscripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", texto_prealta: "*⚠ PRE ALTA INICIADA*\n\n*👥 DATOS DE LA SUSCRIPCIÓN:*\n🔹 Suscripción: {suscripcion}\n🔹 Nombre de alumno: {nombre}\n🔹 Instrumento: {instrumento}\n🔹 Grupo: {grupo}\n🔹 Profesor: {profe}\n🔹 Inicio de clases: {fecha inicio clases}", texto_alta_confirmada: "*✅ NUEVA ALTA CONFIRMADA*\n\n*👥 DATOS DE LA SUSCRIPCIÓN:*\n🔹 Suscripción: {suscripcion}\n🔹 Nombre de alumno: {nombre}\n🔹 Instrumento: {instrumento}\n🔹 Grupo: {grupo}\n🔹 Profesor: {profe}\n🔹 Inicio de clases: {fecha inicio clases}" };
async function cargarConfig() { const docSnap = await getDoc(doc(db, "configuracion", "general")); configApp = docSnap.exists() ? { ...defaultCfg, ...docSnap.data() } : defaultCfg; }

function reemplazarVariables(texto, datos) { let res = texto; for (const [key, value] of Object.entries(datos)) { res = res.replaceAll(`{${key}}`, value || ''); } res = res.replace(/\{[a-zA-Z0-9_ ]+\}/g, ''); return res; }
function formatoLocalISO(date) { const tzo = -date.getTimezoneOffset(), dif = tzo >= 0 ? '+' : '-', pad = num => (num < 10 ? '0' : '') + num; return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + dif + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60); }
function formatearFechaAmi(fechaIsoStr) { const d = new Date(fechaIsoStr), dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; let min = d.getMinutes(), minStr = min === 0 ? 'hs' : `:${min < 10 ? '0'+min : min}hs`; return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth()+1} ${d.getHours()}${minStr}`; }

function construirTitulosEvento(al, tipo, cfg) {
    let template = tipo === 'reserva' ? cfg.formato_evento_reserva : cfg.formato_evento_confirmado;
    if (template === '? {profe} Ent {alumno}') template = '❓📋 {emojiinstrumento} {alumno} {edad}';
    if (template === '📋🎸{instrumento} - {alumno} {edad}') template = '✅📋 {emojiinstrumento} {alumno} {edad}';

    let emojis = []; const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento];
    insts.forEach(i => { let instL = (i || '').toLowerCase(); if (instL.includes('bater')) emojis.push(cfg.identificador_bateria || '🥁'); else if (instL.includes('guitarra')) emojis.push(cfg.emoji_guitarra || '🎸'); else if (instL.includes('cajón') || instL.includes('cajon')) emojis.push(cfg.emoji_cajon || '📦'); else if (instL.includes('canto') || instL.includes('voz')) emojis.push(cfg.emoji_canto || '🎤'); else if (instL.includes('piano') || instL.includes('teclado')) emojis.push(cfg.emoji_piano || '🎹'); else if (instL.includes('bajo')) emojis.push(cfg.emoji_bajo || '🎸'); });
    let strEmojis = [...new Set(emojis.filter(e => e))].join(''); 

    let tituloProfe = reemplazarVariables(template, { alumno: al.nombre, edad: al.edad || '', emojiinstrumento: strEmojis, instrumento: insts.join(', ') }).replace(/\s+/g, ' ').trim();
    let profeStr = al.reserva_profe_nombre ? ` (${al.reserva_profe_nombre})` : '';
    let strEmojisConProfe = strEmojis ? `${strEmojis}${profeStr}` : profeStr.trim();
    let tituloDefecto = reemplazarVariables(template, { alumno: al.nombre, edad: al.edad || '', emojiinstrumento: strEmojisConProfe, instrumento: insts.join(', ') }).replace(/\s+/g, ' ').trim();
    return { tituloProfe, tituloDefecto };
}

function interpretarFechaCSV(texto) {
    if (!texto) return null; const regex = /(\d{1,2})\/(\d{1,2})(?:[^\d]*?(\d{1,2})(?:[:\.](\d{2}))?(?:\s*hs)?)?/i; const match = texto.match(regex);
    if (match) { const dia = parseInt(match[1]), mes = parseInt(match[2]) - 1, hora = match[3] ? parseInt(match[3]) : 0, min = match[4] ? parseInt(match[4]) : 0; if (dia > 31 || mes > 11 || hora > 23 || min > 59) return null; return formatoLocalISO(new Date(new Date().getFullYear(), mes, dia, hora, min)); } return null;
}

// PUENTE APPS SCRIPT
async function fetchCalendarAPI(action, payload) {
    payload.action = action;
    payload.apiKey = "mandala-seg-2026";
    let res;
    try {
        res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    } catch (networkError) {
        throw new Error("Falla de red al conectar con Google Apps Script. Revise su conexión.");
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error); 
    return action === 'getEvents' ? data : (action === 'createEvent' ? {id: data.id} : true);
}

async function getEventosCalendario(calendarId, timeMin, timeMax) { return await fetchCalendarAPI('getEvents', { calendarId, timeMin, timeMax }); }
async function crearEventoCalendario(calendarId, titulo, inicioStr, finStr) { return await fetchCalendarAPI('createEvent', { calendarId, summary: titulo, start: { dateTime: inicioStr }, end: { dateTime: finStr } }); }
async function actualizarEventoCalendario(calendarId, eventId, titulo, descripcion) { return await fetchCalendarAPI('updateEvent', { calendarId, eventId, summary: titulo, description: descripcion }); }
async function eliminarEventoCalendario(calendarId, eventId) { return await fetchCalendarAPI('deleteEvent', { calendarId, eventId }); }

async function getCalendarIdParaAlumno(al) {
    if (al.reserva_cal_id) return al.reserva_cal_id;
    if (al.reserva_profe_id) { const pDoc = await getDoc(doc(db, "profesores", al.reserva_profe_id)); if (pDoc.exists() && pDoc.data().correo_calendario) return pDoc.data().correo_calendario; }
    if (al.reserva_profe_nombre) { const pQ = await getDocs(query(collection(db, "profesores"), where("nombre", "==", al.reserva_profe_nombre))); if (!pQ.empty && pQ.docs[0].data().correo_calendario) return pQ.docs[0].data().correo_calendario; }
    return null;
}

// FUNCIONES SEGURAS DE CALENDAR
async function crearEventoSeguro(al, titulos, inicio, fin) {
    let fallbackCalId = configApp.calendario_por_defecto, primaryCalId = await getCalendarIdParaAlumno(al);
    let errorDetalle = "";

    if (primaryCalId) {
        try { 
            let tituloUsar = (primaryCalId === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe; 
            let ev = await crearEventoCalendario(primaryCalId, tituloUsar, inicio, fin); 
            return { id: ev.id, calendar: primaryCalId }; 
        } catch(e) { errorDetalle += `Fallo primario (${primaryCalId}): ${e.message}. `; } 
    }
    
    if (fallbackCalId && fallbackCalId !== primaryCalId) { 
        try { 
            let ev = await crearEventoCalendario(fallbackCalId, titulos.tituloDefecto, inicio, fin); 
            return { id: ev.id, calendar: fallbackCalId }; 
        } catch(e) { errorDetalle += `Fallo fallback (${fallbackCalId}): ${e.message}.`; } 
    }

    throw new Error("No se pudo crear el evento en el calendario.\n" + errorDetalle);
}

async function actualizarEventoSeguro(al, titulos, desc) {
    if (!al.id_evento_reserva) throw new Error("El alumno no tiene un evento en calendario para actualizar.");
    let calGrabado = al.calendario_evento_reserva, primaryCalId = await getCalendarIdParaAlumno(al), fallbackCalId = configApp.calendario_por_defecto, candidatos = [];
    if (calGrabado) candidatos.push(calGrabado); if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId); if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);
    
    let lastError = "";
    for (let cal of candidatos) { 
        try { 
            let tituloUsar = (cal === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe; 
            await actualizarEventoCalendario(cal, al.id_evento_reserva, tituloUsar, desc); 
            return cal; 
        } catch(e) { lastError = e.message; } 
    }
    throw new Error("Google Calendar rechazó la actualización.\nDetalle: " + lastError);
}

async function eliminarEventoSeguro(al) {
    if (!al.id_evento_reserva) return;
    let calGrabado = al.calendario_evento_reserva, primaryCalId = await getCalendarIdParaAlumno(al), fallbackCalId = configApp.calendario_por_defecto, candidatos = [];
    if (calGrabado) candidatos.push(calGrabado); if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId); if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);
    
    let lastError = "";
    for (let cal of candidatos) { 
        try { 
            await eliminarEventoCalendario(cal, al.id_evento_reserva); 
            return; 
        } catch(e) { lastError = e.message; } 
    }
    throw new Error("Google Calendar rechazó la cancelación.\nDetalle: " + lastError);
}

function chequearDisponibilidadExacta(inicioTestMs, finTestMs, eventosAPI, cantAulas, cantBat, esBateria, cfgEmoji) {
    let picosAulas = 0; let picosBateria = 0; let profesOcupados = new Set();
    const eventosCruzados = eventosAPI.filter(ev => { 
        if (!ev.start || !ev.start.dateTime) return false; 
        const evS = new Date(ev.start.dateTime).getTime() + 60000;
        const evE = new Date(ev.end.dateTime).getTime() - 60000;
        return (inicioTestMs < evE && finTestMs > evS); 
    });
    if (eventosCruzados.length === 0) return { valido: true, profesOcupados: new Set() };
    const puntosDeTiempo = new Set([inicioTestMs, finTestMs]);
    eventosCruzados.forEach(ev => { 
        const i = new Date(ev.start.dateTime).getTime(), f = new Date(ev.end.dateTime).getTime(); 
        if (i > inicioTestMs && i < finTestMs) puntosDeTiempo.add(i); if (f > inicioTestMs && f < finTestMs) puntosDeTiempo.add(f); 
    });
    const arrayPuntos = Array.from(puntosDeTiempo).sort((a,b) => a-b);
    for (let i = 0; i < arrayPuntos.length - 1; i++) {
        const puntoMedioMs = arrayPuntos[i] + 1000; let simultaneosAulas = 0; let simultaneosBat = 0;
        eventosCruzados.forEach(ev => {
            const evS = new Date(ev.start.dateTime).getTime(), evE = new Date(ev.end.dateTime).getTime();
            if (puntoMedioMs >= evS && puntoMedioMs < evE) {
                simultaneosAulas++; profesOcupados.add(ev.profeId);
                if (ev.summary && ev.summary.toLowerCase().includes((cfgEmoji||'').toLowerCase())) simultaneosBat++;
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
    let endH = new Date(finMs).getHours(), endM = new Date(finMs).getMinutes(); 
    if (endH === 0 && endM === 0) endH = 24;
    const slotEndMins = endH * 60 + endM; let disponible = false;
    pr.disponibilidad[lDia].forEach(rango => {
        const pStartMins = parseInt(rango.inicio.split(':')[0])*60 + parseInt(rango.inicio.split(':')[1]), pEndMins = parseInt(rango.fin.split(':')[0])*60 + parseInt(rango.fin.split(':')[1]);
        if (slotStartMins >= pStartMins && slotEndMins <= pEndMins) { disponible = true; }
    });
    return disponible;
}

function generarOpcionesAgenda(dispAl, eventosAPI, esBateria, todosLosProfes, profesFiltradosIDs, dStart, dEnd, cfg) {
    const opciones = [], mapaDias = { 0:"D", 1:"L", 2:"M", 3:"X", 4:"J", 5:"V", 6:"S" };
    const durMs = 60*60*1000, slotPasoMs = 30*60*1000; 
    const cantAulas = parseInt(cfg.cantidad_aulas)||3, cantBat = parseInt(cfg.cantidad_baterias)||2;
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
                                    let pegado = false;
                                    const profeEvents = eventosAPI.filter(e => e.profeId === pr.id);
                                    profeEvents.forEach(ev => {
                                        if(!ev.start || !ev.start.dateTime) return;
                                        const evS = new Date(ev.start.dateTime).getTime(), evE = new Date(ev.end.dateTime).getTime();
                                        if (Math.abs(evE - inMs) <= 60000 || Math.abs(evS - finMs) <= 60000) pegado = true;
                                    });
                                    opciones.push({ fechaTextoAmi: formatearFechaAmi(hIniB.toISOString()), profeId: pr.id, profeNombre: pr.nombre, calId: pr.calId, inicioData: formatoLocalISO(hIniB), finData: formatoLocalISO(new Date(finMs)), pegado: pegado });
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

function generarTarjetaAlumno(al, id, vista) {
    const instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento;
    let tags = '', accionesHtml = '', extraClass = '', contenidoExtra = '';

    let fechaCalculo = null;
    if ((al.estado_agenda === 'Pendiente validación por profe' || al.estado_agenda === 'Pendiente validación por alumno' || al.estado_agenda === 'Agenda confirmada') && al.reserva_inicio) {
        fechaCalculo = new Date(al.reserva_inicio);
    } else if (al.estado_agenda === 'Pre-alta Iniciada' && al.fecha_inicio_clases) {
        fechaCalculo = new Date(al.fecha_inicio_clases);
    }

    if (fechaCalculo) {
        let diffHs = (fechaCalculo - new Date()) / (1000 * 60 * 60);
        if (diffHs < 0) { extraClass = 'urgencia-vencida'; tags += `<div class="badge-urgencia text-vencido">⚠️ Vencida (Pasó la fecha)</div>`; } 
        else if (diffHs <= 48) { extraClass = 'urgencia-roja'; tags += `<div class="badge-urgencia text-rojo">🔴 Crítico: Faltan ${Math.floor(diffHs)}hs</div>`; } 
        else if (diffHs <= 72) { extraClass = 'urgencia-amarilla'; tags += `<div class="badge-urgencia text-amarillo">🟡 Alerta: Faltan ${Math.floor(diffHs)}hs</div>`; } 
        else { extraClass = 'urgencia-verde'; tags += `<div class="badge-urgencia text-verde">🟢 A tiempo: Faltan ${Math.floor(diffHs/24)} días</div>`; }
    }

    if (al.estado_agenda === 'Agenda confirmada') extraClass = 'item-confirmada';

    let altaInfoHtml = '';
    if (al.estado_agenda.includes('alta') || al.estado_agenda.includes('Alta') || al.estado_agenda === 'Lista de espera') {
        let pName = al.reserva_profe_nombre || '-';
        let gName = al.grupo_asignado || '-';
        let fIni = al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : '-';
        if (pName !== '-' || gName !== '-' || fIni !== '-') {
            altaInfoHtml = `<div style="background:#e3f2fd; border:1px solid #b8daff; border-radius:6px; padding:8px; margin-top:8px; font-size:0.85em; color:#004085; line-height:1.4;">
                <strong>👨‍🏫 Profe:</strong> ${pName}<br>
                <strong>👥 Grupo:</strong> ${gName}<br>
                <strong>📅 Inicio:</strong> ${fIni}
            </div>`;
        }
    }

    const chkLabels = [
        "¿Se enviaron los mensajes de bienvenida al alumnos?",
        "¿Se informó al profe de la nueva alta?",
        "¿Se actualizó la base de datos con la nueva alta?",
        "¿Se cargó el pago en el sistema de contabilidad?",
        "¿Se agregó al alumno al grupo de la comunidad Mandala Ensambles?"
    ];

    if (al.estado_agenda === 'Pendiente procesar') {
        accionesHtml += `<button class="dropdown-item btn-buscar-agenda" data-id="${id}">🔍 Buscar Agenda</button>`; 
        accionesHtml += `<button class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`; 
    } 
    else if (al.estado_agenda === 'Pendiente validación por profe') {
        let opcionesList = '';
        if (al.opciones_propuestas && al.opciones_propuestas.length > 1) {
            opcionesList = `<div style="background:#fff3cd; border:1px solid #ffeeba; border-radius:4px; padding:6px; margin-bottom:8px; font-size:0.8em; color:#856404; line-height:1.4;">
                <strong>Opciones enviadas:</strong><br>
                ${al.opciones_propuestas.map(o => `• ${o.fechaTexto}`).join('<br>')}
            </div>`;
        }
        tags += `<div class="badge badge-warning" style="margin-bottom:8px;">⏳ ${al.reserva_fecha_texto||'Varias opciones'} (${al.reserva_profe_nombre})</div>${opcionesList}`;
        accionesHtml += `<button class="dropdown-item btn-validado-profe-popup" data-id="${id}">✅ Validado por Profesor</button>`;
        accionesHtml += `<button class="dropdown-item btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
        accionesHtml += `<button class="dropdown-item btn-reenviar-profe" data-id="${id}">📤 Re-enviar a Profe</button>`;
        accionesHtml += `<button class="dropdown-item btn-cancelar-reserva" data-id="${id}">❌ Cancelar Validación</button>`;
        accionesHtml += `<button class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`; 
    } 
    else if (al.estado_agenda === 'Pendiente validación por alumno') {
        tags += `<div class="badge badge-warning" style="margin-bottom:8px;">🔒 Bloqueado: ${al.reserva_fecha_texto} (${al.reserva_profe_nombre})</div>`;
        accionesHtml += `<button class="dropdown-item btn-confirmar-entrevista" data-id="${id}">✅ Confirmar Agenda</button>`;
        accionesHtml += `<button class="dropdown-item btn-reenviar-alumno" data-id="${id}">📤 Re-Enviar a Alumno</button>`;
        accionesHtml += `<button class="dropdown-item btn-cancelar-reserva" data-id="${id}">❌ Cancelar Agenda</button>`;
        accionesHtml += `<button class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`; 
    }
    else if (al.estado_agenda === 'Agenda confirmada') {
        tags += `<div class="badge badge-success" style="margin-bottom:8px;">✅ Confirmado: ${al.reserva_fecha_texto||'-'}</div>`;
        accionesHtml += `<button class="dropdown-item btn-admision-finalizada" data-id="${id}">🏁 Admisión Finalizada</button>`;
        accionesHtml += `<button class="dropdown-item btn-enviar-conf-profe" data-id="${id}">📤 Re-Enviar conf. a Profe</button>`;
        accionesHtml += `<button class="dropdown-item btn-enviar-conf-alumno" data-id="${id}">📤 Re-Enviar conf. a Alumno</button>`;
        accionesHtml += `<button class="dropdown-item btn-cancelar-reserva" data-id="${id}">↩️ Cancelar Confirmación</button>`;
    }
    else if (al.estado_agenda === 'Agenda suspendida') {
        extraClass = 'item-suspendida'; tags += `<div class="badge badge-danger" style="margin-bottom:8px;">Motivo: ${al.motivo_suspension||'S/D'}</div>`;
        accionesHtml += `<button class="dropdown-item btn-recuperar-agenda" data-id="${id}">♻️ Recuperar Agenda</button>`;
    }
    else if (al.estado_agenda === 'Lista de espera') {
        tags += `<div class="badge badge-warning" style="margin-bottom:8px;">🛋️ En Espera</div>`;
        contenidoExtra = `<button class="btn-accion-main btn-iniciar-alta" data-id="${id}" style="width:100%; margin-top:10px; background:#28a745;">▶ Iniciar Alta</button>`;
    }
    else if (al.estado_agenda === 'Pre-alta Pendiente') {
        tags += `<div class="badge" style="background:#6c757d; color:white; margin-bottom:8px;">⏳ Tramitando Alta</div>`;
        contenidoExtra = `<button class="btn-accion-main btn-abrir-prealta" data-id="${id}" style="width:100%; margin-top:10px;">⚙️ Iniciar Pre-Alta</button>`;
    }
    else if (al.estado_agenda === 'Pre-alta Iniciada') {
        tags += `<div class="badge badge-warning" style="margin-bottom:8px;">🚀 Pre-Alta Iniciada</div>`;
        let checks = al.checklist_alta || [false, false, false, false, false];
        let cantOk = checks.filter(Boolean).length;
        let pct = (cantOk / 5) * 100;
        let colorBarra = cantOk <= 1 ? '#dc3545' : (cantOk <= 3 ? '#ffc107' : '#28a745');
        
        let chkHtml = '';
        chkLabels.forEach((label, idx) => {
            chkHtml += `<label class="checklist-item" style="display:flex; align-items:flex-start; margin-bottom:6px;"><input type="checkbox" class="chk-alta-paso" data-id="${id}" data-idx="${idx}" ${checks[idx]?'checked':''} style="margin-top:2px; margin-right:8px;"> <span style="line-height:1.3;">${label}</span></label>`;
        });

        contenidoExtra = `
            <div class="progress-container"><div class="progress-bar" style="width:${pct}%; background-color:${colorBarra};"></div></div>
            <div class="txt-checks-count" style="font-size:0.8em; color:#6c757d; margin-top:5px; text-align:right;">${cantOk}/5 Checks</div>
            <div style="margin-top:10px; border-top:1px solid #eee; padding-top:10px;">
                <strong style="display:block; font-size:0.85em; color:#212529; margin-bottom:8px;">Chequeo para completar alta:</strong>
                ${chkHtml}
            </div>`;
        accionesHtml += `<button class="dropdown-item btn-abrir-confirmar-alta" data-id="${id}">✅ Confirmar Alta</button>`;
        accionesHtml += `<button class="dropdown-item btn-reenviar-prealta" data-id="${id}">📤 Copiar texto Pre-Alta</button>`;
        accionesHtml += `<button class="dropdown-item btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Pre-Alta</button>`;
        accionesHtml += `<button class="dropdown-item btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
        accionesHtml += `<button class="dropdown-item btn-suspender-alta" data-id="${id}">❌ Suspender Alta</button>`;
    }
    else if (al.estado_agenda === 'Alta Efectiva' || al.estado_agenda === 'Alta Ilegal') {
        extraClass = 'item-confirmada';
        if (al.estado_agenda === 'Alta Ilegal') tags += `<div class="badge badge-ilegal" style="margin-bottom:8px;">🏴 ALTA ILEGAL</div>`;
        else tags += `<div class="badge badge-success" style="margin-bottom:8px;">✅ Alta Efectiva</div>`;
        let checks = al.checklist_alta || [false, false, false, false, false];
        let cantOk = checks.filter(Boolean).length;
        if (cantOk < 5) {
            let pct = (cantOk / 5) * 100;
            let colorBarra = cantOk <= 1 ? '#dc3545' : (cantOk <= 3 ? '#ffc107' : '#28a745');
            let chkHtml = '';
            chkLabels.forEach((label, idx) => {
                chkHtml += `<label class="checklist-item" style="display:flex; align-items:flex-start; margin-bottom:6px;"><input type="checkbox" class="chk-alta-paso" data-id="${id}" data-idx="${idx}" ${checks[idx]?'checked':''} style="margin-top:2px; margin-right:8px;"> <span style="line-height:1.3;">${label}</span></label>`;
            });
            contenidoExtra = `
                <div class="progress-container"><div class="progress-bar" style="width:${pct}%; background-color:${colorBarra};"></div></div>
                <div class="txt-checks-count" style="font-size:0.8em; color:#6c757d; margin-top:5px; text-align:right;">${cantOk}/5 Checks</div>
                <div style="margin-top:10px; border-top:1px solid #eee; padding-top:10px;">
                    <strong style="display:block; font-size:0.85em; color:#212529; margin-bottom:8px;">Chequeo para completar alta:</strong>
                    ${chkHtml}
                </div>`;
        } else { contenidoExtra = `<div style="color:#28a745; font-weight:bold; margin-top:10px; text-align:right;">✅ Completado</div>`; }
        accionesHtml += `<button class="dropdown-item btn-reenviar-alta" data-id="${id}">📤 Copiar texto Alta Conf.</button>`;
        accionesHtml += `<button class="dropdown-item btn-suspender-alta" data-id="${id}">❌ Suspender Alta</button>`;
    }
    else if (al.estado_agenda === 'Alta Suspendida') {
        extraClass = 'item-suspendida'; tags += `<div class="badge badge-danger" style="margin-bottom:8px;">Alta Suspendida</div>`;
        accionesHtml += `<button class="dropdown-item btn-devolver-espera" data-id="${id}">♻️ Enviar a Espera</button>`;
    }

    if (al.estado_agenda !== 'Pre-alta Pendiente' && al.estado_agenda !== 'Lista de espera' && al.estado_agenda !== 'Alta Suspendida' && al.estado_agenda !== 'Alta Efectiva' && al.estado_agenda !== 'Alta Ilegal') {
        accionesHtml = `<button class="dropdown-item btn-nombre-agendar" data-id="${id}">📋 Generar nombre agenda WS</button>` + accionesHtml;
    }

    let menuAcciones = '';
    if (accionesHtml) {
        menuAcciones = `<div class="alumno-actions" style="position:relative; display:flex; justify-content:flex-end;"><button class="btn-dropdown">⚡ Acciones ▾</button><div class="dropdown-menu-wrapper"><div class="dropdown-menu">${accionesHtml}</div></div></div>`;
    }

    return `
        <div class="alumno-item ${extraClass}" data-id="${id}">
            <div class="alumno-header btn-editar-alumno" data-id="${id}" style="padding-right:45px;">
                <button class="btn-nota-rapida" data-id="${id}" title="Agregar Nota" style="position:absolute; top:0; right:28px; background:transparent; border:none; color:#17a2b8; cursor:pointer; font-size:1.1em; padding:0; line-height:1;">📝</button>
                <button class="btn-eliminar-alumno" title="Eliminar Alumno" style="position:absolute; top:0; right:0; background:transparent; border:none; color:#dc3545; cursor:pointer; font-size:1.1em; padding:0; line-height:1;">❌</button>
                <div style="width:100%;">
                    ${tags}
                    ${altaInfoHtml}
                    <div class="alumno-nombre-search" style="font-size:1.1em; font-weight:700; color:#212529;">${al.nombre}</div>
                    <div style="color:#495057; font-size:0.9em; margin-top:2px;">${instStr} (${al.tipo_suscripcion})</div>
                    <div style="color:#868e96; font-size:0.8em; margin-top:5px;">Cel: ${al.celular} | Edad: ${al.edad||'-'}</div>
                </div>
            </div>
            ${contenidoExtra}
            ${menuAcciones}
        </div>
    `;
}

function renderTimeline(containerId, cardsContainerId, configNodos, datos, nodoActivo, setterNodo) {
    const cont = document.getElementById(containerId);
    let html = '<div class="timeline-wrapper"><div class="timeline-line"></div>';
    configNodos.forEach(n => {
        const count = datos.filter(d => n.filterFn ? n.filterFn(d) : d.estado_agenda === n.id).length;
        const act = (n.id === nodoActivo) ? 'active' : '';
        html += `
            <div class="timeline-node ${n.color} ${act}" data-id="${n.id}">
                <div class="timeline-count">${count}</div>
                <div class="timeline-circle">${n.icon}</div>
                <div class="timeline-label">${n.label}</div>
            </div>`;
    });
    html += '</div>';
    cont.innerHTML = html;

    cont.querySelectorAll('.timeline-node').forEach(el => {
        el.addEventListener('click', () => {
            let newId = el.getAttribute('data-id');
            if (setterNodo === 'adm') nodoAdmActivo = newId;
            if (setterNodo === 'altas') nodoAltasActivo = newId;
            renderTimeline(containerId, cardsContainerId, configNodos, datos, newId, setterNodo);
        });
    });
    renderTarjetasGrid(cardsContainerId, datos, nodoActivo, configNodos);
}

function renderTarjetasGrid(containerId, datos, estadoId, configNodos) {
    const cont = document.getElementById(containerId);
    const nodo = configNodos.find(n => n.id === estadoId);
    const filtrados = datos.filter(d => nodo && nodo.filterFn ? nodo.filterFn(d) : d.estado_agenda === estadoId);
    if(filtrados.length === 0) {
        cont.innerHTML = '<p style="color:#6c757d; grid-column: 1 / -1; text-align:center; margin-top:20px;">No hay gestiones en este estado.</p>';
    } else {
        cont.innerHTML = filtrados.map(a => generarTarjetaAlumno(a, a.id, estadoActualVista)).join('');
    }
}

async function cargarVista(vista) {
    estadoActualVista = vista; 
    const bcContainer = document.getElementById('breadcrumb-container'), titleContainer = document.getElementById('vista-titulo');
    if (vista.includes('-')) {
        const parts = vista.split('-'), parent = parts[0].trim(), current = parts.slice(1).join('-').trim();
        bcContainer.innerHTML = `<span style="cursor:pointer; color:#007bff; text-decoration:none;" onclick="cargarVista('${parent}')">${parent}</span> &gt; <strong style="color:#212529;">${current}</strong>`;
        titleContainer.textContent = current;
    } else { bcContainer.innerHTML = ''; titleContainer.textContent = vista; }

    const btnNuevo = document.getElementById('btn-nuevo-alumno'), searchGen = document.getElementById('search-container-general'), btnCargaMasiva = document.getElementById('btn-carga-masiva');
    const vResumen = document.getElementById('vista-resumen'), vAdm = document.getElementById('vista-admision-pendientes'), vAltas = document.getElementById('vista-altas-pendientes');
    const contLista = document.getElementById('lista-generica'), contEstad = document.getElementById('estadisticas-container');
    const formWrapper = document.getElementById('form-alumno-wrapper'); 
    
    if (formWrapper) { formWrapper.style.display = 'none'; document.getElementById('modal-alta-alumno').appendChild(formWrapper); }
    btnNuevo.style.display = 'none'; searchGen.style.display = 'none'; btnCargaMasiva.style.display = 'none'; 
    vResumen.style.display = 'none'; vAdm.style.display = 'none'; vAltas.style.display = 'none'; contLista.style.display = 'none'; contEstad.style.display = 'none'; document.getElementById('input-buscador-general').value = '';

    if (vista === 'Resumen') {
        btnNuevo.style.display = 'block'; searchGen.style.display = 'block'; vResumen.style.display = 'flex';
        try {
            const refAl = collection(db, "alumnos"), qSnap = await getDocs(refAl);
            let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            
            allData.forEach(a => {
                if (!a.reserva_inicio && a.reserva_fecha_texto) {
                    const fIso = interpretarFechaCSV(a.reserva_fecha_texto);
                    if (fIso) a.reserva_inicio = fIso;
                }
            });
            
            let urgencies = [];
            allData.forEach(al => {
                let dateToEval = null;
                if ((al.estado_agenda === 'Pendiente validación por profe' || al.estado_agenda === 'Pendiente validación por alumno' || al.estado_agenda === 'Agenda confirmada') && al.reserva_inicio) {
                    dateToEval = new Date(al.reserva_inicio);
                    if(isNaN(dateToEval.getTime())) dateToEval = null;
                }
                else if (al.estado_agenda === 'Pre-alta Iniciada' && al.fecha_inicio_clases) {
                    dateToEval = new Date(al.fecha_inicio_clases);
                    if(isNaN(dateToEval.getTime())) dateToEval = null;
                }
                
                if (dateToEval) {
                    let diffHs = (dateToEval - new Date()) / (1000 * 60 * 60);
                    if (diffHs <= 72) urgencies.push(al);
                }
            });
            urgencies.sort((a,b) => {
                let dA = (a.estado_agenda==='Pre-alta Iniciada') ? new Date(a.fecha_inicio_clases) : new Date(a.reserva_inicio);
                let dB = (b.estado_agenda==='Pre-alta Iniciada') ? new Date(b.fecha_inicio_clases) : new Date(b.reserva_inicio);
                return dA - dB;
            });
            const cUrg = document.getElementById('resumen-urgencias');
            cUrg.innerHTML = urgencies.length > 0 ? urgencies.map(a => generarTarjetaAlumno(a, a.id, vista)).join('') : '<p style="color:#28a745; grid-column:1/-1;">¡Excelente! No hay gestiones críticas a la vista.</p>';

            renderTimeline('timeline-resumen-adm', 'cards-resumen-adm', configNodosAdm, allData, nodoAdmActivo, 'adm');
            renderTimeline('timeline-resumen-altas', 'cards-resumen-altas', configNodosAltas, allData, nodoAltasActivo, 'altas');

        } catch(e) {}
    } else if (vista === 'Admisión - Pendientes') {
        btnNuevo.style.display = 'block'; btnCargaMasiva.style.display = 'block'; searchGen.style.display = 'block'; vAdm.style.display = 'flex';
        try {
            const refAl = collection(db, "alumnos"), qSnap = await getDocs(refAl);
            let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            renderTimeline('timeline-adm', 'cards-adm', configNodosAdm, allData, nodoAdmActivo, 'adm');
        } catch(e) {}
    } else if (vista === 'Admisión - Confirmadas' || vista === 'Admisión - Suspendidas') {
        searchGen.style.display = 'block'; contLista.style.display = 'flex'; contLista.innerHTML = '<div class="cards-grid" id="lista-grilla-adm"></div>';
        try { const estMap = { 'Admisión - Confirmadas': 'Agenda confirmada', 'Admisión - Suspendidas': 'Agenda suspendida' }; const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", estMap[vista]))); if(!qSnap.empty) document.getElementById('lista-grilla-adm').innerHTML = qSnap.docs.map(d => generarTarjetaAlumno(d.data(), d.id, vista)).join(''); } catch(e) {}
    } else if (vista === 'Lista de Espera') {
        searchGen.style.display = 'block'; contLista.style.display = 'flex'; contLista.innerHTML = '<div class="cards-grid" id="lista-grilla-esp"></div>';
        try { const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Lista de espera"))); if(!qSnap.empty) document.getElementById('lista-grilla-esp').innerHTML = qSnap.docs.map(d => generarTarjetaAlumno(d.data(), d.id, vista)).join(''); else document.getElementById('lista-grilla-esp').innerHTML = '<p style="color:#6c757d;">No hay alumnos en lista de espera.</p>'; } catch(e) {}
    } else if (vista === 'Altas - Pendientes') {
        searchGen.style.display = 'block'; vAltas.style.display = 'flex';
        try {
            const refAl = collection(db, "alumnos"), qSnap = await getDocs(refAl);
            let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            renderTimeline('timeline-altas', 'cards-altas', configNodosAltas, allData, nodoAltasActivo, 'altas');
        } catch(e) {}
    } else if (vista === 'Altas - Confirmadas') {
        searchGen.style.display = 'block'; contLista.style.display = 'flex'; contLista.innerHTML = '<div class="cards-grid" id="lista-grilla-altas-conf"></div>';
        try { 
            const refAl = collection(db, "alumnos"), qSnap = await getDocs(refAl); let res = [];
            qSnap.forEach(d => { if(d.data().estado_agenda === 'Alta Efectiva' || d.data().estado_agenda === 'Alta Ilegal') res.push({id: d.id, ...d.data()}); });
            if(res.length > 0) document.getElementById('lista-grilla-altas-conf').innerHTML = res.map(d => generarTarjetaAlumno(d, d.id, vista)).join(''); else document.getElementById('lista-grilla-altas-conf').innerHTML = '<p style="color:#6c757d; grid-column:1/-1;">No hay altas confirmadas.</p>';
        } catch(e) {}
    } else if (vista === 'Altas - Suspendidas') {
        searchGen.style.display = 'block'; contLista.style.display = 'flex'; contLista.innerHTML = '<div class="cards-grid" id="lista-grilla-altas-susp"></div>';
        try { const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Alta Suspendida"))); if(!qSnap.empty) document.getElementById('lista-grilla-altas-susp').innerHTML = qSnap.docs.map(d => generarTarjetaAlumno(d.data(), d.id, vista)).join(''); else document.getElementById('lista-grilla-altas-susp').innerHTML = '<p style="color:#6c757d;">No hay altas suspendidas.</p>'; } catch(e) {}
    } else if (vista === 'Estadísticas') { contEstad.style.display = 'flex'; renderCharts();
    } else if (vista === 'Configuración') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfigHub(contLista);
    } else if (vista === 'Ajustes Generales') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfig(contLista);
    } else if (vista.startsWith('ABM')) {
        contLista.style.display = 'flex'; contLista.innerHTML = ''; 
        const colMap = { 'ABM-Profesores': 'profesores', 'ABM-Instrumentos': 'instrumentos', 'ABM-Suscripciones': 'tipos_suscripcion', 'ABM-Usuarios': 'usuarios_sistema' }; 
        cargarABM(colMap[vista] || vista.split('-')[1].toLowerCase(), vista.split('-')[1], contLista); 
    }
}

function renderConfigHub(cont) {
    cont.innerHTML = `
        <div style="max-width:800px; width:100%; padding:20px;">
            <h2 style="margin-top:0; margin-bottom:25px; color:#212529;">Configuración</h2>
            <div class="config-card" onclick="cargarVista('Ajustes Generales')"><div class="icon">⚙️</div><div><div style="font-weight:600; font-size:1.05em; color:#212529;">Ajustes Generales</div><div style="color:#6c757d; font-size:0.9em; margin-top:3px;">Límites, calendarios y textos predefinidos.</div></div></div>
            <div class="config-card" onclick="cargarVista('ABM-Usuarios')"><div class="icon">🔐</div><div><div style="font-weight:600; font-size:1.05em; color:#212529;">Usuarios del Sistema</div><div style="color:#6c757d; font-size:0.9em; margin-top:3px;">Administrar accesos y cuentas habilitadas.</div></div></div>
            <div class="config-card" onclick="cargarVista('ABM-Profesores')"><div class="icon">👥</div><div><div style="font-weight:600; font-size:1.05em; color:#212529;">Profesores</div><div style="color:#6c757d; font-size:0.9em; margin-top:3px;">Alta, edición de datos y disponibilidad horaria.</div></div></div>
            <div class="config-card" onclick="cargarVista('ABM-Instrumentos')"><div class="icon">🎸</div><div><div style="font-weight:600; font-size:1.05em; color:#212529;">Instrumentos</div><div style="color:#6c757d; font-size:0.9em; margin-top:3px;">Administración de instrumentos del estudio.</div></div></div>
            <div class="config-card" onclick="cargarVista('ABM-Suscripciones')"><div class="icon">🎫</div><div><div style="font-weight:600; font-size:1.05em; color:#212529;">Suscripciones</div><div style="color:#6c757d; font-size:0.9em; margin-top:3px;">Tipos de clases y formatos para los alumnos.</div></div></div>
        </div>`;
}

async function renderCharts() {
    const cont = document.getElementById('estadisticas-container');
    cont.innerHTML = `
        <h2 style="margin:0; font-size:1.3em; color:#212529; border-bottom:2px solid #dee2e6; padding-bottom:10px;">Estadísticas de Admisión</h2>
        <div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #dee2e6; flex:1; min-width:300px;"><canvas id="chartAdmGestiones"></canvas></div>
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #dee2e6; flex:1; min-width:300px;"><canvas id="chartAdmGlobal"></canvas></div>
        </div>
        <h2 style="margin:0; font-size:1.3em; color:#212529; border-bottom:2px solid #dee2e6; padding-bottom:10px; margin-top:20px;">Estadísticas de Altas</h2>
        <div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #dee2e6; flex:1; min-width:300px;"><canvas id="chartAltasGlobal"></canvas></div>
        </div>
    `;

    try {
        const qSnap = await getDocs(collection(db, "alumnos"));
        let counts = { 'Pendiente procesar':0, 'Pendiente validación por profe':0, 'Pendiente validación por alumno':0 };
        let cAdm = { en_curso:0, confirmadas:0, suspendidas:0 };
        let cAltas = { pre_alta:0, efectivas:0, suspendidas:0 };

        qSnap.forEach(doc => {
            let st = doc.data().estado_agenda;
            if(counts[st] !== undefined) counts[st]++;
            
            if(['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno'].includes(st)) cAdm.en_curso++;
            if(st === 'Agenda confirmada') cAdm.confirmadas++;
            if(st === 'Agenda suspendida') cAdm.suspendidas++;
            
            if(['Pre-alta Pendiente', 'Pre-alta Iniciada'].includes(st)) cAltas.pre_alta++;
            if(['Alta Efectiva', 'Alta Ilegal'].includes(st)) cAltas.efectivas++;
            if(st === 'Alta Suspendida') cAltas.suspendidas++;
        });

        if(chartAdmGestionesInst) chartAdmGestionesInst.destroy(); 
        if(chartAdmGlobalInst) chartAdmGlobalInst.destroy();
        if(chartAltasGlobalInst) chartAltasGlobalInst.destroy();

        chartAdmGestionesInst = new Chart(document.getElementById('chartAdmGestiones'), { type: 'doughnut', data: { labels: ['Sin Agendar', 'Validando Profe', 'Validando Alumno'], datasets: [{ data: [counts['Pendiente procesar'], counts['Pendiente validación por profe'], counts['Pendiente validación por alumno']], backgroundColor: ['#6c757d', '#6f42c1', '#ffc107'] }] } });
        chartAdmGlobalInst = new Chart(document.getElementById('chartAdmGlobal'), { type: 'pie', data: { labels: ['En Curso', 'Confirmadas', 'Suspendidas'], datasets: [{ data: [cAdm.en_curso, cAdm.confirmadas, cAdm.suspendidas], backgroundColor: ['#17a2b8', '#28a745', '#dc3545'] }] } });
        chartAltasGlobalInst = new Chart(document.getElementById('chartAltasGlobal'), { type: 'pie', data: { labels: ['Pre-Altas', 'Altas Confirmadas', 'Altas Suspendidas/Canceladas'], datasets: [{ data: [cAltas.pre_alta, cAltas.efectivas, cAltas.suspendidas], backgroundColor: ['#17a2b8', '#28a745', '#dc3545'] }] } });
    } catch(e) {}
}

const btnLogin = document.getElementById('btn-login'); if (btnLogin) btnLogin.addEventListener('click', conectarGoogle);

document.getElementById('btn-logout').addEventListener('click', async () => { await signOut(auth); window.location.reload(); });

onAuthStateChanged(auth, async (user) => { 
    if (user) { 
        try {
            const qSnap = await getDocs(collection(db, "usuarios_sistema"));
            let autorizado = false;
            
            if (qSnap.empty) {
                await addDoc(collection(db, "usuarios_sistema"), { email: user.email.toLowerCase(), rol: 'admin' });
                autorizado = true;
            } else {
                qSnap.forEach(d => {
                    if(d.data().email && d.data().email.toLowerCase() === user.email.toLowerCase()) autorizado = true;
                });
            }
            
            if (!autorizado) {
                alert(`Acceso Denegado:\nTu cuenta de correo (${user.email}) no se encuentra autorizada en el sistema. Consulta con el administrador.`);
                await signOut(auth);
                document.getElementById('login-container').style.display = 'flex'; 
                document.getElementById('app-container').style.display = 'none';
                return; 
            }
        } catch(e) {
            console.error(e);
            return alert("Error al validar permisos de usuario.");
        }

        document.getElementById('login-container').style.display = 'none'; 
        document.getElementById('app-container').style.display = 'flex'; 
        document.getElementById('user-info').textContent = user.email; 
        
        // INYECCIÓN DE LA VERSIÓN DE LA APP
        const userInfoBox = document.getElementById('user-info');
        if (userInfoBox && !document.getElementById('version-tag')) {
            userInfoBox.insertAdjacentHTML('afterend', `<div id="version-tag" style="font-size:0.8em; color:#adb5bd; margin-top:5px; font-weight:bold;">Versión ${APP_VERSION}</div>`);
        }
        
        await cargarConfig(); 
        cargarVista('Resumen'); 
    } else { 
        document.getElementById('login-container').style.display = 'flex'; 
        document.getElementById('app-container').style.display = 'none'; 
    } 
});

// EVENTO DE NAVEGACIÓN CORREGIDO (Oculta el menú lateral y el velo oscuro)
document.querySelectorAll('#sidebar .nav-item').forEach(item => { 
    item.addEventListener('click', (e) => { 
        document.querySelectorAll('#sidebar .nav-item').forEach(el => el.classList.remove('active')); 
        e.target.closest('.nav-item').classList.add('active'); 
        cargarVista(e.target.closest('.nav-item').getAttribute('data-vista')); 
        
        document.getElementById('sidebar').classList.remove('active'); 
        
        const overlay = document.getElementById('mobile-overlay');
        if (overlay) overlay.style.display = 'none';
    }); 
});

const inputBuscadorGeneral = document.getElementById('input-buscador-general'); if(inputBuscadorGeneral) { inputBuscadorGeneral.addEventListener('input', (e) => { const query = e.target.value.toLowerCase(); document.querySelectorAll('.alumno-item').forEach(item => { const elNombre = item.querySelector('.alumno-nombre-search'); if(elNombre) item.style.display = elNombre.textContent.toLowerCase().includes(query) ? 'flex' : 'none'; }); }); }
const inputBuscadorPopup = document.getElementById('input-buscador-popup'); if(inputBuscadorPopup) { inputBuscadorPopup.addEventListener('input', (e) => { const query = e.target.value.toLowerCase(); document.querySelectorAll('.opcion-horario').forEach(item => { const elTexto = item.querySelector('span'); if(elTexto) item.style.display = elTexto.textContent.toLowerCase().includes(query) ? 'flex' : 'none'; }); }); }

document.getElementById('btn-carga-masiva').addEventListener('click', () => { if(confirm("¿Realizar carga masiva desde CSV?")) document.getElementById('input-csv').click(); });
document.getElementById('input-csv').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return; const btn = document.getElementById('btn-carga-masiva'); const originalText = btn.innerHTML; btn.innerHTML = '⏳ Procesando...'; btn.disabled = true;
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: async function(results) { const data = results.data; let successCount = 0; let errorCount = 0; const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00'; const dispGlobal = { 'L': [{inicio:hApe,fin:hCie}], 'M': [{inicio:hApe,fin:hCie}], 'X': [{inicio:hApe,fin:hCie}], 'J': [{inicio:hApe,fin:hCie}], 'V': [{inicio:hApe,fin:hCie}], 'S': [{inicio:hApe,fin:hCie}] };
            for (const row of data) {
                if (!row['Alumno'] && !row['Celu']) continue; let instArr = row['Instrumento'] ? row['Instrumento'].split(',').map(s => s.trim()) : []; let estadoOriginal = (row['Estado'] || '').trim().toUpperCase(), estadoAgenda = "Pendiente procesar";
                if (estadoOriginal === 'SE OFRECE AGENDA') estadoAgenda = 'Pendiente validación por alumno'; else if (estadoOriginal === 'SUSPENDIDO') estadoAgenda = 'Agenda suspendida'; else if (estadoOriginal === 'CONFIRMADA' || estadoOriginal === 'CONFIRMADO') estadoAgenda = 'Agenda confirmada';
                const alData = { nombre: row['Alumno'] || 'Sin Nombre', celular: row['Celu'] || '', edad: parseInt(row['Edad']) || '', instrumento: instArr, tipo_suscripcion: row['Clase'] || '', descripcion: row['Detalle'] ? row['Detalle'].replace(/\n/g, '<br>') : '', disponibilidad: dispGlobal, estado_agenda: estadoAgenda, historial: [] };
                if (estadoAgenda === 'Pendiente validación por alumno' || estadoAgenda === 'Agenda confirmada') { alData.reserva_profe_nombre = row['¿Quién entrevista?'] || ''; alData.reserva_fecha_texto = row['Fecha entrevista'] || ''; const fIso = interpretarFechaCSV(alData.reserva_fecha_texto); if(fIso) { alData.reserva_inicio = fIso; alData.reserva_fin = formatoLocalISO(new Date(new Date(fIso).getTime() + 60*60*1000)); } }
                if (estadoAgenda === 'Agenda suspendida') alData.motivo_suspension = "Suspendido en base histórica";
                try { await addDoc(collection(db, "alumnos"), alData); successCount++; } catch (err) { errorCount++; }
            } btn.innerHTML = originalText; btn.disabled = false; e.target.value = ''; alert(`Carga masiva completada.\nRegistros subidos: ${successCount}\nErrores: ${errorCount}`); cargarVista(estadoActualVista);
        } });
});

document.addEventListener('change', async (e) => {
    if(e.target.classList.contains('chk-alta-paso')) {
        const id = e.target.getAttribute('data-id'), idx = parseInt(e.target.getAttribute('data-idx'));
        try {
            const docRef = doc(db, "alumnos", id), alDoc = await getDoc(docRef), al = alDoc.data();
            let checks = al.checklist_alta || [false, false, false, false, false];
            checks[idx] = e.target.checked;
            await updateDoc(docRef, { checklist_alta: checks });
            
            const item = e.target.closest('.alumno-item');
            if (item) { 
                const cantOk = checks.filter(Boolean).length;
                const pct = (cantOk / 5) * 100;
                const color = cantOk <= 1 ? '#dc3545' : (cantOk <= 3 ? '#ffc107' : '#28a745');
                
                const pBar = item.querySelector('.progress-bar'); 
                if (pBar) {
                    pBar.style.width = pct + '%';
                    pBar.style.backgroundColor = color;
                }
                
                const tCount = item.querySelector('.txt-checks-count');
                if(tCount) tCount.textContent = cantOk + '/5 Checks';
                
                if (cantOk === 5 && (estadoActualVista === 'Resumen' || estadoActualVista === 'Altas - Pendientes') && (al.estado_agenda === 'Alta Efectiva' || al.estado_agenda === 'Alta Ilegal')) {
                    setTimeout(() => { cargarVista(estadoActualVista); }, 1000);
                }
            }
        } catch(err) {}
    }
    if(e.target.classList.contains('chk-agenda-opt')) {
        const checkedBoxes = document.querySelectorAll('.chk-agenda-opt:checked');
        if (checkedBoxes.length > 0) { const selectedProfeId = checkedBoxes[0].getAttribute('data-profeid'); document.querySelectorAll('.chk-agenda-opt').forEach(chk => { if (chk.getAttribute('data-profeid') !== selectedProfeId) chk.disabled = true; else chk.disabled = false; }); } else { document.querySelectorAll('.chk-agenda-opt').forEach(chk => chk.disabled = false); }
    }
});

document.addEventListener('click', async (e) => {
    const target = e.target;
    if (target.tagName === 'DIALOG') { const rect = target.getBoundingClientRect(), inDialog = (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
        if (!inDialog) {
            if (target.id === 'modal-alta-alumno') document.querySelector('#form-alumno button[type="submit"]').click();
            else if (target.id === 'modal-nota-rapida') document.getElementById('btn-guardar-nota-rapida').click();
            else if (target.id === 'modal-abm-edit') document.getElementById('btn-guardar-abm-edit').click();
            else target.close(); return;
        }
    }

    if (target.classList.contains('btn-copy-disp')) { e.stopPropagation(); const d = target.getAttribute('data-dia'); clipboardDisponibilidad = { inicio: document.getElementById(`disp-${d}-inicio`).value, fin: document.getElementById(`disp-${d}-fin`).value, all: document.getElementById(`disp-${d}-all`).checked, none: document.getElementById(`disp-${d}-none`).checked }; return; }
    if (target.classList.contains('btn-paste-disp')) { e.stopPropagation(); if (!clipboardDisponibilidad) return alert("Primero copia una disponibilidad."); const d = target.getAttribute('data-dia'); document.getElementById(`disp-${d}-inicio`).value = clipboardDisponibilidad.inicio; document.getElementById(`disp-${d}-fin`).value = clipboardDisponibilidad.fin; document.getElementById(`disp-${d}-all`).checked = clipboardDisponibilidad.all; document.getElementById(`disp-${d}-none`).checked = clipboardDisponibilidad.none; window.updateDispStateForDay(d, false); return; }
    if (target.classList.contains('btn-copy-disp-p')) { e.stopPropagation(); const d = target.getAttribute('data-dia'); clipboardDisponibilidadProfe = { inicio: document.getElementById(`disp-p-${d}-inicio`).value, fin: document.getElementById(`disp-p-${d}-fin`).value, all: document.getElementById(`disp-p-${d}-all`).checked, none: document.getElementById(`disp-p-${d}-none`).checked }; return; }
    if (target.classList.contains('btn-paste-disp-p')) { e.stopPropagation(); if (!clipboardDisponibilidadProfe) return alert("Primero copia una disponibilidad."); const d = target.getAttribute('data-dia'); document.getElementById(`disp-p-${d}-inicio`).value = clipboardDisponibilidadProfe.inicio; document.getElementById(`disp-p-${d}-fin`).value = clipboardDisponibilidadProfe.fin; document.getElementById(`disp-p-${d}-all`).checked = clipboardDisponibilidadProfe.all; document.getElementById(`disp-p-${d}-none`).checked = clipboardDisponibilidadProfe.none; window.updateDispStateForDay(d, true); return; }

    if (target.classList.contains('btn-eliminar-alumno')) { e.stopPropagation(); if(confirm("¿Eliminar este alumno por completo?")) { const id = target.closest('.alumno-item').getAttribute('data-id'); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); if (al && al.id_evento_reserva) { await eliminarEventoSeguro(al); } } catch(err) {} await deleteDoc(doc(db, "alumnos", id)); cargarVista(estadoActualVista); } return; }
    if (target.classList.contains('btn-nota-rapida')) { e.stopPropagation(); document.getElementById('nota-rapida-id').value = target.getAttribute('data-id'); document.getElementById('nota-rapida-texto').value = ''; document.getElementById('modal-nota-rapida').showModal(); return; }

    if (target.classList.contains('btn-editar-nota') || target.closest('.btn-editar-nota')) {
        e.stopPropagation();
        const btn = target.classList.contains('btn-editar-nota') ? target : target.closest('.btn-editar-nota');
        const idNota = String(btn.getAttribute('data-id'));
        const nota = historialActual.find(n => String(n.id) === idNota);
        if (nota) {
            const nuevoTexto = prompt("Editar nota:", nota.texto.replace(/<br>/g, "\n"));
            if (nuevoTexto !== null && nuevoTexto.trim() !== "") {
                nota.texto = nuevoTexto.trim();
                renderHistorial();
            }
        }
        return;
    }
    
    if (target.classList.contains('btn-eliminar-nota') || target.closest('.btn-eliminar-nota')) {
        e.stopPropagation();
        const btn = target.classList.contains('btn-eliminar-nota') ? target : target.closest('.btn-eliminar-nota');
        if(confirm("¿Eliminar esta nota?")) {
            const idNota = String(btn.getAttribute('data-id'));
            historialActual = historialActual.filter(n => String(n.id) !== idNota);
            renderHistorial();
        }
        return;
    }

    if (target.id === 'btn-guardar-nota-rapida') {
        const id = document.getElementById('nota-rapida-id').value;
        const texto = document.getElementById('nota-rapida-texto').value;
        if (!texto.trim()) return alert("La nota no puede estar vacía.");
        setBotonCargando(target, true);
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (alDoc.exists()) {
                const alData = alDoc.data();
                const hist = alData.historial || [];
                const now = new Date();
                const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
                hist.push({ id: Date.now(), texto: texto.trim(), fecha: fechaStr });
                await updateDoc(doc(db, "alumnos", id), { historial: hist });
                document.getElementById('modal-nota-rapida').close();
                cargarVista(estadoActualVista);
            }
        } catch(e) { alert("Error al guardar la nota rápida."); }
        setBotonCargando(target, false);
        return;
    }

    const headerAl = target.closest('.btn-editar-alumno');
    if (headerAl && !target.classList.contains('btn-eliminar-alumno') && !target.classList.contains('btn-nota-rapida') && !target.closest('.alumno-actions')) {
        const id = headerAl.getAttribute('data-id'); const wrap = document.getElementById('form-alumno-wrapper'); document.getElementById('modal-alta-alumno').appendChild(wrap); wrap.style.display = 'block'; document.getElementById('alumno-id').value = id; await llenarFormularioAlumno(id); document.getElementById('form-titulo').textContent = 'Editar Alumno'; document.getElementById('container-ingreso-directo').style.display = 'none'; document.getElementById('modal-alta-alumno').showModal(); return;
    }

    if (target.classList.contains('btn-nombre-agendar')) {
        const id = target.getAttribute('data-id');
        try { const al = (await getDoc(doc(db, "alumnos", id))).data(); const iS = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento; let template = configApp.texto_nombre_agendar || 'MDL {nombre} {edad} {año_actual} @{instrumento} @{suscripcion}'; const txt = reemplazarVariables(template, { nombre: al.nombre, edad: al.edad || '', 'año_actual': new Date().getFullYear().toString(), 'año actual': new Date().getFullYear().toString(), instrumento: iS, suscripcion: al.tipo_suscripcion || '' }).replace(/\s+/g, ' ').trim(); await navigator.clipboard.writeText(txt); alert("Nombre copiado:\n" + txt); } catch(e) {} return;
    }

    if (target.classList.contains('btn-admision-finalizada')) { const id = target.getAttribute('data-id'); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Lista de espera" }); cargarVista(estadoActualVista); return; }
    if (target.classList.contains('btn-iniciar-alta')) { const id = target.getAttribute('data-id'); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pre-alta Pendiente" }); cargarVista(estadoActualVista); return; }
    if (target.classList.contains('btn-abrir-prealta') || target.classList.contains('btn-editar-prealta')) {
        const id = target.getAttribute('data-id'); document.getElementById('prealta-alumno-id').value = id; document.getElementById('titulo-prealta').textContent = target.classList.contains('btn-editar-prealta') ? 'Editar Pre-Alta' : 'Iniciar Pre-Alta';
        const dIni = target.getAttribute('data-inicio'), dGrp = target.getAttribute('data-grupo');
        document.getElementById('prealta-fecha-inicio').value = dIni ? dIni.substring(0,16) : ''; document.getElementById('prealta-grupo').value = dGrp || '';
        document.getElementById('modal-iniciar-prealta').showModal(); return;
    }
    
    if (target.id === 'btn-guardar-prealta') {
        const id = document.getElementById('prealta-alumno-id').value, fIni = document.getElementById('prealta-fecha-inicio').value, grp = document.getElementById('prealta-grupo').value;
        if(!fIni || !grp) return alert("Completa todos los campos.");
        setBotonCargando(target, true);
        const fIso = new Date(fIni).toISOString(), updates = { estado_agenda: "Pre-alta Iniciada", fecha_inicio_clases: fIso, grupo_asignado: grp };
        const al = (await getDoc(doc(db, "alumnos", id))).data();
        if(!al.fecha_prealta) updates.fecha_prealta = new Date().toISOString();
        if(!al.checklist_alta) updates.checklist_alta = [false, false, false, false, false];
        await updateDoc(doc(db, "alumnos", id), updates);
        
        const dataText = await generarTextoConHistorial(id, 'texto_prealta'); 
        await navigator.clipboard.writeText(dataText.txt);
        document.getElementById('modal-iniciar-prealta').close(); 
        alert("Pre-Alta Iniciada.\nTexto de aviso copiado al portapapeles."); 
        setBotonCargando(target, false);
        cargarVista(estadoActualVista); return;
    }
    if (target.classList.contains('btn-abrir-confirmar-alta')) { document.getElementById('conf-alta-alumno-id').value = target.getAttribute('data-id'); document.getElementById('modal-confirmar-alta').showModal(); return; }
    if (target.id === 'btn-guardar-confirmacion-alta') {
        const id = document.getElementById('conf-alta-alumno-id').value, est = document.querySelector('input[name="opt-tipo-alta"]:checked').value;
        setBotonCargando(target, true);
        await updateDoc(doc(db, "alumnos", id), { estado_agenda: est });
        
        const dataText = await generarTextoConHistorial(id, 'texto_alta_confirmada'); 
        await navigator.clipboard.writeText(dataText.txt);
        document.getElementById('modal-confirmar-alta').close(); 
        alert("Alta Confirmada.\nTexto de aviso copiado al portapapeles."); 
        setBotonCargando(target, false);
        cargarVista(estadoActualVista); return;
    }
    
    if (target.classList.contains('btn-devolver-espera')) {
        const motivo = prompt("¿Motivo para devolver a Lista de Espera?");
        if (motivo !== null) { if (motivo.trim() === "") return alert("Debes ingresar un motivo."); const id = target.getAttribute('data-id'); const al = (await getDoc(doc(db, "alumnos", id))).data(), now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`, hist = al.historial || []; hist.push({ id: Date.now(), texto: `Devuelto a espera. Motivo: ${motivo.trim()}`, fecha: fechaStr }); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Lista de espera", fecha_inicio_clases: null, grupo_asignado: null, checklist_alta: null, historial: hist }); cargarVista(estadoActualVista); } return;
    }
    if (target.classList.contains('btn-suspender-alta')) {
        const motivo = prompt("¿Motivo de Suspensión de Alta?");
        if (motivo !== null) { if (motivo.trim() === "") return alert("Debes ingresar un motivo."); const id = target.getAttribute('data-id'); const al = (await getDoc(doc(db, "alumnos", id))).data(), now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`, hist = al.historial || []; hist.push({ id: Date.now(), texto: `Alta suspendida. Motivo: ${motivo.trim()}`, fecha: fechaStr }); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Alta Suspendida", historial: hist }); cargarVista(estadoActualVista); } return;
    }

    if (target.classList.contains('btn-buscar-agenda')) {
        alumnoIdActual = target.getAttribute('data-id'); const modal = document.getElementById('modal-agenda'), resDiv = document.getElementById('resultados-agenda'), inputBuscadorPop = document.getElementById('input-buscador-popup'), infoDiv = document.getElementById('info-alumno-agenda');
        inputBuscadorPop.style.display = 'none'; inputBuscadorPop.value = ''; resDiv.innerHTML = '';
        const hoy = new Date(), d7 = new Date(); d7.setDate(d7.getDate()+7); document.getElementById('agenda-start').value = hoy.toISOString().split('T')[0]; document.getElementById('agenda-end').value = d7.toISOString().split('T')[0];
        document.getElementById('btn-procesar-seleccion-agenda').style.display = 'none';
        try { 
            const alData = (await getDoc(doc(db, "alumnos", alumnoIdActual))).data(); const instStr = Array.isArray(alData.instrumento) ? alData.instrumento.join(', ') : alData.instrumento; let dispHTML = '<ul style="margin:5px 0 0 0; padding-left:20px; font-size:0.9em; color:#212529;">';
            const diasMapStr = { 'L':'Lunes', 'M':'Martes', 'X':'Miércoles', 'J':'Jueves', 'V':'Viernes', 'S':'Sábado', 'D':'Domingo' };
            for(let d in alData.disponibilidad) { if(alData.disponibilidad[d] && alData.disponibilidad[d].length > 0) { dispHTML += `<li><strong>${diasMapStr[d]}:</strong> ${alData.disponibilidad[d].map(r => r.inicio+' a '+r.fin).join(', ')}</li>`; } } dispHTML += '</ul>';
            if(infoDiv) { infoDiv.innerHTML = `<div style="font-size:1.1em; margin-bottom:5px;"><strong>👤 ${alData.nombre}</strong> (${alData.edad || '-'} años) | 🎸 ${instStr}</div><div style="border-top:1px solid #ced4da; padding-top:8px;"><strong>Disponibilidad cargada:</strong>${dispHTML}</div>`; infoDiv.style.display = 'block'; }
            const selectProfe = document.getElementById('agenda-profe-filtro'); selectProfe.innerHTML = '<option value="">Todos los profesores habilitados</option>'; const pSnap = await getDocs(collection(db, "profesores")); pSnap.forEach(p => { if(p.data().entrevista) selectProfe.innerHTML += `<option value="${p.id}">${p.data().nombre}</option>`; }); resDiv.innerHTML = '<p>Selecciona el rango y haz clic en Buscar.</p>'; modal.showModal(); 
            setTimeout(() => { syncSelectToChips('agenda-profe-filtro', 'chips-profesores'); }, 100);
        } catch(err) {} return;
    }

    if (target.classList.contains('btn-bloquear-agenda')) {
        if(confirm("¿Reservar preventivamente este horario?")) {
            const id = target.getAttribute('data-id');
            try { 
                const al = (await getDoc(doc(db, "alumnos", id))).data(); 
                const titulos = construirTitulosEvento(al, 'reserva', configApp); 
                const evRes = await crearEventoSeguro(al, titulos, al.reserva_inicio, al.reserva_fin); 
                await updateDoc(doc(db, "alumnos", id), { id_evento_reserva: evRes.id, calendario_evento_reserva: evRes.calendar }); 
                cargarVista(estadoActualVista); 
            } catch(e) { 
                alert("❌ Operación cancelada.\n\n" + e.message); 
            }
        } return;
    }

    if (target.id === 'btn-ejecutar-busqueda' || target.closest('#btn-ejecutar-busqueda')) {
        const btnB = target.id === 'btn-ejecutar-busqueda' ? target : target.closest('#btn-ejecutar-busqueda');
        const resDiv = document.getElementById('resultados-agenda'), dStrStart = document.getElementById('agenda-start').value, dStrEnd = document.getElementById('agenda-end').value, inputBuscadorPop = document.getElementById('input-buscador-popup');
        if(!dStrStart || !dStrEnd) return alert("Fechas inválidas.");
        const selProfe = document.getElementById('agenda-profe-filtro'), fProfs = Array.from(selProfe.selectedOptions).map(o => o.value), searchAll = fProfs.length === 0 || fProfs.includes("");
        resDiv.innerHTML = '<p>Buscando...</p>'; document.getElementById('btn-procesar-seleccion-agenda').style.display = 'none';
        setBotonCargando(btnB, true);
        try {
            const al = (await getDoc(doc(db, "alumnos", alumnoIdActual))).data(), arrI = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento], esBat = arrI.some(i => i.toLowerCase().includes('bater')), dMap = { 'D':0, 'L':1, 'M':2, 'X':3, 'J':4, 'V':5, 'S':6 };
            const diasHab = []; for (const [l, arr] of Object.entries(al.disponibilidad)) { if (arr && arr.length > 0) diasHab.push(dMap[l]); }
            const dS = new Date(dStrStart+'T00:00:00'), dE = new Date(dStrEnd+'T23:59:59'); let algunValido = false;
            for(let x = new Date(dS); x <= dE; x.setDate(x.getDate()+1)) { if(x.getDay()!==0 && diasHab.includes(x.getDay())) algunValido=true; }
            if(!algunValido) { inputBuscadorPop.style.display = 'none'; setBotonCargando(btnB, false); return resDiv.innerHTML = '<p style="color:#dc3545;">El rango solo abarca días domingos o "No disponible".</p>'; }
            const pS = await getDocs(collection(db, "profesores")), todosLosProfes = [], profesFiltradosIDs = [];
            pS.forEach(p => { const d = p.data(); if(d.correo_calendario) { todosLosProfes.push({ id: p.id, nombre: d.nombre, calId: d.correo_calendario, disponibilidad: d.disponibilidad }); if (d.entrevista && (searchAll || fProfs.includes(p.id))) { profesFiltradosIDs.push(p.id); } } });
            if(profesFiltradosIDs.length === 0) { inputBuscadorPop.style.display = 'none'; setBotonCargando(btnB, false); return resDiv.innerHTML = '<p>No hay profes habilitados seleccionados.</p>'; }
            let allEv = []; for(const pr of todosLosProfes) { try { const data = await getEventosCalendario(pr.calId, dS.toISOString(), dE.toISOString()); if(data.items) allEv = allEv.concat(data.items.map(ev => ({...ev, profeId: pr.id}))); } catch(e) { console.error(e); } }
            const opts = generarOpcionesAgenda(al.disponibilidad, allEv, esBat, todosLosProfes, profesFiltradosIDs, dS, dE, configApp);
            if(opts.length===0) { inputBuscadorPop.style.display = 'none'; resDiv.innerHTML='<p>No hay huecos libres que cumplan las condiciones.</p>'; } else { 
                inputBuscadorPop.style.display = 'block'; document.getElementById('btn-procesar-seleccion-agenda').style.display = 'inline-block';
                const grouped = {};
                opts.forEach(op => { const parts = op.fechaTextoAmi.split(' '), dayKey = parts[0] + ' ' + parts[1], timeStr = parts[2]; if(!grouped[dayKey]) grouped[dayKey] = []; grouped[dayKey].push({ ...op, timeStr }); });
                let html = '';
                for(let day in grouped) {
                    html += `<details class="agenda-dia"><summary>📅 ${day} <span style="font-weight:normal; color:#6c757d;">(${grouped[day].length} opciones)</span></summary><div class="agenda-dia-content">`;
                    grouped[day].forEach(op => { const badgePegado = op.pegado ? '<span style="background:#fff3cd; color:#856404; padding:2px 6px; border-radius:4px; font-size:0.85em; font-weight:bold; margin-left:8px;">⭐ Clase pegada</span>' : ''; html += `<label class="opcion-horario" style="cursor:pointer; display:flex; justify-content:flex-start; gap:10px;"><input type="checkbox" class="chk-agenda-opt" data-calid="${op.calId}" data-profe="${op.profeNombre}" data-profeid="${op.profeId}" data-start="${op.inicioData}" data-end="${op.finData}" data-fechatxt="${op.fechaTextoAmi}"><span>🕒 ${op.timeStr} (${op.profeNombre}) ${badgePegado}</span></label>`; });
                    html += `</div></details>`;
                }
                resDiv.innerHTML = html; 
            }
        } catch(e) { console.error("Error al buscar:", e); inputBuscadorPop.style.display = 'none'; resDiv.innerHTML='<p>Error en la búsqueda.</p>'; } 
        setBotonCargando(btnB, false); return;
    }
    
    if (target.id === 'btn-procesar-seleccion-agenda') {
        const checks = document.querySelectorAll('.chk-agenda-opt:checked');
        if (checks.length === 0) return alert("Selecciona al menos un horario para enviar al profesor.");
        const opciones = Array.from(checks).map((chk, index) => { const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; return { letra: letras[index], profeId: chk.getAttribute('data-profeid'), profeNombre: chk.getAttribute('data-profe'), calId: chk.getAttribute('data-calid'), inicio: chk.getAttribute('data-start'), fin: chk.getAttribute('data-end'), fechaTexto: chk.getAttribute('data-fechatxt') }; });
        const pId = opciones[0].profeId, pNom = opciones[0].profeNombre, cId = opciones[0].calId;
        const al = (await getDoc(doc(db, "alumnos", alumnoIdActual))).data();
        let finalTxt = "";
        
        if (opciones.length === 1) { 
            let data = await generarTextoConHistorial(alumnoIdActual, 'texto_profe', opciones[0].fechaTexto, pId, pNom, opciones); 
            finalTxt = data.txt; 
        } else { 
            let data = await generarTextoConHistorial(alumnoIdActual, 'texto_opciones_multiples', 'Varias opciones', pId, pNom, opciones); 
            finalTxt = data.txt; 
        }
        
        setBotonCargando(target, true);
        try {
            let updateData = { estado_agenda: "Pendiente validación por profe", reserva_profe_id: pId, reserva_profe_nombre: pNom, reserva_cal_id: cId, opciones_propuestas: opciones, reserva_fecha_texto: opciones.length === 1 ? opciones[0].fechaTexto : 'Varias opciones' };
            if (al.id_evento_reserva) { 
                await eliminarEventoSeguro(al); 
                updateData.id_evento_reserva = null; 
                updateData.calendario_evento_reserva = null; 
            }
            await updateDoc(doc(db, "alumnos", alumnoIdActual), updateData);
            await navigator.clipboard.writeText(finalTxt);
            alert("Texto copiado al portapapeles. Estado avanzado a Validación."); 
            document.getElementById('modal-agenda').close(); 
            cargarVista(estadoActualVista);
        } catch(e) {
            alert("❌ Operación cancelada.\n\n" + e.message);
        }
        setBotonCargando(target, false);
        return;
    }

    async function generarTextoConHistorial(idAlumno, plantillaKey, overrideFecha = null, overrideProfeId = null, overrideProfeNombre = null, overrideOpciones = null) {
        const al = (await getDoc(doc(db, "alumnos", idAlumno))).data(); let aliasP = ''; const targetProfeId = overrideProfeId || al.reserva_profe_id; const targetProfeNom = overrideProfeNombre || al.reserva_profe_nombre;
        if (targetProfeId) { const pDoc = await getDoc(doc(db, "profesores", targetProfeId)); if(pDoc.exists()) aliasP = pDoc.data().alias_transferencia||''; } else if (targetProfeNom) { const pQ = await getDocs(query(collection(db, "profesores"), where("nombre", "==", targetProfeNom))); if(!pQ.empty) aliasP = pQ.docs[0].data().alias_transferencia||''; }
        let histText = al.historial && al.historial.length > 0 ? [...al.historial].sort((a,b)=>a.id-b.id).map(h => `[${h.fecha}] ${h.texto}`).join('\n') : 'Sin registros previos.';
        let template = configApp[plantillaKey] || ''; template = template.replace(/\{historial\}/gi, histText).replace(/\{bloque_historial\}/gi, histText);
        const iS = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento; const dP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : '';
        const fAmiInicio = al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : '';
        
        let opc = overrideOpciones || al.opciones_propuestas || [];
        let opcionesStr = opc.length > 0 ? opc.map(o => `${o.letra || '-'}- ${o.fechaTexto}`).join('\n') : '';
        let fHora = overrideFecha || al.reserva_fecha_texto || '';
        if (opc.length > 1 && (fHora === 'Varias opciones' || !fHora)) {
            fHora = '\n' + opcionesStr;
        }

        const txt = reemplazarVariables(template, { 
            fecha_hora: fHora, opciones: opcionesStr,
            nombre: al.nombre, edad: al.edad||'-', instrumento: iS, suscripcion: al.tipo_suscripcion || '', descripcion: dP, 
            profe: targetProfeNom || '', valor: configApp.valor_clase || '', alias_profe: aliasP || '',
            grupo: al.grupo_asignado || '', 'fecha inicio clases': fAmiInicio, 'fecha_inicio_clases': fAmiInicio
        });
        return { al, txt };
    }

    if (target.classList.contains('btn-validado-profe-popup')) {
        const id = target.getAttribute('data-id'); const al = (await getDoc(doc(db, "alumnos", id))).data(); const container = document.getElementById('opciones-validadas-container'); container.innerHTML = '';
        if (al.opciones_propuestas && al.opciones_propuestas.length > 0) { al.opciones_propuestas.forEach((op, index) => { container.innerHTML += `<label style="display:block; margin-bottom:8px; cursor:pointer;"><input type="radio" name="opt-valida-profe" value='${JSON.stringify(op)}' ${index===0?'checked':''}> ${op.letra ? op.letra+'- ' : ''}${op.fechaTexto}</label>`; }); } else { if(!al.reserva_inicio) return alert("No hay fechas propuestas en este registro."); const op = { inicio: al.reserva_inicio, fin: al.reserva_fin, fechaTexto: al.reserva_fecha_texto, calId: al.reserva_cal_id, profeId: al.reserva_profe_id, profeNombre: al.reserva_profe_nombre }; container.innerHTML = `<label style="display:block; margin-bottom:8px; cursor:pointer;"><input type="radio" name="opt-valida-profe" value='${JSON.stringify(op)}' checked> ${op.fechaTexto}</label>`; }
        document.getElementById('validar-profe-alumno-id').value = id; document.getElementById('modal-validar-profe').showModal(); return;
    }

    if (target.id === 'btn-confirmar-validacion-profe') {
        const id = document.getElementById('validar-profe-alumno-id').value, selectedRadio = document.querySelector('input[name="opt-valida-profe"]:checked');
        if(!selectedRadio) return alert("Selecciona una opción.");
        const op = JSON.parse(selectedRadio.value), al = (await getDoc(doc(db, "alumnos", id))).data();
        setBotonCargando(target, true);
        try {
            al.reserva_profe_id = op.profeId; al.reserva_profe_nombre = op.profeNombre; al.reserva_cal_id = op.calId; al.reserva_fecha_texto = op.fechaTexto; al.reserva_inicio = op.inicio; al.reserva_fin = op.fin;
            
            const titulos = construirTitulosEvento(al, 'reserva', configApp); 
            const evRes = await crearEventoSeguro(al, titulos, op.inicio, op.fin);
            
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente validación por alumno", id_evento_reserva: evRes.id, calendario_evento_reserva: evRes.calendar, reserva_profe_id: op.profeId, reserva_profe_nombre: op.profeNombre, reserva_cal_id: op.calId, reserva_fecha_texto: op.fechaTexto, reserva_inicio: op.inicio, reserva_fin: op.fin, opciones_propuestas: null });
            
            const dataText = await generarTextoConHistorial(id, 'texto_alumno'); 
            await navigator.clipboard.writeText(dataText.txt);
            
            alert("Reserva en Calendar creada exitosamente.\n\nTexto de confirmación copiado."); 
            document.getElementById('modal-validar-profe').close(); 
            cargarVista(estadoActualVista);
        } catch(e) { 
            alert("❌ Operación cancelada.\n\n" + e.message); 
        } 
        setBotonCargando(target, false);
        return;
    }

    if (target.classList.contains('btn-confirmar-entrevista')) { 
        const id = target.getAttribute('data-id'); 
        try { 
            const al = (await getDoc(doc(db, "alumnos", id))).data(); 
            const descP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : ''; 
            const titulos = construirTitulosEvento(al, 'confirmado', configApp); 
            
            await actualizarEventoSeguro(al, titulos, descP); 
            
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda confirmada" }); 
            alert("¡Agenda Confirmada!"); 
            cargarVista(estadoActualVista); 
        } catch(e) { 
            alert("❌ Operación cancelada.\n\n" + e.message); 
        } 
        return; 
    }
    
    if (target.classList.contains('btn-reenviar-profe') || target.classList.contains('btn-enviar-conf-profe')) { 
        try { 
            const id = target.getAttribute('data-id'); 
            const al = (await getDoc(doc(db, "alumnos", id))).data();
            let key = 'texto_conf_profe';
            if (target.classList.contains('btn-reenviar-profe')) {
                key = (al.opciones_propuestas && al.opciones_propuestas.length > 1) ? 'texto_opciones_multiples' : 'texto_profe';
            }
            const data = await generarTextoConHistorial(id, key); 
            await navigator.clipboard.writeText(data.txt); 
            alert("Texto copiado al portapapeles."); 
        } catch(e) {} 
        return; 
    }
    
    if (target.classList.contains('btn-reenviar-alumno') || target.classList.contains('btn-enviar-conf-alumno')) { try { const id = target.getAttribute('data-id'); const key = target.classList.contains('btn-reenviar-alumno') ? 'texto_alumno' : 'texto_conf_alumno'; const data = await generarTextoConHistorial(id, key); await navigator.clipboard.writeText(data.txt); alert("Texto copiado al portapapeles."); } catch(e) {} return; }
    if (target.classList.contains('btn-reenviar-prealta')) { try { const id = target.getAttribute('data-id'); const data = await generarTextoConHistorial(id, 'texto_prealta'); await navigator.clipboard.writeText(data.txt); alert("Texto copiado al portapapeles."); } catch(e) {} return; }
    if (target.classList.contains('btn-reenviar-alta')) { try { const id = target.getAttribute('data-id'); const data = await generarTextoConHistorial(id, 'texto_alta_confirmada'); await navigator.clipboard.writeText(data.txt); alert("Texto copiado al portapapeles."); } catch(e) {} return; }

    if (target.classList.contains('btn-cancelar-reserva')) {
        const motivo = prompt("¿Estás seguro de cancelar? Se eliminará la reserva en Calendar.\nPor favor, ingresa el motivo de la cancelación para el historial:");
        if (motivo !== null) {
            if (motivo.trim() === "") return alert("Operación abortada. Debes ingresar un motivo para cancelar.");
            const id = target.getAttribute('data-id'); 
            try { 
                const alDoc = await getDoc(doc(db, "alumnos", id));
                const alData = alDoc.data();
                
                if (alData.id_evento_reserva) await eliminarEventoSeguro(alData); 
                
                const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
                const hist = alData.historial || [];
                hist.push({ id: Date.now(), texto: `Reserva cancelada. Motivo: ${motivo.trim()}`, fecha: fechaStr });
                
                const data = await generarTextoConHistorial(id, 'texto_cancela_alumno');
                if (data.al.estado_agenda === 'Pendiente validación por alumno' || data.al.estado_agenda === 'Agenda confirmada') { 
                    await navigator.clipboard.writeText(data.txt); 
                    alert("Reserva cancelada en Calendar. Texto de CANCELACIÓN copiado al portapapeles."); 
                }
                 
                await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente procesar", reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, opciones_propuestas: null, historial: hist }); 
                cargarVista(estadoActualVista); 
            } catch(e) { 
                alert("❌ Operación cancelada.\n\n" + e.message); 
            } 
        } return;
    }

    if (target.classList.contains('btn-abrir-suspender')) { document.getElementById('susp-alumno-id').value = target.getAttribute('data-id'); document.getElementById('susp-motivo').value = ""; document.getElementById('modal-suspender').showModal(); return; }
    if (target.classList.contains('btn-recuperar-agenda')) { await updateDoc(doc(db, "alumnos", target.getAttribute('data-id')), { estado_agenda: "Pendiente procesar", motivo_suspension: null }); cargarVista(estadoActualVista); return; }
    if (target.classList.contains('btn-cerrar-modal')) { document.getElementById(target.getAttribute('data-modal')).close(); return; }
    
    if (target.id === 'btn-nuevo-alumno') { 
        const wrap = document.getElementById('form-alumno-wrapper'); 
        document.getElementById('modal-alta-alumno').appendChild(wrap); 
        wrap.style.display = 'block'; 
        document.getElementById('form-titulo').textContent = 'Nuevo Alumno'; 
        document.getElementById('alumno-id').value = ''; 
        document.getElementById('form-alumno').reset(); 
        quill.setContents([]); 
        historialActual = []; 
        renderHistorial(); 
        diasSemana.forEach(d => { document.getElementById(`disp-${d.id}-all`).checked=false; document.getElementById(`disp-${d.id}-none`).checked=false; document.getElementById(`estado-${d.id}`).textContent=""; }); 
        document.getElementById('chk-ingreso-directo').checked = false; 
        document.getElementById('container-ingreso-directo').style.display = 'flex'; 
        document.getElementById('bloque-info-alta').style.display = 'none'; 
        
        // Reset tabs to default
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const tabBtns = document.querySelectorAll('.tab-btn');
        if(tabBtns.length > 0) {
            tabBtns[0].classList.add('active');
            tabBtns[0].style.borderBottom = '2px solid #007bff';
            tabBtns[0].style.color = '#007bff';
        }
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        if(document.getElementById('tab-datos')) document.getElementById('tab-datos').style.display = 'block';

        await cargarSelectsAlumnos(); 
        document.getElementById('modal-alta-alumno').showModal(); 
        return; 
    }
    if (target.id === 'btn-cerrar-alumno') { const wrap = document.getElementById('form-alumno-wrapper'); wrap.style.display = 'none'; document.body.appendChild(wrap); document.getElementById('modal-alta-alumno').close(); return; }
});

document.addEventListener('mouseover', (e) => {
    const actionsDiv = e.target.closest('.alumno-actions');
    if (actionsDiv) {
        const wrapper = actionsDiv.querySelector('.dropdown-menu-wrapper');
        if (wrapper) {
            const actionRect = actionsDiv.getBoundingClientRect(), column = actionsDiv.closest('.board-column') || document.body, columnRect = column.getBoundingClientRect(), espacioAbajo = columnRect.bottom - actionRect.bottom;
            if (espacioAbajo < 250) { wrapper.style.top = 'auto'; wrapper.style.bottom = '100%'; wrapper.style.paddingTop = '0'; wrapper.style.paddingBottom = '10px'; } 
            else { wrapper.style.top = '100%'; wrapper.style.bottom = 'auto'; wrapper.style.paddingTop = '10px'; wrapper.style.paddingBottom = '0'; }
        }
    }
});

document.getElementById('btn-guardar-suspension').addEventListener('click', async (e) => { 
    const target = e.target;
    const id = document.getElementById('susp-alumno-id').value, mtv = document.getElementById('susp-motivo').value; if(!mtv) return alert("Seleccione motivo"); 
    setBotonCargando(target, true);
    try { 
        const al = (await getDoc(doc(db, "alumnos", id))).data(); 
        if (al.id_evento_reserva) await eliminarEventoSeguro(al); 
        
        const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`, hist = al.historial || [];
        hist.push({ id: Date.now(), texto: `Suspendido. Motivo: ${mtv}`, fecha: fechaStr });
        await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda suspendida", motivo_suspension: mtv, reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, historial: hist }); 
        document.getElementById('modal-suspender').close(); cargarVista(estadoActualVista); 
    } catch(err){
        alert("❌ Operación cancelada.\n\n" + err.message);
    } 
    setBotonCargando(target, false);
});

async function cargarSelectsAlumnos() { 
    const sI = document.getElementById('instrumento'), sS = document.getElementById('tipo_suscripcion'); 
    sI.innerHTML = ''; sS.innerHTML = '<option value="">Seleccione...</option>'; 
    const iS = await getDocs(collection(db, "instrumentos")); 
    iS.forEach(d => sI.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`); 
    const sSp = await getDocs(collection(db, "tipos_suscripcion")); 
    sSp.forEach(d => sS.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`); 
    
    setTimeout(() => { syncSelectToChips('instrumento', 'chips-instrumentos'); }, 100);
}

async function llenarFormularioAlumno(id) { 
    document.getElementById('alumno-id').value = id; 
    const d = (await getDoc(doc(db, "alumnos", id))).data(); 
    document.getElementById('nombre').value = d.nombre; 
    document.getElementById('celular').value = d.celular; 
    document.getElementById('edad').value = d.edad||''; 
    await cargarSelectsAlumnos(); 
    const sI = document.getElementById('instrumento'); Array.from(sI.options).forEach(o => o.selected = (d.instrumento||[]).includes(o.value)); 
    syncSelectToChips('instrumento', 'chips-instrumentos'); 
    document.getElementById('tipo_suscripcion').value = d.tipo_suscripcion; 
    quill.root.innerHTML = d.descripcion||''; 
    historialActual = d.historial || []; renderHistorial(); 
    
    if (d.estado_agenda.includes('alta') || d.estado_agenda.includes('Alta') || d.estado_agenda === 'Lista de espera') {
        document.getElementById('bloque-info-alta').style.display = 'block';
        document.getElementById('info-alta-profe').textContent = d.reserva_profe_nombre || '-';
        document.getElementById('info-alta-grupo').textContent = d.grupo_asignado || '-';
        document.getElementById('info-alta-inicio').textContent = d.fecha_inicio_clases ? formatearFechaAmi(d.fecha_inicio_clases) : '-';
    } else {
        document.getElementById('bloque-info-alta').style.display = 'none';
    }

    const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00'; 
    diasSemana.forEach(dia => { 
        const dD = d.disponibilidad[dia.id], tI = document.getElementById(`disp-${dia.id}-inicio`), tF = document.getElementById(`disp-${dia.id}-fin`), cA = document.getElementById(`disp-${dia.id}-all`), cN = document.getElementById(`disp-${dia.id}-none`), sE = document.getElementById(`estado-${dia.id}`); 
        tI.disabled=false; tF.disabled=false; cA.checked=false; cN.checked=false; sE.textContent=""; 
        if (!dD || dD.length===0) { cN.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Bloqueado"; sE.style.color="#dc3545"; } 
        else if (dD[0].inicio===hApe && dD[0].fin===hCie) { cA.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Libre"; sE.style.color="#28a745"; } 
        else { tI.value = dD[0].inicio; tF.value = dD[0].fin; } 
    }); 
    
    // Resetea pestañas
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabBtns = document.querySelectorAll('.tab-btn');
    if(tabBtns.length > 0) {
        tabBtns[0].classList.add('active');
        tabBtns[0].style.borderBottom = '2px solid #007bff';
        tabBtns[0].style.color = '#007bff';
    }
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    if(document.getElementById('tab-datos')) document.getElementById('tab-datos').style.display = 'block';
}

document.getElementById('form-alumno').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    setBotonCargando(btnSubmit, true);
    
    const disp = {}, hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00'; 
    diasSemana.forEach(d => { const cA = document.getElementById(`disp-${d.id}-all`).checked, cN = document.getElementById(`disp-${d.id}-none`).checked; let i = document.getElementById(`disp-${d.id}-inicio`).value, f = document.getElementById(`disp-${d.id}-fin`).value; if(cN) disp[d.id] = []; else if(cA) disp[d.id] = [{inicio:hApe, fin:hCie}]; else { if(i||f) disp[d.id] = [{inicio: i||hApe, fin: f||hCie}]; else disp[d.id] = []; } }); 
    const selInst = document.getElementById('instrumento'), instV = Array.from(selInst.selectedOptions).map(o=>o.value), data = { nombre: document.getElementById('nombre').value, celular: document.getElementById('celular').value, edad: Number(document.getElementById('edad').value), instrumento: instV, tipo_suscripcion: document.getElementById('tipo_suscripcion').value, descripcion: quill.root.innerHTML, disponibilidad: disp, historial: historialActual }; 
    try { 
        const id = document.getElementById('alumno-id').value; 
        if (id) { 
            await updateDoc(doc(db, "alumnos", id), data); 
        } else { 
            const esDirecto = document.getElementById('chk-ingreso-directo').checked;
            if (esDirecto) {
                data.estado_agenda = "Lista de espera";
                const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
                data.historial.push({ id: Date.now(), texto: "Ingreso directo a Lista de Espera. Se omitió proceso de entrevista.", fecha: fechaStr });
            } else {
                data.estado_agenda = "Pendiente procesar";
            }
            await addDoc(collection(db, "alumnos"), data); 
        } 
        const wrap = document.getElementById('form-alumno-wrapper'); wrap.style.display='none'; document.body.appendChild(wrap); document.getElementById('modal-alta-alumno').close(); cargarVista(estadoActualVista); 
    } catch(err) { 
        alert("Error al guardar."); 
    } 
    setBotonCargando(btnSubmit, false);
});

function renderConfig(cont) { 
    cont.innerHTML = `<div style="margin-bottom:25px; font-size:0.9em; color:#6c757d;"><span style="cursor:pointer; color:#007bff;" onclick="cargarVista('Configuración')">Configuración</span> &gt; <strong style="color:#212529;">Ajustes Generales</strong></div><div class="abm-container" style="max-width:800px; padding:30px; background:white; border-radius:8px; border:1px solid #dee2e6;"> <h3 style="margin-top:0; color:#212529; font-size:1.2em;">Límites y Reglas de Calendario</h3> <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"> <div style="flex:1; min-width:150px;"><label style="display:block; font-weight:600; color:#495057;">Hora de Apertura:<br><input type="time" id="cfg-apertura" value="${configApp.hora_apertura||'09:00'}"></label></div> <div style="flex:1; min-width:150px;"><label style="display:block; font-weight:600; color:#495057;">Hora de Cierre:<br><input type="time" id="cfg-cierre" value="${configApp.hora_cierre||'22:00'}"></label></div> </div> <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"> <div style="flex:1; min-width:150px;"><label style="display:block; font-weight:600; color:#495057;">Aulas totales:<br><input type="number" id="cfg-aulas" value="${configApp.cantidad_aulas}"></label></div> <div style="flex:1; min-width:150px;"><label style="display:block; font-weight:600; color:#495057;">Baterías totales:<br><input type="number" id="cfg-bats" value="${configApp.cantidad_baterias}"></label></div> </div> <h3 style="margin-top:0; color:#212529; font-size:1.2em; border-top:1px solid #dee2e6; padding-top:20px;">Calendario y Emojis</h3> <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;"> <div style="flex:1; min-width:250px;"><label style="display:block; font-weight:600; color:#495057;">Calendario Defecto:<br><input type="email" id="cfg-cal-defecto" value="${configApp.calendario_por_defecto||''}"></label></div> </div> <div style="display:flex; gap:10px; margin-bottom:25px; flex-wrap:wrap;"> <div style="width:80px;"><label style="display:block; font-weight:600; color:#495057;">Batería:<br><input type="text" id="cfg-idbat" value="${configApp.identificador_bateria||''}"></label></div> <div style="width:80px;"><label style="display:block; font-weight:600; color:#495057;">Guitarra:<br><input type="text" id="cfg-em-gui" value="${configApp.emoji_guitarra||'🎸'}"></label></div> <div style="width:80px;"><label style="display:block; font-weight:600; color:#495057;">Cajón:<br><input type="text" id="cfg-em-caj" value="${configApp.emoji_cajon||'📦'}"></label></div> <div style="width:80px;"><label style="display:block; font-weight:600; color:#495057;">Canto:<br><input type="text" id="cfg-em-can" value="${configApp.emoji_canto||'🎤'}"></label></div> <div style="width:80px;"><label style="display:block; font-weight:600; color:#495057;">Piano:<br><input type="text" id="cfg-em-pia" value="${configApp.emoji_piano||'🎹'}"></label></div> <div style="width:80px;"><label style="display:block; font-weight:600; color:#495057;">Bajo:<br><input type="text" id="cfg-em-baj" value="${configApp.emoji_bajo||'🎸'}"></label></div> </div> <h3 style="margin-top:0; color:#212529; font-size:1.2em; border-top:1px solid #dee2e6; padding-top:20px;">Mensajes y Textos</h3> <label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Valor de Clase (Monto): <input type="text" id="cfg-valor" value="${configApp.valor_clase}"></label> <label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Título Evento (Reserva): <input type="text" id="cfg-evt-res" value="${configApp.formato_evento_reserva}"></label> <label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Título Evento (Confirmado): <input type="text" id="cfg-evt-conf" value="${configApp.formato_evento_confirmado}"></label> <label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Nombre para Agendar (Portapapeles): <input type="text" id="cfg-nombre-agendar" value="${configApp.texto_nombre_agendar}"></label> <label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Texto Opciones Múltiples (Validar con Profe): <textarea id="cfg-txt-opt-mul" class="config-box" style="height:200px;">${configApp.texto_opciones_multiples}</textarea></label> <label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Texto 1 Sola Opción (Validar con Profe): <textarea id="cfg-txt-p" class="config-box" style="height:150px;">${configApp.texto_profe}</textarea></label> <label style="display:block; margin-bottom:15px; font-weight:600; color:#495057;">Texto Confirmación para Alumno (Validar con Alumno): <textarea id="cfg-txt-conf-a" class="config-box" style="height:150px;">${configApp.texto_conf_alumno}</textarea></label> <label style="display:block; margin-bottom:15px; font-weight:600; color:#dc3545;">Texto Cancelación de Alumno: <textarea id="cfg-txt-cancela" class="config-box" style="height:100px;">${configApp.texto_cancela_alumno}</textarea></label> <label style="display:block; margin-bottom:15px; font-weight:600; color:#6f42c1;">Texto Pre-Alta Iniciada: <textarea id="cfg-txt-prealta" class="config-box" style="height:150px;">${configApp.texto_prealta}</textarea></label> <label style="display:block; margin-bottom:20px; font-weight:600; color:#28a745;">Texto Nueva Alta Confirmada: <textarea id="cfg-txt-alta-conf" class="config-box" style="height:150px;">${configApp.texto_alta_confirmada}</textarea></label> <button id="btn-guardar-cfg" class="btn-accion-main" style="padding:10px 20px; font-size:1.05em; width:100%;">Guardar Configuración</button> </div>`; 
    document.getElementById('btn-guardar-cfg').addEventListener('click', async (e) => { setBotonCargando(e.target, true); await setDoc(doc(db, "configuracion", "general"), { hora_apertura: document.getElementById('cfg-apertura').value, hora_cierre: document.getElementById('cfg-cierre').value, cantidad_aulas: document.getElementById('cfg-aulas').value, cantidad_baterias: document.getElementById('cfg-bats').value, identificador_bateria: document.getElementById('cfg-idbat').value, emoji_guitarra: document.getElementById('cfg-em-gui').value, emoji_cajon: document.getElementById('cfg-em-caj').value, emoji_canto: document.getElementById('cfg-em-can').value, emoji_piano: document.getElementById('cfg-em-pia').value, emoji_bajo: document.getElementById('cfg-em-baj').value, calendario_por_defecto: document.getElementById('cfg-cal-defecto').value, valor_clase: document.getElementById('cfg-valor').value, formato_evento_reserva: document.getElementById('cfg-evt-res').value, formato_evento_confirmado: document.getElementById('cfg-evt-conf').value, texto_nombre_agendar: document.getElementById('cfg-nombre-agendar').value, texto_opciones_multiples: document.getElementById('cfg-txt-opt-mul').value, texto_profe: document.getElementById('cfg-txt-p').value, texto_alumno: document.getElementById('cfg-txt-a').value, texto_conf_profe: document.getElementById('cfg-txt-conf-p').value, texto_conf_alumno: document.getElementById('cfg-txt-conf-a').value, texto_cancela_alumno: document.getElementById('cfg-txt-cancela').value, texto_prealta: document.getElementById('cfg-txt-prealta').value, texto_alta_confirmada: document.getElementById('cfg-txt-alta-conf').value }, { merge: true }); await cargarConfig(); setBotonCargando(e.target, false); alert('Guardado.'); }); 
}

function cargarABM(coleccion, titulo, cont) { 
    window.tituloABMActual = titulo; 
    getDocs(collection(db, coleccion)).then(qS => { 
        let placeholderTxt = coleccion === 'usuarios_sistema' ? 'Ej: usuario@gmail.com' : 'Ej: Guitarra';
        let labelTxt = coleccion === 'usuarios_sistema' ? 'Correo (Gmail)' : 'Nombre';
        let h = `<div style="width:100%; margin-bottom:15px; font-size:0.9em; color:#6c757d;"><span style="cursor:pointer; color:#007bff;" onclick="cargarVista('Configuración')">Configuración</span> &gt; <strong style="color:#212529;">${titulo}</strong></div> <div class="abm-container" style="display:flex; gap:15px; align-items:flex-end; flex-wrap:wrap; padding:25px; background:white; border-radius:8px; border:1px solid #dee2e6;"><div style="flex-grow:1; min-width:180px;"><label style="font-weight:600; font-size:0.9em; color:#495057;">${labelTxt}</label><input type="text" id="input-nuevo-abm" placeholder="${placeholderTxt}"></div>`; 
        if(coleccion === 'profesores') { h += `<div style="flex-grow:1; min-width:200px;"><label style="font-weight:600; font-size:0.9em; color:#495057;">Email Calendar</label><input type="email" id="input-correo-abm" placeholder="ejemplo@calendar..."></div><div style="flex-grow:1; min-width:150px;"><label style="font-weight:600; font-size:0.9em; color:#495057;">Celular (Para guardar)</label><input type="text" id="input-celular-abm" placeholder="Ej: 54911..."></div><div style="flex-grow:1; min-width:150px;"><label style="font-weight:600; font-size:0.9em; color:#495057;">Alias Transferencia</label><input type="text" id="input-alias-abm" placeholder="alias.mp"></div><div style="padding-bottom:10px;"><label style="white-space:nowrap; cursor:pointer; font-weight:600; color:#212529;"><input type="checkbox" id="input-entrevista-abm" checked> Entrevistas</label></div>`; } 
        h += `<button id="btn-guardar-abm" class="btn-accion-main" style="height:40px; min-width:120px;">+ Agregar</button></div>`; 
        qS.forEach(d => { 
            const dt = d.data(); 
            let displayNom = dt.nombre || dt.email;
            let ex = coleccion==='profesores' ? ` <br><small style="color:#6c757d;">${dt.correo_calendario}</small> <span class="badge ${dt.entrevista?'badge-success':'badge-danger'}" style="margin-left:10px;">${dt.entrevista?'SÍ':'NO'} Entrevistas</span>` : ''; 
            h += `<div class="abm-item" onclick="window.abrirEdicionABM('${d.id}', '${coleccion}', '${displayNom}', '${dt.correo_calendario||''}', '${dt.celular||''}', '${dt.alias_transferencia||''}', ${!!dt.entrevista})"><span style="font-weight:600; color:#212529; font-size:1.05em;">${displayNom}${ex}</span><button class="btn-suspender" onclick="event.stopPropagation(); window.eliminarABM('${d.id}', '${coleccion}')" style="padding:6px 10px; border:none; font-size:1.2em; background:transparent;" title="Eliminar">❌</button></div>`; 
        }); 
        cont.innerHTML = h; 
        document.getElementById('btn-guardar-abm').addEventListener('click', async () => { 
            const n = document.getElementById('input-nuevo-abm').value.trim(); 
            if(!n) return; 
            const dO = coleccion === 'usuarios_sistema' ? { email: n.toLowerCase() } : { nombre: n }; 
            if(coleccion==='profesores'){ dO.correo_calendario=document.getElementById('input-correo-abm').value.trim(); dO.celular=document.getElementById('input-celular-abm').value.trim(); dO.alias_transferencia=document.getElementById('input-alias-abm').value.trim(); dO.entrevista=document.getElementById('input-entrevista-abm').checked; const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00', dispAllDay = [ { inicio: hApe, fin: hCie } ]; dO.disponibilidad = { 'L': dispAllDay, 'M': dispAllDay, 'X': dispAllDay, 'J': dispAllDay, 'V': dispAllDay, 'S': dispAllDay }; } 
            await addDoc(collection(db, coleccion), dO); 
            cargarABM(coleccion, titulo, cont); 
        }); 
    }); 
}

window.abrirEdicionABM = async function(id, col, nom, cor, cel, ali, ent) { 
    document.getElementById('abm-edit-id').value = id; 
    document.getElementById('abm-edit-coleccion').value = col; 
    document.getElementById('abm-edit-nombre').value = nom; 
    document.getElementById('label-abm-edit-nombre').innerHTML = col === 'usuarios_sistema' ? `Correo (Gmail): <input type="text" id="abm-edit-nombre" required style="width:100%;">` : `Nombre: <input type="text" id="abm-edit-nombre" required style="width:100%;">`;
    document.getElementById('abm-edit-nombre').value = nom;
    
    if(col==='profesores') { document.getElementById('div-abm-edit-profe').style.display='block'; document.getElementById('abm-edit-correo').value=cor; document.getElementById('abm-edit-celular').value=cel; document.getElementById('abm-edit-alias').value=ali; document.getElementById('abm-edit-entrevista').checked=ent; try { const pr = (await getDoc(doc(db, col, id))).data(); const hApe = configApp.hora_apertura || '09:00'; const hCie = configApp.hora_cierre || '22:00'; diasSemana.forEach(dia => { const dD = pr.disponibilidad ? pr.disponibilidad[dia.id] : []; const tI = document.getElementById(`disp-p-${dia.id}-inicio`), tF = document.getElementById(`disp-p-${dia.id}-fin`), cA = document.getElementById(`disp-p-${dia.id}-all`), cN = document.getElementById(`disp-p-${dia.id}-none`), sE = document.getElementById(`estado-p-${dia.id}`); tI.disabled=false; tF.disabled=false; cA.checked=false; cN.checked=false; sE.textContent=""; if (!dD || dD.length===0) { cN.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Bloqueado"; sE.style.color="#dc3545"; } else if (dD[0].inicio===hApe && dD[0].fin===hCie) { cA.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Libre"; sE.style.color="#28a745"; } else { tI.value = dD[0].inicio; tF.value = dD[0].fin; } }); } catch(e) {} } else document.getElementById('div-abm-edit-profe').style.display='none'; document.getElementById('modal-abm-edit').showModal(); 
}

window.eliminarABM = async function(id, col) { if(confirm("¿Eliminar?")) { await deleteDoc(doc(db, col, id)); document.querySelector(`[data-vista="ABM-${window.tituloABMActual}"]`).click(); } }

document.getElementById('btn-guardar-abm-edit').addEventListener('click', async (e) => { 
    setBotonCargando(e.target, true);
    const id = document.getElementById('abm-edit-id').value, col = document.getElementById('abm-edit-coleccion').value;
    const nombreInput = document.getElementById('abm-edit-nombre').value;
    const dO = col === 'usuarios_sistema' ? { email: nombreInput.toLowerCase() } : { nombre: nombreInput };
    if(col==='profesores') { dO.correo_calendario=document.getElementById('abm-edit-correo').value; dO.celular=document.getElementById('abm-edit-celular').value; dO.alias_transferencia=document.getElementById('abm-edit-alias').value; dO.entrevista=document.getElementById('abm-edit-entrevista').checked; const disp = {}; const hApe = configApp.hora_apertura || '09:00'; const hCie = configApp.hora_cierre || '22:00'; diasSemana.forEach(d => { const cA = document.getElementById(`disp-p-${d.id}-all`).checked, cN = document.getElementById(`disp-p-${d.id}-none`).checked; let i = document.getElementById(`disp-p-${d.id}-inicio`).value, f = document.getElementById(`disp-p-${d.id}-fin`).value; if(cN) disp[d.id] = []; else if(cA) disp[d.id] = [{inicio:hApe, fin:hCie}]; else { if(i||f) disp[d.id] = [{inicio: i||hApe, fin: f||hCie}]; else disp[d.id] = []; } }); dO.disponibilidad = disp; } 
    await updateDoc(doc(db, col, id), dO); 
    document.getElementById('modal-abm-edit').close(); 
    document.querySelector(`[data-vista="ABM-${window.tituloABMActual}"]`).click(); 
    setBotonCargando(e.target, false);
});

// EVENTO DE NAVEGACIÓN (Oculta el menú lateral y el velo oscuro)
document.querySelectorAll('#sidebar .nav-item').forEach(item => { 
    item.addEventListener('click', (e) => { 
        document.querySelectorAll('#sidebar .nav-item').forEach(el => el.classList.remove('active')); 
        e.target.closest('.nav-item').classList.add('active'); 
        cargarVista(e.target.closest('.nav-item').getAttribute('data-vista')); 
        
        document.getElementById('sidebar').classList.remove('active'); 
        
        const overlay = document.getElementById('mobile-overlay');
        if (overlay) overlay.style.display = 'none';
    }); 
});

window.cargarVista = cargarVista;
