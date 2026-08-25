// =======================================================================
// app.js — Mandala Admisión (Modular Architecture v4.9.0)
// =======================================================================

import { 
    APP_VERSION, 
    SCRIPT_URL, 
    firebaseConfig, 
    diasSemana, 
    defaultCfg, 
    configNodosFlujo,
    configNodosFlujoEvaluador,
    configNodosFlujoCoordinador
} from "./src/config/constants.js";

import { 
    app, 
    db, 
    auth, 
    provider, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    setDoc, 
    query, 
    where, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut 
} from "./src/config/firebase.js";

import {
    limpiarHoraParaChip,
    formatearChipHorario,
    formatearDiaCompletoChips,
    crearFilaRangoHTML,
    renderContenedorDisponibilidad,
    actualizarBotonesQuitarRango,
    agregarRangoDia,
    quitarRangoDia,
    updateDispStateForDay
} from "./src/ui/horarios.ui.js";

import {
    getEmojiInstrumento,
    reemplazarVariables,
    formatoLocalISO,
    formatearFechaAmi,
    fetchCalendarAPI,
    getEventosCalendario,
    crearEventoCalendario,
    actualizarEventoCalendario,
    eliminarEventoCalendario,
    construirTitulosEvento,
    detectarTipoSuscripcion,
    construirTitulosPrealtaYAlta,
    construirDescripcionEventoAlta,
    getCalendarIdParaAlumno,
    crearEventoSeguro,
    actualizarEventoSeguro,
    eliminarEventoSeguro,
    sincronizarEventoPrealtaCalendar,
    sincronizarEventoAltaConfirmadaCalendar,
    eliminarEventoAltaSeguro
} from "./src/services/calendar.service.js";

import {
    matchCantidadActual,
    matchGruposSugeridos,
    matchProfesores,
    setMatchCantidadActual,
    setMatchGruposSugeridos,
    setMatchProfesores,
    cargarProfesoresMatch,
    adaptarFormularioPorSuscripcion,
    filtrarProfesoresMatch,
    mostrarSkillsProfe,
    initMatchFormListeners,
    resetMatchForm,
    ocultarResultadosMatch,
    sonNivelesCompatibles,
    sonEdadesCompatibles,
    buscarHuecosComunes,
    calcularScoreCompatibilidad,
    generarCombinaciones,
    ejecutarBusquedaMatch,
    renderResultadosMatch,
    abrirModalDetalleGrupo,
    abrirModalConfirmarMatch,
    calcularProximaFechaDiaHora,
    ejecutarConfirmarMatch,
    obtenerEmojiInstrumento,
    renderMatchEnValidacion,
    renderMatchSolicitudesProfes,
    generarAlumnosPruebaMatch,
    generarAlumnosIndividualesPruebaMatch,
    limpiarAlumnosPruebaMatch
} from "./src/modules/match.module.js";

import {
    renderPortalProfesor
} from "./src/modules/profesor.module.js";

import {
    renderListaInstrumentosAlumnos,
    refrescarProfesoresPrealta,
    abrirModalPrealta,
    abrirModalPrealtaGrupal,
    guardarPreAlta,
    formatearFechaAltaParaExcel,
    formatearFechaInicioParaExcel,
    generarFilaExcelBD,
    generarFilaExcelFacturacion,
    copiarFilaExcelBD,
    copiarFilaExcelFacturacion
} from "./src/modules/altas.module.js";

import {
    renderTimelineUnificado,
    renderCharts,
    extraerInstrumentos,
    extraerSuscripcion
} from "./src/modules/dashboard.module.js";

import {
    renderConfigHub,
    renderConfig,
    renderConfigMatch,
    cargarABM,
    abrirEdicionABM,
    eliminarABM
} from "./src/modules/abm.module.js";

import {
    getEstadoYBadge,
    generarBotonesPrincipalesVisibles,
    generarBotonesAccion
} from "./src/modules/inbox.module.js";

import {
    parseCSV,
    procesarFilasCSV,
    mostrarModalPreviewCSV,
    ejecutarImportacionMasiva
} from "./src/modules/csv.module.js";

let agrupadorActual = 'ninguno';
let filtrosSeleccionados = {
    instrumentos: new Set(),
    niveles: new Set(),
    suscripciones: new Set()
};
let filtroAlarmaActual = 'Todos'; 
let vistaModo = 'lista'; 
let selectedBulkIds = [];
let matchListenersAttached = false;

let agrupadorNivel1 = 'ninguno';
let agrupadorNivel2 = 'ninguno';
let agrupadorNivel3 = 'ninguno';
let agrupadoresEsperaInicializados = false;

window.toggleGroupCollapsible = function(contentId, iconId) {
    const contentEl = document.getElementById(contentId);
    const iconEl = document.getElementById(iconId);
    if (!contentEl) return;
    const isHidden = contentEl.style.display === 'none';
    contentEl.style.display = isHidden ? 'flex' : 'none';
    if (iconEl) iconEl.textContent = isHidden ? '▼' : '▶';
};

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

let filtrosPopoverAbierto = false;

