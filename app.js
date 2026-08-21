import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, updateDoc, deleteDoc, doc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const APP_VERSION = "v4.9.0"; // v4.9.0: Notación abreviada de horarios (18+, 18-) y disponibilidad multi-rango por día
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzbDuDGOab4azS27_7Mt9KYixAHNgeygMgCOZHTL1I3Poba5yLceWM56qJd59hPx6g/exec";

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

let agrupadorActual = 'ninguno';
let filtroChipActual = 'Todos';
let filtroAlarmaActual = 'Todos'; 
let vistaModo = 'lista'; 
let selectedBulkIds = [];
let matchListenersAttached = false;
let matchCantidadActual = 4;
let matchGruposSugeridos = [];
let matchProfesores = []; 

let agrupadorNivel1 = 'ninguno';
let agrupadorNivel2 = 'ninguno';
let agrupadorNivel3 = 'ninguno';

['select-agrupador-1', 'select-agrupador-2', 'select-agrupador-3'].forEach((id, idx) => {
    const sel = document.getElementById(id);
    if (sel) {
        sel.addEventListener('change', (e) => {
            if (idx === 0) agrupadorNivel1 = e.target.value;
            if (idx === 1) agrupadorNivel2 = e.target.value;
            if (idx === 2) agrupadorNivel3 = e.target.value;
            cargarVista(estadoActualVista);
        });
    }
});

document.querySelectorAll('.filter-alarm').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-alarm').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        filtroAlarmaActual = e.target.getAttribute('data-val');
        cargarVista(estadoActualVista);
    });
});

const btnToggleView = document.getElementById('btn-toggle-view');
if(btnToggleView) {
    btnToggleView.addEventListener('click', () => {
        vistaModo = vistaModo === 'lista' ? 'kanban' : 'lista';
        btnToggleView.innerHTML = vistaModo === 'lista' ? '<span class="nav-icon" style="filter:none;">📋</span> Vista Tablero' : '<span class="nav-icon" style="filter:none;">📄</span> Vista Lista';
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

function setBotonCargando(btn, cargando) {
    if (!btn) return;
    if (cargando) {
        if (!btn.dataset.textoOriginal || btn.dataset.textoOriginal === '⏳ Procesando...') {
            btn.dataset.textoOriginal = btn.innerHTML;
        }
        btn.innerHTML = '⏳ Procesando...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.style.pointerEvents = 'none';
        btn.style.cursor = 'wait';
    } else {
        btn.innerHTML = btn.dataset.textoOriginal && btn.dataset.textoOriginal !== '⏳ Procesando...' ? btn.dataset.textoOriginal : 'Guardar';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
    }
}

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

async function conectarGoogle() { 
    try { await signInWithPopup(auth, provider); } catch (err) { alert("Error al intentar iniciar sesión."); } 
}

window.alert = function(msg, tipo = '') {
    const container = document.getElementById('toast-container');
    if (!container) return console.log(msg); 
    const toast = document.createElement('div');
    
    let extraClass = '';
    const str = String(msg || '');
    if (tipo === 'success' || str.includes('✅') || str.toLowerCase().includes('éxito') || str.toLowerCase().includes('copiado') || str.toLowerCase().includes('guardado')) {
        extraClass = 'toast-success';
    } else if (tipo === 'error' || str.includes('❌') || str.toLowerCase().includes('error') || str.toLowerCase().includes('falló') || str.toLowerCase().includes('no se pudo')) {
        extraClass = 'toast-error';
    } else if (tipo === 'warning' || str.includes('⚠️') || str.toLowerCase().includes('atención') || str.toLowerCase().includes('alerta')) {
        extraClass = 'toast-warning';
    }

    toast.className = `toast-notification ${extraClass}`.trim();
    toast.textContent = str;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 300); 
    }, 4500);
};

// ================================================================
// MODAL DE CONFIRMACIÓN CUSTOM — Punto 6 (reemplaza confirm() nativo)
// ================================================================
window.confirmar = function(titulo, descripcion = '', textoBoton = 'Confirmar', icono = '⚠️') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirmar-accion');
        if (!modal) { resolve(window._originalConfirm ? window._originalConfirm(titulo) : false); return; }

        document.getElementById('confirmar-titulo').textContent = titulo;
        document.getElementById('confirmar-descripcion').textContent = descripcion;
        document.getElementById('confirmar-btn-ok').textContent = textoBoton;
        document.getElementById('confirmar-icon').textContent = icono;

        const btnOk = document.getElementById('confirmar-btn-ok');
        const btnCancelar = document.getElementById('confirmar-btn-cancelar');

        const clonOk = btnOk.cloneNode(true);
        const clonCancelar = btnCancelar.cloneNode(true);
        btnOk.replaceWith(clonOk);
        btnCancelar.replaceWith(clonCancelar);

        clonOk.addEventListener('click', () => { modal.close(); resolve(true); }, { once: true });
        clonCancelar.addEventListener('click', () => { modal.close(); resolve(false); }, { once: true });

        modal.addEventListener('close', () => resolve(false), { once: true });
        modal.showModal();
    });
};

// ================================================================
// SKELETON LOADER — Punto 7
// ================================================================
function mostrarSkeleton(containerId = 'lista-generica', cantidad = 5) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    cont.style.display = 'flex';
    cont.style.flexDirection = 'column';
    cont.style.gap = '10px';
    cont.innerHTML = Array.from({ length: cantidad }, () => `
        <div class="skeleton-row">
            <div class="skeleton-line fat"></div>
            <div class="skeleton-line medium"></div>
            <div class="skeleton-line short"></div>
        </div>
    `).join('');
}

let alumnoIdActual = null;
let estadoActualVista = 'Dashboard';
window.tituloABMActual = '';
let configApp = {};
let chartFlowInst = null, chartEntrevistasInst = null, chartAltasInst = null, chartFlowDashboardInst = null;
let clipboardDisponibilidad = null, clipboardDisponibilidadProfe = null; 
let historialActual = []; 

const configNodosFlujo = [
    { id: 'Pendiente procesar', label: 'Sin Agendar', icon: '⏳', color: 'node-blue-1', hexColor: '#74a9d8', vistaDestino: 'Inbox - Pendientes' },
    { id: 'Pendiente validación por profe', label: 'Validando con Evaluador', icon: '👨‍🏫', color: 'node-blue-2', hexColor: '#4a8cd2', vistaDestino: 'Inbox - En Validacion' },
    { id: 'Pendiente validación por alumno', label: 'Validando con Alumno', icon: '🧑‍🎓', color: 'node-blue-3', hexColor: '#256bbb', vistaDestino: 'Inbox - En Validacion' },
    { id: 'Agenda confirmada', label: 'Entrevista Confirmada', icon: '✅', color: 'node-blue-4', hexColor: '#134b8c', vistaDestino: 'Inbox - Confirmadas' },
    { id: 'Lista de espera', label: 'Lista de Espera', icon: '🛋️', color: 'node-amber', hexColor: '#e5a93d', vistaDestino: 'Lista de Espera' },
    { id: 'Validando Grupo', label: 'Grupos en Validación', icon: '👥', color: 'node-purple', hexColor: '#8e44ad', vistaDestino: 'Match - En Validacion' },
    { id: 'Pre-alta Pendiente', label: 'Altas Pendientes', icon: '📝', color: 'node-green-1', hexColor: '#5cc88a', vistaDestino: 'Altas - Pendientes' },
    { id: 'Pre-alta Iniciada', label: 'Altas en Curso', icon: '🚀', color: 'node-green-2', hexColor: '#31a364', vistaDestino: 'Altas - En Curso' },
    { id: 'Altas Incompletas', label: 'Altas Confirmadas Incompletas', icon: '⚠️', color: 'node-green-3', hexColor: '#1b7f47', vistaDestino: 'Altas - Confirmadas', filterFn: (d) => (d.estado_agenda === 'Alta Efectiva' || d.estado_agenda === 'Alta Ilegal') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5) },
    { id: 'Altas Finalizadas', label: 'Altas Finalizadas', icon: '🏆', color: 'node-green-4', hexColor: '#0d5c30', vistaDestino: 'Altas - Finalizadas', filterFn: (d) => (d.estado_agenda === 'Alta Efectiva' || d.estado_agenda === 'Alta Ilegal') && (d.checklist_alta && d.checklist_alta.filter(Boolean).length === 5) }
];

const quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
const quillInforme = new Quill('#informe-editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
const quillPopup = new Quill('#informe-popup-editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });

const diasSemana = [{ id:'L',nombre:'Lunes'}, {id:'M',nombre:'Martes'}, {id:'X',nombre:'Miércoles'}, {id:'J',nombre:'Jueves'}, {id:'V',nombre:'Viernes'}, {id:'S',nombre:'Sábado'}];

// =======================================================================
// HELPERS PARA FORMATEO DE HORARIOS (18+, 18-, Libre, Rangos, Multi-rango)
// =======================================================================
function limpiarHoraParaChip(h) {
    if (!h) return '';
    return h.endsWith(':00') ? h.replace(':00', '') : h;
}

function formatearChipHorario(rango, hApertura = '09:00', hCierre = '22:00') {
    if (!rango || (!rango.inicio && !rango.fin)) return '-';
    let ini = (rango.inicio || '').trim();
    let fin = (rango.fin || '').trim();

    // Caso 0: Todo el día
    if ((ini === hApertura || !ini) && (fin === hCierre || !fin)) {
        return 'Libre';
    }

    // Caso 1: Desde la apertura (o sin inicio especificado) hasta X hora -> "18-"
    if ((ini === hApertura || !ini) && fin && fin < hCierre) {
        return `${limpiarHoraParaChip(fin)}-`;
    }

    // Caso 2: Desde X hora hasta el cierre (o sin fin especificado) -> "18+"
    if (ini && (fin === hCierre || !fin || fin >= hCierre)) {
        return `${limpiarHoraParaChip(ini)}+`;
    }

    // Caso 3: Franja acotada intermedia -> "14-17" o "18:30-20"
    return `${limpiarHoraParaChip(ini)}-${limpiarHoraParaChip(fin)}`;
}

function formatearDiaCompletoChips(rangosDia, hApertura = '09:00', hCierre = '22:00') {
    if (!rangosDia || rangosDia.length === 0) return '-';
    const chips = rangosDia.map(r => formatearChipHorario(r, hApertura, hCierre)).filter(c => c && c !== '-');
    if (chips.length === 0) return '-';
    if (chips.includes('Libre')) return 'Libre';
    return chips.join('<br>');
}

// =======================================================================
// RENDERIZADO DINÁMICO DE DISPONIBILIDAD EN FORMULARIOS (MULTI-RANGO)
// =======================================================================
function crearFilaRangoHTML(diaId, inicio = '', fin = '', esProfe = false, index = 0) {
    return `
        <div class="rango-item" style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <input type="time" class="modern-input rango-inicio" value="${inicio}" style="width:auto; padding:5px 8px; font-size:12.5px;">
            <span style="font-size:12px; color:var(--text-muted);">a</span>
            <input type="time" class="modern-input rango-fin" value="${fin}" style="width:auto; padding:5px 8px; font-size:12.5px;">
            <button type="button" class="btn-quitar-rango" data-dia="${diaId}" data-profe="${esProfe}" title="Eliminar este rango" style="background:none; border:none; cursor:pointer; font-size:1em; padding:2px 4px; ${index === 0 ? 'display:none;' : ''}">🗑️</button>
        </div>
    `;
}

function renderContenedorDisponibilidad(containerId, esProfe = false) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    cont.innerHTML = '';
    diasSemana.forEach(dia => {
        const diaRow = document.createElement('div');
        diaRow.className = 'dia-disponibilidad-row';
        diaRow.id = `row-${prefix}${dia.id}`;
        diaRow.style.cssText = 'background:var(--hover-bg); border:1px solid var(--border-color); border-radius:8px; padding:8px 12px; margin-bottom:8px; display:flex; flex-direction:column; gap:4px;';
        
        diaRow.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="min-width:75px; font-size:13px; color:var(--text-main);">${dia.nombre}:</strong>
                    <label style="font-weight:normal; margin:0; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px; text-transform:none;">
                        <input type="checkbox" id="${prefix}${dia.id}-all" class="chk-disp-all" data-dia="${dia.id}" data-profe="${esProfe}"> Todo el día
                    </label>
                    <label style="font-weight:normal; margin:0; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px; text-transform:none;">
                        <input type="checkbox" id="${prefix}${dia.id}-none" class="chk-disp-none" data-dia="${dia.id}" data-profe="${esProfe}"> No disp.
                    </label>
                </div>
                <div style="display:flex; align-items:center; gap:6px; margin-left:auto;">
                    <button type="button" class="${esProfe ? 'btn-copy-disp-p' : 'btn-copy-disp'}" data-dia="${dia.id}" title="Copiar horario" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📋</button>
                    <button type="button" class="${esProfe ? 'btn-paste-disp-p' : 'btn-paste-disp'}" data-dia="${dia.id}" title="Pegar horario" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📥</button>
                    <span id="${esProfe ? 'estado-p-' : 'estado-'}${dia.id}" class="estado-disp" style="width:75px; text-align:right; font-size:11.5px; font-weight:700;"></span>
                </div>
            </div>
            <div id="rangos-${prefix}${dia.id}" class="rangos-list" style="display:flex; flex-direction:column; gap:2px; margin-top:4px;">
                ${crearFilaRangoHTML(dia.id, '', '', esProfe, 0)}
            </div>
            <div style="display:flex; justify-content:flex-start; margin-top:2px;">
                <button type="button" class="btn-agregar-rango" data-dia="${dia.id}" data-profe="${esProfe}" style="background:#fff; border:1px dashed var(--border-color); border-radius:6px; padding:3px 8px; font-size:11.5px; font-weight:600; color:var(--accent-teal); cursor:pointer; display:inline-flex; align-items:center; gap:4px;">➕ Agregar Rango</button>
            </div>
        `;
        cont.appendChild(diaRow);
    });
}

function actualizarBotonesQuitarRango(diaId, esProfe = false) {
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    const container = document.getElementById(`rangos-${prefix}${diaId}`);
    if (!container) return;
    const items = container.querySelectorAll('.rango-item');
    items.forEach((item) => {
        const btnDel = item.querySelector('.btn-quitar-rango');
        if (btnDel) {
            btnDel.style.display = items.length > 1 ? 'inline-block' : 'none';
        }
    });
}

function agregarRangoDia(diaId, inicio = '', fin = '', esProfe = false) {
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    const container = document.getElementById(`rangos-${prefix}${diaId}`);
    if (!container) return;
    const count = container.querySelectorAll('.rango-item').length;
    container.insertAdjacentHTML('beforeend', crearFilaRangoHTML(diaId, inicio, fin, esProfe, count));
    actualizarBotonesQuitarRango(diaId, esProfe);
    const chkAll = document.getElementById(`${prefix}${diaId}-all`);
    const chkNone = document.getElementById(`${prefix}${diaId}-none`);
    if (chkAll) chkAll.checked = false;
    if (chkNone) chkNone.checked = false;
    window.updateDispStateForDay(diaId, esProfe);
}

window.updateDispStateForDay = function(dId, isProfe = false) {
    const prefix = isProfe ? 'disp-p-' : 'disp-', estadoPrefix = isProfe ? 'estado-p-' : 'estado-';
    const chkAll = document.getElementById(`${prefix}${dId}-all`), chkNone = document.getElementById(`${prefix}${dId}-none`);
    const spanE = document.getElementById(`${estadoPrefix}${dId}`);
    const rangosContainer = document.getElementById(`rangos-${prefix}${dId}`);
    const btnAgregar = document.querySelector(`.btn-agregar-rango[data-dia="${dId}"][data-profe="${isProfe}"]`);
    if (!chkAll || !rangosContainer) return;
    
    const inputs = rangosContainer.querySelectorAll('input[type="time"]');
    const btnsDel = rangosContainer.querySelectorAll('.btn-quitar-rango');
    
    if (chkAll.checked) {
        if (chkNone) chkNone.checked = false;
        inputs.forEach(inp => { inp.disabled = true; inp.value = ''; });
        btnsDel.forEach(b => b.disabled = true);
        if (btnAgregar) btnAgregar.style.display = 'none';
        if (spanE) { spanE.textContent = "Libre"; spanE.style.color = "var(--accent-teal)"; }
    } else if (chkNone && chkNone.checked) {
        chkAll.checked = false;
        inputs.forEach(inp => { inp.disabled = true; inp.value = ''; });
        btnsDel.forEach(b => b.disabled = true);
        if (btnAgregar) btnAgregar.style.display = 'none';
        if (spanE) { spanE.textContent = "Bloqueado"; spanE.style.color = "var(--accent-red)"; }
    } else {
        inputs.forEach(inp => { inp.disabled = false; });
        btnsDel.forEach(b => b.disabled = false);
        if (btnAgregar) btnAgregar.style.display = 'inline-flex';
        if (spanE) { spanE.textContent = ""; }
    }
};

// Render inicial de contenedores
renderContenedorDisponibilidad('contenedor-disponibilidad', false);
renderContenedorDisponibilidad('contenedor-disponibilidad-profe', true);

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

const defaultCfg = { 
    hora_apertura: '09:00', hora_cierre: '22:00', calendario_por_defecto: 'productora.mandalahouse@gmail.com', identificador_bateria: '🥁', emoji_guitarra: '🎸', emoji_cajon: '📦', emoji_canto: '🎤', emoji_piano: '🎹', emoji_bajo: '🎸', valor_clase: '$10.000', cantidad_aulas: '3', cantidad_baterias: '2', texto_nombre_agendar: 'MDL {nombre} {edad} {año_actual} @{instrumento} @{suscripcion}', formato_evento_reserva: '❓📋 {emojiinstrumento} {alumno} {edad}', formato_evento_confirmado: '✅📋 {emojiinstrumento} {alumno} {edad}', texto_profe: "*⚠ PRE CHECK - ENTREVISTA*\n📅 *FECHA: {fecha_hora}*\n*👥 ALUMNO:*\n🔹 {nombre} ({edad})\n🔹 {instrumento} | {suscripcion}\n*INFO:*\n{descripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", texto_opciones_multiples: "*⚠ PRE CHECK - ENTREVISTA*\n*🎈 CONFIRMAR ASISTENCIA*\n\n📅 OPCIONES DE FECHA:\n{opciones}\n\n*Por favor confirmar asistencia y agendar en tu calendario. En cuanto reciba el OK y pago del alumno, te aviso con la confirmación definitiva.*\n\n*📰 INFO PARA LA ENTREVISTA:*\n{descripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", texto_alumno: "📅 *Agenda de clase*\n🧩 {fecha_hora} con Profe {profe}\n✅ Inscripción: forms.gle/xxx\n💸 Valor: {valor}\n🧩 Alias: {alias_profe}", texto_conf_alumno: "Genial Gracias!\nTe esperamos!\n\n🧩 Día y horario: {fecha_hora}\n🧩 Profe: {profe}\n📍 *Dirección:* Av. Cabildo 2970\n\nEl profe te va a estar escribiendo el mismo día!", texto_conf_profe: "*✅ ENTREVISTA CONFIRMADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*👥 DATOS DEL ALUMNO:*\n🔹 Nombre: {nombre}\n🔹 Edad: {edad}\n🔹 Instrumento: {instrumento}\n🔹 Clase: {suscripcion}\n\n*📰 INFO PARA LA ENTREVISTA:*\n{descripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", texto_cancela_alumno: "*❗ PRE CHECK - ENTREVISTA*\n*❌ RESERVA CANCELADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*👥 DATOS DEL ALUMNO:*\n🔹 Nombre: {nombre}\n🔹 Edad: {edad}\n🔹 Instrumento: {instrumento}\n🔹 Clase: {suscripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", texto_prealta: "*⚠ PRE ALTA INICIADA*\n\n*👥 DATOS DE LA SUSCRIPCIÓN:*\n🔹 Suscripción: {suscripcion}\n🔹 Nombre de alumno: {nombre}\n🔹 Instrumento: {instrumento}\n🔹 Grupo: {grupo}\n🔹 Profesor: {profe}\n🔹 Inicio de clases: {fecha inicio clases}", texto_alta_confirmada: "*✅ NUEVA ALTA CONFIRMADA*\n\n*👥 DATOS DE LA SUSCRIPCIÓN:*\n🔹 Suscripción: {suscripcion}\n🔹 Nombre de alumno: {nombre}\n🔹 Instrumento: {instrumento}\n🔹 Grupo: {grupo}\n🔹 Profesor: {profe}\n🔹 Inicio de clases: {fecha inicio clases}",
    grupo_min_integrantes: 2,
    grupo_max_integrantes: 6,
    reglas_edad_match: [
        { desde: 20, rango_min: -4, rango_max: 8 },
        { desde: 30, rango_min: -5, rango_max: 8 },
        { desde: 40, rango_min: -5, rango_max: 10 },
        { desde: 50, rango_min: -10, rango_max: 10 },
        { desde: 60, rango_min: -5, rango_max: 10 },
        { desde: 70, rango_min: -5, rango_max: 5 }
    ],
    reglas_edad_ninos: { hasta: 13, libre: true }
};
async function cargarConfig() { const docSnap = await getDoc(doc(db, "configuracion", "general")); configApp = docSnap.exists() ? { ...defaultCfg, ...docSnap.data() } : defaultCfg; }

function formatearTextoHistorial(historialArr) {
    if (!historialArr || historialArr.length === 0) return 'Sin registros previos.';
    const sorted = [...historialArr].sort((a, b) => a.id - b.id);
    return sorted.map(h => {
        let t = (h.texto || '')
            .replace(/<br\s*[\/]?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]*>?/gm, '')
            .replace(/\r\n/g, '\n')
            .replace(/\n\s*\n/g, '\n')
            .trim();
        return `[${h.fecha}] ${t}`;
    }).filter(Boolean).join('\n');
}

function reemplazarVariables(texto, datos) { let res = texto; for (const [key, value] of Object.entries(datos)) { res = res.replaceAll(`{${key}}`, value || ''); } res = res.replace(/\{[a-zA-Z0-9_ ]+\}/g, ''); return res; }
function formatoLocalISO(date) { const tzo = -date.getTimezoneOffset(), dif = tzo >= 0 ? '+' : '-', pad = num => (num < 10 ? '0' : '') + num; return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + dif + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60); }
function formatearFechaAmi(fechaIsoStr) { const d = new Date(fechaIsoStr), dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; let min = d.getMinutes(), minStr = min === 0 ? 'hs' : `:${min < 10 ? '0'+min : min}hs`; return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth()+1} ${d.getHours()}${minStr}`; }

function getEmojiInstrumento(instrumentoInput, cfg, al = null) {
    let instRef = '';
    if (al && al.instrumento_asignado) {
        instRef = al.instrumento_asignado;
    } else if (typeof instrumentoInput === 'string' && instrumentoInput.trim()) {
        instRef = instrumentoInput;
    } else if (Array.isArray(instrumentoInput) && instrumentoInput.length > 0) {
        instRef = instrumentoInput[0]; // Tomar el primer instrumento si es array
    }
    const c = cfg || configApp || defaultCfg;
    const instL = (instRef || '').toLowerCase();
    if (instL.includes('bater')) return c.identificador_bateria || '🥁';
    if (instL.includes('guitarra')) return c.emoji_guitarra || '🎸';
    if (instL.includes('cajón') || instL.includes('cajon')) return c.emoji_cajon || '📦';
    if (instL.includes('canto') || instL.includes('voz')) return c.emoji_canto || '🎤';
    if (instL.includes('piano') || instL.includes('teclado')) return c.emoji_piano || '🎹';
    if (instL.includes('bajo')) return c.emoji_bajo || '🎸';
    return '🎵';
}

function construirTitulosEvento(al, tipo, cfg) {
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
async function crearEventoCalendario(calendarId, titulo, inicioStr, finStr, descripcion = "") { 
    return await fetchCalendarAPI('createEvent', { 
        calendarId, 
        summary: titulo, 
        description: descripcion,
        start: { dateTime: inicioStr }, 
        end: { dateTime: finStr } 
    }); 
}
async function actualizarEventoCalendario(calendarId, eventId, titulo, descripcion) { return await fetchCalendarAPI('updateEvent', { calendarId, eventId, summary: titulo, description: descripcion }); }
async function eliminarEventoCalendario(calendarId, eventId) { return await fetchCalendarAPI('deleteEvent', { calendarId, eventId }); }

function construirTitulosPrealtaYAlta(al, tipo, cfg) {
    // tipo: 'prealta' | 'confirmada'
    const tipoSusc = detectarTipoSuscripcion(al.tipo_suscripcion || '');
    const esInd = tipoSusc === 'individual';
    const instElegido = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : al.instrumento) || '';
    const emojiInst = getEmojiInstrumento(instElegido, cfg, al);
    const nombreAlumno = al.nombre || 'Alumno';
    const nombreGrupo = al.grupo_asignado || 'Grupo';

    let titulo = '';
    if (tipo === 'prealta') {
        if (esInd) {
            titulo = `🚀${emojiInst} ${nombreAlumno}`;
        } else {
            titulo = `🚀🧩 ${nombreGrupo}`;
        }
    } else {
        // Alta confirmada
        if (esInd) {
            titulo = `${emojiInst} ${nombreAlumno}`;
        } else {
            titulo = `🧩 ${nombreGrupo}`;
        }
    }
    return { tituloProfe: titulo, tituloDefecto: titulo };
}

function construirDescripcionEventoAlta(al, esGrupo = false, alumnosGrupo = []) {
    if (esGrupo && alumnosGrupo.length > 0) {
        const listaIntegrantes = alumnosGrupo.map(a => `• ${a.nombre} (${a.instrumento_asignado || (Array.isArray(a.instrumento) ? a.instrumento[0] : a.instrumento) || 'Instrumento'}) - Tel: ${a.celular || '-'}`).join('\n');
        return `👥 INTEGRANTES DEL GRUPO (${alumnosGrupo.length}):\n${listaIntegrantes}\n\n🏫 Grupo: ${al.grupo_asignado || '-'}\n👨‍🏫 Profe: ${al.reserva_profe_nombre || '-'}`;
    }
    const instStr = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || '-'));
    const descP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : '';
    return `👤 ALUMNO:\n• Nombre: ${al.nombre}\n• Edad: ${al.edad || '-'}\n• Celular: ${al.celular || '-'}\n• Instrumento: ${instStr}\n• Suscripción: ${al.tipo_suscripcion || '-'}\n\n📝 INFORMACIÓN ADICIONAL:\n${descP || 'Sin notas adicionales.'}`;
}

async function getCalendarIdParaAlumno(al) {
    if (al.calendario_evento_alta) return al.calendario_evento_alta;
    if (al.reserva_cal_id) return al.reserva_cal_id;
    if (al.reserva_profe_id) { const pDoc = await getDoc(doc(db, "profesores", al.reserva_profe_id)); if (pDoc.exists() && pDoc.data().correo_calendario) return pDoc.data().correo_calendario; }
    if (al.reserva_profe_nombre) { const pQ = await getDocs(query(collection(db, "profesores"), where("nombre", "==", al.reserva_profe_nombre))); if (!pQ.empty && pQ.docs[0].data().correo_calendario) return pQ.docs[0].data().correo_calendario; }
    return configApp.calendario_por_defecto || null;
}

async function sincronizarEventoPrealtaCalendar(al, esIndividual, fIsoStart, fIsoEnd, otrosAlumnosDelGrupo = []) {
    try {
        const titulos = construirTitulosPrealtaYAlta(al, 'prealta', configApp);
        const desc = construirDescripcionEventoAlta(al, !esIndividual, otrosAlumnosDelGrupo);
        let primaryCalId = await getCalendarIdParaAlumno(al);
        let fallbackCalId = configApp.calendario_por_defecto || 'productora.mandalahouse@gmail.com';

        // Si es grupal, verificar si algún compañero del grupo ya tiene evento creado
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

        // Crear evento: intentar en primaryCalId, luego en fallback
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

async function sincronizarEventoAltaConfirmadaCalendar(al, esIndividual, otrosAlumnosDelGrupo = []) {
    try {
        const titulos = construirTitulosPrealtaYAlta(al, 'confirmada', configApp);
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

async function eliminarEventoAltaSeguro(al) {
    const evId = al.id_evento_alta;
    const calId = al.calendario_evento_alta || await getCalendarIdParaAlumno(al);
    if (evId && calId) {
        try { await eliminarEventoCalendario(calId, evId); } catch(e) {}
    }
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

function getFechaReferenciaAlumno(al) {
    if (!al) return null;
    const est = al.estado_agenda;
    
    // Estados sin fecha límite activa: no deben calcular urgencias ni aparecer en prioridades
    if (est === 'Lista de espera' || est === 'Pendiente procesar' || est === 'Pre-alta Pendiente' || est === 'Agenda suspendida' || est === 'Alta Suspendida' || est === 'Alta Finalizada') {
        return null;
    }

    if (est === 'Pre-alta Iniciada' && al.fecha_inicio_clases) {
        const d = new Date(al.fecha_inicio_clases);
        return isNaN(d.getTime()) ? null : d;
    }

    if (est === 'Pendiente validación por profe' || est === 'Pendiente validación por alumno' || est === 'Agenda confirmada') {
        if (al.reserva_inicio) {
            const d = new Date(al.reserva_inicio);
            return isNaN(d.getTime()) ? null : d;
        }
        if (al.opciones_propuestas && Array.isArray(al.opciones_propuestas) && al.opciones_propuestas.length > 0) {
            const fechas = al.opciones_propuestas
                .map(o => o.inicio ? new Date(o.inicio) : null)
                .filter(d => d && !isNaN(d.getTime()))
                .sort((a, b) => a - b);
            if (fechas.length > 0) return fechas[0];
        }
    }

    return null;
}

function getEstadoYBadge(al) {
    let colorIndicador = 'ind-gray', colorBadge = 'bg-gray', claseTexto = 'text-gray', txtTiempo = '', txtEstado = (al.estado_agenda || '').toUpperCase(), fechaCalculo = null;
    
    if (al.estado_agenda === 'Pendiente procesar') {
        txtEstado = 'SIN AGENDAR';
        colorBadge = 'bg-blue-1';
        colorIndicador = 'ind-blue-1';
    } else if (al.estado_agenda === 'Pendiente validación por profe') {
        txtEstado = 'PENDIENTE VALIDACIÓN POR EVALUADOR';
        colorBadge = 'bg-blue-2';
        colorIndicador = 'ind-blue-2';
    } else if (al.estado_agenda === 'Pendiente validación por alumno') {
        txtEstado = 'PENDIENTE VALIDACIÓN POR ALUMNO';
        colorBadge = 'bg-blue-3';
        colorIndicador = 'ind-blue-3';
    } else if (al.estado_agenda === 'Agenda confirmada') {
        txtEstado = 'ENTREVISTA CONFIRMADA';
        colorBadge = 'bg-blue-4';
        colorIndicador = 'ind-blue-4';
    } else if (al.estado_agenda === 'Lista de espera') {
        txtEstado = 'LISTA DE ESPERA';
        colorBadge = 'bg-amber';
        colorIndicador = 'ind-amber';
    } else if (al.estado_agenda === 'Validando Grupo') {
        txtEstado = 'GRUPOS EN VALIDACIÓN';
        colorBadge = 'bg-purple';
        colorIndicador = 'ind-purple';
    } else if (al.estado_agenda === 'Pre-alta Pendiente') {
        txtEstado = 'ALTA PENDIENTE';
        colorBadge = 'bg-green-1';
        colorIndicador = 'ind-green-1';
    } else if (al.estado_agenda === 'Pre-alta Iniciada') {
        txtEstado = 'ALTA EN CURSO';
        colorBadge = 'bg-green-2';
        colorIndicador = 'ind-green-2';
    } else if (al.estado_agenda === 'Altas Incompletas') {
        txtEstado = 'ALTA CONFIRMADA INCOMPLETA';
        colorBadge = 'bg-green-3';
        colorIndicador = 'ind-green-3';
    } else if (al.estado_agenda === 'Alta Efectiva' || al.estado_agenda === 'Alta Ilegal' || al.estado_agenda === 'Alta Finalizada') {
        let checks = al.checklist_alta || [];
        if (checks.filter(Boolean).length === 5 || al.estado_agenda === 'Alta Finalizada') {
            colorBadge = 'bg-green-4';
            txtEstado = 'ALTA FINALIZADA';
            colorIndicador = 'ind-green-4';
        } else {
            colorBadge = 'bg-green-3';
            txtEstado = 'ALTA CONFIRMADA INCOMPLETA';
            colorIndicador = 'ind-green-3';
        }
    } else if (al.estado_agenda && (al.estado_agenda.includes('suspendida') || al.estado_agenda === 'Alta Suspendida')) {
        txtEstado = al.estado_agenda.toUpperCase();
        colorBadge = 'bg-red';
        colorIndicador = 'ind-red';
    }

    fechaCalculo = getFechaReferenciaAlumno(al);

    if (fechaCalculo) {
        let diffHs = (fechaCalculo - new Date()) / (1000 * 60 * 60);
        if (diffHs < 0) { 
            claseTexto = 'text-gray'; 
            let horas = Math.abs(Math.round(diffHs));
            txtTiempo = horas > 24 ? `Vencida hace ${Math.round(horas/24)} d` : `Vencida hace ${horas} hs`;
        } else if (diffHs <= 24) { 
            claseTexto = 'text-red'; 
            txtTiempo = `Faltan ${Math.round(diffHs)} hs`;
        } else if (diffHs <= 48) { 
            claseTexto = 'text-yellow'; 
            txtTiempo = `Faltan ${Math.round(diffHs)} hs`;
        } else { 
            claseTexto = 'text-teal'; 
            txtTiempo = `Faltan ${Math.round(diffHs/24)} d`;
        }
    }

    return { colorIndicador, colorBadge, claseTexto, txtTiempo, txtEstado };
}

function generarBotonesPrincipalesVisibles(al, id) {
    let html = '';
    const est = al.estado_agenda;

    if (est === 'Pendiente procesar') {
        html += `<button type="button" class="row-quick-btn primary btn-buscar-agenda" data-id="${id}">🔍 Buscar Agenda</button>`;
    } else if (est === 'Pendiente validación por profe') {
        html += `<button type="button" class="row-quick-btn primary btn-validado-profe-popup" data-id="${id}">✅ Validado por Evaluador</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'Pendiente validación por alumno') {
        html += `<button type="button" class="row-quick-btn primary btn-confirmar-entrevista" data-id="${id}">✅ Confirmar Agenda</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'Agenda confirmada') {
        html += `<button type="button" class="row-quick-btn primary btn-admision-finalizada" data-id="${id}">🏁 Admisión Finalizada</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'Agenda suspendida') {
        html += `<button type="button" class="row-quick-btn primary btn-recuperar-agenda" data-id="${id}">♻️ Recuperar Agenda</button>`;
    } else if (est === 'Lista de espera') {
        html += `<button type="button" class="row-quick-btn primary btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'Validando Grupo') {
        const isConfirmed = al.estado_validacion_alumno === 'confirmado';
        html += `<button type="button" class="row-quick-btn secondary" onclick="window.enviarWhatsAppValidacionGrupo('${id}')">💬 WhatsApp</button>`;
        html += `<button type="button" class="row-quick-btn ${isConfirmed ? 'primary' : 'secondary'}" onclick="window.toggleValidacionAlumnoGrupo('${id}', ${!isConfirmed})">${isConfirmed ? '✔️ Desmarcar' : '✔️ Confirmó'}</button>`;
        html += `<button type="button" class="row-quick-btn primary" onclick="window.aprobarAlumnoIndividualPrealta('${id}')">🚀 Aprobar</button>`;
        html += `<button type="button" class="row-quick-btn danger" onclick="window.rechazarAlumnoGrupoYVolverEspera('${id}')">❌</button>`;
    } else if (est === 'Pre-alta Pendiente') {
        html += `<button type="button" class="row-quick-btn primary btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
    } else if (est === 'Pre-alta Iniciada') {
        html += `<button type="button" class="row-quick-btn primary btn-abrir-confirmar-alta" data-id="${id}">✅ Confirmar Alta</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Pre-Alta</button>`;
    } else if (est === 'Alta Efectiva' || est === 'Alta Ilegal' || est === 'Alta Finalizada') {
        let checks = al.checklist_alta || [];
        const esFinalizada = checks.filter(Boolean).length === 5 || est === 'Alta Finalizada';
        if (!esFinalizada) {
            html += `<button type="button" class="row-quick-btn primary btn-finalizar-alta-directa" data-id="${id}">🏁 Finalizar Alta</button>`;
        }
        html += `<button type="button" class="row-quick-btn secondary btn-reenviar-alta" data-id="${id}">💬 Copiar texto Alta Conf.</button>`;
    } else if (est === 'Alta Suspendida') {
        html += `<button type="button" class="row-quick-btn primary btn-devolver-espera" data-id="${id}">♻️ Enviar a Espera</button>`;
    }

    return html;
}

function generarBotonesAccion(al, id, esModal = false) {
    let accionesHtml = '';
    const est = al.estado_agenda;

    if (esModal) {
        // En el modal de edición se ofrecen todas las acciones principales arriba
        if (est === 'Pendiente procesar') {
            accionesHtml += `<button type="button" class="dropdown-item btn-buscar-agenda" data-id="${id}">🔍 Buscar Agenda</button>`;
        } else if (est === 'Pendiente validación por profe') {
            accionesHtml += `<button type="button" class="dropdown-item btn-validado-profe-popup" data-id="${id}">✅ Validado por Evaluador</button>`;
            accionesHtml += `<button type="button" class="dropdown-item btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
        } else if (est === 'Pendiente validación por alumno') {
            accionesHtml += `<button type="button" class="dropdown-item btn-confirmar-entrevista" data-id="${id}">✅ Confirmar Agenda</button>`;
            accionesHtml += `<button type="button" class="dropdown-item btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
        } else if (est === 'Agenda confirmada') {
            accionesHtml += `<button type="button" class="dropdown-item btn-admision-finalizada" data-id="${id}">🏁 Admisión Finalizada</button>`;
            accionesHtml += `<button type="button" class="dropdown-item btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
        } else if (est === 'Agenda suspendida') {
            accionesHtml += `<button type="button" class="dropdown-item btn-recuperar-agenda" data-id="${id}">♻️ Recuperar Agenda</button>`;
        } else if (est === 'Lista de espera') {
            accionesHtml += `<button type="button" class="dropdown-item btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
            accionesHtml += `<button type="button" class="dropdown-item btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
        } else if (est === 'Pre-alta Pendiente') {
            accionesHtml += `<button type="button" class="dropdown-item btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
            accionesHtml += `<button type="button" class="dropdown-item btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
        } else if (est === 'Pre-alta Iniciada') {
            accionesHtml += `<button type="button" class="dropdown-item btn-abrir-confirmar-alta" data-id="${id}">✅ Confirmar Alta</button>`;
            accionesHtml += `<button type="button" class="dropdown-item btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Pre-Alta</button>`;
        } else if (est === 'Alta Efectiva' || est === 'Alta Ilegal' || est === 'Alta Finalizada') {
            let checks = al.checklist_alta || [];
            const esFinalizada = checks.filter(Boolean).length === 5 || est === 'Alta Finalizada';
            if (!esFinalizada) {
                accionesHtml += `<button type="button" class="dropdown-item btn-finalizar-alta-directa" data-id="${id}">🏁 Finalizar Alta</button>`;
            }
            accionesHtml += `<button type="button" class="dropdown-item btn-reenviar-alta" data-id="${id}">💬 Copiar texto Alta Conf.</button>`;
        } else if (est === 'Alta Suspendida') {
            accionesHtml += `<button type="button" class="dropdown-item btn-devolver-espera" data-id="${id}">♻️ Enviar a Espera</button>`;
        }
    }

    // Acciones secundarias en el menú de los tres puntos
    if (est === 'Pendiente procesar') {
        accionesHtml += `<button type="button" class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'Pendiente validación por profe') {
        accionesHtml += `<button type="button" class="dropdown-item btn-reenviar-profe" data-id="${id}">💬 Re-enviar a Evaluador</button>`;
        accionesHtml += `<button type="button" class="dropdown-item btn-cancelar-reserva" data-id="${id}">❌ Cancelar Validación</button>`;
        accionesHtml += `<button type="button" class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'Pendiente validación por alumno') {
        accionesHtml += `<button type="button" class="dropdown-item btn-reenviar-alumno" data-id="${id}">💬 Re-Enviar a Alumno</button>`;
        accionesHtml += `<button type="button" class="dropdown-item btn-cancelar-reserva" data-id="${id}">❌ Cancelar Agenda</button>`;
        accionesHtml += `<button type="button" class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'Agenda confirmada') {
        accionesHtml += `<button type="button" class="dropdown-item btn-enviar-conf-profe" data-id="${id}">💬 Enviar conf. a Evaluador</button>`;
        accionesHtml += `<button type="button" class="dropdown-item btn-enviar-conf-alumno" data-id="${id}">💬 Enviar conf. a Alumno</button>`;
        accionesHtml += `<button type="button" class="dropdown-item btn-cancelar-reserva" data-id="${id}">↩️ Cancelar Confirmación</button>`;
    } else if (est === 'Agenda suspendida') {
        // Sin acciones secundarias
    } else if (est === 'Lista de espera') {
        accionesHtml += `<button type="button" class="dropdown-item btn-abrir-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'Validando Grupo') {
        // Acciones ya visibles en tarjeta
    } else if (est === 'Pre-alta Pendiente') {
        accionesHtml += `<button type="button" class="dropdown-item btn-suspender-alta" data-id="${id}">❌ Suspender</button>`;
        accionesHtml += `<button type="button" class="dropdown-item" onclick="window.copiarFilaExcelBD('${id}')">📋 Generar registro de BD</button>`;
        accionesHtml += `<button type="button" class="dropdown-item" onclick="window.copiarFilaExcelFacturacion('${id}')">💰 Generar registro de Facturación</button>`;
    } else if (est === 'Pre-alta Iniciada') {
        accionesHtml += `<button type="button" class="dropdown-item btn-reenviar-prealta" data-id="${id}">💬 Notificar a Profesor</button>`;
        accionesHtml += `<button type="button" class="dropdown-item btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
        accionesHtml += `<button type="button" class="dropdown-item btn-suspender-alta" data-id="${id}">❌ Suspender Alta</button>`;
        accionesHtml += `<button type="button" class="dropdown-item" onclick="window.copiarFilaExcelBD('${id}')">📋 Generar registro de BD</button>`;
        accionesHtml += `<button type="button" class="dropdown-item" onclick="window.copiarFilaExcelFacturacion('${id}')">💰 Generar registro de Facturación</button>`;
    } else if (est === 'Alta Efectiva' || est === 'Alta Ilegal' || est === 'Alta Finalizada') {
        accionesHtml += `<button type="button" class="dropdown-item btn-suspender-alta" data-id="${id}">❌ Suspender Alta</button>`;
        accionesHtml += `<button type="button" class="dropdown-item" onclick="window.copiarFilaExcelBD('${id}')">📋 Generar registro de BD</button>`;
        accionesHtml += `<button type="button" class="dropdown-item" onclick="window.copiarFilaExcelFacturacion('${id}')">💰 Generar registro de Facturación</button>`;
    } else if (est === 'Alta Suspendida') {
        accionesHtml += `<button type="button" class="dropdown-item" onclick="window.copiarFilaExcelBD('${id}')">📋 Generar registro de BD</button>`;
    }

    if (est !== 'Pre-alta Pendiente' && est !== 'Lista de espera' && est !== 'Alta Suspendida' && est !== 'Alta Efectiva' && est !== 'Alta Ilegal' && est !== 'Alta Finalizada') {
        accionesHtml = `<button type="button" class="dropdown-item btn-nombre-agendar" data-id="${id}">📋 Generar nombre agenda WS</button>` + accionesHtml;
    }

    return accionesHtml;
}

function generarFilaAlumno(al, id, vista, isKanban = false) {
    const info = getEstadoYBadge(al);
    let instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento;
    let suscStr = al.tipo_suscripcion || ''; let cel = al.celular || ''; let edad = al.edad ? al.edad + 'a' : '-';

    const botonesVisibles = generarBotonesPrincipalesVisibles(al, id);
    const botonesSecundarios = generarBotonesAccion(al, id);

    if (isKanban) {
        let opcionesKanbanHtml = '';
        if (al.opciones_propuestas && al.opciones_propuestas.length > 1) {
            opcionesKanbanHtml = `
                <div style="font-size:11px; color:var(--accent-teal); margin-top:5px; line-height:1.3; background:var(--hover-bg); padding:4px 6px; border-radius:6px; border:1px solid var(--border-color);">
                    <div style="font-weight:700;">📅 ${al.opciones_propuestas.length} Opciones:</div>
                    ${al.opciones_propuestas.map(o => `<div style="color:var(--text-muted); font-size:10px;"><strong>${o.letra || '-'}:</strong> ${o.fechaTexto}</div>`).join('')}
                </div>
            `;
        }

        return `
        <div class="kanban-card btn-editar-alumno" draggable="true" ondragstart="window.dragKanban(event, '${id}')" data-id="${id}">
            <div class="kanban-card-title">
                <span style="display:flex; align-items:center; gap:6px;"><div class="row-indicator ${info.colorIndicador}"></div>${al.nombre}</span>
                <span style="font-size:16px;" class="btn-row-action" onclick="event.stopPropagation(); window.abrirOpcionesKanban('${id}', this)">⋮</span>
            </div>
            <div class="kanban-card-sub">${edad} • <strong style="color:var(--accent-teal);">${instStr}</strong></div>
            ${opcionesKanbanHtml}
            <div class="priority-text ${info.claseTexto}">${info.txtTiempo}</div>
            ${botonesVisibles ? `<div class="row-actions-group" style="margin-top:6px; justify-content:stretch;">${botonesVisibles}</div>` : ''}
            <div class="dropdown-menu-wrapper" id="menu-kanban-${id}" style="display:none; position:absolute; top:30px; right:10px;">
                <div class="dropdown-menu">${botonesSecundarios}</div>
            </div>
        </div>`;
    }

    let dispHtml = '<div class="row-disp-grid">';
    diasSemana.forEach(d => {
        const rangos = al.disponibilidad && al.disponibilidad[d.id];
        const tiene = Array.isArray(rangos) && rangos.length > 0;
        const txt = tiene ? formatearDiaCompletoChips(rangos, configApp.hora_apertura || '09:00', configApp.hora_cierre || '22:00') : '-';
        const esActivo = tiene && txt !== '-';
        dispHtml += `<div class="disp-box ${esActivo ? 'active' : ''}"><div class="disp-day">${d.id}</div><div class="disp-time">${txt}</div></div>`;
    });
    dispHtml += '</div>';

    const tieneSecundarios = botonesSecundarios && botonesSecundarios.trim().length > 0;
    let menuAcciones = `
        <div class="row-actions-group">
            ${botonesVisibles}
            ${tieneSecundarios ? `
                <div class="alumno-actions row-actions-container">
                    <button type="button" class="btn-row-action" title="Más opciones">⋮</button>
                    <div class="dropdown-menu-wrapper">
                        <div class="dropdown-menu">${botonesSecundarios}</div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    let checklistHtml = '';
    const esAltaConfirmadaOFinalizada = al.estado_agenda === 'Alta Efectiva' || al.estado_agenda === 'Alta Ilegal' || al.estado_agenda === 'Alta Finalizada';
    if (esAltaConfirmadaOFinalizada || al.checklist_alta) {
        const checks = al.checklist_alta || [false, false, false, false, false];
        const pasostitulos = [
            '1. Notificar Alumno',
            '2. Pago / Comprobante',
            '3. Cargar en Sistema',
            '4. Grupo WhatsApp',
            '5. Notificar Profe'
        ];
        const completados = checks.filter(Boolean).length;
        const porcentaje = Math.round((completados / 5) * 100);
        const barColor = completados === 5 ? 'var(--accent-teal)' : (completados >= 3 ? '#e5a93d' : 'var(--accent-red)');

        checklistHtml = `
            <div class="alta-checklist-wrapper" style="margin-top:10px; padding:10px 12px; background:var(--hover-bg); border-radius:10px; border:1px solid var(--border-color);" onclick="event.stopPropagation();">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:11.5px; font-weight:700; color:var(--text-main);">
                    <span>📋 Checklist de Alta (${completados}/5)</span>
                    <span style="color:${barColor};">${porcentaje}%</span>
                </div>
                <div style="width:100%; height:6px; background:#e9e5de; border-radius:4px; overflow:hidden; margin-bottom:8px;">
                    <div style="width:${porcentaje}%; height:100%; background:${barColor}; transition:width 0.3s ease;"></div>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px 12px; font-size:11px; color:var(--text-muted);">
                    ${checks.map((chk, idx) => `
                        <label style="display:inline-flex; align-items:center; gap:5px; margin:0; cursor:pointer; font-weight:600; text-transform:none; color:${chk ? 'var(--text-main)' : 'var(--text-muted)'};">
                            <input type="checkbox" class="chk-alta-paso" data-id="${id}" data-idx="${idx}" ${chk ? 'checked' : ''} style="accent-color:var(--accent-teal); width:15px; height:15px; cursor:pointer;">
                            <span style="${chk ? 'text-decoration:none;' : ''}">${pasostitulos[idx] || `Paso ${idx+1}`}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let fechaMetaHtml = '';
    if (al.opciones_propuestas && al.opciones_propuestas.length > 1) {
        fechaMetaHtml = `
            <div style="margin-top:3px; background:rgba(0, 123, 143, 0.07); border:1px solid rgba(0, 123, 143, 0.2); border-radius:6px; padding:4px 8px;">
                <div style="font-size:11px; color:var(--accent-teal); font-weight:700;">📅 ${al.opciones_propuestas.length} Opciones propuestas:</div>
                <div style="font-size:10.5px; color:var(--text-main); line-height:1.35; margin-top:2px;">
                    ${al.opciones_propuestas.map(o => `<div><strong>${o.letra || '-'}:</strong> ${o.fechaTexto}</div>`).join('')}
                </div>
            </div>
        `;
    } else if (al.horario_match || al.reserva_fecha_texto) {
        fechaMetaHtml = `<div style="font-size:11px; color:var(--text-muted); font-weight:600;">📅 ${al.horario_match || al.reserva_fecha_texto}</div>`;
    }

    return `
        <div class="swipe-wrapper" data-id="${id}">
            <div class="swipe-bg-actions">
                <button class="swipe-btn left btn-nota-rapida" data-id="${id}">📝 Nota</button>
                <button class="swipe-btn right btn-row-actions-swipe" data-id="${id}">⋮ Acciones</button>
            </div>
            <div class="row-item swipe-content btn-editar-alumno" data-id="${id}">
                <div class="row-content-wrapper">
                    <div class="row-header">
                        <input type="checkbox" class="bulk-chk" data-id="${id}" onclick="event.stopPropagation(); window.toggleBulkSelection('${id}', this.checked)">
                        <div class="row-indicator ${info.colorIndicador}"></div>
                        <div class="row-main-info">
                            <div class="row-name">
                                <span>${al.nombre}</span>
                                <span class="status-badge ${info.colorBadge}">${info.txtEstado}</span>
                            </div>
                            <div class="row-sub"><span>${cel}</span> • <span>${edad}</span> • <strong style="color:var(--accent-teal);">${instStr}</strong> • <span>${suscStr}</span></div>
                        </div>
                    </div>
                    ${dispHtml}
                    ${checklistHtml}
                    <div class="row-meta">
                        <div>${((estadoActualVista && (estadoActualVista.startsWith('Inbox') || estadoActualVista === 'Lista de Espera' || estadoActualVista === 'Dashboard')) || ['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno', 'Agenda confirmada', 'Agenda suspendida', 'Lista de espera'].includes(al.estado_agenda)) ? 'Evaluador' : 'Profe'}: <strong style="color:var(--text-main);">${al.reserva_profe_nombre || '-'}</strong></div>
                        ${al.grupo_asignado ? `<div>Grupo: <strong style="color:var(--accent-teal);">${al.grupo_asignado}</strong></div>` : ''}
                        ${fechaMetaHtml}
                        <div class="priority-text ${info.claseTexto}" style="margin-top:2px;">${info.txtTiempo}</div>
                    </div>
                    ${menuAcciones}
                </div>
            </div>
        </div>
    `;
}

window.dragKanban = function(ev, id) { ev.dataTransfer.setData("text", id); }
window.allowDropKanban = function(ev) { ev.preventDefault(); }
window.dropKanban = async function(ev, newState) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData("text");
    if (!id || !newState) return;
    try {
        await updateDoc(doc(db, "alumnos", id), { estado_agenda: newState });
        cargarVista(estadoActualVista);
    } catch(e) { alert("Error moviendo tarjeta."); }
}
window.abrirOpcionesKanban = function(id, btnElement) {
    const menu = document.getElementById(`menu-kanban-${id}`);
    const isVisible = menu.style.display === 'block';
    document.querySelectorAll('[id^="menu-kanban-"]').forEach(m => m.style.display = 'none'); 
    if (!isVisible) menu.style.display = 'block';
}

function renderKanban(containerId, datos, vista) {
    const cont = document.getElementById(containerId);
    let columnas = [];
    if (vista === 'Inbox - Pendientes') {
        columnas = [
            {id: 'Pendiente procesar', titulo: 'Sin Agendar'},
            {id: 'Pendiente validación por profe', titulo: 'Validando con Profe'},
            {id: 'Pendiente validación por alumno', titulo: 'Validando con Alum'}
        ];
    } else if (vista === 'Altas - Pendientes') {
        columnas = [
            {id: 'Pre-alta Pendiente', titulo: 'Altas Pendientes'},
            {id: 'Pre-alta Iniciada', titulo: 'Altas en Curso'}
        ];
    } else {
        cont.innerHTML = '<div style="padding:20px; color:var(--text-muted);">La vista tablero solo está disponible para bandejas con flujo de estados.</div>';
        return;
    }

    let html = '';
    columnas.forEach(col => {
        const items = datos.filter(d => d.estado_agenda === col.id);
        html += `
        <div class="kanban-column" ondrop="window.dropKanban(event, '${col.id}')" ondragover="window.allowDropKanban(event)">
            <div class="kanban-column-title">${col.titulo} <span class="group-count">${items.length}</span></div>
            <div class="kanban-items">
                ${items.map(a => generarFilaAlumno(a, a.id, vista, true)).join('')}
            </div>
        </div>`;
    });
    cont.innerHTML = html;
}

window.toggleBulkSelection = function(id, isChecked) {
    if (isChecked && !selectedBulkIds.includes(id)) selectedBulkIds.push(id);
    else if (!isChecked) selectedBulkIds = selectedBulkIds.filter(i => i !== id);
    actualizarBulkBar();
}

function actualizarBulkBar() {
    const bar = document.getElementById('bulk-actions-bar');
    const btnProp = document.getElementById('btn-bulk-propuesta-grupo');
    const btnBD = document.getElementById('btn-bulk-copiar-bd');
    const btnFact = document.getElementById('btn-bulk-copiar-fact');
    if (selectedBulkIds.length > 0) {
        document.getElementById('bulk-count').textContent = `${selectedBulkIds.length} seleccionados`;
        bar.style.display = 'flex';
        if (btnProp) {
            btnProp.style.display = (estadoActualVista === 'Lista de Espera' || selectedBulkIds.length >= 2) ? 'inline-block' : 'none';
        }
        const esAltas = estadoActualVista && estadoActualVista.startsWith('Altas');
        if (btnBD) btnBD.style.display = esAltas ? 'inline-block' : 'none';
        if (btnFact) btnFact.style.display = esAltas ? 'inline-block' : 'none';
    } else {
        bar.style.display = 'none';
    }
}

document.getElementById('btn-bulk-cancelar').addEventListener('click', () => {
    selectedBulkIds = [];
    document.querySelectorAll('.bulk-chk').forEach(c => c.checked = false);
    actualizarBulkBar();
});

document.getElementById('btn-bulk-suspender').addEventListener('click', async () => {
    const motivo = prompt("Motivo de suspensión para todos los seleccionados:");
    if (!motivo) return;
    document.getElementById('btn-bulk-suspender').textContent = "Procesando...";
    const now = new Date(); const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
    for (let id of selectedBulkIds) {
        try {
            const al = (await getDoc(doc(db, "alumnos", id))).data();
            if (al.id_evento_reserva) await eliminarEventoSeguro(al);
            const hist = al.historial || []; hist.push({ id: Date.now(), texto: `Suspendido masivamente. Motivo: ${motivo}`, fecha: fechaStr });
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda suspendida", motivo_suspension: motivo, reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, historial: hist });
        } catch(e) {}
    }
    selectedBulkIds = [];
    document.getElementById('btn-bulk-suspender').textContent = "Suspender";
    actualizarBulkBar();
    cargarVista(estadoActualVista);
});

// =======================================================================
// EXPORTACIÓN Y COPIADO PARA EXCEL / GOOGLE SHEETS (BD Y FACTURACIÓN)
// =======================================================================

function formatearFechaAltaParaExcel(al) {
    if (al.fecha_alta_confirmada) {
        const d = new Date(al.fecha_alta_confirmada);
        if (!isNaN(d.getTime())) return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    }
    if (al.fecha_alta_finalizada) {
        const d = new Date(al.fecha_alta_finalizada);
        if (!isNaN(d.getTime())) return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    }
    if (al.fecha_prealta) {
        const d = new Date(al.fecha_prealta);
        if (!isNaN(d.getTime())) return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    }
    const now = new Date();
    return `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;
}

function formatearFechaInicioParaExcel(al) {
    if (al.fecha_inicio_clases) {
        const d = new Date(al.fecha_inicio_clases);
        if (!isNaN(d.getTime())) {
            const dia = d.getDate().toString().padStart(2, '0');
            const mes = (d.getMonth() + 1).toString().padStart(2, '0');
            const hora = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            return `${dia}/${mes} ${hora}:${min}`;
        }
    }
    if (al.dia_match && al.horario_inicio_match) {
        return `${al.dia_match} ${al.horario_inicio_match}`;
    }
    return al.reserva_fecha_texto || "";
}

window.generarFilaExcelBD = function(al) {
    const instFinal = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || ''));
    const pagoStr = al.estado_agenda === 'Alta Efectiva' ? 'SI' : (al.estado_agenda === 'Alta Ilegal' ? 'NO' : '');
    const fechaAlta = formatearFechaAltaParaExcel(al);
    const fechaInicio = formatearFechaInicioParaExcel(al);

    // Columnas según especificación:
    // 1: Alumno
    // 2: Profesor
    // 3: Día (Vacío)
    // 4: Ensamble (nombre grupo o "Individual")
    // 5: Nivel del Ensamble
    // 6: Instrumento
    // 7: Clase (tipo_suscripcion)
    // 8: Subclase (Vacío)
    // 9: Estado ("Alta")
    // 10: Pagó? (SI / NO)
    // 11: Facturación (Vacío)
    // 12: CUIT (Vacío)
    // 13: En lista de difusión? (Vacío)
    // 14: Fecha de Alta (DD/MM/YYYY)
    // 15: Fecha de Baja (Vacío)
    // 16: Fecha de Inicio de clases (DD/MM HH:mm)
    return [
        al.nombre || '',
        al.reserva_profe_nombre || '',
        '',
        al.grupo_asignado || 'Individual',
        al.nivel || '',
        instFinal,
        al.tipo_suscripcion || '',
        '',
        'Alta',
        pagoStr,
        '',
        '',
        '',
        fechaAlta,
        '',
        fechaInicio
    ].join('\t');
};

window.generarFilaExcelFacturacion = function(al) {
    // Columnas según especificación:
    // 1: Alumno
    // 2: Profe
    // 3: Clase (nombre de grupo o "Individual")
    // 4: Cuota esperada (Vacío)
    // 5: Pago real (Vacío)
    // 6: Pago real esperado (Vacío)
    // 7: Descuento (Vacío)
    // 8: Proporcional (Vacío)
    // 9: Observación (Vacío)
    // 10: A quién pagó (Vacío)
    // 11: Forma de pago (Vacío)
    // 12: Moroso? (Vacío)
    return [
        al.nombre || '',
        al.reserva_profe_nombre || '',
        al.grupo_asignado || 'Individual',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ''
    ].join('\t');
};

window.copiarFilaExcelBD = async function(id) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const al = alDoc.data();
        const fila = window.generarFilaExcelBD(al);
        await navigator.clipboard.writeText(fila);
        alert(`📋 Registro para BD de GoogleSheet copiado al portapapeles:\n\n${fila}`);
    } catch(err) {
        alert("Error al generar registro: " + err.message);
    }
};

window.copiarFilaExcelFacturacion = async function(id) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const al = alDoc.data();
        const fila = window.generarFilaExcelFacturacion(al);
        await navigator.clipboard.writeText(fila);
        alert(`💰 Registro para Facturación de GoogleSheet copiado al portapapeles:\n\n${fila}`);
    } catch(err) {
        alert("Error al generar registro: " + err.message);
    }
};

window.copiarSeleccionExcelBD = async function() {
    if (selectedBulkIds.length === 0) return alert("Seleccioná al menos un alumno.");
    try {
        let filas = [];
        for (const id of selectedBulkIds) {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (alDoc.exists()) {
                filas.push(window.generarFilaExcelBD(alDoc.data()));
            }
        }
        const textoCompleto = filas.join('\n');
        await navigator.clipboard.writeText(textoCompleto);
        alert(`📋 ${filas.length} fila(s) para BD de GoogleSheet copiadas al portapapeles. ¡Listo para pegar en Sheets!`);
    } catch(err) {
        alert("Error al copiar selección: " + err.message);
    }
};

window.copiarSeleccionExcelFacturacion = async function() {
    if (selectedBulkIds.length === 0) return alert("Seleccioná al menos un alumno.");
    try {
        let filas = [];
        for (const id of selectedBulkIds) {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (alDoc.exists()) {
                filas.push(window.generarFilaExcelFacturacion(alDoc.data()));
            }
        }
        const textoCompleto = filas.join('\n');
        await navigator.clipboard.writeText(textoCompleto);
        alert(`💰 ${filas.length} fila(s) para Facturación de GoogleSheet copiadas al portapapeles. ¡Listo para pegar en Sheets!`);
    } catch(err) {
        alert("Error al copiar selección: " + err.message);
    }
};

const btnBulkCopiarBD = document.getElementById('btn-bulk-copiar-bd');
if (btnBulkCopiarBD) btnBulkCopiarBD.addEventListener('click', window.copiarSeleccionExcelBD);

const btnBulkCopiarFact = document.getElementById('btn-bulk-copiar-fact');
if (btnBulkCopiarFact) btnBulkCopiarFact.addEventListener('click', window.copiarSeleccionExcelFacturacion);

// =======================================================================
// NUEVA PROPUESTA DE GRUPO MANUAL (DESDE LISTA DE ESPERA)
// =======================================================================

const btnBulkProp = document.getElementById('btn-bulk-propuesta-grupo');
if (btnBulkProp) {
    btnBulkProp.addEventListener('click', async () => {
        if (selectedBulkIds.length < 2) {
            alert('Por favor seleccioná al menos 2 alumnos para armar una propuesta de grupo.');
            return;
        }
        await abrirModalNuevaPropuestaGrupoManual();
    });
}

let alumnosPropuestaManualCache = [];

async function abrirModalNuevaPropuestaGrupoManual() {
    alumnosPropuestaManualCache = [];
    for (const id of selectedBulkIds) {
        try {
            const snap = await getDoc(doc(db, "alumnos", id));
            if (snap.exists()) alumnosPropuestaManualCache.push({ id: snap.id, ...snap.data() });
        } catch(e) {}
    }

    if (alumnosPropuestaManualCache.length === 0) return;

    // Cargar profesores en select
    const selProfe = document.getElementById('propuesta-manual-profe');
    if (selProfe) {
        try {
            const qP = await getDocs(collection(db, "profesores"));
            let profesList = [];
            qP.forEach(d => profesList.push({ id: d.id, ...d.data() }));
            selProfe.innerHTML = '<option value="">Seleccionar profesor...</option>' + profesList.map(p => {
                const skillsStr = (p.skills || []).join(', ');
                return `<option value="${p.id}" data-nombre="${p.nombre}">${p.nombre} ${skillsStr ? `(${skillsStr})` : ''}</option>`;
            }).join('');
        } catch(e) {}
    }

    // Renderizar lista de alumnos e instrumento asignado
    const contAl = document.getElementById('propuesta-manual-alumnos-container');
    if (contAl) {
        contAl.innerHTML = alumnosPropuestaManualCache.map(al => {
            const insts = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : ['Varios']);
            const optionsInst = insts.map(i => `<option value="${i}">${i}</option>`).join('');
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:var(--hover-bg); border-radius:8px; border:1px solid var(--border-color); gap:10px; flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:700; font-size:13px; color:var(--text-main);">👤 ${al.nombre}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${al.edad ? al.edad + 'a • ' : ''}${al.nivel || '-'} • ${al.tipo_suscripcion || ''}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:11px; color:var(--text-muted); font-weight:600;">Instrumento:</span>
                        <select class="propuesta-manual-inst-alumno modern-input" data-alumno-id="${al.id}" style="width:auto; padding:4px 8px; font-size:12px;">
                            ${optionsInst}
                        </select>
                    </div>
                </div>
            `;
        }).join('');
    }

    actualizarSugerenciaNombreGrupoManual();
    validarPropuestaManualMatch();

    // Listeners para auto-actualización
    ['propuesta-manual-profe', 'propuesta-manual-dia', 'propuesta-manual-hora-inicio', 'propuesta-manual-hora-fin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.onchange = () => {
                actualizarSugerenciaNombreGrupoManual();
                validarPropuestaManualMatch();
            };
        }
    });

    document.getElementById('modal-nueva-propuesta-grupo').showModal();
}

function actualizarSugerenciaNombreGrupoManual() {
    const selProfe = document.getElementById('propuesta-manual-profe');
    const dia = document.getElementById('propuesta-manual-dia')?.value || 'J';
    const horaIni = document.getElementById('propuesta-manual-hora-inicio')?.value || '19:30';
    const horaStr = horaIni.replace(':', '.');
    const profeNombre = selProfe?.selectedOptions[0]?.getAttribute('data-nombre') || '';
    const primerNombreProfe = profeNombre.split(' ')[0] || 'Profe';

    const inputNom = document.getElementById('propuesta-manual-nombre');
    if (inputNom && (!inputNom.value || inputNom.dataset.autogenerado === 'true')) {
        inputNom.value = `${dia}${horaStr} ${primerNombreProfe}`;
        inputNom.dataset.autogenerado = 'true';
    }
}

function validarPropuestaManualMatch() {
    const warnings = [];
    const dia = document.getElementById('propuesta-manual-dia')?.value || 'J';
    const horaIni = document.getElementById('propuesta-manual-hora-inicio')?.value || '19:30';
    const horaFin = document.getElementById('propuesta-manual-hora-fin')?.value || '21:00';
    const selProfe = document.getElementById('propuesta-manual-profe');
    const profeId = selProfe?.value;

    if (!profeId) {
        warnings.push('⚠️ No se ha seleccionado un profesor asignado.');
    }

    // 1. Validar disponibilidad de cada alumno
    alumnosPropuestaManualCache.forEach(al => {
        if (al.disponibilidad && al.disponibilidad[dia]) {
            const slots = al.disponibilidad[dia];
            if (!slots || slots.length === 0) {
                warnings.push(`⚠️ ${al.nombre} no tiene disponibilidad registrada para el día ${dia}.`);
            } else {
                const coincide = slots.some(s => {
                    if (s.inicio === configApp.hora_apertura && s.fin === configApp.hora_cierre) return true;
                    return s.inicio <= horaIni && s.fin >= horaFin;
                });
                if (!coincide) {
                    warnings.push(`⚠️ ${al.nombre} tiene disponibilidad en ${dia} pero en un rango distinto a ${horaIni}-${horaFin} hs.`);
                }
            }
        } else {
            warnings.push(`⚠️ ${al.nombre} no tiene disponibilidad registrada para el día ${dia}.`);
        }
    });

    // 2. Validar edades
    const edades = alumnosPropuestaManualCache.map(a => parseInt(a.edad)).filter(e => !isNaN(e) && e > 0);
    if (edades.length > 1) {
        const minEdad = Math.min(...edades);
        const maxEdad = Math.max(...edades);
        const diff = maxEdad - minEdad;
        const maxPermitido = minEdad < 18 ? (configApp.reglas_edad_ninos?.diferencia_maxima_anios || 3) : (configApp.reglas_edad_match?.diferencia_maxima_anios || 10);
        if (diff > maxPermitido) {
            warnings.push(`⚠️ Diferencia de edad alta: el más joven tiene ${minEdad} años y el mayor ${maxEdad} años (diferencia de ${diff} años, regla sugerida: máx ${maxPermitido}).`);
        }
    }

    // 3. Validar cantidad
    if (alumnosPropuestaManualCache.length < 2) {
        warnings.push('⚠️ Se requieren al menos 2 integrantes para conformar un grupo.');
    }

    const warnCont = document.getElementById('propuesta-manual-warnings-container');
    const warnList = document.getElementById('propuesta-manual-warnings-list');
    if (warnCont && warnList) {
        if (warnings.length > 0) {
            warnList.innerHTML = warnings.map(w => `<div>• ${w}</div>`).join('');
            warnCont.style.display = 'block';
        } else {
            warnList.innerHTML = '';
            warnCont.style.display = 'none';
        }
    }

    return warnings;
}

const btnEjecutarPropManual = document.getElementById('btn-ejecutar-crear-propuesta-manual');
if (btnEjecutarPropManual) {
    btnEjecutarPropManual.addEventListener('click', async () => {
        const warnings = validarPropuestaManualMatch();
        if (warnings.length > 0) {
            if (!(await window.confirmar('Advertencias de compatibilidad', 'Â¿Forzar la creaciÃ³n de la propuesta de grupo de todas formas?', 'Forzar Propuesta', 'warning'))) {
                return;
            }
        }

        const selProfe = document.getElementById('propuesta-manual-profe');
        const profeId = selProfe.value;
        const profeNombre = selProfe.selectedOptions[0]?.getAttribute('data-nombre') || 'Profesor';
        const dia = document.getElementById('propuesta-manual-dia').value;
        const diasNombres = { 'L': 'Lunes', 'M': 'Martes', 'X': 'Miércoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sábado' };
        const diaNombre = diasNombres[dia] || dia;
        const horaIni = document.getElementById('propuesta-manual-hora-inicio').value || '19:30';
        const horaFin = document.getElementById('propuesta-manual-hora-fin').value || '21:00';
        const aula = document.getElementById('propuesta-manual-aula').value || 'Aula Principal';
        const nombreGrupo = document.getElementById('propuesta-manual-nombre').value.trim() || `${dia}${horaIni} ${profeNombre}`;
        const horarioTexto = `${diaNombre} ${horaIni} a ${horaFin} hs`;

        setBotonCargando(btnEjecutarPropManual, true);

        const now = new Date();
        const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
        const fechaSugerida = calcularProximaFechaDiaHora(dia, horaIni);

        try {
            for (const al of alumnosPropuestaManualCache) {
                const selInst = document.querySelector(`.propuesta-manual-inst-alumno[data-alumno-id="${al.id}"]`);
                const instAsignado = selInst ? selInst.value : (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || ''));

                const hist = al.historial || [];
                hist.push({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    texto: `Propuesta de grupo "${nombreGrupo}" armada manualmente (${horarioTexto}) con Profe ${profeNombre}. En espera de validación con el alumno.`,
                    fecha: fechaStr
                });

                await updateDoc(doc(db, "alumnos", al.id), {
                    estado_agenda: "Validando Grupo",
                    estado_validacion_alumno: "pendiente",
                    instrumento_asignado: instAsignado,
                    grupo_asignado: nombreGrupo,
                    reserva_profe_id: profeId || '',
                    reserva_profe_nombre: profeNombre,
                    reserva_fecha_texto: horarioTexto,
                    horario_match: horarioTexto,
                    dia_match: dia,
                    horario_inicio_match: horaIni,
                    horario_fin_match: horaFin,
                    aula_asignada: aula,
                    fecha_sugerida_inicio: fechaSugerida,
                    fecha_inicio_clases: fechaSugerida ? new Date(fechaSugerida).toISOString() : null,
                    historial: hist
                });
            }

            document.getElementById('modal-nueva-propuesta-grupo').close();
            selectedBulkIds = [];
            document.querySelectorAll('.bulk-chk').forEach(c => c.checked = false);
            actualizarBulkBar();

            alert(`✅ Propuesta de grupo "${nombreGrupo}" creada con éxito.\nLos alumnos pasaron a "Grupos en Validación".`);
            await cargarVista('Match - En Validacion');

        } catch(err) {
            console.error("Error al crear propuesta manual:", err);
            alert("Error: " + err.message);
        }

        setBotonCargando(btnEjecutarPropManual, false);
    });
}

function renderTimelineUnificado(containerId, configNodos, datos) {
    const cont = document.getElementById(containerId);
    if(!cont) return;
    
    let html = '<div class="timeline-wrapper" style="position:relative;"><div class="timeline-line"></div>';
    configNodos.forEach((n, index) => {
        const nodeData = datos.filter(d => n.filterFn ? n.filterFn(d) : d.estado_agenda === n.id);
        const count = nodeData.length;
        html += `<div class="timeline-node ${n.color}" data-id="${n.id}" data-index="${index}"><div class="timeline-count">${count}</div><div class="timeline-circle">${n.icon}</div><div class="timeline-label">${n.label}</div></div>`;
    });
    html += '</div>';
    cont.innerHTML = html;

    cont.querySelectorAll('.timeline-node').forEach(el => {
        el.addEventListener('click', () => {
            let newId = el.getAttribute('data-id');
            let index = parseInt(el.getAttribute('data-index'));
            
            let trayContainer = document.getElementById('timeline-tray-container');
            if (!trayContainer) {
                trayContainer = document.createElement('div');
                trayContainer.id = 'timeline-tray-container';
                trayContainer.className = 'timeline-tray-container';
                trayContainer.innerHTML = '<div class="timeline-tray" id="timeline-tray-content"></div>';
                if (cont.parentNode) cont.parentNode.appendChild(trayContainer);
                else cont.appendChild(trayContainer);
            }
            const trayContent = trayContainer.querySelector('#timeline-tray-content');
            
            if (el.classList.contains('active')) {
                el.classList.remove('active');
                if (trayContainer) trayContainer.style.display = 'none';
                return;
            }

            cont.querySelectorAll('.timeline-node').forEach(n => n.classList.remove('active'));
            el.classList.add('active');

            if (trayContainer && trayContent) {
                const nodeData = datos.filter(d => {
                    const nConf = configNodos.find(cn => cn.id === newId);
                    return nConf.filterFn ? nConf.filterFn(d) : d.estado_agenda === newId;
                });

                let totalNodes = configNodos.length;
                let percentage = (index / (totalNodes - 1)) * 100;
                if (percentage < 5) percentage = 5;
                if (percentage > 95) percentage = 95;
                trayContent.style.setProperty('--tray-arrow-pos', `${percentage}%`);
                
                if (nodeData.length === 0) {
                    trayContent.innerHTML = `<span style="color:var(--text-muted); font-size:13px; font-weight:500;">No hay alumnos en esta etapa.</span>`;
                } else {
                    trayContent.innerHTML = nodeData.map(al => {
                        let details = [];
                        if(al.edad) details.push(`${al.edad}a`);
                        let instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento;
                        if(instStr) details.push(`<strong style="color:var(--accent-teal)">${instStr}</strong>`);
                        if(al.reserva_profe_nombre) details.push(`Profe: ${al.reserva_profe_nombre}`);
                        if(al.grupo_asignado) details.push(`Grupo: ${al.grupo_asignado}`);
                        if(al.opciones_propuestas && al.opciones_propuestas.length > 1) {
                            details.push(`Opciones: ${al.opciones_propuestas.map(o => `${o.letra || '-'}: ${o.fechaTexto}`).join(' / ')}`);
                        } else if(al.reserva_fecha_texto) {
                            details.push(`Entrevista: ${al.reserva_fecha_texto}`);
                        }
                        if(al.fecha_inicio_clases) { const f = new Date(al.fecha_inicio_clases); details.push(`Alta: ${f.getDate()}/${f.getMonth()+1}`); }
                        
                        let detailsHtml = details.length > 0 ? `<div style="font-size:11px; color:var(--text-muted); line-height:1.4; display:flex; flex-wrap:wrap; gap:4px; row-gap:2px;"><span>${details.join('</span><span style="opacity:0.5">•</span><span>')}</span></div>` : '';
                        
                        const botonesVisibles = generarBotonesPrincipalesVisibles(al, al.id);
                        const botonesSecundarios = generarBotonesAccion(al, al.id);
                        const tieneSecundarios = botonesSecundarios && botonesSecundarios.trim().length > 0;

                        return `
                        <div class="tray-chip" style="display:flex; flex-direction:column; gap:8px;">
                            <div class="tray-chip-header" style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span class="tray-chip-name btn-editar-alumno" style="font-size:13.5px; font-weight:700; color:var(--text-main); cursor:pointer;" data-id="${al.id}">👤 ${al.nombre}</span>
                                <div class="row-actions-group">
                                    ${botonesVisibles}
                                    ${tieneSecundarios ? `
                                        <div class="alumno-actions row-actions-container" style="position:relative;">
                                            <button type="button" class="btn-row-action" title="Más opciones">⋮</button>
                                            <div class="dropdown-menu-wrapper" style="bottom:100%; top:auto; right:0; padding-bottom:8px; padding-top:0;">
                                                <div class="dropdown-menu">${botonesSecundarios}</div>
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                            ${detailsHtml}
                        </div>`;
                    }).join('');
                }
                
                if (window.innerWidth <= 850) {
                    const wrapper = cont.querySelector('.timeline-wrapper');
                    if (wrapper) wrapper.insertBefore(trayContainer, el.nextSibling);
                    trayContent.style.setProperty('--tray-arrow-pos', `20px`);
                } else if (cont.parentNode && !cont.parentNode.contains(trayContainer)) {
                    cont.parentNode.appendChild(trayContainer);
                }
                trayContainer.style.display = 'block';
            }
        });
    });
}

