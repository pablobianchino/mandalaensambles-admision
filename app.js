import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, updateDoc, deleteDoc, doc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// === VERSIONADO DE LA APLICACIÓN ===
const APP_VERSION = "v2.0";

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

// ESTADO DE FILTROS Y AGRUPADORES
let agrupadorActual = 'ninguno';
let filtroChipActual = 'Todos';

const selAgrupador = document.getElementById('select-agrupador');
if(selAgrupador) {
    selAgrupador.addEventListener('change', (e) => {
        agrupadorActual = e.target.value;
        cargarVista(estadoActualVista);
    });
}

function renderFiltrosChips() {
    const cont = document.getElementById('filtros-chips');
    if (!cont) return;
    const instrumentos = ['Todos', 'Canto', 'Guitarra', 'Bajo', 'Batería', 'Piano', 'Cajón'];
    cont.innerHTML = instrumentos.map(inst => 
        `<button class="filter-chip ${filtroChipActual === inst ? 'active' : ''}" data-val="${inst}">${inst}</button>`
    ).join('');

    cont.querySelectorAll('.filter-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            filtroChipActual = e.target.getAttribute('data-val');
            renderFiltrosChips();
            cargarVista(estadoActualVista);
        });
    });
}

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
        chip.style.border = '1px solid var(--border-color)';
        chip.style.borderRadius = '20px';
        chip.style.cursor = 'pointer';
        chip.style.fontSize = '13px';
        chip.style.fontWeight = '600';
        chip.style.transition = 'all 0.2s ease';
        chip.style.userSelect = 'none';
        
        const updateChipStyle = () => {
            if(opt.selected) {
                chip.style.background = 'var(--accent-teal)';
                chip.style.color = 'white';
                chip.style.borderColor = 'var(--accent-teal)';
            } else {
                chip.style.background = 'white';
                chip.style.color = 'var(--text-muted)';
                chip.style.borderColor = 'var(--border-color)';
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
    const dlg = document.createElement('dialog'); dlg.id = 'modal-nota-rapida'; dlg.className = 'modern-modal'; dlg.style.width = '90%'; dlg.style.maxWidth = '400px'; dlg.style.padding = '24px';
    dlg.innerHTML = `<h3 style="margin:0 0 15px 0; color:var(--text-main);">Agregar Nota</h3><input type="hidden" id="nota-rapida-id"><textarea id="nota-rapida-texto" rows="3" class="modern-input" placeholder="Escribe el registro de contacto..."></textarea><div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;"><button type="button" class="btn-cerrar-modal" data-modal="modal-nota-rapida" style="padding:10px 16px; border:1px solid var(--border-color); border-radius:8px; cursor:pointer; background:#fff; font-weight:600; color:var(--text-muted);">Cancelar</button><button id="btn-guardar-nota-rapida" class="btn-primary">Guardar</button></div>`;
    document.body.appendChild(dlg);
}

const quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
const diasSemana = [{ id:'L',nombre:'Lunes'}, {id:'M',nombre:'Martes'}, {id:'X',nombre:'Miércoles'}, {id:'J',nombre:'Jueves'}, {id:'V',nombre:'Viernes'}, {id:'S',nombre:'Sábado'}];
const contDisp = document.getElementById('contenedor-disponibilidad'), contDispProfe = document.getElementById('contenedor-disponibilidad-profe');

diasSemana.forEach(dia => {
    contDisp.innerHTML += `<div class="dia-disponibilidad"><label style="margin:0;">${dia.nombre}:</label><input type="time" id="disp-${dia.id}-inicio" class="modern-input" style="width:auto; padding:6px 10px;"> <span>a</span> <input type="time" id="disp-${dia.id}-fin" class="modern-input" style="width:auto; padding:6px 10px;"><label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer; text-transform:none;"><input type="checkbox" id="disp-${dia.id}-all"> Todo el día</label><label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer; text-transform:none;"><input type="checkbox" id="disp-${dia.id}-none"> No disp.</label><button type="button" class="btn-copy-disp" data-dia="${dia.id}" style="background:none; border:none; cursor:pointer; font-size:1.1em; margin-left:auto;">📋</button><button type="button" class="btn-paste-disp" data-dia="${dia.id}" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📥</button><span id="estado-${dia.id}" class="estado-disp" style="width:80px; text-align:right;"></span></div>`;
    if(contDispProfe) {
        contDispProfe.innerHTML += `<div class="dia-disponibilidad"><label style="margin:0;">${dia.nombre}:</label><input type="time" id="disp-p-${dia.id}-inicio" class="modern-input" style="width:auto; padding:6px 10px;"> <span>a</span> <input type="time" id="disp-p-${dia.id}-fin" class="modern-input" style="width:auto; padding:6px 10px;"><label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer; text-transform:none;"><input type="checkbox" id="disp-p-${dia.id}-all"> Todo el día</label><label style="font-weight:normal; width:auto; margin-left:10px; cursor:pointer; text-transform:none;"><input type="checkbox" id="disp-p-${dia.id}-none"> No disp.</label><button type="button" class="btn-copy-disp-p" data-dia="${dia.id}" style="background:none; border:none; cursor:pointer; font-size:1.1em; margin-left:auto;">📋</button><button type="button" class="btn-paste-disp-p" data-dia="${dia.id}" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📥</button><span id="estado-p-${dia.id}" class="estado-disp" style="width:80px; text-align:right;"></span></div>`;
    }
});

window.updateDispStateForDay = function(dId, isProfe = false) {
    const prefix = isProfe ? 'disp-p-' : 'disp-', estadoPrefix = isProfe ? 'estado-p-' : 'estado-';
    const chkAll = document.getElementById(`${prefix}${dId}-all`), chkNone = document.getElementById(`${prefix}${dId}-none`);
    const tIni = document.getElementById(`${prefix}${dId}-inicio`), tFin = document.getElementById(`${prefix}${dId}-fin`), spanE = document.getElementById(`${estadoPrefix}${dId}`);
    if(!chkAll) return;
    if (chkAll.checked) { chkNone.checked = false; tIni.disabled = tFin.disabled = true; tIni.value = tFin.value = ''; spanE.textContent = "Libre"; spanE.style.color = "var(--accent-teal)"; } 
    else if (chkNone.checked) { chkAll.checked = false; tIni.disabled = tFin.disabled = true; tIni.value = tFin.value = ''; spanE.textContent = "Bloqueado"; spanE.style.color = "var(--accent-red)"; } 
    else { tIni.disabled = tFin.disabled = false; spanE.textContent = ""; }
}

diasSemana.forEach(dia => {
    document.getElementById(`disp-${dia.id}-all`)?.addEventListener('change', () => window.updateDispStateForDay(dia.id, false));
    document.getElementById(`disp-${dia.id}-none`)?.addEventListener('change', () => window.updateDispStateForDay(dia.id, false));
    document.getElementById(`disp-p-${dia.id}-all`)?.addEventListener('change', () => window.updateDispStateForDay(dia.id, true));
    document.getElementById(`disp-p-${dia.id}-none`)?.addEventListener('change', () => window.updateDispStateForDay(dia.id, true));
});

// NAVEGACIÓN PESTAÑAS
document.addEventListener('click', (e) => {
    if(e.target.classList.contains('tab-btn')) {
        e.preventDefault();
        const modal = e.target.closest('dialog');
        modal.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); });
        e.target.classList.add('active');
        modal.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        const targetId = e.target.getAttribute('data-target');
        if(document.getElementById(targetId)) document.getElementById(targetId).style.display = 'block';
    }
});