function renderFiltrosChips() {
    const cont = document.getElementById('filtros-chips');
    if (!cont) return;

    const totalFiltrosActivos = filtrosSeleccionados.instrumentos.size + 
                                filtrosSeleccionados.niveles.size + 
                                filtrosSeleccionados.suscripciones.size;

    const instrumentos = [
        { id: 'Canto', label: '🎤 Canto' },
        { id: 'Guitarra', label: '🎸 Guitarra' },
        { id: 'Bajo', label: '🎸 Bajo' },
        { id: 'Batería', label: '🥁 Batería' },
        { id: 'Piano', label: '🎹 Piano' },
        { id: 'Cajón', label: '📦 Cajón' }
    ];

    const niveles = [
        { id: 'Inicial I', label: '🌱 Inicial I' },
        { id: 'Inicial II', label: '🌿 Inicial II' },
        { id: 'Intermedio', label: '⚡ Intermedio' },
        { id: 'Avanzado', label: '🔥 Avanzado' }
    ];

    const suscripciones = [
        { id: 'Ensamble', label: '🧩 Ensamble' },
        { id: 'Clases Grupales', label: '👥 Grupal' },
        { id: 'Clase Individual', label: '👤 Individual' }
    ];

    // Badges en pantalla: solo los filtros seleccionados
    let activeBadgesHtml = '';
    
    filtrosSeleccionados.instrumentos.forEach(val => {
        const item = instrumentos.find(i => i.id === val) || { label: val };
        activeBadgesHtml += `
            <span class="active-filter-badge tag-inst">
                <span>${item.label}</span>
                <button type="button" class="btn-remove-filter" data-type="instrumento" data-val="${val}" title="Quitar filtro">✕</button>
            </span>`;
    });

    filtrosSeleccionados.niveles.forEach(val => {
        const item = niveles.find(n => n.id === val) || { label: val };
        activeBadgesHtml += `
            <span class="active-filter-badge tag-nivel">
                <span>${item.label}</span>
                <button type="button" class="btn-remove-filter" data-type="nivel" data-val="${val}" title="Quitar filtro">✕</button>
            </span>`;
    });

    filtrosSeleccionados.suscripciones.forEach(val => {
        const item = suscripciones.find(s => s.id === val) || { label: val };
        activeBadgesHtml += `
            <span class="active-filter-badge tag-susc">
                <span>${item.label}</span>
                <button type="button" class="btn-remove-filter" data-type="suscripcion" data-val="${val}" title="Quitar filtro">✕</button>
            </span>`;
    });

    if (totalFiltrosActivos > 0) {
        activeBadgesHtml += `
            <button type="button" id="btn-limpiar-todos-filtros" style="background:none; border:none; color:#ef4444; font-size:12px; font-weight:600; cursor:pointer; padding:3px 6px; text-decoration:underline; font-family:inherit;">Limpiar todo</button>
        `;
    }

    let html = `
        <div style="position:relative; display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap; width:100%;">
            <!-- Botón Disparador Filtros -->
            <div style="position:relative;">
                <button type="button" id="btn-toggle-filtros-panel" class="btn-filtros-trigger ${totalFiltrosActivos > 0 ? 'has-active' : ''} ${filtrosPopoverAbierto ? 'open' : ''}">
                    <span style="font-size:14px;">⚡</span>
                    <span>Filtros</span>
                    ${totalFiltrosActivos > 0 ? `<span style="background:var(--accent-teal); color:#fff; font-size:10.5px; font-weight:700; padding:1px 6px; border-radius:10px;">${totalFiltrosActivos}</span>` : ''}
                    <span style="font-size:10px; color:var(--text-muted); transition:transform 0.2s;">${filtrosPopoverAbierto ? '▲' : '▼'}</span>
                </button>

                <!-- Panel Popover Flotante -->
                <div id="dropdown-filtros-panel" class="dropdown-filtros-menu" style="display:${filtrosPopoverAbierto ? 'block' : 'none'}; position:absolute; top:calc(100% + 8px); left:0; z-index:1100; background:#ffffff; border:1px solid var(--border-color); border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,0.12); padding:16px 18px; width:340px; box-sizing:border-box;">
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
                        <span style="font-size:13px; font-weight:800; color:var(--text-main); text-transform:uppercase; letter-spacing:0.04em;">Filtrar Alumnos</span>
                        <button type="button" id="btn-cerrar-filtros-popover" style="background:none; border:none; cursor:pointer; font-size:14px; color:var(--text-muted); font-weight:700; padding:2px 6px;">✕</button>
                    </div>

                    <!-- Sección Instrumentos -->
                    <div style="margin-bottom:12px;">
                        <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Instrumento</div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            ${instrumentos.map(i => `
                                <button type="button" class="filter-chip ${filtrosSeleccionados.instrumentos.has(i.id) ? 'active' : ''}" data-type="instrumento" data-val="${i.id}">${i.label}</button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Sección Nivel -->
                    <div style="margin-bottom:12px;">
                        <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Nivel Pedagógico</div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            ${niveles.map(n => `
                                <button type="button" class="filter-chip ${filtrosSeleccionados.niveles.has(n.id) ? 'active active-nivel' : ''}" data-type="nivel" data-val="${n.id}">${n.label}</button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Sección Suscripción -->
                    <div style="margin-bottom:14px;">
                        <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Suscripción</div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            ${suscripciones.map(s => `
                                <button type="button" class="filter-chip ${filtrosSeleccionados.suscripciones.has(s.id) ? 'active active-susc' : ''}" data-type="suscripcion" data-val="${s.id}">${s.label}</button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Footer Popover -->
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:10px;">
                        <button type="button" id="btn-popover-limpiar" style="background:none; border:none; color:#ef4444; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; padding:4px 0; ${totalFiltrosActivos === 0 ? 'opacity:0.4; pointer-events:none;' : ''}">Limpiar</button>
                        <button type="button" id="btn-popover-aplicar" style="background:var(--accent-teal); color:#ffffff; border:none; border-radius:8px; padding:5px 14px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit;">Listo</button>
                    </div>
                </div>
            </div>

            <!-- Chips de Filtros Activos en Pantalla -->
            <div id="filtros-activos-chips" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                ${activeBadgesHtml}
            </div>
        </div>
    `;

    cont.innerHTML = html;

    // Toggle popover
    const btnToggle = document.getElementById('btn-toggle-filtros-panel');
    if (btnToggle) {
        btnToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            filtrosPopoverAbierto = !filtrosPopoverAbierto;
            renderFiltrosChips();
        });
    }

    const btnCerrar = document.getElementById('btn-cerrar-filtros-popover');
    if (btnCerrar) {
        btnCerrar.addEventListener('click', (e) => {
            e.stopPropagation();
            filtrosPopoverAbierto = false;
            renderFiltrosChips();
        });
    }

    const btnAplicar = document.getElementById('btn-popover-aplicar');
    if (btnAplicar) {
        btnAplicar.addEventListener('click', (e) => {
            e.stopPropagation();
            filtrosPopoverAbierto = false;
            renderFiltrosChips();
        });
    }

    const dropdownPanel = document.getElementById('dropdown-filtros-panel');
    if (dropdownPanel) {
        dropdownPanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Toggle chip individual dentro del popover
    cont.querySelectorAll('.dropdown-filtros-menu .filter-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = btn.getAttribute('data-type');
            const val = btn.getAttribute('data-val');

            if (type === 'instrumento') {
                if (filtrosSeleccionados.instrumentos.has(val)) filtrosSeleccionados.instrumentos.delete(val);
                else filtrosSeleccionados.instrumentos.add(val);
            } else if (type === 'nivel') {
                if (filtrosSeleccionados.niveles.has(val)) filtrosSeleccionados.niveles.delete(val);
                else filtrosSeleccionados.niveles.add(val);
            } else if (type === 'suscripcion') {
                if (filtrosSeleccionados.suscripciones.has(val)) filtrosSeleccionados.suscripciones.delete(val);
                else filtrosSeleccionados.suscripciones.add(val);
            }

            renderFiltrosChips();
            cargarVista(estadoActualVista);
        });
    });

    // Remover chip activo individual desde la barra principal
    cont.querySelectorAll('.btn-remove-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = btn.getAttribute('data-type');
            const val = btn.getAttribute('data-val');

            if (type === 'instrumento') filtrosSeleccionados.instrumentos.delete(val);
            else if (type === 'nivel') filtrosSeleccionados.niveles.delete(val);
            else if (type === 'suscripcion') filtrosSeleccionados.suscripciones.delete(val);

            renderFiltrosChips();
            cargarVista(estadoActualVista);
        });
    });

    // Limpiar todos
    const handleLimpiar = (e) => {
        if (e) e.stopPropagation();
        filtrosSeleccionados.instrumentos.clear();
        filtrosSeleccionados.niveles.clear();
        filtrosSeleccionados.suscripciones.clear();
        renderFiltrosChips();
        cargarVista(estadoActualVista);
    };

    const btnLimpiar = document.getElementById('btn-limpiar-todos-filtros');
    if (btnLimpiar) btnLimpiar.addEventListener('click', handleLimpiar);

    const btnPopoverLimpiar = document.getElementById('btn-popover-limpiar');
    if (btnPopoverLimpiar) btnPopoverLimpiar.addEventListener('click', handleLimpiar);
}

// Cerrar popover si hace clic fuera
document.addEventListener('click', (e) => {
    if (filtrosPopoverAbierto && !e.target.closest('#filtros-chips')) {
        filtrosPopoverAbierto = false;
        renderFiltrosChips();
    }
});

let actionLoadingTimeout = null;

export function mostrarIndicadorCarga(mensaje = 'Procesando acción en el sistema...') {
    const loader = document.getElementById('global-action-loader');
    const txt = document.getElementById('global-action-text');
    if (txt) txt.textContent = mensaje;
    if (loader) {
        try {
            if (typeof loader.showModal === 'function') {
                if (!loader.open) loader.showModal();
            } else {
                loader.style.display = 'flex';
            }
        } catch(e) {
            loader.style.display = 'flex';
        }
    }
    document.body.classList.add('body-action-busy');
    if (actionLoadingTimeout) clearTimeout(actionLoadingTimeout);
    actionLoadingTimeout = setTimeout(() => {
        ocultarIndicadorCarga();
    }, 25000);
}
window.mostrarIndicadorCarga = mostrarIndicadorCarga;

export function ocultarIndicadorCarga() {
    if (actionLoadingTimeout) clearTimeout(actionLoadingTimeout);
    const loader = document.getElementById('global-action-loader');
    if (loader) {
        try {
            if (typeof loader.close === 'function' && loader.open) {
                loader.close();
            }
        } catch(e) {}
        loader.style.display = 'none';
    }
    document.body.classList.remove('body-action-busy');
}
window.ocultarIndicadorCarga = ocultarIndicadorCarga;

export function removerFilaOptimista(id) {
    if (!id) return;
    const el = document.querySelector(`.row-item[data-id="${id}"]`);
    if (el) {
        el.style.transition = 'all 0.25s ease';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.95)';
        setTimeout(() => { if (el.parentNode) el.remove(); }, 250);
    }
}
window.removerFilaOptimista = removerFilaOptimista;

function setBotonCargando(btn, cargando, textoCustom = null) {
    if (cargando) {
        mostrarIndicadorCarga(textoCustom || 'Procesando solicitud...');
        if (btn) {
            if (!btn.dataset.textoOriginal || btn.dataset.textoOriginal.includes('Procesando')) {
                btn.dataset.textoOriginal = btn.innerHTML;
            }
            btn.innerHTML = `<span class="spinner-inline" style="width:13px; height:13px; border-width:2px; display:inline-block; vertical-align:middle; margin-right:6px;"></span> ${textoCustom || 'Procesando...'}`;
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.style.pointerEvents = 'none';
            btn.style.cursor = 'wait';
        }
    } else {
        ocultarIndicadorCarga();
        if (btn) {
            btn.innerHTML = btn.dataset.textoOriginal && !btn.dataset.textoOriginal.includes('Procesando') ? btn.dataset.textoOriginal : 'Guardar';
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.style.cursor = 'pointer';
        }
    }
}
window.setBotonCargando = setBotonCargando;

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
window.syncSelectToChips = syncSelectToChips;

async function conectarGoogle() { 
    try { await signInWithPopup(auth, provider); } catch (err) { alert("Error al intentar iniciar sesión."); } 
}

window.alert = function(msg, tipo = '') {
    const openModal = document.querySelector('dialog[open]');
    let container;
    if (openModal) {
        let modalToastContainer = openModal.querySelector('.modal-toast-container');
        if (!modalToastContainer) {
            modalToastContainer = document.createElement('div');
            modalToastContainer.className = 'modal-toast-container';
            openModal.appendChild(modalToastContainer);
        }
        container = modalToastContainer;
    } else {
        container = document.getElementById('toast-container');
    }
    if (!container) return console.log(msg); 
    const toast = document.createElement('div');
    
    let extraClass = '';
    const str = String(msg || '');
    if (tipo === 'success' || str.includes('✅') || str.toLowerCase().includes('éxito') || str.toLowerCase().includes('copiado') || str.toLowerCase().includes('guardado') || str.toLowerCase().includes('correctamente')) {
        extraClass = 'toast-success';
    } else if (tipo === 'error' || str.includes('❌') || str.toLowerCase().includes('error') || str.toLowerCase().includes('falló') || str.toLowerCase().includes('no se pudo')) {
        extraClass = 'toast-error';
    } else if (tipo === 'warning' || str.includes('⚠️') || str.toLowerCase().includes('atención') || str.toLowerCase().includes('alerta') || str.toLowerCase().includes('obligatorio')) {
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

const quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
const quillInforme = new Quill('#informe-editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
const quillPopup = new Quill('#informe-popup-editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });

// Render inicial de contenedores de disponibilidad multi-rango
renderContenedorDisponibilidad('contenedor-disponibilidad', false);
renderContenedorDisponibilidad('contenedor-disponibilidad-profe', true);

// Render y gestión de Perfil Psicológico / Emocional
async function renderChipsPerfilPsicologico(containerId, seleccionados = []) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    try {
        const snap = await getDoc(doc(db, "configuracion", "general"));
        if (snap.exists()) {
            configApp = { ...defaultCfg, ...snap.data() };
        }
    } catch(e) {}

    const opciones = (configApp && Array.isArray(configApp.perfil_psicologico_opciones) && configApp.perfil_psicologico_opciones.length > 0)
        ? configApp.perfil_psicologico_opciones
        : (defaultCfg.perfil_psicologico_opciones || []);
    
    const selSet = new Set(Array.isArray(seleccionados) ? seleccionados : []);

    cont.innerHTML = opciones.map(op => {
        const isAct = selSet.has(op);
        return `<span class="profile-tag-chip ${isAct ? 'active' : ''}" data-val="${op}">${op}</span>`;
    }).join('');
}

function getPerfilPsicologicoSeleccionado(containerId) {
    const cont = document.getElementById(containerId);
    if (!cont) return [];
    const activeChips = cont.querySelectorAll('.profile-tag-chip.active');
    return Array.from(activeChips).map(c => c.getAttribute('data-val')).filter(Boolean);
}

document.addEventListener('click', (e) => {
    const chip = e.target.closest('.profile-tag-chip');
    if (chip) {
        e.preventDefault();
        chip.classList.toggle('active');
        return;
    }

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

export function crearEntradaHistorial(texto, tipo = 'sistema', autor = null) {
    const now = new Date();
    const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
    let nombreAutor = autor;
    if (!nombreAutor) {
        if (window.usuarioActual) {
            nombreAutor = window.usuarioActual.nombre || window.usuarioActual.email || 'Operador';
        } else {
            nombreAutor = 'Sistema';
        }
    }
    return {
        id: Date.now() + Math.floor(Math.random() * 1000),
        fecha: fechaStr,
        texto: texto,
        autor: nombreAutor,
        tipo: tipo
    };
}
window.crearEntradaHistorial = crearEntradaHistorial;

function renderHistorial() {
    const container = document.getElementById('lista-historial'); 
    if (!container) return;
    container.innerHTML = '';
    if (historialActual.length === 0) { 
        container.innerHTML = '<p style="color:var(--text-muted); font-size:13px; margin:0;">No hay registros en el historial.</p>'; 
        return; 
    }
    const sorted = [...historialActual].sort((a, b) => b.id - a.id);
    sorted.forEach(nota => {
        const textoLimpio = (nota.texto || '').replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
        
        let badgeTipoHtml = '';
        const tipo = (nota.tipo || '').toLowerCase();
        if (tipo === 'agenda') {
            badgeTipoHtml = '<span style="background:rgba(37,107,187,0.12); color:#256bbb; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid rgba(37,107,187,0.25);">✅ Agenda</span>';
        } else if (tipo === 'match') {
            badgeTipoHtml = '<span style="background:rgba(142,68,173,0.12); color:#8e44ad; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid rgba(142,68,173,0.25);">👥 Match</span>';
        } else if (tipo === 'alta') {
            badgeTipoHtml = '<span style="background:rgba(49,163,100,0.12); color:#31a364; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid rgba(49,163,100,0.25);">🚀 Alta</span>';
        } else if (tipo === 'suspension') {
            badgeTipoHtml = '<span style="background:rgba(194,86,59,0.12); color:var(--accent-red); font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid rgba(194,86,59,0.25);">⏸️ Suspensión</span>';
        } else if (tipo === 'informe') {
            badgeTipoHtml = '<span style="background:rgba(0,123,143,0.12); color:var(--accent-teal); font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid rgba(0,123,143,0.25);">📝 Informe</span>';
        } else if (tipo === 'nota') {
            badgeTipoHtml = '<span style="background:#f4ece1; color:#9c6500; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid #e2ceb1;">💬 Nota</span>';
        } else if (tipo === 'sistema') {
            badgeTipoHtml = '<span style="background:rgba(0,0,0,0.06); color:var(--text-muted); font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">⚙️ Sistema</span>';
        }
        
        const autorHtml = nota.autor ? `<span style="color:var(--text-muted); font-size:11px; font-weight:500;">👤 ${nota.autor}</span>` : '';

        container.innerHTML += `
            <div style="background:var(--hover-bg); border:1px solid var(--border-color); padding:12px; border-radius:8px; position:relative; display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding-right:50px;">
                    <span style="font-size:11px; color:var(--text-muted); font-weight:600;">🕒 ${nota.fecha}</span>
                    ${autorHtml ? '<span style="opacity:0.4;">•</span>' + autorHtml : ''}
                    ${badgeTipoHtml}
                </div>
                <div style="font-size:13px; color:var(--text-main); line-height:1.4;">${textoLimpio}</div>
                <div style="position:absolute; top:10px; right:10px; display:flex; gap:5px;">
                    <button type="button" class="btn-editar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.1em;" title="Editar">✏️</button>
                    <button type="button" class="btn-eliminar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.1em;" title="Eliminar">❌</button>
                </div>
            </div>`;
    });
}

async function cargarConfig() { 
    const docSnap = await getDoc(doc(db, "configuracion", "general")); 
    configApp = docSnap.exists() ? { ...defaultCfg, ...docSnap.data() } : defaultCfg; 
}

export function convertirHtmlATextoPlano(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li>/gi, '• ')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function formatearTextoHistorial(historialArr) {
    if (!historialArr || historialArr.length === 0) return 'Sin registros previos.';
    const sorted = [...historialArr].sort((a, b) => a.id - b.id);
    return sorted.map(h => {
        let t = convertirHtmlATextoPlano(h.texto || '');
        return `[${h.fecha}] ${t}`;
    }).filter(Boolean).join('\n');
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
    const rawEst = al.estado_agenda || '';
    const est = rawEst.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    // Estados sin fecha límite activa: no deben calcular urgencias ni aparecer en prioridades
    if (est === 'lista de espera' || est === 'pendiente procesar' || est === 'pre-alta pendiente' || est.includes('suspendida') || est === 'alta finalizada') {
        return null;
    }

    if (est === 'pre-alta iniciada' && al.fecha_inicio_clases) {
        const d = new Date(al.fecha_inicio_clases);
        return isNaN(d.getTime()) ? null : d;
    }

    if (est === 'pendiente validacion por profe' || est === 'pendiente validacion por evaluador' || est === 'pendiente validacion por alumno' || est === 'agenda confirmada') {
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

const getEstadoYBadgeLocal = (al) => getEstadoYBadge(al, getFechaReferenciaAlumno);

function generarFilaAlumno(al, id, vista, isKanban = false) {
    const info = getEstadoYBadgeLocal(al);
    let instArray = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);
    let emojiInst = instArray.length > 0 ? obtenerEmojiInstrumento(instArray[0]) : '🎵';
    let instStr = instArray.join(', ');
    let suscStr = al.tipo_suscripcion || ''; 
    let edad = al.edad ? al.edad + ' años' : '';

    const botonesVisibles = generarBotonesPrincipalesVisibles(al, id);
    const botonesSecundarios = generarBotonesAccion(al, id);

    let datosAlumnoParts = [];
    if (edad) datosAlumnoParts.push(edad);
    if (al.nivel) datosAlumnoParts.push(`<span class="match-student-tag nivel" style="font-size:10px; padding:2px 7px;">${al.nivel}</span>`);
    if (instStr) datosAlumnoParts.push(`<strong style="color:var(--accent-teal); font-weight:600;">${emojiInst} ${instStr}</strong>`);
    if (suscStr) datosAlumnoParts.push(`<strong style="color:var(--accent-purple); font-weight:600;">🧩 ${suscStr}</strong>`);

    let filaDatosHtml = datosAlumnoParts.length > 0
        ? `<div class="row-sub-line" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:12px; color:var(--text-muted);">${datosAlumnoParts.join(' • ')}</div>`
        : '';

    let tagsHtml = '';
    if (Array.isArray(al.perfil_psicologico) && al.perfil_psicologico.length > 0) {
        tagsHtml = `<div class="row-sub-line" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">${al.perfil_psicologico.map(t => `<span class="profile-tag-badge" style="font-size:9.5px; padding:1px 6px;">🧠 ${t}</span>`).join('')}</div>`;
    }

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
            <div class="kanban-card-sub">${edad || '-'} • <strong style="color:var(--accent-teal);">${instStr || 'Sin inst.'}</strong></div>
            ${al.nivel ? `<div style="font-size:11px; margin-top:2px;"><span class="match-student-tag nivel" style="font-size:10px; padding:2px 7px;">${al.nivel}</span></div>` : ''}
            ${tagsHtml}
            ${opcionesKanbanHtml}
            ${info.badgePillHtml ? `<div style="margin-top:6px;">${info.badgePillHtml}</div>` : (info.txtTiempo ? `<div class="priority-text ${info.claseTexto}">${info.txtTiempo}</div>` : '')}
            ${botonesVisibles ? `<div class="row-actions-group" style="margin-top:6px; justify-content:stretch;"><div class="row-quick-btns-col" style="width:100%;">${botonesVisibles}</div></div>` : ''}
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
            ${botonesVisibles ? `<div class="row-quick-btns-col">${botonesVisibles}</div>` : ''}
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
            '2. Pago y Formulario',
            '3. Carga en Sistema',
            '4. Notificar Profe',
            '5. Grupo WhatsApp'
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

    let rowBorderExtra = '';
    if (info.nivelUrgencia === 'vencido') {
        rowBorderExtra = 'border-left: 4.5px solid #ef4444 !important; background: #fffbfb;';
    } else if (info.nivelUrgencia === 'urgente-24') {
        rowBorderExtra = 'border-left: 4.5px solid #f97316 !important; background: #fffdfa;';
    } else if (info.nivelUrgencia === 'urgente-48') {
        rowBorderExtra = 'border-left: 4px solid #eab308 !important;';
    }

    return `
        <div class="swipe-wrapper" data-id="${id}">
            <div class="swipe-bg-actions">
                <button class="swipe-btn left btn-nota-rapida" data-id="${id}">📝 Nota</button>
                <button class="swipe-btn right btn-row-actions-swipe" data-id="${id}">⋮ Acciones</button>
            </div>
            <div class="row-item swipe-content btn-editar-alumno" data-id="${id}" style="${rowBorderExtra}">
                <div class="row-content-wrapper">
                    <div class="row-header">
                        <input type="checkbox" class="bulk-chk" data-id="${id}" onclick="event.stopPropagation(); window.toggleBulkSelection('${id}', this.checked)">
                        <div class="row-indicator ${info.colorIndicador}"></div>
                        <div class="row-main-info" style="display:flex; flex-direction:column; align-items:flex-start; text-align:left; gap:2px;">
                            <div class="row-name" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; text-align:left;">
                                <span style="font-weight:700; color:var(--text-main); font-size:14px;">${al.nombre}</span>
                                ${al.estado_agenda === 'Lista de espera' ? '' : `<span class="status-badge ${info.colorBadge}">${info.txtEstado}</span>`}
                            </div>
                            ${filaDatosHtml}
                            ${tagsHtml}
                        </div>
                    </div>
                    ${dispHtml}
                    ${checklistHtml}
                    <div class="row-meta">
                        <div>${((estadoActualVista && (estadoActualVista.startsWith('Inbox') || estadoActualVista === 'Lista de Espera' || estadoActualVista === 'Dashboard')) || ['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno', 'Agenda confirmada', 'Agenda suspendida', 'Lista de espera'].includes(al.estado_agenda)) ? 'Evaluador' : 'Profe'}: <strong style="color:var(--text-main);" title="${al.reserva_profe_nombre || ''}">${al.reserva_profe_nombre ? (al.reserva_profe_nombre.length > 25 ? al.reserva_profe_nombre.split(' ').slice(0, 3).join(' ') + '...' : al.reserva_profe_nombre) : '-'}</strong></div>
                        ${al.grupo_asignado ? `<div>Grupo: <strong style="color:var(--accent-teal);">${al.grupo_asignado}</strong></div>` : ''}
                        ${fechaMetaHtml}
                        ${info.badgePillHtml ? `<div style="margin-top:4px;">${info.badgePillHtml}</div>` : (info.txtTiempo ? `<div class="priority-text ${info.claseTexto}" style="margin-top:2px;">${info.txtTiempo}</div>` : '')}
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
    mostrarIndicadorCarga(`Suspendiendo ${selectedBulkIds.length} registros...`);
    const now = new Date(); const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
    const idsToSuspend = [...selectedBulkIds];
    for (let id of idsToSuspend) {
        try {
            removerFilaOptimista(id);
            const al = (await getDoc(doc(db, "alumnos", id))).data();
            if (al.id_evento_reserva) await eliminarEventoSeguro(al);
            const hist = al.historial || []; hist.push({ id: Date.now(), texto: `Suspendido masivamente. Motivo: ${motivo}`, fecha: fechaStr });
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda suspendida", motivo_suspension: motivo, reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, historial: hist });
        } catch(e) {}
    }
    selectedBulkIds = [];
    actualizarBulkBar();
    await cargarVista(estadoActualVista);
    ocultarIndicadorCarga();
    alert("✅ Registros suspendidos correctamente.");
});

// =======================================================================
// EXPORTACIÓN Y COPIADO PARA EXCEL / GOOGLE SHEETS (BD Y FACTURACIÓN)
// =======================================================================

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

// =======================================================================
// CARGA MASIVA CSV (LISTA DE ESPERA / INBOX)
// =======================================================================
const btnCargaMasiva = document.getElementById('btn-carga-masiva');
const inputCSV = document.getElementById('input-csv');

if (btnCargaMasiva && inputCSV) {
    btnCargaMasiva.addEventListener('click', () => {
        inputCSV.value = '';
        inputCSV.click();
    });

    inputCSV.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        let existentes = cachedAlumnosData || [];
        if (existentes.length === 0) {
            try {
                const snap = await getDocs(collection(db, "alumnos"));
                existentes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                cachedAlumnosData = existentes;
            } catch(err) {}
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const text = evt.target.result;
                const filas = parseCSV(text);
                const alumnos = procesarFilasCSV(filas, existentes);
                mostrarModalPreviewCSV(alumnos);
            } catch (err) {
                alert("Error al leer el archivo CSV:\n\n" + err.message);
            }
        };
        reader.readAsText(file, "UTF-8");
    });
}

const chkSelectAllCSV = document.getElementById('chk-select-all-csv');
if (chkSelectAllCSV) {
    chkSelectAllCSV.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.chk-csv-row').forEach(c => c.checked = checked);
        const btnConfirmar = document.getElementById('btn-confirmar-importacion-csv');
        const count = document.querySelectorAll('.chk-csv-row:checked').length;
        if (btnConfirmar) btnConfirmar.textContent = `Confirmar Importación (${count})`;
    });
}

document.addEventListener('change', (e) => {
    if (e.target.classList.contains('chk-csv-row')) {
        const total = document.querySelectorAll('.chk-csv-row').length;
        const checked = document.querySelectorAll('.chk-csv-row:checked').length;
        const allChk = document.getElementById('chk-select-all-csv');
        if (allChk) allChk.checked = (total === checked);
        const btnConfirmar = document.getElementById('btn-confirmar-importacion-csv');
        if (btnConfirmar) btnConfirmar.textContent = `Confirmar Importación (${checked})`;
    }
});

const btnConfirmarImportacion = document.getElementById('btn-confirmar-importacion-csv');
if (btnConfirmarImportacion) {
    btnConfirmarImportacion.addEventListener('click', async () => {
        btnConfirmarImportacion.disabled = true;
        const progressBar = document.getElementById('preview-csv-progress-bar');
        const progressFill = document.getElementById('preview-csv-progress-fill');
        const progressText = document.getElementById('preview-csv-progress-text');
        if (progressBar) progressBar.style.display = 'block';

        await ejecutarImportacionMasiva(
            (guardados, total) => {
                const pct = Math.round((guardados / total) * 100);
                if (progressFill) progressFill.style.width = `${pct}%`;
                if (progressText) progressText.textContent = `Importando ${guardados} de ${total} alumnos (${pct}%)...`;
            },
            (guardados, total) => {
                alert(`✅ ¡Carga completada exitosamente!\n\nSe importaron ${guardados} alumnos a Lista de Espera.`);
                document.getElementById('modal-preview-csv-espera').close();
                cargarVista(estadoActualVista);
            }
        );
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
            if (!(await window.confirmar('Advertencias de compatibilidad', '?Forzar la creacion de la propuesta de grupo de todas formas?', 'Forzar Propuesta', 'warning'))) {
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

function renderListaFilas(containerId, datos, estadoId, configNodos) {
    const cont = document.getElementById(containerId);
    const contKanban = document.getElementById('kanban-generico');
    let filtrados = datos;

    const queryStr = (document.getElementById('input-buscador-general').value || '').toLowerCase();
    if (queryStr) { filtrados = filtrados.filter(al => al.nombre.toLowerCase().includes(queryStr)); }

    // Filtro multi-select de instrumentos
    if (filtrosSeleccionados.instrumentos.size > 0) {
        filtrados = filtrados.filter(al => {
            const insts = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);
            return Array.from(filtrosSeleccionados.instrumentos).some(selInst => insts.some(i => i.toLowerCase().includes(selInst.toLowerCase())));
        });
    }

    // Filtro multi-select de niveles
    if (filtrosSeleccionados.niveles.size > 0) {
        filtrados = filtrados.filter(al => {
            const nivelAl = al.nivel || 'Inicial I';
            return Array.from(filtrosSeleccionados.niveles).some(selNiv => nivelAl.toLowerCase().includes(selNiv.toLowerCase()));
        });
    }

    // Filtro multi-select de suscripciones
    if (filtrosSeleccionados.suscripciones.size > 0) {
        filtrados = filtrados.filter(al => {
            const suscAl = (al.tipo_suscripcion || '').toLowerCase();
            return Array.from(filtrosSeleccionados.suscripciones).some(selSusc => {
                const sLow = selSusc.toLowerCase();
                if (sLow.includes('ensamble')) return suscAl.includes('ensamble');
                if (sLow.includes('grup')) return suscAl.includes('grup');
                if (sLow.includes('indiv')) return suscAl.includes('indiv');
                return suscAl.includes(sLow);
            });
        });
    }

    if (filtroAlarmaActual !== 'Todos') {
        filtrados = filtrados.filter(al => {
            const info = getEstadoYBadgeLocal(al);
            if (filtroAlarmaActual === 'Vencidos') return info.nivelUrgencia === 'vencido';
            if (filtroAlarmaActual === 'Criticos') return info.nivelUrgencia === 'urgente-24' || info.nivelUrgencia === 'urgente-48';
            if (filtroAlarmaActual === 'AlDia') return info.nivelUrgencia === 'programado' || info.nivelUrgencia === 'normal';
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

        function obtenerTemaNivel1(clave, criterio) {
            const cLower = (clave || '').toLowerCase();
            if (criterio === 'suscripcion') {
                if (cLower.includes('ensamble')) {
                    return { bg: 'linear-gradient(90deg, #eff6ff 0%, #ffffff 100%)', border: '#2563eb', text: '#1e3a8a', badgeBg: '#2563eb', badgeText: '#ffffff', icon: '🧩', borderBox: '#bfdbfe' };
                }
                if (cLower.includes('indiv')) {
                    return { bg: 'linear-gradient(90deg, #fff7ed 0%, #ffffff 100%)', border: '#ea580c', text: '#9a3412', badgeBg: '#ea580c', badgeText: '#ffffff', icon: '👤', borderBox: '#fed7aa' };
                }
                if (cLower.includes('grup')) {
                    return { bg: 'linear-gradient(90deg, #f0fdfa 0%, #ffffff 100%)', border: '#0d9488', text: '#115e59', badgeBg: '#0d9488', badgeText: '#ffffff', icon: '👥', borderBox: '#99f6e4' };
                }
            }
            if (criterio === 'nivel') {
                if (cLower.includes('inicial 1') || (cLower.includes('inicial i') && !cLower.includes('inicial ii'))) {
                    return { bg: 'linear-gradient(90deg, #f0fdf4 0%, #ffffff 100%)', border: '#16a34a', text: '#14532d', badgeBg: '#16a34a', badgeText: '#ffffff', icon: '🌱', borderBox: '#bbf7d0' };
                }
                if (cLower.includes('inicial 2') || cLower.includes('inicial ii')) {
                    return { bg: 'linear-gradient(90deg, #f7fee7 0%, #ffffff 100%)', border: '#65a30d', text: '#365314', badgeBg: '#65a30d', badgeText: '#ffffff', icon: '🌿', borderBox: '#d9f99d' };
                }
                if (cLower.includes('intermedio')) {
                    return { bg: 'linear-gradient(90deg, #faf5ff 0%, #ffffff 100%)', border: '#9333ea', text: '#581c87', badgeBg: '#9333ea', badgeText: '#ffffff', icon: '⚡', borderBox: '#e9d5ff' };
                }
                if (cLower.includes('avanzado')) {
                    return { bg: 'linear-gradient(90deg, #fff1f2 0%, #ffffff 100%)', border: '#e11d48', text: '#881337', badgeBg: '#e11d48', badgeText: '#ffffff', icon: '🔥', borderBox: '#fecdd3' };
                }
            }
            return { bg: 'linear-gradient(90deg, var(--hover-bg) 0%, #ffffff 100%)', border: 'var(--accent-teal)', text: 'var(--text-main)', badgeBg: 'var(--accent-teal)', badgeText: '#ffffff', icon: '📂', borderBox: 'var(--border-color)' };
        }

        function obtenerClasePillInstrumento(clave) {
            const lower = (clave || '').toLowerCase();
            if (lower.includes('guitarra')) return 'guitarra';
            if (lower.includes('canto')) return 'canto';
            if (lower.includes('bateria') || lower.includes('batería')) return 'bateria';
            if (lower.includes('piano') || lower.includes('teclado')) return 'piano';
            if (lower.includes('bajo')) return 'bajo';
            if (lower.includes('cajon') || lower.includes('cajón')) return 'cajon';
            return '';
        }

        function renderNivelAgrupado(alumnos, nivelIndex) {
            if (nivelIndex >= nivelesActivos.length) {
                return alumnos.map(a => generarFilaAlumno(a, a.id, estadoActualVista)).join('');
            }

            const criterio = nivelesActivos[nivelIndex];
            const grupos = {};

            // Desdoblamiento multi-instrumento: si agrupa por instrumento, el alumno figura en cada uno de ellos
            if (criterio === 'instrumento') {
                alumnos.forEach(al => {
                    const insts = Array.isArray(al.instrumento) && al.instrumento.length > 0 ? al.instrumento : (al.instrumento ? [al.instrumento] : ['Sin Instrumento']);
                    insts.forEach(inst => {
                        const clave = inst.trim() || 'Sin Instrumento';
                        if (!grupos[clave]) grupos[clave] = [];
                        grupos[clave].push(al);
                    });
                });
            } else {
                alumnos.forEach(al => {
                    const clave = obtenerClaveAgrupador(al, criterio);
                    if (!grupos[clave]) grupos[clave] = [];
                    grupos[clave].push(al);
                });
            }

            let outHtml = '';
            const levelNumber = nivelIndex + 1;
            let groupCounter = 0;

            for (const [clave, alumnosSubgrupo] of Object.entries(grupos)) {
                groupCounter++;
                const groupId = `grp-lvl${levelNumber}-${nivelIndex}-${groupCounter}-${Math.random().toString(36).substr(2, 6)}`;
                const idsStr = alumnosSubgrupo.map(a => a.id).join(',');
                const esSinGrupo = clave === 'Sin clasificar' || clave === 'Sin Grupo Asignado' || clave === 'Sin Entrevistador' || clave === 'Sin Profesor';
                
                let actionsHtml = '';
                if (criterio === 'grupo' && !esSinGrupo) {
                    actionsHtml = `
                        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;" onclick="event.stopPropagation();">
                            <button type="button" class="btn-seleccionar-todo-grupo" data-ids="${idsStr}" style="font-size:11px; padding:3px 8px; border:1px solid var(--border-color); border-radius:6px; background:#fff; cursor:pointer; font-weight:600; color:var(--text-muted); font-family:inherit;">☑️ Seleccionar Grupo</button>
                            <button type="button" class="btn-iniciar-prealta-grupo" data-grupo="${clave}" data-ids="${idsStr}" style="font-size:11px; padding:3px 10px; border:none; border-radius:6px; background:var(--accent-teal); color:#fff; cursor:pointer; font-weight:700; font-family:inherit;">⚙️ Iniciar Pre-Alta Grupo</button>
                        </div>`;
                }

                if (levelNumber === 1) {
                    const tema = obtenerTemaNivel1(clave, criterio);
                    outHtml += `
                        <div class="group-card-l1" style="border-color:${tema.borderBox};">
                            <div class="group-banner-l1" style="background:${tema.bg}; border-left:6px solid ${tema.border}; color:${tema.text};" onclick="window.toggleGroupCollapsible('${groupId}-content', '${groupId}-icon')" title="Clic para desplegar u ocultar">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span id="${groupId}-icon" style="font-size:12px; transition:transform 0.2s;">▼</span>
                                    <span style="font-size:18px;">${tema.icon}</span>
                                    <span style="font-size:15px; font-weight:800; letter-spacing:-0.01em;">${clave.toUpperCase()}</span>
                                    <span style="background:${tema.badgeBg}; color:${tema.badgeText}; font-size:11.5px; font-weight:700; padding:2px 8px; border-radius:12px;">${alumnosSubgrupo.length} alumnos</span>
                                </div>
                                ${actionsHtml}
                            </div>
                            <div id="${groupId}-content" style="padding:10px 14px; display:flex; flex-direction:column; gap:8px;">
                                ${renderNivelAgrupado(alumnosSubgrupo, nivelIndex + 1)}
                            </div>
                        </div>
                    `;
                } else if (levelNumber === 2) {
                    let badgeCls = 'inicial-1';
                    let iconNivel = '📁';
                    const cLow = (clave || '').toLowerCase();
                    if (cLow.includes('inicial 1') || (cLow.includes('inicial i') && !cLow.includes('inicial ii'))) { badgeCls = 'inicial-1'; iconNivel = '🌱'; }
                    else if (cLow.includes('inicial 2') || cLow.includes('inicial ii')) { badgeCls = 'inicial-2'; iconNivel = '🌿'; }
                    else if (cLow.includes('intermedio')) { badgeCls = 'intermedio'; iconNivel = '⚡'; }
                    else if (cLow.includes('avanzado')) { badgeCls = 'avanzado'; iconNivel = '🔥'; }

                    outHtml += `
                        <div class="group-card-l2">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; cursor:pointer; user-select:none;" onclick="window.toggleGroupCollapsible('${groupId}-content', '${groupId}-icon')">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span id="${groupId}-icon" style="font-size:10px; color:#64748b; transition:transform 0.2s;">▼</span>
                                    <span class="badge-nivel ${badgeCls}">${iconNivel} ${criterio === 'nivel' ? 'Nivel: ' : ''}${clave}</span>
                                    <span style="color:#64748b; font-size:12px; font-weight:600;">(${alumnosSubgrupo.length} alumnos)</span>
                                </div>
                                ${actionsHtml}
                            </div>
                            <div id="${groupId}-content" style="display:flex; flex-direction:column; gap:6px;">
                                ${renderNivelAgrupado(alumnosSubgrupo, nivelIndex + 1)}
                            </div>
                        </div>
                    `;
                } else {
                    const pillCls = obtenerClasePillInstrumento(clave);
                    const emoji = obtenerEmojiInstrumento(clave);
                    outHtml += `
                        <div style="margin-left:6px; margin-top:4px; margin-bottom:4px;">
                            <div class="pill-instrumento ${pillCls}" style="cursor:pointer; user-select:none;" onclick="window.toggleGroupCollapsible('${groupId}-content', '${groupId}-icon')">
                                <span id="${groupId}-icon" style="font-size:9px; color:#64748b; margin-right:2px; transition:transform 0.2s;">▼</span>
                                <span>${emoji} ${clave}</span>
                                <span style="background:#f1f5f9; color:#475569; font-size:10.5px; padding:1px 6px; border-radius:8px;">${alumnosSubgrupo.length}</span>
                            </div>
                            <div id="${groupId}-content" style="display:flex; flex-direction:column; gap:4px;">
                                ${renderNivelAgrupado(alumnosSubgrupo, nivelIndex + 1)}
                            </div>
                        </div>
                    `;
                }
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

export function filtrarAlumnosEvaluador(alumnos) {
    const u = window.usuarioActual;
    if (!u) return alumnos;
    const profId = u.profesor_id || '';
    const profNom = (u.nombre || '').toLowerCase().trim();
    const userNomPartes = profNom.split(/\s+/).filter(Boolean);

    return alumnos.filter(al => {
        if (profId && (al.reserva_profe_id === profId || al.profesor_id === profId)) return true;
        
        const alProfeNom = (al.reserva_profe_nombre || al.profesor_asignado || '').toLowerCase().trim();
        if (profNom && alProfeNom) {
            if (alProfeNom === profNom) return true;
            if (userNomPartes.length > 0 && userNomPartes.some(p => p.length >= 3 && alProfeNom.includes(p))) return true;
            if (alProfeNom.length >= 3 && profNom.includes(alProfeNom)) return true;
        }
        return false;
    });
}

// =======================================================================
// PRIORIDADES / PRÓXIMOS A VENCER (DASHBOARD)
// =======================================================================
window.filtroPrioTabActual = window.filtroPrioTabActual || 'todos';

window.setFiltroPrioridadDashboard = function(tipo) {
    window.filtroPrioTabActual = tipo;
    if (window.cachedPoolUrgenciasDashboard) {
        renderDashboardPrioridades(window.cachedPoolUrgenciasDashboard, 'Dashboard');
    }
};

function renderDashboardPrioridades(poolAlumnos, vista) {
    window.cachedPoolUrgenciasDashboard = poolAlumnos;
    const cont = document.getElementById('resumen-urgencias');
    if (!cont) return;

    let todasPrio = [];
    poolAlumnos.forEach(al => {
        let dateToEval = getFechaReferenciaAlumno(al);
        if (dateToEval && !isNaN(dateToEval.getTime())) {
            let diffHs = (dateToEval - new Date()) / (1000 * 60 * 60);
            if (diffHs <= 48) {
                const info = getEstadoYBadgeLocal(al);
                todasPrio.push({ al, info, diffHs, dateToEval });
            }
        }
    });

    // Ordenar de mayor urgencia a menor: Vencidas más antiguas primero, luego las más próximas
    todasPrio.sort((a, b) => a.dateToEval - b.dateToEval);

    const vencidas = todasPrio.filter(p => p.diffHs < 0);
    const urgentes24 = todasPrio.filter(p => p.diffHs >= 0 && p.diffHs <= 24);
    const proximas48 = todasPrio.filter(p => p.diffHs > 24 && p.diffHs <= 48);

    // Actualizar contadores en los botones
    const elCntTodos = document.getElementById('cnt-prio-todos');
    const elCntVenc = document.getElementById('cnt-prio-vencidos');
    const elCntUrg = document.getElementById('cnt-prio-urgentes');
    const elCntProx = document.getElementById('cnt-prio-proximos');
    const elBadgeTot = document.getElementById('badge-total-urgencias');

    if (elCntTodos) elCntTodos.textContent = todasPrio.length;
    if (elCntVenc) elCntVenc.textContent = vencidas.length;
    if (elCntUrg) elCntUrg.textContent = urgentes24.length;
    if (elCntProx) elCntProx.textContent = proximas48.length;
    if (elBadgeTot) elBadgeTot.textContent = todasPrio.length;

    // Actualizar estados activos de los botones de filtro
    document.querySelectorAll('.btn-prio-filtro').forEach(btn => {
        const prio = btn.getAttribute('data-prio');
        const isActive = prio === window.filtroPrioTabActual;
        btn.classList.toggle('active', isActive);
    });

    if (todasPrio.length === 0) {
        cont.innerHTML = '<div style="color:var(--text-muted); padding:16px; text-align:center; font-weight:600; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">✨ ¡Al día! No hay entrevistas ni tareas urgentes o vencidas en las próximas 48 hs.</div>';
        return;
    }

    let itemsAMostrar = [];
    if (window.filtroPrioTabActual === 'vencidos') {
        itemsAMostrar = vencidas;
    } else if (window.filtroPrioTabActual === 'urgentes') {
        itemsAMostrar = urgentes24;
    } else if (window.filtroPrioTabActual === 'proximos') {
        itemsAMostrar = proximas48;
    } else {
        itemsAMostrar = todasPrio;
    }

    if (itemsAMostrar.length === 0) {
        cont.innerHTML = `<div style="color:var(--text-muted); padding:16px; text-align:center; font-weight:600; background:#fff; border-radius:10px; border:1px dashed #cbd5e1;">No hay registros en esta categoría de prioridad (${window.filtroPrioTabActual}).</div>`;
        return;
    }

    let html = '';
    if (window.filtroPrioTabActual === 'todos') {
        if (vencidas.length > 0) {
            html += `
                <div style="display:flex; align-items:center; gap:8px; margin:4px 0 2px 0; font-size:12px; font-weight:800; color:#991b1b; text-transform:uppercase; letter-spacing:0.04em;">
                    <span>⚠️ Vencidas — Requiere Acción Inmediata (${vencidas.length})</span>
                    <div style="flex:1; height:1.5px; background:#fecaca;"></div>
                </div>
            `;
            html += vencidas.map(p => generarFilaAlumno(p.al, p.al.id, vista)).join('');
        }
        if (urgentes24.length > 0) {
            html += `
                <div style="display:flex; align-items:center; gap:8px; margin:14px 0 2px 0; font-size:12px; font-weight:800; color:#9a3412; text-transform:uppercase; letter-spacing:0.04em;">
                    <span>🔥 Próximas a Vencer — Menos de 24 hs (${urgentes24.length})</span>
                    <div style="flex:1; height:1.5px; background:#fed7aa;"></div>
                </div>
            `;
            html += urgentes24.map(p => generarFilaAlumno(p.al, p.al.id, vista)).join('');
        }
        if (proximas48.length > 0) {
            html += `
                <div style="display:flex; align-items:center; gap:8px; margin:14px 0 2px 0; font-size:12px; font-weight:800; color:#854d0e; text-transform:uppercase; letter-spacing:0.04em;">
                    <span>⏳ Próximas 24 a 48 hs (${proximas48.length})</span>
                    <div style="flex:1; height:1.5px; background:#fef08a;"></div>
                </div>
            `;
            html += proximas48.map(p => generarFilaAlumno(p.al, p.al.id, vista)).join('');
        }
    } else {
        html = itemsAMostrar.map(p => generarFilaAlumno(p.al, p.al.id, vista)).join('');
    }

    cont.innerHTML = html;
}

function getModuloSubtabs() {
    const u = window.usuarioActual || {};
    const rol = u.rol || 'admisiones';

    let inboxTabs = [];
    if (rol === 'evaluador') {
        inboxTabs = [
            { 
                vista: 'Inbox - Validar Evaluador', 
                label: 'Pendientes Validar Fecha', 
                icon: '⏳', 
                countFn: (alumnos) => filtrarAlumnosEvaluador(alumnos).filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente validacion por profe' || st === 'pendiente validacion por evaluador';
                }).length 
            },
            { 
                vista: 'Inbox - Finalizar Admision', 
                label: 'Pendientes Finalizar Admisión', 
                icon: '🏁', 
                countFn: (alumnos) => filtrarAlumnosEvaluador(alumnos).filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'agenda confirmada' || st === 'entrevista confirmada';
                }).length 
            }
        ];
    } else if (rol === 'admisiones' || rol === 'admisor') {
        inboxTabs = [
            { 
                vista: 'Inbox - Pendientes', 
                label: 'Sin Agendar', 
                icon: '⏳', 
                countFn: (alumnos) => alumnos.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente procesar' || st === 'sin agendar';
                }).length 
            },
            { 
                vista: 'Inbox - Validar Alumno', 
                label: 'Validar por Alumno', 
                icon: '🧑‍🎓', 
                countFn: (alumnos) => alumnos.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente validacion por alumno';
                }).length 
            },
            { 
                vista: 'Inbox - Altas Pendientes', 
                label: 'Altas Pendientes de Acción', 
                icon: '🚀', 
                countFn: (alumnos) => alumnos.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pre-alta pendiente' || st === 'pre-alta iniciada' || ((st === 'alta efectiva' || st === 'alta ilegal') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5));
                }).length 
            }
        ];
    } else {
        // Admin: Todos los subtabs
        inboxTabs = [
            { 
                vista: 'Inbox - Pendientes', 
                label: 'Sin Agendar', 
                icon: '⏳', 
                countFn: (alumnos) => alumnos.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente procesar' || st === 'sin agendar';
                }).length 
            },
            { 
                vista: 'Inbox - Validar Evaluador', 
                label: 'Validar Evaluador', 
                icon: '👨‍🏫', 
                countFn: (alumnos) => alumnos.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente validacion por profe' || st === 'pendiente validacion por evaluador';
                }).length 
            },
            { 
                vista: 'Inbox - Validar Alumno', 
                label: 'Validar Alumno', 
                icon: '🧑‍🎓', 
                countFn: (alumnos) => alumnos.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente validacion por alumno';
                }).length 
            },
            { 
                vista: 'Inbox - Confirmadas', 
                label: 'Confirmadas', 
                icon: '✅', 
                countFn: (alumnos) => alumnos.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'agenda confirmada' || st === 'entrevista confirmada';
                }).length 
            },
            { 
                vista: 'Inbox - Altas Pendientes', 
                label: 'Altas Pendientes', 
                icon: '🚀', 
                countFn: (alumnos) => alumnos.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pre-alta pendiente' || st === 'pre-alta iniciada' || ((st === 'alta efectiva' || st === 'alta ilegal') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5));
                }).length 
            },
            { 
                vista: 'Inbox - Suspendidas', 
                label: 'Suspendidas', 
                icon: '⏸️', 
                countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === 'agenda suspendida').length 
            }
        ];
    }

    return {
        'Inbox': inboxTabs,
        'Altas': [
            { vista: 'Altas - Pendientes', label: 'Pendientes', icon: '📝', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'pre-alta pendiente').length },
            { vista: 'Altas - En Curso', label: 'En Curso', icon: '🚀', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'pre-alta iniciada').length },
            { vista: 'Altas - Confirmadas', label: 'Confirmadas', icon: '⚠️', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda === 'Alta Efectiva' || d.estado_agenda === 'Alta Ilegal') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5)).length },
            { vista: 'Altas - Finalizadas', label: 'Finalizadas', icon: '🏆', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda === 'Alta Efectiva' || d.estado_agenda === 'Alta Ilegal' || d.estado_agenda === 'Alta Finalizada') && (d.checklist_alta && d.checklist_alta.filter(Boolean).length === 5)).length },
            { vista: 'Altas - Suspendidas', label: 'Suspendidas', icon: '❌', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'alta suspendida').length }
        ],
        'Match': [
            { vista: 'Match - Pendientes', label: 'Crear Grupos / Match', icon: '🔍', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'lista de espera').length },
            { vista: 'Match - Solicitudes Profes', label: 'Solicitudes Profes', icon: '🔔', countFn: () => cachedSolicitudesVacantesCount, className: 'tab-badge-solicitudes' },
            { vista: 'Match - En Validacion', label: 'Grupos en Validación', icon: '👥', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'validando grupo').length },
            { vista: 'Ajustes Match', label: 'Reglas y Tolerancias', icon: '⚙️' }
        ]
    };
}

let cachedAlumnosData = [];
let cachedSolicitudesVacantesCount = 0;

async function refrescarConteoVacantes() {
    try {
        const solSnap = await getDocs(collection(db, "solicitudes_vacantes"));
        let count = 0;
        solSnap.forEach(d => {
            const data = d.data();
            if (data.estado === 'Pendiente' || !data.estado) count++;
        });
        cachedSolicitudesVacantesCount = count;
        const bSol = document.querySelector('.tab-badge-solicitudes');
        if (bSol) {
            bSol.textContent = count;
        }
    } catch(e) {}
}

function actualizarBadgesYNavegacion(allData) {
    if (Array.isArray(allData)) cachedAlumnosData = allData;
    const datos = cachedAlumnosData || [];
    refrescarConteoVacantes();
    
    const u = window.usuarioActual || {};
    const rol = u.rol || 'admisiones';

    // Conteo Inbox según rol
    let countInbox = 0;
    if (rol === 'evaluador') {
        countInbox = filtrarAlumnosEvaluador(datos).filter(d => {
            const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return st === 'pendiente validacion por profe' || st === 'pendiente validacion por evaluador' || st === 'agenda confirmada' || st === 'entrevista confirmada';
        }).length;
    } else {
        countInbox = datos.filter(d => {
            const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return st === 'pendiente procesar' || st === 'sin agendar';
        }).length;
    }

    const bInbox = document.getElementById('badge-inbox');
    if (bInbox) {
        bInbox.textContent = countInbox;
        bInbox.style.display = countInbox > 0 ? 'inline-block' : 'none';
    }

    // Conteo Lista de Espera
    const countEspera = datos.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === 'lista de espera').length;
    const bEspera = document.getElementById('badge-espera');
    if (bEspera) {
        bEspera.textContent = countEspera;
        bEspera.style.display = countEspera > 0 ? 'inline-block' : 'none';
    }

    // Conteo Match (Grupos en validación o candidatos)
    const countMatchVal = datos.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === 'validando grupo').length;
    const bMatch = document.getElementById('badge-match');
    if (bMatch) {
        const txtBadge = countMatchVal > 0 ? countMatchVal : (countEspera > 0 ? countEspera : 0);
        bMatch.textContent = txtBadge;
        bMatch.style.display = txtBadge > 0 ? 'inline-block' : 'none';
    }

    // Conteo Altas (Pendientes)
    const countAltas = datos.filter(d => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'pre-alta pendiente';
    }).length;
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

    const subtabsDict = getModuloSubtabs();
    if (!modulo || !subtabsDict[modulo]) {
        container.style.display = 'none';
        bar.innerHTML = '';
        return;
    }

    const tabs = subtabsDict[modulo];
    const datos = cachedAlumnosData || [];

    bar.innerHTML = tabs.map(tab => {
        const isActive = tab.vista === vista;
        let badgeHtml = '';
        if (tab.countFn) {
            const cnt = tab.countFn(datos);
            badgeHtml = `<span class="tab-badge ${tab.className || ''}">${cnt}</span>`;
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

export function verificarPermisoModulo(moduloDestino) {
    if (!window.usuarioActual) return true;
    if (window.usuarioActual.rol === 'admin') return true;
    const mods = window.usuarioActual.modulos_habilitados || [];
    return mods.includes(moduloDestino);
}

export function configurarSidebarPorPermisos() {
    const usuario = window.usuarioActual || {};
    const rolesArr = Array.isArray(usuario.roles) && usuario.roles.length > 0 ? usuario.roles : [usuario.rol || 'admisiones'];
    const rol = usuario.rol || rolesArr[0] || 'admisiones';
    const mods = usuario.modulos_habilitados || [];

    const esAdmin = rolesArr.includes('admin');
    const esProfesor = rolesArr.includes('profesor');

    const navProfe = document.getElementById('nav-item-portal-profe');
    if (navProfe) {
        navProfe.style.display = (esProfesor || mods.includes('portal_profesor') || esAdmin) ? 'flex' : 'none';
    }

    const bottomNavProfe = document.getElementById('bottom-nav-portal-profe');
    if (bottomNavProfe) {
        bottomNavProfe.style.display = (esProfesor || mods.includes('portal_profesor') || esAdmin) ? 'flex' : 'none';
    }

    const btnNuevoAlumno = document.getElementById('btn-nuevo-alumno');
    if (btnNuevoAlumno) {
        const puedeCrear = esAdmin || rolesArr.includes('admisiones') || rolesArr.includes('admisor');
        btnNuevoAlumno.style.display = puedeCrear ? 'block' : 'none';
    }

    const modIdMap = {
        'Dashboard': 'dashboard',
        'Inbox': 'inbox',
        'Lista de Espera': 'espera',
        'Match': 'match',
        'Altas': 'altas',
        'Estadísticas': 'metricas',
        'Configuración': 'configuracion'
    };

    // Sidebar items (Escritorio / Menú Desplegable)
    document.querySelectorAll('#sidebar .nav-item, #sidebar .nav-item-small').forEach(item => {
        const mod = item.getAttribute('data-modulo');
        if (!mod) return;
        if (item.id === 'nav-item-portal-profe') return;
        
        let permitido = false;
        if (esAdmin) {
            permitido = true;
        } else if (rolesArr.length === 1 && rolesArr[0] === 'profesor') {
            permitido = (mod === 'portal_profesor');
        } else {
            const idBuscado = modIdMap[mod] || mod.toLowerCase();
            permitido = mods.includes(idBuscado);
        }

        item.style.display = permitido ? 'flex' : 'none';
    });

    // Bottom nav items (Barra inferior Móvil)
    document.querySelectorAll('#bottom-nav .bottom-nav-item').forEach(item => {
        if (item.id === 'btn-bottom-menu') {
            item.style.display = 'flex';
            return;
        }
        if (item.id === 'bottom-nav-portal-profe') return;

        const mod = item.getAttribute('data-modulo');
        if (!mod) return;

        let permitido = false;
        if (esAdmin) {
            permitido = true;
        } else if (rolesArr.length === 1 && rolesArr[0] === 'profesor') {
            permitido = false;
        } else {
            const idBuscado = modIdMap[mod] || mod.toLowerCase();
            permitido = mods.includes(idBuscado);
        }

        item.style.display = permitido ? 'flex' : 'none';
    });
}

async function cargarVista(vista) {
    window.cargarVistaGlobal = cargarVista;

    const usuario = window.usuarioActual || {};
    const roles = Array.isArray(usuario.roles) && usuario.roles.length > 0 ? usuario.roles : [usuario.rol || 'admisiones'];
    const esSoloEvaluador = roles.includes('evaluador') && !roles.includes('admin') && !roles.includes('admisiones') && !roles.includes('admisor');
    
    // Si un evaluador intenta acceder a Inbox genérico o a Inbox - Pendientes, redirigir a su vista primaria
    if (esSoloEvaluador && (vista === 'Inbox' || vista === 'Inbox - Pendientes')) {
        vista = 'Inbox - Validar Evaluador';
    }

    estadoActualVista = vista; 
    
    let modulo = null;
    if (vista.startsWith('Inbox')) modulo = 'Inbox';
    else if (vista.startsWith('Altas')) modulo = 'Altas';
    else if (vista.startsWith('Match') || vista === 'Ajustes Match') modulo = 'Match';
    else if (vista === 'Lista de Espera') modulo = 'Lista de Espera';
    else if (vista === 'Dashboard') modulo = 'Dashboard';
    else if (vista === 'Estadísticas') modulo = 'Estadísticas';
    else if (vista.startsWith('Configuración') || vista.startsWith('Ajustes') || vista.startsWith('ABM')) modulo = 'Configuración';
    else if (vista === 'Mis Grupos & Solicitud de Alumnos') modulo = 'portal_profesor';

    // Route Guard RBAC
    const modIdMap = {
        'Dashboard': 'dashboard',
        'Inbox': 'inbox',
        'Lista de Espera': 'espera',
        'Match': 'match',
        'Altas': 'altas',
        'Estadísticas': 'metricas',
        'Configuración': 'configuracion',
        'portal_profesor': 'portal_profesor'
    };
    const modId = modIdMap[modulo] || modulo;
    if (modId && !verificarPermisoModulo(modId)) {
        alert(`⛔ No tienes permiso para acceder al módulo "${modulo || vista}".`);
        if (window.usuarioActual && window.usuarioActual.rol === 'profesor') {
            return cargarVista('Mis Grupos & Solicitud de Alumnos');
        }
        return cargarVista('Dashboard');
    }

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
        const tituloMap = {
            'Inbox - Validar Evaluador': '<span style="color:var(--text-muted); font-weight:500;">Inbox › </span><span style="color:var(--text-main); font-weight:700;">Pendientes Validar Fecha</span>',
            'Inbox - Finalizar Admision': '<span style="color:var(--text-muted); font-weight:500;">Inbox › </span><span style="color:var(--text-main); font-weight:700;">Pendientes Finalizar Admisión</span>',
            'Inbox - Validar Alumno': '<span style="color:var(--text-muted); font-weight:500;">Inbox › </span><span style="color:var(--text-main); font-weight:700;">Validar por Alumno</span>',
            'Inbox - Altas Pendientes': '<span style="color:var(--text-muted); font-weight:500;">Inbox › </span><span style="color:var(--text-main); font-weight:700;">Altas Pendientes</span>',
            'Inbox - Pendientes': '<span style="color:var(--text-muted); font-weight:500;">Inbox › </span><span style="color:var(--text-main); font-weight:700;">Sin Agendar</span>'
        };

        if (tituloMap[vista]) {
            tituloEl.innerHTML = tituloMap[vista];
        } else if (vista.includes('-')) {
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
    
    // Ocultar botones CSV de toda la app
    const btnCSVEl = document.getElementById('btn-carga-masiva');
    if (btnCSVEl) btnCSVEl.style.display = 'none';
    
    document.getElementById('search-container-general').style.display = 'none'; 
    document.getElementById('alarm-filters').style.display = 'none';
    vResumen.style.display = 'none'; if(vResumenTime) vResumenTime.style.display = 'none'; contLista.style.display = 'none'; if(contKanban) contKanban.style.display = 'none'; contEstad.style.display = 'none'; cv.style.display = 'none';
    const contMatch = document.getElementById('match-pendientes-container'); if(contMatch) contMatch.style.display = 'none';

    const esVistaConLista = vista.startsWith('Inbox') || vista.startsWith('Altas') || vista === 'Lista de Espera';

    if (esVistaConLista) { 
        cv.style.display = 'flex'; 
        renderFiltrosChips(); 
        document.getElementById('search-container-general').style.display = 'block'; 
        mostrarSkeleton('lista-generica', 6);

        if (vista === 'Inbox - Confirmadas' || vista === 'Altas - Confirmadas') document.getElementById('alarm-filters').style.display = 'flex';
    }
    
    if (vista === 'Dashboard') {
        document.getElementById('search-container-general').style.display = 'block'; vResumen.style.display = 'flex'; if(vResumenTime) vResumenTime.style.display = 'flex'; cv.style.display = 'none';
        document.getElementById('alarm-filters').style.display = 'none';
        
        const trayContainer = document.getElementById('timeline-tray-container');
        if (trayContainer) trayContainer.style.display = 'none';

        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            
            const roles = Array.isArray(window.usuarioActual?.roles) && window.usuarioActual.roles.length > 0
                ? window.usuarioActual.roles
                : [window.usuarioActual?.rol || 'admisor'];
            const esEvaluador = roles.includes('evaluador');
            const esSoloEval = esEvaluador && !roles.includes('admin') && !roles.includes('admisiones') && !roles.includes('admisor') && !roles.includes('coordinador_grupos');
            const esCoordinador = roles.includes('coordinador_grupos') || roles.includes('coordinador');
            const esSoloCoordinador = esCoordinador && !roles.includes('admin') && !roles.includes('admisiones') && !roles.includes('admisor');

            let poolUrgencias = allData;
            if (esSoloEval) {
                poolUrgencias = filtrarAlumnosEvaluador(allData);
            } else if (esSoloCoordinador) {
                poolUrgencias = allData.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return ['lista de espera', 'validando grupo', 'pre-alta pendiente', 'pre-alta iniciada', 'alta efectiva', 'alta ilegal', 'alta finalizada'].includes(st);
                });
            }
            renderDashboardPrioridades(poolUrgencias, vista);
            
            let nodosDashboard = configNodosFlujo;
            let datosDashboard = allData;
            
            if (esSoloEval) {
                nodosDashboard = configNodosFlujoEvaluador;
                datosDashboard = filtrarAlumnosEvaluador(allData);
            } else if (esSoloCoordinador) {
                nodosDashboard = configNodosFlujoCoordinador;
                datosDashboard = allData.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return ['lista de espera', 'validando grupo', 'pre-alta pendiente', 'pre-alta iniciada', 'alta efectiva', 'alta ilegal', 'alta finalizada'].includes(st);
                });
            }
            
            renderTimelineUnificado('timeline-unificado', nodosDashboard, datosDashboard, { generarBotonesPrincipalesVisibles, generarBotonesAccion });
            
            document.getElementById('dashboard-flow-chart-container').style.display = 'block';
            let flowLabels = nodosDashboard.map(n => n.label);
            let flowData = nodosDashboard.map(n => datosDashboard.filter(d => n.filterFn ? n.filterFn(d) : d.estado_agenda === n.id).length);
            let phaseColors = nodosDashboard.map(n => n.hexColor || '#1f5491');
            
            if(chartFlowDashboardInst) chartFlowDashboardInst.destroy();
            chartFlowDashboardInst = new Chart(document.getElementById('chartFlowDashboard'), { 
                type: 'bar', 
                data: { labels: flowLabels, datasets: [{ label: 'Alumnos', data: flowData, backgroundColor: phaseColors, borderRadius: 6 }] },
                options: { 
                    onClick: (evt, elements) => {
                        if (elements && elements.length > 0) {
                            const index = elements[0].index;
                            const nodo = nodosDashboard[index];
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
    } else if (vista.startsWith('Inbox') || vista === 'Altas - Pendientes' || vista === 'Altas - En Curso') {
        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            
            const roles = Array.isArray(window.usuarioActual?.roles) && window.usuarioActual.roles.length > 0
                ? window.usuarioActual.roles
                : [window.usuarioActual?.rol || 'admisiones'];
            const esEvaluador = roles.includes('evaluador');
            const esSoloEval = esEvaluador && !roles.includes('admin') && !roles.includes('admisiones') && !roles.includes('admisor');
            
            let dataFiltrada = [];

            if (vista === 'Inbox - Pendientes') {
                if (esSoloEval) {
                    dataFiltrada = [];
                } else {
                    dataFiltrada = allData.filter(d => {
                        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                        return st === 'pendiente procesar' || st === 'sin agendar';
                    });
                }
            } else if (vista === 'Inbox - Validar Evaluador') {
                const fuente = esEvaluador ? filtrarAlumnosEvaluador(allData) : allData;
                dataFiltrada = fuente.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente validacion por profe' || st === 'pendiente validacion por evaluador';
                });
            } else if (vista === 'Inbox - Validar Alumno') {
                dataFiltrada = allData.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente validacion por alumno';
                });
            } else if (vista === 'Inbox - Finalizar Admision' || vista === 'Inbox - Confirmadas') {
                const fuente = esEvaluador ? filtrarAlumnosEvaluador(allData) : allData;
                dataFiltrada = fuente.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'agenda confirmada' || st === 'entrevista confirmada' || ['entrevista agendada', 'entrevista realizada', 'entrevista reprogramada'].includes(st);
                });
            } else if (vista === 'Inbox - Altas Pendientes') {
                dataFiltrada = allData.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pre-alta pendiente' || st === 'pre-alta iniciada' || ((st === 'alta efectiva' || st === 'alta ilegal') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5));
                });
            } else if (vista === 'Inbox - En Validacion') {
                const fuente = (rol === 'evaluador') ? filtrarAlumnosEvaluador(allData) : allData;
                dataFiltrada = fuente.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente validacion por profe' || st === 'pendiente validacion por evaluador' || st === 'pendiente validacion por alumno';
                });
            } else if (vista === 'Inbox - Suspendidas') {
                dataFiltrada = allData.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === 'agenda suspendida');
            } else if (vista === 'Altas - Pendientes') {
                dataFiltrada = allData.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === 'pre-alta pendiente');
            } else if (vista === 'Altas - En Curso') {
                dataFiltrada = allData.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === 'pre-alta iniciada');
            }
            renderListaFilas('lista-generica', dataFiltrada, 'all', null);
        } catch(e) {}
    } else if (vista === 'Lista de Espera') {
        try {
            if (!agrupadoresEsperaInicializados) {
                agrupadorNivel1 = 'suscripcion';
                agrupadorNivel2 = 'nivel';
                const s1 = document.getElementById('select-agrupador-1');
                const s2 = document.getElementById('select-agrupador-2');
                if (s1) s1.value = 'suscripcion';
                if (s2) s2.value = 'nivel';
                agrupadoresEsperaInicializados = true;
            }
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            let dataFiltrada = allData.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'lista de espera');
            renderListaFilas('lista-generica', dataFiltrada, 'all', null);
        } catch(e) {}
    } else if (vista === 'Inbox - Confirmadas' || vista === 'Altas - Confirmadas') {
        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            
            let dataFiltrada = [];
            if (vista === 'Inbox - Confirmadas') {
                dataFiltrada = allData.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                    return st === 'agenda confirmada' || ['entrevista agendada', 'entrevista realizada', 'entrevista reprogramada'].includes(st);
                });
            } else if (vista === 'Altas - Confirmadas') {
                dataFiltrada = allData.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                    return (st === 'alta efectiva' || st === 'alta ilegal') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5);
                });
            }
            renderListaFilas('lista-generica', dataFiltrada, 'all', null);
        } catch(e) {}
    } else if (vista === 'Altas - Finalizadas') {
        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            let dataFiltrada = allData.filter(d => {
                const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                return (st === 'alta efectiva' || st === 'alta ilegal' || st === 'alta finalizada') && (d.checklist_alta && d.checklist_alta.filter(Boolean).length === 5);
            });
            renderListaFilas('lista-generica', dataFiltrada, 'all', null);
        } catch(e) {}
    } else if (vista === 'Inbox - Suspendidas' || vista === 'Altas - Suspendidas') {
        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            
            const targetState = vista === 'Inbox - Suspendidas' ? 'agenda suspendida' : 'alta suspendida';
            let dataFiltrada = allData.filter(d => {
                const normState = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                return normState === targetState;
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
    } else if (vista === 'Match - Solicitudes Profes') {
        contLista.style.display = 'flex';
        try { 
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = [];
            qSnap.forEach(d => allData.push({ id: d.id, ...d.data() }));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
        } catch(e) {}
        await renderMatchSolicitudesProfes(contLista, configApp, { setBotonCargando });
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
    } else if (vista === 'Mis Grupos & Solicitud de Alumnos') {
        contLista.style.display = 'flex';
        await renderPortalProfesor(contLista, window.usuarioActual, { setBotonCargando });
    } else if (vista === 'Estadísticas') { contEstad.style.display = 'flex'; renderCharts({ cargarVista });
    } else if (vista === 'Configuración') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfigHub(contLista, { cargarVista });
    } else if (vista === 'Ajustes Generales') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfig(contLista, configApp, { setBotonCargando, cargarConfig });
    } else if (vista === 'Ajustes Match') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfigMatch(contLista, configApp, { setBotonCargando, cargarConfig });
    } else if (vista.startsWith('ABM')) { contLista.style.display = 'flex'; contLista.innerHTML = ''; const colMap = { 'ABM-Profesores': 'profesores', 'ABM-Instrumentos': 'instrumentos', 'ABM-Suscripciones': 'tipos_suscripcion', 'ABM-Usuarios': 'usuarios_sistema' }; cargarABM(colMap[vista] || vista.split('-')[1].toLowerCase(), vista.split('-')[1], contLista); }
}

async function renderMatchPendientes() {
    document.getElementById('vista-titulo').innerHTML = '<span style="color:var(--text-muted); font-weight:500;">Match › </span><span style="color:var(--text-main); font-weight:700;">Pendientes</span>';
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
        initMatchFormListeners(cfgMin, cfgMax, { setBotonCargando, syncSelectToChips, cargarVista });
    }
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


const ROLES_MODULOS_DEFAULT = {
    admin: ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas', 'portal_profesor', 'configuracion', 'permisos'],
    admisor: ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas'],
    admisiones: ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas'],
    coordinador_grupos: ['dashboard', 'espera', 'match', 'match_etapa4', 'altas'],
    evaluador: ['dashboard', 'inbox'],
    profesor: ['portal_profesor'],
    personalizado: []
};

onAuthStateChanged(auth, async (user) => { 
    if (user) { 
        try {
            const qSnap = await getDocs(collection(db, "usuarios_sistema")); 
            let usuarioEncontrado = null;
            if (qSnap.empty) { 
                const adminData = { 
                    email: user.email.toLowerCase(), 
                    nombre: user.displayName || user.email.split('@')[0], 
                    rol: 'admin', 
                    activo: true, 
                    modulos_habilitados: ROLES_MODULOS_DEFAULT.admin,
                    fecha_creacion: new Date().toISOString() 
                };
                const newDoc = await addDoc(collection(db, "usuarios_sistema"), adminData); 
                usuarioEncontrado = { id: newDoc.id, ...adminData };
            } else { 
                qSnap.forEach(d => { 
                    const dt = d.data();
                    if(dt.email && dt.email.toLowerCase() === user.email.toLowerCase()) {
                        usuarioEncontrado = { id: d.id, ...dt };
                    }
                }); 
            }

            if (!usuarioEncontrado && user.email.toLowerCase() === 'productora.mandalahouse@gmail.com') {
                const adminData = { 
                    email: user.email.toLowerCase(), 
                    nombre: 'Mandala House Productora', 
                    rol: 'admin', 
                    activo: true, 
                    modulos_habilitados: ROLES_MODULOS_DEFAULT.admin,
                    fecha_creacion: new Date().toISOString() 
                };
                const newDoc = await addDoc(collection(db, "usuarios_sistema"), adminData); 
                usuarioEncontrado = { id: newDoc.id, ...adminData };
            }

            if (!usuarioEncontrado) { 
                alert(`⛔ Acceso Denegado:\nTu cuenta (${user.email}) no está autorizada para ingresar a este sistema.`); 
                await signOut(auth); 
                document.getElementById('login-container').style.display = 'flex'; 
                document.getElementById('app-container').style.display = 'none'; 
                return; 
            }

            if (usuarioEncontrado.activo === false) {
                alert(`⛔ Cuenta Inactiva:\nTu usuario (${user.email}) ha sido desactivado por el administrador.`);
                await signOut(auth);
                document.getElementById('login-container').style.display = 'flex';
                document.getElementById('app-container').style.display = 'none';
                return;
            }

            const rolesArr = Array.isArray(usuarioEncontrado.roles) && usuarioEncontrado.roles.length > 0
                ? usuarioEncontrado.roles
                : (usuarioEncontrado.rol ? [usuarioEncontrado.rol] : ['admisiones']);
            
            const rol = rolesArr[0] || 'admisiones';

            let modulos = [];
            if (Array.isArray(usuarioEncontrado.modulos_habilitados) && usuarioEncontrado.modulos_habilitados.length > 0) {
                modulos = usuarioEncontrado.modulos_habilitados;
            } else {
                const modulosUnion = new Set();
                rolesArr.forEach(r => {
                    const m = ROLES_MODULOS_DEFAULT[r] || [];
                    m.forEach(mod => modulosUnion.add(mod));
                });
                modulos = Array.from(modulosUnion);
            }

            let nombreDocente = usuarioEncontrado.nombre;
            let profesorId = usuarioEncontrado.profesor_id || '';

            if (profesorId) {
                try {
                    const pDoc = await getDoc(doc(db, "profesores", profesorId));
                    if (pDoc.exists() && pDoc.data().nombre) {
                        nombreDocente = pDoc.data().nombre;
                    }
                } catch(e) {}
            } else {
                try {
                    const pSnap = await getDocs(collection(db, "profesores"));
                    pSnap.forEach(d => {
                        const dt = d.data();
                        if (dt.correo_calendario && dt.correo_calendario.toLowerCase() === user.email.toLowerCase()) {
                            profesorId = d.id;
                            nombreDocente = dt.nombre || nombreDocente;
                        }
                    });
                } catch(e) {}
            }

            window.usuarioActual = {
                ...usuarioEncontrado,
                nombre: nombreDocente || usuarioEncontrado.nombre || user.displayName || user.email.split('@')[0],
                profesor_id: profesorId,
                roles: rolesArr,
                rol,
                modulos_habilitados: modulos
            };

        } catch(e) { 
            return alert("Error al validar permisos de usuario: " + e.message); 
        }

        document.getElementById('login-container').style.display = 'none'; 
        document.getElementById('app-container').style.display = 'flex'; 
        
        const userInfoBox = document.getElementById('user-info'); 
        if (userInfoBox && window.usuarioActual) {
            if (window.usuarioActual.nombre) {
                userInfoBox.innerHTML = `
                    <div style="font-weight:700; color:var(--text-main); font-size:12.5px; margin-bottom:2px; word-break:break-word;">${window.usuarioActual.nombre}</div>
                    <div style="font-size:11px; color:var(--text-muted); word-break:break-all; line-height:1.25;">${window.usuarioActual.email}</div>
                `;
            } else {
                userInfoBox.innerHTML = `
                    <div style="font-size:11.5px; color:var(--text-main); word-break:break-all;">${window.usuarioActual.email}</div>
                `;
            }
        }

        if (userInfoBox) { 
            let vTag = document.getElementById('version-tag');
            if (!vTag) {
                userInfoBox.insertAdjacentHTML('afterend', `<div id="version-tag" style="font-size:0.85em; color:var(--accent-teal); margin-top:5px; font-weight:700; padding:0 10px;">${APP_VERSION}</div>`);
            } else {
                vTag.textContent = APP_VERSION;
            }
        }

        await cargarConfig(); 
        configurarSidebarPorPermisos();

        if (window.usuarioActual.rol === 'profesor') {
            cargarVista('Mis Grupos & Solicitud de Alumnos');
        } else {
            const mods = window.usuarioActual.modulos_habilitados || [];
            if (window.usuarioActual.rol === 'admin' || mods.includes('dashboard')) {
                cargarVista('Dashboard');
            } else if (mods.includes('inbox')) {
                cargarVista('Inbox - Pendientes');
            } else if (mods.includes('espera')) {
                cargarVista('Lista de Espera');
            } else if (mods.includes('match')) {
                cargarVista('Match - Pendientes');
            } else if (mods.includes('altas')) {
                cargarVista('Altas - Pendientes');
            } else if (mods.includes('metricas')) {
                cargarVista('Estadísticas');
            } else if (mods.includes('configuracion')) {
                cargarVista('Configuración');
            } else {
                cargarVista('Dashboard');
            }
        }
        
        const btnMobileMenu = document.getElementById('btn-mobile-menu');
        const btnCerrarMenuMobile = document.getElementById('btn-cerrar-menu-mobile');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');

        if(btnMobileMenu) {
            btnMobileMenu.onclick = () => {
                if (window.innerWidth <= 850) {
                    sidebar.classList.toggle('active');
                    if (overlay) overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
                } else {
                    sidebar.classList.toggle('collapsed');
                }
            };
        }
        if(btnCerrarMenuMobile) btnCerrarMenuMobile.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.style.display = 'none'; });
        if(overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.style.display = 'none'; });

    } else { 
        document.getElementById('login-container').style.display = 'flex'; 
        document.getElementById('app-container').style.display = 'none'; 
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

    const navItem = target.closest('#sidebar .nav-item, #sidebar .nav-item-small');
    if (navItem) {
        const vistaTarget = navItem.getAttribute('data-vista');
        if (vistaTarget) {
            cargarVista(vistaTarget);
            document.getElementById('sidebar').classList.remove('active');
            const overlay = document.getElementById('mobile-overlay');
            if (overlay) overlay.style.display = 'none';
        }
        return;
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

    if (target.classList.contains('btn-prio-filtro') || target.closest('.btn-prio-filtro')) {
        const btn = target.classList.contains('btn-prio-filtro') ? target : target.closest('.btn-prio-filtro');
        const prio = btn.getAttribute('data-prio');
        if (prio) {
            window.setFiltroPrioridadDashboard(prio);
        }
        return;
    }

    if (target.classList.contains('btn-nombre-agendar') || target.closest('.btn-nombre-agendar')) {
        const btn = target.classList.contains('btn-nombre-agendar') ? target : target.closest('.btn-nombre-agendar');
        const id = btn.getAttribute('data-id');
        try {
            const al = (await getDoc(doc(db, "alumnos", id))).data();
            const iS = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || '');
            let template = configApp.texto_nombre_agendar || 'MDL {nombre} {edad} {año_actual} @{instrumento} @{suscripcion}';
            const txt = reemplazarVariables(template, { 
                nombre: al.nombre, 
                edad: al.edad || '', 
                'año_actual': new Date().getFullYear().toString(), 
                instrumento: iS, 
                suscripcion: al.tipo_suscripcion || '' 
            }).replace(/\s+/g, ' ').trim();
            await navigator.clipboard.writeText(txt);
            alert("📋 Formato de contacto para WhatsApp copiado al portapapeles:\n\n" + txt);
        } catch(e) {
            alert("Error al copiar: " + e.message);
        }
        return;
    }
    
    if (target.classList.contains('btn-admision-finalizada') || target.closest('.btn-admision-finalizada')) { 
        const btn = target.classList.contains('btn-admision-finalizada') ? target : target.closest('.btn-admision-finalizada');
        const id = btn.getAttribute('data-id'); 
        document.getElementById('informe-final-alumno-id').value = id;
        try {
            const al = (await getDoc(doc(db, "alumnos", id))).data();
            quillPopup.root.innerHTML = al.informe_admision || '';
            renderChipsPerfilPsicologico('informe-perfil-psicologico-chips', al.perfil_psicologico || []);
            document.getElementById('modal-informe-admision').showModal();
        } catch(e) {}
        return; 
    }
    
    if (target.id === 'btn-guardar-informe-final') {
        const id = document.getElementById('informe-final-alumno-id').value;
        const plainInfo = quillPopup.getText().trim();
        const tags = getPerfilPsicologicoSeleccionado('informe-perfil-psicologico-chips');

        // VALIDACIONES OBLIGATORIAS
        if (!plainInfo) {
            alert("⚠️ Es obligatorio escribir el diagnóstico o informe de la evaluación para finalizar la admisión.");
            return;
        }

        if (!tags || tags.length === 0) {
            alert("⚠️ Es obligatorio seleccionar al menos una etiqueta de perfil psicológico o emocional.");
            return;
        }

        const btn = target;
        setBotonCargando(btn, true);
        const informeTexto = quillPopup.root.innerHTML;
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            const al = alDoc.exists() ? alDoc.data() : {};
            const hist = al.historial || [];
            const tagsTxt = ` [Perfil Emocional: ${tags.join(', ')}]`;
            hist.push(crearEntradaHistorial(`Admisión Finalizada. Diagnóstico e informe registrados.${tagsTxt} Alumno pasó a Lista de Espera.`, 'informe'));
            await updateDoc(doc(db, "alumnos", id), { 
                estado_agenda: "Lista de espera",
                informe_admision: informeTexto,
                perfil_psicologico: tags,
                historial: hist
            });
            document.getElementById('modal-informe-admision').close();
            alert("Admisión Finalizada exitosamente. Alumno en Lista de Espera.");
            cargarVista(estadoActualVista);
        } catch(err) {
            alert("Error al guardar: " + err.message);
        }
        setBotonCargando(btn, false);
        return;
    }

    // Botón Iniciar / Editar Pre-Alta (Individual o Directo desde Lista de Espera / En Curso)
    if (target.classList.contains('btn-abrir-prealta') || target.classList.contains('btn-editar-prealta')) {
        const id = target.getAttribute('data-id');
        const esEdicion = target.classList.contains('btn-editar-prealta');
        const inicioPrev = target.getAttribute('data-inicio');
        const grupoPrev = target.getAttribute('data-grupo');
        await abrirModalPrealta(id, esEdicion, inicioPrev, grupoPrev, { configApp, setBotonCargando });
        return;
    }

    // Botón Iniciar Pre-Alta Grupal / Masivo
    if (target.classList.contains('btn-iniciar-prealta-grupo') || target.id === 'btn-bulk-prealta') {
        const idsRaw = target.getAttribute('data-ids');
        const ids = idsRaw ? idsRaw.split(',').filter(Boolean) : [...selectedBulkIds];
        const grupoNom = target.getAttribute('data-grupo') || '';
        await abrirModalPrealtaGrupal(ids, grupoNom, configApp);
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

    // Guardar Pre-Alta (modal-iniciar-prealta)
    if (target.id === 'btn-guardar-prealta') {
        await guardarPreAlta({ setBotonCargando, cargarVista, generarTextoConHistorial, estadoActualVista });
        return;
    }

    // Botón Confirmar Alta (Abre modal)
    if (target.classList.contains('btn-abrir-confirmar-alta')) {
        const id = target.getAttribute('data-id');
        document.getElementById('conf-alta-alumno-id').value = id;
        document.getElementById('modal-confirmar-alta').showModal();
        return;
    }
    // Guardar Confirmación de Alta
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

        const hist = al.historial || [];
        hist.push(crearEntradaHistorial(`Alta confirmada y efectiva (${est}) en el grupo/clase "${al.grupo_asignado || '-'}".`, 'alta'));
        await updateDoc(doc(db, "alumnos", id), { estado_agenda: est, historial: hist });
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
            const hist = al.historial || [];
            hist.push(crearEntradaHistorial("Alta Finalizada: Todos los pasos del checklist confirmados. Ciclo de admisión cerrado con éxito.", 'alta'));
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
            const hist = al.historial || [];
            hist.push(crearEntradaHistorial(`Devuelto a Lista de Espera desde ${al.estado_agenda || 'Altas'}. Motivo: ${motivo.trim()}`, 'alta'));
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
            const hist = al.historial || []; 
            hist.push(crearEntradaHistorial(`Alta suspendida. Motivo: ${motivo.trim()}`, 'suspension')); 
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
        setBotonCargando(target, true, 'Guardando propuesta de agenda...'); 
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
            document.getElementById('modal-agenda').close(); 
            removerFilaOptimista(alumnoIdActual);
            await cargarVista(estadoActualVista); 
            alert("Texto copiado al portapapeles. Estado avanzado a Pendiente Validación."); 
        } catch(e) { 
            alert("❌ Error:\n\n" + e.message); 
        } finally {
            setBotonCargando(target, false); 
        }
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
        if (!template && plantillaKey === 'texto_cancela_alumno') {
            template = "*🔴 PRE CHECK - ENTREVISTA*\n*❌ RESERVA CANCELADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*📋 DATOS DEL ALUMNO:*\n👤 Nombre: {nombre}\n🎂 Edad: {edad}\n{emojiinstrumento} Instrumento: {instrumento}\n🧩 Clase: {suscripcion}\n\n*📝 HISTORIAL / MOTIVO:*\n{historial}";
        }
        template = template.replace(/\{historial\}/gi, histText); 
        const iS = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || '')); 
        const emojiInst = getEmojiInstrumento(iS, configApp, al);
        const dP = convertirHtmlATextoPlano(al.descripcion || ''); 
        const fAmiInicio = al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : ''; 
        let opc = overrideOpciones || al.opciones_propuestas || []; 
        let opcionesStr = opc.length > 0 ? opc.map(o => `${o.letra || '-'}- ${o.fechaTexto}`).join('\n') : ''; 
        let fHora = overrideFecha || al.reserva_fecha_texto || al.reserva_fecha_texto_previo || ''; 
        if (opc.length > 1 && (fHora === 'Varias opciones' || !fHora)) { 
            fHora = '\n' + opcionesStr; 
        } 
        const txt = reemplazarVariables(template, { 
            fecha_hora: fHora, 
            opciones: opcionesStr, 
            nombre: al.nombre, 
            edad: al.edad || '-', 
            instrumento: iS, 
            emojiinstrumento: emojiInst || '',
            suscripcion: al.tipo_suscripcion || '', 
            descripcion: dP, 
            profe: targetProfeNom || '', 
            valor: configApp.valor_clase || '', 
            alias_profe: aliasP || '', 
            grupo: al.grupo_asignado || '', 
            motivo: al.motivo_suspension || '',
            motivo_suspension: al.motivo_suspension || '',
            'fecha inicio clases': fAmiInicio 
        }); 
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
    if (target.id === 'btn-confirmar-validacion-profe') {
        const id = document.getElementById('validar-profe-alumno-id').value;
        const selectedRadio = document.querySelector('input[name="opt-valida-profe"]:checked');
        if (!selectedRadio) return alert("Selecciona una opción.");
        const op = JSON.parse(selectedRadio.value);
        const al = (await getDoc(doc(db, "alumnos", id))).data();
        setBotonCargando(target, true, 'Creando evento en Calendar...');
        try {
            al.reserva_profe_id = op.profeId;
            al.reserva_profe_nombre = op.profeNombre;
            al.reserva_cal_id = op.calId;
            al.reserva_fecha_texto = op.fechaTexto;
            al.reserva_inicio = op.inicio;
            al.reserva_fin = op.fin;
            const titulos = construirTitulosEvento(al, 'reserva', configApp);
            const evRes = await crearEventoSeguro(al, titulos, op.inicio, op.fin);
            await updateDoc(doc(db, "alumnos", id), {
                estado_agenda: "Pendiente validación por alumno",
                id_evento_reserva: evRes.id,
                calendario_evento_reserva: evRes.calendar,
                reserva_profe_id: op.profeId,
                reserva_profe_nombre: op.profeNombre,
                reserva_cal_id: op.calId,
                reserva_fecha_texto: op.fechaTexto,
                reserva_inicio: op.inicio,
                reserva_fin: op.fin,
                opciones_propuestas: null
            });
            const dataText = await generarTextoConHistorial(id, 'texto_alumno');
            await navigator.clipboard.writeText(dataText.txt);
            document.getElementById('modal-validar-profe').close();
            removerFilaOptimista(id);
            await cargarVista(estadoActualVista);
            alert("Reserva en Calendar creada exitosamente.\n\nTexto copiado.");
        } catch(e) {
            alert("❌ Error:\n\n" + e.message);
        } finally {
            setBotonCargando(target, false);
        }
        return;
    }
    if (target.classList.contains('btn-confirmar-entrevista') || target.closest('.btn-confirmar-entrevista')) {
        const btn = target.classList.contains('btn-confirmar-entrevista') ? target : target.closest('.btn-confirmar-entrevista');
        const id = btn.getAttribute('data-id');
        setBotonCargando(btn, true, 'Confirmando agenda en Calendar...');
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (!alDoc.exists()) {
                setBotonCargando(btn, false);
                return alert("Alumno no encontrado.");
            }
            const al = alDoc.data();
            const descP = convertirHtmlATextoPlano(al.descripcion || '');
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
            removerFilaOptimista(id);
            await cargarVista(estadoActualVista);
            alert("✅ ¡Agenda Confirmada exitosamente! El alumno pasó a Confirmadas.");
        } catch(e) {
            alert("❌ Error al confirmar agenda:\n\n" + e.message);
        } finally {
            setBotonCargando(btn, false);
        }
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
            mostrarIndicadorCarga('Cancelando evento en Calendar...');
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
                removerFilaOptimista(id);
                await cargarVista(estadoActualVista); 
            } catch(e) { 
                alert("❌ Error:\n\n" + e.message); 
            } finally {
                ocultarIndicadorCarga();
            }
        } 
        return; 
    }

    if (target.classList.contains('btn-pasar-espera-directo') || target.closest('.btn-pasar-espera-directo')) {
        const btn = target.closest('.btn-pasar-espera-directo') || target;
        const id = btn.getAttribute('data-id');
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (!alDoc.exists()) return alert("Alumno no encontrado.");
            const alData = alDoc.data();
            
            const ok = await window.confirmar(
                `¿Pasar a ${alData.nombre} a Lista de Espera?`,
                'El alumno se derivará directamente a la Lista de Espera sin pasar por el circuito de entrevista previa y quedará listo para el armado de grupos.',
                '🛋️ Pasar a Espera',
                'question'
            );
            if (ok) {
                setBotonCargando(btn, true, 'Pasando a Lista de Espera...');
                const now = new Date();
                const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
                const hist = alData.historial || [];
                hist.push({
                    id: Date.now(),
                    texto: 'Derivado directamente a Lista de Espera sin entrevista previa.',
                    fecha: fechaStr
                });
                await updateDoc(doc(db, "alumnos", id), {
                    estado_agenda: 'Lista de Espera',
                    fecha_ingreso_espera: new Date().toISOString(),
                    historial: hist
                });
                removerFilaOptimista(id);
                await cargarVista(estadoActualVista);
                alert(`✅ ${alData.nombre} pasó a Lista de Espera.`);
            }
        } catch(e) {
            alert("❌ Error al pasar a Lista de Espera: " + e.message);
        } finally {
            setBotonCargando(btn, false);
        }
        return;
    }

    if (target.classList.contains('btn-abrir-nueva-suscripcion') || target.closest('.btn-abrir-nueva-suscripcion') || target.id === 'btn-modal-nueva-suscripcion') {
        const btn = target.closest('.btn-abrir-nueva-suscripcion') || target;
        const id = btn.getAttribute('data-id') || document.getElementById('alumno-id')?.value;
        if (id) {
            window.abrirModalNuevaSuscripcion(id);
        }
        return;
    }

    if (target.classList.contains('btn-abrir-suspender') || target.closest('.btn-abrir-suspender') ||
        target.classList.contains('btn-suspender') || target.closest('.btn-suspender') ||
        target.classList.contains('btn-suspender-espera') || target.closest('.btn-suspender-espera')) { 
        const btn = target.closest('.btn-abrir-suspender') || target.closest('.btn-suspender') || target.closest('.btn-suspender-espera') || target;
        document.getElementById('susp-alumno-id').value = btn.getAttribute('data-id'); 
        document.getElementById('susp-motivo').value = ""; 
        const detEl = document.getElementById('susp-detalle-adicional');
        if (detEl) detEl.value = "";
        document.getElementById('modal-suspender').showModal(); 
        return; 
    }
    if (target.id === 'btn-guardar-suspension') { 
        const id = document.getElementById('susp-alumno-id').value;
        const mtv = document.getElementById('susp-motivo').value; 
        const det = document.getElementById('susp-detalle-adicional')?.value?.trim() || "";
        if(!mtv) return alert("Seleccione motivo"); 
        setBotonCargando(target, true, 'Guardando suspensión...'); 
        try { 
            const alDoc = await getDoc(doc(db, "alumnos", id));
            const al = alDoc.data(); 
            const estadoActual = (al.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const esDeAltaOEspera = ['lista de espera', 'pre-alta pendiente', 'pre-alta iniciada', 'alta efectiva', 'alta ilegal', 'alta finalizada'].includes(estadoActual);
            
            const teniaReserva = !!(al.id_evento_reserva || al.id_evento_alta || al.reserva_profe_id || al.reserva_fecha_texto || al.fecha_inicio_clases);
            const profPrevioId = al.reserva_profe_id || al.profesor_id || null;
            const profPrevioNom = al.reserva_profe_nombre || al.profesor_asignado || null;
            const fechaPrevTexto = al.reserva_fecha_texto || (al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : null);

            if (al.id_evento_reserva) await eliminarEventoSeguro(al);
            if (al.id_evento_alta) await eliminarEventoAltaSeguro(al);
            
            const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
            const hist = al.historial || []; 
            const motivoCompleto = det ? `${mtv} (Detalle: ${det})` : mtv;
            hist.push({ id: Date.now(), texto: `Suspendido. Motivo: ${motivoCompleto}`, fecha: fechaStr }); 
            
            const nuevoEstado = esDeAltaOEspera ? "Alta suspendida" : "Agenda suspendida";
            await updateDoc(doc(db, "alumnos", id), { 
                estado_agenda: nuevoEstado, 
                motivo_suspension: motivoCompleto, 
                detalle_suspension: det || null,
                reserva_profe_id_previo: profPrevioId,
                reserva_profe_nombre_previo: profPrevioNom,
                reserva_fecha_texto_previo: fechaPrevTexto,
                reserva_profe_id: null, 
                reserva_profe_nombre: null, 
                reserva_cal_id: null, 
                reserva_fecha_texto: null, 
                reserva_inicio: null, 
                reserva_fin: null, 
                id_evento_reserva: null, 
                calendario_evento_reserva: null, 
                historial: hist 
            }); 
            document.getElementById('modal-suspender').close(); 
            removerFilaOptimista(id);
            await cargarVista(estadoActualVista); 

            if (teniaReserva) {
                try {
                    const dataText = await generarTextoConHistorial(id, 'texto_cancela_alumno', fechaPrevTexto, profPrevioId, profPrevioNom);
                    if (dataText && dataText.txt) {
                        await navigator.clipboard.writeText(dataText.txt);
                        alert(`🛑 Ficha suspendida correctamente.\n\n📅 Se canceló la reserva en Calendar y se copió al portapapeles el texto de cancelación para informar al profesor.`);
                        return;
                    }
                } catch(errTxt) {
                    console.warn("No se pudo generar texto de cancelación:", errTxt);
                }
            }
            alert("Ficha suspendida correctamente.");
        } catch(err){ 
            alert("❌ Error:\n\n" + err.message); 
        } finally { 
            setBotonCargando(target, false); 
        }
        return;
    }

    if (target.classList.contains('btn-copiar-aviso-cancelacion') || target.closest('.btn-copiar-aviso-cancelacion')) {
        const btn = target.classList.contains('btn-copiar-aviso-cancelacion') ? target : target.closest('.btn-copiar-aviso-cancelacion');
        const id = btn.getAttribute('data-id');
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (!alDoc.exists()) return alert("Alumno no encontrado.");
            const al = alDoc.data();
            const profId = al.reserva_profe_id || al.reserva_profe_id_previo || al.profesor_id || null;
            const profNom = al.reserva_profe_nombre || al.reserva_profe_nombre_previo || al.profesor_asignado || null;
            const fechaTxt = al.reserva_fecha_texto || al.reserva_fecha_texto_previo || (al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : null) || 'Fecha a coordinar';

            const dataText = await generarTextoConHistorial(id, 'texto_cancela_alumno', fechaTxt, profId, profNom);
            if (dataText && dataText.txt) {
                await navigator.clipboard.writeText(dataText.txt);
                alert(`📋 Texto de Cancelación copiado al portapapeles para enviar al profesor:\n\n${dataText.txt}`);
            }
        } catch(e) {
            alert("Error al generar texto de aviso: " + e.message);
        }
        return;
    }
    if (target.classList.contains('btn-recuperar-agenda') || target.closest('.btn-recuperar-agenda')) { 
        const btn = target.classList.contains('btn-recuperar-agenda') ? target : target.closest('.btn-recuperar-agenda');
        const id = btn.getAttribute('data-id');
        setBotonCargando(btn, true, 'Recuperando ficha...');
        try {
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente procesar", motivo_suspension: null }); 
            removerFilaOptimista(id);
            await cargarVista(estadoActualVista); 
            alert("Ficha recuperada exitosamente.");
        } catch(e) {
            alert("❌ Error al recuperar: " + e.message);
        } finally {
            setBotonCargando(btn, false);
        }
        return; 
    }
    if (target.classList.contains('btn-cerrar-modal')) { document.getElementById(target.getAttribute('data-modal')).close(); return; }
    
    if (target.id === 'btn-nuevo-alumno') { 
        const roles = Array.isArray(window.usuarioActual?.roles) && window.usuarioActual.roles.length > 0
            ? window.usuarioActual.roles
            : [window.usuarioActual?.rol || 'admisiones'];
        const puedeCrear = roles.includes('admin') || roles.includes('admisiones') || roles.includes('admisor');
        if (!puedeCrear) {
            alert('⛔ Solo los administradores y el equipo de admisión pueden crear nuevos alumnos.');
            return;
        }
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
        const elAltaBox = document.getElementById('modal-seccion-alta-box');
        if (elAltaBox) elAltaBox.style.display = 'none';
        const elFechaInf = document.getElementById('modal-informe-fecha-val');
        const elEvalInf = document.getElementById('modal-informe-evaluador-val');
        if (elFechaInf) elFechaInf.textContent = '-';
        if (elEvalInf) elEvalInf.textContent = '-';
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
        const btnNuevaSusc = document.getElementById('btn-modal-nueva-suscripcion');
        if (btnNuevaSusc) btnNuevaSusc.style.display = 'none';
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

window.editarAlumnoModalDirecto = async function(id) {
    const wrap = document.getElementById('form-alumno-wrapper');
    if (!wrap) return;
    wrap.style.display = 'block';
    document.getElementById('modal-alta-alumno').appendChild(wrap);
    document.getElementById('form-titulo').textContent = "Editar Alumno";
    await llenarFormularioAlumno(id);
    document.getElementById('modal-alta-alumno').showModal();
};

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
    renderChipsPerfilPsicologico('ficha-perfil-psicologico-chips', d.perfil_psicologico || []);
    
    // 1. Datos de Entrevista en Tab Informe
    let fechaEntrevistaTxt = '-';
    if (d.opciones_propuestas && d.opciones_propuestas.length > 1) {
        fechaEntrevistaTxt = d.opciones_propuestas.map(o => `${o.letra || '-'}: ${o.fechaTexto}`).join(' / ');
    } else if (d.reserva_fecha_texto) {
        fechaEntrevistaTxt = d.reserva_fecha_texto;
    } else if (d.reserva_inicio) {
        try {
            const f = new Date(d.reserva_inicio);
            if (!isNaN(f.getTime())) fechaEntrevistaTxt = f.toLocaleString();
        } catch(e) {}
    }
    const evaluadorTxt = d.reserva_profe_nombre || '-';
    const elFechaInf = document.getElementById('modal-informe-fecha-val');
    const elEvalInf = document.getElementById('modal-informe-evaluador-val');
    if (elFechaInf) elFechaInf.textContent = fechaEntrevistaTxt;
    if (elEvalInf) elEvalInf.textContent = evaluadorTxt;

    // 2. Datos de Suscripción de Alta en Tab Datos
    const elAltaBox = document.getElementById('modal-seccion-alta-box');
    const elAltaProfe = document.getElementById('modal-alta-profe-val');
    const elAltaGrupo = document.getElementById('modal-alta-grupo-val');
    const elAltaHorario = document.getElementById('modal-alta-horario-val');
    
    const tieneDatosAlta = d.grupo_asignado || d.horario_match || d.fecha_inicio_clases || d.profesor_asignado || (['Pre-alta pendiente', 'Pre-alta iniciada', 'Alta Efectiva', 'Alta Ilegal', 'Alta Finalizada', 'Validando grupo'].includes(d.estado_agenda) && d.reserva_profe_nombre);
    
    if (tieneDatosAlta && elAltaBox) {
        elAltaBox.style.display = 'block';
        if (elAltaProfe) elAltaProfe.textContent = d.profesor_asignado || d.reserva_profe_nombre || '-';
        if (elAltaGrupo) elAltaGrupo.textContent = d.grupo_asignado || '-';
        
        let partesHorario = [];
        if (d.horario_match) partesHorario.push(d.horario_match);
        if (d.fecha_inicio_clases) {
            try {
                const f = new Date(d.fecha_inicio_clases);
                if (!isNaN(f.getTime())) {
                    const dia = f.getDate();
                    const mes = f.getMonth() + 1;
                    partesHorario.push(`Inicio: ${dia}/${mes}`);
                }
            } catch(e) {}
        }
        if (elAltaHorario) elAltaHorario.textContent = partesHorario.length > 0 ? partesHorario.join(' • ') : '-';
    } else if (elAltaBox) {
        elAltaBox.style.display = 'none';
    }
    
    const estadosBloqueados = ['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno'];
    if (estadosBloqueados.includes(d.estado_agenda)) {
        document.getElementById('aviso-informe-bloqueado').style.display = 'block';
        quillInforme.enable(false);
    } else {
        document.getElementById('aviso-informe-bloqueado').style.display = 'none';
        quillInforme.enable(true);
    }
    
    const info = getEstadoYBadgeLocal(d);
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

    const btnNuevaSusc = document.getElementById('btn-modal-nueva-suscripcion');
    if (btnNuevaSusc) {
        btnNuevaSusc.style.display = 'block';
        btnNuevaSusc.setAttribute('data-id', id);
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
    
    const selInst = document.getElementById('instrumento'), instV = Array.from(selInst.selectedOptions).map(o=>o.value);
    const tagsPerfil = getPerfilPsicologicoSeleccionado('ficha-perfil-psicologico-chips');
    const data = { 
        nombre: document.getElementById('nombre').value, 
        celular: document.getElementById('celular').value, 
        edad: Number(document.getElementById('edad').value), 
        nivel: document.getElementById('nivel').value, 
        instrumento: instV, 
        tipo_suscripcion: document.getElementById('tipo_suscripcion').value, 
        descripcion: quill.root.innerHTML, 
        informe_admision: quillInforme.root.innerHTML, 
        perfil_psicologico: tagsPerfil,
        disponibilidad: disp, 
        historial: historialActual 
    }; 
    try {
        const id = document.getElementById('alumno-id').value;
        if (id) {
            await updateDoc(doc(db, "alumnos", id), data);
        } else {
            const esDirecto = document.getElementById('chk-ingreso-directo').checked;
            if (esDirecto) {
                data.estado_agenda = "Lista de espera";
                const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
                data.historial.push({ id: Date.now(), texto: "Ingreso directo a Lista de Espera.", fecha: fechaStr });
            } else {
                data.estado_agenda = "Pendiente procesar";
            }
            await addDoc(collection(db, "alumnos"), data);
        }
        const wrap = document.getElementById('form-alumno-wrapper');
        wrap.style.display = 'none';
        document.body.appendChild(wrap);
        document.getElementById('modal-alta-alumno').close();
        await cargarVista(estadoActualVista);
        alert("✅ Datos del alumno guardados correctamente.");
    } catch(err) {
        alert("❌ Error al guardar: " + err.message);
    } finally {
        setBotonCargando(btnSubmit, false);
    }
});

// =======================================================================
// NUEVA SUSCRIPCIÓN / RE-INSCRIPCIÓN DE ALUMNO EXISTENTE
// =======================================================================
window.abrirModalNuevaSuscripcion = async function(id) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const al = alDoc.data();
        
        const instActual = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento || 'Sin instrumento');
        
        document.getElementById('nueva-susc-alumno-id').value = id;
        document.getElementById('nueva-susc-alumno-nombre').textContent = `${al.nombre || 'Alumno'} (${instActual})`;
        
        const sI = document.getElementById('nueva-susc-instrumento');
        const sS = document.getElementById('nueva-susc-tipo');
        if (sI) sI.innerHTML = '<option value="">Seleccione instrumento...</option>';
        if (sS) sS.innerHTML = '<option value="">Seleccione tipo de suscripción...</option>';
        
        const iSnap = await getDocs(collection(db, "instrumentos"));
        iSnap.forEach(d => {
            const nom = d.data().nombre;
            if (sI) sI.innerHTML += `<option value="${nom}">${nom}</option>`;
        });
        
        const sSnap = await getDocs(collection(db, "tipos_suscripcion"));
        sSnap.forEach(d => {
            const nom = d.data().nombre;
            if (sS) sS.innerHTML += `<option value="${nom}" ${nom === al.tipo_suscripcion ? 'selected' : ''}>${nom}</option>`;
        });
        
        // Si el modal de edición estaba abierto, cerrarlo
        const modalEdit = document.getElementById('modal-alta-alumno');
        if (modalEdit && modalEdit.open) {
            modalEdit.close();
        }
        
        const modal = document.getElementById('modal-nueva-suscripcion');
        if (modal) modal.showModal();
    } catch(e) {
        alert("Error al abrir modal de nueva suscripción: " + e.message);
    }
};

const btnConfirmarNuevaSusc = document.getElementById('btn-confirmar-nueva-suscripcion');
if (btnConfirmarNuevaSusc) {
    btnConfirmarNuevaSusc.addEventListener('click', async () => {
        const id = document.getElementById('nueva-susc-alumno-id').value;
        const nuevoInst = document.getElementById('nueva-susc-instrumento')?.value;
        const nuevoTipo = document.getElementById('nueva-susc-tipo')?.value;
        
        if (!nuevoInst) return alert("Por favor selecciona el nuevo instrumento.");
        if (!nuevoTipo) return alert("Por favor selecciona el tipo de suscripción.");
        
        setBotonCargando(btnConfirmarNuevaSusc, true);
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (!alDoc.exists()) throw new Error("Alumno no encontrado.");
            const al = alDoc.data();
            
            const now = new Date();
            const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
            const instPrevio = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento || '');
            
            const prevHist = al.historial || [];
            const newHist = [
                ...prevHist,
                {
                    id: Date.now(),
                    texto: `Nueva suscripción para ${nuevoInst} (${nuevoTipo}) generada a partir de ficha previa de ${instPrevio || 'alumno existente'}.`,
                    fecha: fechaStr
                }
            ];
            
            const nuevoAlumnoData = {
                nombre: al.nombre || '',
                celular: al.celular || '',
                email: al.email || '',
                edad: al.edad || '',
                nivel: al.nivel || 'Inicial I',
                instrumento: [nuevoInst],
                instrumento_asignado: nuevoInst,
                tipo_suscripcion: nuevoTipo,
                disponibilidad: al.disponibilidad || {},
                perfil_psicologico: al.perfil_psicologico || [],
                descripcion: al.descripcion || '',
                informe_admision: al.informe_admision || '',
                estado_agenda: 'Pendiente procesar',
                alumno_origen_id: id,
                fecha_creacion: new Date().toISOString(),
                historial: newHist
            };
            
            await addDoc(collection(db, "alumnos"), nuevoAlumnoData);
            document.getElementById('modal-nueva-suscripcion').close();
            await cargarVista(estadoActualVista || 'Inbox - Pendientes');
            alert(`🎉 Nueva suscripción creada con éxito para ${al.nombre} (${nuevoInst}). Quedó disponible en Inbox › Sin Agendar.`);
        } catch(e) {
            alert("❌ Error al crear nueva suscripción: " + e.message);
        } finally {
            setBotonCargando(btnConfirmarNuevaSusc, false);
        }
    });
}