function renderListaFilas(containerId, datos, estadoId, configNodos) {
    const cont = document.getElementById(containerId);
    const contKanban = document.getElementById('kanban-generico');
    let filtrados = datos;

    const queryStr = (document.getElementById('input-buscador-general').value || '').toLowerCase();
    if (queryStr) { filtrados = filtrados.filter(al => al.nombre.toLowerCase().includes(queryStr)); }

    if (filtroChipActual !== 'Todos') {
        filtrados = filtrados.filter(al => { const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento]; return insts.includes(filtroChipActual); });
    }

    if (filtroAlarmaActual !== 'Todos') {
        filtrados = filtrados.filter(al => {
            const info = getEstadoYBadge(al);
            if (filtroAlarmaActual === 'Vencidos') return info.colorIndicador === 'ind-gray' && info.txtTiempo.includes('Vencida');
            if (filtroAlarmaActual === 'Criticos') return info.colorIndicador === 'ind-red' || info.colorIndicador === 'ind-yellow';
            if (filtroAlarmaActual === 'AlDia') return info.colorIndicador === 'ind-teal' || (info.colorIndicador === 'ind-gray' && !info.txtTiempo.includes('Vencida'));
            return true;
        });
    }

    if(filtrados.length === 0) { 
        cont.style.display = 'flex';
        if (contKanban) contKanban.style.display = 'none';
        cont.innerHTML = `
            <div style="color:var(--text-muted); text-align:center; padding:30px 20px; font-weight:500; background:var(--bg-sidebar); border-radius:12px; border:1px dashed var(--border-color); margin:15px 0; width:100%; box-sizing:border-box;">
                <div style="font-size:15px; font-weight:700; color:var(--text-main); margin-bottom:4px;">No hay alumnos en esta vista</div>
                <div style="font-size:12px; color:var(--text-muted);">Todas las gestiones están al día o no coinciden con los filtros aplicados.</div>
            </div>`; 
        if (contKanban) contKanban.innerHTML = '';
        return; 
    }

    if (vistaModo === 'kanban' && (estadoActualVista === 'Inbox - Pendientes' || estadoActualVista === 'Altas - Pendientes')) {
        cont.style.display = 'none';
        contKanban.style.display = 'flex';
        renderKanban('kanban-generico', filtrados, estadoActualVista);
    } else {
        contKanban.style.display = 'none';
        cont.style.display = 'flex';

        const nivelesActivos = [agrupadorNivel1, agrupadorNivel2, agrupadorNivel3].filter(n => n && n !== 'ninguno');

        function obtenerClaveAgrupador(al, criterio) {
            let clave = 'Sin clasificar';
            if (criterio === 'grupo') clave = al.grupo_asignado || 'Sin Grupo Asignado';
            else if (criterio === 'instrumento') clave = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || clave);
            else if (criterio === 'nivel') clave = al.nivel || clave;
            else if (criterio === 'suscripcion') clave = al.tipo_suscripcion || clave;
            else if (criterio === 'profe') {
                const esEtapaAdmision = (estadoActualVista && (estadoActualVista.startsWith('Inbox') || estadoActualVista === 'Lista de Espera' || estadoActualVista === 'Dashboard')) || (['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno', 'Agenda confirmada', 'Agenda suspendida', 'Lista de espera'].includes(al.estado_agenda));
                clave = al.reserva_profe_nombre || (esEtapaAdmision ? 'Sin Evaluador' : 'Sin Profesor');
            }
            return clave;
        }

        function renderNivelAgrupado(alumnos, nivelIndex) {
            if (nivelIndex >= nivelesActivos.length) {
                return alumnos.map(a => generarFilaAlumno(a, a.id, estadoActualVista)).join('');
            }

            const criterio = nivelesActivos[nivelIndex];
            const grupos = {};
            alumnos.forEach(al => {
                const clave = obtenerClaveAgrupador(al, criterio);
                if (!grupos[clave]) grupos[clave] = [];
                grupos[clave].push(al);
            });

            let outHtml = '';
            const levelNumber = nivelIndex + 1;

            for (const [clave, alumnosSubgrupo] of Object.entries(grupos)) {
                const idsStr = alumnosSubgrupo.map(a => a.id).join(',');
                const esSinGrupo = clave === 'Sin clasificar' || clave === 'Sin Grupo Asignado' || clave === 'Sin Entrevistador' || clave === 'Sin Profesor';
                
                let actionsHtml = '';
                if (criterio === 'grupo' && !esSinGrupo) {
                    actionsHtml = `
                        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <button type="button" class="btn-seleccionar-todo-grupo" data-ids="${idsStr}" style="font-size:11px; padding:3px 8px; border:1px solid var(--border-color); border-radius:6px; background:#fff; cursor:pointer; font-weight:600; color:var(--text-muted); font-family:inherit;">☑️ Seleccionar Grupo</button>
                            <button type="button" class="btn-iniciar-prealta-grupo" data-grupo="${clave}" data-ids="${idsStr}" style="font-size:11px; padding:3px 10px; border:none; border-radius:6px; background:var(--accent-teal); color:#fff; cursor:pointer; font-weight:700; font-family:inherit;">⚙️ Iniciar Pre-Alta Grupo</button>
                        </div>`;
                }

                const iconLevel = levelNumber === 1 ? '📂' : (levelNumber === 2 ? '📁' : '🔹');
                const styleIndent = levelNumber === 1 ? 'margin-top:12px; margin-bottom:6px;' : (levelNumber === 2 ? 'margin-left:14px; margin-top:8px; margin-bottom:4px; font-size:0.95em;' : 'margin-left:28px; margin-top:6px; margin-bottom:4px; font-size:0.9em;');
                const bgLevel = levelNumber === 1 ? 'var(--hover-bg)' : (levelNumber === 2 ? '#fdfbf7' : 'transparent');
                const borderLevel = levelNumber <= 2 ? 'border:1px solid var(--border-color);' : 'border-left:2px solid var(--accent-teal);';

                outHtml += `
                    <div class="group-header group-header-l${levelNumber}" style="${styleIndent} ${borderLevel} background:${bgLevel}; border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                        <div style="display:flex; align-items:center; gap:8px; font-weight:700; color:var(--text-main);">
                            <span>${iconLevel}</span> <span>${clave}</span> <span class="group-count" style="font-size:11px; padding:2px 7px;">${alumnosSubgrupo.length}</span>
                        </div>
                        ${actionsHtml}
                    </div>
                `;

                outHtml += renderNivelAgrupado(alumnosSubgrupo, nivelIndex + 1);
            }
            return outHtml;
        }

        let html = '';
        if (nivelesActivos.length === 0) {
            html = filtrados.map(a => generarFilaAlumno(a, a.id, estadoActualVista)).join('');
        } else {
            html = renderNivelAgrupado(filtrados, 0);
        }
        cont.innerHTML = html;
        
        selectedBulkIds.forEach(id => {
            const chk = document.querySelector(`.bulk-chk[data-id="${id}"]`);
            if (chk) chk.checked = true;
        });
    }
}

// =======================================================================
// NAVEGACIÓN PRINCIPAL: PESTAÑAS SEGMENTADAS Y BADGES EN VIVO
// =======================================================================

const moduloSubtabs = {
    'Inbox': [
        { vista: 'Inbox - Pendientes', label: 'Sin Agendar', icon: '⏳', countFn: (alumnos) => alumnos.filter(d => d.estado_agenda === 'Pendiente procesar').length },
        { vista: 'Inbox - En Validacion', label: 'En Espera de Validación', icon: '👨‍🏫', countFn: (alumnos) => alumnos.filter(d => ['Pendiente validación por profe', 'Pendiente validación por alumno'].includes(d.estado_agenda)).length },
        { vista: 'Inbox - Confirmadas', label: 'Confirmadas', icon: '✅', countFn: (alumnos) => alumnos.filter(d => d.estado_agenda === 'Agenda confirmada').length },
        { vista: 'Inbox - Suspendidas', label: 'Suspendidas', icon: '⏸️', countFn: (alumnos) => alumnos.filter(d => d.estado_agenda === 'Agenda suspendida').length }
    ],
    'Altas': [
        { vista: 'Altas - Pendientes', label: 'Pendientes', icon: '📝', countFn: (alumnos) => alumnos.filter(d => d.estado_agenda === 'Pre-alta Pendiente').length },
        { vista: 'Altas - En Curso', label: 'En Curso', icon: '🚀', countFn: (alumnos) => alumnos.filter(d => d.estado_agenda === 'Pre-alta Iniciada').length },
        { vista: 'Altas - Confirmadas', label: 'Confirmadas', icon: '⚠️', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda === 'Alta Efectiva' || d.estado_agenda === 'Alta Ilegal') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5)).length },
        { vista: 'Altas - Finalizadas', label: 'Finalizadas', icon: '🏆', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda === 'Alta Efectiva' || d.estado_agenda === 'Alta Ilegal' || d.estado_agenda === 'Alta Finalizada') && (d.checklist_alta && d.checklist_alta.filter(Boolean).length === 5)).length },
        { vista: 'Altas - Suspendidas', label: 'Suspendidas', icon: '❌', countFn: (alumnos) => alumnos.filter(d => d.estado_agenda === 'Alta Suspendida').length }
    ],
    'Match': [
        { vista: 'Match - Pendientes', label: 'Crear Grupos / Match', icon: '🔍', countFn: (alumnos) => alumnos.filter(d => d.estado_agenda === 'Lista de espera').length },
        { vista: 'Match - En Validacion', label: 'Grupos en Validación', icon: '👥', countFn: (alumnos) => alumnos.filter(d => d.estado_agenda === 'Validando Grupo').length },
        { vista: 'Ajustes Match', label: 'Reglas y Tolerancias', icon: '⚙️' }
    ]
};

let cachedAlumnosData = [];

function actualizarBadgesYNavegacion(allData) {
    if (Array.isArray(allData)) cachedAlumnosData = allData;
    const datos = cachedAlumnosData || [];
    
    // Conteo Inbox (Sin Agendar + En Validación)
    const countInbox = datos.filter(d => ['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno'].includes(d.estado_agenda)).length;
    const bInbox = document.getElementById('badge-inbox');
    if (bInbox) {
        bInbox.textContent = countInbox;
        bInbox.style.display = countInbox > 0 ? 'inline-block' : 'none';
    }

    // Conteo Lista de Espera
    const countEspera = datos.filter(d => d.estado_agenda === 'Lista de espera').length;
    const bEspera = document.getElementById('badge-espera');
    if (bEspera) {
        bEspera.textContent = countEspera;
        bEspera.style.display = countEspera > 0 ? 'inline-block' : 'none';
    }

    // Conteo Match (Grupos en validación o candidatos)
    const countMatchVal = datos.filter(d => d.estado_agenda === 'Validando Grupo').length;
    const bMatch = document.getElementById('badge-match');
    if (bMatch) {
        const txtBadge = countMatchVal > 0 ? countMatchVal : (countEspera > 0 ? countEspera : 0);
        bMatch.textContent = txtBadge;
        bMatch.style.display = txtBadge > 0 ? 'inline-block' : 'none';
    }

    // Conteo Altas (Pendientes + En Curso)
    const countAltas = datos.filter(d => d.estado_agenda === 'Pre-alta Pendiente' || d.estado_agenda === 'Pre-alta Iniciada').length;
    const bAltas = document.getElementById('badge-altas');
    if (bAltas) {
        bAltas.textContent = countAltas;
        bAltas.style.display = countAltas > 0 ? 'inline-block' : 'none';
    }
}

function renderSegmentedTabs(vista) {
    const container = document.getElementById('modulo-subtabs-container');
    const bar = document.getElementById('modulo-subtabs-bar');
    if (!container || !bar) return;

    let modulo = null;
    if (vista.startsWith('Inbox')) modulo = 'Inbox';
    else if (vista.startsWith('Altas')) modulo = 'Altas';
    else if (vista.startsWith('Match') || vista === 'Ajustes Match') modulo = 'Match';

    if (!modulo || !moduloSubtabs[modulo]) {
        container.style.display = 'none';
        bar.innerHTML = '';
        return;
    }

    const tabs = moduloSubtabs[modulo];
    const datos = cachedAlumnosData || [];

    bar.innerHTML = tabs.map(tab => {
        const isActive = tab.vista === vista;
        let badgeHtml = '';
        if (tab.countFn) {
            const cnt = tab.countFn(datos);
            badgeHtml = `<span class="tab-badge">${cnt}</span>`;
        }
        return `
            <button type="button" class="segmented-tab-btn ${isActive ? 'active' : ''}" data-vista="${tab.vista}">
                <span>${tab.icon} ${tab.label}</span>
                ${badgeHtml}
            </button>
        `;
    }).join('');

    container.style.display = 'flex';

    bar.querySelectorAll('.segmented-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const v = e.currentTarget.getAttribute('data-vista');
            if (v && v !== estadoActualVista) {
                cargarVista(v);
            }
        });
    });
}

async function cargarVista(vista) {
    estadoActualVista = vista; 
    
    let modulo = null;
    if (vista.startsWith('Inbox')) modulo = 'Inbox';
    else if (vista.startsWith('Altas')) modulo = 'Altas';
    else if (vista.startsWith('Match') || vista === 'Ajustes Match') modulo = 'Match';
    else if (vista === 'Lista de Espera') modulo = 'Lista de Espera';
    else if (vista === 'Dashboard') modulo = 'Dashboard';
    else if (vista === 'Estadísticas') modulo = 'Estadísticas';
    else if (vista.startsWith('Configuración') || vista.startsWith('Ajustes') || vista.startsWith('ABM')) modulo = 'Configuración';

    // Resaltar en sidebar simplificado
    document.querySelectorAll('#sidebar .nav-item, #sidebar .nav-item-small').forEach(el => {
        el.classList.remove('active');
        if (modulo && el.getAttribute('data-modulo') === modulo) {
            el.classList.add('active');
        } else if (el.getAttribute('data-vista') === vista) {
            el.classList.add('active');
        }
    });

    // Renderizar subtabs superiores correspondientes al módulo
    renderSegmentedTabs(vista);

    const tituloEl = document.getElementById('vista-titulo');
    if (tituloEl) {
        if (vista.includes('-')) {
            const partes = vista.split('-');
            const seccion = partes[0].trim();
            const subseccion = partes[1].trim();
            tituloEl.innerHTML = `<span style="color:var(--text-muted); font-weight:500;">${seccion} › </span><span style="color:var(--text-main); font-weight:700;">${subseccion}</span>`;
        } else {
            tituloEl.innerHTML = `<span style="color:var(--text-main); font-weight:700;">${vista}</span>`;
        }
    }
    
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
    let bottomVista = vista;
    if (vista.startsWith('Inbox')) bottomVista = 'Inbox - Pendientes';
    if (vista.startsWith('Altas')) bottomVista = 'Altas - Pendientes';
    const bottomMatch = document.querySelector(`.bottom-nav-item[data-vista="${bottomVista}"]`);
    if(bottomMatch) bottomMatch.classList.add('active');
    
    const vResumen = document.getElementById('vista-resumen'), vResumenTime = document.getElementById('vista-resumen-timeline'), contLista = document.getElementById('lista-generica'), contKanban = document.getElementById('kanban-generico'), contEstad = document.getElementById('estadisticas-container');
    const formWrapper = document.getElementById('form-alumno-wrapper'), cv = document.getElementById('controles-vista');
    if (formWrapper) { formWrapper.style.display = 'none'; document.getElementById('modal-alta-alumno').appendChild(formWrapper); }
    
    document.getElementById('btn-carga-masiva').style.display = 'none'; document.getElementById('search-container-general').style.display = 'none'; document.getElementById('alarm-filters').style.display = 'none';
    vResumen.style.display = 'none'; if(vResumenTime) vResumenTime.style.display = 'none'; contLista.style.display = 'none'; if(contKanban) contKanban.style.display = 'none'; contEstad.style.display = 'none'; cv.style.display = 'none';
    const contMatch = document.getElementById('match-pendientes-container'); if(contMatch) contMatch.style.display = 'none';

    const esVistaConLista = vista.startsWith('Inbox') || vista.startsWith('Altas') || vista === 'Lista de Espera';

    if (esVistaConLista) { 
        cv.style.display = 'flex'; 
        renderFiltrosChips(); 
        document.getElementById('search-container-general').style.display = 'block'; 
        // Skeleton loader — muestra mientras llegan los datos de Firestore
        mostrarSkeleton('lista-generica', 6);
        
        if (vista === 'Inbox - Confirmadas' || vista === 'Altas - Confirmadas') document.getElementById('alarm-filters').style.display = 'flex';
    }
    
    if (vista === 'Dashboard') {
        document.getElementById('search-container-general').style.display = 'block'; vResumen.style.display = 'flex'; if(vResumenTime) vResumenTime.style.display = 'flex'; cv.style.display = 'none';
        document.getElementById('alarm-filters').style.display = 'flex';
        
        const trayContainer = document.getElementById('timeline-tray-container');
        if (trayContainer) trayContainer.style.display = 'none';

        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            
            let urgencies = []; 
            allData.forEach(al => { 
                let dateToEval = getFechaReferenciaAlumno(al);
                if (dateToEval && !isNaN(dateToEval.getTime())) { 
                    let diffHs = (dateToEval - new Date()) / (1000 * 60 * 60); 
                    if (diffHs <= 48) urgencies.push(al); 
                } 
            });
            
            if (filtroAlarmaActual !== 'Todos') {
                urgencies = urgencies.filter(al => {
                    const info = getEstadoYBadge(al);
                    if (filtroAlarmaActual === 'Vencidos') return info.colorIndicador === 'ind-gray' && info.txtTiempo.includes('Vencida');
                    if (filtroAlarmaActual === 'Criticos') return info.colorIndicador === 'ind-red' || info.colorIndicador === 'ind-yellow';
                    if (filtroAlarmaActual === 'AlDia') return info.colorIndicador === 'ind-teal' || (info.colorIndicador === 'ind-gray' && !info.txtTiempo.includes('Vencida'));
                    return true;
                });
            }

            urgencies.sort((a,b) => { 
                const dA = getFechaReferenciaAlumno(a) || new Date(8640000000000000); 
                const dB = getFechaReferenciaAlumno(b) || new Date(8640000000000000); 
                return dA - dB; 
            });
            document.getElementById('resumen-urgencias').innerHTML = urgencies.length > 0 ? urgencies.map(a => generarFilaAlumno(a, a.id, vista)).join('') : '<div style="color:var(--text-muted); padding:10px; font-weight:500;">No hay gestiones críticas a la vista.</div>';
            
            renderTimelineUnificado('timeline-unificado', configNodosFlujo, allData);
            
            document.getElementById('dashboard-flow-chart-container').style.display = 'block';
            let flowLabels = configNodosFlujo.map(n => n.label);
            let flowData = configNodosFlujo.map(n => allData.filter(d => n.filterFn ? n.filterFn(d) : d.estado_agenda === n.id).length);
            let phaseColors = configNodosFlujo.map(n => n.hexColor || '#1f5491');
            
            if(chartFlowDashboardInst) chartFlowDashboardInst.destroy();
            chartFlowDashboardInst = new Chart(document.getElementById('chartFlowDashboard'), { 
                type: 'bar', 
                data: { labels: flowLabels, datasets: [{ label: 'Alumnos', data: flowData, backgroundColor: phaseColors, borderRadius: 6 }] },
                options: { 
                    onClick: (evt, elements) => {
                        if (elements && elements.length > 0) {
                            const index = elements[0].index;
                            const nodo = configNodosFlujo[index];
                            if (nodo && nodo.vistaDestino) {
                                cargarVista(nodo.vistaDestino);
                            }
                        }
                    },
                    onHover: (event, chartElement) => {
                        if (event.native && event.native.target) {
                            event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                        }
                    },
                    plugins: { title: { display: false }, legend: { display: false } }, 
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } 
                }
            });
            
        } catch(e) {}
    } else if (vista === 'Inbox - Pendientes' || vista === 'Inbox - En Validacion' || vista === 'Altas - Pendientes' || vista === 'Altas - En Curso') {
        const isSinAgendar = vista === 'Inbox - Pendientes';
        const isEnValidacion = vista === 'Inbox - En Validacion';
        document.getElementById('btn-carga-masiva').style.display = isSinAgendar ? 'block' : 'none'; 
        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            
            let dataFiltrada = [];
            if (isSinAgendar) {
                dataFiltrada = allData.filter(d => d.estado_agenda === 'Pendiente procesar');
            } else if (isEnValidacion) {
                dataFiltrada = allData.filter(d => ['Pendiente validación por profe', 'Pendiente validación por alumno'].includes(d.estado_agenda));
            } else if (vista === 'Altas - Pendientes') {
                dataFiltrada = allData.filter(d => d.estado_agenda === 'Pre-alta Pendiente');
                if (agrupadorNivel1 === 'ninguno') {
                    agrupadorNivel1 = 'grupo';
                    const selAgr = document.getElementById('select-agrupador-1');
                    if (selAgr) selAgr.value = 'grupo';
                }
            } else if (vista === 'Altas - En Curso') {
                dataFiltrada = allData.filter(d => d.estado_agenda === 'Pre-alta Iniciada');
                if (agrupadorNivel1 === 'ninguno') {
                    agrupadorNivel1 = 'grupo';
                    const selAgr = document.getElementById('select-agrupador-1');
                    if (selAgr) selAgr.value = 'grupo';
                }
            }
            
            renderListaFilas('lista-generica', dataFiltrada, 'all', null);
        } catch(e) {}
    } else if (vista === 'Inbox - Confirmadas' || vista === 'Inbox - Suspendidas' || vista === 'Altas - Confirmadas' || vista === 'Altas - Finalizadas' || vista === 'Altas - Suspendidas' || vista === 'Lista de Espera') {
        try { 
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = [];
            qSnap.forEach(d => allData.push({ id: d.id, ...d.data() }));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            
            let dataFiltrada = allData.filter(data => {
                if (vista === 'Inbox - Confirmadas') return data.estado_agenda === 'Agenda confirmada';
                if (vista === 'Inbox - Suspendidas') return data.estado_agenda === 'Agenda suspendida';
                if (vista === 'Lista de Espera') return data.estado_agenda === 'Lista de espera';
                if (vista === 'Altas - Confirmadas') {
                    return (data.estado_agenda === 'Alta Efectiva' || data.estado_agenda === 'Alta Ilegal') && (!data.checklist_alta || data.checklist_alta.filter(Boolean).length < 5);
                }
                if (vista === 'Altas - Finalizadas') {
                    return (data.estado_agenda === 'Alta Efectiva' || data.estado_agenda === 'Alta Ilegal' || data.estado_agenda === 'Alta Finalizada') && data.checklist_alta && data.checklist_alta.filter(Boolean).length === 5;
                }
                if (vista === 'Altas - Suspendidas') return data.estado_agenda === 'Alta Suspendida';
                return false;
            });
            renderListaFilas('lista-generica', dataFiltrada, 'all', null);
        } catch(e) {}
    } else if (vista === 'Match - Pendientes') {
        try { 
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = [];
            qSnap.forEach(d => allData.push({ id: d.id, ...d.data() }));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
        } catch(e) {}
        await renderMatchPendientes();
    } else if (vista === 'Match - En Validacion') {
        try { 
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = [];
            qSnap.forEach(d => allData.push({ id: d.id, ...d.data() }));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
        } catch(e) {}
        await renderMatchEnValidacion(contLista);
    } else if (vista === 'Match - Confirmados') {
        contLista.style.display = 'flex';
        document.getElementById('vista-titulo').textContent = 'Match — Confirmados';
        try { 
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = [];
            qSnap.forEach(d => allData.push({ id: d.id, ...d.data() }));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
        } catch(e) {}
        await renderMatchConfirmados(contLista);
    } else if (vista === 'Estadísticas') { contEstad.style.display = 'flex'; renderCharts();
    } else if (vista === 'Configuración') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfigHub(contLista);
    } else if (vista === 'Ajustes Generales') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfig(contLista);
    } else if (vista === 'Ajustes Match') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfigMatch(contLista);
    } else if (vista.startsWith('ABM')) { contLista.style.display = 'flex'; contLista.innerHTML = ''; const colMap = { 'ABM-Profesores': 'profesores', 'ABM-Instrumentos': 'instrumentos', 'ABM-Suscripciones': 'tipos_suscripcion', 'ABM-Usuarios': 'usuarios_sistema' }; cargarABM(colMap[vista] || vista.split('-')[1].toLowerCase(), vista.split('-')[1], contLista); }
}

function renderConfigHub(cont) {
    cont.innerHTML = `
        <div style="max-width:800px; width:100%; padding:20px;">
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('Ajustes Generales')"><span style="font-size:1.5em; opacity:0.7;">⚙️</span><div><strong style="color:var(--text-main);">Ajustes Generales</strong><div style="font-size:12px; color:var(--text-muted);">Límites, calendarios y textos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('Ajustes Match')"><span style="font-size:1.5em; opacity:0.7;">🧩</span><div><strong style="color:var(--text-main);">Ajustes de Match</strong><div style="font-size:12px; color:var(--text-muted);">Límites de integrantes y reglas de edad para grupos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('ABM-Usuarios')"><span style="font-size:1.5em; opacity:0.7;">🔐</span><div><strong style="color:var(--text-main);">Usuarios del Sistema</strong><div style="font-size:12px; color:var(--text-muted);">Administrar accesos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('ABM-Profesores')"><span style="font-size:1.5em; opacity:0.7;">👥</span><div><strong style="color:var(--text-main);">Profesores</strong><div style="font-size:12px; color:var(--text-muted);">Alta y disponibilidad.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('ABM-Instrumentos')"><span style="font-size:1.5em; opacity:0.7;">🎸</span><div><strong style="color:var(--text-main);">Instrumentos</strong></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="cargarVista('ABM-Suscripciones')"><span style="font-size:1.5em; opacity:0.7;">🎫</span><div><strong style="color:var(--text-main);">Suscripciones</strong></div></div>
        </div>`;
}