function renderHistorial() {
    const container = document.getElementById('lista-historial'); container.innerHTML = '';
    if(historialActual.length === 0) { container.innerHTML = '<p style="color:var(--text-muted); font-size:13px; margin:0;">No hay registros en el historial.</p>'; return; }
    const sorted = [...historialActual].sort((a,b) => b.id - a.id);
    sorted.forEach(nota => {
        const textoLimpio = nota.texto.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
        container.innerHTML += `<div style="background:var(--hover-bg); border:1px solid var(--border-color); padding:12px; border-radius:8px; position:relative;"><div style="font-size:11px; color:var(--text-muted); margin-bottom:5px; font-weight:600;">🕒 ${nota.fecha}</div><div style="font-size:13px; color:var(--text-main);">${textoLimpio}</div><div style="position:absolute; top:10px; right:10px; display:flex; gap:5px;"><button type="button" class="btn-editar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.1em;">✏️</button><button type="button" class="btn-eliminar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.1em;">❌</button></div></div>`;
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

async function fetchCalendarAPI(action, payload) {
    payload.action = action; payload.apiKey = "mandala-seg-2026";
    let res;
    try { res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); } 
    catch (networkError) { throw new Error("Falla de red al conectar con Google Apps Script. Revise su conexión."); }
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

async function crearEventoSeguro(al, titulos, inicio, fin) {
    let fallbackCalId = configApp.calendario_por_defecto, primaryCalId = await getCalendarIdParaAlumno(al), errorDetalle = "";
    if (primaryCalId) { try { let tituloUsar = (primaryCalId === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe; let ev = await crearEventoCalendario(primaryCalId, tituloUsar, inicio, fin); return { id: ev.id, calendar: primaryCalId }; } catch(e) { errorDetalle += `Fallo primario (${primaryCalId}): ${e.message}. `; } }
    if (fallbackCalId && fallbackCalId !== primaryCalId) { try { let ev = await crearEventoCalendario(fallbackCalId, titulos.tituloDefecto, inicio, fin); return { id: ev.id, calendar: fallbackCalId }; } catch(e) { errorDetalle += `Fallo fallback (${fallbackCalId}): ${e.message}.`; } }
    throw new Error("No se pudo crear el evento en el calendario.\n" + errorDetalle);
}

async function actualizarEventoSeguro(al, titulos, desc) {
    if (!al.id_evento_reserva) throw new Error("El alumno no tiene un evento en calendario para actualizar.");
    let calGrabado = al.calendario_evento_reserva, primaryCalId = await getCalendarIdParaAlumno(al), fallbackCalId = configApp.calendario_por_defecto, candidatos = [];
    if (calGrabado) candidatos.push(calGrabado); if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId); if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);
    let lastError = "";
    for (let cal of candidatos) { try { let tituloUsar = (cal === fallbackCalId) ? titulos.tituloDefecto : titulos.tituloProfe; await actualizarEventoCalendario(cal, al.id_evento_reserva, tituloUsar, desc); return cal; } catch(e) { lastError = e.message; } }
    throw new Error("Google Calendar rechazó la actualización.\nDetalle: " + lastError);
}

async function eliminarEventoSeguro(al) {
    if (!al.id_evento_reserva) return;
    let calGrabado = al.calendario_evento_reserva, primaryCalId = await getCalendarIdParaAlumno(al), fallbackCalId = configApp.calendario_por_defecto, candidatos = [];
    if (calGrabado) candidatos.push(calGrabado); if (primaryCalId && !candidatos.includes(primaryCalId)) candidatos.push(primaryCalId); if (fallbackCalId && !candidatos.includes(fallbackCalId)) candidatos.push(fallbackCalId);
    let lastError = "";
    for (let cal of candidatos) { try { await eliminarEventoCalendario(cal, al.id_evento_reserva); return; } catch(e) { lastError = e.message; } }
    throw new Error("Google Calendar rechazó la cancelación.\nDetalle: " + lastError);
}

function chequearDisponibilidadExacta(inicioTestMs, finTestMs, eventosAPI, cantAulas, cantBat, esBateria, cfgEmoji) {
    let picosAulas = 0; let picosBateria = 0; let profesOcupados = new Set();
    const eventosCruzados = eventosAPI.filter(ev => { if (!ev.start || !ev.start.dateTime) return false; const evS = new Date(ev.start.dateTime).getTime() + 60000; const evE = new Date(ev.end.dateTime).getTime() - 60000; return (inicioTestMs < evE && finTestMs > evS); });
    if (eventosCruzados.length === 0) return { valido: true, profesOcupados: new Set() };
    const puntosDeTiempo = new Set([inicioTestMs, finTestMs]);
    eventosCruzados.forEach(ev => { const i = new Date(ev.start.dateTime).getTime(), f = new Date(ev.end.dateTime).getTime(); if (i > inicioTestMs && i < finTestMs) puntosDeTiempo.add(i); if (f > inicioTestMs && f < finTestMs) puntosDeTiempo.add(f); });
    const arrayPuntos = Array.from(puntosDeTiempo).sort((a,b) => a-b);
    for (let i = 0; i < arrayPuntos.length - 1; i++) {
        const puntoMedioMs = arrayPuntos[i] + 1000; let simultaneosAulas = 0; let simultaneosBat = 0;
        eventosCruzados.forEach(ev => { const evS = new Date(ev.start.dateTime).getTime(), evE = new Date(ev.end.dateTime).getTime(); if (puntoMedioMs >= evS && puntoMedioMs < evE) { simultaneosAulas++; profesOcupados.add(ev.profeId); if (ev.summary && ev.summary.toLowerCase().includes((cfgEmoji||'').toLowerCase())) simultaneosBat++; } });
        if (simultaneosAulas > picosAulas) picosAulas = simultaneosAulas; if (simultaneosBat > picosBateria) picosBateria = simultaneosBat;
    }
    return { valido: (picosAulas < cantAulas) && (esBateria ? picosBateria < cantBat : true), profesOcupados };
}

function chequearProfeDisponible(pr, hIniB, finMs, lDia) {
    if (!pr.disponibilidad || !pr.disponibilidad[lDia] || pr.disponibilidad[lDia].length === 0) return false; 
    const slotStartMins = hIniB.getHours() * 60 + hIniB.getMinutes(); 
    let endH = new Date(finMs).getHours(), endM = new Date(finMs).getMinutes(); if (endH === 0 && endM === 0) endH = 24;
    const slotEndMins = endH * 60 + endM; let disponible = false;
    pr.disponibilidad[lDia].forEach(rango => { const pStartMins = parseInt(rango.inicio.split(':')[0])*60 + parseInt(rango.inicio.split(':')[1]), pEndMins = parseInt(rango.fin.split(':')[0])*60 + parseInt(rango.fin.split(':')[1]); if (slotStartMins >= pStartMins && slotEndMins <= pEndMins) { disponible = true; } });
    return disponible;
}

function generarOpcionesAgenda(dispAl, eventosAPI, esBateria, todosLosProfes, profesFiltradosIDs, dStart, dEnd, cfg) {
    const opciones = [], mapaDias = { 0:"D", 1:"L", 2:"M", 3:"X", 4:"J", 5:"V", 6:"S" }, durMs = 60*60*1000, slotPasoMs = 30*60*1000, cantAulas = parseInt(cfg.cantidad_aulas)||3, cantBat = parseInt(cfg.cantidad_baterias)||2, diffDays = Math.floor(Math.abs(dEnd - dStart) / (1000*60*60*24));
    for (let i = 0; i <= diffDays; i++) {
        const fEval = new Date(dStart); fEval.setDate(fEval.getDate() + i); const lDia = mapaDias[fEval.getDay()];
        if (dispAl[lDia] && dispAl[lDia].length > 0) {
            dispAl[lDia].forEach(rango => {
                if (!rango.inicio || !rango.fin) return;
                const hIniB = new Date(fEval); hIniB.setHours(parseInt(rango.inicio.split(':')[0]), parseInt(rango.inicio.split(':')[1]), 0, 0); const hFinR = new Date(fEval); hFinR.setHours(parseInt(rango.fin.split(':')[0]), parseInt(rango.fin.split(':')[1]), 0, 0);
                if (hIniB < new Date()) { let curr = new Date(); curr.setMinutes(curr.getMinutes() + (30 - (curr.getMinutes() % 30)), 0, 0); hIniB.setTime(curr.getTime()); }
                while (hIniB.getTime() + durMs <= hFinR.getTime()) {
                    const inMs = hIniB.getTime(), finMs = inMs + durMs, evalOverlap = chequearDisponibilidadExacta(inMs, finMs, eventosAPI, cantAulas, cantBat, esBateria, cfg.identificador_bateria);
                    if (evalOverlap.valido) {
                        todosLosProfes.forEach(pr => {
                            if (profesFiltradosIDs.includes(pr.id) && !evalOverlap.profesOcupados.has(pr.id)) {
                                if (chequearProfeDisponible(pr, hIniB, finMs, lDia)) {
                                    let pegado = false; const profeEvents = eventosAPI.filter(e => e.profeId === pr.id);
                                    profeEvents.forEach(ev => { if(!ev.start || !ev.start.dateTime) return; const evS = new Date(ev.start.dateTime).getTime(), evE = new Date(ev.end.dateTime).getTime(); if (Math.abs(evE - inMs) <= 60000 || Math.abs(evS - finMs) <= 60000) pegado = true; });
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

function generarBotonesAccion(al, id) {
    let accionesHtml = '';
    const chkLabels = [ "¿Se enviaron los mensajes de bienvenida al alumnos?", "¿Se informó al profe de la nueva alta?", "¿Se actualizó la base de datos con la nueva alta?", "¿Se cargó el pago en el sistema de contabilidad?", "¿Se agregó al alumno al grupo de la comunidad Mandala Ensambles?" ];

    if (al.estado_agenda === 'Pendiente procesar') { accionesHtml += `<button type="button" class="dropdown-item btn-buscar-agenda" data-id="${id}">🔍 Buscar Agenda</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`; } 
    else if (al.estado_agenda === 'Pendiente validación por profe') {
        accionesHtml += `<button type="button" class="dropdown-item btn-validado-profe-popup" data-id="${id}">✅ Validado por Profesor</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-reenviar-profe" data-id="${id}">📤 Re-enviar a Profe</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-cancelar-reserva" data-id="${id}">❌ Cancelar Validación</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`; 
    } 
    else if (al.estado_agenda === 'Pendiente validación por alumno') {
        accionesHtml += `<button type="button" class="dropdown-item btn-confirmar-entrevista" data-id="${id}">✅ Confirmar Agenda</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-reenviar-alumno" data-id="${id}">📤 Re-Enviar a Alumno</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-cancelar-reserva" data-id="${id}">❌ Cancelar Agenda</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`; 
    }
    else if (al.estado_agenda === 'Agenda confirmada') {
        accionesHtml += `<button type="button" class="dropdown-item btn-admision-finalizada" data-id="${id}">🏁 Admisión Finalizada</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-enviar-conf-profe" data-id="${id}">📤 Re-Enviar conf. a Profe</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-enviar-conf-alumno" data-id="${id}">📤 Re-Enviar conf. a Alumno</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-cancelar-reserva" data-id="${id}">↩️ Cancelar Confirmación</button>`;
    }
    else if (al.estado_agenda === 'Agenda suspendida') {
        accionesHtml += `<button type="button" class="dropdown-item btn-recuperar-agenda" data-id="${id}">♻️ Recuperar Agenda</button>`;
    }
    else if (al.estado_agenda === 'Lista de espera') {
        // En etapa 4 cambiaremos esto para agrupar, por ahora mantenemos el flujo directo
    }
    else if (al.estado_agenda === 'Pre-alta Pendiente') {
        accionesHtml += `<button type="button" class="dropdown-item btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
    }
    else if (al.estado_agenda === 'Pre-alta Iniciada') {
        accionesHtml += `<button type="button" class="dropdown-item btn-abrir-confirmar-alta" data-id="${id}">✅ Confirmar Alta</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-reenviar-prealta" data-id="${id}">📤 Copiar texto Pre-Alta</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Pre-Alta</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-suspender-alta" data-id="${id}">❌ Suspender Alta</button>`;
    }
    else if (al.estado_agenda === 'Alta Efectiva' || al.estado_agenda === 'Alta Ilegal') {
        accionesHtml += `<button type="button" class="dropdown-item btn-reenviar-alta" data-id="${id}">📤 Copiar texto Alta Conf.</button>`; accionesHtml += `<button type="button" class="dropdown-item btn-suspender-alta" data-id="${id}">❌ Suspender Alta</button>`;
    }
    else if (al.estado_agenda === 'Alta Suspendida') {
        accionesHtml += `<button type="button" class="dropdown-item btn-devolver-espera" data-id="${id}">♻️ Enviar a Espera</button>`;
    }

    if (al.estado_agenda !== 'Pre-alta Pendiente' && al.estado_agenda !== 'Lista de espera' && al.estado_agenda !== 'Alta Suspendida' && al.estado_agenda !== 'Alta Efectiva' && al.estado_agenda !== 'Alta Ilegal') {
        accionesHtml = `<button type="button" class="dropdown-item btn-nombre-agendar" data-id="${id}">📋 Generar nombre agenda WS</button>` + accionesHtml;
    }
    return accionesHtml;
}

function generarFilaAlumno(al, id, vista) {
    let colorIndicador = 'ind-gray', txtEstado = al.estado_agenda, fechaCalculo = null;
    if ((al.estado_agenda === 'Pendiente validación por profe' || al.estado_agenda === 'Pendiente validación por alumno' || al.estado_agenda === 'Agenda confirmada') && al.reserva_inicio) { fechaCalculo = new Date(al.reserva_inicio); } 
    else if (al.estado_agenda === 'Pre-alta Iniciada' && al.fecha_inicio_clases) { fechaCalculo = new Date(al.fecha_inicio_clases); }
    if (fechaCalculo) {
        let diffHs = (fechaCalculo - new Date()) / (1000 * 60 * 60);
        if (diffHs < 0) { colorIndicador = 'ind-gray'; txtEstado = 'Vencida'; } 
        else if (diffHs <= 48) { colorIndicador = 'ind-red'; txtEstado = 'Crítico'; } 
        else if (diffHs <= 72) { colorIndicador = 'ind-yellow'; txtEstado = 'Alerta'; } 
        else { colorIndicador = 'ind-teal'; txtEstado = 'A tiempo'; }
    }
    if (al.estado_agenda === 'Agenda confirmada' || al.estado_agenda.includes('Alta Efectiva')) colorIndicador = 'ind-teal';
    if (al.estado_agenda === 'Alta Ilegal' || al.estado_agenda.includes('suspendida') || al.estado_agenda === 'Alta Suspendida') colorIndicador = 'ind-red';

    let instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento;
    let suscStr = al.tipo_suscripcion || ''; let nivelStr = al.nivel || 'S/N'; let cel = al.celular || ''; let edad = al.edad ? al.edad + 'a' : '-';

   let dispHtml = '<div class="row-disp-grid">';
    diasSemana.forEach(d => {
        let tiene = al.disponibilidad && al.disponibilidad[d.id] && al.disponibilidad[d.id].length > 0, txt = '-';
        if (tiene) { 
            let p = al.disponibilidad[d.id][0]; 
            if(p.inicio === configApp.hora_apertura && p.fin === configApp.hora_cierre) { 
                txt = 'Libre'; 
            } else { 
                let ini = p.inicio.replace(':00', '');
                let fin = p.fin.replace(':00', '');
                txt = `${ini}-${fin}`; 
            } 
        }
        dispHtml += `<div class="disp-box ${tiene ? 'active' : ''}"><div class="disp-day">${d.id}</div><div class="disp-time">${txt}</div></div>`;
    });
    dispHtml += '</div>';

    let contenidoExtra = '';
    if (al.estado_agenda === 'Pre-alta Iniciada' || al.estado_agenda === 'Alta Efectiva' || al.estado_agenda === 'Alta Ilegal') {
        const chkLabels = ["Mensajes de bienvenida", "Informar al profe", "Actualizar base", "Cargar pago", "Comunidad Mandala"];
        let checks = al.checklist_alta || [false, false, false, false, false], cantOk = checks.filter(Boolean).length;
        if (al.estado_agenda === 'Pre-alta Iniciada' || cantOk < 5) {
            let chkHtml = '';
            chkLabels.forEach((label, idx) => { chkHtml += `<label style="display:flex; align-items:center; gap:6px; margin:0; cursor:pointer; font-size:11px; text-transform:none;"><input type="checkbox" class="chk-alta-paso" data-id="${id}" data-idx="${idx}" ${checks[idx]?'checked':''} style="width:14px; height:14px; accent-color:var(--accent-teal);"> ${label}</label>`; });
            contenidoExtra = `<div style="width:100%; margin-top:12px; padding-top:12px; border-top:1px dashed var(--border-color); display:flex; flex-direction:column; gap:6px;">${chkHtml}</div>`;
        }
    }

    let accionesHtml = generarBotonesAccion(al, id), menuAcciones = '';
    if (accionesHtml) menuAcciones = `<div class="alumno-actions" style="position:relative;"><button type="button" class="btn-row-action">⋮</button><div class="dropdown-menu-wrapper" style="right:0;"><div class="dropdown-menu">${accionesHtml}</div></div></div>`;

    return `
        <div class="row-item" data-id="${id}">
            <div style="display:flex; width:100%; gap:15px; align-items:center;">
                <div class="row-indicator ${colorIndicador}"></div>
                <div class="row-main-info btn-editar-alumno" data-id="${id}">
                    <div class="row-name alumno-nombre-search">${al.nombre}</div>
                    <div class="row-sub"><span>${cel}</span> • <span>${edad}</span> • <strong style="color:var(--accent-teal);">${instStr}</strong> • <span>${suscStr}</span> • <span>${nivelStr}</span></div>
                </div>
                ${dispHtml}
                <div class="row-meta">
                    <div>Entrevistador: <strong style="color:var(--text-main);">${al.reserva_profe_nombre || '-'}</strong></div>
                    <div>Fecha: <strong style="color:var(--text-main);">${al.reserva_fecha_texto || '-'}</strong></div>
                    <div style="font-size:10px; margin-top:2px;">${txtEstado}</div>
                </div>
                ${menuAcciones}
            </div>
            ${contenidoExtra}
        </div>
    `;
}

function renderTimeline(containerId, configNodos, datos, nodoActivo, setterNodo) {
    const cont = document.getElementById(containerId);
    let html = '<div class="timeline-wrapper"><div class="timeline-line"></div>';
    configNodos.forEach(n => {
        const count = datos.filter(d => n.filterFn ? n.filterFn(d) : d.estado_agenda === n.id).length;
        const act = (n.id === nodoActivo) ? 'active' : '';
        html += `<div class="timeline-node ${n.color} ${act}" data-id="${n.id}"><div class="timeline-count">${count}</div><div class="timeline-circle">${n.icon}</div><div class="timeline-label">${n.label}</div></div>`;
    });
    html += '</div>';
    cont.innerHTML = html;
    cont.querySelectorAll('.timeline-node').forEach(el => {
        el.addEventListener('click', () => {
            let newId = el.getAttribute('data-id');
            if (setterNodo === 'adm') nodoAdmActivo = newId; if (setterNodo === 'altas') nodoAltasActivo = newId;
            renderTimeline(containerId, configNodos, datos, newId, setterNodo);
            renderListaFilas('lista-generica', datos, newId, configNodos);
        });
    });
}

function renderListaFilas(containerId, datos, estadoId, configNodos) {
    const cont = document.getElementById(containerId);
    const nodo = configNodos ? configNodos.find(n => n.id === estadoId) : null;
    let filtrados = datos;
    if(estadoId && estadoId !== 'all') { filtrados = filtrados.filter(d => nodo && nodo.filterFn ? nodo.filterFn(d) : d.estado_agenda === estadoId); }

    const query = (document.getElementById('input-buscador-general').value || '').toLowerCase();
    if (query) { filtrados = filtrados.filter(al => al.nombre.toLowerCase().includes(query)); }

    if (filtroChipActual !== 'Todos') {
        filtrados = filtrados.filter(al => { const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento]; return insts.includes(filtroChipActual); });
    }

    if(filtrados.length === 0) { cont.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px; font-weight:500;">No hay alumnos en esta vista.</div>'; return; }

    let html = '';
    if (agrupadorActual === 'ninguno') {
        html = filtrados.map(a => generarFilaAlumno(a, a.id, estadoActualVista)).join('');
    } else {
        const grupos = {};
        filtrados.forEach(al => {
            let clave = 'Sin clasificar';
            if (agrupadorActual === 'instrumento') clave = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || clave);
            else if (agrupadorActual === 'nivel') clave = al.nivel || clave;
            else if (agrupadorActual === 'suscripcion') clave = al.tipo_suscripcion || clave;
            else if (agrupadorActual === 'profe') clave = al.reserva_profe_nombre || clave;
            if (!grupos[clave]) grupos[clave] = []; grupos[clave].push(al);
        });
        for (const [clave, alumnosGrupo] of Object.entries(grupos)) {
            html += `<div class="group-header"><span style="color:var(--accent-red);">●</span> ${clave} <span class="group-count">${alumnosGrupo.length}</span></div>`;
            html += alumnosGrupo.map(a => generarFilaAlumno(a, a.id, estadoActualVista)).join('');
        }
    }
    cont.innerHTML = html;
}

async function cargarVista(vista) {
    estadoActualVista = vista; document.getElementById('vista-titulo').textContent = vista.includes('-') ? vista.split('-')[1].trim() : vista;
    const vResumen = document.getElementById('vista-resumen'), contLista = document.getElementById('lista-generica'), contEstad = document.getElementById('estadisticas-container');
    const formWrapper = document.getElementById('form-alumno-wrapper'), cv = document.getElementById('controles-vista');
    if (formWrapper) { formWrapper.style.display = 'none'; document.getElementById('modal-alta-alumno').appendChild(formWrapper); }
    
    document.getElementById('btn-carga-masiva').style.display = 'none'; document.getElementById('search-container-general').style.display = 'none';
    vResumen.style.display = 'none'; contLista.style.display = 'none'; contEstad.style.display = 'none'; cv.style.display = 'none';

    if (vista.includes('-') || vista === 'Lista de Espera') { cv.style.display = 'flex'; renderFiltrosChips(); document.getElementById('search-container-general').style.display = 'block'; }
    if (vista === 'Resumen') {
        document.getElementById('search-container-general').style.display = 'block'; vResumen.style.display = 'flex'; cv.style.display = 'none';
        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            let urgencies = []; allData.forEach(al => { let dateToEval = null; if ((al.estado_agenda === 'Pendiente validación por profe' || al.estado_agenda === 'Pendiente validación por alumno' || al.estado_agenda === 'Agenda confirmada') && al.reserva_inicio) { dateToEval = new Date(al.reserva_inicio); } else if (al.estado_agenda === 'Pre-alta Iniciada' && al.fecha_inicio_clases) { dateToEval = new Date(al.fecha_inicio_clases); } if (dateToEval && !isNaN(dateToEval.getTime())) { let diffHs = (dateToEval - new Date()) / (1000 * 60 * 60); if (diffHs <= 72) urgencies.push(al); } });
            urgencies.sort((a,b) => { let dA = (a.estado_agenda==='Pre-alta Iniciada') ? new Date(a.fecha_inicio_clases) : new Date(a.reserva_inicio); let dB = (b.estado_agenda==='Pre-alta Iniciada') ? new Date(b.fecha_inicio_clases) : new Date(b.reserva_inicio); return dA - dB; });
            document.getElementById('resumen-urgencias').innerHTML = urgencies.length > 0 ? urgencies.map(a => generarFilaAlumno(a, a.id, vista)).join('') : '<div style="color:var(--text-muted); padding:10px; font-weight:500;">No hay gestiones críticas a la vista.</div>';
            renderTimeline('timeline-resumen-adm', configNodosAdm, allData, nodoAdmActivo, 'adm');
            renderTimeline('timeline-resumen-altas', configNodosAltas, allData, nodoAltasActivo, 'altas');
            contLista.style.display = 'flex'; renderListaFilas('lista-generica', allData, nodoAdmActivo, configNodosAdm);
        } catch(e) {}
    } else if (vista === 'Admisión - Pendientes' || vista === 'Altas - Pendientes') {
        const isAdm = vista === 'Admisión - Pendientes';
        document.getElementById('btn-carga-masiva').style.display = isAdm ? 'block' : 'none'; contLista.style.display = 'flex';
        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            let nodos = isAdm ? configNodosAdm : configNodosAltas; let stId = isAdm ? nodoAdmActivo : nodoAltasActivo;
            renderListaFilas('lista-generica', allData, stId, nodos);
        } catch(e) {}
    } else if (vista === 'Admisión - Confirmadas' || vista === 'Admisión - Suspendidas' || vista === 'Altas - Confirmadas' || vista === 'Altas - Suspendidas' || vista === 'Lista de Espera') {
        contLista.style.display = 'flex';
        try { 
            let estQuery = vista;
            if(vista === 'Admisión - Confirmadas') estQuery = 'Agenda confirmada';
            else if(vista === 'Admisión - Suspendidas') estQuery = 'Agenda suspendida';
            else if(vista === 'Lista de Espera') estQuery = 'Lista de espera';
            else if(vista === 'Altas - Confirmadas') estQuery = 'Alta Efectiva'; // simplificado
            else if(vista === 'Altas - Suspendidas') estQuery = 'Alta Suspendida';
            
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = [];
            qSnap.forEach(d => { let ok = false; if(estQuery==='Alta Efectiva') ok=(d.data().estado_agenda==='Alta Efectiva'||d.data().estado_agenda==='Alta Ilegal'); else ok=(d.data().estado_agenda===estQuery); if(ok) allData.push({id: d.id, ...d.data()}); });
            renderListaFilas('lista-generica', allData, 'all', null);
        } catch(e) {}
    } else if (vista === 'Match - Pendientes' || vista === 'Match - Confirmados') {
        contLista.style.display = 'flex'; contLista.innerHTML = '<div style="color:var(--text-muted); padding:20px;">Módulo Match en construcción (Etapa 4)...</div>';
    } else if (vista === 'Estadísticas') { contEstad.style.display = 'flex'; renderCharts();
    } else if (vista === 'Configuración') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfigHub(contLista);
    } else if (vista === 'Ajustes Generales') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfig(contLista);
    } else if (vista.startsWith('ABM')) { contLista.style.display = 'flex'; contLista.innerHTML = ''; const colMap = { 'ABM-Profesores': 'profesores', 'ABM-Instrumentos': 'instrumentos', 'ABM-Suscripciones': 'tipos_suscripcion', 'ABM-Usuarios': 'usuarios_sistema' }; cargarABM(colMap[vista] || vista.split('-')[1].toLowerCase(), vista.split('-')[1], contLista); }
}

function renderConfigHub(cont) {
    cont.innerHTML = `
        <div style="max-width:800px; width:100%; padding:20px;">
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('Ajustes Generales')"><span style="font-size:1.5em; opacity:0.7;">⚙️</span><div><strong style="color:var(--text-main);">Ajustes Generales</strong><div style="font-size:12px; color:var(--text-muted);">Límites, calendarios y textos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('ABM-Usuarios')"><span style="font-size:1.5em; opacity:0.7;">🔐</span><div><strong style="color:var(--text-main);">Usuarios del Sistema</strong><div style="font-size:12px; color:var(--text-muted);">Administrar accesos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('ABM-Profesores')"><span style="font-size:1.5em; opacity:0.7;">👥</span><div><strong style="color:var(--text-main);">Profesores</strong><div style="font-size:12px; color:var(--text-muted);">Alta y disponibilidad.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('ABM-Instrumentos')"><span style="font-size:1.5em; opacity:0.7;">🎸</span><div><strong style="color:var(--text-main);">Instrumentos</strong></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('ABM-Suscripciones')"><span style="font-size:1.5em; opacity:0.7;">🎫</span><div><strong style="color:var(--text-main);">Suscripciones</strong></div></div>
        </div>`;
}

async function renderCharts() {
    const cont = document.getElementById('estadisticas-container');
    cont.innerHTML = `
        <h2 style="margin:0; font-size:1.3em; color:var(--text-main);">Estadísticas</h2>
        <div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div style="background:white; padding:20px; border-radius:12px; border:1px solid var(--border-color); flex:1; min-width:300px;"><canvas id="chartAdmGestiones"></canvas></div>
            <div style="background:white; padding:20px; border-radius:12px; border:1px solid var(--border-color); flex:1; min-width:300px;"><canvas id="chartAdmGlobal"></canvas></div>
        </div>
    `;
    try {
        const qSnap = await getDocs(collection(db, "alumnos"));
        let counts = { 'Pendiente procesar':0, 'Pendiente validación por profe':0, 'Pendiente validación por alumno':0 };
        let cAdm = { en_curso:0, confirmadas:0, suspendidas:0 };
        qSnap.forEach(doc => {
            let st = doc.data().estado_agenda;
            if(counts[st] !== undefined) counts[st]++;
            if(['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno'].includes(st)) cAdm.en_curso++;
            if(st === 'Agenda confirmada') cAdm.confirmadas++;
            if(st === 'Agenda suspendida') cAdm.suspendidas++;
        });
        if(chartAdmGestionesInst) chartAdmGestionesInst.destroy(); if(chartAdmGlobalInst) chartAdmGlobalInst.destroy();
        chartAdmGestionesInst = new Chart(document.getElementById('chartAdmGestiones'), { type: 'doughnut', data: { labels: ['Sin Agendar', 'Validando Profe', 'Validando Alumno'], datasets: [{ data: [counts['Pendiente procesar'], counts['Pendiente validación por profe'], counts['Pendiente validación por alumno']], backgroundColor: ['#b3aa9a', '#1f5491', '#e5a93d'] }] } });
        chartAdmGlobalInst = new Chart(document.getElementById('chartAdmGlobal'), { type: 'pie', data: { labels: ['En Curso', 'Confirmadas', 'Suspendidas'], datasets: [{ data: [cAdm.en_curso, cAdm.confirmadas, cAdm.suspendidas], backgroundColor: ['#007b8f', '#c2563b', '#b3aa9a'] }] } });
    } catch(e) {}
}

const btnLogin = document.getElementById('btn-login'); if (btnLogin) btnLogin.addEventListener('click', conectarGoogle);
document.getElementById('btn-logout').addEventListener('click', async () => { await signOut(auth); window.location.reload(); });

onAuthStateChanged(auth, async (user) => { 
    if (user) { 
        try {
            const qSnap = await getDocs(collection(db, "usuarios_sistema")); let autorizado = false;
            if (qSnap.empty) { await addDoc(collection(db, "usuarios_sistema"), { email: user.email.toLowerCase(), rol: 'admin' }); autorizado = true; } 
            else { qSnap.forEach(d => { if(d.data().email && d.data().email.toLowerCase() === user.email.toLowerCase()) autorizado = true; }); }
            if (!autorizado) { alert(`Acceso Denegado:\nTu cuenta (${user.email}) no está autorizada.`); await signOut(auth); document.getElementById('login-container').style.display = 'flex'; document.getElementById('app-container').style.display = 'none'; return; }
        } catch(e) { return alert("Error al validar permisos."); }

        document.getElementById('login-container').style.display = 'none'; document.getElementById('app-container').style.display = 'flex'; 
        const userInfoBox = document.getElementById('user-info'); userInfoBox.textContent = user.email; 
        if (userInfoBox && !document.getElementById('version-tag')) { userInfoBox.insertAdjacentHTML('afterend', `<div id="version-tag" style="font-size:0.85em; color:var(--accent-teal); margin-top:5px; font-weight:700; padding:0 10px;">${APP_VERSION}</div>`); }
        await cargarConfig(); cargarVista('Resumen'); 
    } else { 
        document.getElementById('login-container').style.display = 'flex'; document.getElementById('app-container').style.display = 'none'; 
    } 
});

const inputBuscadorGeneral = document.getElementById('input-buscador-general'); if(inputBuscadorGeneral) { inputBuscadorGeneral.addEventListener('input', () => { cargarVista(estadoActualVista); }); }

document.addEventListener('change', async (e) => {
    if(e.target.classList.contains('chk-alta-paso')) {
        const id = e.target.getAttribute('data-id'), idx = parseInt(e.target.getAttribute('data-idx'));
        try {
            const docRef = doc(db, "alumnos", id), alDoc = await getDoc(docRef), al = alDoc.data();
            let checks = al.checklist_alta || [false, false, false, false, false]; checks[idx] = e.target.checked;
            await updateDoc(docRef, { checklist_alta: checks });
            if (checks.filter(Boolean).length === 5 && (estadoActualVista === 'Resumen' || estadoActualVista === 'Altas - Pendientes') && (al.estado_agenda === 'Alta Efectiva' || al.estado_agenda === 'Alta Ilegal')) { setTimeout(() => { cargarVista(estadoActualVista); }, 1000); }
        } catch(err) {}
    }
});

document.addEventListener('click', async (e) => {
    const target = e.target;
    if (target.tagName === 'DIALOG') { const rect = target.getBoundingClientRect(), inDialog = (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
        if (!inDialog) {
            if (target.id === 'modal-alta-alumno') document.querySelector('#form-alumno button[type="submit"]').click();
            else target.close(); return;
        }
    }
    
    if (target.classList.contains('btn-eliminar-alumno')) { e.stopPropagation(); if(confirm("¿Eliminar este alumno por completo?")) { const id = target.closest('.row-item').getAttribute('data-id'); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); if (al && al.id_evento_reserva) { await eliminarEventoSeguro(al); } } catch(err) {} await deleteDoc(doc(db, "alumnos", id)); cargarVista(estadoActualVista); } return; }
    if (target.classList.contains('btn-nota-rapida')) { e.stopPropagation(); document.getElementById('nota-rapida-id').value = target.getAttribute('data-id'); document.getElementById('nota-rapida-texto').value = ''; document.getElementById('modal-nota-rapida').showModal(); return; }
    if (target.id === 'btn-guardar-nota-rapida') { const id = document.getElementById('nota-rapida-id').value, texto = document.getElementById('nota-rapida-texto').value; if (!texto.trim()) return alert("La nota no puede estar vacía."); setBotonCargando(target, true); try { const alDoc = await getDoc(doc(db, "alumnos", id)); if (alDoc.exists()) { const alData = alDoc.data(), hist = alData.historial || []; const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`; hist.push({ id: Date.now(), texto: texto.trim(), fecha: fechaStr }); await updateDoc(doc(db, "alumnos", id), { historial: hist }); document.getElementById('modal-nota-rapida').close(); cargarVista(estadoActualVista); } } catch(e) {} setBotonCargando(target, false); return; }

    const rowInfo = target.closest('.btn-editar-alumno');
    if (rowInfo) { const id = rowInfo.getAttribute('data-id'); const wrap = document.getElementById('form-alumno-wrapper'); document.getElementById('modal-alta-alumno').appendChild(wrap); wrap.style.display = 'block'; document.getElementById('alumno-id').value = id; await llenarFormularioAlumno(id); document.getElementById('form-titulo').textContent = 'Editar Alumno'; document.getElementById('container-ingreso-directo').style.display = 'none'; document.getElementById('modal-alta-alumno').showModal(); return; }

    if (target.classList.contains('btn-nombre-agendar')) { const id = target.getAttribute('data-id'); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); const iS = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento; let template = configApp.texto_nombre_agendar || 'MDL {nombre} {edad} {año_actual} @{instrumento} @{suscripcion}'; const txt = reemplazarVariables(template, { nombre: al.nombre, edad: al.edad || '', 'año_actual': new Date().getFullYear().toString(), instrumento: iS, suscripcion: al.tipo_suscripcion || '' }).replace(/\s+/g, ' ').trim(); await navigator.clipboard.writeText(txt); alert("Nombre copiado:\n" + txt); } catch(e) {} return; }
    if (target.classList.contains('btn-admision-finalizada')) { const id = target.getAttribute('data-id'); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Lista de espera" }); cargarVista(estadoActualVista); return; }
    if (target.classList.contains('btn-abrir-prealta')) { const id = target.getAttribute('data-id'); document.getElementById('prealta-alumno-id').value = id; document.getElementById('titulo-prealta').textContent = 'Iniciar Pre-Alta'; document.getElementById('prealta-fecha-inicio').value = ''; document.getElementById('prealta-grupo').value = ''; document.getElementById('modal-iniciar-prealta').showModal(); return; }
    if (target.id === 'btn-guardar-prealta') { const id = document.getElementById('prealta-alumno-id').value, fIni = document.getElementById('prealta-fecha-inicio').value, grp = document.getElementById('prealta-grupo').value; if(!fIni || !grp) return alert("Completa todos los campos."); setBotonCargando(target, true); const fIso = new Date(fIni).toISOString(), updates = { estado_agenda: "Pre-alta Iniciada", fecha_inicio_clases: fIso, grupo_asignado: grp }; const al = (await getDoc(doc(db, "alumnos", id))).data(); if(!al.fecha_prealta) updates.fecha_prealta = new Date().toISOString(); if(!al.checklist_alta) updates.checklist_alta = [false, false, false, false, false]; await updateDoc(doc(db, "alumnos", id), updates); const dataText = await generarTextoConHistorial(id, 'texto_prealta'); await navigator.clipboard.writeText(dataText.txt); document.getElementById('modal-iniciar-prealta').close(); alert("Pre-Alta Iniciada.\nTexto copiado."); setBotonCargando(target, false); cargarVista(estadoActualVista); return; }
    if (target.classList.contains('btn-abrir-confirmar-alta')) { document.getElementById('conf-alta-alumno-id').value = target.getAttribute('data-id'); document.getElementById('modal-confirmar-alta').showModal(); return; }
    if (target.id === 'btn-guardar-confirmacion-alta') { const id = document.getElementById('conf-alta-alumno-id').value, est = document.querySelector('input[name="opt-tipo-alta"]:checked').value; setBotonCargando(target, true); await updateDoc(doc(db, "alumnos", id), { estado_agenda: est }); const dataText = await generarTextoConHistorial(id, 'texto_alta_confirmada'); await navigator.clipboard.writeText(dataText.txt); document.getElementById('modal-confirmar-alta').close(); alert("Alta Confirmada.\nTexto copiado."); setBotonCargando(target, false); cargarVista(estadoActualVista); return; }
    if (target.classList.contains('btn-devolver-espera')) { const motivo = prompt("¿Motivo para devolver a Lista de Espera?"); if (motivo !== null) { if (motivo.trim() === "") return alert("Debes ingresar un motivo."); const id = target.getAttribute('data-id'); const al = (await getDoc(doc(db, "alumnos", id))).data(), now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`, hist = al.historial || []; hist.push({ id: Date.now(), texto: `Devuelto a espera. Motivo: ${motivo.trim()}`, fecha: fechaStr }); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Lista de espera", fecha_inicio_clases: null, grupo_asignado: null, checklist_alta: null, historial: hist }); cargarVista(estadoActualVista); } return; }
    if (target.classList.contains('btn-suspender-alta')) { const motivo = prompt("¿Motivo de Suspensión de Alta?"); if (motivo !== null) { if (motivo.trim() === "") return alert("Debes ingresar un motivo."); const id = target.getAttribute('data-id'); const al = (await getDoc(doc(db, "alumnos", id))).data(), now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`, hist = al.historial || []; hist.push({ id: Date.now(), texto: `Alta suspendida. Motivo: ${motivo.trim()}`, fecha: fechaStr }); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Alta Suspendida", historial: hist }); cargarVista(estadoActualVista); } return; }

    if (target.classList.contains('btn-buscar-agenda')) { alumnoIdActual = target.getAttribute('data-id'); const modal = document.getElementById('modal-agenda'), resDiv = document.getElementById('resultados-agenda'); resDiv.innerHTML = ''; const hoy = new Date(), d7 = new Date(); d7.setDate(d7.getDate()+7); document.getElementById('agenda-start').value = hoy.toISOString().split('T')[0]; document.getElementById('agenda-end').value = d7.toISOString().split('T')[0]; document.getElementById('btn-procesar-seleccion-agenda').style.display = 'none'; try { const selectProfe = document.getElementById('agenda-profe-filtro'); selectProfe.innerHTML = '<option value="">Todos los profesores</option>'; const pSnap = await getDocs(collection(db, "profesores")); pSnap.forEach(p => { if(p.data().entrevista) selectProfe.innerHTML += `<option value="${p.id}">${p.data().nombre}</option>`; }); resDiv.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">Selecciona el rango y haz clic en Buscar.</p>'; modal.showModal(); setTimeout(() => { syncSelectToChips('agenda-profe-filtro', 'chips-profesores'); }, 100); } catch(err) {} return; }
    if (target.id === 'btn-ejecutar-busqueda') { const resDiv = document.getElementById('resultados-agenda'), dStrStart = document.getElementById('agenda-start').value, dStrEnd = document.getElementById('agenda-end').value; if(!dStrStart || !dStrEnd) return alert("Fechas inválidas."); const selProfe = document.getElementById('agenda-profe-filtro'), fProfs = Array.from(selProfe.selectedOptions).map(o => o.value), searchAll = fProfs.length === 0 || fProfs.includes(""); resDiv.innerHTML = '<p>Buscando...</p>'; document.getElementById('btn-procesar-seleccion-agenda').style.display = 'none'; setBotonCargando(target, true); try { const al = (await getDoc(doc(db, "alumnos", alumnoIdActual))).data(), arrI = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento], esBat = arrI.some(i => i.toLowerCase().includes('bater')), dMap = { 'D':0, 'L':1, 'M':2, 'X':3, 'J':4, 'V':5, 'S':6 }; const dS = new Date(dStrStart+'T00:00:00'), dE = new Date(dStrEnd+'T23:59:59'); const pS = await getDocs(collection(db, "profesores")), todosLosProfes = [], profesFiltradosIDs = []; pS.forEach(p => { const d = p.data(); if(d.correo_calendario) { todosLosProfes.push({ id: p.id, nombre: d.nombre, calId: d.correo_calendario, disponibilidad: d.disponibilidad }); if (d.entrevista && (searchAll || fProfs.includes(p.id))) { profesFiltradosIDs.push(p.id); } } }); if(profesFiltradosIDs.length === 0) { setBotonCargando(target, false); return resDiv.innerHTML = '<p>No hay profes seleccionados.</p>'; } let allEv = []; for(const pr of todosLosProfes) { try { const data = await getEventosCalendario(pr.calId, dS.toISOString(), dE.toISOString()); if(data.items) allEv = allEv.concat(data.items.map(ev => ({...ev, profeId: pr.id}))); } catch(e) {} } const opts = generarOpcionesAgenda(al.disponibilidad, allEv, esBat, todosLosProfes, profesFiltradosIDs, dS, dE, configApp); if(opts.length===0) { resDiv.innerHTML='<p>No hay huecos libres.</p>'; } else { document.getElementById('btn-procesar-seleccion-agenda').style.display = 'block'; let html = ''; opts.forEach((op, index) => { html += `<label style="display:flex; gap:10px; margin-bottom:10px; cursor:pointer;"><input type="checkbox" class="chk-agenda-opt" data-calid="${op.calId}" data-profe="${op.profeNombre}" data-profeid="${op.profeId}" data-start="${op.inicioData}" data-end="${op.finData}" data-fechatxt="${op.fechaTextoAmi}"> <span>🕒 ${op.fechaTextoAmi} (${op.profeNombre})</span></label>`; }); resDiv.innerHTML = html; } } catch(e) { resDiv.innerHTML='<p>Error en la búsqueda.</p>'; } setBotonCargando(target, false); return; }
    if (target.id === 'btn-procesar-seleccion-agenda') { const checks = document.querySelectorAll('.chk-agenda-opt:checked'); if (checks.length === 0) return alert("Selecciona al menos un horario."); const opciones = Array.from(checks).map((chk, index) => { const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; return { letra: letras[index], profeId: chk.getAttribute('data-profeid'), profeNombre: chk.getAttribute('data-profe'), calId: chk.getAttribute('data-calid'), inicio: chk.getAttribute('data-start'), fin: chk.getAttribute('data-end'), fechaTexto: chk.getAttribute('data-fechatxt') }; }); const pId = opciones[0].profeId, pNom = opciones[0].profeNombre, cId = opciones[0].calId; const al = (await getDoc(doc(db, "alumnos", alumnoIdActual))).data(); let finalTxt = ""; if (opciones.length === 1) { let data = await generarTextoConHistorial(alumnoIdActual, 'texto_profe', opciones[0].fechaTexto, pId, pNom, opciones); finalTxt = data.txt; } else { let data = await generarTextoConHistorial(alumnoIdActual, 'texto_opciones_multiples', 'Varias opciones', pId, pNom, opciones); finalTxt = data.txt; } setBotonCargando(target, true); try { let updateData = { estado_agenda: "Pendiente validación por profe", reserva_profe_id: pId, reserva_profe_nombre: pNom, reserva_cal_id: cId, opciones_propuestas: opciones, reserva_fecha_texto: opciones.length === 1 ? opciones[0].fechaTexto : 'Varias opciones' }; if (al.id_evento_reserva) { await eliminarEventoSeguro(al); updateData.id_evento_reserva = null; updateData.calendario_evento_reserva = null; } await updateDoc(doc(db, "alumnos", alumnoIdActual), updateData); await navigator.clipboard.writeText(finalTxt); alert("Texto copiado al portapapeles. Estado avanzado."); document.getElementById('modal-agenda').close(); cargarVista(estadoActualVista); } catch(e) { alert("❌ Error:\n\n" + e.message); } setBotonCargando(target, false); return; }
    
    async function generarTextoConHistorial(idAlumno, plantillaKey, overrideFecha = null, overrideProfeId = null, overrideProfeNombre = null, overrideOpciones = null) { const al = (await getDoc(doc(db, "alumnos", idAlumno))).data(); let aliasP = ''; const targetProfeId = overrideProfeId || al.reserva_profe_id; const targetProfeNom = overrideProfeNombre || al.reserva_profe_nombre; if (targetProfeId) { const pDoc = await getDoc(doc(db, "profesores", targetProfeId)); if(pDoc.exists()) aliasP = pDoc.data().alias_transferencia||''; } let histText = al.historial && al.historial.length > 0 ? [...al.historial].sort((a,b)=>a.id-b.id).map(h => `[${h.fecha}] ${h.texto}`).join('\n') : 'Sin registros previos.'; let template = configApp[plantillaKey] || ''; template = template.replace(/\{historial\}/gi, histText); const iS = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento; const dP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : ''; const fAmiInicio = al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : ''; let opc = overrideOpciones || al.opciones_propuestas || []; let opcionesStr = opc.length > 0 ? opc.map(o => `${o.letra || '-'}- ${o.fechaTexto}`).join('\n') : ''; let fHora = overrideFecha || al.reserva_fecha_texto || ''; if (opc.length > 1 && (fHora === 'Varias opciones' || !fHora)) { fHora = '\n' + opcionesStr; } const txt = reemplazarVariables(template, { fecha_hora: fHora, opciones: opcionesStr, nombre: al.nombre, edad: al.edad||'-', instrumento: iS, suscripcion: al.tipo_suscripcion || '', descripcion: dP, profe: targetProfeNom || '', valor: configApp.valor_clase || '', alias_profe: aliasP || '', grupo: al.grupo_asignado || '', 'fecha inicio clases': fAmiInicio }); return { al, txt }; }

    if (target.classList.contains('btn-validado-profe-popup')) { const id = target.getAttribute('data-id'); const al = (await getDoc(doc(db, "alumnos", id))).data(); const container = document.getElementById('opciones-validadas-container'); container.innerHTML = ''; if (al.opciones_propuestas && al.opciones_propuestas.length > 0) { al.opciones_propuestas.forEach((op, index) => { container.innerHTML += `<label style="display:flex; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="radio" name="opt-valida-profe" value='${JSON.stringify(op)}' ${index===0?'checked':''}> ${op.letra ? op.letra+'- ' : ''}${op.fechaTexto}</label>`; }); } else { const op = { inicio: al.reserva_inicio, fin: al.reserva_fin, fechaTexto: al.reserva_fecha_texto, calId: al.reserva_cal_id, profeId: al.reserva_profe_id, profeNombre: al.reserva_profe_nombre }; container.innerHTML = `<label style="display:flex; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="radio" name="opt-valida-profe" value='${JSON.stringify(op)}' checked> ${op.fechaTexto}</label>`; } document.getElementById('validar-profe-alumno-id').value = id; document.getElementById('modal-validar-profe').showModal(); return; }
    if (target.id === 'btn-confirmar-validacion-profe') { const id = document.getElementById('validar-profe-alumno-id').value, selectedRadio = document.querySelector('input[name="opt-valida-profe"]:checked'); if(!selectedRadio) return alert("Selecciona una opción."); const op = JSON.parse(selectedRadio.value), al = (await getDoc(doc(db, "alumnos", id))).data(); setBotonCargando(target, true); try { al.reserva_profe_id = op.profeId; al.reserva_profe_nombre = op.profeNombre; al.reserva_cal_id = op.calId; al.reserva_fecha_texto = op.fechaTexto; al.reserva_inicio = op.inicio; al.reserva_fin = op.fin; const titulos = construirTitulosEvento(al, 'reserva', configApp); const evRes = await crearEventoSeguro(al, titulos, op.inicio, op.fin); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente validación por alumno", id_evento_reserva: evRes.id, calendario_evento_reserva: evRes.calendar, reserva_profe_id: op.profeId, reserva_profe_nombre: op.profeNombre, reserva_cal_id: op.calId, reserva_fecha_texto: op.fechaTexto, reserva_inicio: op.inicio, reserva_fin: op.fin, opciones_propuestas: null }); const dataText = await generarTextoConHistorial(id, 'texto_alumno'); await navigator.clipboard.writeText(dataText.txt); alert("Reserva en Calendar creada exitosamente.\n\nTexto copiado."); document.getElementById('modal-validar-profe').close(); cargarVista(estadoActualVista); } catch(e) { alert("❌ Error:\n\n" + e.message); } setBotonCargando(target, false); return; }
    if (target.classList.contains('btn-confirmar-entrevista')) { const id = target.getAttribute('data-id'); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); const descP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : ''; const titulos = construirTitulosEvento(al, 'confirmado', configApp); await actualizarEventoSeguro(al, titulos, descP); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda confirmada" }); alert("¡Agenda Confirmada!"); cargarVista(estadoActualVista); } catch(e) { alert("❌ Error:\n\n" + e.message); } return; }
    if (target.classList.contains('btn-reenviar-profe') || target.classList.contains('btn-enviar-conf-profe')) { try { const id = target.getAttribute('data-id'); const al = (await getDoc(doc(db, "alumnos", id))).data(); let key = 'texto_conf_profe'; if (target.classList.contains('btn-reenviar-profe')) { key = (al.opciones_propuestas && al.opciones_propuestas.length > 1) ? 'texto_opciones_multiples' : 'texto_profe'; } const data = await generarTextoConHistorial(id, key); await navigator.clipboard.writeText(data.txt); alert("Texto copiado."); } catch(e) {} return; }
    if (target.classList.contains('btn-reenviar-alumno') || target.classList.contains('btn-enviar-conf-alumno')) { try { const id = target.getAttribute('data-id'); const key = target.classList.contains('btn-reenviar-alumno') ? 'texto_alumno' : 'texto_conf_alumno'; const data = await generarTextoConHistorial(id, key); await navigator.clipboard.writeText(data.txt); alert("Texto copiado."); } catch(e) {} return; }
    if (target.classList.contains('btn-cancelar-reserva')) { const motivo = prompt("¿Estás seguro de cancelar? Se eliminará en Calendar.\nIngresa motivo para historial:"); if (motivo !== null) { if (motivo.trim() === "") return alert("Debes ingresar motivo."); const id = target.getAttribute('data-id'); try { const alDoc = await getDoc(doc(db, "alumnos", id)); const alData = alDoc.data(); if (alData.id_evento_reserva) await eliminarEventoSeguro(alData); const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`; const hist = alData.historial || []; hist.push({ id: Date.now(), texto: `Reserva cancelada. Motivo: ${motivo.trim()}`, fecha: fechaStr }); const data = await generarTextoConHistorial(id, 'texto_cancela_alumno'); if (data.al.estado_agenda === 'Pendiente validación por alumno' || data.al.estado_agenda === 'Agenda confirmada') { await navigator.clipboard.writeText(data.txt); alert("Cancelada. Texto CANCELACIÓN copiado."); } await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente procesar", reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, opciones_propuestas: null, historial: hist }); cargarVista(estadoActualVista); } catch(e) { alert("❌ Error:\n\n" + e.message); } } return; }

    if (target.classList.contains('btn-abrir-suspender')) { document.getElementById('susp-alumno-id').value = target.getAttribute('data-id'); document.getElementById('susp-motivo').value = ""; document.getElementById('modal-suspender').showModal(); return; }
    if (target.id === 'btn-guardar-suspension') { const id = document.getElementById('susp-alumno-id').value, mtv = document.getElementById('susp-motivo').value; if(!mtv) return alert("Seleccione motivo"); setBotonCargando(target, true); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); if (al.id_evento_reserva) await eliminarEventoSeguro(al); const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`, hist = al.historial || []; hist.push({ id: Date.now(), texto: `Suspendido. Motivo: ${mtv}`, fecha: fechaStr }); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda suspendida", motivo_suspension: mtv, reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, historial: hist }); document.getElementById('modal-suspender').close(); cargarVista(estadoActualVista); } catch(err){ alert("❌ Error:\n\n" + err.message); } setBotonCargando(target, false); return;}
    if (target.classList.contains('btn-recuperar-agenda')) { await updateDoc(doc(db, "alumnos", target.getAttribute('data-id')), { estado_agenda: "Pendiente procesar", motivo_suspension: null }); cargarVista(estadoActualVista); return; }
    if (target.classList.contains('btn-cerrar-modal')) { document.getElementById(target.getAttribute('data-modal')).close(); return; }
    
    if (target.id === 'btn-nuevo-alumno') { 
        const wrap = document.getElementById('form-alumno-wrapper'); document.getElementById('modal-alta-alumno').appendChild(wrap); wrap.style.display = 'block'; document.getElementById('form-titulo').textContent = 'Nuevo Alumno'; document.getElementById('alumno-id').value = ''; document.getElementById('form-alumno').reset(); quill.setContents([]); historialActual = []; renderHistorial(); diasSemana.forEach(d => { document.getElementById(`disp-${d.id}-all`).checked=false; document.getElementById(`disp-${d.id}-none`).checked=false; document.getElementById(`estado-${d.id}`).textContent=""; }); document.getElementById('chk-ingreso-directo').checked = false; 
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); const tabBtns = document.querySelectorAll('.tab-btn'); if(tabBtns.length > 0) { tabBtns[0].classList.add('active'); } document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none'); if(document.getElementById('tab-datos')) document.getElementById('tab-datos').style.display = 'block';
        await cargarSelectsAlumnos(); document.getElementById('modal-alta-alumno').showModal(); return; 
    }
    if (target.id === 'btn-cerrar-alumno') { const wrap = document.getElementById('form-alumno-wrapper'); wrap.style.display = 'none'; document.body.appendChild(wrap); document.getElementById('modal-alta-alumno').close(); return; }
});

async function cargarSelectsAlumnos() { 
    const sI = document.getElementById('instrumento'), sS = document.getElementById('tipo_suscripcion'); 
    sI.innerHTML = ''; sS.innerHTML = '<option value="">Seleccione...</option>'; 
    const iS = await getDocs(collection(db, "instrumentos")); iS.forEach(d => sI.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`); 
    const sSp = await getDocs(collection(db, "tipos_suscripcion")); sSp.forEach(d => sS.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`); 
    setTimeout(() => { syncSelectToChips('instrumento', 'chips-instrumentos'); }, 100);
}

async function llenarFormularioAlumno(id) { 
    document.getElementById('alumno-id').value = id; const d = (await getDoc(doc(db, "alumnos", id))).data(); document.getElementById('nombre').value = d.nombre; document.getElementById('celular').value = d.celular; document.getElementById('edad').value = d.edad||''; document.getElementById('nivel').value = d.nivel||''; await cargarSelectsAlumnos(); const sI = document.getElementById('instrumento'); Array.from(sI.options).forEach(o => o.selected = (d.instrumento||[]).includes(o.value)); syncSelectToChips('instrumento', 'chips-instrumentos'); document.getElementById('tipo_suscripcion').value = d.tipo_suscripcion; quill.root.innerHTML = d.descripcion||''; historialActual = d.historial || []; renderHistorial(); 
    const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00'; diasSemana.forEach(dia => { const dD = d.disponibilidad[dia.id], tI = document.getElementById(`disp-${dia.id}-inicio`), tF = document.getElementById(`disp-${dia.id}-fin`), cA = document.getElementById(`disp-${dia.id}-all`), cN = document.getElementById(`disp-${dia.id}-none`), sE = document.getElementById(`estado-${dia.id}`); tI.disabled=false; tF.disabled=false; cA.checked=false; cN.checked=false; sE.textContent=""; if (!dD || dD.length===0) { cN.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Bloqueado"; sE.style.color="var(--accent-red)"; } else if (dD[0].inicio===hApe && dD[0].fin===hCie) { cA.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Libre"; sE.style.color="var(--accent-teal)"; } else { tI.value = dD[0].inicio; tF.value = dD[0].fin; } }); 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); const tabBtns = document.querySelectorAll('.tab-btn'); if(tabBtns.length > 0) { tabBtns[0].classList.add('active'); } document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none'); if(document.getElementById('tab-datos')) document.getElementById('tab-datos').style.display = 'block';
}

document.getElementById('form-alumno').addEventListener('submit', async (e) => { 
    e.preventDefault(); const btnSubmit = e.target.querySelector('button[type="submit"]'); setBotonCargando(btnSubmit, true);
    const disp = {}, hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00'; diasSemana.forEach(d => { const cA = document.getElementById(`disp-${d.id}-all`).checked, cN = document.getElementById(`disp-${d.id}-none`).checked; let i = document.getElementById(`disp-${d.id}-inicio`).value, f = document.getElementById(`disp-${d.id}-fin`).value; if(cN) disp[d.id] = []; else if(cA) disp[d.id] = [{inicio:hApe, fin:hCie}]; else { if(i||f) disp[d.id] = [{inicio: i||hApe, fin: f||hCie}]; else disp[d.id] = []; } }); 
    const selInst = document.getElementById('instrumento'), instV = Array.from(selInst.selectedOptions).map(o=>o.value), data = { nombre: document.getElementById('nombre').value, celular: document.getElementById('celular').value, edad: Number(document.getElementById('edad').value), nivel: document.getElementById('nivel').value, instrumento: instV, tipo_suscripcion: document.getElementById('tipo_suscripcion').value, descripcion: quill.root.innerHTML, disponibilidad: disp, historial: historialActual }; 
    try { const id = document.getElementById('alumno-id').value; if (id) { await updateDoc(doc(db, "alumnos", id), data); } else { const esDirecto = document.getElementById('chk-ingreso-directo').checked; if (esDirecto) { data.estado_agenda = "Lista de espera"; const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`; data.historial.push({ id: Date.now(), texto: "Ingreso directo a Lista de Espera.", fecha: fechaStr }); } else { data.estado_agenda = "Pendiente procesar"; } await addDoc(collection(db, "alumnos"), data); } const wrap = document.getElementById('form-alumno-wrapper'); wrap.style.display='none'; document.body.appendChild(wrap); document.getElementById('modal-alta-alumno').close(); cargarVista(estadoActualVista); } catch(err) { alert("Error al guardar."); } setBotonCargando(btnSubmit, false);
});

function renderConfig(cont) { 
    cont.innerHTML = `<div style="margin-bottom:25px; font-size:0.9em; color:var(--text-muted);"><span style="cursor:pointer; color:var(--accent-teal);" onclick="cargarVista('Configuración')">Configuración</span> &gt; <strong style="color:var(--text-main);">Ajustes Generales</strong></div><div style="max-width:800px; padding:30px; background:white; border-radius:12px; border:1px solid var(--border-color);"> <h3 style="margin-top:0; color:var(--text-main); font-size:1.2em;">Límites de Calendario</h3> <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"> <div style="flex:1; min-width:150px;"><label>Hora Apertura:<input type="time" id="cfg-apertura" class="modern-input" value="${configApp.hora_apertura||'09:00'}"></label></div> <div style="flex:1; min-width:150px;"><label>Hora Cierre:<input type="time" id="cfg-cierre" class="modern-input" value="${configApp.hora_cierre||'22:00'}"></label></div> </div> <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"> <div style="flex:1; min-width:150px;"><label>Aulas totales:<input type="number" id="cfg-aulas" class="modern-input" value="${configApp.cantidad_aulas}"></label></div> <div style="flex:1; min-width:150px;"><label>Baterías totales:<input type="number" id="cfg-bats" class="modern-input" value="${configApp.cantidad_baterias}"></label></div> </div> <h3 style="margin-top:0; color:var(--text-main); border-top:1px solid var(--border-color); padding-top:20px;">Calendario y Emojis</h3> <label style="margin-bottom:15px;">Calendario Defecto:<input type="email" id="cfg-cal-defecto" class="modern-input" value="${configApp.calendario_por_defecto||''}"></label> <div style="display:flex; gap:10px; margin-bottom:25px; flex-wrap:wrap;"> <div style="width:80px;"><label>Batería:<input type="text" id="cfg-idbat" class="modern-input" value="${configApp.identificador_bateria||''}"></label></div> <div style="width:80px;"><label>Guitarra:<input type="text" id="cfg-em-gui" class="modern-input" value="${configApp.emoji_guitarra||'🎸'}"></label></div> <div style="width:80px;"><label>Cajón:<input type="text" id="cfg-em-caj" class="modern-input" value="${configApp.emoji_cajon||'📦'}"></label></div> <div style="width:80px;"><label>Canto:<input type="text" id="cfg-em-can" class="modern-input" value="${configApp.emoji_canto||'🎤'}"></label></div> <div style="width:80px;"><label>Piano:<input type="text" id="cfg-em-pia" class="modern-input" value="${configApp.emoji_piano||'🎹'}"></label></div> <div style="width:80px;"><label>Bajo:<input type="text" id="cfg-em-baj" class="modern-input" value="${configApp.emoji_bajo||'🎸'}"></label></div> </div> <h3 style="margin-top:0; color:var(--text-main); border-top:1px solid var(--border-color); padding-top:20px;">Mensajes y Textos</h3> <label style="margin-bottom:15px;">Valor de Clase (Monto): <input type="text" id="cfg-valor" class="modern-input" value="${configApp.valor_clase}"></label> <label style="margin-bottom:15px;">Título Evento (Reserva): <input type="text" id="cfg-evt-res" class="modern-input" value="${configApp.formato_evento_reserva}"></label> <label style="margin-bottom:15px;">Título Evento (Confirmado): <input type="text" id="cfg-evt-conf" class="modern-input" value="${configApp.formato_evento_confirmado}"></label> <label style="margin-bottom:15px;">Nombre para Agendar (WS): <input type="text" id="cfg-nombre-agendar" class="modern-input" value="${configApp.texto_nombre_agendar}"></label> <label style="margin-bottom:15px;">Texto Opciones Múltiples: <textarea id="cfg-txt-opt-mul" class="modern-input" style="height:200px;">${configApp.texto_opciones_multiples}</textarea></label> <label style="margin-bottom:15px;">Texto 1 Sola Opción: <textarea id="cfg-txt-p" class="modern-input" style="height:150px;">${configApp.texto_profe}</textarea></label> <label style="margin-bottom:15px;">Texto Confirmación Alumno: <textarea id="cfg-txt-conf-a" class="modern-input" style="height:150px;">${configApp.texto_conf_alumno}</textarea></label> <label style="margin-bottom:15px;">Texto Cancelación: <textarea id="cfg-txt-cancela" class="modern-input" style="height:100px;">${configApp.texto_cancela_alumno}</textarea></label> <label style="margin-bottom:15px;">Texto Pre-Alta: <textarea id="cfg-txt-prealta" class="modern-input" style="height:150px;">${configApp.texto_prealta}</textarea></label> <label style="margin-bottom:20px;">Texto Nueva Alta: <textarea id="cfg-txt-alta-conf" class="modern-input" style="height:150px;">${configApp.texto_alta_confirmada}</textarea></label> <button id="btn-guardar-cfg" class="btn-primary" style="width:100%;">Guardar Configuración</button> </div>`; 
    document.getElementById('btn-guardar-cfg').addEventListener('click', async (e) => { setBotonCargando(e.target, true); await setDoc(doc(db, "configuracion", "general"), { hora_apertura: document.getElementById('cfg-apertura').value, hora_cierre: document.getElementById('cfg-cierre').value, cantidad_aulas: document.getElementById('cfg-aulas').value, cantidad_baterias: document.getElementById('cfg-bats').value, identificador_bateria: document.getElementById('cfg-idbat').value, emoji_guitarra: document.getElementById('cfg-em-gui').value, emoji_cajon: document.getElementById('cfg-em-caj').value, emoji_canto: document.getElementById('cfg-em-can').value, emoji_piano: document.getElementById('cfg-em-pia').value, emoji_bajo: document.getElementById('cfg-em-baj').value, calendario_por_defecto: document.getElementById('cfg-cal-defecto').value, valor_clase: document.getElementById('cfg-valor').value, formato_evento_reserva: document.getElementById('cfg-evt-res').value, formato_evento_confirmado: document.getElementById('cfg-evt-conf').value, texto_nombre_agendar: document.getElementById('cfg-nombre-agendar').value, texto_opciones_multiples: document.getElementById('cfg-txt-opt-mul').value, texto_profe: document.getElementById('cfg-txt-p').value, texto_alumno: document.getElementById('cfg-txt-a').value, texto_conf_profe: document.getElementById('cfg-txt-conf-p').value, texto_conf_alumno: document.getElementById('cfg-txt-conf-a').value, texto_cancela_alumno: document.getElementById('cfg-txt-cancela').value, texto_prealta: document.getElementById('cfg-txt-prealta').value, texto_alta_confirmada: document.getElementById('cfg-txt-alta-conf').value }, { merge: true }); await cargarConfig(); setBotonCargando(e.target, false); alert('Guardado.'); }); 
}

function cargarABM(coleccion, titulo, cont) { 
    window.tituloABMActual = titulo; 
    getDocs(collection(db, coleccion)).then(qS => { 
        let h = `<div style="margin-bottom:25px; font-size:0.9em; color:var(--text-muted);"><span style="cursor:pointer; color:var(--accent-teal);" onclick="cargarVista('Configuración')">Configuración</span> &gt; <strong style="color:var(--text-main);">${titulo}</strong></div> <div style="display:flex; gap:15px; align-items:flex-end; flex-wrap:wrap; padding:25px; background:white; border-radius:12px; border:1px solid var(--border-color); margin-bottom:20px;"><div style="flex-grow:1; min-width:180px;"><label>${coleccion === 'usuarios_sistema' ? 'Correo' : 'Nombre'}</label><input type="text" id="input-nuevo-abm" class="modern-input"></div>`; 
        if(coleccion === 'profesores') { h += `<div style="flex-grow:1; min-width:200px;"><label>Email Calendar</label><input type="email" id="input-correo-abm" class="modern-input"></div><div style="flex-grow:1; min-width:150px;"><label>Celular</label><input type="text" id="input-celular-abm" class="modern-input"></div><div style="flex-grow:1; min-width:150px;"><label>Alias</label><input type="text" id="input-alias-abm" class="modern-input"></div><div style="padding-bottom:10px;"><label style="display:flex; align-items:center; gap:6px; cursor:pointer; text-transform:none;"><input type="checkbox" id="input-entrevista-abm" checked style="width:18px;height:18px;"> Entrevistas</label></div>`; } 
        h += `<button id="btn-guardar-abm" class="btn-primary" style="height:42px;">+ Agregar</button></div>`; 
        qS.forEach(d => { const dt = d.data(); let displayNom = dt.nombre || dt.email; let ex = coleccion==='profesores' ? ` <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${dt.correo_calendario}</div>` : ''; h += `<div class="row-item" onclick="window.abrirEdicionABM('${d.id}', '${coleccion}', '${displayNom}', '${dt.correo_calendario||''}', '${dt.celular||''}', '${dt.alias_transferencia||''}', ${!!dt.entrevista})"><div><strong style="color:var(--text-main); font-size:15px;">${displayNom}</strong>${ex}</div><button class="btn-row-action" onclick="event.stopPropagation(); window.eliminarABM('${d.id}', '${coleccion}')">❌</button></div>`; }); 
        cont.innerHTML = h; 
        document.getElementById('btn-guardar-abm').addEventListener('click', async () => { const n = document.getElementById('input-nuevo-abm').value.trim(); if(!n) return; const dO = coleccion === 'usuarios_sistema' ? { email: n.toLowerCase() } : { nombre: n }; if(coleccion==='profesores'){ dO.correo_calendario=document.getElementById('input-correo-abm').value.trim(); dO.celular=document.getElementById('input-celular-abm').value.trim(); dO.alias_transferencia=document.getElementById('input-alias-abm').value.trim(); dO.entrevista=document.getElementById('input-entrevista-abm').checked; const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00', dispAllDay = [ { inicio: hApe, fin: hCie } ]; dO.disponibilidad = { 'L': dispAllDay, 'M': dispAllDay, 'X': dispAllDay, 'J': dispAllDay, 'V': dispAllDay, 'S': dispAllDay }; } await addDoc(collection(db, coleccion), dO); cargarABM(coleccion, titulo, cont); }); 
    }); 
}

window.abrirEdicionABM = async function(id, col, nom, cor, cel, ali, ent) { 
    document.getElementById('abm-edit-id').value = id; document.getElementById('abm-edit-coleccion').value = col; document.getElementById('label-abm-edit-nombre').innerHTML = col === 'usuarios_sistema' ? `Correo: <input type="text" id="abm-edit-nombre" class="modern-input" required>` : `Nombre: <input type="text" id="abm-edit-nombre" class="modern-input" required>`; document.getElementById('abm-edit-nombre').value = nom;
    if(col==='profesores') { document.getElementById('div-abm-edit-profe').style.display='block'; document.getElementById('abm-edit-correo').value=cor; document.getElementById('abm-edit-celular').value=cel; document.getElementById('abm-edit-alias').value=ali; document.getElementById('abm-edit-entrevista').checked=ent; try { const pr = (await getDoc(doc(db, col, id))).data(); const hApe = configApp.hora_apertura || '09:00'; const hCie = configApp.hora_cierre || '22:00'; diasSemana.forEach(dia => { const dD = pr.disponibilidad ? pr.disponibilidad[dia.id] : []; const tI = document.getElementById(`disp-p-${dia.id}-inicio`), tF = document.getElementById(`disp-p-${dia.id}-fin`), cA = document.getElementById(`disp-p-${dia.id}-all`), cN = document.getElementById(`disp-p-${dia.id}-none`), sE = document.getElementById(`estado-p-${dia.id}`); tI.disabled=false; tF.disabled=false; cA.checked=false; cN.checked=false; sE.textContent=""; if (!dD || dD.length===0) { cN.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Bloqueado"; sE.style.color="var(--accent-red)"; } else if (dD[0].inicio===hApe && dD[0].fin===hCie) { cA.checked=true; tI.disabled=true; tF.disabled=true; tI.value=''; tF.value=''; sE.textContent="Libre"; sE.style.color="var(--accent-teal)"; } else { tI.value = dD[0].inicio; tF.value = dD[0].fin; } }); } catch(e) {} } else document.getElementById('div-abm-edit-profe').style.display='none'; document.getElementById('modal-abm-edit').showModal(); 
}

window.eliminarABM = async function(id, col) { if(confirm("¿Eliminar?")) { await deleteDoc(doc(db, col, id)); document.querySelector(`[data-vista="ABM-${window.tituloABMActual}"]`).click(); } }

document.getElementById('btn-guardar-abm-edit').addEventListener('click', async (e) => { setBotonCargando(e.target, true); const id = document.getElementById('abm-edit-id').value, col = document.getElementById('abm-edit-coleccion').value, nombreInput = document.getElementById('abm-edit-nombre').value; const dO = col === 'usuarios_sistema' ? { email: nombreInput.toLowerCase() } : { nombre: nombreInput }; if(col==='profesores') { dO.correo_calendario=document.getElementById('abm-edit-correo').value; dO.celular=document.getElementById('abm-edit-celular').value; dO.alias_transferencia=document.getElementById('abm-edit-alias').value; dO.entrevista=document.getElementById('abm-edit-entrevista').checked; const disp = {}; const hApe = configApp.hora_apertura || '09:00'; const hCie = configApp.hora_cierre || '22:00'; diasSemana.forEach(d => { const cA = document.getElementById(`disp-p-${d.id}-all`).checked, cN = document.getElementById(`disp-p-${d.id}-none`).checked; let i = document.getElementById(`disp-p-${d.id}-inicio`).value, f = document.getElementById(`disp-p-${d.id}-fin`).value; if(cN) disp[d.id] = []; else if(cA) disp[d.id] = [{inicio:hApe, fin:hCie}]; else { if(i||f) disp[d.id] = [{inicio: i||hApe, fin: f||hCie}]; else disp[d.id] = []; } }); dO.disponibilidad = disp; } await updateDoc(doc(db, col, id), dO); document.getElementById('modal-abm-edit').close(); document.querySelector(`[data-vista="ABM-${window.tituloABMActual}"]`).click(); setBotonCargando(e.target, false); });

document.querySelectorAll('#sidebar .nav-item').forEach(item => { item.addEventListener('click', (e) => { if(e.target.closest('summary')) return; document.querySelectorAll('#sidebar .nav-item').forEach(el => el.classList.remove('active')); e.target.closest('.nav-item').classList.add('active'); cargarVista(e.target.closest('.nav-item').getAttribute('data-vista')); document.getElementById('sidebar').classList.remove('active'); const overlay = document.getElementById('mobile-overlay'); if (overlay) overlay.style.display = 'none'; }); });

window.cargarVista = cargarVista;