function renderConfig(cont) { 
    cont.innerHTML = `<div style="margin-bottom:25px; font-size:0.9em; color:var(--text-muted);"><span style="cursor:pointer; color:var(--accent-teal);" onclick="cargarVista('Configuración')">Configuración</span> &gt; <strong style="color:var(--text-main);">Ajustes Generales</strong></div><div style="max-width:800px; padding:30px; background:white; border-radius:12px; border:1px solid var(--border-color);"> <h3 style="margin-top:0; color:var(--text-main); font-size:1.2em;">Límites de Calendario</h3> <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"> <div style="flex:1; min-width:150px;"><label>Hora Apertura:<input type="time" id="cfg-apertura" class="modern-input" value="${configApp.hora_apertura||'09:00'}"></label></div> <div style="flex:1; min-width:150px;"><label>Hora Cierre:<input type="time" id="cfg-cierre" class="modern-input" value="${configApp.hora_cierre||'22:00'}"></label></div> </div> <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"> <div style="flex:1; min-width:150px;"><label>Aulas totales:<input type="number" id="cfg-aulas" class="modern-input" value="${configApp.cantidad_aulas}"></label></div> <div style="flex:1; min-width:150px;"><label>Baterías totales:<input type="number" id="cfg-bats" class="modern-input" value="${configApp.cantidad_baterias}"></label></div> </div> <h3 style="margin-top:0; color:var(--text-main); border-top:1px solid var(--border-color); padding-top:20px;">Calendario y Emojis</h3> <label style="margin-bottom:15px;">Calendario Defecto:<input type="email" id="cfg-cal-defecto" class="modern-input" value="${configApp.calendario_por_defecto||''}"></label> <div style="display:flex; gap:10px; margin-bottom:25px; flex-wrap:wrap;"> <div style="width:80px;"><label>Batería:<input type="text" id="cfg-idbat" class="modern-input" value="${configApp.identificador_bateria||''}"></label></div> <div style="width:80px;"><label>Guitarra:<input type="text" id="cfg-em-gui" class="modern-input" value="${configApp.emoji_guitarra||'🎸'}"></label></div> <div style="width:80px;"><label>Cajón:<input type="text" id="cfg-em-caj" class="modern-input" value="${configApp.emoji_cajon||'📦'}"></label></div> <div style="width:80px;"><label>Canto:<input type="text" id="cfg-em-can" class="modern-input" value="${configApp.emoji_canto||'🎤'}"></label></div> <div style="width:80px;"><label>Piano:<input type="text" id="cfg-em-pia" class="modern-input" value="${configApp.emoji_piano||'🎹'}"></label></div> <div style="width:80px;"><label>Bajo:<input type="text" id="cfg-em-baj" class="modern-input" value="${configApp.emoji_bajo||'🎸'}"></label></div> </div> <h3 style="margin-top:0; color:var(--text-main); border-top:1px solid var(--border-color); padding-top:20px;">Mensajes y Textos</h3> <label style="margin-bottom:15px;">Valor de Clase (Monto): <input type="text" id="cfg-valor" class="modern-input" value="${configApp.valor_clase}"></label> <label style="margin-bottom:15px;">Título Evento (Reserva): <input type="text" id="cfg-evt-res" class="modern-input" value="${configApp.formato_evento_reserva}"></label> <label style="margin-bottom:15px;">Título Evento (Confirmado): <input type="text" id="cfg-evt-conf" class="modern-input" value="${configApp.formato_evento_confirmado}"></label> <label style="margin-bottom:15px;">Nombre para Agendar (WS): <input type="text" id="cfg-nombre-agendar" class="modern-input" value="${configApp.texto_nombre_agendar}"></label> <label style="margin-bottom:15px;">Texto Opciones Múltiples: <textarea id="cfg-txt-opt-mul" class="modern-input" style="height:200px;">${configApp.texto_opciones_multiples}</textarea></label> <label style="margin-bottom:15px;">Texto 1 Sola Opción: <textarea id="cfg-txt-p" class="modern-input" style="height:150px;">${configApp.texto_profe}</textarea></label> <label style="margin-bottom:15px;">Texto Confirmación Alumno: <textarea id="cfg-txt-conf-a" class="modern-input" style="height:150px;">${configApp.texto_conf_alumno}</textarea></label> <label style="margin-bottom:15px;">Texto Cancelación: <textarea id="cfg-txt-cancela" class="modern-input" style="height:100px;">${configApp.texto_cancela_alumno}</textarea></label> <label style="margin-bottom:15px;">Texto Pre-Alta: <textarea id="cfg-txt-prealta" class="modern-input" style="height:150px;">${configApp.texto_prealta}</textarea></label> <label style="margin-bottom:20px;">Texto Nueva Alta: <textarea id="cfg-txt-alta-conf" class="modern-input" style="height:150px;">${configApp.texto_alta_confirmada}</textarea></label> <button id="btn-guardar-cfg" class="btn-primary" style="width:100%;">Guardar Configuración</button> </div>`; 
    document.getElementById('btn-guardar-cfg').addEventListener('click', async (e) => { setBotonCargando(e.target, true); await setDoc(doc(db, "configuracion", "general"), { hora_apertura: document.getElementById('cfg-apertura').value, hora_cierre: document.getElementById('cfg-cierre').value, cantidad_aulas: document.getElementById('cfg-aulas').value, cantidad_baterias: document.getElementById('cfg-bats').value, identificador_bateria: document.getElementById('cfg-idbat').value, emoji_guitarra: document.getElementById('cfg-em-gui').value, emoji_cajon: document.getElementById('cfg-em-caj').value, emoji_canto: document.getElementById('cfg-em-can').value, emoji_piano: document.getElementById('cfg-em-pia').value, emoji_bajo: document.getElementById('cfg-em-baj').value, calendario_por_defecto: document.getElementById('cfg-cal-defecto').value, valor_clase: document.getElementById('cfg-valor').value, formato_evento_reserva: document.getElementById('cfg-evt-res').value, formato_evento_confirmado: document.getElementById('cfg-evt-conf').value, texto_nombre_agendar: document.getElementById('cfg-nombre-agendar').value, texto_opciones_multiples: document.getElementById('cfg-txt-opt-mul').value, texto_profe: document.getElementById('cfg-txt-p').value, texto_alumno: document.getElementById('cfg-txt-a').value, texto_conf_profe: document.getElementById('cfg-txt-conf-p').value, texto_conf_alumno: document.getElementById('cfg-txt-conf-a').value, texto_cancela_alumno: document.getElementById('cfg-txt-cancela').value, texto_prealta: document.getElementById('cfg-txt-prealta').value, texto_alta_confirmada: document.getElementById('cfg-txt-alta-conf').value }, { merge: true }); await cargarConfig(); setBotonCargando(e.target, false); alert('Guardado.'); }); 
}

function renderConfigMatch(cont) {
    const minInt = configApp.grupo_min_integrantes || 2;
    const maxInt = configApp.grupo_max_integrantes || 6;
    const ninosCfg = configApp.reglas_edad_ninos || { hasta: 13, libre: true };
    const reglasEdad = Array.isArray(configApp.reglas_edad_match) && configApp.reglas_edad_match.length > 0
        ? configApp.reglas_edad_match
        : defaultCfg.reglas_edad_match;

    let rowsHtml = reglasEdad.map((r, idx) => `
        <tr data-index="${idx}" style="border-bottom:1px solid var(--border-color);">
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-desde" value="${r.desde}" min="13" max="99" style="width:80px; padding:6px 8px;"> años
            </td>
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-min" value="${r.rango_min}" min="-30" max="0" style="width:70px; padding:6px 8px;"> años
            </td>
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-max" value="${r.rango_max}" min="0" max="30" style="width:70px; padding:6px 8px;"> años
            </td>
            <td style="padding:10px 8px; text-align:center;">
                <button type="button" class="btn-borrar-regla-edad" style="background:none; border:none; cursor:pointer; color:var(--accent-red); font-size:1.1em;" title="Eliminar regla">🗑️</button>
            </td>
        </tr>
    `).join('');

    cont.innerHTML = `
        <div style="margin-bottom:25px; font-size:0.9em; color:var(--text-muted);">
            <span style="cursor:pointer; color:var(--accent-teal);" onclick="cargarVista('Configuración')">Configuración</span> &gt; <strong style="color:var(--text-main);">Ajustes de Match</strong>
        </div>
        <div style="max-width:800px; padding:30px; background:white; border-radius:12px; border:1px solid var(--border-color); display:flex; flex-direction:column; gap:25px;">
            <div>
                <h3 style="margin-top:0; color:var(--text-main); font-size:1.2em; margin-bottom:6px;">👥 Tamaño de Grupos</h3>
                <p style="color:var(--text-muted); font-size:0.9em; margin:0 0 15px 0;">Cantidad mínima y máxima de integrantes permitidos por ensamble/grupo.</p>
                <div style="display:flex; gap:15px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:140px;">
                        <label>Mínimo de Integrantes:
                            <input type="number" id="cfg-grupo-min" class="modern-input" min="2" max="10" value="${minInt}">
                        </label>
                    </div>
                    <div style="flex:1; min-width:140px;">
                        <label>Máximo de Integrantes:
                            <input type="number" id="cfg-grupo-max" class="modern-input" min="2" max="12" value="${maxInt}">
                        </label>
                    </div>
                </div>
            </div>

            <div style="border-top:1px solid var(--border-color); padding-top:20px;">
                <h3 style="margin-top:0; color:var(--text-main); font-size:1.2em; margin-bottom:6px;">🧒 Grupos de Niños (< 13 años)</h3>
                <p style="color:var(--text-muted); font-size:0.9em; margin:0 0 12px 0;">Comportamiento para menores de 13 años.</p>
                <label style="cursor:pointer; font-weight:600; display:flex; align-items:center; gap:8px; text-transform:none; margin:0; color:var(--text-main);">
                    <input type="checkbox" id="cfg-ninos-libre" ${ninosCfg.libre ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--accent-teal);">
                    Rango libre (sin restricción de edad mínima entre niños < 13)
                </label>
            </div>

            <div style="border-top:1px solid var(--border-color); padding-top:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div>
                        <h3 style="margin:0; color:var(--text-main); font-size:1.2em;">📊 Reglas de Tolerancia de Edad (Adultos)</h3>
                        <p style="color:var(--text-muted); font-size:0.9em; margin:4px 0 0 0;">Define cuánto margen de diferencia en años se tolera para armar un grupo.</p>
                    </div>
                    <button type="button" id="btn-agregar-regla-edad" class="filter-chip active" style="font-family:inherit; cursor:pointer;">＋ Agregar Tramo</button>
                </div>

                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
                        <thead>
                            <tr style="background:var(--hover-bg); border-bottom:2px solid var(--border-color); color:var(--text-muted);">
                                <th style="padding:10px 8px;">Desde Edad</th>
                                <th style="padding:10px 8px;">Rango Mín. (-años)</th>
                                <th style="padding:10px 8px;">Rango Máx. (+años)</th>
                                <th style="padding:10px 8px; width:40px; text-align:center;">Acción</th>
                            </tr>
                        </thead>
                        <tbody id="tabla-reglas-edad-body">
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <button id="btn-guardar-cfg-match" class="btn-primary" style="width:100%; padding:12px; font-size:14px; margin-top:10px;">Guardar Configuración de Match</button>
        </div>
    `;

    // Listener para eliminar filas
    cont.querySelectorAll('.btn-borrar-regla-edad').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tr = e.target.closest('tr');
            if (tr) tr.remove();
        });
    });

    // Listener para agregar tramos
    document.getElementById('btn-agregar-regla-edad')?.addEventListener('click', () => {
        const tbody = document.getElementById('tabla-reglas-edad-body');
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        tr.innerHTML = `
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-desde" value="20" min="13" max="99" style="width:80px; padding:6px 8px;"> años
            </td>
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-min" value="-5" min="-30" max="0" style="width:70px; padding:6px 8px;"> años
            </td>
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-max" value="8" min="0" max="30" style="width:70px; padding:6px 8px;"> años
            </td>
            <td style="padding:10px 8px; text-align:center;">
                <button type="button" class="btn-borrar-regla-edad" style="background:none; border:none; cursor:pointer; color:var(--accent-red); font-size:1.1em;" title="Eliminar regla">🗑️</button>
            </td>
        `;
        tr.querySelector('.btn-borrar-regla-edad').addEventListener('click', () => tr.remove());
        tbody.appendChild(tr);
    });

    // Listener para guardar
    document.getElementById('btn-guardar-cfg-match')?.addEventListener('click', async (e) => {
        const btn = e.target;
        setBotonCargando(btn, true);

        const gMin = parseInt(document.getElementById('cfg-grupo-min').value) || 2;
        const gMax = parseInt(document.getElementById('cfg-grupo-max').value) || 6;
        const ninosLibre = document.getElementById('cfg-ninos-libre').checked;

        const reglas = [];
        document.querySelectorAll('#tabla-reglas-edad-body tr').forEach(tr => {
            const desde = parseInt(tr.querySelector('.cfg-regla-desde').value);
            const rMin = parseInt(tr.querySelector('.cfg-regla-min').value);
            const rMax = parseInt(tr.querySelector('.cfg-regla-max').value);
            if (!isNaN(desde) && !isNaN(rMin) && !isNaN(rMax)) {
                reglas.push({ desde, rango_min: rMin, rango_max: rMax });
            }
        });
        reglas.sort((a, b) => a.desde - b.desde);

        try {
            await setDoc(doc(db, "configuracion", "general"), {
                grupo_min_integrantes: gMin,
                grupo_max_integrantes: gMax,
                reglas_edad_ninos: { hasta: 13, libre: ninosLibre },
                reglas_edad_match: reglas
            }, { merge: true });

            await cargarConfig();
            alert('Configuración de Match guardada correctamente.');
        } catch(err) {
            alert('Error al guardar configuración de Match: ' + err.message);
        }

        setBotonCargando(btn, false);
    });
}

async function renderCharts() {
    const cont = document.getElementById('estadisticas-container');
    cont.innerHTML = `
        <div class="metrics-grid">
            <!-- Fila 1: Flow de Admisión (ancho completo, prominente) -->
            <div class="chart-card full-width">
                <div class="chart-canvas-wrapper tall">
                    <canvas id="chartFlow"></canvas>
                </div>
            </div>

            <!-- Fila 2: Entrevistas + Altas (doughnut compactos) -->
            <div class="chart-card">
                <div class="chart-canvas-wrapper">
                    <canvas id="chartEntrevistas"></canvas>
                </div>
            </div>
            <div class="chart-card">
                <div class="chart-canvas-wrapper">
                    <canvas id="chartAltas"></canvas>
                </div>
            </div>

            <!-- Fila 3: Instrumento + Suscripción (doughnut compactos) -->
            <div class="chart-card">
                <div class="chart-canvas-wrapper">
                    <canvas id="chartInstrumento"></canvas>
                </div>
            </div>
            <div class="chart-card">
                <div class="chart-canvas-wrapper">
                    <canvas id="chartSuscripcion"></canvas>
                </div>
            </div>

            <!-- Fila 4: Altas por mes (línea temporal) -->
            <div class="chart-card full-width">
                <div class="chart-canvas-wrapper">
                    <canvas id="chartAltasPorMes"></canvas>
                </div>
            </div>

            <!-- Fila 5: Tasa de conversión por instrumento (barras apiladas) -->
            <div class="chart-card full-width">
                <div class="chart-canvas-wrapper">
                    <canvas id="chartConversion"></canvas>
                </div>
            </div>
        </div>
    `;
    try {
        const qSnap = await getDocs(collection(db, "alumnos"));
        let allData = []; qSnap.forEach(d => allData.push(d.data()));

        // ── Datos para gráficos existentes ──────────────────────────────────
        let flowLabels = configNodosFlujo.map(n => n.label);
        let flowData   = configNodosFlujo.map(n => allData.filter(d => n.filterFn ? n.filterFn(d) : d.estado_agenda === n.id).length);
        let phaseColors = configNodosFlujo.map(n => n.hexColor || '#1f5491');

        let entConf = allData.filter(d => d.estado_agenda === 'Agenda confirmada').length;
        let entSusp = allData.filter(d => d.estado_agenda === 'Agenda suspendida').length;

        let altFin  = allData.filter(d => (d.estado_agenda === 'Alta Efectiva' || d.estado_agenda === 'Alta Ilegal') && (d.checklist_alta && d.checklist_alta.filter(Boolean).length === 5)).length;
        let altSusp = allData.filter(d => d.estado_agenda === 'Alta Suspendida').length;

        // ── Helper para extraer lista limpia de instrumentos ────────────────
        const extraerInstrumentos = (inst) => {
            if (!inst) return ['Sin especificar'];
            if (Array.isArray(inst)) {
                const arr = inst.map(x => String(x || '').trim()).filter(Boolean);
                return arr.length > 0 ? arr : ['Sin especificar'];
            }
            if (typeof inst === 'string') {
                const s = inst.trim();
                return s ? s.split(',').map(x => x.trim()).filter(Boolean) : ['Sin especificar'];
            }
            return [String(inst).trim() || 'Sin especificar'];
        };

        const extraerSuscripcion = (sus) => {
            if (!sus) return 'Sin especificar';
            if (Array.isArray(sus)) {
                const arr = sus.map(x => String(x || '').trim()).filter(Boolean);
                return arr.length > 0 ? arr.join(', ') : 'Sin especificar';
            }
            if (typeof sus === 'string') return sus.trim() || 'Sin especificar';
            return String(sus).trim() || 'Sin especificar';
        };

        // ── Nuevo 1: Distribución por instrumento ────────────────────────────
        const instrMap = {};
        allData.forEach(d => {
            const list = extraerInstrumentos(d.instrumento);
            list.forEach(inst => {
                instrMap[inst] = (instrMap[inst] || 0) + 1;
            });
        });
        const instrLabels = Object.keys(instrMap).sort((a, b) => instrMap[b] - instrMap[a]);
        const instrData   = instrLabels.map(k => instrMap[k]);
        const instrPalette = ['#74a9d8','#4a8cd2','#256bbb','#134b8c','#e5a93d','#8e44ad','#5cc88a','#31a364','#1b7f47','#0d5c30','#c2563b','#e67e22'];

        // ── Nuevo 2: Distribución por tipo suscripción ───────────────────────
        const suscMap = {};
        allData.forEach(d => {
            const sus = extraerSuscripcion(d.tipo_suscripcion);
            suscMap[sus] = (suscMap[sus] || 0) + 1;
        });
        const suscLabels = Object.keys(suscMap).sort((a, b) => suscMap[b] - suscMap[a]);
        const suscData   = suscLabels.map(k => suscMap[k]);
        const suscPalette = ['#007b8f','#31a364','#e5a93d','#8e44ad','#c2563b','#256bbb','#74a9d8','#1b7f47'];

        // ── Nuevo 3: Altas confirmadas por mes (últimos 12 meses) ─────────────
        const now12 = new Date();
        const mesLabels = [];
        const mesData   = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now12.getFullYear(), now12.getMonth() - i, 1);
            mesLabels.push(d.toLocaleString('es-AR', { month: 'short', year: '2-digit' }));
            const mesStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
            const mesEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
            const count = allData.filter(al => {
                if (!al.fecha_alta_confirmada) return false;
                const t = new Date(al.fecha_alta_confirmada).getTime();
                return t >= mesStart && t <= mesEnd;
            }).length;
            mesData.push(count);
        }

        // ── Nuevo 4: Tasa de conversión por instrumento ──────────────────────
        // Para cada instrumento: cuántos ingresaron (todos) vs cuántos llegaron a Alta
        const instAll = {};
        const instAlta = {};
        const estadosAlta = ['Pre-alta Pendiente', 'Pre-alta Iniciada', 'Alta Efectiva', 'Alta Ilegal', 'Altas Incompletas', 'Alta Finalizada'];
        allData.forEach(d => {
            const list = extraerInstrumentos(d.instrumento);
            const llegoAlta = estadosAlta.includes(d.estado_agenda);
            list.forEach(inst => {
                instAll[inst] = (instAll[inst] || 0) + 1;
                if (llegoAlta) {
                    instAlta[inst] = (instAlta[inst] || 0) + 1;
                }
            });
        });
        const convInstrLabels = Object.keys(instAll).filter(k => instAll[k] > 0).sort((a, b) => instAll[b] - instAll[a]).slice(0, 8);
        const convTotal  = convInstrLabels.map(k => instAll[k]);
        const convAlta   = convInstrLabels.map(k => instAlta[k] || 0);
        const convResto  = convInstrLabels.map((k, i) => convTotal[i] - convAlta[i]);

        // ── Destruir instancias previas ──────────────────────────────────────
        [chartFlowInst, chartEntrevistasInst, chartAltasInst].forEach(c => c && c.destroy());
        if (window.chartInstrumentoInst) window.chartInstrumentoInst.destroy();
        if (window.chartSuscripcionInst) window.chartSuscripcionInst.destroy();
        if (window.chartAltasPorMesInst) window.chartAltasPorMesInst.destroy();
        if (window.chartConversionInst)  window.chartConversionInst.destroy();

        // ── Renderizar gráficos existentes ───────────────────────────────────
        const hoverCursor = (event, chartElement) => {
            if (event.native && event.native.target) event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
        };

        chartFlowInst = new Chart(document.getElementById('chartFlow'), {
            type: 'bar',
            data: { labels: flowLabels, datasets: [{ label: 'Alumnos', data: flowData, backgroundColor: phaseColors, borderRadius: 5 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, elements) => { if (elements?.length > 0) { const nodo = configNodosFlujo[elements[0].index]; if (nodo?.vistaDestino) cargarVista(nodo.vistaDestino); } },
                onHover: hoverCursor,
                plugins: { title: { display: true, text: 'Flow de Admisión — Alumnos por etapa', font: { size: 14, weight: 'bold' }, padding: { bottom: 8 } }, legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } }, x: { ticks: { font: { size: 10.5 } } } }
            }
        });

        chartEntrevistasInst = new Chart(document.getElementById('chartEntrevistas'), {
            type: 'doughnut',
            data: { labels: ['Confirmadas', 'Suspendidas'], datasets: [{ data: [entConf, entSusp], backgroundColor: ['#007b8f', '#c2563b'] }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                onClick: (evt, elements) => { if (elements?.length > 0) cargarVista(elements[0].index === 0 ? 'Inbox - Confirmadas' : 'Inbox - Suspendidas'); },
                onHover: hoverCursor,
                plugins: {
                    title: { display: true, text: 'Entrevistas', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } },
                    legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } }
                }
            }
        });

        chartAltasInst = new Chart(document.getElementById('chartAltas'), {
            type: 'doughnut',
            data: { labels: ['Finalizadas', 'Suspendidas'], datasets: [{ data: [altFin, altSusp], backgroundColor: ['#007b8f', '#c2563b'] }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                onClick: (evt, elements) => { if (elements?.length > 0) cargarVista(elements[0].index === 0 ? 'Altas - Finalizadas' : 'Altas - Suspendidas'); },
                onHover: hoverCursor,
                plugins: {
                    title: { display: true, text: 'Altas', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } },
                    legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } }
                }
            }
        });

        // ── Nuevo 1: Instrumento ─────────────────────────────────────────────
        window.chartInstrumentoInst = new Chart(document.getElementById('chartInstrumento'), {
            type: 'doughnut',
            data: { labels: instrLabels, datasets: [{ data: instrData, backgroundColor: instrPalette.slice(0, instrLabels.length) }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    title: { display: true, text: 'Alumnos por Instrumento', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } },
                    legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10.5 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / (allData.length || 1) * 100)}%)` } }
                }
            }
        });

        // ── Nuevo 2: Suscripción ─────────────────────────────────────────────
        window.chartSuscripcionInst = new Chart(document.getElementById('chartSuscripcion'), {
            type: 'doughnut',
            data: { labels: suscLabels, datasets: [{ data: suscData, backgroundColor: suscPalette.slice(0, suscLabels.length) }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    title: { display: true, text: 'Alumnos por Tipo de Suscripción', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } },
                    legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10.5 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / (allData.length || 1) * 100)}%)` } }
                }
            }
        });

        // ── Nuevo 3: Altas por mes ───────────────────────────────────────────
        window.chartAltasPorMesInst = new Chart(document.getElementById('chartAltasPorMes'), {
            type: 'line',
            data: {
                labels: mesLabels,
                datasets: [{
                    label: 'Altas confirmadas',
                    data: mesData,
                    borderColor: '#007b8f',
                    backgroundColor: 'rgba(0,123,143,0.12)',
                    borderWidth: 2,
                    pointBackgroundColor: '#007b8f',
                    pointRadius: 4,
                    tension: 0.35,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { title: { display: true, text: 'Altas confirmadas por mes (últimos 12 meses)', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } }, legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } }, x: { ticks: { font: { size: 11 } } } }
            }
        });

        // ── Nuevo 4: Conversión por instrumento ──────────────────────────────
        window.chartConversionInst = new Chart(document.getElementById('chartConversion'), {
            type: 'bar',
            data: {
                labels: convInstrLabels,
                datasets: [
                    { label: 'Llegaron a Alta', data: convAlta, backgroundColor: '#31a364', borderRadius: 3 },
                    { label: 'No llegaron a Alta', data: convResto, backgroundColor: '#c2563b', borderRadius: 3 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Conversión a Alta por Instrumento', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } },
                    legend: { labels: { boxWidth: 10, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            afterBody: (items) => {
                                const idx = items[0].dataIndex;
                                const total = convTotal[idx];
                                const alta = convAlta[idx];
                                return total > 0 ? [`Tasa de conversión: ${Math.round(alta / total * 100)}%`] : [];
                            }
                        }
                    }
                },
                scales: { x: { stacked: true, ticks: { font: { size: 10.5 } } }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } } }
            }
        });

    } catch(e) { console.error('Error renderCharts:', e); }
}

// ================================================================
// MÓDULO MATCH — ETAPA 4 — Fase 3: Formulario interactivo
// ================================================================

async function renderMatchPendientes() {
    document.getElementById('vista-titulo').innerHTML = '<span style="color:var(--text-muted); font-weight:500;">Match › </span><span style="color:var(--text-main); font-weight:700;">Pendientes</span>';
    // Ocultar controles estándar (fueron auto-mostrados por vista.includes('-'))
    document.getElementById('controles-vista').style.display = 'none';
    document.getElementById('search-container-general').style.display = 'none';
    // Mostrar container del módulo
    const cont = document.getElementById('match-pendientes-container');
    cont.style.display = 'flex';

    // Cargar suscripciones (solo si no se cargaron antes)
    const selSusc = document.getElementById('match-suscripcion');
    if (selSusc.options.length <= 1) {
        try {
            const sSp = await getDocs(collection(db, "tipos_suscripcion"));
            sSp.forEach(d => {
                selSusc.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`;
            });
        } catch(e) {}
    }

    // Cargar profesores desde Firestore
    await cargarProfesoresMatch();

    // Cargar instrumentos para filtro objetivo y exclusión (solo si no se cargaron antes)
    const selInstFiltro = document.getElementById('match-instrumento-filtro');
    if (selInstFiltro && selInstFiltro.options.length <= 1) {
        try {
            const iS = await getDocs(collection(db, "instrumentos"));
            iS.forEach(d => selInstFiltro.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`);
        } catch(e) {}
    }

    const selExc = document.getElementById('match-excluir-instrumentos');
    if (selExc && selExc.options.length === 0) {
        try {
            const iS = await getDocs(collection(db, "instrumentos"));
            iS.forEach(d => selExc.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`);
        } catch(e) {}
    }
    syncSelectToChips('match-excluir-instrumentos', 'match-chips-excluir');

    // Leer máx/mín de grupo desde config
    const cfgMax = (configApp && configApp.grupo_max_integrantes) || 6;
    const cfgMin = (configApp && configApp.grupo_min_integrantes) || 2;
    document.getElementById('match-cant-max-label').textContent = cfgMax;

    // Registrar listeners del formulario solo una vez
    if (!matchListenersAttached) {
        matchListenersAttached = true;
        initMatchFormListeners(cfgMin, cfgMax);
    }
}

async function cargarProfesoresMatch() {
    const selProfe = document.getElementById('match-profe');
    selProfe.innerHTML = '<option value="">Cualquier profesor disponible</option>';
    matchProfesores = [];
    try {
        const profSnap = await getDocs(collection(db, "profesores"));
        profSnap.forEach(d => matchProfesores.push({ id: d.id, ...d.data() }));
    } catch(e) {}
    filtrarProfesoresMatch();
}

function detectarTipoSuscripcion(nombreSusc) {
    if (!nombreSusc) return 'individual';
    const s = nombreSusc.toLowerCase();
    if (s.includes('ensamble') || s.includes('banda')) return 'ensamble';
    if (s.includes('grupal') || s.includes('grupo') || s.includes('coro')) return 'grupal';
    return 'individual';
}

function adaptarFormularioPorSuscripcion(nombreSusc) {
    const tipo = detectarTipoSuscripcion(nombreSusc);
    const opcGrupales = document.getElementById('match-opciones-grupales');
    const cantoWrapper = document.getElementById('match-canto-wrapper');
    const excluirWrapper = document.getElementById('match-excluir-wrapper');
    const cantWrapper = document.getElementById('match-cantidad-wrapper');
    const nivelWrapper = document.getElementById('match-nivel-wrapper');

    if (tipo === 'individual') {
        if (opcGrupales) opcGrupales.style.display = 'none';
        if (cantoWrapper) cantoWrapper.style.display = 'none';
        if (cantWrapper) cantWrapper.style.display = 'none';
        if (nivelWrapper) nivelWrapper.style.display = 'none';
    } else if (tipo === 'grupal') {
        if (opcGrupales) opcGrupales.style.display = 'flex';
        if (cantoWrapper) cantoWrapper.style.display = 'block';
        const esCanto = document.getElementById('match-chk-canto')?.checked || false;
        if (excluirWrapper) excluirWrapper.style.display = esCanto ? 'none' : 'block';
        if (cantWrapper) cantWrapper.style.display = 'block';
        if (nivelWrapper) nivelWrapper.style.display = 'block';
    } else if (tipo === 'ensamble') {
        if (opcGrupales) opcGrupales.style.display = 'flex';
        if (cantoWrapper) cantoWrapper.style.display = 'none'; // Ensambles son instrumentales
        if (excluirWrapper) excluirWrapper.style.display = 'block';
        if (cantWrapper) cantWrapper.style.display = 'block';
        if (nivelWrapper) nivelWrapper.style.display = 'block';
    }
    filtrarProfesoresMatch();
}

function filtrarProfesoresMatch() {
    const susc = document.getElementById('match-suscripcion')?.value || '';
    const tipo = detectarTipoSuscripcion(susc);
    const esCanto = tipo === 'grupal' && (document.getElementById('match-chk-canto')?.checked || false);
    const selProfe = document.getElementById('match-profe');
    if (!selProfe) return;
    const valActual = selProfe.value;

    selProfe.innerHTML = '<option value="">Cualquier profesor disponible</option>';

    const profesFiltrados = matchProfesores.filter(pr => {
        if (tipo === 'individual') return true;
        if (esCanto) return (pr.skills || []).some(s => s.toLowerCase().includes('canto') || s.toLowerCase().includes('voz'));
        if (tipo === 'ensamble') return pr.ensambles === true;
        return pr.grupales === true || pr.ensambles === true;
    });

    profesFiltrados.forEach(pr => {
        const opt = document.createElement('option');
        opt.value = pr.id;
        opt.textContent = pr.nombre;
        opt.dataset.skills = JSON.stringify(pr.skills || []);
        opt.dataset.ensambles = pr.ensambles ? 'true' : 'false';
        opt.dataset.disponibilidad = JSON.stringify(pr.disponibilidad || {});
        opt.dataset.correoCalendario = pr.correo_calendario || '';
        opt.dataset.nombre = pr.nombre || '';
        selProfe.appendChild(opt);
    });

    if (valActual) selProfe.value = valActual;
    mostrarSkillsProfe();
}

function mostrarSkillsProfe() {
    const selProfe = document.getElementById('match-profe');
    const cont = document.getElementById('match-profe-skills');
    if (!cont) return;
    const opt = selProfe.options[selProfe.selectedIndex];
    if (!opt || !opt.value) { cont.innerHTML = ''; return; }
    try {
        const skills = JSON.parse(opt.dataset.skills || '[]');
        cont.innerHTML = skills.length > 0
            ? skills.map(s => `<span class="match-skill-tag">${s}</span>`).join('')
            : '<span style="font-size:12px; color:var(--text-light);">Sin skills registrados</span>';
    } catch { cont.innerHTML = ''; }
}

function initMatchFormListeners(cfgMin = 2, cfgMax = 6) {
    // Panel colapsable
    document.getElementById('match-criterios-toggle')?.addEventListener('click', () => {
        document.getElementById('match-criterios-panel').classList.toggle('collapsed');
    });

    // Cambio de Suscripción -> adapta automáticamente los campos
    document.getElementById('match-suscripcion')?.addEventListener('change', (e) => {
        adaptarFormularioPorSuscripcion(e.target.value);
    });

    // Checkbox Grupales de Canto
    document.getElementById('match-chk-canto')?.addEventListener('change', () => {
        const esCanto = document.getElementById('match-chk-canto').checked;
        const excWrapper = document.getElementById('match-excluir-wrapper');
        if (excWrapper) excWrapper.style.display = esCanto ? 'none' : 'block';
        filtrarProfesoresMatch();
    });

    // Cambio de profesor → mostrar skills
    document.getElementById('match-profe')?.addEventListener('change', mostrarSkillsProfe);

    // Pills de días (multi-selección)
    document.querySelectorAll('.match-day-pill').forEach(pill => {
        pill.addEventListener('click', () => pill.classList.toggle('active'));
    });

    // Stepper cantidad máxima
    document.getElementById('match-cant-menos')?.addEventListener('click', () => {
        if (matchCantidadActual > cfgMin) {
            matchCantidadActual--;
            document.getElementById('match-cantidad-valor').textContent = matchCantidadActual;
        }
    });
    document.getElementById('match-cant-mas')?.addEventListener('click', () => {
        if (matchCantidadActual < cfgMax) {
            matchCantidadActual++;
            document.getElementById('match-cantidad-valor').textContent = matchCantidadActual;
        }
    });

    // Cargar alumnos de prueba
    document.getElementById('btn-mock-match-data')?.addEventListener('click', generarAlumnosPruebaMatch);
    document.getElementById('btn-mock-match-indiv')?.addEventListener('click', generarAlumnosIndividualesPruebaMatch);
    document.getElementById('btn-limpiar-mock-data')?.addEventListener('click', limpiarAlumnosPruebaMatch);

    // Limpiar formulario
    document.getElementById('match-btn-limpiar')?.addEventListener('click', resetMatchForm);

    // Buscar matches
    document.getElementById('match-btn-buscar')?.addEventListener('click', ejecutarBusquedaMatch);

    // Confirmar desde modal de confirmación
    document.getElementById('btn-ejecutar-confirmar-match')?.addEventListener('click', ejecutarConfirmarMatch);

    // Confirmar desde modal de detalle
    document.getElementById('btn-detalle-confirmar')?.addEventListener('click', () => {
        const idx = parseInt(document.getElementById('detalle-grupo-index')?.value);
        if (!isNaN(idx) && matchGruposSugeridos[idx]) {
            document.getElementById('modal-detalle-grupo').close();
            abrirModalConfirmarMatch(matchGruposSugeridos[idx]);
        }
    });
}

function resetMatchForm() {
    const selSusc = document.getElementById('match-suscripcion');
    if (selSusc) selSusc.selectedIndex = 0;
    adaptarFormularioPorSuscripcion('');

    // Reset Canto
    const chkCanto = document.getElementById('match-chk-canto');
    if (chkCanto) chkCanto.checked = false;

    // Reset profe
    document.getElementById('match-profe').selectedIndex = 0;
    document.getElementById('match-profe-skills').innerHTML = '';
    filtrarProfesoresMatch();

    // Reset edad
    document.getElementById('match-edad-desde').value = '';
    document.getElementById('match-edad-hasta').value = '';

    // Reset stepper
    matchCantidadActual = 4;
    document.getElementById('match-cantidad-valor').textContent = 4;

    // Reset niveles
    document.querySelectorAll('[name="match-nivel"]').forEach(cb => cb.checked = false);

    // Reset días
    document.querySelectorAll('.match-day-pill').forEach(p => p.classList.remove('active'));

    // Reset horario
    document.getElementById('match-hora-desde').value = '';
    document.getElementById('match-hora-hasta').value = '';

    // Reset exclusión de instrumentos
    const excSel = document.getElementById('match-excluir-instrumentos');
    if (excSel) {
        Array.from(excSel.options).forEach(o => o.selected = false);
        syncSelectToChips('match-excluir-instrumentos', 'match-chips-excluir');
    }

    // Ocultar resultados
    ocultarResultadosMatch();
}

function ocultarResultadosMatch() {
    const res = document.getElementById('match-resultados');
    const badge = document.getElementById('match-resultados-badge');
    const grid = document.getElementById('match-resultados-grid');
    const noRes = document.getElementById('match-sin-resultados');
    if (res) res.style.display = 'none';
    if (badge) badge.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (noRes) noRes.style.display = 'none';
    matchGruposSugeridos = [];
}

// ================================================================
// MÓDULO MATCH — ETAPA 4 — Fases 4 y 5: Motor de Match y Resultados
// ================================================================

// Días de la semana para mapeo
const mapaDiasCodigos = { 'L': 'Lunes', 'M': 'Martes', 'X': 'Miércoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sábado' };

// Función de compatibilidad de niveles
function sonNivelesCompatibles(niveles) {
    const limpios = niveles.filter(n => n && typeof n === 'string' && n.trim() !== '');
    if (limpios.length <= 1) return true;
    const esInicial = limpios.every(n => n === 'Inicial I' || n === 'Inicial II');
    const esAvanzado = limpios.every(n => n === 'Intermedio' || n === 'Avanzado');
    return esInicial || esAvanzado;
}

// Función de compatibilidad de edades
function sonEdadesCompatibles(edades, cfg) {
    const validas = edades.filter(e => typeof e === 'number' && !isNaN(e) && e > 0);
    if (validas.length <= 1) return true;

    const tieneNinos = validas.some(e => e < 13);
    const tieneAdultos = validas.some(e => e >= 13);

    // No mezclar niños con adultos
    if (tieneNinos && tieneAdultos) return false;

    // Si todos son niños (< 13)
    if (tieneNinos && !tieneAdultos) {
        const ninosLibre = cfg.reglas_edad_ninos?.libre !== false;
        if (ninosLibre) return true;
        const minE = Math.min(...validas), maxE = Math.max(...validas);
        return (maxE - minE) <= 3; // tolerancia por defecto si no es libre
    }

    // Adultos (todos >= 13)
    const minEdad = Math.min(...validas);
    const maxEdad = Math.max(...validas);
    const diffEdad = maxEdad - minEdad;

    const reglas = Array.isArray(cfg.reglas_edad_match) && cfg.reglas_edad_match.length > 0
        ? cfg.reglas_edad_match
        : defaultCfg.reglas_edad_match;

    // Buscar la regla aplicable según la edad menor o de referencia
    let reglaAplicable = reglas[0];
    for (let r of reglas) {
        if (minEdad >= r.desde) {
            reglaAplicable = r;
        }
    }

    const tolerancia = Math.abs(reglaAplicable.rango_max - reglaAplicable.rango_min);
    return diffEdad <= tolerancia;
}

// Calcular intersección horaria entre alumnos y profesor en un día
function buscarHuecosComunes(alumnos, profe, diasFiltro, horaDesde, horaHasta) {
    const slots = [];
    const diasEvaluar = diasFiltro && diasFiltro.length > 0
        ? diasFiltro
        : ['L', 'M', 'X', 'J', 'V', 'S'];

    diasEvaluar.forEach(diaId => {
        // Horarios del profesor en este día
        const dispProfe = (profe.disponibilidad && profe.disponibilidad[diaId]) || [];
        if (dispProfe.length === 0) return;

        // Horarios de cada alumno en este día
        const dispAlumnos = alumnos.map(al => (al.disponibilidad && al.disponibilidad[diaId]) || []);
        if (dispAlumnos.some(d => d.length === 0)) return; // Si algún alumno no tiene disp este día, descartar

        // Evaluar cada rango del profesor
        dispProfe.forEach(rProfe => {
            let pIniMins = convertirHoraAMinutos(rProfe.inicio || '09:00');
            let pFinMins = convertirHoraAMinutos(rProfe.fin || '22:00');

            // Acotar con los filtros del formulario si se especificaron
            if (horaDesde) {
                const fIniMins = convertirHoraAMinutos(horaDesde);
                if (fIniMins > pIniMins) pIniMins = fIniMins;
            }
            if (horaHasta) {
                const fFinMins = convertirHoraAMinutos(horaHasta);
                if (fFinMins < pFinMins) pFinMins = fFinMins;
            }

            if (pFinMins - pIniMins < 60) return; // Mínimo 1 hora

            // Intersectar con la disponibilidad de todos los alumnos
            let iniComun = pIniMins;
            let finComun = pFinMins;

            for (let dispAl of dispAlumnos) {
                let alumnoCubre = false;
                for (let rAl of dispAl) {
                    const alIni = convertirHoraAMinutos(rAl.inicio || '09:00');
                    const alFin = convertirHoraAMinutos(rAl.fin || '22:00');

                    const startMax = Math.max(iniComun, alIni);
                    const endMin = Math.min(finComun, alFin);

                    if (endMin - startMax >= 60) {
                        iniComun = startMax;
                        finComun = endMin;
                        alumnoCubre = true;
                        break;
                    }
                }
                if (!alumnoCubre) {
                    iniComun = -1;
                    break;
                }
            }

            if (iniComun >= 0 && finComun - iniComun >= 60) {
                // Generar slot de 1 hora
                const horaIniStr = minutosAHora(iniComun);
                const horaFinStr = minutosAHora(iniComun + 60);
                slots.push({
                    diaId,
                    diaNombre: mapaDiasCodigos[diaId] || diaId,
                    inicio: horaIniStr,
                    fin: horaFinStr,
                    inicioMin: iniComun,
                    finMin: finComun,
                    duracionTotalMin: finComun - iniComun
                });
            }
        });
    });

    return slots;
}

function convertirHoraAMinutos(horaStr) {
    if (!horaStr) return 0;
    const parts = horaStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || 0, 10);
}

function minutosAHora(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Cálculo del % de compatibilidad
function calcularScoreCompatibilidad(alumnos, profe, slot, esCanto, esGrupal) {
    let score = 0;
    const desglose = [];

    // 1. Compatibilidad de Horarios (30%)
    if (slot.duracionTotalMin >= 120) {
        score += 30;
        desglose.push('🕒 Gran flexibilidad horaria (+30%)');
    } else if (slot.duracionTotalMin >= 60) {
        score += 25;
        desglose.push('🕒 Coincidencia horaria (+25%)');
    }

    // 2. Compatibilidad de Niveles (25%)
    const niveles = alumnos.map(a => a.nivel).filter(Boolean);
    const todosMismoNivel = niveles.length > 0 && niveles.every(n => n === niveles[0]);
    if (todosMismoNivel) {
        score += 25;
        desglose.push(`🎯 Mismo nivel (${niveles[0]}) (+25%)`);
    } else if (sonNivelesCompatibles(niveles)) {
        score += 20;
        desglose.push('🎯 Niveles afines compatibles (+20%)');
    } else {
        score += 10;
        desglose.push('🎯 Niveles con diferencia (+10%)');
    }

    // 3. Compatibilidad de Edades (25%)
    const edades = alumnos.map(a => a.edad).filter(e => typeof e === 'number' && e > 0);
    if (edades.length <= 1) {
        score += 25;
        desglose.push('👤 Edad acorde (+25%)');
    } else {
        const minE = Math.min(...edades), maxE = Math.max(...edades);
        const diff = maxE - minE;
        if (diff <= 3) {
            score += 25;
            desglose.push(`🎂 Edades muy homogéneas (${minE}-${maxE}a) (+25%)`);
        } else if (diff <= 8) {
            score += 20;
            desglose.push(`🎂 Rango de edad equilibrado (${minE}-${maxE}a) (+20%)`);
        } else {
            score += 15;
            desglose.push(`🎂 Rango de edad tolerable (${minE}-${maxE}a) (+15%)`);
        }
    }

    // 4. Variedad de Instrumentos / Skills (20%)
    if (!esGrupal) {
        score += 20;
        desglose.push('🎸 Clase individual asignada (+20%)');
    } else if (esCanto) {
        score += 20;
        desglose.push('🎤 Grupo vocal canto (+20%)');
    } else {
        const todosInsts = new Set();
        alumnos.forEach(a => {
            const insts = Array.isArray(a.instrumento) ? a.instrumento : [a.instrumento];
            insts.forEach(i => { if (i) todosInsts.add(i); });
        });
        if (todosInsts.size >= 3) {
            score += 20;
            desglose.push(`🎼 Excelente variedad (${todosInsts.size} inst.) (+20%)`);
        } else if (todosInsts.size >= 2) {
            score += 15;
            desglose.push(`🎼 Ensamble equilibrado (${todosInsts.size} inst.) (+15%)`);
        } else {
            score += 5;
            desglose.push('🎼 Pocos instrumentos variados (+5%)');
        }
    }

    return { porcentaje: Math.min(score, 100), desglose };
}

// Generador de combinaciones de alumnos
function generarCombinaciones(arr, k) {
    if (k === 1) return arr.map(e => [e]);
    const res = [];
    for (let i = 0; i < arr.length - k + 1; i++) {
        const head = arr[i];
        const tailCombos = generarCombinaciones(arr.slice(i + 1), k - 1);
        tailCombos.forEach(t => res.push([head, ...t]));
    }
    return res;
}

// EJECUCIÓN PRINCIPAL DE BÚSQUEDA
async function ejecutarBusquedaMatch() {
    const susc = document.getElementById('match-suscripcion').value;
    if (!susc) {
        alert('Por favor seleccioná una suscripción.');
        return;
    }

    const btnBuscar = document.getElementById('match-btn-buscar');
    setBotonCargando(btnBuscar, true);

    const tipoDetectado = detectarTipoSuscripcion(susc);
    const esGrupal = tipoDetectado !== 'individual';
    const esCanto = tipoDetectado === 'grupal' && (document.getElementById('match-chk-canto')?.checked || false);

    const selExcluir = document.getElementById('match-excluir-instrumentos');
    const excluirInsts = selExcluir ? Array.from(selExcluir.selectedOptions).map(o => o.value) : [];

    const profeIdSeleccionado = document.getElementById('match-profe').value;
    const edadDesde = parseInt(document.getElementById('match-edad-desde').value) || null;
    const edadHasta = parseInt(document.getElementById('match-edad-hasta').value) || null;
    const cantidadDeseada = matchCantidadActual || 4;

    const nivelesSeleccionados = Array.from(document.querySelectorAll('input[name="match-nivel"]:checked')).map(cb => cb.value);

    const diasMap = { 'lunes': 'L', 'martes': 'M', 'miercoles': 'X', 'jueves': 'J', 'viernes': 'V', 'sabado': 'S' };
    const diasSeleccionados = Array.from(document.querySelectorAll('.match-day-pill.active')).map(p => diasMap[p.dataset.dia] || p.dataset.dia);

    const horaDesde = document.getElementById('match-hora-desde').value || null;
    const horaHasta = document.getElementById('match-hora-hasta').value || null;
    const instFiltro = document.getElementById('match-instrumento-filtro')?.value || '';

    // Mostrar sección de resultados
    const resSec = document.getElementById('match-resultados');
    const grid = document.getElementById('match-resultados-grid');
    const noRes = document.getElementById('match-sin-resultados');
    const badge = document.getElementById('match-resultados-badge');

    if (resSec) resSec.style.display = 'flex';
    if (grid) grid.innerHTML = '';
    if (badge) badge.style.display = 'none';
    if (noRes) { noRes.style.display = 'block'; noRes.textContent = '🔄 Buscando alumnos en lista de espera y cruzando horarios...'; }

    try {
        // 1. Obtener alumnos en Lista de espera
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Lista de espera")));
        let candidatos = [];

        qSnap.forEach(d => {
            const al = { id: d.id, ...d.data() };
            if (al.tipo_suscripcion !== susc) return;

            // Filtro de edad
            if (edadDesde !== null && al.edad && al.edad < edadDesde) return;
            if (edadHasta !== null && al.edad && al.edad > edadHasta) return;

            // Filtro de nivel en grupal
            if (esGrupal && nivelesSeleccionados.length > 0 && al.nivel && !nivelesSeleccionados.includes(al.nivel)) return;

            const insts = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);

            // Filtro de instrumento específico (opcional)
            if (instFiltro) {
                const tieneInst = insts.some(i => i.toLowerCase().trim() === instFiltro.toLowerCase().trim());
                if (!tieneInst) return;
            }

            // Filtro Canto
            if (esCanto) {
                const tieneCanto = insts.some(i => i.toLowerCase().includes('canto') || i.toLowerCase().includes('voz'));
                if (!tieneCanto) return;
            }

            // Exclusión de instrumentos
            if (excluirInsts.length > 0) {
                const disponibles = insts.filter(i => !excluirInsts.includes(i));
                if (disponibles.length === 0) return;
            }

            candidatos.push(al);
        });

        if (candidatos.length === 0) {
            noRes.textContent = 'No hay alumnos en Lista de Espera que coincidan con la suscripción y filtros seleccionados.';
            setBotonCargando(btnBuscar, false);
            return;
        }

        // 2. Profesores a evaluar
        let profesAEvaluar = matchProfesores.filter(pr => {
            if (profeIdSeleccionado && pr.id !== profeIdSeleccionado) return false;
            if (!esGrupal) return true;
            if (esCanto) return (pr.skills || []).some(s => s.toLowerCase().includes('canto'));
            return pr.ensambles === true;
        });

        if (profesAEvaluar.length === 0) {
            noRes.textContent = 'No hay profesores disponibles con las habilidades/aptitud para esta búsqueda.';
            setBotonCargando(btnBuscar, false);
            return;
        }

        // 3. Algoritmo de Armado de Grupos / Matches
        const sugerencias = [];
        const configActiva = configApp || defaultCfg;
        const minIntegrantes = configActiva.grupo_min_integrantes || 2;

        if (!esGrupal) {
            // CASO INDIVIDUAL
            candidatos.forEach(al => {
                const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento];
                const instElegido = instFiltro || al.instrumento_asignado || insts[0] || '';

                profesAEvaluar.forEach(pr => {
                    // Check skills del profe
                    const profeSkills = pr.skills || [];
                    const enseñaInst = profeSkills.includes(instElegido) || profeSkills.length === 0 || insts.some(i => profeSkills.includes(i));
                    if (!enseñaInst) return;

                    const huecos = buscarHuecosComunes([al], pr, diasSeleccionados, horaDesde, horaHasta);
                    huecos.forEach(slot => {
                        const { porcentaje, desglose } = calcularScoreCompatibilidad([al], pr, slot, false, false);
                        const horaCorta = slot.inicio.replace(':', '.');
                        const nombreSugerido = `${slot.diaId}${horaCorta} ${pr.nombre.split(' ')[0]}`;

                        const alConInst = { ...al, instrumento_asignado: instElegido };

                        sugerencias.push({
                            tipo: 'Individual',
                            nombreSugerido,
                            horario: `${slot.diaNombre} ${slot.inicio} a ${slot.fin} hs`,
                            slot,
                            profeId: pr.id,
                            profeNombre: pr.nombre,
                            profeCalId: pr.correo_calendario || '',
                            aula: 'Aula 1',
                            alumnos: [alConInst],
                            compatibilidad: porcentaje,
                            desglose
                        });
                    });
                });
            });
        } else {
            // CASO GRUPAL / ENSAMBLE
            const tamanoMaximo = Math.min(cantidadDeseada, candidatos.length);
            const tamanos = [];
            for (let t = tamanoMaximo; t >= minIntegrantes; t--) {
                tamanos.push(t);
            }

            for (let tam of tamanos) {
                const combinaciones = generarCombinaciones(candidatos, tam);

                for (let grupoAlumnos of combinaciones) {
                    // Regla de niveles
                    const nivelesGrupo = grupoAlumnos.map(a => a.nivel);
                    if (!sonNivelesCompatibles(nivelesGrupo)) continue;

                    // Regla de edades
                    const edadesGrupo = grupoAlumnos.map(a => a.edad);
                    if (!sonEdadesCompatibles(edadesGrupo, configActiva)) continue;

                    // Regla de variedad de instrumentos (para ensambles que no sean solo Canto)
                    if (!esCanto) {
                        const instDistintos = new Set();
                        grupoAlumnos.forEach(a => {
                            const insts = Array.isArray(a.instrumento) ? a.instrumento : [a.instrumento];
                            insts.forEach(i => { if (i) instDistintos.add(i); });
                        });
                        if (instDistintos.size < 2) continue; // Requiere mínimo 2 instrumentos diferentes
                    }

                    // Evaluar contra profesores
                    profesAEvaluar.forEach(pr => {
                        const huecos = buscarHuecosComunes(grupoAlumnos, pr, diasSeleccionados, horaDesde, horaHasta);
                        huecos.forEach(slot => {
                            const { porcentaje, desglose } = calcularScoreCompatibilidad(grupoAlumnos, pr, slot, esCanto, true);
                            const horaCorta = slot.inicio.replace(':', '.');
                            const nombreSugerido = `${slot.diaId}${horaCorta} ${pr.nombre.split(' ')[0]}`;

                            sugerencias.push({
                                tipo: esCanto ? 'Grupal Canto' : 'Ensamble',
                                nombreSugerido,
                                horario: `${slot.diaNombre} ${slot.inicio} a ${slot.fin} hs`,
                                slot,
                                profeId: pr.id,
                                profeNombre: pr.nombre,
                                profeCalId: pr.correo_calendario || '',
                                aula: 'Aula Principal',
                                alumnos: grupoAlumnos,
                                compatibilidad: porcentaje,
                                desglose
                            });
                        });
                    });
                }
            }
        }

        // Ordenar por mejor compatibilidad y tamaño
        sugerencias.sort((a, b) => {
            if (b.compatibilidad !== a.compatibilidad) return b.compatibilidad - a.compatibilidad;
            return b.alumnos.length - a.alumnos.length;
        });

        // Limitar a las mejores 25 sugerencias únicas
        const unicos = [];
        const firmas = new Set();
        for (let sug of sugerencias) {
            const idsAlumnos = sug.alumnos.map(a => a.id).sort().join('_');
            const firma = `${sug.profeId}_${sug.slot.diaId}_${sug.slot.inicio}_${idsAlumnos}`;
            if (!firmas.has(firma)) {
                firmas.add(firma);
                unicos.push(sug);
            }
            if (unicos.length >= 25) break;
        }

        matchGruposSugeridos = unicos;
        renderResultadosMatch();

    } catch(err) {
        console.error("Error en búsqueda de matches:", err);
        noRes.textContent = 'Ocurrió un error al procesar el match: ' + err.message;
    }

    setBotonCargando(btnBuscar, false);
}

// RENDERIZADO DE RESULTADOS (Fase 5)
function renderResultadosMatch() {
    const grid = document.getElementById('match-resultados-grid');
    const noRes = document.getElementById('match-sin-resultados');
    const badge = document.getElementById('match-resultados-badge');

    if (!grid || !noRes || !badge) return;

    if (matchGruposSugeridos.length === 0) {
        grid.innerHTML = '';
        noRes.style.display = 'block';
        noRes.textContent = 'No se encontraron combinaciones compatibles con los criterios seleccionados.';
        badge.style.display = 'none';
        return;
    }

    noRes.style.display = 'none';
    badge.style.display = 'inline-flex';
    const esIndividual = matchGruposSugeridos.length > 0 && matchGruposSugeridos[0].tipo === 'Individual';
    badge.textContent = esIndividual ? `${matchGruposSugeridos.length} opciones sugeridas` : `${matchGruposSugeridos.length} grupos sugeridos`;

    grid.innerHTML = matchGruposSugeridos.map((grupo, idx) => {
        const pct = grupo.compatibilidad || 80;
        let barClass = 'high';
        if (pct < 60) barClass = 'low';
        else if (pct < 80) barClass = 'medium';

        const isBest = idx === 0 && pct >= 85;
        const isInd = grupo.tipo === 'Individual';

        const alumnosHtml = grupo.alumnos.map(al => {
            const instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'Sin inst.');
            const nivelStr = al.nivel || '';
            const edadStr = al.edad ? `${al.edad}a` : '';

            return `
                <div class="match-student-row">
                    <span class="match-student-name">👤 ${al.nombre}</span>
                    <div class="match-student-tags">
                        <span class="match-student-tag">${instStr}</span>
                        ${nivelStr ? `<span class="match-student-tag nivel">${nivelStr}</span>` : ''}
                        ${edadStr ? `<span class="match-student-tag edad">${edadStr}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        const cardTitulo = isInd ? `👤 ${grupo.alumnos[0].nombre}` : grupo.nombreSugerido;
        const cardSubtitulo = isInd ? `Clase Individual con ${grupo.profeNombre}` : `${grupo.tipo} · ${grupo.alumnos.length} integrantes`;
        const btnAccionTxt = isInd ? '👤 Asignar Profe' : '🧩 Confirmar';

        return `
            <div class="match-result-card ${isBest ? 'best-match' : ''}">
                <div class="match-card-header">
                    <div>
                        <h4 class="match-card-title">${cardTitulo}</h4>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${cardSubtitulo}</div>
                    </div>
                    ${isBest ? `<span class="status-badge bg-teal" style="font-size:10px;">⭐ Mejor Match</span>` : ''}
                </div>

                <!-- Barra de compatibilidad -->
                <div class="match-compat-bar-wrapper">
                    <div class="match-compat-label">
                        <span style="font-size:11px; font-weight:700; color:var(--text-muted);">COMPATIBILIDAD</span>
                        <span class="match-compat-pct" style="color:var(--accent-teal);">${pct}%</span>
                    </div>
                    <div class="match-compat-bar-track">
                        <div class="match-compat-bar ${barClass}" style="width:${pct}%;"></div>
                    </div>
                </div>

                <!-- Lista de integrantes -->
                <div style="display:flex; flex-direction:column; gap:6px;">
                    ${alumnosHtml}
                </div>

                <!-- Footer Horario / Profe -->
                <div class="match-card-footer">
                    <div>📅 <strong>${grupo.horario}</strong></div>
                    <div>👨‍🏫 Profesor: <strong>${grupo.profeNombre}</strong></div>
                </div>

                <!-- Acciones -->
                <div class="match-card-actions">
                    <button type="button" class="match-card-btn-revisar" onclick="abrirModalDetalleGrupo(${idx})">👁️ Revisar</button>
                    <button type="button" class="btn-primary" onclick="abrirModalConfirmarMatchPorIndice(${idx})">${btnAccionTxt}</button>
                </div>
            </div>
        `;
    }).join('');
}

// Abrir detalle / revisión de grupo
window.abrirModalDetalleGrupo = function(idx) {
    const grupo = matchGruposSugeridos[idx];
    if (!grupo) return;

    document.getElementById('detalle-grupo-index').value = idx;
    document.getElementById('detalle-grupo-titulo').textContent = grupo.nombreSugerido;
    document.getElementById('detalle-grupo-badge').textContent = `${grupo.tipo} · ${grupo.alumnos.length} alumnos`;

    const pct = grupo.compatibilidad || 80;
    document.getElementById('detalle-compat-pct').textContent = `${pct}%`;
    const bar = document.getElementById('detalle-compat-bar');
    bar.style.width = `${pct}%`;
    bar.className = `match-compat-bar ${pct >= 80 ? 'high' : (pct >= 60 ? 'medium' : 'low')}`;

    // Desglose
    const desgloseCont = document.getElementById('detalle-compat-desglose');
    desgloseCont.innerHTML = (grupo.desglose || []).map(item =>
        `<span style="font-size:11px; padding:4px 10px; background:var(--hover-bg); border:1px solid var(--border-color); border-radius:20px; color:var(--text-main); font-weight:600;">${item}</span>`
    ).join('');

    // Integrantes
    const intCont = document.getElementById('detalle-grupo-integrantes');
    intCont.innerHTML = grupo.alumnos.map(al => {
        const instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'Sin inst.');
        return `
            <div class="match-confirm-row">
                <div style="flex:1;">
                    <div style="font-weight:700; color:var(--text-main); font-size:13.5px;">👤 ${al.nombre}</div>
                    <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">📱 ${al.celular || 'Sin celular'} · ${al.tipo_suscripcion || ''}</div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                    <span class="match-student-tag">${instStr}</span>
                    ${al.nivel ? `<span class="match-student-tag nivel">${al.nivel}</span>` : ''}
                    ${al.edad ? `<span class="match-student-tag edad">${al.edad}a</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Info horario / profe
    document.getElementById('detalle-grupo-info').innerHTML = `
        <div>📅 <strong>Horario:</strong> ${grupo.horario}</div>
        <div>👨‍🏫 <strong>Profesor Asignado:</strong> ${grupo.profeNombre}</div>
    `;

    document.getElementById('modal-detalle-grupo').showModal();
};

// Abrir confirmación por índice
window.abrirModalConfirmarMatchPorIndice = function(idx) {
    const grupo = matchGruposSugeridos[idx];
    if (grupo) abrirModalConfirmarMatch(grupo);
};

function abrirModalConfirmarMatch(grupo) {
    const isInd = grupo.tipo === 'Individual';
    const nombreSugerido = isInd ? 'Clase Individual' : (grupo.nombreSugerido || '');
    const modalTitulo = document.getElementById('match-confirm-modal-titulo');
    const wrapperNombre = document.getElementById('match-confirm-nombre-grupo-wrapper');
    const btnEjecutar = document.getElementById('btn-ejecutar-confirmar-match');

    if (modalTitulo) modalTitulo.textContent = isInd ? '👤 Asignar Profesor a Alumno' : '🧩 Confirmar Match de Grupo';
    if (wrapperNombre) wrapperNombre.style.display = isInd ? 'none' : 'block';
    if (btnEjecutar) btnEjecutar.textContent = isInd ? '✅ Asignar Profesor' : '✅ Confirmar y Asignar';

    document.getElementById('match-confirm-nombre-grupo').value = nombreSugerido;
    document.getElementById('match-confirm-resumen').innerHTML = `
        <div>📅 <strong>${grupo.horario || 'Horario por definir'}</strong></div>
        <div>👨‍🏫 Profesor: <strong>${grupo.profeNombre || 'Sin asignar'}</strong></div>
    `;
    document.getElementById('match-confirm-integrantes').innerHTML = (grupo.alumnos || []).map(al =>
        `<div class="match-confirm-row">
            <span class="match-confirm-row-name">👤 ${al.nombre}</span>
            <span class="match-confirm-row-info">${(al.instrumento || []).join(', ')} · ${al.nivel || '-'} · ${al.edad ? al.edad + 'a' : '-'}</span>
        </div>`
    ).join('');
    document.getElementById('match-confirm-data').value = JSON.stringify(grupo);
    document.getElementById('modal-confirmar-match').showModal();
}

// Helper para calcular la próxima fecha y hora sugerida según día y hora
function calcularProximaFechaDiaHora(diaCodigo, horaStr) {
    const diasMap = { 'D': 0, 'L': 1, 'M': 2, 'X': 3, 'J': 4, 'V': 5, 'S': 6 };
    const targetDay = diasMap[diaCodigo];
    if (targetDay === undefined) return '';

    const [hs, mins] = (horaStr || '18:00').split(':').map(Number);
    const fecha = new Date();
    const currentDay = fecha.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7;
    fecha.setDate(fecha.getDate() + diff);
    fecha.setHours(hs || 18, mins || 0, 0, 0);

    const y = fecha.getFullYear();
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const d = fecha.getDate().toString().padStart(2, '0');
    const h = fecha.getHours().toString().padStart(2, '0');
    const mi = fecha.getMinutes().toString().padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${mi}`;
}

// CONFIRMACIÓN Y ASIGNACIÓN MASIVA (Fase 6)
async function ejecutarConfirmarMatch() {
    const dataRaw = document.getElementById('match-confirm-data').value;
    if (!dataRaw) return;

    const grupo = JSON.parse(dataRaw);
    const isInd = grupo.tipo === 'Individual';
    let nombreGrupo = document.getElementById('match-confirm-nombre-grupo').value.trim();

    if (!isInd && !nombreGrupo) {
        alert('Por favor ingresá un nombre para el grupo.');
        return;
    }
    if (isInd) nombreGrupo = 'Clase Individual';

    const btnConfirm = document.getElementById('btn-ejecutar-confirmar-match');
    setBotonCargando(btnConfirm, true);

    const now = new Date();
    const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

    const diaId = grupo.slot?.diaId || 'M';
    const horaInicio = grupo.slot?.inicio || '18:00';
    const fechaSugerida = calcularProximaFechaDiaHora(diaId, horaInicio);

    try {
        for (const al of grupo.alumnos) {
            const alRef = doc(db, "alumnos", al.id);
            const alDoc = await getDoc(alRef);
            const alData = alDoc.exists() ? alDoc.data() : {};
            const hist = alData.historial || [];

            const textoHist = isInd
                ? `Propuesta individual pre-armada con Profe ${grupo.profeNombre || 'a definir'} (${grupo.horario}). En espera de validación con el alumno.`
                : `Match pre-armado: Asignado al grupo "${nombreGrupo}" (${grupo.horario}) con Profe ${grupo.profeNombre || 'a definir'}. En espera de validación con el alumno.`;

            hist.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                texto: textoHist,
                fecha: fechaStr
            });

            const instAsignado = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || ''));

            await updateDoc(alRef, {
                estado_agenda: "Validando Grupo",
                estado_validacion_alumno: "pendiente",
                instrumento_asignado: instAsignado,
                grupo_asignado: isInd ? '' : nombreGrupo,
                reserva_profe_id: grupo.profeId || '',
                reserva_profe_nombre: grupo.profeNombre || '',
                reserva_fecha_texto: grupo.horario || '',
                horario_match: grupo.horario || '',
                dia_match: diaId,
                horario_inicio_match: horaInicio,
                horario_fin_match: grupo.slot?.fin || '',
                aula_asignada: grupo.aula || '',
                fecha_sugerida_inicio: fechaSugerida,
                fecha_inicio_clases: fechaSugerida ? new Date(fechaSugerida).toISOString() : null,
                historial: hist
            });
        }

        document.getElementById('modal-confirmar-match').close();

        if (isInd) {
            alert(`✅ Propuesta individual creada con éxito. Pasó a "Grupos en Validación" para coordinar con el alumno.`);
        } else {
            alert(`✅ Grupo "${nombreGrupo}" pre-armado con éxito. Pasó a "Grupos en Validación" para coordinar con los alumnos.`);
        }

        // Navegar directamente a la pestaña de Grupos en Validación
        await cargarVista('Match - En Validacion');

    } catch(err) {
        console.error("Error al confirmar match:", err);
        alert("Error al confirmar: " + err.message);
    }

    setBotonCargando(btnConfirm, false);
}

function obtenerEmojiInstrumento(inst) {
    if (!inst) return '🎵';
    const s = (Array.isArray(inst) ? inst.join(' ') : String(inst)).toLowerCase();
    if (s.includes('gui') || s.includes('electr')) return configApp?.emoji_guitarra || '🎸';
    if (s.includes('bat')) return configApp?.identificador_bateria || '🥁';
    if (s.includes('canto') || s.includes('voz') || s.includes('coro')) return configApp?.emoji_canto || '🎤';
    if (s.includes('pian') || s.includes('tecl')) return configApp?.emoji_piano || '🎹';
    if (s.includes('baj')) return configApp?.emoji_bajo || '🎸';
    if (s.includes('caj')) return configApp?.emoji_cajon || '📦';
    if (s.includes('sax') || s.includes('vient')) return '🎷';
    if (s.includes('viol')) return '🎻';
    if (s.includes('ukel') || s.includes('ucu')) return '🪕';
    return '🎵';
}

// =======================================================================
// MÓDULO MATCH — VISTA DE CAJAS: GRUPOS EN VALIDACIÓN
// =======================================================================

async function renderMatchEnValidacion(container) {
    document.getElementById('vista-titulo').innerHTML = '<span style="color:var(--text-muted); font-weight:500;">Match › </span><span style="color:var(--text-main); font-weight:700;">Grupos en Validación</span>';
    document.getElementById('controles-vista').style.display = 'none';
    document.getElementById('search-container-general').style.display = 'none';
    const contMatch = document.getElementById('match-pendientes-container');
    if (contMatch) contMatch.style.display = 'none';
    
    container.style.display = 'flex';
    container.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">Cargando grupos en validación...</div>';

    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Validando Grupo")));
        let alumnosEnValidacion = [];
        qSnap.forEach(d => alumnosEnValidacion.push({ id: d.id, ...d.data() }));

        if (alumnosEnValidacion.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; background:white; border-radius:14px; border:1px solid var(--border-color); color:var(--text-muted); width:100%;">
                    <div style="font-size:2.5em; margin-bottom:10px;">👥</div>
                    <div style="font-size:16px; font-weight:700; color:var(--text-main); margin-bottom:6px;">No hay grupos en validación</div>
                    <div style="font-size:13px; max-width:450px; margin:0 auto;">Creá una propuesta desde <strong>"Crear Grupos / Match"</strong> para comenzar a coordinar y validar con los alumnos.</div>
                </div>
            `;
            return;
        }

        // Agrupar por grupo_asignado
        const gruposMap = {};
        alumnosEnValidacion.forEach(al => {
            const grpNom = al.grupo_asignado || 'Clases Individuales';
            if (!gruposMap[grpNom]) gruposMap[grpNom] = [];
            gruposMap[grpNom].push(al);
        });

        let html = '';
        Object.entries(gruposMap).forEach(([nombreGrupo, integrantes]) => {
            const primer = integrantes[0] || {};
            const horario = primer.horario_match || primer.reserva_fecha_texto || 'Horario a confirmar';
            const profeNom = primer.reserva_profe_nombre || 'Profe a definir';
            const aula = primer.aula_asignada || 'Aula Principal';
            const confirmados = integrantes.filter(i => i.estado_validacion_alumno === 'confirmado').length;
            const total = integrantes.length;
            const todosConfirmados = confirmados === total;

            const chipClass = todosConfirmados ? 'status-val-ok' : (confirmados > 0 ? 'status-val-pending' : 'status-val-pending');
            const chipTxt = `${confirmados}/${total} Validados`;

            const integrantesHtml = integrantes.map(al => {
                const isConfirmed = al.estado_validacion_alumno === 'confirmado';
                const instAsignado = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento);
                const emojiInst = obtenerEmojiInstrumento(instAsignado);
                
                return `
                    <div class="group-member-row">
                        <div class="group-member-info">
                            <span class="group-member-name">👤 ${al.nombre}</span>
                            ${al.edad ? `<span style="font-size:12px; color:var(--text-muted);">${al.edad}a</span>` : ''}
                            <span class="match-student-tag">${emojiInst} ${instAsignado}</span>
                            <span class="group-member-status-chip ${isConfirmed ? 'status-val-ok' : 'status-val-pending'}">
                                ${isConfirmed ? '✅ Confirmó' : '⏳ Pendiente'}
                            </span>
                        </div>
                        <div class="group-member-actions">
                            <button type="button" class="row-quick-btn secondary" onclick="window.enviarWhatsAppValidacionGrupo('${al.id}')" title="Mensaje WhatsApp">💬 WhatsApp</button>
                            <button type="button" class="row-quick-btn ${isConfirmed ? 'primary' : 'secondary'}" onclick="window.toggleValidacionAlumnoGrupo('${al.id}', ${!isConfirmed})" title="Marcar confirmación">
                                ${isConfirmed ? '✔️ Desmarcar' : '✔️ Confirmó'}
                            </button>
                            <button type="button" class="row-quick-btn primary" onclick="window.aprobarAlumnoIndividualPrealta('${al.id}')" title="Aprobar individualmente a Altas">🚀 Aprobar</button>
                            <button type="button" class="row-quick-btn danger" onclick="window.rechazarAlumnoGrupoYVolverEspera('${al.id}')" title="Rechazar y regresar a Lista de Espera">❌</button>
                        </div>
                    </div>
                `;
            }).join('');

            html += `
                <div class="group-box-card" style="width:100%;">
                    <div class="group-box-header">
                        <div>
                            <div class="group-box-title">
                                <span>🧩 ${nombreGrupo}</span>
                                <span class="group-member-status-chip ${chipClass}">${chipTxt}</span>
                            </div>
                            <div class="group-box-subtitle">
                                <span>📅 <strong>${horario}</strong></span>
                                <span>•</span>
                                <span>👨‍🏫 Profe: <strong>${profeNom}</strong></span>
                            </div>
                        </div>
                        <div class="group-box-actions">
                            <button type="button" class="btn-primary" onclick="window.aprobarGrupoCompletoPrealta('${nombreGrupo}')" style="padding:8px 16px; font-size:13px;">
                                ✅ Aprobar Grupo a Altas
                            </button>
                            <button type="button" class="filter-chip" onclick="window.desarmarGrupoValidacion('${nombreGrupo}')" style="padding:8px 12px; font-size:13px; color:var(--accent-red); border-color:rgba(194,86,59,0.3);">
                                ❌ Desarmar Grupo
                            </button>
                        </div>
                    </div>
                    <div class="group-box-members">
                        ${integrantesHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

    } catch(err) {
        container.innerHTML = `<div style="padding:20px; color:var(--accent-red);">Error al cargar grupos en validación: ${err.message}</div>`;
    }
}

// Window actions para validación de grupos
window.toggleValidacionAlumnoGrupo = async function(alumnoId, nuevoEstado) {
    try {
        await updateDoc(doc(db, "alumnos", alumnoId), {
            estado_validacion_alumno: nuevoEstado ? "confirmado" : "pendiente"
        });
        await cargarVista('Match - En Validacion');
    } catch(err) {
        alert('Error al actualizar validación: ' + err.message);
    }
};

window.aprobarGrupoCompletoPrealta = async function(nombreGrupo) {
    if (!(await window.confirmar('Aprobar grupo', 'Todos sus integrantes pasaran a Altas Pendientes.', 'Aprobar Grupo'))) return;
    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Validando Grupo")));
        const now = new Date();
        const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

        for (const d of qSnap.docs) {
            const data = d.data();
            if ((data.grupo_asignado || 'Clases Individuales') === nombreGrupo) {
                const hist = data.historial || [];
                hist.push({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    texto: `Validación grupal aprobada: Grupo "${nombreGrupo}" pasa a Altas Pendientes.`,
                    fecha: fechaStr
                });
                await updateDoc(doc(db, "alumnos", d.id), {
                    estado_agenda: "Pre-alta Pendiente",
                    estado_validacion_alumno: "confirmado",
                    historial: hist
                });
            }
        }
        alert(`✅ Grupo "${nombreGrupo}" aprobado con éxito. Pasó a Altas Pendientes.`);
        await cargarVista('Altas - Pendientes');
    } catch(err) {
        alert('Error al aprobar grupo: ' + err.message);
    }
};

window.aprobarAlumnoIndividualPrealta = async function(alumnoId) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", alumnoId));
        if (!alDoc.exists()) return;
        const al = alDoc.data();
        if (!(await window.confirmar('Aprobar alumno', 'El alumno pasara a Altas Pendientes.', 'Aprobar'))) return;

        const now = new Date();
        const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
        const hist = al.historial || [];
        hist.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            texto: `Validación individual aprobada para ${al.grupo_asignado || 'clase'}. Pasa a Altas Pendientes.`,
            fecha: fechaStr
        });

        await updateDoc(doc(db, "alumnos", alumnoId), {
            estado_agenda: "Pre-alta Pendiente",
            estado_validacion_alumno: "confirmado",
            historial: hist
        });

        alert(`✅ ${al.nombre} aprobado a Altas Pendientes.`);
        await cargarVista('Match - En Validacion');
    } catch(err) {
        alert('Error al aprobar alumno: ' + err.message);
    }
};

window.rechazarAlumnoGrupoYVolverEspera = async function(alumnoId) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", alumnoId));
        if (!alDoc.exists()) return;
        const al = alDoc.data();
        if (!(await window.confirmar('Confirmar rechazo', 'El alumno volvera a Lista de Espera.', 'Confirmar rechazo'))) return;

        const now = new Date();
        const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
        const hist = al.historial || [];
        hist.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            texto: `Propuesta de grupo "${al.grupo_asignado || ''}" rechazada/no disponible. Vuelve a Lista de Espera.`,
            fecha: fechaStr
        });

        await updateDoc(doc(db, "alumnos", alumnoId), {
            estado_agenda: "Lista de espera",
            grupo_asignado: "",
            estado_validacion_alumno: null,
            historial: hist
        });

        alert(`↩️ ${al.nombre} volvió a Lista de Espera.`);
        await cargarVista('Match - En Validacion');
    } catch(err) {
        alert('Error al devolver alumno a lista de espera: ' + err.message);
    }
};

window.desarmarGrupoValidacion = async function(nombreGrupo) {
    if (!(await window.confirmar('Desarmar grupo', 'Todos los integrantes volvran a Lista de Espera.', 'Desarmar'))) return;
    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Validando Grupo")));
        const now = new Date();
        const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

        for (const d of qSnap.docs) {
            const data = d.data();
            if ((data.grupo_asignado || 'Clases Individuales') === nombreGrupo) {
                const hist = data.historial || [];
                hist.push({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    texto: `Propuesta de grupo "${nombreGrupo}" desarmada. Alumno vuelve a Lista de Espera.`,
                    fecha: fechaStr
                });
                await updateDoc(doc(db, "alumnos", d.id), {
                    estado_agenda: "Lista de espera",
                    grupo_asignado: "",
                    estado_validacion_alumno: null,
                    historial: hist
                });
            }
        }
        alert(`↩️ Grupo "${nombreGrupo}" desarmado. Alumnos retornaron a Lista de Espera.`);
        await cargarVista('Match - En Validacion');
    } catch(err) {
        alert('Error al desarmar grupo: ' + err.message);
    }
};

window.enviarWhatsAppValidacionGrupo = async function(alumnoId) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", alumnoId));
        if (!alDoc.exists()) return;
        const al = alDoc.data();
        const cel = (al.celular || '').replace(/\D/g, '');
        const hor = al.horario_match || al.reserva_fecha_texto || 'horario a coordinar';
        const prof = al.reserva_profe_nombre || 'nuestro equipo docente';
        const inst = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'música'));
        const susc = al.tipo_suscripcion || 'tu suscripción';
        const emojiInst = obtenerEmojiInstrumento(inst);

        const txt = `¡Hola ${al.nombre}! 🧩 Te escribo de Mandala Ensambles. Mi nombre es Nacho.
Tenemos armada una propuesta para ${susc} de ${emojiInst} ${inst} con el Profe *${prof}* los días *${hor}*.

¿Nos confirmás si te queda bien este horario para asegurar tu lugar e iniciar tu pre-alta? ¡Muchas gracias! 😊`;

        await navigator.clipboard.writeText(txt);
        alert(`📋 Mensaje copiado al portapapeles.\n\nAbriendo WhatsApp para ${al.nombre}...`);

        if (cel) {
            window.open(`https://wa.me/${cel}?text=${encodeURIComponent(txt)}`, '_blank');
        } else {
            alert('El alumno no tiene número de celular registrado.');
        }
    } catch(err) {
        alert('Error al generar WhatsApp: ' + err.message);
    }
};

// GENERADOR DE ALUMNOS DE PRUEBA EN LISTA DE ESPERA
async function generarAlumnosPruebaMatch() {
    const btn = document.getElementById('btn-mock-match-data');
    setBotonCargando(btn, true);

    try {
        const suscDocs = await getDocs(collection(db, "tipos_suscripcion"));
        const listaSusc = [];
        suscDocs.forEach(d => listaSusc.push(d.data().nombre));

        // Detectar nombres de suscripción acordes
        const suscEnsamble = listaSusc.find(s => s.toLowerCase().includes('ensamble')) || 'Ensamble';
        const suscGrupal = listaSusc.find(s => s.toLowerCase().includes('grupal')) || 'Clases Grupales';
        const suscIndividual = listaSusc.find(s => s.toLowerCase().includes('individual')) || 'Clases Individuales';

        const now = new Date();
        const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

        const mockStudents = [
            // 1. Ensamble Adultos (Inicial) -> compatibles Martes y Miércoles 18 a 21hs
            {
                nombre: "Lucas Benítez (Test)",
                celular: "+54 9 11 5555-0101",
                edad: 25,
                nivel: "Inicial I",
                instrumento: ["Guitarra"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [],
                    M: [{ inicio: "17:00", fin: "21:00" }],
                    X: [{ inicio: "18:00", fin: "21:00" }],
                    J: [], V: [], S: []
                },
                historial: [{ id: Date.now(), texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Sofía Morales (Test)",
                celular: "+54 9 11 5555-0102",
                edad: 28,
                nivel: "Inicial II",
                instrumento: ["Batería"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [],
                    M: [{ inicio: "18:00", fin: "22:00" }],
                    X: [{ inicio: "18:00", fin: "21:00" }],
                    J: [], V: [], S: []
                },
                historial: [{ id: Date.now() + 1, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Mateo Rossi (Test)",
                celular: "+54 9 11 5555-0103",
                edad: 24,
                nivel: "Inicial I",
                instrumento: ["Bajo"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [],
                    M: [{ inicio: "18:00", fin: "21:00" }],
                    X: [],
                    J: [{ inicio: "19:00", fin: "21:00" }],
                    V: [], S: []
                },
                historial: [{ id: Date.now() + 2, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Camila Fernández (Test)",
                celular: "+54 9 11 5555-0104",
                edad: 27,
                nivel: "Inicial II",
                instrumento: ["Piano"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [],
                    M: [{ inicio: "18:00", fin: "20:00" }],
                    X: [{ inicio: "18:00", fin: "21:00" }],
                    J: [], V: [], S: []
                },
                historial: [{ id: Date.now() + 3, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },

            // 2. Grupal Canto (Intermedio / Avanzado) -> compatibles Jueves 18 a 21hs y Sábado
            {
                nombre: "Valentina Gómez (Test)",
                celular: "+54 9 11 5555-0201",
                edad: 32,
                nivel: "Intermedio",
                instrumento: ["Canto"],
                tipo_suscripcion: suscGrupal,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [], M: [], X: [],
                    J: [{ inicio: "18:00", fin: "21:00" }],
                    V: [],
                    S: [{ inicio: "10:00", fin: "14:00" }]
                },
                historial: [{ id: Date.now() + 4, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Julieta Díaz (Test)",
                celular: "+54 9 11 5555-0202",
                edad: 35,
                nivel: "Avanzado",
                instrumento: ["Canto"],
                tipo_suscripcion: suscGrupal,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [], M: [], X: [],
                    J: [{ inicio: "18:00", fin: "21:00" }],
                    V: [],
                    S: [{ inicio: "10:00", fin: "14:00" }]
                },
                historial: [{ id: Date.now() + 5, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Mariano Castro (Test)",
                celular: "+54 9 11 5555-0203",
                edad: 30,
                nivel: "Intermedio",
                instrumento: ["Canto"],
                tipo_suscripcion: suscGrupal,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [], M: [], X: [],
                    J: [{ inicio: "18:00", fin: "20:00" }],
                    V: [],
                    S: [{ inicio: "11:00", fin: "14:00" }]
                },
                historial: [{ id: Date.now() + 6, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },

            // 3. Niños (< 13a) -> compatibles Viernes 16 a 19hs
            {
                nombre: "Tomás Navarro (Test Niño)",
                celular: "+54 9 11 5555-0301",
                edad: 9,
                nivel: "Inicial I",
                instrumento: ["Batería"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [], M: [], X: [], J: [],
                    V: [{ inicio: "16:00", fin: "19:00" }],
                    S: [{ inicio: "10:00", fin: "13:00" }]
                },
                historial: [{ id: Date.now() + 7, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Joaquín Paz (Test Niño)",
                celular: "+54 9 11 5555-0302",
                edad: 10,
                nivel: "Inicial I",
                instrumento: ["Guitarra"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [], M: [], X: [], J: [],
                    V: [{ inicio: "16:00", fin: "19:00" }],
                    S: [{ inicio: "10:00", fin: "13:00" }]
                },
                historial: [{ id: Date.now() + 8, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Emma Silva (Test Niña)",
                celular: "+54 9 11 5555-0303",
                edad: 8,
                nivel: "Inicial I",
                instrumento: ["Piano"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [], M: [], X: [], J: [],
                    V: [{ inicio: "16:00", fin: "19:00" }],
                    S: [{ inicio: "10:00", fin: "13:00" }]
                },
                historial: [{ id: Date.now() + 9, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },

            // 4. Clases Individuales (Adultos/Jóvenes)
            {
                nombre: "Nicolás Varela (Test Indiv)",
                celular: "+54 9 11 5555-0401",
                edad: 26,
                nivel: "Inicial I",
                instrumento: ["Guitarra"],
                tipo_suscripcion: suscIndividual,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [{ inicio: "14:00", fin: "20:00" }],
                    M: [{ inicio: "15:00", fin: "21:00" }],
                    X: [{ inicio: "14:00", fin: "20:00" }],
                    J: [{ inicio: "15:00", fin: "21:00" }],
                    V: [{ inicio: "14:00", fin: "20:00" }],
                    S: []
                },
                historial: [{ id: Date.now() + 10, texto: "Alumno de prueba individual generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Paula Méndez (Test Indiv)",
                celular: "+54 9 11 5555-0402",
                edad: 29,
                nivel: "Inicial II",
                instrumento: ["Canto"],
                tipo_suscripcion: suscIndividual,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [],
                    M: [{ inicio: "16:00", fin: "21:00" }],
                    X: [{ inicio: "16:00", fin: "21:00" }],
                    J: [{ inicio: "16:00", fin: "21:00" }],
                    V: [], S: [{ inicio: "10:00", fin: "14:00" }]
                },
                historial: [{ id: Date.now() + 11, texto: "Alumno de prueba individual generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Gonzalo Rivas (Test Indiv)",
                celular: "+54 9 11 5555-0403",
                edad: 23,
                nivel: "Inicial I",
                instrumento: ["Batería"],
                tipo_suscripcion: suscIndividual,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [{ inicio: "15:00", fin: "20:00" }],
                    M: [{ inicio: "15:00", fin: "20:00" }],
                    X: [{ inicio: "15:00", fin: "20:00" }],
                    J: [{ inicio: "15:00", fin: "20:00" }],
                    V: [], S: []
                },
                historial: [{ id: Date.now() + 12, texto: "Alumno individual de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Clara Soria (Test Indiv)",
                celular: "+54 9 11 5555-0404",
                edad: 34,
                nivel: "Intermedio",
                instrumento: ["Piano"],
                tipo_suscripcion: suscIndividual,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [{ inicio: "16:00", fin: "21:00" }],
                    M: [],
                    X: [{ inicio: "16:00", fin: "21:00" }],
                    J: [],
                    V: [{ inicio: "16:00", fin: "21:00" }],
                    S: []
                },
                historial: [{ id: Date.now() + 13, texto: "Alumno individual de prueba generado para Match.", fecha: fechaStr }]
            }
        ];

        for (let st of mockStudents) {
            await addDoc(collection(db, "alumnos"), st);
        }

        alert(`✅ Se crearon ${mockStudents.length} alumnos de prueba en Lista de Espera (Ensambles, Canto Grupal, Niños y Clases Individuales).`);
        
        const selSusc = document.getElementById('match-suscripcion');
        if (selSusc && suscEnsamble) {
            selSusc.value = suscEnsamble;
            adaptarFormularioPorSuscripcion(suscEnsamble);
        }

    } catch(e) {
        console.error("Error al generar alumnos de prueba:", e);
        alert("Error al generar alumnos de prueba: " + e.message);
    }

    setBotonCargando(btn, false);
}

// GENERADOR EXCLUSIVO DE ALUMNOS INDIVIDUALES DE PRUEBA
async function generarAlumnosIndividualesPruebaMatch() {
    const btn = document.getElementById('btn-mock-match-indiv');
    setBotonCargando(btn, true);

    try {
        const suscDocs = await getDocs(collection(db, "tipos_suscripcion"));
        const listaSusc = [];
        suscDocs.forEach(d => listaSusc.push(d.data().nombre));

        const suscIndividual = listaSusc.find(s => s.toLowerCase().includes('individual')) || 'Clases Individuales';

        const now = new Date();
        const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

        const mockIndividuales = [
            {
                nombre: "Nicolás Varela (Test Indiv)",
                celular: "+54 9 11 5555-0401",
                edad: 26,
                nivel: "Inicial I",
                instrumento: ["Guitarra"],
                tipo_suscripcion: suscIndividual,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [{ inicio: "14:00", fin: "20:00" }],
                    M: [{ inicio: "15:00", fin: "21:00" }],
                    X: [{ inicio: "14:00", fin: "20:00" }],
                    J: [{ inicio: "15:00", fin: "21:00" }],
                    V: [{ inicio: "14:00", fin: "20:00" }],
                    S: []
                },
                historial: [{ id: Date.now(), texto: "Alumno individual de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Paula Méndez (Test Indiv)",
                celular: "+54 9 11 5555-0402",
                edad: 29,
                nivel: "Inicial II",
                instrumento: ["Canto"],
                tipo_suscripcion: suscIndividual,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [],
                    M: [{ inicio: "16:00", fin: "21:00" }],
                    X: [{ inicio: "16:00", fin: "21:00" }],
                    J: [{ inicio: "16:00", fin: "21:00" }],
                    V: [], S: [{ inicio: "10:00", fin: "14:00" }]
                },
                historial: [{ id: Date.now() + 1, texto: "Alumno individual de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Gonzalo Rivas (Test Indiv)",
                celular: "+54 9 11 5555-0403",
                edad: 23,
                nivel: "Inicial I",
                instrumento: ["Batería"],
                tipo_suscripcion: suscIndividual,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [{ inicio: "15:00", fin: "20:00" }],
                    M: [{ inicio: "15:00", fin: "20:00" }],
                    X: [{ inicio: "15:00", fin: "20:00" }],
                    J: [{ inicio: "15:00", fin: "20:00" }],
                    V: [], S: []
                },
                historial: [{ id: Date.now() + 2, texto: "Alumno individual de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Clara Soria (Test Indiv)",
                celular: "+54 9 11 5555-0404",
                edad: 34,
                nivel: "Intermedio",
                instrumento: ["Piano"],
                tipo_suscripcion: suscIndividual,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [{ inicio: "16:00", fin: "21:00" }],
                    M: [],
                    X: [{ inicio: "16:00", fin: "21:00" }],
                    J: [],
                    V: [{ inicio: "16:00", fin: "21:00" }],
                    S: []
                },
                historial: [{ id: Date.now() + 3, texto: "Alumno individual de prueba generado para Match.", fecha: fechaStr }]
            }
        ];

        for (let st of mockIndividuales) {
            await addDoc(collection(db, "alumnos"), st);
        }

        alert("✅ Se cargaron 4 alumnos individuales de prueba (Guitarra, Canto, Batería, Piano) en Lista de Espera.");

        const selSusc = document.getElementById('match-suscripcion');
        if (selSusc && suscIndividual) {
            selSusc.value = suscIndividual;
            adaptarFormularioPorSuscripcion(suscIndividual);
        }

    } catch(err) {
        console.error("Error al generar alumnos individuales de prueba:", err);
        alert("Error al generar alumnos: " + err.message);
    }

    setBotonCargando(btn, false);
}

// LIMPIEZA DE ALUMNOS DE PRUEBA
async function limpiarAlumnosPruebaMatch() {
    if (!(await window.confirmar('Eliminar alumnos de prueba', 'Se eliminaran todos los registros de prueba. Esta accion no se puede deshacer.', 'Eliminar'))) return;
    const btn = document.getElementById('btn-limpiar-mock-data');
    setBotonCargando(btn, true);

    try {
        const qSnap = await getDocs(collection(db, "alumnos"));
        let eliminados = 0;
        for (let d of qSnap.docs) {
            const data = d.data();
            if (data.nombre && (data.nombre.includes('(Test') || data.nombre.includes('(test'))) {
                await deleteDoc(doc(db, "alumnos", d.id));
                eliminados++;
            }
        }
        alert(`🧹 Se eliminaron ${eliminados} registros de prueba.`);
        ocultarResultadosMatch();
        if (estadoActualVista === 'Match - Confirmados') {
            await renderMatchConfirmados(document.getElementById('lista-generica'));
        }
    } catch(e) {
        console.error("Error al eliminar pruebas:", e);
        alert("Error al eliminar pruebas: " + e.message);
    }
    setBotonCargando(btn, false);
}

// VISTA MATCH — CONFIRMADOS (Fase 7)
async function renderMatchConfirmados(cont) {
    document.getElementById('vista-titulo').textContent = 'Match — Confirmados';
    document.getElementById('controles-vista').style.display = 'flex';
    renderFiltrosChips();
    document.getElementById('search-container-general').style.display = 'block';

    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Pre-alta Pendiente")));
        const allData = [];
        qSnap.forEach(d => {
            const data = d.data();
            if (data.grupo_asignado) {
                allData.push({ id: d.id, ...data });
            }
        });

        // Agrupar por grupo por defecto para mayor claridad
        if (agrupadorActual === 'ninguno') {
            agrupadorActual = 'grupo';
            const selAgr = document.getElementById('select-agrupador');
            if (selAgr) selAgr.value = 'grupo';
        }

        renderListaFilas('lista-generica', allData, 'all', null);
    } catch(e) {
        cont.innerHTML = '<div style="color:var(--text-muted); padding:20px;">Error al cargar alumnos confirmados.</div>';
    }
}

// ================================================================

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
        await cargarConfig(); cargarVista('Dashboard'); 
        
        const btnMobileMenu = document.getElementById('btn-mobile-menu');
        const btnCerrarMenuMobile = document.getElementById('btn-cerrar-menu-mobile');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');

        if(btnMobileMenu) btnMobileMenu.addEventListener('click', () => { sidebar.classList.add('active'); overlay.style.display = 'block'; });
        if(btnCerrarMenuMobile) btnCerrarMenuMobile.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.style.display = 'none'; });
        if(overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.style.display = 'none'; });

    } else { 
        document.getElementById('login-container').style.display = 'flex'; document.getElementById('app-container').style.display = 'none'; 
    } 
});

// Buscador general con debounce (250ms) y botón para limpiar
let searchDebounceTimer = null;
const inputBuscadorGeneral = document.getElementById('input-buscador-general');
const btnLimpiarBuscador = document.getElementById('btn-limpiar-buscador');

if (inputBuscadorGeneral) {
    inputBuscadorGeneral.addEventListener('input', (e) => {
        const val = e.target.value;
        if (btnLimpiarBuscador) {
            btnLimpiarBuscador.style.display = val.trim().length > 0 ? 'block' : 'none';
        }
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            cargarVista(estadoActualVista);
        }, 250);
    });
}

if (btnLimpiarBuscador) {
    btnLimpiarBuscador.addEventListener('click', () => {
        if (inputBuscadorGeneral) {
            inputBuscadorGeneral.value = '';
            btnLimpiarBuscador.style.display = 'none';
            inputBuscadorGeneral.focus();
            cargarVista(estadoActualVista);
        }
    });
}

document.addEventListener('change', async (e) => {
    if(e.target.classList.contains('chk-alta-paso')) {
        const id = e.target.getAttribute('data-id'), idx = parseInt(e.target.getAttribute('data-idx'));
        try {
            const docRef = doc(db, "alumnos", id), alDoc = await getDoc(docRef), al = alDoc.data();
            let checks = al.checklist_alta || [false, false, false, false, false]; checks[idx] = e.target.checked;
            
            if (checks.filter(Boolean).length === 5) {
                const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
                const hist = al.historial || [];
                hist.push({
                    id: Date.now(),
                    texto: "Alta Finalizada: Todos los pasos del checklist completados. Ciclo de admisión cerrado.",
                    fecha: fechaStr
                });
                await updateDoc(docRef, { 
                    checklist_alta: checks,
                    fecha_alta_finalizada: new Date().toISOString(),
                    historial: hist
                });
                alert("🏆 ¡Felicitaciones! Checklist completo. El alumno pasó a Altas Finalizadas.");
                cargarVista(estadoActualVista);
            } else {
                await updateDoc(docRef, { checklist_alta: checks });
                cargarVista(estadoActualVista);
            }
        } catch(err) {}
    }

    if (e.target.classList.contains('chk-disp-all') || e.target.classList.contains('chk-disp-none')) {
        const diaId = e.target.getAttribute('data-dia');
        const esProfe = e.target.getAttribute('data-profe') === 'true';
        const prefix = esProfe ? 'disp-p-' : 'disp-';
        if (e.target.classList.contains('chk-disp-all') && e.target.checked) {
            const cN = document.getElementById(`${prefix}${diaId}-none`);
            if (cN) cN.checked = false;
        } else if (e.target.classList.contains('chk-disp-none') && e.target.checked) {
            const cA = document.getElementById(`${prefix}${diaId}-all`);
            if (cA) cA.checked = false;
        }
        window.updateDispStateForDay(diaId, esProfe);
    }
});

// ==================== LÓGICA DE GESTOS SWIPE (MÓVILES) ====================
let touchStartX = 0; let touchStartY = 0; let swipeEl = null;

document.addEventListener('touchstart', e => {
    const item = e.target.closest('.swipe-content');
    if(item && window.innerWidth <= 850 && !e.target.closest('.row-disp-grid')) {
        touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; swipeEl = item;
        document.querySelectorAll('.swipe-content').forEach(el => { if(el !== swipeEl) el.style.transform = 'translateX(0)'; });
    }
}, {passive: true});

document.addEventListener('touchmove', e => {
    if(!swipeEl) return;
    const deltaX = e.touches[0].clientX - touchStartX; const deltaY = e.touches[0].clientY - touchStartY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) { swipeEl.style.transform = 'translateX(0)'; swipeEl = null; return; }
    if (deltaX > 0 && deltaX < 100) swipeEl.style.transform = `translateX(${deltaX}px)`;
    if (deltaX < 0 && deltaX > -100) swipeEl.style.transform = `translateX(${deltaX}px)`;
}, {passive: true});

document.addEventListener('touchend', e => {
    if(!swipeEl) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    if (deltaX > 60) swipeEl.style.transform = `translateX(85px)`; 
    else if (deltaX < -60) swipeEl.style.transform = `translateX(-100px)`; 
    else swipeEl.style.transform = `translateX(0)`;
    swipeEl = null;
});

document.addEventListener('click', (e) => {
    if(!e.target.closest('.swipe-wrapper') && window.innerWidth <= 850) {
        document.querySelectorAll('.swipe-content').forEach(el => el.style.transform = 'translateX(0)');
    }
});

// LISTENER GLOBAL CLICKS
document.addEventListener('click', async (e) => {
    const target = e.target;
    
    // AGREGAR Y QUITAR RANGOS HORARIOS
    if (target.classList.contains('btn-agregar-rango') || target.closest('.btn-agregar-rango')) {
        e.preventDefault();
        const btn = target.classList.contains('btn-agregar-rango') ? target : target.closest('.btn-agregar-rango');
        const diaId = btn.getAttribute('data-dia');
        const esProfe = btn.getAttribute('data-profe') === 'true';
        agregarRangoDia(diaId, '', '', esProfe);
        return;
    }
    if (target.classList.contains('btn-quitar-rango') || target.closest('.btn-quitar-rango')) {
        e.preventDefault();
        const btn = target.classList.contains('btn-quitar-rango') ? target : target.closest('.btn-quitar-rango');
        quitarRangoDia(btn);
        return;
    }

    // FUNCION DE COPY/PASTE DISPONIBILIDAD (MULTI-RANGO)
    if (target.classList.contains('btn-copy-disp') || target.closest('.btn-copy-disp')) {
        e.preventDefault();
        const btn = target.classList.contains('btn-copy-disp') ? target : target.closest('.btn-copy-disp');
        const diaId = btn.getAttribute('data-dia');
        const rangosCont = document.getElementById(`rangos-disp-${diaId}`);
        const items = rangosCont ? rangosCont.querySelectorAll('.rango-item') : [];
        const rangos = [];
        items.forEach(item => {
            rangos.push({
                inicio: item.querySelector('.rango-inicio')?.value || '',
                fin: item.querySelector('.rango-fin')?.value || ''
            });
        });
        clipboardDisponibilidad = {
            all: document.getElementById(`disp-${diaId}-all`)?.checked || false,
            none: document.getElementById(`disp-${diaId}-none`)?.checked || false,
            rangos: rangos
        };
        alert("📋 Horario del día copiado");
        return;
    }
    if (target.classList.contains('btn-paste-disp') || target.closest('.btn-paste-disp')) {
        e.preventDefault();
        if (!clipboardDisponibilidad) return alert("No hay horario copiado.");
        const btn = target.classList.contains('btn-paste-disp') ? target : target.closest('.btn-paste-disp');
        const diaId = btn.getAttribute('data-dia');
        const rangosCont = document.getElementById(`rangos-disp-${diaId}`);
        if (!rangosCont) return;
        
        const cA = document.getElementById(`disp-${diaId}-all`);
        const cN = document.getElementById(`disp-${diaId}-none`);
        if (cA) cA.checked = clipboardDisponibilidad.all;
        if (cN) cN.checked = clipboardDisponibilidad.none;
        
        rangosCont.innerHTML = '';
        const rangos = clipboardDisponibilidad.rangos || [];
        if (rangos.length === 0) {
            rangosCont.innerHTML = crearFilaRangoHTML(diaId, '', '', false, 0);
        } else {
            rangos.forEach((r, idx) => {
                rangosCont.innerHTML += crearFilaRangoHTML(diaId, r.inicio || '', r.fin || '', false, idx);
            });
        }
        actualizarBotonesQuitarRango(diaId, false);
        window.updateDispStateForDay(diaId, false);
        return;
    }
    if (target.classList.contains('btn-copy-disp-p') || target.closest('.btn-copy-disp-p')) {
        e.preventDefault();
        const btn = target.classList.contains('btn-copy-disp-p') ? target : target.closest('.btn-copy-disp-p');
        const diaId = btn.getAttribute('data-dia');
        const rangosCont = document.getElementById(`rangos-disp-p-${diaId}`);
        const items = rangosCont ? rangosCont.querySelectorAll('.rango-item') : [];
        const rangos = [];
        items.forEach(item => {
            rangos.push({
                inicio: item.querySelector('.rango-inicio')?.value || '',
                fin: item.querySelector('.rango-fin')?.value || ''
            });
        });
        clipboardDisponibilidadProfe = {
            all: document.getElementById(`disp-p-${diaId}-all`)?.checked || false,
            none: document.getElementById(`disp-p-${diaId}-none`)?.checked || false,
            rangos: rangos
        };
        alert("📋 Horario del evaluador copiado");
        return;
    }
    if (target.classList.contains('btn-paste-disp-p') || target.closest('.btn-paste-disp-p')) {
        e.preventDefault();
        if (!clipboardDisponibilidadProfe) return alert("No hay horario copiado.");
        const btn = target.classList.contains('btn-paste-disp-p') ? target : target.closest('.btn-paste-disp-p');
        const diaId = btn.getAttribute('data-dia');
        const rangosCont = document.getElementById(`rangos-disp-p-${diaId}`);
        if (!rangosCont) return;
        
        const cA = document.getElementById(`disp-p-${diaId}-all`);
        const cN = document.getElementById(`disp-p-${diaId}-none`);
        if (cA) cA.checked = clipboardDisponibilidadProfe.all;
        if (cN) cN.checked = clipboardDisponibilidadProfe.none;
        
        rangosCont.innerHTML = '';
        const rangos = clipboardDisponibilidadProfe.rangos || [];
        if (rangos.length === 0) {
            rangosCont.innerHTML = crearFilaRangoHTML(diaId, '', '', true, 0);
        } else {
            rangos.forEach((r, idx) => {
                rangosCont.innerHTML += crearFilaRangoHTML(diaId, r.inicio || '', r.fin || '', true, idx);
            });
        }
        actualizarBotonesQuitarRango(diaId, true);
        window.updateDispStateForDay(diaId, true);
        return;
    }

    // Toggle dropdown de acciones dentro del modal de edición de alumno
    if (target.id === 'btn-trigger-modal-acciones' || target.closest('#btn-trigger-modal-acciones')) {
        e.stopPropagation();
        e.preventDefault();
        const drop = document.getElementById('modal-acciones-dropdown');
        if (drop) {
            drop.classList.toggle('show');
        }
        return;
    }

    // Si hace clic en un botón de acción adentro del modal de edición, cerrar el dropdown
    if (target.closest('#modal-acciones-dropdown') && target.tagName === 'BUTTON') {
        const drop = document.getElementById('modal-acciones-dropdown');
        if (drop) drop.classList.remove('show');
        if (target.classList.contains('btn-abrir-prealta') || target.classList.contains('btn-editar-prealta') || target.classList.contains('btn-abrir-confirmar-alta') || target.classList.contains('btn-buscar-agenda') || target.classList.contains('btn-abrir-suspender')) {
            const wrap = document.getElementById('form-alumno-wrapper');
            if (wrap) {
                wrap.style.display = 'none';
                document.body.appendChild(wrap);
            }
            document.getElementById('modal-alta-alumno').close();
        }
    }

    // Clic fuera del dropdown de acciones del modal
    if (!target.closest('#modal-acciones-container')) {
        const drop = document.getElementById('modal-acciones-dropdown');
        if (drop) drop.classList.remove('show');
    }

    // Clic en acción dentro de cualquier dropdown desktop de fila -> cerrarlo
    if (target.closest('.dropdown-menu-wrapper') && target.tagName === 'BUTTON') {
        const wrap = target.closest('.dropdown-menu-wrapper');
        if (wrap && wrap.id !== 'modal-acciones-dropdown') {
            wrap.classList.remove('show');
        }
    }

    // Clic fuera de los dropdowns de acciones en filas (Desktop)
    if (!target.closest('.alumno-actions')) {
        document.querySelectorAll('.dropdown-menu-wrapper.show').forEach(d => {
            if (d.id !== 'modal-acciones-dropdown') d.classList.remove('show');
        });
    }

    // Clic fuera de menús de tarjetas Kanban
    if (!target.closest('[id^="menu-kanban-"]') && !target.classList.contains('btn-row-action')) {
        document.querySelectorAll('[id^="menu-kanban-"]').forEach(m => m.style.display = 'none');
    }

    // Auto-cierre del Bottom Sheet Modal al tocar una acción adentro
    if(target.closest('#mobile-actions-container') && target.tagName === 'BUTTON' && !target.classList.contains('btn-cerrar-modal')) {
        document.getElementById('modal-mobile-actions').close();
    }
    
    if (target.tagName === 'DIALOG') { 
        const rect = target.getBoundingClientRect(), inDialog = (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
        if (!inDialog) {
            target.close(); 
            return;
        }
    }
    
    const bottomItem = target.closest('.bottom-nav-item');
    if (bottomItem) {
        if (bottomItem.id === 'btn-bottom-menu') {
            document.getElementById('sidebar').classList.add('active');
            document.getElementById('mobile-overlay').style.display = 'block';
            return;
        }
        document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
        bottomItem.classList.add('active');
        cargarVista(bottomItem.getAttribute('data-vista'));
        return;
    }

    if (target.classList.contains('btn-eliminar-alumno')) { 
        e.stopPropagation(); 
        const ok = await window.confirmar('¿Eliminar este alumno?', 'Esta acción es permanente y no se puede deshacer.', '🗑️ Eliminar', '⚠️');
        if (ok) { 
            const id = target.closest('.btn-editar-alumno').getAttribute('data-id'); 
            try { const al = (await getDoc(doc(db, "alumnos", id))).data(); if (al && al.id_evento_reserva) { await eliminarEventoSeguro(al); } } catch(err) {} 
            await deleteDoc(doc(db, "alumnos", id)); 
            cargarVista(estadoActualVista); 
        } 
        return; 
    }
    
    // Captura clic en los 3 puntos (Móvil abre Bottom Sheet / Desktop hace toggle de menú fijo)
    if (target.classList.contains('btn-row-action') || target.closest('.btn-row-action')) {
        e.stopPropagation();
        const btn = target.classList.contains('btn-row-action') ? target : target.closest('.btn-row-action');
        const wrapper = btn.nextElementSibling || btn.closest('.alumno-actions')?.querySelector('.dropdown-menu-wrapper');
        
        if (window.innerWidth <= 850) {
            if (wrapper && wrapper.classList.contains('dropdown-menu-wrapper')) {
                document.getElementById('mobile-actions-container').innerHTML = wrapper.querySelector('.dropdown-menu').innerHTML;
                document.getElementById('modal-mobile-actions').showModal();
            }
        } else {
            if (wrapper) {
                const isShown = wrapper.classList.contains('show');
                document.querySelectorAll('.dropdown-menu-wrapper.show').forEach(d => {
                    if (d !== wrapper && d.id !== 'modal-acciones-dropdown') d.classList.remove('show');
                });
                if (!isShown) {
                    wrapper.classList.add('show');
                } else {
                    wrapper.classList.remove('show');
                }
            }
        }
        return;
    }
    
    // Gesto de Swipe -> Acciones
    if (target.classList.contains('btn-row-actions-swipe')) {
        e.stopPropagation();
        const swipeContent = target.closest('.swipe-wrapper').querySelector('.swipe-content');
        swipeContent.style.transform = 'translateX(0)';
        const menuHTML = target.closest('.swipe-wrapper').querySelector('.dropdown-menu').innerHTML;
        document.getElementById('mobile-actions-container').innerHTML = menuHTML;
        document.getElementById('modal-mobile-actions').showModal();
        return;
    }

    if (target.classList.contains('btn-nota-rapida')) { 
        e.stopPropagation(); 
        const id = target.getAttribute('data-id');
        const swipeContent = target.closest('.swipe-wrapper');
        if(swipeContent) swipeContent.querySelector('.swipe-content').style.transform = 'translateX(0)';
        document.getElementById('nota-rapida-id').value = id; 
        document.getElementById('nota-rapida-texto').value = ''; 
        document.getElementById('modal-nota-rapida').showModal(); 
        return; 
    }
    if (target.id === 'btn-guardar-nota-rapida') { const id = document.getElementById('nota-rapida-id').value, texto = document.getElementById('nota-rapida-texto').value; if (!texto.trim()) return alert("La nota no puede estar vacía."); setBotonCargando(target, true); try { const alDoc = await getDoc(doc(db, "alumnos", id)); if (alDoc.exists()) { const alData = alDoc.data(), hist = alData.historial || []; const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`; hist.push({ id: Date.now(), texto: texto.trim(), fecha: fechaStr }); await updateDoc(doc(db, "alumnos", id), { historial: hist }); document.getElementById('modal-nota-rapida').close(); cargarVista(estadoActualVista); } } catch(e) {} setBotonCargando(target, false); return; }

    // EDICIÓN DE ALUMNO: Se asegura que el clic no haya sido en una acción o checkbox
    const rowInfo = target.closest('.btn-editar-alumno');
    if (rowInfo && !target.closest('.alumno-actions') && !target.closest('.bulk-chk') && !target.closest('.row-actions-group') && !target.closest('.row-quick-btn') && !target.classList.contains('btn-row-action')) { 
        const id = rowInfo.getAttribute('data-id'); 
        const wrap = document.getElementById('form-alumno-wrapper'); 
        document.getElementById('modal-alta-alumno').appendChild(wrap); 
        wrap.style.display = 'block'; 
        document.getElementById('alumno-id').value = id; 
        await llenarFormularioAlumno(id); 
        document.getElementById('form-titulo').textContent = 'Editar Alumno'; 
        document.getElementById('container-ingreso-directo').style.display = 'none'; 
        document.getElementById('modal-alta-alumno').showModal(); 
        return; 
    }

    if (target.classList.contains('btn-nombre-agendar')) { const id = target.getAttribute('data-id'); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); const iS = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento; let template = configApp.texto_nombre_agendar || 'MDL {nombre} {edad} {año_actual} @{instrumento} @{suscripcion}'; const txt = reemplazarVariables(template, { nombre: al.nombre, edad: al.edad || '', 'año_actual': new Date().getFullYear().toString(), instrumento: iS, suscripcion: al.tipo_suscripcion || '' }).replace(/\s+/g, ' ').trim(); await navigator.clipboard.writeText(txt); alert("Nombre copiado:\n" + txt); } catch(e) {} return; }
    
    if (target.classList.contains('btn-admision-finalizada')) { 
        const id = target.getAttribute('data-id'); 
        document.getElementById('informe-final-alumno-id').value = id;
        try {
            const al = (await getDoc(doc(db, "alumnos", id))).data();
            quillPopup.root.innerHTML = al.informe_admision || '';
            document.getElementById('modal-informe-admision').showModal();
        } catch(e) {}
        return; 
    }
    
    if (target.id === 'btn-guardar-informe-final') {
        const btn = target;
        setBotonCargando(btn, true);
        const id = document.getElementById('informe-final-alumno-id').value;
        const informeTexto = quillPopup.root.innerHTML;
        try {
            await updateDoc(doc(db, "alumnos", id), { 
                estado_agenda: "Lista de espera",
                informe_admision: informeTexto
            });
            document.getElementById('modal-informe-admision').close();
            alert("Admisión Finalizada. Alumno en Lista de Espera.");
            cargarVista(estadoActualVista);
        } catch(err) {
            alert("Error al guardar: " + err.message);
        }
        setBotonCargando(btn, false);
        return;
    }

    async function renderListaInstrumentosAlumnos(alumnosArr) {
        const wrapLista = document.getElementById('prealta-lista-alumnos-instrumentos');
        const contAlumnos = document.getElementById('prealta-alumnos-container');
        if (!wrapLista || !contAlumnos) return;
        
        wrapLista.style.display = 'block';
        contAlumnos.innerHTML = '';

        let todosInstrumentos = [];
        try {
            const iSnap = await getDocs(collection(db, "instrumentos"));
            iSnap.forEach(d => todosInstrumentos.push(d.data().nombre));
        } catch(e) {}

        alumnosArr.forEach(al => {
            const instsAlumno = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);
            const opcionesInst = instsAlumno.length > 0 ? instsAlumno : todosInstrumentos;
            const instActual = al.instrumento_asignado || instsAlumno[0] || (opcionesInst[0] || '');

            const optHtml = opcionesInst.map(i => {
                const emoji = getEmojiInstrumento(i, configApp);
                return `<option value="${i}" ${i === instActual ? 'selected' : ''}>${emoji} ${i}</option>`;
            }).join('');

            contAlumnos.innerHTML += `
                <div class="prealta-alumno-row" style="display:flex; align-items:center; justify-content:space-between; background:var(--hover-bg); border:1px solid var(--border-color); border-radius:8px; padding:10px 12px; gap:10px;">
                    <div style="font-size:13px; font-weight:600; color:var(--text-main); flex:1;">
                        👤 ${al.nombre}
                        <div style="font-size:11px; color:var(--text-muted);">${al.tipo_suscripcion || 'Ensamble'} ${al.edad ? '· ' + al.edad + 'a' : ''}</div>
                    </div>
                    <div>
                        <select class="modern-input prealta-alumno-inst-select" data-id="${al.id}" style="width:170px; padding:6px 8px; font-size:12.5px;">
                            ${optHtml}
                        </select>
                    </div>
                </div>
            `;
        });
    }

    // Botón Iniciar / Editar Pre-Alta (Individual o Directo desde Lista de Espera / En Curso)
    if (target.classList.contains('btn-abrir-prealta') || target.classList.contains('btn-editar-prealta')) {
        const id = target.getAttribute('data-id');
        const alDoc = await getDoc(doc(db, "alumnos", id));
        const al = alDoc.exists() ? alDoc.data() : {};
        document.getElementById('prealta-alumno-id').value = id;
        
        const tipoSusc = detectarTipoSuscripcion(al.tipo_suscripcion || '');
        const esIndividual = tipoSusc === 'individual';
        const esEdicion = target.classList.contains('btn-editar-prealta') || al.estado_agenda === 'Pre-alta Iniciada';
        const vieneDeMatch = Boolean(al.horario_match || al.reserva_fecha_texto || al.reserva_profe_id);

        document.getElementById('titulo-prealta').textContent = `${esEdicion ? 'Editar' : 'Iniciar'} Pre-Alta — ${al.nombre || 'Alumno'}`;
        
        const campoGrupo = document.getElementById('prealta-campo-grupo');
        const campoProfe = document.getElementById('prealta-campo-profe');
        const selectProfe = document.getElementById('prealta-profe-select');
        const campoInst = document.getElementById('prealta-campo-instrumento');
        const selInstPrealta = document.getElementById('prealta-instrumento-select');
        const wrapLista = document.getElementById('prealta-lista-alumnos-instrumentos');
        const alertaValidacion = document.getElementById('prealta-alerta-validacion');
        if (alertaValidacion) alertaValidacion.style.display = 'none';

        const instsAlumno = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);
        const instActual = al.instrumento_asignado || instsAlumno[0] || '';

        async function refrescarProfesoresPrealta(instrumentoSeleccionado, profeSeleccionadoId = '') {
            if (!selectProfe) return;
            selectProfe.innerHTML = '<option value="">Seleccionar profesor...</option>';
            try {
                const pSnap = await getDocs(collection(db, "profesores"));
                pSnap.forEach(pDoc => {
                    const pr = { id: pDoc.id, ...pDoc.data() };
                    const profeSkills = pr.skills || [];
                    const enseñaInst = !instrumentoSeleccionado || profeSkills.length === 0 || profeSkills.some(s => s.toLowerCase() === instrumentoSeleccionado.toLowerCase());
                    if (enseñaInst) {
                        const opt = document.createElement('option');
                        opt.value = pr.id;
                        opt.textContent = `${pr.nombre} (${(pr.skills || []).join(', ') || 'General'})`;
                        opt.dataset.nombre = pr.nombre;
                        opt.dataset.calId = pr.correo_calendario || '';
                        opt.dataset.disponibilidad = JSON.stringify(pr.disponibilidad || {});
                        if (pr.id === profeSeleccionadoId) opt.selected = true;
                        selectProfe.appendChild(opt);
                    }
                });
            } catch(e) {}
        }

        if (esIndividual) {
            // Es individual: mostrar campo instrumento simple, ocultar lista grupal
            if (campoInst) campoInst.style.display = 'block';
            if (wrapLista) wrapLista.style.display = 'none';
            if (campoGrupo) campoGrupo.style.display = 'none';
            if (campoProfe) campoProfe.style.display = 'block';

            if (selInstPrealta) {
                selInstPrealta.innerHTML = '';
                if (instsAlumno.length > 0) {
                    instsAlumno.forEach(i => {
                        selInstPrealta.innerHTML += `<option value="${i}" ${i === instActual ? 'selected' : ''}>${i}</option>`;
                    });
                } else {
                    selInstPrealta.innerHTML = '<option value="">Sin instrumento especificado</option>';
                }
                selInstPrealta.onchange = () => refrescarProfesoresPrealta(selInstPrealta.value, selectProfe.value);
            }

            await refrescarProfesoresPrealta(instActual, al.reserva_profe_id || '');
            document.getElementById('prealta-grupo').value = 'Clase Individual';
        } else {
            // Es grupal/ensamble: ocultar selector simple y mostrar lista de integrantes
            if (campoInst) campoInst.style.display = 'none';
            if (campoGrupo) campoGrupo.style.display = 'block';
            if (campoProfe) campoProfe.style.display = 'none';
            document.getElementById('prealta-grupo').value = al.grupo_asignado || '';
            await renderListaInstrumentosAlumnos([{ id, ...al }]);
        }
        
        let fVal = '';
        if (al.fecha_inicio_clases) fVal = al.fecha_inicio_clases.substring(0, 16);
        else if (al.fecha_sugerida_inicio) fVal = al.fecha_sugerida_inicio;
        else if (al.dia_match && al.horario_inicio_match) fVal = calcularProximaFechaDiaHora(al.dia_match, al.horario_inicio_match);
        document.getElementById('prealta-fecha-inicio').value = fVal;

        const banner = document.getElementById('prealta-info-banner');
        banner.style.display = 'block';
        if (esEdicion) {
            banner.innerHTML = `✏️ <strong>Modificar Pre-Alta de ${al.nombre}:</strong> Podés ajustar el día, la hora de la clase y el ${esIndividual ? 'profesor asignado' : 'grupo'}.`;
        } else if (vieneDeMatch) {
            banner.innerHTML = `📅 <strong>Horario Match:</strong> ${al.horario_match || al.reserva_fecha_texto || '-'} · 👨‍🏫 <strong>Profesor:</strong> ${al.reserva_profe_nombre || '-'}`;
        } else {
            banner.innerHTML = `ℹ️ <strong>Pre-Alta Directa desde Lista de Espera:</strong> Alumno ${esIndividual ? 'Individual' : 'Grupal'} (${(al.instrumento || []).join(', ')}).`;
        }
        document.getElementById('modal-iniciar-prealta').showModal();
        return;
    }

    // Botón Iniciar Pre-Alta Grupal / Masivo
    if (target.classList.contains('btn-iniciar-prealta-grupo') || target.id === 'btn-bulk-prealta') {
        const idsRaw = target.getAttribute('data-ids');
        const ids = idsRaw ? idsRaw.split(',').filter(Boolean) : [...selectedBulkIds];
        if (!ids || ids.length === 0) return alert("No hay alumnos seleccionados.");
        const grupoNom = target.getAttribute('data-grupo') || '';

        const alumnosList = [];
        for (let id of ids) {
            const dSnap = await getDoc(doc(db, "alumnos", id));
            if (dSnap.exists()) alumnosList.push({ id: dSnap.id, ...dSnap.data() });
        }
        if (alumnosList.length === 0) return alert("No se encontraron datos de los alumnos.");

        const primerAl = alumnosList[0];

        document.getElementById('prealta-alumno-id').value = ids.join(',');
        document.getElementById('titulo-prealta').textContent = `Iniciar Pre-Alta Grupal (${ids.length} alumnos)`;
        
        const campoGrupo = document.getElementById('prealta-campo-grupo');
        const campoProfe = document.getElementById('prealta-campo-profe');
        const campoInst = document.getElementById('prealta-campo-instrumento');
        if (campoInst) campoInst.style.display = 'none';
        if (campoGrupo) campoGrupo.style.display = 'block';
        if (campoProfe) campoProfe.style.display = 'none';

        document.getElementById('prealta-grupo').value = grupoNom || primerAl.grupo_asignado || '';

        // Renderizar lista interactiva de alumnos con selector de instrumento para cada uno
        await renderListaInstrumentosAlumnos(alumnosList);

        let fVal = '';
        if (primerAl.fecha_inicio_clases) fVal = primerAl.fecha_inicio_clases.substring(0, 16);
        else if (primerAl.fecha_sugerida_inicio) fVal = primerAl.fecha_sugerida_inicio;
        else if (primerAl.dia_match && primerAl.horario_inicio_match) fVal = calcularProximaFechaDiaHora(primerAl.dia_match, primerAl.horario_inicio_match);
        document.getElementById('prealta-fecha-inicio').value = fVal;

        const banner = document.getElementById('prealta-info-banner');
        if (primerAl.horario_match || primerAl.reserva_fecha_texto || primerAl.reserva_profe_nombre) {
            banner.style.display = 'block';
            banner.innerHTML = `👥 <strong>Grupo:</strong> ${grupoNom || primerAl.grupo_asignado || '-'} · 📅 <strong>Horario:</strong> ${primerAl.horario_match || primerAl.reserva_fecha_texto || '-'} · 👨‍🏫 <strong>Profesor:</strong> ${primerAl.reserva_profe_nombre || '-'}`;
        } else {
            banner.style.display = 'none';
        }
        document.getElementById('modal-iniciar-prealta').showModal();
        return;
    }

    // Botón Seleccionar Todo el Grupo
    if (target.classList.contains('btn-seleccionar-todo-grupo')) {
        const ids = (target.getAttribute('data-ids') || '').split(',').filter(Boolean);
        ids.forEach(id => {
            if (!selectedBulkIds.includes(id)) selectedBulkIds.push(id);
            const chk = document.querySelector(`.bulk-chk[data-id="${id}"]`);
            if (chk) chk.checked = true;
        });
        actualizarBulkBar();
        return;
    }

    // Guardar Pre-Alta (Procesa 1 o N alumnos con validación de horarios)
    if (target.id === 'btn-guardar-prealta') {
        const idsRaw = document.getElementById('prealta-alumno-id').value;
        const ids = idsRaw.split(',').filter(Boolean);
        const fIni = document.getElementById('prealta-fecha-inicio').value;
        const grp = document.getElementById('prealta-grupo').value.trim();
        const selProfe = document.getElementById('prealta-profe-select');
        const profeId = selProfe ? selProfe.value : '';
        const profeNombre = selProfe && selProfe.selectedOptions[0] ? selProfe.selectedOptions[0].dataset.nombre : '';

        if (!fIni) return alert("Por favor ingresá la fecha y hora de la primera clase.");

        const primerDoc = await getDoc(doc(db, "alumnos", ids[0]));
        const primerAl = primerDoc.exists() ? primerDoc.data() : {};
        const tipoSusc = detectarTipoSuscripcion(primerAl.tipo_suscripcion || '');
        const esIndividual = tipoSusc === 'individual';

        if (esIndividual && !profeId && !primerAl.reserva_profe_id) {
            return alert("Por favor seleccioná un profesor para la clase individual.");
        }
        if (!esIndividual && !grp) {
            return alert("Por favor ingresá el nombre del grupo.");
        }

        setBotonCargando(target, true);

        // VALIDACIÓN DE HORARIOS / CALENDARIO EN CASO INDIVIDUAL DIRECTO
        const dateObj = new Date(fIni);
        if (isNaN(dateObj.getTime())) {
            setBotonCargando(target, false);
            return alert("Fecha y hora inválidas.");
        }

        const diasCodigos = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
        const diaCodigo = diasCodigos[dateObj.getDay()];
        const horaInicioStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
        const durMin = 60;
        const horaFinMin = dateObj.getHours() * 60 + dateObj.getMinutes() + durMin;
        const horaFinStr = minutosAHora(horaFinMin);

        // Validar disponibilidad del alumno
        if (primerAl.disponibilidad && primerAl.disponibilidad[diaCodigo]) {
            const rangosAl = primerAl.disponibilidad[diaCodigo];
            const cubreAl = rangosAl.some(r => {
                const rIni = convertirHoraAMinutos(r.inicio || '09:00');
                const rFin = convertirHoraAMinutos(r.fin || '22:00');
                const slIni = dateObj.getHours() * 60 + dateObj.getMinutes();
                return slIni >= rIni && (slIni + durMin) <= rFin;
            });
            if (rangosAl.length > 0 && !cubreAl) {
                const confirmarForzar = await window.confirmar('Disponibilidad no coincide', 'El alumno no tiene disponibilidad para el horario seleccionado. Â¿Iniciar la Pre-Alta de todas formas?', 'Forzar Pre-Alta');
                if (!confirmarForzar) {
                    setBotonCargando(target, false);
                    return;
                }
            }
        }

        const fIso = dateObj.toISOString();
        const dateObjEnd = new Date(dateObj.getTime() + durMin * 60000);
        const fIsoEnd = dateObjEnd.toISOString();

        // Si es grupal, buscar otros alumnos del grupo para descripción y verificación de evento existente
        let alumnosDelGrupo = [];
        if (!esIndividual && grp) {
            try {
                const grpSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", grp)));
                grpSnap.forEach(d => {
                    const dData = d.data();
                    alumnosDelGrupo.push({ id: d.id, ...dData });
                });
            } catch(e) {}
        }

        let evSincronizado = null;
        let textosCopiados = [];

        for (let id of ids) {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            const al = alDoc.exists() ? alDoc.data() : {};
            const finalGrupo = esIndividual ? 'Clase Individual' : (grp || al.grupo_asignado || 'Grupo Sin Nombre');
            const rowSelect = document.querySelector(`.prealta-alumno-inst-select[data-id="${id}"]`);
            const instSeleccionado = rowSelect ? rowSelect.value : (document.getElementById('prealta-instrumento-select')?.value || '');
            const instFinal = instSeleccionado || al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || ''));

            const finalProfeId = profeId || al.reserva_profe_id || '';
            const finalProfeNombre = profeNombre || al.reserva_profe_nombre || '';
            const alParaSync = {
                ...al,
                reserva_profe_id: finalProfeId,
                reserva_profe_nombre: finalProfeNombre,
                grupo_asignado: finalGrupo,
                instrumento_asignado: instFinal,
                instrumento: al.instrumento || []
            };

            // Para grupal aseguramos incluir al alumno actual en la lista para la descripción
            if (!esIndividual) {
                if (!alumnosDelGrupo.some(a => a.id === id)) {
                    alumnosDelGrupo.push({ id, ...alParaSync });
                }
            }

            // Sincronizar / crear / actualizar evento en Google Calendar
            if (!evSincronizado || esIndividual) {
                evSincronizado = await sincronizarEventoPrealtaCalendar(alParaSync, esIndividual, fIso, fIsoEnd, alumnosDelGrupo);
            }

            const updates = {
                estado_agenda: "Pre-alta Iniciada",
                fecha_inicio_clases: fIso,
                grupo_asignado: finalGrupo,
                instrumento_asignado: instFinal,
                reserva_profe_id: finalProfeId,
                reserva_profe_nombre: finalProfeNombre,
                dia_match: diaCodigo,
                horario_inicio_match: horaInicioStr,
                horario_fin_match: horaFinStr,
                horario_match: `${mapaDiasCodigos[diaCodigo] || diaCodigo} ${horaInicioStr} a ${horaFinStr} hs`
            };

            if (evSincronizado) {
                updates.id_evento_alta = evSincronizado.id;
                updates.calendario_evento_alta = evSincronizado.calendar;
            }

            if (!al.fecha_prealta) updates.fecha_prealta = new Date().toISOString();
            if (!al.checklist_alta) updates.checklist_alta = [false, false, false, false, false];
            await updateDoc(doc(db, "alumnos", id), updates);

            const dataText = await generarTextoConHistorial(id, 'texto_prealta', updates.horario_match, finalProfeId, finalProfeNombre);
            textosCopiados.push(`--- ${al.nombre} ---\n${dataText.txt}`);
        }

        await navigator.clipboard.writeText(textosCopiados.join('\n\n'));
        document.getElementById('modal-iniciar-prealta').close();
        alert(`✅ Pre-Alta iniciada para ${ids.length} alumno(s).\nEvento agendado en Google Calendar con formato 🚀 y texto copiado.`);
        selectedBulkIds = [];
        actualizarBulkBar();
        setBotonCargando(target, false);
        cargarVista(estadoActualVista);
        return;
    }
    if (target.classList.contains('btn-abrir-confirmar-alta')) { document.getElementById('conf-alta-alumno-id').value = target.getAttribute('data-id'); document.getElementById('modal-confirmar-alta').showModal(); return; }
    if (target.id === 'btn-guardar-confirmacion-alta') {
        const id = document.getElementById('conf-alta-alumno-id').value, est = document.querySelector('input[name="opt-tipo-alta"]:checked').value;
        setBotonCargando(target, true);
        const alDoc = await getDoc(doc(db, "alumnos", id));
        const al = alDoc.exists() ? alDoc.data() : {};
        const tipoSusc = detectarTipoSuscripcion(al.tipo_suscripcion || '');
        const esIndividual = tipoSusc === 'individual';

        // Actualizar título en Calendar a Alta Confirmada (remueve el cohete 🚀)
        let alumnosDelGrupo = [];
        if (!esIndividual && al.grupo_asignado) {
            try {
                const grpSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", al.grupo_asignado)));
                grpSnap.forEach(d => alumnosDelGrupo.push({ id: d.id, ...d.data() }));
            } catch(e) {}
        }
        await sincronizarEventoAltaConfirmadaCalendar(al, esIndividual, alumnosDelGrupo);

        await updateDoc(doc(db, "alumnos", id), { estado_agenda: est });
        const dataText = await generarTextoConHistorial(id, 'texto_alta_confirmada');
        await navigator.clipboard.writeText(dataText.txt);
        document.getElementById('modal-confirmar-alta').close();
        alert("Alta Confirmada.\nTexto copiado y evento en Calendar actualizado a Alta Confirmada.");
        setBotonCargando(target, false);
        cargarVista(estadoActualVista);
        return;
    }
    // Acción directa: Finalizar Alta
    if (target.classList.contains('btn-finalizar-alta-directa')) {
        const id = target.getAttribute('data-id');
        const ok = await window.confirmar('¿Finalizar Alta?', 'Se marcará el checklist completo y el ciclo de admisión quedará cerrado.', '🏁 Finalizar Alta', '✅');
        if (ok) {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            const al = alDoc.exists() ? alDoc.data() : {};
            const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
            const hist = al.historial || [];
            hist.push({
                id: Date.now(),
                texto: "Alta Finalizada: Todos los pasos del checklist confirmados. Ciclo de admisión cerrado con éxito.",
                fecha: fechaStr
            });
            await updateDoc(doc(db, "alumnos", id), {
                checklist_alta: [true, true, true, true, true],
                fecha_alta_finalizada: new Date().toISOString(),
                historial: hist
            });
            alert("🏁 Alta Finalizada con éxito. El registro pasó a Altas Finalizadas.");
            cargarVista(estadoActualVista);
        }
        return;
    }
    if (target.classList.contains('btn-devolver-espera')) {
        const motivo = prompt("¿Motivo para devolver a Lista de Espera?");
        if (motivo !== null) {
            if (motivo.trim() === "") return alert("Debes ingresar un motivo.");
            const id = target.getAttribute('data-id');
            const alDoc = await getDoc(doc(db, "alumnos", id));
            const al = alDoc.exists() ? alDoc.data() : {};
            const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
            const hist = al.historial || [];
            hist.push({
                id: Date.now(),
                texto: `Devuelto a Lista de Espera desde ${al.estado_agenda || 'Altas'}. Motivo: ${motivo.trim()}`,
                fecha: fechaStr
            });
            await eliminarEventoAltaSeguro(al);
            await updateDoc(doc(db, "alumnos", id), {
                estado_agenda: "Lista de espera",
                grupo_asignado: null,
                reserva_profe_id: null,
                reserva_profe_nombre: null,
                reserva_fecha_texto: null,
                horario_match: null,
                dia_match: null,
                horario_inicio_match: null,
                horario_fin_match: null,
                fecha_sugerida_inicio: null,
                fecha_inicio_clases: null,
                id_evento_alta: null,
                calendario_evento_alta: null,
                checklist_alta: null,
                historial: hist
            });
            alert("✅ Alumno devuelto a Lista de Espera con motivo registrado en el historial.");
            cargarVista(estadoActualVista);
        }
        return;
    }
    if (target.classList.contains('btn-suspender-alta')) { 
        const motivo = prompt("¿Motivo de Suspensión de Alta?"); 
        if (motivo !== null) { 
            if (motivo.trim() === "") return alert("Debes ingresar un motivo."); 
            const id = target.getAttribute('data-id'); 
            const alDoc = await getDoc(doc(db, "alumnos", id));
            const al = alDoc.exists() ? alDoc.data() : {};
            const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`, hist = al.historial || []; 
            hist.push({ id: Date.now(), texto: `Alta suspendida. Motivo: ${motivo.trim()}`, fecha: fechaStr }); 
            await eliminarEventoAltaSeguro(al);
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Alta Suspendida", historial: hist }); 
            cargarVista(estadoActualVista); 
        } 
        return; 
    }

    if (target.classList.contains('btn-buscar-agenda')) { 
        alumnoIdActual = target.getAttribute('data-id'); 
        const modal = document.getElementById('modal-agenda'), resDiv = document.getElementById('resultados-agenda'); 
        resDiv.innerHTML = ''; 
        const hoy = new Date(), d7 = new Date(); 
        d7.setDate(d7.getDate()+7); 
        document.getElementById('agenda-start').value = hoy.toISOString().split('T')[0]; 
        document.getElementById('agenda-end').value = d7.toISOString().split('T')[0]; 
        document.getElementById('btn-procesar-seleccion-agenda').style.display = 'none'; 
        try { 
            const alDoc = await getDoc(doc(db, "alumnos", alumnoIdActual));
            const al = alDoc.exists() ? alDoc.data() : {};
            const insts = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);
            const wrapInst = document.getElementById('agenda-instrumento-wrapper');
            const selInst = document.getElementById('agenda-instrumento-select');
            
            const instActual = al.instrumento_asignado || insts[0] || '';

            if (wrapInst && selInst) {
                if (insts.length > 0) {
                    wrapInst.style.display = 'block';
                    selInst.innerHTML = insts.map(i => `<option value="${i}" ${i === instActual ? 'selected' : ''}>${i}</option>`).join('');
                } else {
                    wrapInst.style.display = 'none';
                }
            }

            async function refrescarProfesoresEntrevista(instrumentoSeleccionado) {
                const selectProfe = document.getElementById('agenda-profe-filtro');
                if (!selectProfe) return;
                selectProfe.innerHTML = '<option value="">Todos los profesores</option>';
                try {
                    const pSnap = await getDocs(collection(db, "profesores"));
                    pSnap.forEach(p => {
                        const d = p.data();
                        if (d.entrevista) {
                            const skills = d.skills || [];
                            const ensena = !instrumentoSeleccionado || skills.length === 0 || skills.some(s => s.toLowerCase() === instrumentoSeleccionado.toLowerCase());
                            if (ensena) {
                                selectProfe.innerHTML += `<option value="${p.id}">${d.nombre}</option>`;
                            }
                        }
                    });
                    syncSelectToChips('agenda-profe-filtro', 'chips-profesores');
                } catch(e) {}
            }

            if (selInst) {
                selInst.onchange = () => refrescarProfesoresEntrevista(selInst.value);
            }

            await refrescarProfesoresEntrevista(instActual);
            resDiv.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">Selecciona el rango y haz clic en Buscar Agenda.</p>'; 
            modal.showModal(); 
        } catch(err) {} 
        return; 
    }
    if (target.id === 'btn-ejecutar-busqueda') { 
        const resDiv = document.getElementById('resultados-agenda'), dStrStart = document.getElementById('agenda-start').value, dStrEnd = document.getElementById('agenda-end').value; 
        if(!dStrStart || !dStrEnd) return alert("Fechas inválidas."); 
        const selProfe = document.getElementById('agenda-profe-filtro'), fProfs = Array.from(selProfe.selectedOptions).map(o => o.value), searchAll = fProfs.length === 0 || fProfs.includes(""); 
        resDiv.innerHTML = '<p>Buscando...</p>'; 
        document.getElementById('btn-procesar-seleccion-agenda').style.display = 'none'; 
        setBotonCargando(target, true); 
        try { 
            const al = (await getDoc(doc(db, "alumnos", alumnoIdActual))).data();
            const instElegido = document.getElementById('agenda-instrumento-select')?.value || '';
            const arrI = instElegido ? [instElegido] : (Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento]);
            const esBat = arrI.some(i => (i || '').toLowerCase().includes('bater'));
            const dMap = { 'D':0, 'L':1, 'M':2, 'X':3, 'J':4, 'V':5, 'S':6 }; 
            const dS = new Date(dStrStart+'T00:00:00'), dE = new Date(dStrEnd+'T23:59:59'); 
            const pS = await getDocs(collection(db, "profesores")), todosLosProfes = [], profesFiltradosIDs = []; 
            pS.forEach(p => { 
                const d = p.data(); 
                if(d.correo_calendario) { 
                    todosLosProfes.push({ id: p.id, nombre: d.nombre, calId: d.correo_calendario, disponibilidad: d.disponibilidad }); 
                    if (d.entrevista && (searchAll || fProfs.includes(p.id))) { 
                        profesFiltradosIDs.push(p.id); 
                    } 
                } 
            }); 
            if(profesFiltradosIDs.length === 0) { 
                setBotonCargando(target, false); 
                return resDiv.innerHTML = '<p>No hay profes seleccionados con este instrumento.</p>'; 
            } 
            let allEv = []; 
            for(const pr of todosLosProfes) { 
                try { 
                    const data = await getEventosCalendario(pr.calId, dS.toISOString(), dE.toISOString()); 
                    if(data.items) allEv = allEv.concat(data.items.map(ev => ({...ev, profeId: pr.id}))); 
                } catch(e) {} 
            } 
            const opts = generarOpcionesAgenda(al.disponibilidad, allEv, esBat, todosLosProfes, profesFiltradosIDs, dS, dE, configApp); 
            if(opts.length===0) { 
                resDiv.innerHTML='<p>No hay huecos libres en el rango seleccionado.</p>'; 
            } else { 
                document.getElementById('btn-procesar-seleccion-agenda').style.display = 'block'; 
                // Ordenar los recomendados (pegados a clase) primero
                opts.sort((a, b) => (b.pegado ? 1 : 0) - (a.pegado ? 1 : 0));
                let html = ''; 
                opts.forEach((op, index) => { 
                    const icon = op.pegado ? '⭐' : '🕒';
                    const tagRecom = op.pegado ? ' <span style="background:var(--accent-teal); color:#fff; font-size:10px; padding:2px 7px; border-radius:10px; font-weight:700; margin-left:6px;">Recomendado</span>' : '';
                    html += `
                        <label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer; padding:8px 10px; border-radius:8px; border:1px solid ${op.pegado ? 'var(--accent-teal)' : 'var(--border-color)'}; background:${op.pegado ? 'rgba(0, 123, 143, 0.08)' : 'var(--bg-main)'};">
                            <input type="checkbox" class="chk-agenda-opt" data-calid="${op.calId}" data-profe="${op.profeNombre}" data-profeid="${op.profeId}" data-start="${op.inicioData}" data-end="${op.finData}" data-fechatxt="${op.fechaTextoAmi}"> 
                            <span style="font-size:13px; color:var(--text-main); font-weight:${op.pegado ? '600' : 'normal'};">${icon} <strong>${op.fechaTextoAmi}</strong> (${op.profeNombre})${tagRecom}</span>
                        </label>
                    `; 
                }); 
                resDiv.innerHTML = html; 
            } 
        } catch(e) { 
            resDiv.innerHTML='<p>Error en la búsqueda.</p>'; 
        } 
        setBotonCargando(target, false); 
        return; 
    }
    if (target.id === 'btn-procesar-seleccion-agenda') { 
        const checks = document.querySelectorAll('.chk-agenda-opt:checked'); 
        if (checks.length === 0) return alert("Selecciona al menos un horario."); 
        const opciones = Array.from(checks).map((chk, index) => { 
            const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; 
            return { letra: letras[index], profeId: chk.getAttribute('data-profeid'), profeNombre: chk.getAttribute('data-profe'), calId: chk.getAttribute('data-calid'), inicio: chk.getAttribute('data-start'), fin: chk.getAttribute('data-end'), fechaTexto: chk.getAttribute('data-fechatxt') }; 
        }); 
        const pId = opciones[0].profeId, pNom = opciones[0].profeNombre, cId = opciones[0].calId; 
        const al = (await getDoc(doc(db, "alumnos", alumnoIdActual))).data(); 
        const instElegido = document.getElementById('agenda-instrumento-select')?.value || (Array.isArray(al.instrumento) ? al.instrumento[0] : (al.instrumento || ''));
        al.instrumento_asignado = instElegido;

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
            let updateData = { 
                estado_agenda: "Pendiente validación por profe", 
                instrumento_asignado: instElegido,
                reserva_profe_id: pId, 
                reserva_profe_nombre: pNom, 
                reserva_cal_id: cId, 
                opciones_propuestas: opciones, 
                reserva_fecha_texto: opciones.length === 1 ? opciones[0].fechaTexto : 'Varias opciones' 
            }; 
            if (al.id_evento_reserva) { 
                await eliminarEventoSeguro(al); 
                updateData.id_evento_reserva = null; 
                updateData.calendario_evento_reserva = null; 
            } 
            await updateDoc(doc(db, "alumnos", alumnoIdActual), updateData); 
            await navigator.clipboard.writeText(finalTxt); 
            alert("Texto copiado al portapapeles. Estado avanzado."); 
            document.getElementById('modal-agenda').close(); 
            cargarVista(estadoActualVista); 
        } catch(e) { 
            alert("❌ Error:\n\n" + e.message); 
        } 
        setBotonCargando(target, false); 
        return; 
    }
    
    async function generarTextoConHistorial(idAlumno, plantillaKey, overrideFecha = null, overrideProfeId = null, overrideProfeNombre = null, overrideOpciones = null) { 
        const al = (await getDoc(doc(db, "alumnos", idAlumno))).data(); 
        let aliasP = ''; 
        const targetProfeId = overrideProfeId || al.reserva_profe_id; 
        const targetProfeNom = overrideProfeNombre || al.reserva_profe_nombre; 
        if (targetProfeId) { 
            const pDoc = await getDoc(doc(db, "profesores", targetProfeId)); 
            if(pDoc.exists()) aliasP = pDoc.data().alias_transferencia||''; 
        } 
        let histText = formatearTextoHistorial(al.historial); 
        let template = configApp[plantillaKey] || ''; 
        template = template.replace(/\{historial\}/gi, histText); 
        const iS = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || '')); 
        const dP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : ''; 
        const fAmiInicio = al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : ''; 
        let opc = overrideOpciones || al.opciones_propuestas || []; 
        let opcionesStr = opc.length > 0 ? opc.map(o => `${o.letra || '-'}- ${o.fechaTexto}`).join('\n') : ''; 
        let fHora = overrideFecha || al.reserva_fecha_texto || ''; 
        if (opc.length > 1 && (fHora === 'Varias opciones' || !fHora)) { 
            fHora = '\n' + opcionesStr; 
        } 
        const txt = reemplazarVariables(template, { fecha_hora: fHora, opciones: opcionesStr, nombre: al.nombre, edad: al.edad||'-', instrumento: iS, suscripcion: al.tipo_suscripcion || '', descripcion: dP, profe: targetProfeNom || '', valor: configApp.valor_clase || '', alias_profe: aliasP || '', grupo: al.grupo_asignado || '', 'fecha inicio clases': fAmiInicio }); 
        return { al, txt }; 
    }

    if (target.classList.contains('btn-validado-profe-popup') || target.closest('.btn-validado-profe-popup')) { 
        const btn = target.classList.contains('btn-validado-profe-popup') ? target : target.closest('.btn-validado-profe-popup');
        const id = btn.getAttribute('data-id'); 
        const al = (await getDoc(doc(db, "alumnos", id))).data(); 
        const container = document.getElementById('opciones-validadas-container'); 
        container.innerHTML = ''; 
        if (al.opciones_propuestas && al.opciones_propuestas.length > 0) { 
            al.opciones_propuestas.forEach((op, index) => { 
                container.innerHTML += `<label style="display:flex; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="radio" name="opt-valida-profe" value='${JSON.stringify(op)}' ${index===0?'checked':''}> ${op.letra ? op.letra+'- ' : ''}${op.fechaTexto}</label>`; 
            }); 
        } else { 
            const op = { inicio: al.reserva_inicio, fin: al.reserva_fin, fechaTexto: al.reserva_fecha_texto, calId: al.reserva_cal_id, profeId: al.reserva_profe_id, profeNombre: al.reserva_profe_nombre }; 
            container.innerHTML = `<label style="display:flex; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="radio" name="opt-valida-profe" value='${JSON.stringify(op)}' checked> ${op.fechaTexto}</label>`; 
        } 
        document.getElementById('validar-profe-alumno-id').value = id; 
        document.getElementById('modal-validar-profe').showModal(); 
        return; 
    }
    if (target.id === 'btn-confirmar-validacion-profe') { const id = document.getElementById('validar-profe-alumno-id').value, selectedRadio = document.querySelector('input[name="opt-valida-profe"]:checked'); if(!selectedRadio) return alert("Selecciona una opción."); const op = JSON.parse(selectedRadio.value), al = (await getDoc(doc(db, "alumnos", id))).data(); setBotonCargando(target, true); try { al.reserva_profe_id = op.profeId; al.reserva_profe_nombre = op.profeNombre; al.reserva_cal_id = op.calId; al.reserva_fecha_texto = op.fechaTexto; al.reserva_inicio = op.inicio; al.reserva_fin = op.fin; const titulos = construirTitulosEvento(al, 'reserva', configApp); const evRes = await crearEventoSeguro(al, titulos, op.inicio, op.fin); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente validación por alumno", id_evento_reserva: evRes.id, calendario_evento_reserva: evRes.calendar, reserva_profe_id: op.profeId, reserva_profe_nombre: op.profeNombre, reserva_cal_id: op.calId, reserva_fecha_texto: op.fechaTexto, reserva_inicio: op.inicio, reserva_fin: op.fin, opciones_propuestas: null }); const dataText = await generarTextoConHistorial(id, 'texto_alumno'); await navigator.clipboard.writeText(dataText.txt); alert("Reserva en Calendar creada exitosamente.\n\nTexto copiado."); document.getElementById('modal-validar-profe').close(); cargarVista(estadoActualVista); } catch(e) { alert("❌ Error:\n\n" + e.message); } setBotonCargando(target, false); return; }
    if (target.classList.contains('btn-confirmar-entrevista') || target.closest('.btn-confirmar-entrevista')) {
        const btn = target.classList.contains('btn-confirmar-entrevista') ? target : target.closest('.btn-confirmar-entrevista');
        const id = btn.getAttribute('data-id');
        setBotonCargando(btn, true);
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (!alDoc.exists()) {
                setBotonCargando(btn, false);
                return alert("Alumno no encontrado.");
            }
            const al = alDoc.data();
            const descP = al.descripcion ? al.descripcion.replace(/<[^>]*>?/gm, '').trim() : '';
            const titulos = construirTitulosEvento(al, 'confirmado', configApp);
            if (al.id_evento_reserva) {
                try {
                    await actualizarEventoSeguro(al, titulos, descP);
                } catch(calErr) {
                    console.warn("Aviso: No se pudo actualizar el evento en Google Calendar:", calErr);
                }
            }
            const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
            const hist = al.historial || [];
            hist.push({ id: Date.now(), texto: "Agenda confirmada por alumno.", fecha: fechaStr });
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda confirmada", historial: hist });
            alert("✅ ¡Agenda Confirmada exitosamente! El alumno pasó a Confirmadas.");
            cargarVista(estadoActualVista);
        } catch(e) {
            alert("❌ Error al confirmar agenda:\n\n" + e.message);
        }
        setBotonCargando(btn, false);
        return;
    }
    if (target.classList.contains('btn-reenviar-profe') || target.classList.contains('btn-enviar-conf-profe') || target.closest('.btn-reenviar-profe') || target.closest('.btn-enviar-conf-profe')) { 
        const btn = target.closest('.btn-reenviar-profe') || target.closest('.btn-enviar-conf-profe');
        try { 
            const id = btn.getAttribute('data-id'); 
            const al = (await getDoc(doc(db, "alumnos", id))).data(); 
            let key = 'texto_conf_profe'; 
            if (btn.classList.contains('btn-reenviar-profe')) { 
                key = (al.opciones_propuestas && al.opciones_propuestas.length > 1) ? 'texto_opciones_multiples' : 'texto_profe'; 
            } 
            const data = await generarTextoConHistorial(id, key); 
            await navigator.clipboard.writeText(data.txt); 
            alert("Texto copiado."); 
        } catch(e) {} 
        return; 
    }
    if (target.classList.contains('btn-reenviar-alumno') || target.classList.contains('btn-enviar-conf-alumno') || target.closest('.btn-reenviar-alumno') || target.closest('.btn-enviar-conf-alumno')) { 
        const btn = target.closest('.btn-reenviar-alumno') || target.closest('.btn-enviar-conf-alumno');
        try { 
            const id = btn.getAttribute('data-id'); 
            const key = btn.classList.contains('btn-reenviar-alumno') ? 'texto_alumno' : 'texto_conf_alumno'; 
            const data = await generarTextoConHistorial(id, key); 
            await navigator.clipboard.writeText(data.txt); 
            alert("Texto copiado."); 
        } catch(e) {} 
        return; 
    }
    if (target.classList.contains('btn-cancelar-reserva') || target.closest('.btn-cancelar-reserva')) { 
        const btn = target.classList.contains('btn-cancelar-reserva') ? target : target.closest('.btn-cancelar-reserva');
        const motivo = prompt("¿Estás seguro de cancelar? Se eliminará en Calendar.\nIngresa motivo para historial:"); 
        if (motivo !== null) { 
            if (motivo.trim() === "") return alert("Debes ingresar motivo."); 
            const id = btn.getAttribute('data-id'); 
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
                    alert("Cancelada. Texto CANCELACIÓN copiado."); 
                } 
                await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente procesar", reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, opciones_propuestas: null, historial: hist }); 
                cargarVista(estadoActualVista); 
            } catch(e) { 
                alert("❌ Error:\n\n" + e.message); 
            } 
        } 
        return; 
    }

    if (target.classList.contains('btn-abrir-suspender') || target.closest('.btn-abrir-suspender')) { 
        const btn = target.classList.contains('btn-abrir-suspender') ? target : target.closest('.btn-abrir-suspender');
        document.getElementById('susp-alumno-id').value = btn.getAttribute('data-id'); 
        document.getElementById('susp-motivo').value = ""; 
        document.getElementById('modal-suspender').showModal(); 
        return; 
    }
    if (target.id === 'btn-guardar-suspension') { const id = document.getElementById('susp-alumno-id').value, mtv = document.getElementById('susp-motivo').value; if(!mtv) return alert("Seleccione motivo"); setBotonCargando(target, true); try { const al = (await getDoc(doc(db, "alumnos", id))).data(); if (al.id_evento_reserva) await eliminarEventoSeguro(al); const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`, hist = al.historial || []; hist.push({ id: Date.now(), texto: `Suspendido. Motivo: ${mtv}`, fecha: fechaStr }); await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda suspendida", motivo_suspension: mtv, reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, historial: hist }); document.getElementById('modal-suspender').close(); cargarVista(estadoActualVista); } catch(err){ alert("❌ Error:\n\n" + err.message); } setBotonCargando(target, false); return;}
    if (target.classList.contains('btn-recuperar-agenda') || target.closest('.btn-recuperar-agenda')) { 
        const btn = target.classList.contains('btn-recuperar-agenda') ? target : target.closest('.btn-recuperar-agenda');
        await updateDoc(doc(db, "alumnos", btn.getAttribute('data-id')), { estado_agenda: "Pendiente procesar", motivo_suspension: null }); 
        cargarVista(estadoActualVista); 
        return; 
    }
    if (target.classList.contains('btn-cerrar-modal')) { document.getElementById(target.getAttribute('data-modal')).close(); return; }
    
    if (target.id === 'btn-nuevo-alumno') { 
        const wrap = document.getElementById('form-alumno-wrapper'); 
        document.getElementById('modal-alta-alumno').appendChild(wrap); 
        wrap.style.display = 'block'; 
        document.getElementById('form-titulo').textContent = 'Nuevo Alumno'; 
        document.getElementById('modal-status-badge').style.display = 'none'; 
        document.getElementById('alumno-id').value = ''; 
        document.getElementById('form-alumno').reset(); 
        quill.setContents([]); 
        quillInforme.setContents([]); 
        quillInforme.enable(false); 
        document.getElementById('aviso-informe-bloqueado').style.display = 'block'; 
        historialActual = []; 
        renderHistorial(); 
        
        diasSemana.forEach(d => { 
            const rangosCont = document.getElementById(`rangos-disp-${d.id}`);
            if (rangosCont) rangosCont.innerHTML = crearFilaRangoHTML(d.id, '', '', false, 0);
            const cA = document.getElementById(`disp-${d.id}-all`);
            const cN = document.getElementById(`disp-${d.id}-none`);
            const sE = document.getElementById(`estado-${d.id}`);
            if (cA) cA.checked = false;
            if (cN) cN.checked = false;
            if (sE) sE.textContent = "";
            actualizarBotonesQuitarRango(d.id, false);
            window.updateDispStateForDay(d.id, false);
        }); 
        document.getElementById('chk-ingreso-directo').checked = false; 
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
        const tabBtns = document.querySelectorAll('.tab-btn'); 
        if(tabBtns.length > 0) { tabBtns[0].classList.add('active'); } 
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none'); 
        if(document.getElementById('tab-datos')) document.getElementById('tab-datos').style.display = 'block';
        const accionesCont = document.getElementById('modal-acciones-container'); 
        if(accionesCont) accionesCont.style.display = 'none';
        await cargarSelectsAlumnos(); 
        document.getElementById('modal-alta-alumno').showModal(); 
        return; 
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
    document.getElementById('alumno-id').value = id; 
    const d = (await getDoc(doc(db, "alumnos", id))).data(); 
    document.getElementById('nombre').value = d.nombre; 
    document.getElementById('celular').value = d.celular; 
    document.getElementById('edad').value = d.edad||''; 
    document.getElementById('nivel').value = d.nivel||''; 
    await cargarSelectsAlumnos(); 
    const sI = document.getElementById('instrumento'); 
    Array.from(sI.options).forEach(o => o.selected = (d.instrumento||[]).includes(o.value)); 
    syncSelectToChips('instrumento', 'chips-instrumentos'); 
    document.getElementById('tipo_suscripcion').value = d.tipo_suscripcion; 
    quill.root.innerHTML = d.descripcion||''; 
    historialActual = d.historial || []; 
    renderHistorial(); 
    
    quillInforme.root.innerHTML = d.informe_admision || '';
    const estadosBloqueados = ['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno'];
    if (estadosBloqueados.includes(d.estado_agenda)) {
        document.getElementById('aviso-informe-bloqueado').style.display = 'block';
        quillInforme.enable(false);
    } else {
        document.getElementById('aviso-informe-bloqueado').style.display = 'none';
        quillInforme.enable(true);
    }
    
    const info = getEstadoYBadge(d);
    const badgeEl = document.getElementById('modal-status-badge');
    if (badgeEl) { badgeEl.className = `status-badge ${info.colorBadge}`; badgeEl.textContent = info.txtEstado; badgeEl.style.display = 'inline-flex'; }

    const accionesCont = document.getElementById('modal-acciones-container');
    if (accionesCont) {
        accionesCont.style.display = 'block';
        accionesCont.innerHTML = `
            <button type="button" id="btn-trigger-modal-acciones" style="background:var(--accent-teal); color:white; border:none; padding:7px 14px; border-radius:8px; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">Acciones ▾</button>
            <div class="dropdown-menu-wrapper" id="modal-acciones-dropdown" style="top:100%; left:0; right:auto; z-index:1200; min-width:220px;">
                <div class="dropdown-menu">${generarBotonesAccion(d, id, true)}</div>
            </div>
        `;
    }

    const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00'; 
    diasSemana.forEach(dia => { 
        const dD = (d.disponibilidad && d.disponibilidad[dia.id]) || [];
        const rangosCont = document.getElementById(`rangos-disp-${dia.id}`);
        const cA = document.getElementById(`disp-${dia.id}-all`);
        const cN = document.getElementById(`disp-${dia.id}-none`);
        const sE = document.getElementById(`estado-${dia.id}`);
        
        if (!rangosCont) return;
        rangosCont.innerHTML = '';
        if (cA) cA.checked = false;
        if (cN) cN.checked = false;
        if (sE) sE.textContent = "";
        
        if (dD.length === 0) {
            if (cN) cN.checked = true;
            rangosCont.innerHTML = crearFilaRangoHTML(dia.id, '', '', false, 0);
        } else if (dD.length === 1 && dD[0].inicio === hApe && dD[0].fin === hCie) {
            if (cA) cA.checked = true;
            rangosCont.innerHTML = crearFilaRangoHTML(dia.id, '', '', false, 0);
        } else {
            dD.forEach((rango, idx) => {
                rangosCont.innerHTML += crearFilaRangoHTML(dia.id, rango.inicio || '', rango.fin || '', false, idx);
            });
        }
        actualizarBotonesQuitarRango(dia.id, false);
        window.updateDispStateForDay(dia.id, false);
    }); 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); const tabBtns = document.querySelectorAll('.tab-btn'); if(tabBtns.length > 0) { tabBtns[0].classList.add('active'); } document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none'); if(document.getElementById('tab-datos')) document.getElementById('tab-datos').style.display = 'block';
}

document.getElementById('form-alumno').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const btnSubmit = e.target.querySelector('button[type="submit"]'); 
    setBotonCargando(btnSubmit, true);
    
    const disp = {}, hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00'; 
    diasSemana.forEach(d => { 
        const cA = document.getElementById(`disp-${d.id}-all`)?.checked;
        const cN = document.getElementById(`disp-${d.id}-none`)?.checked;
        if (cN) {
            disp[d.id] = [];
        } else if (cA) {
            disp[d.id] = [{ inicio: hApe, fin: hCie }];
        } else {
            const rangosCont = document.getElementById(`rangos-disp-${d.id}`);
            const items = rangosCont ? rangosCont.querySelectorAll('.rango-item') : [];
            const arr = [];
            items.forEach(item => {
                const i = item.querySelector('.rango-inicio')?.value || '';
                const f = item.querySelector('.rango-fin')?.value || '';
                if (i || f) {
                    arr.push({ inicio: i || hApe, fin: f || hCie });
                }
            });
            disp[d.id] = arr;
        }
    }); 
    
    const selInst = document.getElementById('instrumento'), instV = Array.from(selInst.selectedOptions).map(o=>o.value), data = { nombre: document.getElementById('nombre').value, celular: document.getElementById('celular').value, edad: Number(document.getElementById('edad').value), nivel: document.getElementById('nivel').value, instrumento: instV, tipo_suscripcion: document.getElementById('tipo_suscripcion').value, descripcion: quill.root.innerHTML, informe_admision: quillInforme.root.innerHTML, disponibilidad: disp, historial: historialActual }; 
    try { const id = document.getElementById('alumno-id').value; if (id) { await updateDoc(doc(db, "alumnos", id), data); } else { const esDirecto = document.getElementById('chk-ingreso-directo').checked; if (esDirecto) { data.estado_agenda = "Lista de espera"; const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`; data.historial.push({ id: Date.now(), texto: "Ingreso directo a Lista de Espera.", fecha: fechaStr }); } else { data.estado_agenda = "Pendiente procesar"; } await addDoc(collection(db, "alumnos"), data); } const wrap = document.getElementById('form-alumno-wrapper'); wrap.style.display='none'; document.body.appendChild(wrap); document.getElementById('modal-alta-alumno').close(); cargarVista(estadoActualVista); } catch(err) { alert("Error al guardar."); } setBotonCargando(btnSubmit, false);
});

async function cargarABM(coleccion, titulo, cont) { 
    window.tituloABMActual = titulo; 
    const qS = await getDocs(collection(db, coleccion));
    let h = `<div style="margin-bottom:25px; font-size:0.9em; color:var(--text-muted);"><span style="cursor:pointer; color:var(--accent-teal);" onclick="cargarVista('Configuración')">Configuración</span> &gt; <strong style="color:var(--text-main);">${titulo}</strong></div>`; 
    
    if (coleccion === 'profesores') {
        h += `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
                <div style="font-size:1.1em; font-weight:700; color:var(--text-main);">Listado de Profesores</div>
                <button type="button" id="btn-nuevo-profesor-modal" class="btn-primary" style="height:38px; padding:0 16px; font-size:13px; font-weight:700;">➕ Nuevo Profesor</button>
            </div>
        `;
    } else {
        h += `<div style="display:flex; gap:15px; align-items:flex-end; flex-wrap:wrap; padding:25px; background:white; border-radius:12px; border:1px solid var(--border-color); margin-bottom:20px;"><div style="flex-grow:1; min-width:180px;"><label>${coleccion === 'usuarios_sistema' ? 'Correo' : 'Nombre'}</label><input type="text" id="input-nuevo-abm" class="modern-input"></div><button id="btn-guardar-abm" class="btn-primary" style="height:42px;">+ Agregar</button></div>`; 
    }
    
    qS.forEach(d => { 
        const dt = d.data(); 
        let displayNom = dt.nombre || dt.email; 
        
        let tags = [];
        if(dt.entrevista) tags.push('Evaluador');
        if(dt.grupales) tags.push('Grupales');
        if(dt.ensambles) tags.push('Ensambles');

        // Se oculta el ID Calendario en la ficha del profesor
        let ex = coleccion==='profesores' ? ` <div style="font-size:11px; color:var(--accent-teal); font-weight:600; margin-top:2px;">${(dt.skills || []).join(' • ') || 'Sin skills'}</div><div style="font-size:10px; color:var(--accent-blue); font-weight:600; margin-top:2px;">${tags.join(' | ')}</div>` : ''; 
        h += `<div class="row-item abm-row" onclick="window.abrirEdicionABM('${d.id}', '${coleccion}', '${displayNom}', '${dt.correo_calendario||''}', '${dt.celular||''}', '${dt.alias_transferencia||''}')"><div><strong style="color:var(--text-main); font-size:15px;">${displayNom}</strong>${ex}</div><button class="btn-row-action" onclick="event.stopPropagation(); window.eliminarABM('${d.id}', '${coleccion}')">❌</button></div>`; 
    }); 
    cont.innerHTML = h; 

    if (coleccion === 'profesores') {
        const btnNuevoProfe = document.getElementById('btn-nuevo-profesor-modal');
        if (btnNuevoProfe) {
            btnNuevoProfe.addEventListener('click', () => {
                window.abrirEdicionABM('', 'profesores', '', '', '', '');
            });
        }
    } else {
        const btnGuardarSimple = document.getElementById('btn-guardar-abm');
        if (btnGuardarSimple) {
            btnGuardarSimple.addEventListener('click', async () => { 
                const n = document.getElementById('input-nuevo-abm').value.trim(); 
                if(!n) return; 
                const dO = coleccion === 'usuarios_sistema' ? { email: n.toLowerCase() } : { nombre: n }; 
                await addDoc(collection(db, coleccion), dO); 
                cargarABM(coleccion, titulo, cont); 
            }); 
        }
    }
}

window.abrirEdicionABM = async function(id, col, nom, cor, cel, ali) { 
    document.getElementById('abm-edit-id').value = id || ''; 
    document.getElementById('abm-edit-coleccion').value = col; 
    document.getElementById('label-abm-edit-nombre').innerHTML = col === 'usuarios_sistema' ? `Correo: <input type="text" id="abm-edit-nombre" class="modern-input" required>` : `Nombre: <input type="text" id="abm-edit-nombre" class="modern-input" required>`; 
    document.getElementById('abm-edit-nombre').value = nom || '';
    
    const tituloModal = document.querySelector('#modal-abm-edit h3');
    if (tituloModal) {
        tituloModal.textContent = id ? (col === 'profesores' ? 'Editar Profesor' : 'Editar Elemento') : (col === 'profesores' ? 'Nuevo Profesor' : 'Nuevo Elemento');
    }

    if(col==='profesores') { 
        document.getElementById('div-abm-edit-profe').style.display='block'; 
        document.getElementById('abm-edit-correo').value = cor || ''; 
        document.getElementById('abm-edit-celular').value = cel || ''; 
        document.getElementById('abm-edit-alias').value = ali || ''; 
        
        document.getElementById('abm-edit-entrevista').checked = !id;
        document.getElementById('abm-edit-grupales').checked = false;
        document.getElementById('abm-edit-ensambles').checked = false;
        
        const iS = await getDocs(collection(db, "instrumentos"));
        const selSkills = document.getElementById('abm-edit-skills');
        selSkills.innerHTML = '';
        iS.forEach(d => selSkills.innerHTML += `<option value="${d.data().nombre}">${d.data().nombre}</option>`);

        if (id) {
            try { 
                const pr = (await getDoc(doc(db, col, id))).data(); 
                document.getElementById('abm-edit-entrevista').checked = !!pr.entrevista;
                document.getElementById('abm-edit-grupales').checked = !!pr.grupales;
                document.getElementById('abm-edit-ensambles').checked = !!pr.ensambles;

                Array.from(selSkills.options).forEach(o => o.selected = (pr.skills||[]).includes(o.value));
                syncSelectToChips('abm-edit-skills', 'chips-abm-edit-skills');

                const hApe = configApp.hora_apertura || '09:00'; const hCie = configApp.hora_cierre || '22:00'; 
                diasSemana.forEach(dia => { 
                    const dD = pr.disponibilidad ? pr.disponibilidad[dia.id] : []; 
                    const rangosCont = document.getElementById(`rangos-disp-p-${dia.id}`);
                    const cA = document.getElementById(`disp-p-${dia.id}-all`);
                    const cN = document.getElementById(`disp-p-${dia.id}-none`);
                    const sE = document.getElementById(`estado-p-${dia.id}`);
                    
                    if (!rangosCont) return;
                    rangosCont.innerHTML = '';
                    if (cA) cA.checked = false;
                    if (cN) cN.checked = false;
                    if (sE) sE.textContent = "";
                    
                    if (!dD || dD.length === 0) {
                        if (cN) cN.checked = true;
                        rangosCont.innerHTML = crearFilaRangoHTML(dia.id, '', '', true, 0);
                    } else if (dD.length === 1 && dD[0].inicio === hApe && dD[0].fin === hCie) {
                        if (cA) cA.checked = true;
                        rangosCont.innerHTML = crearFilaRangoHTML(dia.id, '', '', true, 0);
                    } else {
                        dD.forEach((rango, idx) => {
                            rangosCont.innerHTML += crearFilaRangoHTML(dia.id, rango.inicio || '', rango.fin || '', true, idx);
                        });
                    }
                    actualizarBotonesQuitarRango(dia.id, true);
                    window.updateDispStateForDay(dia.id, true);
                }); 
            } catch(e) {} 
        } else {
            syncSelectToChips('abm-edit-skills', 'chips-abm-edit-skills');
            diasSemana.forEach(dia => {
                const rangosCont = document.getElementById(`rangos-disp-p-${dia.id}`);
                if (rangosCont) rangosCont.innerHTML = crearFilaRangoHTML(dia.id, '', '', true, 0);
                const cA = document.getElementById(`disp-p-${dia.id}-all`);
                const cN = document.getElementById(`disp-p-${dia.id}-none`);
                const sE = document.getElementById(`estado-p-${dia.id}`);
                if (cA) cA.checked = true;
                if (cN) cN.checked = false;
                if (sE) { sE.textContent = "Libre"; sE.style.color = "var(--accent-teal)"; }
                actualizarBotonesQuitarRango(dia.id, true);
                window.updateDispStateForDay(dia.id, true);
            });
        }
    } else {
        document.getElementById('div-abm-edit-profe').style.display='none'; 
    }
    document.getElementById('modal-abm-edit').showModal(); 
};

window.eliminarABM = async function(id, col) { 
    if(await window.confirmar('Eliminar registro', 'Esta accion es permanente y no se puede deshacer.', 'Eliminar')) {
        await deleteDoc(doc(db, col, id)); 
        cargarVista('ABM-' + window.tituloABMActual); 
    } 
};

document.getElementById('btn-guardar-abm-edit').addEventListener('click', async (e) => { 
    const btnTarget = e.currentTarget;
    setBotonCargando(btnTarget, true); 
    
    const id = document.getElementById('abm-edit-id').value;
    const col = document.getElementById('abm-edit-coleccion').value;
    const nombreInput = document.getElementById('abm-edit-nombre').value.trim(); 
    if (!nombreInput) {
        setBotonCargando(btnTarget, false);
        return alert("El nombre/correo no puede estar vacío.");
    }
    const dO = col === 'usuarios_sistema' ? { email: nombreInput.toLowerCase() } : { nombre: nombreInput }; 
    
    if(col === 'profesores') { 
        dO.correo_calendario = document.getElementById('abm-edit-correo').value.trim(); 
        dO.celular = document.getElementById('abm-edit-celular').value.trim(); 
        dO.alias_transferencia = document.getElementById('abm-edit-alias').value.trim(); 
        dO.entrevista = document.getElementById('abm-edit-entrevista').checked; 
        dO.grupales = document.getElementById('abm-edit-grupales').checked; 
        dO.ensambles = document.getElementById('abm-edit-ensambles').checked; 
        
        const selSkills = document.getElementById('abm-edit-skills');
        dO.skills = Array.from(selSkills.selectedOptions).map(o => o.value);

        const disp = {}; const hApe = configApp.hora_apertura || '09:00'; const hCie = configApp.hora_cierre || '22:00'; 
        diasSemana.forEach(d => { 
            const cA = document.getElementById(`disp-p-${d.id}-all`)?.checked;
            const cN = document.getElementById(`disp-p-${d.id}-none`)?.checked;
            if (cN) {
                disp[d.id] = [];
            } else if (cA) {
                disp[d.id] = [{ inicio: hApe, fin: hCie }];
            } else {
                const rangosCont = document.getElementById(`rangos-disp-p-${d.id}`);
                const items = rangosCont ? rangosCont.querySelectorAll('.rango-item') : [];
                const arr = [];
                items.forEach(item => {
                    const i = item.querySelector('.rango-inicio')?.value || '';
                    const f = item.querySelector('.rango-fin')?.value || '';
                    if (i || f) {
                        arr.push({ inicio: i || hApe, fin: f || hCie });
                    }
                });
                disp[d.id] = arr;
            }
        }); 
        dO.disponibilidad = disp; 
    } 
    
    try {
        if (id) {
            await updateDoc(doc(db, col, id), dO); 
        } else {
            await addDoc(collection(db, col), dO);
        }
        document.getElementById('modal-abm-edit').close(); 
        await cargarVista('ABM-' + window.tituloABMActual); 
    } catch(err) {
        alert("Error al guardar: " + err.message);
    }
    
    setBotonCargando(btnTarget, false); 
});

document.querySelectorAll('#sidebar .nav-item, #sidebar .nav-item-small').forEach(item => { 
    item.addEventListener('click', (e) => { 
        if(e.target.closest('summary')) return; 
        document.querySelectorAll('#sidebar .nav-item, #sidebar .nav-item-small').forEach(el => el.classList.remove('active')); 
        const tgt = e.target.closest('.nav-item') || e.target.closest('.nav-item-small');
        tgt.classList.add('active'); 
        cargarVista(tgt.getAttribute('data-vista')); 
        document.getElementById('sidebar').classList.remove('active'); 
        const overlay = document.getElementById('mobile-overlay'); 
        if (overlay) overlay.style.display = 'none'; 
    }); 
});

window.cargarVista = cargarVista;
