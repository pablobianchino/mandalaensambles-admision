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
} from "./src/config/constants.js?v=5.9.10";

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
    actualizarBotonesQuitarRangoEnFila,
    updateDispStateForRow,
    poblarDisponibilidadMultiRango,
    extraerDisponibilidadMultiRango,
    normalizarHora,
    inicializarAutocompletadoHorarios
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
    eliminarEventoAltaSeguro,
    verificarEstadoEventoCalendar,
    recrearEventoFaltanteCalendar,
    alinearEventoHaciaCalendar,
    alinearSistemaDesdeCalendar
} from "./src/services/calendar.service.js?v=5.9.10";

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
} from "./src/modules/match.module.js?v=5.9.10";

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
    generarFilaExcelFacturacionAdmision,
    copiarFilaExcelBD,
    copiarFilaExcelFacturacion,
    copiarFilaExcelFacturacionAdmision,
    abrirModalAvisoPrealtaAlumno,
    copiarAvisoPrealtaAlumno
} from "./src/modules/altas.module.js?v=5.9.10";

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
    suscripciones: new Set(),
    evaluadores: new Set(),
    edadMin: null,
    edadMax: null,
    gruposEtarios: new Set()
};
let filtroAlarmaActual = 'Todos'; 
let vistaModo = 'lista'; 
window.selectedBulkIds = [];
let selectedBulkIds = window.selectedBulkIds;
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

    const tieneFiltroEdad = (filtrosSeleccionados.edadMin !== null && filtrosSeleccionados.edadMin !== '') || 
                            (filtrosSeleccionados.edadMax !== null && filtrosSeleccionados.edadMax !== '');
    const totalFiltrosActivos = filtrosSeleccionados.instrumentos.size + 
                                filtrosSeleccionados.niveles.size + 
                                filtrosSeleccionados.suscripciones.size +
                                (filtrosSeleccionados.evaluadores ? filtrosSeleccionados.evaluadores.size : 0) +
                                (filtrosSeleccionados.gruposEtarios ? filtrosSeleccionados.gruposEtarios.size : 0) +
                                (tieneFiltroEdad ? 1 : 0);

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

    const etapasEtariasConfig = [
        { id: 'ninos', label: '🧒 Niños (≤13)' },
        { id: 'adolescentes', label: '🧑 Adolescentes (14-19)' },
        { id: 'adultos', label: '👨 Adultos (20-59)' },
        { id: 'adultos_mayores', label: '👴 Mayores (60+)' }
    ];

    // Obtener evaluadores presentes dinámicamente según el pool actual
    const evalMap = new Map();
    (cachedAlumnosData || []).forEach(al => {
        const est = (al.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const nom = (al.reserva_profe_nombre || al.profesor_asignado || '').trim();
        if (nom) {
            if (estadoActualVista === 'Lista de Espera') {
                if (est === 'lista de espera') evalMap.set(nom, (evalMap.get(nom) || 0) + 1);
            } else {
                evalMap.set(nom, (evalMap.get(nom) || 0) + 1);
            }
        }
    });
    const evaluadoresPresentes = Array.from(evalMap.keys()).sort();

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

    if (filtrosSeleccionados.evaluadores) {
        filtrosSeleccionados.evaluadores.forEach(val => {
            activeBadgesHtml += `
                <span class="active-filter-badge tag-eval" style="background:#e0f2fe; color:#0369a1; border-color:#bae6fd;">
                    <span>🧑‍🏫 ${val}</span>
                    <button type="button" class="btn-remove-filter" data-type="evaluador" data-val="${val}" title="Quitar filtro">✕</button>
                </span>`;
        });
    }

    if (filtrosSeleccionados.gruposEtarios) {
        filtrosSeleccionados.gruposEtarios.forEach(val => {
            const item = etapasEtariasConfig.find(e => e.id === val) || { label: val };
            activeBadgesHtml += `
                <span class="active-filter-badge tag-edad" style="background:#fef3c7; color:#92400e; border-color:#fde68a;">
                    <span>${item.label}</span>
                    <button type="button" class="btn-remove-filter" data-type="grupoEtario" data-val="${val}" title="Quitar filtro">✕</button>
                </span>`;
        });
    }

    if (tieneFiltroEdad) {
        const minTxt = filtrosSeleccionados.edadMin !== null && filtrosSeleccionados.edadMin !== '' ? `${filtrosSeleccionados.edadMin}a` : '0a';
        const maxTxt = filtrosSeleccionados.edadMax !== null && filtrosSeleccionados.edadMax !== '' ? `${filtrosSeleccionados.edadMax}a` : '99a';
        activeBadgesHtml += `
            <span class="active-filter-badge tag-edad" style="background:#fef3c7; color:#92400e; border-color:#fde68a;">
                <span>🎂 Edad: ${minTxt} - ${maxTxt}</span>
                <button type="button" class="btn-remove-filter" data-type="edadRango" title="Quitar filtro">✕</button>
            </span>`;
    }

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
                <div id="dropdown-filtros-panel" class="dropdown-filtros-menu" style="display:${filtrosPopoverAbierto ? 'block' : 'none'}; position:absolute; top:calc(100% + 8px); left:0; z-index:1100; background:#ffffff; border:1px solid var(--border-color); border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,0.12); padding:16px 18px; width:340px; box-sizing:border-box; max-height:480px; overflow-y:auto;">
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
                        <span style="font-size:13px; font-weight:800; color:var(--text-main); text-transform:uppercase; letter-spacing:0.04em;">Filtrar Alumnos</span>
                        <button type="button" id="btn-cerrar-filtros-popover" style="background:none; border:none; cursor:pointer; font-size:14px; color:var(--text-muted); font-weight:700; padding:2px 6px;">✕</button>
                    </div>

                    ${evaluadoresPresentes.length > 0 ? `
                    <!-- Sección Evaluadores -->
                    <div style="margin-bottom:12px;">
                        <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">EVALUADOR (${evaluadoresPresentes.length})</div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            ${evaluadoresPresentes.map(ev => `
                                <button type="button" class="filter-chip ${filtrosSeleccionados.evaluadores.has(ev) ? 'active active-eval' : ''}" data-type="evaluador" data-val="${ev}">🧑‍🏫 ${ev} <span style="font-size:10.5px; opacity:0.8;">(${evalMap.get(ev)})</span></button>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Sección Rango de Edad -->
                    <div style="margin-bottom:12px;">
                        <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">RANGO DE EDAD</div>
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                            <input type="number" id="filtro-edad-min-popover" class="modern-input" placeholder="Min" min="1" max="99" value="${filtrosSeleccionados.edadMin !== null ? filtrosSeleccionados.edadMin : ''}" style="width:65px; height:28px; font-size:12px; padding:2px 6px; text-align:center;">
                            <span style="font-size:11.5px; color:var(--text-muted);">a</span>
                            <input type="number" id="filtro-edad-max-popover" class="modern-input" placeholder="Max" min="1" max="99" value="${filtrosSeleccionados.edadMax !== null ? filtrosSeleccionados.edadMax : ''}" style="width:65px; height:28px; font-size:12px; padding:2px 6px; text-align:center;">
                            <span style="font-size:11px; color:var(--text-muted);">años</span>
                            <button type="button" id="btn-aplicar-edad-rango" class="btn-app btn-secondary" style="height:28px; font-size:11px; padding:0 8px; margin-left:auto;">OK</button>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            ${etapasEtariasConfig.map(e => `
                                <button type="button" class="filter-chip ${filtrosSeleccionados.gruposEtarios?.has(e.id) ? 'active active-nivel' : ''}" data-type="grupoEtario" data-val="${e.id}">${e.label}</button>
                            `).join('')}
                        </div>
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

    // Botón aplicar rango de edad manual
    const btnAplicarEdad = document.getElementById('btn-aplicar-edad-rango');
    if (btnAplicarEdad) {
        btnAplicarEdad.addEventListener('click', (e) => {
            e.stopPropagation();
            const minVal = document.getElementById('filtro-edad-min-popover')?.value.trim();
            const maxVal = document.getElementById('filtro-edad-max-popover')?.value.trim();
            filtrosSeleccionados.edadMin = minVal ? parseInt(minVal, 10) : null;
            filtrosSeleccionados.edadMax = maxVal ? parseInt(maxVal, 10) : null;
            renderFiltrosChips();
            cargarVista(estadoActualVista);
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
            } else if (type === 'evaluador') {
                if (filtrosSeleccionados.evaluadores.has(val)) filtrosSeleccionados.evaluadores.delete(val);
                else filtrosSeleccionados.evaluadores.add(val);
            } else if (type === 'grupoEtario') {
                if (!filtrosSeleccionados.gruposEtarios) filtrosSeleccionados.gruposEtarios = new Set();
                if (filtrosSeleccionados.gruposEtarios.has(val)) filtrosSeleccionados.gruposEtarios.delete(val);
                else filtrosSeleccionados.gruposEtarios.add(val);
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
            else if (type === 'evaluador') filtrosSeleccionados.evaluadores.delete(val);
            else if (type === 'grupoEtario') filtrosSeleccionados.gruposEtarios?.delete(val);
            else if (type === 'edadRango') {
                filtrosSeleccionados.edadMin = null;
                filtrosSeleccionados.edadMax = null;
            }

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
        if (filtrosSeleccionados.evaluadores) filtrosSeleccionados.evaluadores.clear();
        if (filtrosSeleccionados.gruposEtarios) filtrosSeleccionados.gruposEtarios.clear();
        filtrosSeleccionados.edadMin = null;
        filtrosSeleccionados.edadMax = null;
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

export function setBotonCargando(btn, cargando, textoCustom = null) {
    if (!btn) return;
    if (cargando) {
        if (!btn.dataset.textoOriginal) {
            btn.dataset.textoOriginal = btn.innerHTML;
        }
        btn.classList.add('loading');
        btn.disabled = true;
        
        const isIconOnly = btn.classList.contains('btn-icon-square') || btn.classList.contains('btn-icon-fila') || btn.classList.contains('btn-auditar-cal-fila');
        if (isIconOnly) {
            btn.innerHTML = `<svg class="spinner-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>`;
        } else {
            const txt = textoCustom || (btn.dataset.textoOriginal ? btn.dataset.textoOriginal.replace(/<[^>]*>/g, '').trim() : 'Procesando...');
            const shortTxt = txt.length > 20 ? txt.substring(0, 18) + '...' : txt;
            btn.innerHTML = `<svg class="spinner-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg> <span>${shortTxt}</span>`;
        }
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
        if (btn.dataset.textoOriginal) {
            btn.innerHTML = btn.dataset.textoOriginal;
            delete btn.dataset.textoOriginal;
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

export function mostrarToast(msg, tipo = '') {
    window.alert(msg, tipo);
}
window.mostrarToast = mostrarToast;

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
window.confirmar = function(titulo, descripcion = '', textoBoton = 'Confirmar', icono = '⚠️', textoCancelar = 'Cancelar') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirmar-accion');
        if (!modal) { resolve(window._originalConfirm ? window._originalConfirm(titulo) : false); return; }

        document.getElementById('confirmar-titulo').textContent = titulo;
        document.getElementById('confirmar-descripcion').textContent = descripcion;
        document.getElementById('confirmar-btn-ok').textContent = textoBoton;
        document.getElementById('confirmar-btn-cancelar').textContent = textoCancelar;
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
window.configApp = {};
let configApp = window.configApp;
let chartFlowInst = null, chartEntrevistasInst = null, chartAltasInst = null, chartFlowDashboardInst = null;
let clipboardDisponibilidad = null, clipboardDisponibilidadProfe = null; 
let historialActual = []; 

const quill = new Quill('#editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
const quillInforme = new Quill('#informe-editor-container', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
let quillInfMotivacion = null;
let quillInfDiagnostico = null;
try {
    if (document.getElementById('inf-motivacion-editor')) {
        quillInfMotivacion = new Quill('#inf-motivacion-editor', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
    }
    if (document.getElementById('inf-diagnostico-editor')) {
        quillInfDiagnostico = new Quill('#inf-diagnostico-editor', { theme: 'snow', modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean'] ] } });
    }
} catch(e) { console.error("Error init Quill interview editors:", e); }

export function formatearFechaHoraEstandar(val) {
    if (!val) return '-';
    let d = null;
    if (val instanceof Date) {
        d = val;
    } else if (typeof val === 'string') {
        const parsed = new Date(val);
        if (!isNaN(parsed.getTime())) {
            d = parsed;
        } else {
            return val;
        }
    } else if (val && typeof val.toDate === 'function') {
        d = val.toDate();
    }
    if (!d || isNaN(d.getTime())) return typeof val === 'string' ? val : '-';

    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const nomDia = dias[d.getDay()];
    const dia = d.getDate();
    const mes = d.getMonth() + 1;
    const hora = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${nomDia} ${dia}/${mes} ${hora}:${min}hs`;
}
export function actualizarCondicionalesPunto3() {
    const selInst = document.getElementById('inf-instrumento');
    const insts = selInst ? Array.from(selInst.selectedOptions).map(o => (o.value || '').toLowerCase()) : [];
    const esCantante = insts.some(i => i.includes('canto') || i.includes('voz') || i.includes('vocal') || i.includes('cantante'));
    
    const nivel = (document.getElementById('inf-nivel')?.value || '').toLowerCase();
    const esIntermedioOAvanzado = nivel.includes('intermedio') || nivel.includes('avanzado');
    
    const cardCantante = document.getElementById('inf-card-cantante');
    const cardTonalidades = document.getElementById('inf-card-tonalidades');
    const grid = document.getElementById('inf-preguntas-condicionales-grid');
    
    if (cardCantante) cardCantante.style.display = esCantante ? 'flex' : 'none';
    if (cardTonalidades) cardTonalidades.style.display = esIntermedioOAvanzado ? 'flex' : 'none';
    if (grid) grid.style.display = (esCantante || esIntermedioOAvanzado) ? 'grid' : 'none';
}
window.actualizarCondicionalesPunto3 = actualizarCondicionalesPunto3;

setTimeout(() => {
    document.getElementById('inf-instrumento')?.addEventListener('change', actualizarCondicionalesPunto3);
    document.getElementById('inf-nivel')?.addEventListener('change', actualizarCondicionalesPunto3);
}, 300);

// Render inicial de contenedores de disponibilidad multi-rango
renderContenedorDisponibilidad('contenedor-disponibilidad', false);
renderContenedorDisponibilidad('contenedor-disponibilidad-profe', true);
renderContenedorDisponibilidad('contenedor-disponibilidad-user-profe', true);
renderContenedorDisponibilidad('contenedor-disponibilidad-mi-perfil', true);

// Render y gestión de Perfil Psicológico / Emocional
async function renderChipsPerfilPsicologico(containerId, seleccionados = []) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    try {
        const snap = await getDoc(doc(db, "configuracion", "general"));
        if (snap.exists()) {
            Object.assign(configApp, { ...defaultCfg, ...snap.data() });
        }
    } catch(e) {}

    const opciones = (configApp && Array.isArray(configApp.perfil_psicologico_opciones) && configApp.perfil_psicologico_opciones.length > 0)
        ? configApp.perfil_psicologico_opciones
        : (defaultCfg.perfil_psicologico_opciones || []);
    
    const selSet = new Set(Array.isArray(seleccionados) ? seleccionados : []);

    cont.innerHTML = opciones.map(op => {
        const isAct = selSet.has(op);
        const bg = isAct ? '#007b8f' : '#f8fafc';
        const bdr = isAct ? '#007b8f' : '#cbd5e1';
        const clr = isAct ? '#ffffff' : '#334155';
        const shd = isAct ? '0 2px 6px rgba(0,123,143,0.3)' : '0 1px 2px rgba(0,0,0,0.03)';
        const fw = isAct ? '700' : '600';
        return `<button type="button" class="profile-tag-chip ${isAct ? 'active' : ''}" data-val="${op}" style="display:inline-flex; align-items:center; gap:6px; padding:7px 15px; border-radius:24px; font-size:13px; font-weight:${fw}; cursor:pointer; user-select:none; transition:all 0.15s ease; outline:none; border:1.5px solid ${bdr}; background:${bg}; color:${clr}; box-shadow:${shd}; font-family:inherit; margin:3px 2px;">${op}</button>`;
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
        const isNowActive = chip.classList.contains('active');
        chip.style.backgroundColor = isNowActive ? '#007b8f' : '#f8fafc';
        chip.style.borderColor = isNowActive ? '#007b8f' : '#cbd5e1';
        chip.style.color = isNowActive ? '#ffffff' : '#334155';
        chip.style.boxShadow = isNowActive ? '0 2px 6px rgba(0,123,143,0.3)' : '0 1px 2px rgba(0,0,0,0.03)';
        chip.style.fontWeight = isNowActive ? '700' : '600';
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

window.toggleChecklistPill = function(contentId, iconId) {
    const el = document.getElementById(contentId);
    const ic = document.getElementById(iconId);
    if (!el) return;
    const isHidden = el.style.display === 'none' || !el.style.display;
    el.style.display = isHidden ? 'flex' : 'none';
    if (ic) ic.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
};

window.toggleInfAccordion = function(secId) {
    const sec = document.getElementById(secId);
    if (!sec) return;
    const body = sec.querySelector('.inf-accordion-body');
    const chevron = sec.querySelector('.inf-chevron');
    if (body) {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'flex' : 'none';
        if (chevron) chevron.textContent = isHidden ? '▲' : '▼';
    }
};

export function crearEntradaHistorial(texto, tipo = 'sistema', autor = null) {
    const now = new Date();
    const dia = now.getDate();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();
    const hora = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    const fechaStr = `${dia}/${mes}/${anio} ${hora}:${min}`;
    
    let nombreAutor = autor;
    if (!nombreAutor) {
        if (window.usuarioActual) {
            nombreAutor = window.usuarioActual.nombre || window.usuarioActual.email || 'Operador';
        } else {
            nombreAutor = 'Sistema';
        }
    }
    
    let textoFinal = (texto || '').trim();
    if (!textoFinal.startsWith('[')) {
        textoFinal = `[${fechaStr}] ${textoFinal}`;
    }
    
    return {
        id: Date.now() + Math.floor(Math.random() * 1000),
        fecha: fechaStr,
        texto: textoFinal,
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
            <div style="background:var(--hover-bg); border:1px solid var(--border-color); padding:10px 12px; border-radius:8px; position:relative; display:flex; flex-direction:column; gap:4px;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding-right:50px;">
                    <span style="font-size:11px; color:var(--text-muted); font-weight:600;">🕒 ${nota.fecha || ''}</span>
                    ${autorHtml ? '<span style="opacity:0.4;">•</span>' + autorHtml : ''}
                    ${badgeTipoHtml}
                </div>
                <div style="font-size:12.5px; color:var(--text-main); line-height:1.4;">${textoLimpio}</div>
                <div style="position:absolute; top:8px; right:8px; display:flex; gap:5px;">
                    <button type="button" class="btn-editar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.05em; padding:2px;" title="Editar">✏️</button>
                    <button type="button" class="btn-eliminar-nota" data-id="${nota.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.05em; padding:2px;" title="Eliminar">❌</button>
                </div>
            </div>`;
    });
}

async function cargarConfig() { 
    const docSnap = await getDoc(doc(db, "configuracion", "general")); 
    const nuevaCfg = docSnap.exists() ? { ...defaultCfg, ...docSnap.data() } : defaultCfg;
    Object.assign(configApp, nuevaCfg);
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
        let t = convertirHtmlATextoPlano(h.texto || '').trim();
        const matchFechaTexto = t.match(/^\[(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}(?:\s+\d{1,2}:\d{2})?)\]/);
        t = t.replace(/^(?:\[\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}(?:\s+\d{1,2}:\d{2})?\]\s*)+/, '').trim();
        const fStr = (h.fecha || (matchFechaTexto ? matchFechaTexto[1] : '')).trim();
        return fStr ? `[${fStr}] ${t}` : t;
    }).filter(Boolean).join('\n');
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
        if (i > inicioTestMs && i < finTestMs) puntosDeTiempo.add(i); 
        if (f > inicioTestMs && f < finTestMs) puntosDeTiempo.add(f); 
    });
    const arrayPuntos = Array.from(puntosDeTiempo).sort((a,b) => a-b);
    for (let i = 0; i < arrayPuntos.length - 1; i++) {
        const puntoMedioMs = arrayPuntos[i] + 1000; 
        const eventosContadosSet = new Set();
        let simultaneosAulas = 0; 
        let simultaneosBat = 0;
        eventosCruzados.forEach(ev => { 
            const evS = new Date(ev.start.dateTime).getTime(), evE = new Date(ev.end.dateTime).getTime(); 
            if (puntoMedioMs >= evS && puntoMedioMs < evE) { 
                if (ev.profeId) profesOcupados.add(ev.profeId); 
                const evKey = ev.id || `${evS}_${evE}_${ev.summary}`;
                if (!eventosContadosSet.has(evKey)) {
                    eventosContadosSet.add(evKey);
                    simultaneosAulas++;
                    if (ev.summary && ev.summary.toLowerCase().includes((cfgEmoji||'').toLowerCase())) simultaneosBat++; 
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
    let endH = new Date(finMs).getHours(), endM = new Date(finMs).getMinutes(); if (endH === 0 && endM === 0) endH = 24;
    const slotEndMins = endH * 60 + endM; 
    let disponible = false;

    pr.disponibilidad[lDia].forEach(rango => { 
        if (!rango) return;
        let iniStr = '', finStr = '';
        if (typeof rango === 'string') {
            const parts = rango.split(/[-a]/);
            iniStr = normalizarHora(parts[0], '09:00');
            finStr = normalizarHora(parts[1] || parts[0], '22:00');
        } else {
            iniStr = normalizarHora(rango.inicio, '09:00');
            finStr = normalizarHora(rango.fin, '22:00');
        }
        const pStartMins = parseInt(iniStr.split(':')[0], 10)*60 + parseInt(iniStr.split(':')[1], 10);
        const pEndMins = parseInt(finStr.split(':')[0], 10)*60 + parseInt(finStr.split(':')[1], 10); 
        if (slotStartMins >= pStartMins && slotEndMins <= pEndMins) { disponible = true; } 
    });
    return disponible;
}

function generarOpcionesAgenda(dispAl, eventosAPI, esBateria, todosLosProfes, profesFiltradosIDs, dStart, dEnd, cfg) {
    const opciones = [], mapaDias = { 0:"D", 1:"L", 2:"M", 3:"X", 4:"J", 5:"V", 6:"S" }, durMs = 60*60*1000, slotPasoMs = 30*60*1000, cantAulas = parseInt(cfg.cantidad_aulas)||3, cantBat = parseInt(cfg.cantidad_baterias)||2, diffDays = Math.floor(Math.abs(dEnd - dStart) / (1000*60*60*24));
    for (let i = 0; i <= diffDays; i++) {
        const fEval = new Date(dStart); fEval.setDate(fEval.getDate() + i); const lDia = mapaDias[fEval.getDay()];
        if (dispAl[lDia] && dispAl[lDia].length > 0) {
            dispAl[lDia].forEach(rango => {
                if (!rango) return;
                const iniNorm = normalizarHora(rango.inicio || (typeof rango === 'string' ? rango.split(/[-a]/)[0] : ''), '');
                const finNorm = normalizarHora(rango.fin || (typeof rango === 'string' ? (rango.split(/[-a]/)[1] || rango.split(/[-a]/)[0]) : ''), '');
                if (!iniNorm || !finNorm) return;
                const hIniB = new Date(fEval); hIniB.setHours(parseInt(iniNorm.split(':')[0], 10), parseInt(iniNorm.split(':')[1], 10), 0, 0); 
                const hFinR = new Date(fEval); hFinR.setHours(parseInt(finNorm.split(':')[0], 10), parseInt(finNorm.split(':')[1], 10), 0, 0);
                if (hIniB < new Date()) { let curr = new Date(); curr.setMinutes(curr.getMinutes() + (30 - (curr.getMinutes() % 30)), 0, 0); hIniB.setTime(curr.getTime()); }
                while (hIniB.getTime() + durMs <= hFinR.getTime()) {
                    const inMs = hIniB.getTime(), finMs = inMs + durMs, evalOverlap = chequearDisponibilidadExacta(inMs, finMs, eventosAPI, cantAulas, cantBat, esBateria, cfg.identificador_bateria);
                    if (evalOverlap.valido) {
                        todosLosProfes.forEach(pr => {
                            if (profesFiltradosIDs.includes(pr.id) && !evalOverlap.profesOcupados.has(pr.id)) {
                                if (chequearProfeDisponible(pr, hIniB, finMs, lDia)) {
                                    let pegado = false; const profeEvents = eventosAPI.filter(e => e.profeId === pr.id);
                                    profeEvents.forEach(ev => { 
                                        if(!ev.start || !ev.start.dateTime) return; 
                                        const evS = new Date(ev.start.dateTime).getTime(), evE = new Date(ev.end.dateTime).getTime(); 
                                        if (Math.abs(evE - inMs) <= 5*60*1000 || Math.abs(evS - finMs) <= 5*60*1000) pegado = true; 
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

    let dispHtml = '<div class="row-disp-grid-wrapper"><div class="row-disp-grid">';
    diasSemana.forEach(d => {
        const rangos = al.disponibilidad && al.disponibilidad[d.id];
        const tiene = Array.isArray(rangos) && rangos.length > 0;
        const txt = tiene ? formatearDiaCompletoChips(rangos, configApp.hora_apertura || '09:00', configApp.hora_cierre || '22:00') : '-';
        const esActivo = tiene && txt !== '-';
        dispHtml += `<div class="disp-box ${esActivo ? 'active' : ''}"><div class="disp-day">${d.id}</div><div class="disp-time">${txt}</div></div>`;
    });
    dispHtml += '</div></div>';

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

    let checklistAdmisionHtml = '';
    const esPendienteAlumno = (al.estado_agenda || '').toLowerCase() === 'pendiente validacion por alumno';
    if (esPendienteAlumno || al.checklist_admision) {
        const checksAdm = al.checklist_admision || [false, false];
        const pasosAdm = [
            '1. Clase de admisión abonada',
            '2. Carga de formulario completa'
        ];
        const completadosAdm = checksAdm.filter(Boolean).length;
        const porcentajeAdm = Math.round((completadosAdm / 2) * 100);
        const barColorAdm = completadosAdm === 2 ? 'var(--accent-teal)' : (completadosAdm === 1 ? '#e5a93d' : 'var(--accent-red)');

        checklistAdmisionHtml = `
            <div id="chk-adm-wrapper-${id}" class="admision-checklist-wrapper" style="margin-top:8px; padding:8px 12px; background:var(--hover-bg); border-radius:10px; border:1px solid var(--border-color);" onclick="event.stopPropagation();">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:12px; cursor:pointer; user-select:none;" onclick="window.toggleChecklistPill('chk-adm-list-${id}', 'chk-adm-icon-${id}')" title="Clic para ver o completar los requisitos de admisión">
                    <div style="display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; color:var(--text-main);">
                        <span id="chk-adm-icon-${id}" style="font-size:9px; color:#64748b; transition:transform 0.2s ease; display:inline-block;">▶</span>
                        <span id="chk-adm-title-${id}">📋 Requisitos de Admisión (${completadosAdm}/2)</span>
                    </div>
                    <span id="chk-adm-pct-${id}" style="color:${barColorAdm}; font-size:11.5px; font-weight:800; margin-left:auto; padding-left:16px; white-space:nowrap;">${porcentajeAdm}%</span>
                </div>
                <div style="width:100%; height:5px; background:#e9e5de; border-radius:4px; overflow:hidden; margin-top:5px; cursor:pointer;" onclick="window.toggleChecklistPill('chk-adm-list-${id}', 'chk-adm-icon-${id}')">
                    <div id="chk-adm-bar-${id}" style="width:${porcentajeAdm}%; height:100%; background:${barColorAdm}; transition:width 0.3s ease, background 0.3s ease;"></div>
                </div>
                <div id="chk-adm-list-${id}" class="checklist-items-collapsible" style="display:none; flex-wrap:wrap; gap:8px 12px; font-size:11px; color:var(--text-muted); margin-top:9px; padding-top:8px; border-top:1px dashed var(--border-color);">
                    ${checksAdm.map((chk, idx) => `
                        <label style="display:inline-flex; align-items:center; gap:5px; margin:0; cursor:pointer; font-weight:600; text-transform:none; color:${chk ? 'var(--text-main)' : 'var(--text-muted)'};">
                            <input type="checkbox" class="chk-admision-paso" data-id="${id}" data-idx="${idx}" ${chk ? 'checked' : ''} style="accent-color:var(--accent-teal); width:15px; height:15px; cursor:pointer;">
                            <span style="${chk ? 'text-decoration:none;' : ''}">${pasosAdm[idx] || `Paso ${idx+1}`}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let checklistHtml = '';
    const esAltaConfirmadaOFinalizada = al.estado_agenda === 'Alta Efectiva' || al.estado_agenda === 'Alta Ilegal' || al.estado_agenda === 'Alta Finalizada';
    if (esAltaConfirmadaOFinalizada || al.checklist_alta) {
        const checks = al.checklist_alta || [false, false, false, false, false];
        const pasostitulos = [
            '1. Suscripción abonada',
            '2. Carga en Sistema',
            '3. Profesor notificado',
            '4. Bienvenida a alumno',
            '5. Alumno en grupo WhatsApp'
        ];
        const completados = checks.filter(Boolean).length;
        const porcentaje = Math.round((completados / 5) * 100);
        const barColor = completados === 5 ? 'var(--accent-teal)' : (completados >= 3 ? '#e5a93d' : 'var(--accent-red)');

        checklistHtml = `
            <div id="chk-wrapper-${id}" class="alta-checklist-wrapper" style="margin-top:8px; padding:8px 12px; background:var(--hover-bg); border-radius:10px; border:1px solid var(--border-color);" onclick="event.stopPropagation();">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:12px; cursor:pointer; user-select:none;" onclick="window.toggleChecklistPill('chk-list-${id}', 'chk-icon-${id}')" title="Clic para ver o completar los pasos del checklist">
                    <div style="display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; color:var(--text-main);">
                        <span id="chk-icon-${id}" style="font-size:9px; color:#64748b; transition:transform 0.2s ease; display:inline-block;">▶</span>
                        <span id="chk-title-${id}">📋 Checklist de Alta (${completados}/5)</span>
                    </div>
                    <span id="chk-pct-${id}" style="color:${barColor}; font-size:11.5px; font-weight:800; margin-left:auto; padding-left:16px; white-space:nowrap;">${porcentaje}%</span>
                </div>
                <div style="width:100%; height:5px; background:#e9e5de; border-radius:4px; overflow:hidden; margin-top:5px; cursor:pointer;" onclick="window.toggleChecklistPill('chk-list-${id}', 'chk-icon-${id}')">
                    <div id="chk-bar-${id}" style="width:${porcentaje}%; height:100%; background:${barColor}; transition:width 0.3s ease, background 0.3s ease;"></div>
                </div>
                <div id="chk-list-${id}" class="checklist-items-collapsible" style="display:none; flex-wrap:wrap; gap:8px 12px; font-size:11px; color:var(--text-muted); margin-top:9px; padding-top:8px; border-top:1px dashed var(--border-color);">
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
    } else if (al.horario_match || al.reserva_inicio || al.reserva_fecha_texto || al.fecha_inicio_clases) {
        let fechaTxt = '';
        if (al.reserva_inicio) {
            fechaTxt = formatearFechaHoraEstandar(al.reserva_inicio);
        } else if (al.fecha_inicio_clases) {
            fechaTxt = formatearFechaHoraEstandar(al.fecha_inicio_clases);
        } else if (al.horario_match) {
            fechaTxt = formatearFechaHoraEstandar(al.horario_match);
        } else if (al.reserva_fecha_texto) {
            fechaTxt = formatearFechaHoraEstandar(al.reserva_fecha_texto);
        }
        const tieneEv = Boolean(al.id_evento_alta || al.id_evento_reserva || al.reserva_id_evento || al.fecha_inicio_clases || al.horario_match);
        const syncBadge = tieneEv 
            ? `<button type="button" class="btn-auditar-cal-fila" data-id="${id}" onclick="event.stopPropagation(); window.auditarCalendarioAlumnoFila('${id}', this);" title="Verificar sincronización con Google Calendar" style="background:none; border:none; cursor:pointer; font-size:12px; padding:1px 4px; border-radius:4px; line-height:1; vertical-align:middle; transition:transform 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)'" onmouseout="this.style.background='none'"><span class="icon-spin-fila">🔄</span></button>` 
            : '';
        fechaMetaHtml = `<div style="font-size:11px; color:var(--text-muted); font-weight:600; display:flex; align-items:center; gap:4px; flex-wrap:wrap;"><span>📅 ${fechaTxt}</span>${syncBadge}</div>`;
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
                    <!-- Columna 1: Alumno y Datos -->
                    <div class="row-header">
                        <input type="checkbox" class="bulk-chk" data-id="${id}" onclick="event.stopPropagation(); window.toggleBulkSelection('${id}', this.checked)">
                        <div class="row-indicator ${info.colorIndicador}"></div>
                        <div class="row-main-info" style="display:flex; flex-direction:column; align-items:flex-start; text-align:left; gap:2px;">
                            <div class="row-name" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; text-align:left;">
                                <span style="font-weight:700; color:var(--text-main); font-size:14.5px;">${al.nombre}</span>
                                <button type="button" class="btn-nota-rapida-directo" data-id="${id}" onclick="event.stopPropagation(); window.abrirNotaRapidaDirecta('${id}', '${(al.nombre || '').replace(/'/g, "\\'")}');" title="Agregar nota rápida al historial" style="background:none; border:none; cursor:pointer; font-size:13px; padding:1px 4px; border-radius:4px; opacity:0.65; vertical-align:middle; line-height:1; transition:opacity 0.2s, background 0.2s;" onmouseover="this.style.opacity='1'; this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.opacity='0.65'; this.style.background='none';">📝</button>
                            </div>
                            ${filaDatosHtml}
                            ${tagsHtml}
                        </div>
                    </div>

                    <!-- Columna 2: Estado del Alumno (Columna Dedicada Fija) -->
                    <div class="col-status-wrapper">
                        ${(estadoActualVista === 'Lista de Espera' && al.estado_agenda === 'Lista de espera') ? '' : `<span class="status-badge ${info.colorBadge}">${info.txtEstado}</span>`}
                    </div>

                    <!-- Columna 3: Grilla Semanal Fija -->
                    ${dispHtml}
                    ${checklistAdmisionHtml}
                    ${checklistHtml}

                    <!-- Columna 4: Meta & Agenda / Prioridad -->
                    <div class="row-meta">
                        <div>${((estadoActualVista && (estadoActualVista.startsWith('Inbox') || estadoActualVista === 'Lista de Espera' || estadoActualVista === 'Dashboard')) || ['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno', 'Agenda confirmada', 'Agenda suspendida', 'Lista de espera'].includes(al.estado_agenda)) ? 'Evaluador' : 'Profe'}: <strong style="color:var(--text-main);" title="${al.reserva_profe_nombre || ''}">${al.reserva_profe_nombre ? (al.reserva_profe_nombre.length > 25 ? al.reserva_profe_nombre.split(' ').slice(0, 3).join(' ') + '...' : al.reserva_profe_nombre) : '-'}</strong></div>
                        ${al.grupo_asignado ? `<div>Grupo: <strong style="color:var(--accent-teal);">${al.grupo_asignado}</strong></div>` : ''}
                        ${fechaMetaHtml}
                        ${info.badgePillHtml ? info.badgePillHtml : (info.txtTiempo ? `<div class="priority-text ${info.claseTexto}" style="margin-top:2px;">${info.txtTiempo}</div>` : '')}
                    </div>

                    <!-- Columna 5: Botones de Acción -->
                    ${menuAcciones}
                </div>
            </div>
        </div>
    `;
}

window.abrirNotaRapidaDirecta = function(id, nombre) {
    const elId = document.getElementById('nota-rapida-id');
    const elNom = document.getElementById('nota-rapida-alumno-nombre');
    const elTxt = document.getElementById('nota-rapida-texto');
    const modal = document.getElementById('modal-nota-rapida');
    if (elId) elId.value = id;
    if (elNom) elNom.textContent = nombre ? `Alumno: ${nombre}` : '';
    if (elTxt) elTxt.value = '';
    if (modal) modal.showModal();
};

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
    if (isChecked && !selectedBulkIds.includes(id)) {
        selectedBulkIds.push(id);
    } else if (!isChecked) {
        const idx = selectedBulkIds.indexOf(id);
        if (idx !== -1) selectedBulkIds.splice(idx, 1);
    }
    actualizarBulkBar();
}

function actualizarBulkBar() {
    const bar = document.getElementById('bulk-actions-bar');
    const btnProp = document.getElementById('btn-bulk-propuesta-grupo');
    const btnDevolver = document.getElementById('btn-bulk-devolver-espera');
    const btnBD = document.getElementById('btn-bulk-copiar-bd');
    const btnFact = document.getElementById('btn-bulk-copiar-fact');
    const btnAuditCal = document.getElementById('btn-bulk-auditar-cal');
    if (selectedBulkIds.length > 0) {
        document.getElementById('bulk-count').textContent = `${selectedBulkIds.length} seleccionados`;
        bar.style.display = 'flex';

        const u = window.usuarioActual || {};
        const rolesArr = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.rol || ''];
        const puedeArmarGrupos = rolesArr.includes('admin') || rolesArr.includes('coordinador_grupos');

        // Nueva Propuesta de Grupo: SOLO para Coordinador de Grupos y Administrador
        if (btnProp) {
            const vistaApta = (estadoActualVista === 'Lista de Espera' || selectedBulkIds.length >= 2);
            btnProp.style.display = (puedeArmarGrupos && vistaApta) ? 'inline-block' : 'none';
        }
        
        // Devolver a Espera masivo disponible en vistas de Altas o Match
        if (btnDevolver) {
            const puedeDevolver = ['Altas - Pendientes', 'Altas - En Curso', 'Altas - Suspendidas', 'Match - En Validacion'].includes(estadoActualVista);
            btnDevolver.style.display = puedeDevolver ? 'inline-block' : 'none';
        }

        // Generar registro BD / Facturación SOLO en Altas Confirmadas o Finalizadas
        const esAltasEfectivas = estadoActualVista === 'Altas - Confirmadas' || estadoActualVista === 'Altas - Finalizadas';
        if (btnBD) btnBD.style.display = esAltasEfectivas ? 'inline-block' : 'none';
        if (btnFact) btnFact.style.display = esAltasEfectivas ? 'inline-block' : 'none';

        if (btnAuditCal) {
            const u = window.usuarioActual || {};
            const r = (u.rol || '').toLowerCase();
            const esAdminOAdmisor = r === 'admin' || r === 'admisor' || r === 'admisiones' || (Array.isArray(u.roles) && (u.roles.includes('admin') || u.roles.includes('admisor')));
            btnAuditCal.style.display = esAdminOAdmisor ? 'inline-block' : 'none';
        }
    } else {
        bar.style.display = 'none';
    }
}

document.getElementById('btn-bulk-cancelar').addEventListener('click', () => {
    selectedBulkIds.splice(0);
    document.querySelectorAll('.bulk-chk').forEach(c => c.checked = false);
    actualizarBulkBar();
});

const btnBulkDevolver = document.getElementById('btn-bulk-devolver-espera');
if (btnBulkDevolver) {
    btnBulkDevolver.addEventListener('click', async () => {
        const motivo = prompt(`¿Motivo para devolver a Lista de Espera a los ${selectedBulkIds.length} alumnos seleccionados?`);
        if (!motivo) return;
        mostrarIndicadorCarga(`Devolviendo ${selectedBulkIds.length} alumnos a Lista de Espera...`);
        const idsToProcess = [...selectedBulkIds];
        for (let id of idsToProcess) {
            try {
                removerFilaOptimista(id);
                const alDoc = await getDoc(doc(db, "alumnos", id));
                if (!alDoc.exists()) continue;
                const al = alDoc.data();

                // Eliminar de calendar solo si efectivamente tiene ID de evento
                if (al.id_evento_alta) await eliminarEventoAltaSeguro(al, configApp);
                if (al.id_evento_reserva) await eliminarEventoSeguro(al, configApp);

                const hist = al.historial || [];
                hist.push(crearEntradaHistorial(`Devuelto masivamente a Lista de Espera desde ${estadoActualVista}. Motivo: ${motivo.trim()}`, 'estado'));
                
                await updateDoc(doc(db, "alumnos", id), {
                    estado_agenda: "Lista de espera",
                    grupo_asignado: null,
                    horario_match: null,
                    dia_match: null,
                    horario_inicio_match: null,
                    horario_fin_match: null,
                    profesor_id: null,
                    profesor_asignado: null,
                    fecha_sugerida_inicio: null,
                    fecha_inicio_clases: null,
                    id_evento_alta: null,
                    calendario_evento_alta: null,
                    id_evento_reserva: null,
                    calendario_evento_reserva: null,
                    checklist_alta: null,
                    historial: hist
                });
            } catch(e) {
                console.error("Error al devolver masivo a espera:", e);
            }
        }
        selectedBulkIds.splice(0);
        actualizarBulkBar();
        await cargarVista(estadoActualVista);
        ocultarIndicadorCarga();
        alert("✅ Alumnos devueltos a Lista de Espera correctamente.");
    });
}

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
            const hist = al.historial || [];
            hist.push(crearEntradaHistorial(`Alumno suspendido masivamente. Motivo: ${motivo.trim()}. Cupos y eventos liberados.`, 'suspension'));
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda suspendida", motivo_suspension: motivo, reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, historial: hist });
        } catch(e) {}
    }
    selectedBulkIds.splice(0);
    actualizarBulkBar();
    await cargarVista(estadoActualVista);
    ocultarIndicadorCarga();
    alert("✅ Registros suspendidos correctamente.");
});

// =======================================================================
// AUDITORÍA Y RESINCRONIZACIÓN CON GOOGLE CALENDAR
// =======================================================================

let alumnoAuditoriaActual = null;
let botonFilaAuditoriaActual = null;

window.auditarCalendarioAlumnoFila = async function(id, btnEl) {
    if (!id) return;
    if (btnEl) setBotonCargando(btnEl, true);

    try {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) {
            if (btnEl) setBotonCargando(btnEl, false);
            return mostrarToast("Alumno no encontrado.", "error");
        }
        const al = { id, ...alDoc.data() };
        alumnoAuditoriaActual = al;
        botonFilaAuditoriaActual = btnEl;

        const res = await verificarEstadoEventoCalendar(al, configApp);
        if (btnEl) setBotonCargando(btnEl, false);

        if (res.estado === 'OK') {
            if (btnEl) {
                btnEl.innerHTML = '<span style="color:#059669; font-weight:800;">🟢</span>';
                btnEl.title = "Sincronizado OK con Google Calendar";
            }
            mostrarToast("✅ Sincronizado: " + (al.nombre || 'Alumno') + " coincide con Google Calendar.");
        } else if (res.estado === 'NO_EXISTE' || res.estado === 'DESFASAJE_HORARIO') {
            if (btnEl) {
                btnEl.innerHTML = '<span style="color:#d97706; font-weight:800;">🟡</span>';
                btnEl.title = "Desfasaje detectado con Google Calendar";
            }
            window.abrirModalDiscrepanciaCalendar(al, res, btnEl);
        } else {
            if (btnEl) {
                btnEl.innerHTML = '<span style="color:#64748b;">⚪</span>';
                btnEl.title = res.mensaje || "Sin datos de calendario";
            }
            mostrarToast("ℹ️ " + (res.mensaje || "Sin datos de calendario."));
        }
    } catch(err) {
        if (btnEl) setBotonCargando(btnEl, false);
        mostrarToast("❌ Error al auditar calendario: " + err.message, "error");
    }
};

window.auditarCalendarioAlumno = async function(id) {
    const btnFila = document.querySelector(`.btn-auditar-cal-fila[data-id="${id}"]`);
    await window.auditarCalendarioAlumnoFila(id, btnFila);
};

window.abrirModalDiscrepanciaCalendar = function(al, resAudit, btnEl = null) {
    const modal = document.getElementById('modal-discrepancia-calendar');
    if (!modal) return;

    alumnoAuditoriaActual = al;
    botonFilaAuditoriaActual = btnEl;

    document.getElementById('modal-disc-alumno-id').value = al.id;
    document.getElementById('modal-disc-alumno-nombre').textContent = al.nombre || 'Alumno';
    document.getElementById('modal-disc-cal-fecha-iso').value = resAudit.fechaCalendar || '';
    document.getElementById('modal-disc-cal-evento-id').value = resAudit.evId || '';

    // Formatear fechas
    let fechaSisTxt = '-';
    if (al.fecha_inicio_clases) {
        fechaSisTxt = formatearFechaAmi(al.fecha_inicio_clases);
    } else if (al.horario_match || al.reserva_fecha_texto) {
        fechaSisTxt = al.horario_match || al.reserva_fecha_texto;
    }
    document.getElementById('modal-disc-fecha-sistema').textContent = fechaSisTxt;

    let fechaCalTxt = 'No existe / Eliminado';
    if (resAudit.fechaCalendar) {
        fechaCalTxt = formatearFechaAmi(resAudit.fechaCalendar);
    }
    document.getElementById('modal-disc-fecha-calendar').textContent = fechaCalTxt;

    const btnRecrear = document.getElementById('btn-modal-disc-recrear');
    const btnTraerCal = document.getElementById('btn-modal-disc-traer-cal');
    const btnForzarCal = document.getElementById('btn-modal-disc-forzar-cal');

    if (resAudit.estado === 'NO_EXISTE') {
        document.getElementById('modal-disc-icon').textContent = '🔴';
        document.getElementById('modal-disc-titulo').textContent = 'Evento no encontrado en Google Calendar';
        document.getElementById('modal-disc-subtitulo').textContent = 'El evento fue eliminado en Google Calendar o nunca llegó a crearse.';
        document.getElementById('modal-disc-mensaje-detalle').textContent = 'Podes recrear el evento en Google Calendar usando la fecha y hora oficial del sistema, o mantener el registro como está.';
        if (btnRecrear) btnRecrear.style.display = 'inline-block';
        if (btnTraerCal) btnTraerCal.style.display = 'none';
        if (btnForzarCal) btnForzarCal.style.display = 'none';
    } else if (resAudit.estado === 'DESFASAJE_HORARIO') {
        document.getElementById('modal-disc-icon').textContent = '⚠️';
        document.getElementById('modal-disc-titulo').textContent = 'Desfasaje de Horario con Google Calendar';
        document.getElementById('modal-disc-subtitulo').textContent = 'El horario del evento en Calendar difiere del registrado en la App.';
        document.getElementById('modal-disc-mensaje-detalle').textContent = '¿Deseas actualizar el horario en la app trayendo el de Calendar, o forzar a Calendar a volver al horario del sistema?';
        if (btnRecrear) btnRecrear.style.display = 'none';
        if (btnTraerCal) btnTraerCal.style.display = 'inline-block';
        if (btnForzarCal) btnForzarCal.style.display = 'inline-block';
    }

    modal.showModal();
};

// Handlers de botones del modal de discrepancias
document.getElementById('btn-close-modal-disc')?.addEventListener('click', () => {
    document.getElementById('modal-discrepancia-calendar')?.close();
    if (botonFilaAuditoriaActual) {
        botonFilaAuditoriaActual.innerHTML = '<span style="color:#d97706; font-weight:800;">🟡</span>';
    }
});

document.getElementById('btn-modal-disc-cancelar')?.addEventListener('click', () => {
    document.getElementById('modal-discrepancia-calendar')?.close();
    if (botonFilaAuditoriaActual) {
        botonFilaAuditoriaActual.innerHTML = '<span style="color:#d97706; font-weight:800;">🟡</span>';
    }
    mostrarToast("ℹ️ Registro mantenido con advertencia de desincronización (🟡).");
});

document.getElementById('btn-modal-disc-recrear')?.addEventListener('click', async () => {
    if (!alumnoAuditoriaActual) return;
    mostrarIndicadorCarga("Recreando evento en Google Calendar...");
    try {
        await recrearEventoFaltanteCalendar(alumnoAuditoriaActual, configApp);
        document.getElementById('modal-discrepancia-calendar')?.close();
        if (botonFilaAuditoriaActual) {
            botonFilaAuditoriaActual.innerHTML = '<span style="color:#059669; font-weight:800;">🟢</span>';
        }
        ocultarIndicadorCarga();
        mostrarToast("✅ Evento recreado y sincronizado exitosamente en Google Calendar.");
        await cargarVista(estadoActualVista);
    } catch(err) {
        ocultarIndicadorCarga();
        alert("Error al recrear evento: " + err.message);
    }
});

document.getElementById('btn-modal-disc-traer-cal')?.addEventListener('click', async () => {
    if (!alumnoAuditoriaActual) return;
    const fCalIso = document.getElementById('modal-disc-cal-fecha-iso').value;
    const evId = document.getElementById('modal-disc-cal-evento-id').value;
    if (!fCalIso) return alert("Fecha de Calendar no disponible.");

    mostrarIndicadorCarga("Alineando Sistema desde Google Calendar...");
    try {
        await alinearSistemaDesdeCalendar(alumnoAuditoriaActual, fCalIso, evId, configApp);
        document.getElementById('modal-discrepancia-calendar')?.close();
        if (botonFilaAuditoriaActual) {
            botonFilaAuditoriaActual.innerHTML = '<span style="color:#059669; font-weight:800;">🟢</span>';
        }
        ocultarIndicadorCarga();
        mostrarToast("✅ Sistema actualizado con el nuevo horario de Google Calendar.");
        await cargarVista(estadoActualVista);
    } catch(err) {
        ocultarIndicadorCarga();
        alert("Error al alinear sistema: " + err.message);
    }
});

document.getElementById('btn-modal-disc-forzar-cal')?.addEventListener('click', async () => {
    if (!alumnoAuditoriaActual) return;
    mostrarIndicadorCarga("Alineando Google Calendar con el Sistema...");
    try {
        await alinearEventoHaciaCalendar(alumnoAuditoriaActual, configApp);
        document.getElementById('modal-discrepancia-calendar')?.close();
        if (botonFilaAuditoriaActual) {
            botonFilaAuditoriaActual.innerHTML = '<span style="color:#059669; font-weight:800;">🟢</span>';
        }
        ocultarIndicadorCarga();
        mostrarToast("✅ Google Calendar alineado con el horario oficial del Sistema.");
        await cargarVista(estadoActualVista);
    } catch(err) {
        ocultarIndicadorCarga();
        alert("Error al forzar horario en Calendar: " + err.message);
    }
});

// Botón de auditoría individual dentro del Modal de Edición Alumno
document.getElementById('btn-modal-auditar-cal')?.addEventListener('click', async () => {
    const id = document.getElementById('alumno-id')?.value;
    if (!id) return;
    const btn = document.getElementById('btn-modal-auditar-cal');
    const badge = document.getElementById('badge-modal-cal-status');
    if (btn) setBotonCargando(btn, true);

    try {
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) {
            if (btn) setBotonCargando(btn, false);
            return mostrarToast("Alumno no encontrado.", "error");
        }
        const al = { id, ...alDoc.data() };
        const res = await verificarEstadoEventoCalendar(al, configApp);
        if (btn) setBotonCargando(btn, false);

        if (res.estado === 'OK') {
            if (badge) {
                badge.textContent = '🟢 Sincronizado OK';
                badge.style.background = '#dcfce7';
                badge.style.color = '#166534';
            }
            mostrarToast("✅ Sincronizado correctamente con Google Calendar.");
        } else if (res.estado === 'NO_EXISTE') {
            if (badge) {
                badge.textContent = '🔴 No existe en Calendar';
                badge.style.background = '#fee2e2';
                badge.style.color = '#991b1b';
            }
            window.abrirModalDiscrepanciaCalendar(al, res);
        } else if (res.estado === 'DESFASAJE_HORARIO') {
            if (badge) {
                badge.textContent = '🟡 Horario Desfasado';
                badge.style.background = '#fef3c7';
                badge.style.color = '#92400e';
            }
            window.abrirModalDiscrepanciaCalendar(al, res);
        } else {
            if (badge) {
                badge.textContent = '⚪ ' + (res.mensaje || 'Sin datos');
                badge.style.background = '#e2e8f0';
                badge.style.color = '#475569';
            }
            mostrarToast("ℹ️ " + (res.mensaje || "Sin datos."));
        }
    } catch(e) {
        if (btn) setBotonCargando(btn, false);
        mostrarToast("❌ Error al verificar: " + e.message, "error");
    }
});

// Botón de auditoría masiva de seleccionados
const btnBulkAuditarCal = document.getElementById('btn-bulk-auditar-cal');
if (btnBulkAuditarCal) {
    btnBulkAuditarCal.addEventListener('click', async () => {
        const ids = [...selectedBulkIds];
        if (ids.length === 0) return alert("Seleccioná al menos un alumno para auditar.");

        const u = window.usuarioActual || {};
        const r = (u.rol || '').toLowerCase();
        const esAdminOAdmisor = r === 'admin' || r === 'admisor' || r === 'admisiones' || (Array.isArray(u.roles) && (u.roles.includes('admin') || u.roles.includes('admisor')));
        if (!esAdminOAdmisor) {
            return alert("⛔ Esta acción solo puede ser ejecutada por un Admisor o Administrador.");
        }

        mostrarIndicadorCarga(`Iniciando auditoría de ${ids.length} alumno(s)...`);
        let okCount = 0, noExisteCount = 0, desfasajeCount = 0, sinCalCount = 0;

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            mostrarIndicadorCarga(`Auditando alumno ${i + 1} de ${ids.length}...`);
            try {
                const alDoc = await getDoc(doc(db, "alumnos", id));
                if (alDoc.exists()) {
                    const al = { id, ...alDoc.data() };
                    const res = await verificarEstadoEventoCalendar(al, configApp);
                    const btnFila = document.querySelector(`.btn-auditar-cal-fila[data-id="${id}"]`);

                    if (res.estado === 'OK') {
                        okCount++;
                        if (btnFila) btnFila.innerHTML = '<span style="color:#059669; font-weight:800;">🟢</span>';
                    } else if (res.estado === 'NO_EXISTE') {
                        noExisteCount++;
                        if (btnFila) btnFila.innerHTML = '<span style="color:#ef4444; font-weight:800;">🔴</span>';
                    } else if (res.estado === 'DESFASAJE_HORARIO') {
                        desfasajeCount++;
                        if (btnFila) btnFila.innerHTML = '<span style="color:#d97706; font-weight:800;">🟡</span>';
                    } else {
                        sinCalCount++;
                        if (btnFila) btnFila.innerHTML = '<span style="color:#64748b;">⚪</span>';
                    }
                }
            } catch(e) {
                console.warn(`Error auditando alumno ${id}:`, e);
            }
        }

        ocultarIndicadorCarga();
        alert(`🔍 Resumen de Auditoría de Google Calendar (${ids.length} revisados):\n\n` +
              `• 🟢 Sincronizados OK: ${okCount}\n` +
              `• 🔴 No encontrados / Borrados: ${noExisteCount}\n` +
              `• 🟡 Horarios desfasados: ${desfasajeCount}\n` +
              `• ⚪ Sin evento / Sin calendario: ${sinCalCount}\n\n` +
              `Los registros con alertas quedaron identificados en la lista con su icono correspondiente.`);
    });
}

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
        const u = window.usuarioActual || {};
        const rolesArr = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.rol || ''];
        const puedeArmarGrupos = rolesArr.includes('admin') || rolesArr.includes('coordinador_grupos');
        if (!puedeArmarGrupos) {
            alert('Solo el Coordinador de Grupos y Administrador pueden armar propuestas de grupo.');
            return;
        }
        if (window.matchAlumnosSeleccionados && window.matchAlumnosSeleccionados.size >= 2) {
            selectedBulkIds = Array.from(window.matchAlumnosSeleccionados);
            window.selectedBulkIds = selectedBulkIds;
        }
        if (selectedBulkIds.length < 2) {
            alert('Por favor seleccioná al menos 2 alumnos para armar una propuesta de grupo.');
            return;
        }
        await abrirModalPrealtaGrupal(selectedBulkIds);
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
            qP.forEach(d => {
                const dt = d.data();
                if (dt.activo !== false && dt.estado !== 'inactivo') {
                    profesList.push({ id: d.id, ...dt });
                }
            });
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
    const [h, m] = horaIni.split(':');
    const mmStr = (!m || parseInt(m, 10) === 0) ? '' : `.${m}`;
    const profeNombre = selProfe?.selectedOptions[0]?.getAttribute('data-nombre') || '';
    const primerNombreProfe = profeNombre.split(' ')[0] || 'Profe';

    const inputNom = document.getElementById('propuesta-manual-nombre');
    if (inputNom && (!inputNom.value || inputNom.dataset.autogenerado === 'true')) {
        inputNom.value = `${dia}${parseInt(h, 10)}${mmStr} ${primerNombreProfe}`;
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
            selectedBulkIds.splice(0);
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

    // Filtro multi-select de evaluadores
    if (filtrosSeleccionados.evaluadores && filtrosSeleccionados.evaluadores.size > 0) {
        filtrados = filtrados.filter(al => {
            const profeAl = (al.reserva_profe_nombre || al.profesor_asignado || '').toLowerCase().trim();
            return Array.from(filtrosSeleccionados.evaluadores).some(selEv => profeAl.includes(selEv.toLowerCase().trim()));
        });
    }

    // Filtro por rango de edad manual min / max
    if (filtrosSeleccionados.edadMin !== null && filtrosSeleccionados.edadMin !== '') {
        const minE = Number(filtrosSeleccionados.edadMin);
        filtrados = filtrados.filter(al => {
            const e = typeof al.edad === 'number' ? al.edad : Number(al.edad);
            return !isNaN(e) && e >= minE;
        });
    }
    if (filtrosSeleccionados.edadMax !== null && filtrosSeleccionados.edadMax !== '') {
        const maxE = Number(filtrosSeleccionados.edadMax);
        filtrados = filtrados.filter(al => {
            const e = typeof al.edad === 'number' ? al.edad : Number(al.edad);
            return !isNaN(e) && e <= maxE;
        });
    }

    // Filtro por etapas etarias predefinidas (Reglas: Niños <=13, Adolescentes 14-19, Adultos 20-59, Mayores 60+)
    if (filtrosSeleccionados.gruposEtarios && filtrosSeleccionados.gruposEtarios.size > 0) {
        filtrados = filtrados.filter(al => {
            const e = typeof al.edad === 'number' ? al.edad : Number(al.edad);
            if (isNaN(e) || e <= 0) return false;
            return Array.from(filtrosSeleccionados.gruposEtarios).some(g => {
                if (g === 'ninos') return e <= 13;
                if (g === 'adolescentes') return e >= 14 && e <= 19;
                if (g === 'adultos') return e >= 20 && e <= 59;
                if (g === 'adultos_mayores') return e >= 60;
                return false;
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

export function debeFiltrarPorEvaluador() {
    const u = window.usuarioActual || {};
    const roles = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.rol || 'admisor'];
    const esAdmin = roles.includes('admin') || u.rol === 'admin' || u.email?.toLowerCase() === 'productora.mandalahouse@gmail.com';
    const esAdmisor = roles.includes('admisiones') || roles.includes('admisor') || u.rol === 'admisiones' || u.rol === 'admisor';
    const modo = window.modoRolActivo;

    // Si explícitamente activó el modo evaluador en el selector
    if (modo === 'evaluador') return true;

    // Si explícitamente está en modo admisor, admin, multi o coordinador_grupos, NO filtra por evaluador
    if (modo === 'admisor' || modo === 'admisiones' || modo === 'admin' || modo === 'multi' || modo === 'coordinador_grupos') {
        return false;
    }

    // Si no es admin ni admisor, NUNCA puede ver los alumnos de otros evaluadores
    if (!esAdmin && !esAdmisor) {
        return true;
    }

    return false;
}
window.debeFiltrarPorEvaluador = debeFiltrarPorEvaluador;

export function esModoEvaluadorActivo() {
    const modo = window.modoRolActivo;
    if (modo === 'evaluador') return true;
    if (modo === 'admisor' || modo === 'admisiones' || modo === 'admin' || modo === 'multi' || modo === 'coordinador_grupos' || modo === 'profesor') {
        return false;
    }
    return debeFiltrarPorEvaluador();
}
window.esModoEvaluadorActivo = esModoEvaluadorActivo;

export function filtrarAlumnosEvaluador(alumnos) {
    const u = window.usuarioActual;
    if (!u) return alumnos;
    
    const userEmail = (u.email || '').toLowerCase().trim();
    const userCalId = (u.correo_calendario || u.email || '').toLowerCase().trim();
    const userId = u.id || '';
    const userProfId = u.profesor_id || '';
    
    const norm = (txt) => (txt || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const userNom = norm(u.nombre || '');

    return alumnos.filter(al => {
        const alReservaNom = norm(al.reserva_profe_nombre || al.profesor_asignado || '');
        const alReservaId = al.reserva_profe_id || al.profesor_id || '';
        const alCalId = (al.reserva_cal_id || '').toLowerCase().trim();
        const alOwner = (al.test_owner || '').toLowerCase().trim();

        // 1. REGLA ESTRICTA DE EVALUADOR ASIGNADO:
        // Si el alumno tiene nombre de evaluador asignado, DEBE coincidir exactamente con el nombre del usuario
        if (alReservaNom && userNom) {
            return alReservaNom === userNom;
        }

        // 2. Coincidencia por ID de Profesor / Evaluador
        if (alReservaId) {
            if (userProfId && alReservaId === userProfId) return true;
            if (userId && alReservaId === userId) return true;
            return false;
        }

        // 3. Coincidencia por Correo de Calendario de Reserva
        if (alCalId) {
            if (userEmail && alCalId === userEmail) return true;
            if (userCalId && alCalId === userCalId) return true;
            return false;
        }

        // 4. Coincidencia por Test Owner
        if (alOwner && userEmail && alOwner === userEmail) {
            return true;
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
        if (prio === 'todos') {
            btn.style.background = isActive ? '#1e293b' : '#ffffff';
            btn.style.color = isActive ? '#ffffff' : '#334155';
            btn.style.borderColor = isActive ? '#1e293b' : '#cbd5e1';
            btn.style.fontWeight = isActive ? '700' : '600';
            btn.style.boxShadow = isActive ? '0 2px 6px rgba(30,41,59,0.25)' : '0 1px 2px rgba(0,0,0,0.03)';
        } else if (prio === 'vencidos') {
            btn.style.background = isActive ? '#fee2e2' : '#ffffff';
            btn.style.color = isActive ? '#991b1b' : '#b91c1c';
            btn.style.borderColor = isActive ? '#ef4444' : '#fecaca';
            btn.style.fontWeight = isActive ? '700' : '600';
            btn.style.boxShadow = isActive ? '0 2px 6px rgba(239,68,68,0.2)' : '0 1px 2px rgba(0,0,0,0.03)';
        } else if (prio === 'urgentes') {
            btn.style.background = isActive ? '#ffedd5' : '#ffffff';
            btn.style.color = isActive ? '#9a3412' : '#c2410c';
            btn.style.borderColor = isActive ? '#f97316' : '#fed7aa';
            btn.style.fontWeight = isActive ? '700' : '600';
            btn.style.boxShadow = isActive ? '0 2px 6px rgba(249,115,22,0.2)' : '0 1px 2px rgba(0,0,0,0.03)';
        } else if (prio === 'proximos') {
            btn.style.background = isActive ? '#fef9c3' : '#ffffff';
            btn.style.color = isActive ? '#854d0e' : '#854d0e';
            btn.style.borderColor = isActive ? '#eab308' : '#fef08a';
            btn.style.fontWeight = isActive ? '700' : '600';
            btn.style.boxShadow = isActive ? '0 2px 6px rgba(234,179,8,0.2)' : '0 1px 2px rgba(0,0,0,0.03)';
        }
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
    const esEval = esModoEvaluadorActivo();
    const rol = u.rol || 'admisiones';

    let inboxTabs = [];
    if (esEval) {
        inboxTabs = [
            { 
                vista: 'Inbox - Confirmadas', 
                label: 'Entrevistas Confirmadas', 
                icon: '✅', 
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
            { vista: 'Match - Pendientes', label: 'Armar Grupos y Clases', icon: '🔍', countFn: (alumnos) => alumnos.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'lista de espera').length },
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
    const esEval = esModoEvaluadorActivo();

    // Conteo Inbox según rol
    let countInbox = 0;
    if (esEval) {
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
    if (!tabs || tabs.length <= 1) {
        container.style.display = 'none';
        bar.innerHTML = '';
        return;
    }
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
    const mods = obtenerModulosPermitidosModoActivo();
    return mods.includes(moduloDestino);
}

export function obtenerIniciales(nombre) {
    if (!nombre) return 'U';
    const partes = nombre.trim().split(/\s+/);
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function obtenerRolesDisponibles(usuario) {
    if (!usuario) return ['evaluador'];
    const rolesSet = new Set();
    const rolesArr = Array.isArray(usuario.roles) && usuario.roles.length > 0 ? usuario.roles : [usuario.rol || 'admisor'];
    
    // Si es administrador o admin, puede ver todo o simular cualquier rol
    if (rolesArr.includes('admin') || usuario.rol === 'admin' || usuario.email?.toLowerCase() === 'productora.mandalahouse@gmail.com') {
        return ['multi', 'admin', 'admisor', 'coordinador_grupos', 'evaluador', 'profesor'];
    }

    rolesArr.forEach(r => {
        if (r === 'docente') rolesSet.add('profesor');
        else if (r === 'admisiones') rolesSet.add('admisor');
        else rolesSet.add(r);
    });

    if (usuario.profesor_id) {
        rolesSet.add('profesor');
    }

    const res = Array.from(rolesSet);
    if (res.length > 1 && !res.includes('multi')) {
        res.unshift('multi');
    }
    return res;
}

export function obtenerModulosPermitidosModoActivo() {
    const modo = window.modoRolActivo || 'multi';
    const usuario = window.usuarioActual || {};
    const rolesArr = Array.isArray(usuario.roles) && usuario.roles.length > 0 ? usuario.roles : [usuario.rol || 'admisor'];

    if (modo === 'evaluador') {
        return ['dashboard', 'inbox', 'espera'];
    } else if (modo === 'profesor' || modo === 'docente') {
        return ['portal_profesor'];
    } else if (modo === 'coordinador_grupos' || modo === 'coordinador') {
        return ['dashboard', 'espera', 'match', 'match_etapa4', 'altas'];
    } else if (modo === 'admisor' || modo === 'admisiones') {
        return ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas'];
    } else if (modo === 'admin') {
        return ['dashboard', 'portal_profesor', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas', 'configuracion'];
    } else {
        // modo multi: unión de todos los módulos habilitados del usuario
        if (rolesArr.includes('admin') || usuario.email?.toLowerCase() === 'productora.mandalahouse@gmail.com') {
            return ['dashboard', 'portal_profesor', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas', 'configuracion'];
        }
        const setMods = new Set();
        rolesArr.forEach(r => {
            const m = ROLES_MODULOS_DEFAULT[r] || [];
            m.forEach(mod => setMods.add(mod));
        });
        if (usuario.profesor_id) setMods.add('portal_profesor');
        if (Array.isArray(usuario.modulos_habilitados)) {
            usuario.modulos_habilitados.forEach(m => setMods.add(m));
        }
        return Array.from(setMods);
    }
}

export function cambiarModoRol(nuevoModo) {
    window.modoRolActivo = nuevoModo;
    try {
        localStorage.setItem('mandala_modo_rol', nuevoModo);
    } catch(e) {}

    configurarHeaderUsuarioYRoles();
    configurarSidebarPorPermisos();

    // Redirigir a vista adecuada si la actual no está disponible en este rol
    const vistaActual = estadoActualVista;
    const modsPermitidos = obtenerModulosPermitidosModoActivo();

    if (nuevoModo === 'profesor') {
        cargarVista('Mis Alumnos y Ensambles');
    } else if (nuevoModo === 'evaluador' && (vistaActual.startsWith('Match') || vistaActual.startsWith('Altas') || vistaActual === 'Configuración' || vistaActual === 'Mis Alumnos y Ensambles' || vistaActual === 'Estadísticas')) {
        cargarVista('Dashboard');
    } else if (nuevoModo === 'coordinador_grupos' && (vistaActual === 'Mis Alumnos y Ensambles' || vistaActual === 'Configuración')) {
        cargarVista('Dashboard');
    } else if ((nuevoModo === 'admisor' || nuevoModo === 'admisiones') && (vistaActual === 'Mis Alumnos y Ensambles' || vistaActual === 'Configuración')) {
        cargarVista('Dashboard');
    } else {
        cargarVista(vistaActual);
    }

    const popover = document.getElementById('profile-popover');
    if (popover) popover.classList.remove('show');
}
window.cambiarModoRol = cambiarModoRol;

export function configurarHeaderUsuarioYRoles() {
    const u = window.usuarioActual;
    if (!u) return;

    const nombre = u.nombre || u.email.split('@')[0];
    const email = u.email || '';
    const iniciales = obtenerIniciales(nombre);
    const rolesDisponibles = obtenerRolesDisponibles(u);

    if (!window.modoRolActivo) {
        let guardado = null;
        try { guardado = localStorage.getItem('mandala_modo_rol'); } catch(e) {}
        if (guardado && rolesDisponibles.includes(guardado)) {
            window.modoRolActivo = guardado;
        } else {
            window.modoRolActivo = rolesDisponibles.length > 1 ? (rolesDisponibles.includes('evaluador') ? 'evaluador' : rolesDisponibles[0]) : (rolesDisponibles[0] || 'evaluador');
        }
    }

    const labelsRol = {
        multi: '🌐 Vista Global Multi-Rol',
        admin: '👑 Administrador',
        admisor: '📋 Admisor',
        admisiones: '📋 Admisor',
        coordinador_grupos: '👥 Coordinador de Grupos',
        evaluador: '📝 Evaluador',
        profesor: '🎸 Docente / Profesor'
    };

    const labelsRolBadge = {
        multi: '🌐 Multi-Rol ▾',
        admin: '👑 Admin ▾',
        admisor: '📋 Admisor ▾',
        admisiones: '📋 Admisor ▾',
        coordinador_grupos: '👥 Coordinador ▾',
        evaluador: '📝 Evaluador ▾',
        profesor: '🎸 Docente ▾'
    };

    const isSingleRole = rolesDisponibles.length <= 1;

    // Header Widget
    const elName = document.getElementById('widget-user-name');
    const elBadge = document.getElementById('widget-role-badge');
    const elAvatar = document.getElementById('widget-user-avatar');

    if (elName) elName.textContent = nombre;
    if (elAvatar) elAvatar.textContent = iniciales;
    if (elBadge) {
        elBadge.textContent = isSingleRole 
            ? (labelsRol[rolesDisponibles[0]] || rolesDisponibles[0] || 'Usuario')
            : (labelsRolBadge[window.modoRolActivo] || window.modoRolActivo);
    }

    // Popover Header
    const popAvatar = document.getElementById('popover-avatar');
    const popName = document.getElementById('popover-name');
    const popEmail = document.getElementById('popover-email');
    if (popAvatar) popAvatar.textContent = iniciales;
    if (popName) popName.textContent = nombre;
    if (popEmail) popEmail.textContent = email;

    // Popover Role Section
    const roleSec = document.getElementById('popover-role-section');
    const rolesCount = document.getElementById('popover-roles-count');
    const roleOptionsCont = document.getElementById('popover-role-options');

    if (roleSec) {
        if (isSingleRole) {
            roleSec.style.display = 'none';
        } else {
            roleSec.style.display = 'flex';
            if (rolesCount) rolesCount.textContent = `${rolesDisponibles.filter(r => r !== 'multi').length} ROLES`;
            if (roleOptionsCont) {
                roleOptionsCont.innerHTML = rolesDisponibles.map(r => `
                    <div class="role-option-item ${window.modoRolActivo === r ? 'selected' : ''}" onclick="window.cambiarModoRol('${r}')">
                        <span>${labelsRol[r] || r}</span>
                    </div>
                `).join('');
            }
        }
    }

    // Popover links
    const linkConfig = document.getElementById('popover-link-config');
    if (linkConfig) {
        const esAdmin = u.rol === 'admin' || (Array.isArray(u.roles) && u.roles.includes('admin')) || u.email?.toLowerCase() === 'productora.mandalahouse@gmail.com';
        linkConfig.style.display = (esAdmin && (window.modoRolActivo === 'admin' || window.modoRolActivo === 'multi')) ? 'flex' : 'none';
    }

    // Version label in sidebar
    const vLabel = document.getElementById('sidebar-version-label');
    if (vLabel) vLabel.textContent = APP_VERSION;
}

// =======================================================================
// AUTO-UPDATE & DETECCIÓN DE NUEVA VERSIÓN EN TIEMPO REAL
// =======================================================================
let versionCheckTimer = null;
let versionActualizando = false;

export async function chequearActualizacionVersion() {
    if (versionActualizando) return;
    try {
        const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const versionRemota = data.version;

        if (versionRemota && versionRemota !== APP_VERSION) {
            // Protección contra bucle infinito de recarga
            const recargaPrevia = sessionStorage.getItem('last_auto_reloaded_version');
            if (recargaPrevia === versionRemota) {
                console.warn(`[Auto-Update] Ya se realizó una recarga para ${versionRemota} en esta sesión. Se omite bucle.`);
                return;
            }
            sessionStorage.setItem('last_auto_reloaded_version', versionRemota);

            versionActualizando = true;
            console.log(`[Auto-Update] Nueva versión detectada: ${versionRemota} (Versión local: ${APP_VERSION})`);
            
            if (typeof mostrarToast === 'function') {
                mostrarToast(`✨ Nueva versión disponible (${versionRemota}). Actualizando...`, 'info');
            }

            // Limpieza de todos los Service Worker caches
            if ('caches' in window) {
                try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                } catch(e) {}
            }

            setTimeout(() => {
                window.location.reload(true);
            }, 1200);
        } else if (versionRemota === APP_VERSION) {
            sessionStorage.removeItem('last_auto_reloaded_version');
        }
    } catch(e) {
        // Silencioso en caso de estar offline o sin red
    }
}
window.chequearActualizacionVersion = chequearActualizacionVersion;

export function iniciarVerificadorVersion() {
    // Chequeo inicial liviano tras 3 segundos de login
    setTimeout(chequearActualizacionVersion, 3000);

    // Chequeo reactivo al volver a enfocar la app (Web o Celular)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            chequearActualizacionVersion();
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.getRegistration().then(reg => reg?.update());
            }
        }
    });

    // Chequeo periódico en segundo plano cada 15 minutos
    if (!versionCheckTimer) {
        versionCheckTimer = setInterval(chequearActualizacionVersion, 15 * 60 * 1000);
    }
}
window.iniciarVerificadorVersion = iniciarVerificadorVersion;

export function configurarSidebarPorPermisos() {
    const usuario = window.usuarioActual || {};
    const mods = obtenerModulosPermitidosModoActivo();
    const modo = window.modoRolActivo || 'multi';

    const esAdminActivo = modo === 'admin' || modo === 'multi';

    const navProfe = document.getElementById('nav-item-portal-profe');
    if (navProfe) {
        navProfe.style.display = mods.includes('portal_profesor') ? 'flex' : 'none';
    }

    const bottomNavProfe = document.getElementById('bottom-nav-portal-profe');
    if (bottomNavProfe) {
        bottomNavProfe.style.display = mods.includes('portal_profesor') ? 'flex' : 'none';
    }

    const btnNuevoAlumno = document.getElementById('btn-nuevo-alumno');
    if (btnNuevoAlumno) {
        const puedeCrear = esAdminActivo || mods.includes('admisiones') || modo === 'admisor';
        btnNuevoAlumno.style.display = (modo === 'evaluador' || modo === 'profesor') ? 'none' : (puedeCrear ? 'block' : 'none');
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

    // Sidebar items
    document.querySelectorAll('#sidebar .nav-item, #sidebar .nav-item-small').forEach(item => {
        const mod = item.getAttribute('data-modulo');
        if (!mod) return;
        if (item.id === 'nav-item-portal-profe') return;

        const idBuscado = modIdMap[mod] || mod.toLowerCase();
        const permitido = mods.includes(idBuscado);
        item.style.display = permitido ? 'flex' : 'none';
    });

    // Bottom nav items
    document.querySelectorAll('#bottom-nav .bottom-nav-item').forEach(item => {
        if (item.id === 'btn-bottom-menu') {
            item.style.display = 'flex';
            return;
        }
        if (item.id === 'bottom-nav-portal-profe') return;

        const mod = item.getAttribute('data-modulo');
        if (!mod) return;

        const idBuscado = modIdMap[mod] || mod.toLowerCase();
        const permitido = mods.includes(idBuscado);
        item.style.display = permitido ? 'flex' : 'none';
    });
}

// =======================================================================
// BÚSQUEDA GLOBAL UNIVERSAL
// =======================================================================
let ultimosAlumnosCargados = [];

export function ejecutarBusquedaGlobal(queryStr, allData = null) {
    const data = allData || ultimosAlumnosCargados || [];
    const contBusqueda = document.getElementById('seccion-busqueda-global');
    const listaResultados = document.getElementById('lista-busqueda-global');
    const titResultados = document.getElementById('busqueda-global-titulo');
    const badgeContador = document.getElementById('busqueda-global-contador');
    if (!contBusqueda || !listaResultados) return false;

    const q = (queryStr || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!q) {
        contBusqueda.style.display = 'none';
        listaResultados.innerHTML = '';
        return false;
    }

    const coincidencias = data.filter(al => {
        const nombre = (al.nombre || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const celular = (al.celular || '').replace(/\D/g, '');
        const qNum = q.replace(/\D/g, '');
        const insts = Array.isArray(al.instrumento) ? al.instrumento.join(' ') : (al.instrumento || '');
        const instNorm = insts.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const profe = (al.reserva_profe_nombre || al.profesor_asignado || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const grupo = (al.grupo_asignado || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const susc = (al.tipo_suscripcion || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const est = (al.estado_agenda || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const prof = (al.profesion || (al.informe_entrevista && al.informe_entrevista.profesion) || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const nivel = (al.nivel || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const tags = (Array.isArray(al.perfil_psicologico) ? al.perfil_psicologico.join(' ') : '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const infMotiv = (al.informe_entrevista?.motivacion_expectativas || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const infDiag = (al.informe_entrevista?.diagnostico_tecnico || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const infArt = (al.informe_entrevista?.artistas_estilos || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const matchNombre = nombre.includes(q);
        const matchCel = qNum.length >= 3 && celular.includes(qNum);
        const matchInst = instNorm.includes(q);
        const matchProfe = profe.includes(q);
        const matchGrupo = grupo.includes(q);
        const matchSusc = susc.includes(q);
        const matchEst = est.includes(q);
        const matchExtra = prof.includes(q) || nivel.includes(q) || tags.includes(q) || infMotiv.includes(q) || infDiag.includes(q) || infArt.includes(q);

        return matchNombre || matchCel || matchInst || matchProfe || matchGrupo || matchSusc || matchEst || matchExtra;
    });

    contBusqueda.style.display = 'flex';
    if (titResultados) titResultados.textContent = `Resultados para "${queryStr.trim()}"`;
    if (badgeContador) badgeContador.textContent = `${coincidencias.length} encontrado${coincidencias.length === 1 ? '' : 's'}`;

    if (coincidencias.length === 0) {
        listaResultados.innerHTML = `
            <div style="color:var(--text-muted); text-align:center; padding:30px 20px; font-weight:500; background:var(--bg-sidebar); border-radius:12px; border:1px dashed var(--border-color); margin:10px 0; width:100%; box-sizing:border-box;">
                <div style="font-size:15px; font-weight:700; color:var(--text-main); margin-bottom:4px;">No se encontraron coincidencias</div>
                <div style="font-size:12px; color:var(--text-muted);">No hay ningún alumno en el sistema que coincida con "${queryStr.trim()}".</div>
            </div>`;
    } else {
        listaResultados.innerHTML = coincidencias.map(al => generarFilaAlumno(al, al.id, 'Busqueda')).join('');
    }

    return true;
}
window.ejecutarBusquedaGlobal = ejecutarBusquedaGlobal;

export async function cargarVista(vista = 'Inbox - Pendientes') {
    window.cargarVistaGlobal = cargarVista;

    const usuario = window.usuarioActual || {};
    const roles = Array.isArray(usuario.roles) && usuario.roles.length > 0 ? usuario.roles : [usuario.rol || 'admisiones'];
    const esSoloEvaluador = roles.includes('evaluador') && !roles.includes('admin') && !roles.includes('admisiones') && !roles.includes('admisor');
    
    // Si un evaluador exclusivo intenta acceder a Inbox, redirigir a Entrevistas Confirmadas
    if (esSoloEvaluador && (vista.startsWith('Inbox') && vista !== 'Inbox - Confirmadas')) {
        vista = 'Inbox - Confirmadas';
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
    else if (vista === 'Mis Grupos & Solicitud de Alumnos' || vista === 'Mis Alumnos y Ensambles') modulo = 'portal_profesor';

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
            return cargarVista('Mis Alumnos y Ensambles');
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

    renderSegmentedTabs(vista);

    const tituloEl = document.getElementById('vista-titulo');
    if (tituloEl) {
        const tituloMap = {
            'Inbox - Confirmadas': '<span style="color:var(--text-muted); font-weight:500;">Inbox › </span><span style="color:var(--text-main); font-weight:700;">Entrevistas Confirmadas</span>',
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
    if (vista.startsWith('Inbox')) bottomVista = esSoloEvaluador ? 'Inbox - Confirmadas' : 'Inbox - Pendientes';
    if (vista.startsWith('Altas')) bottomVista = 'Altas - Pendientes';
    const bottomMatch = document.querySelector(`.bottom-nav-item[data-vista="${bottomVista}"]`);
    if(bottomMatch) bottomMatch.classList.add('active');
    
    const vResumen = document.getElementById('vista-resumen'), vResumenTime = document.getElementById('vista-resumen-timeline'), contLista = document.getElementById('lista-generica'), contKanban = document.getElementById('kanban-generico'), contEstad = document.getElementById('estadisticas-container');
    const formWrapper = document.getElementById('form-alumno-wrapper'), cv = document.getElementById('controles-vista');
    if (formWrapper) { formWrapper.style.display = 'none'; document.getElementById('modal-alta-alumno').appendChild(formWrapper); }
    
    // Ocultar botones CSV de toda la app y resetear barra bulk flotante
    const btnCSVEl = document.getElementById('btn-carga-masiva');
    if (btnCSVEl) btnCSVEl.style.display = 'none';
    selectedBulkIds = [];
    window.selectedBulkIds = [];
    const barBulkGlobal = document.getElementById('bulk-actions-bar');
    if (barBulkGlobal) barBulkGlobal.style.display = 'none';
    
    document.getElementById('search-container-general').style.display = 'block'; 
    document.getElementById('alarm-filters').style.display = 'none';
    vResumen.style.display = 'none'; if(vResumenTime) vResumenTime.style.display = 'none'; contLista.style.display = 'none'; if(contKanban) contKanban.style.display = 'none'; contEstad.style.display = 'none'; cv.style.display = 'none';
    const contMatch = document.getElementById('match-pendientes-container'); if(contMatch) contMatch.style.display = 'none';

    // Obtener datos globales de alumnos
    let allData = [];
    try {
        const qSnap = await getDocs(collection(db, "alumnos"));
        qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
        ultimosAlumnosCargados = allData;
        actualizarBadgesYNavegacion(allData);
    } catch(e) {
        console.error("Error al cargar alumnos:", e);
        allData = ultimosAlumnosCargados || [];
    }

    // Comprobar si hay búsqueda global activa
    const queryStr = (document.getElementById('input-buscador-general')?.value || '').trim();
    const contBusqueda = document.getElementById('seccion-busqueda-global');
    if (queryStr.length > 0) {
        const busquedaActiva = ejecutarBusquedaGlobal(queryStr, allData);
        if (busquedaActiva) {
            return;
        }
    } else {
        if (contBusqueda) contBusqueda.style.display = 'none';
    }

    const esVistaConLista = vista.startsWith('Inbox') || vista.startsWith('Altas') || vista === 'Lista de Espera';

    if (esVistaConLista) { 
        cv.style.display = 'flex'; 
        renderFiltrosChips(); 
        document.getElementById('search-container-general').style.display = 'block'; 
        mostrarSkeleton('lista-generica', 6);

        if (vista === 'Inbox - Confirmadas' || vista === 'Altas - Confirmadas') document.getElementById('alarm-filters').style.display = 'flex';
    }
    
    if (vista === 'Dashboard') {
        document.getElementById('search-container-general').style.display = 'block'; vResumen.style.display = 'flex'; cv.style.display = 'none';
        document.getElementById('alarm-filters').style.display = 'none';
        
        const trayContainer = document.getElementById('timeline-tray-container');
        if (trayContainer) trayContainer.style.display = 'none';

        try {
            const roles = Array.isArray(window.usuarioActual?.roles) && window.usuarioActual.roles.length > 0
                ? window.usuarioActual.roles
                : [window.usuarioActual?.rol || 'admisor'];
            const modo = window.modoRolActivo || 'multi';
            const esSoloEval = esModoEvaluadorActivo();
            const esSoloCoordinador = (modo === 'coordinador_grupos' || (!roles.includes('admin') && !roles.includes('admisor') && !roles.includes('admisiones') && roles.includes('coordinador_grupos'))) && modo !== 'multi' && modo !== 'admin' && modo !== 'admisor' && modo !== 'evaluador';

            let poolUrgencias = allData;
            if (esSoloEval) {
                poolUrgencias = filtrarAlumnosEvaluador(allData).filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'agenda confirmada' || st === 'entrevista confirmada';
                });
            } else if (esSoloCoordinador) {
                poolUrgencias = allData.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return ['lista de espera', 'validando grupo', 'pre-alta pendiente', 'pre-alta iniciada', 'alta efectiva', 'alta ilegal', 'alta finalizada'].includes(st);
                });
            }
            renderDashboardPrioridades(poolUrgencias, vista);
            
            // 1. Timeline / Flow (Oculto solo y únicamente para Evaluadores)
            if (esSoloEval) {
                if (vResumenTime) vResumenTime.style.display = 'none';
            } else {
                if (vResumenTime) vResumenTime.style.display = 'flex';
                let nodosTimeline = configNodosFlujo;
                let datosTimeline = allData;
                
                if (esSoloCoordinador) {
                    nodosTimeline = configNodosFlujoCoordinador;
                    datosTimeline = allData.filter(d => {
                        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                        return ['lista de espera', 'validando grupo', 'pre-alta pendiente', 'pre-alta iniciada', 'alta efectiva', 'alta ilegal', 'alta finalizada'].includes(st);
                    });
                }
                
                renderTimelineUnificado('timeline-unificado', nodosTimeline, datosTimeline, { generarBotonesPrincipalesVisibles, generarBotonesAccion });
            }
            
            // 2. Gráfico del Dashboard (Oculto para Evaluadores; Coordinador ve desde Lista de Espera)
            const chartBox = document.getElementById('dashboard-flow-chart-container');
            if (esSoloEval) {
                if (chartBox) chartBox.style.display = 'none';
                if (chartFlowDashboardInst) { chartFlowDashboardInst.destroy(); chartFlowDashboardInst = null; }
            } else {
                if (chartBox) chartBox.style.display = 'block';

                let nodosGrafico = configNodosFlujo;
                let datosGrafico = allData;

                if (esSoloCoordinador) {
                    nodosGrafico = configNodosFlujoCoordinador;
                    datosGrafico = allData.filter(d => {
                        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                        return ['lista de espera', 'validando grupo', 'pre-alta pendiente', 'pre-alta iniciada', 'alta efectiva', 'alta ilegal', 'alta finalizada'].includes(st);
                    });
                }
                
                let flowLabels = nodosGrafico.map(n => n.label);
                let flowData = nodosGrafico.map(n => datosGrafico.filter(d => n.filterFn ? n.filterFn(d) : d.estado_agenda === n.id).length);
                let phaseColors = nodosGrafico.map(n => n.hexColor || '#1f5491');
            
            if(chartFlowDashboardInst) chartFlowDashboardInst.destroy();
            chartFlowDashboardInst = new Chart(document.getElementById('chartFlowDashboard'), { 
                type: 'bar', 
                data: { labels: flowLabels, datasets: [{ label: 'Alumnos', data: flowData, backgroundColor: phaseColors, borderRadius: 6 }] },
                options: { 
                    onClick: (evt, elements) => {
                        if (elements && elements.length > 0) {
                            const index = elements[0].index;
                            const nodo = nodosGrafico[index];
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
            }
        } catch(e) {}
    } else if (vista.startsWith('Inbox') || vista.startsWith('Altas')) {
        try {
            const qSnap = await getDocs(collection(db, "alumnos")); let allData = []; qSnap.forEach(d => allData.push({id: d.id, ...d.data()}));
            actualizarBadgesYNavegacion(allData);
            renderSegmentedTabs(vista);
            
            const esSoloEval = esModoEvaluadorActivo();
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
                const fuente = esSoloEval ? filtrarAlumnosEvaluador(allData) : allData;
                dataFiltrada = fuente.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente validacion por profe' || st === 'pendiente validacion por evaluador';
                });
            } else if (vista === 'Inbox - Validar Alumno') {
                const fuente = esSoloEval ? filtrarAlumnosEvaluador(allData) : allData;
                dataFiltrada = fuente.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return st === 'pendiente validacion por alumno';
                });
            } else if (vista === 'Inbox - Finalizar Admision' || vista === 'Inbox - Confirmadas') {
                const fuente = esSoloEval ? filtrarAlumnosEvaluador(allData) : allData;
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
                const fuente = esSoloEval ? filtrarAlumnosEvaluador(allData) : allData;
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
            } else if (vista === 'Altas - Confirmadas') {
                dataFiltrada = allData.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                    return (st === 'alta efectiva' || st === 'alta ilegal') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5);
                });
            } else if (vista === 'Altas - Finalizadas') {
                dataFiltrada = allData.filter(d => {
                    const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                    return (st === 'alta efectiva' || st === 'alta ilegal' || st === 'alta finalizada') && (d.checklist_alta && d.checklist_alta.filter(Boolean).length === 5);
                });
            } else if (vista === 'Altas - Suspendidas') {
                dataFiltrada = allData.filter(d => (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === 'alta suspendida');
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
    } else if (vista === 'Mis Grupos & Solicitud de Alumnos' || vista === 'Mis Alumnos y Ensambles') {
        contLista.style.display = 'flex';
        await renderPortalProfesor(contLista, window.usuarioActual, { setBotonCargando });
    } else if (vista === 'Estadísticas') { contEstad.style.display = 'flex'; renderCharts({ cargarVista });
    } else if (vista === 'Configuración') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfigHub(contLista, { cargarVista });
    } else if (vista === 'Ajustes Generales') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfig(contLista, configApp, { setBotonCargando, cargarConfig });
    } else if (vista === 'Ajustes Match') { contLista.style.display = 'flex'; contLista.innerHTML = ''; renderConfigMatch(contLista, configApp, { setBotonCargando, cargarConfig });
    } else if (vista.startsWith('ABM')) { contLista.style.display = 'flex'; contLista.innerHTML = ''; const colMap = { 'ABM-Profesores': 'profesores', 'ABM-Instrumentos': 'instrumentos', 'ABM-Suscripciones': 'tipos_suscripcion', 'ABM-Usuarios': 'usuarios_sistema' }; cargarABM(colMap[vista] || vista.split('-')[1].toLowerCase(), vista.split('-')[1], contLista); }
}

async function renderMatchPendientes() {
    document.getElementById('vista-titulo').innerHTML = '<span style="color:var(--text-muted); font-weight:500;">Match › </span><span style="color:var(--text-main); font-weight:700;">Armar Grupos y Clases</span>';
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
const btnLogout = document.getElementById('btn-logout'); if (btnLogout) btnLogout.addEventListener('click', async () => { await signOut(auth); window.location.reload(); });


const ROLES_MODULOS_DEFAULT = {
    admin: ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas', 'portal_profesor', 'configuracion', 'permisos'],
    admisor: ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas'],
    admisiones: ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas'],
    coordinador_grupos: ['dashboard', 'espera', 'match', 'match_etapa4', 'altas'],
    evaluador: ['dashboard', 'inbox', 'espera'],
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
            const modulosUnion = new Set();
            rolesArr.forEach(r => {
                const m = ROLES_MODULOS_DEFAULT[r] || [];
                m.forEach(mod => modulosUnion.add(mod));
            });
            if (Array.isArray(usuarioEncontrado.modulos_habilitados) && usuarioEncontrado.modulos_habilitados.length > 0) {
                usuarioEncontrado.modulos_habilitados.forEach(m => modulosUnion.add(m));
            }
            modulos = Array.from(modulosUnion);

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

        await cargarConfig(); 
        configurarHeaderUsuarioYRoles();
        configurarSidebarPorPermisos();

        const modo = window.modoRolActivo || 'multi';
        if (modo === 'profesor' || window.usuarioActual.rol === 'profesor') {
            cargarVista('Mis Alumnos y Ensambles');
        } else {
            const mods = obtenerModulosPermitidosModoActivo();
            if (mods.includes('dashboard')) {
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
        
        // Listener del Popover de Perfil Google-Style
        const userTopBtn = document.getElementById('user-top-btn');
        const profilePopover = document.getElementById('profile-popover');
        if (userTopBtn && profilePopover) {
            userTopBtn.onclick = (e) => {
                e.stopPropagation();
                profilePopover.classList.toggle('show');
            };
        }

        const popoverMiPerfil = document.getElementById('popover-link-mi-perfil');
        if (popoverMiPerfil) {
            popoverMiPerfil.onclick = (e) => {
                e.stopPropagation();
                if (profilePopover) profilePopover.classList.remove('show');
                if (typeof abrirModalMiPerfil === 'function') abrirModalMiPerfil();
            };
        }

        const popoverConfig = document.getElementById('popover-link-config');
        if (popoverConfig) {
            popoverConfig.onclick = (e) => {
                e.stopPropagation();
                if (profilePopover) profilePopover.classList.remove('show');
                cargarVista('Configuración');
            };
        }

        const btnPopoverLogout = document.getElementById('btn-popover-logout');
        if (btnPopoverLogout) {
            btnPopoverLogout.onclick = async (e) => {
                e.stopPropagation();
                await signOut(auth);
                window.location.reload();
            };
        }

        document.addEventListener('click', (e) => {
            if (profilePopover && profilePopover.classList.contains('show')) {
                if (userTopBtn && !userTopBtn.contains(e.target) && !profilePopover.contains(e.target)) {
                    profilePopover.classList.remove('show');
                }
            }
        });
        
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

        // Iniciar detector de actualizaciones automáticas en tiempo real
        iniciarVerificadorVersion();

    } else { 
        document.getElementById('login-container').style.display = 'flex'; 
        document.getElementById('app-container').style.display = 'none'; 
    } 
});

// Buscador general con debounce (200ms) y botón para limpiar
let searchDebounceTimer = null;
const inputBuscadorGeneral = document.getElementById('input-buscador-general');
const btnLimpiarBuscador = document.getElementById('btn-limpiar-buscador');
const btnCerrarBusquedaGlobal = document.getElementById('btn-cerrar-busqueda-global');

const limpiarYRestaurarBusqueda = () => {
    if (inputBuscadorGeneral) {
        inputBuscadorGeneral.value = '';
        inputBuscadorGeneral.focus();
    }
    if (btnLimpiarBuscador) btnLimpiarBuscador.style.display = 'none';
    const contBusqueda = document.getElementById('seccion-busqueda-global');
    if (contBusqueda) contBusqueda.style.display = 'none';
    cargarVista(estadoActualVista);
};

if (inputBuscadorGeneral) {
    inputBuscadorGeneral.addEventListener('input', (e) => {
        const val = e.target.value;
        if (btnLimpiarBuscador) {
            btnLimpiarBuscador.style.display = val.trim().length > 0 ? 'block' : 'none';
        }
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            cargarVista(estadoActualVista);
        }, 200);
    });
}

if (btnLimpiarBuscador) {
    btnLimpiarBuscador.addEventListener('click', limpiarYRestaurarBusqueda);
}

if (btnCerrarBusquedaGlobal) {
    btnCerrarBusquedaGlobal.addEventListener('click', limpiarYRestaurarBusqueda);
}

document.addEventListener('change', async (e) => {
    if(e.target.classList.contains('chk-admision-paso')) {
        const id = e.target.getAttribute('data-id'), idx = parseInt(e.target.getAttribute('data-idx'), 10);
        try {
            const docRef = doc(db, "alumnos", id), alDoc = await getDoc(docRef), al = alDoc.data();
            let checks = al.checklist_admision || [false, false]; 
            checks[idx] = e.target.checked;
            
            const completados = checks.filter(Boolean).length;
            const porcentaje = Math.round((completados / 2) * 100);
            const barColor = completados === 2 ? 'var(--accent-teal)' : (completados === 1 ? '#e5a93d' : 'var(--accent-red)');

            const elTitle = document.getElementById(`chk-adm-title-${id}`);
            const elPct = document.getElementById(`chk-adm-pct-${id}`);
            const elBar = document.getElementById(`chk-adm-bar-${id}`);
            if (elTitle) elTitle.textContent = `📋 Requisitos de Admisión (${completados}/2)`;
            if (elPct) {
                elPct.textContent = `${porcentaje}%`;
                elPct.style.color = barColor;
            }
            if (elBar) {
                elBar.style.width = `${porcentaje}%`;
                elBar.style.background = barColor;
            }
            
            const labelPadre = e.target.closest('label');
            if (labelPadre) {
                labelPadre.style.color = e.target.checked ? 'var(--text-main)' : 'var(--text-muted)';
            }

            if (Array.isArray(cachedAlumnosData)) {
                const item = cachedAlumnosData.find(x => x.id === id);
                if (item) item.checklist_admision = checks;
            }
            if (Array.isArray(ultimosAlumnosCargados)) {
                const item = ultimosAlumnosCargados.find(x => x.id === id);
                if (item) item.checklist_admision = checks;
            }
            await updateDoc(docRef, { checklist_admision: checks });
            if (completados === 2) {
                mostrarToast("🎉 ¡Requisitos de Admisión completos! Listo para confirmar agenda.", "success");
            } else {
                mostrarToast(`✓ Requisito ${e.target.checked ? 'marcado' : 'desmarcado'} (${completados}/2)`, "info");
            }
        } catch(err) {
            console.error("Error al actualizar checklist admisión:", err);
        }
        return;
    }
    if(e.target.classList.contains('chk-alta-paso')) {
        const id = e.target.getAttribute('data-id'), idx = parseInt(e.target.getAttribute('data-idx'), 10);
        try {
            const docRef = doc(db, "alumnos", id), alDoc = await getDoc(docRef), al = alDoc.data();
            let checks = al.checklist_alta || [false, false, false, false, false]; 
            checks[idx] = e.target.checked;
            
            const completados = checks.filter(Boolean).length;
            const porcentaje = Math.round((completados / 5) * 100);
            const barColor = completados === 5 ? 'var(--accent-teal)' : (completados >= 3 ? '#e5a93d' : 'var(--accent-red)');

            // Actualización visual reactiva instantánea en el DOM (sin recargar la página)
            const elTitle = document.getElementById(`chk-title-${id}`);
            const elPct = document.getElementById(`chk-pct-${id}`);
            const elBar = document.getElementById(`chk-bar-${id}`);
            if (elTitle) elTitle.textContent = `📋 Checklist de Alta (${completados}/5)`;
            if (elPct) {
                elPct.textContent = `${porcentaje}%`;
                elPct.style.color = barColor;
            }
            if (elBar) {
                elBar.style.width = `${porcentaje}%`;
                elBar.style.background = barColor;
            }
            
            // Actualizar color del label del paso
            const labelPadre = e.target.closest('label');
            if (labelPadre) {
                labelPadre.style.color = e.target.checked ? 'var(--text-main)' : 'var(--text-muted)';
            }

            // Actualizar datos en memoria para badges y filtros
            if (Array.isArray(cachedAlumnosData)) {
                const item = cachedAlumnosData.find(x => x.id === id);
                if (item) item.checklist_alta = checks;
            }
            if (Array.isArray(ultimosAlumnosCargados)) {
                const item = ultimosAlumnosCargados.find(x => x.id === id);
                if (item) item.checklist_alta = checks;
            }
            actualizarBadgesYNavegacion(cachedAlumnosData);

            if (completados === 5) {
                const now = new Date(), fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
                const hist = al.historial || [];
                hist.push({
                    id: Date.now(),
                    texto: "Alta Finalizada: Todos los pasos del checklist completados. Ciclo de admisión cerrado.",
                    fecha: fechaStr
                });

                // Actualizar evento en Google Calendar al formato de alta confirmada (sin ❓)
                try {
                    const tipoSusc = (al.tipo_suscripcion || '').toLowerCase();
                    const esInd = tipoSusc.includes('individual') || al.grupo_asignado === 'Clase Individual';
                    let alumnosDelGrupo = [];
                    if (!esInd && al.grupo_asignado) {
                        const gSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", al.grupo_asignado)));
                        gSnap.forEach(d => alumnosDelGrupo.push({ id: d.id, ...d.data() }));
                    }
                    await sincronizarEventoAltaConfirmadaCalendar({ id, ...al }, esInd, alumnosDelGrupo, configApp);
                } catch(calErr) {
                    console.warn("No se pudo actualizar evento al completar checklist:", calErr);
                }

                await updateDoc(docRef, { 
                    checklist_alta: checks,
                    fecha_alta_finalizada: new Date().toISOString(),
                    historial: hist
                });
                mostrarToast("🏆 ¡Felicitaciones! Checklist completo. El alumno pasó a Altas Finalizadas.", "success");
                cargarVista(estadoActualVista);
            } else {
                await updateDoc(docRef, { checklist_alta: checks });
                mostrarToast(`✓ Paso ${e.target.checked ? 'marcado' : 'desmarcado'} (${completados}/5)`, "info");
            }
        } catch(err) {
            console.error("Error al actualizar checklist:", err);
        }
    }

    if (e.target.classList.contains('chk-disp-all') || e.target.classList.contains('chk-disp-none')) {
        const diaRow = e.target.closest('.dia-disponibilidad-row');
        if (diaRow) {
            const chkAll = diaRow.querySelector('.chk-disp-all');
            const chkNone = diaRow.querySelector('.chk-disp-none');
            if (e.target.classList.contains('chk-disp-all') && e.target.checked && chkNone) {
                chkNone.checked = false;
            } else if (e.target.classList.contains('chk-disp-none') && e.target.checked && chkAll) {
                chkAll.checked = false;
            }
            updateDispStateForRow(diaRow);
        }
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
    
    // AGREGAR Y QUITAR RANGOS HORARIOS (SCOPED DIRECTO A LA FILA)
    if (target.classList.contains('btn-agregar-rango') || target.closest('.btn-agregar-rango')) {
        e.preventDefault();
        const btn = target.closest('.btn-agregar-rango') || target;
        const diaRow = btn.closest('.dia-disponibilidad-row');
        if (diaRow) {
            const diaId = diaRow.getAttribute('data-dia') || btn.getAttribute('data-dia');
            const esProfe = diaRow.getAttribute('data-profe') === 'true';
            const rangosList = diaRow.querySelector('.rangos-list');
            if (rangosList) {
                const count = rangosList.querySelectorAll('.rango-item').length;
                rangosList.insertAdjacentHTML('beforeend', crearFilaRangoHTML(diaId, '', '', esProfe, count));
                const chkAll = diaRow.querySelector('.chk-disp-all');
                const chkNone = diaRow.querySelector('.chk-disp-none');
                if (chkAll) chkAll.checked = false;
                if (chkNone) chkNone.checked = false;
                actualizarBotonesQuitarRangoEnFila(diaRow);
                updateDispStateForRow(diaRow);
            }
        }
        return;
    }
    if (target.classList.contains('btn-quitar-rango') || target.closest('.btn-quitar-rango')) {
        e.preventDefault();
        const btn = target.closest('.btn-quitar-rango') || target;
        const diaRow = btn.closest('.dia-disponibilidad-row');
        const rangoItem = btn.closest('.rango-item');
        if (rangoItem && diaRow) {
            rangoItem.remove();
            actualizarBotonesQuitarRangoEnFila(diaRow);
            updateDispStateForRow(diaRow);
        }
        return;
    }

    // FUNCION DE COPY/PASTE DISPONIBILIDAD (SCOPED DIRECTO A LA FILA)
    if (target.classList.contains('btn-copy-disp') || target.classList.contains('btn-copy-disp-p') || target.closest('.btn-copy-disp') || target.closest('.btn-copy-disp-p')) {
        e.preventDefault();
        const btn = target.closest('.btn-copy-disp') || target.closest('.btn-copy-disp-p') || target;
        const diaRow = btn.closest('.dia-disponibilidad-row');
        if (diaRow) {
            const rangosList = diaRow.querySelector('.rangos-list');
            const items = rangosList ? rangosList.querySelectorAll('.rango-item') : [];
            const rangos = [];
            items.forEach(item => {
                rangos.push({
                    inicio: item.querySelector('.rango-inicio')?.value || '',
                    fin: item.querySelector('.rango-fin')?.value || ''
                });
            });
            clipboardDisponibilidad = {
                all: diaRow.querySelector('.chk-disp-all')?.checked || false,
                none: diaRow.querySelector('.chk-disp-none')?.checked || false,
                rangos: rangos
            };
            alert("📋 Horario del día copiado");
        }
        return;
    }
    if (target.classList.contains('btn-paste-disp') || target.classList.contains('btn-paste-disp-p') || target.closest('.btn-paste-disp') || target.closest('.btn-paste-disp-p')) {
        e.preventDefault();
        if (!clipboardDisponibilidad) return alert("No hay horario copiado.");
        const btn = target.closest('.btn-paste-disp') || target.closest('.btn-paste-disp-p') || target;
        const diaRow = btn.closest('.dia-disponibilidad-row');
        if (diaRow) {
            const diaId = diaRow.getAttribute('data-dia');
            const esProfe = diaRow.getAttribute('data-profe') === 'true';
            const chkAll = diaRow.querySelector('.chk-disp-all');
            const chkNone = diaRow.querySelector('.chk-disp-none');
            if (chkAll) chkAll.checked = clipboardDisponibilidad.all;
            if (chkNone) chkNone.checked = clipboardDisponibilidad.none;

            const rangosList = diaRow.querySelector('.rangos-list');
            if (rangosList) {
                rangosList.innerHTML = '';
                const rangos = clipboardDisponibilidad.rangos || [];
                if (rangos.length === 0) {
                    rangosList.innerHTML = crearFilaRangoHTML(diaId, '', '', esProfe, 0);
                } else {
                    rangos.forEach((r, idx) => {
                        rangosList.innerHTML += crearFilaRangoHTML(diaId, r.inicio || '', r.fin || '', esProfe, idx);
                    });
                }
                actualizarBotonesQuitarRangoEnFila(diaRow);
                updateDispStateForRow(diaRow);
            }
        }
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
            const pRow = wrap.closest('.row-item, .swipe-wrapper, .group-card-l1, .group-card-l2, .tray-chip');
            if (pRow) pRow.classList.remove('has-open-dropdown');
        }
    }

    // Clic fuera de los dropdowns de acciones en filas (Desktop)
    if (!target.closest('.alumno-actions')) {
        document.querySelectorAll('.dropdown-menu-wrapper.show').forEach(d => {
            if (d.id !== 'modal-acciones-dropdown') {
                d.classList.remove('show');
                const pRow = d.closest('.row-item, .swipe-wrapper, .group-card-l1, .group-card-l2, .tray-chip');
                if (pRow) pRow.classList.remove('has-open-dropdown');
            }
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
                    if (d !== wrapper && d.id !== 'modal-acciones-dropdown') {
                        d.classList.remove('show');
                        const pRow = d.closest('.row-item, .swipe-wrapper, .group-card-l1, .group-card-l2, .tray-chip');
                        if (pRow) pRow.classList.remove('has-open-dropdown');
                    }
                });
                const parentRow = wrapper.closest('.row-item, .swipe-wrapper, .group-card-l1, .group-card-l2, .tray-chip');
                if (!isShown) {
                    wrapper.classList.add('show');
                    if (parentRow) parentRow.classList.add('has-open-dropdown');
                } else {
                    wrapper.classList.remove('show');
                    if (parentRow) parentRow.classList.remove('has-open-dropdown');
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
                const nuevaEntrada = crearEntradaHistorial(texto.trim(), 'nota');
                hist.push(nuevaEntrada);
                await updateDoc(doc(db, "alumnos", id), { historial: hist });
                document.getElementById('modal-nota-rapida').close();
                mostrarToast('Nota guardada correctamente en el historial.', 'success');
                cargarVista(estadoActualVista);
            }
        } catch(e) {
            alert("Error al guardar la nota: " + e.message);
        } finally {
            setBotonCargando(target, false);
        }
        return;
    }

    if (target.id === 'btn-agregar-nota-modal') {
        const inputNota = document.getElementById('input-nueva-nota-modal');
        const id = document.getElementById('alumno-id')?.value;
        const texto = (inputNota?.value || '').trim();
        if (!texto) return alert("Por favor escribí una nota antes de agregar.");
        
        const nuevaEntrada = crearEntradaHistorial(texto, 'nota');
        historialActual.push(nuevaEntrada);
        renderHistorial();
        inputNota.value = '';

        if (id) {
            try {
                await updateDoc(doc(db, "alumnos", id), { historial: historialActual });
                mostrarToast('Nota agregada al historial.', 'success');
            } catch(e) {
                console.warn("No se pudo guardar la nota en Firestore:", e);
            }
        }
        return;
    }

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
            mostrarToast("📋 Formato de contacto para WhatsApp copiado al portapapeles", "success");
        } catch(e) {
            alert("Error al copiar: " + e.message);
        }
        return;
    }
    
    if (target.classList.contains('tab-btn-informe') || target.closest('.tab-btn-informe')) {
        const btn = target.classList.contains('tab-btn-informe') ? target : target.closest('.tab-btn-informe');
        const targetId = btn.getAttribute('data-target');
        document.querySelectorAll('.tab-btn-informe').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-inf-content').forEach(c => c.style.display = 'none');
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.style.display = 'block';
        return;
    }

    if (target.id === 'btn-editar-informe-desde-ficha' || target.closest('#btn-editar-informe-desde-ficha')) {
        const id = document.getElementById('alumno-id')?.value;
        if (id) {
            document.getElementById('modal-alta-alumno')?.close();
            const fakeBtn = document.createElement('button');
            fakeBtn.setAttribute('data-id', id);
            fakeBtn.classList.add('btn-admision-finalizada');
            document.body.appendChild(fakeBtn);
            fakeBtn.click();
            fakeBtn.remove();
        }
        return;
    }

    if (target.classList.contains('btn-admision-finalizada') || target.closest('.btn-admision-finalizada')) { 
        const btn = target.classList.contains('btn-admision-finalizada') ? target : target.closest('.btn-admision-finalizada');
        const id = btn.getAttribute('data-id'); 
        document.getElementById('informe-final-alumno-id').value = id;
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (!alDoc.exists()) return alert("Alumno no encontrado.");
            const al = alDoc.data();
            const inf = al.informe_entrevista || {};
            const esNuevoInforme = !al.informe_entrevista;

            // 0. Caja Fecha y Evaluador Superior
            const elFechaTop = document.getElementById('inf-modal-fecha-val');
            const elEvalTop = document.getElementById('inf-modal-evaluador-val');
            if (elFechaTop) elFechaTop.textContent = formatearFechaHoraEstandar(al.reserva_inicio || al.informe_entrevista?.fecha_evaluacion || al.reserva_fecha_texto);
            if (elEvalTop) elEvalTop.textContent = al.reserva_profe_nombre || al.informe_entrevista?.evaluador_nombre || '-';

            // 1. Cabecera Pre-cargada y Editable
            const inpNombre = document.getElementById('inf-nombre');
            const inpEdad = document.getElementById('inf-edad');
            const inpProf = document.getElementById('inf-profesion');
            const selSusc = document.getElementById('inf-suscripcion');
            const selNivel = document.getElementById('inf-nivel');

            if (inpNombre) inpNombre.value = al.nombre || '';
            if (inpEdad) inpEdad.value = al.edad || '';
            if (inpProf) inpProf.value = al.profesion || inf.profesion || '';

            // Cargar select multi-instrumentos
            const selInst = document.getElementById('inf-instrumento');
            if (selInst) {
                selInst.innerHTML = '';
                const listaInst = (configApp && configApp.instrumentos) || ["Guitarra", "Bajo", "Batería", "Teclado", "Canto", "Saxo", "Violín", "Ukelele"];
                const alInsts = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);
                listaInst.forEach(inst => {
                    const opt = document.createElement('option');
                    opt.value = inst;
                    opt.textContent = inst;
                    if (alInsts.includes(inst)) opt.selected = true;
                    selInst.appendChild(opt);
                });
                syncSelectToChips('inf-instrumento', 'chips-inf-instrumentos');
            }

            if (selSusc) {
                selSusc.innerHTML = '<option value="">Seleccionar suscripción...</option>';
                const listaSusc = [];
                try {
                    const sSp = await getDocs(collection(db, "tipos_suscripcion"));
                    sSp.forEach(d => {
                        const n = d.data().nombre;
                        if (n && !listaSusc.includes(n)) listaSusc.push(n);
                    });
                } catch(e) {}
                if (listaSusc.length === 0) {
                    listaSusc.push("Ensamble", "Clases Individuales", "Clases Grupales", "Clase Individual", "Clase Grupal");
                }
                const suscAlumno = (al.tipo_suscripcion || '').trim();
                if (suscAlumno && !listaSusc.some(s => s.toLowerCase() === suscAlumno.toLowerCase())) {
                    listaSusc.unshift(suscAlumno);
                }
                listaSusc.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s;
                    if (s.toLowerCase() === suscAlumno.toLowerCase()) {
                        opt.selected = true;
                    }
                    selSusc.appendChild(opt);
                });
                if (suscAlumno) {
                    selSusc.value = suscAlumno;
                }
            }

            if (selNivel) {
                selNivel.value = al.nivel || inf.nivel_asignado || '';
            }

            // 2. Bloque 1: Motivación y Expectativas (Quill)
            if (quillInfMotivacion) {
                quillInfMotivacion.root.innerHTML = inf.motivacion_expectativas || '';
            }
            const chkPropuesta = document.getElementById('inf-chk-propuesta');
            if (chkPropuesta) chkPropuesta.checked = esNuevoInforme ? false : Boolean(inf.propuesta_mandala_acordada);

            // 3. Bloque 2: Evaluación Técnica & Estilos (Quill + Migración Legacy)
            if (quillInfDiagnostico) {
                quillInfDiagnostico.root.innerHTML = inf.diagnostico_tecnico || al.informe_admision || '';
            }
            const txtArtistas = document.getElementById('inf-artistas');
            if (txtArtistas) txtArtistas.value = inf.artistas_estilos || '';

            // 4. Bloque 3: Preguntas Clave & Requisitos
            actualizarCondicionalesPunto3();

            const selCantante = document.getElementById('inf-cantante-voces');
            const selTonalidades = document.getElementById('inf-cambio-tonalidades');
            const chkRequisitos = document.getElementById('inf-chk-requisitos');
            const chkCierre = document.getElementById('inf-chk-cierre');

            if (selCantante) {
                selCantante.value = (inf.disp_compartir_cantante && inf.disp_compartir_cantante !== 'no_aplica') ? inf.disp_compartir_cantante : '';
            }
            if (selTonalidades) {
                selTonalidades.value = (inf.cambio_tonalidades && inf.cambio_tonalidades !== 'no_aplica') ? inf.cambio_tonalidades : '';
            }
            if (chkRequisitos) chkRequisitos.checked = esNuevoInforme ? false : Boolean(inf.requisitos_aceptados);
            if (chkCierre) chkCierre.checked = esNuevoInforme ? false : Boolean(inf.cierre_espera_notificado);

            // 5. Bloque 4: Disponibilidad Horaria
            renderContenedorDisponibilidad('informe-disp-container', false);
            poblarDisponibilidadMultiRango(al.disponibilidad || {}, 'informe-disp-container');

            // 6. Bloque 5: Perfil Emocional
            renderChipsPerfilPsicologico('informe-perfil-psicologico-chips', al.perfil_psicologico || inf.perfil_psicologico || []);

            // Abrir todos los acordeones por defecto
            [1, 2, 3, 4, 5].forEach(n => {
                const b = document.getElementById(`inf-body-${n}`);
                const c = document.getElementById(`inf-chevron-${n}`);
                if (b) b.style.display = 'flex';
                if (c) c.textContent = '▲';
            });

            document.getElementById('modal-informe-admision').showModal();
        } catch(e) {
            console.error("Error al abrir informe admisión:", e);
            alert("Error: " + e.message);
        }
        return; 
    }
    
    if (target.id === 'btn-guardar-informe-final') {
        const id = document.getElementById('informe-final-alumno-id').value;
        const nombre = document.getElementById('inf-nombre').value.trim();
        const edadVal = document.getElementById('inf-edad').value.trim();
        const edad = edadVal ? parseInt(edadVal, 10) : null;
        const profesion = document.getElementById('inf-profesion').value.trim();
        const suscripcion = document.getElementById('inf-suscripcion').value;
        const nivel = document.getElementById('inf-nivel').value;

        const selInst = document.getElementById('inf-instrumento');
        const instrumentosSeleccionados = selInst ? Array.from(selInst.selectedOptions).map(o => o.value) : [];

        const motivacion = quillInfMotivacion ? quillInfMotivacion.root.innerHTML.trim() : '';
        const motivacionTexto = quillInfMotivacion ? quillInfMotivacion.getText().trim() : '';
        const chkPropuesta = document.getElementById('inf-chk-propuesta').checked;
        const diagnostico = quillInfDiagnostico ? quillInfDiagnostico.root.innerHTML.trim() : '';
        const diagnosticoTexto = quillInfDiagnostico ? quillInfDiagnostico.getText().trim() : '';
        const artistas = document.getElementById('inf-artistas').value.trim();
        
        const cardCantante = document.getElementById('inf-card-cantante');
        const cardTonalidades = document.getElementById('inf-card-tonalidades');
        let cantanteVoces = document.getElementById('inf-cantante-voces').value;
        let cambioTonalidades = document.getElementById('inf-cambio-tonalidades').value;

        if (cardCantante && cardCantante.style.display !== 'none') {
            if (!cantanteVoces) {
                alert("⚠️ Es obligatorio responder la pregunta de Compartir Voces (Bloque 3).");
                return;
            }
        } else {
            cantanteVoces = 'no_aplica';
        }

        if (cardTonalidades && cardTonalidades.style.display !== 'none') {
            if (!cambioTonalidades) {
                alert("⚠️ Es obligatorio responder la pregunta sobre Tonalidades (Bloque 3).");
                return;
            }
        } else {
            cambioTonalidades = 'no_aplica';
        }

        const chkRequisitos = document.getElementById('inf-chk-requisitos').checked;
        const chkCierre = document.getElementById('inf-chk-cierre').checked;
        const tags = getPerfilPsicologicoSeleccionado('informe-perfil-psicologico-chips');

        // VALIDACIONES OBLIGATORIAS
        if (!nivel) {
            alert("⚠️ Es obligatorio asignar el Nivel del alumno (Inicial I, Inicial II, Intermedio o Avanzado).");
            return;
        }
        if (instrumentosSeleccionados.length === 0) {
            alert("⚠️ Es obligatorio seleccionar al menos un instrumento.");
            return;
        }
        if (!motivacionTexto) {
            alert("⚠️ Es obligatorio completar el campo de Motivación, Intereses y Expectativas (Bloque 1).");
            return;
        }
        if (!chkPropuesta) {
            alert("⚠️ Debe marcar como charlada la Propuesta Mandala (Bloque 1).");
            return;
        }
        if (!diagnosticoTexto) {
            alert("⚠️ Es obligatorio completar el Diagnóstico de Ejecución y Plasticidad (Bloque 2).");
            return;
        }
        if (!artistas) {
            alert("⚠️ Es obligatorio completar la Zona de Confort / Artistas referentes (Bloque 2).");
            return;
        }
        if (!chkRequisitos) {
            alert("⚠️ Debe confirmar los Requisitos explicados y aceptados (Bloque 3).");
            return;
        }
        if (!chkCierre) {
            alert("⚠️ Debe confirmar el Cierre y notificación de Lista de Espera (Bloque 3).");
            return;
        }
        if (!tags || tags.length === 0) {
            alert("⚠️ Es obligatorio seleccionar al menos una etiqueta de perfil emocional (Bloque 5).");
            return;
        }

        const btn = target;
        setBotonCargando(btn, true);
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            const al = alDoc.exists() ? alDoc.data() : {};
            
            // Extraer disponibilidad actualizada si se editó
            const nuevaDisp = extraerDisponibilidadMultiRango('informe-disp-container');
            const dispPreviaStr = JSON.stringify(al.disponibilidad || {});
            const dispNuevaStr = JSON.stringify(nuevaDisp || {});
            const cambioDisp = dispPreviaStr !== dispNuevaStr && Object.keys(nuevaDisp || {}).length > 0;

            const hist = al.historial || [];
            const tagsTxt = ` [Perfil: ${tags.join(', ')}]`;
            const dispTxt = cambioDisp ? ' • Disponibilidad horaria actualizada.' : '';
            const nivelTxt = nivel !== al.nivel ? ` • Nivel asignado: ${nivel}.` : '';
            hist.push(crearEntradaHistorial(`Informe de Entrevista registrado/actualizado.${nivelTxt}${tagsTxt}${dispTxt} Alumno en Lista de Espera.`, 'informe'));
            
            const informeEntrevista = {
                fecha_evaluacion: al.informe_entrevista?.fecha_evaluacion || new Date().toISOString(),
                fecha_actualizacion: new Date().toISOString(),
                evaluador_nombre: window.usuarioActual?.nombre || al.reserva_profe_nombre || 'Evaluador',
                evaluador_id: window.usuarioActual?.id || al.reserva_profe_id || '',
                nivel_asignado: nivel,
                profesion: profesion,
                motivacion_expectativas: motivacion,
                propuesta_mandala_acordada: chkPropuesta,
                diagnostico_tecnico: diagnostico,
                artistas_estilos: artistas,
                disp_compartir_cantante: cantanteVoces,
                cambio_tonalidades: cambioTonalidades,
                requisitos_aceptados: chkRequisitos,
                cierre_espera_notificado: chkCierre,
                perfil_psicologico: tags
            };

            const informeAdmisionTexto = `<strong>Nivel:</strong> ${nivel}<br><strong>Motivación:</strong> ${motivacion}<br><strong>Diagnóstico:</strong> ${diagnostico}<br><strong>Artistas:</strong> ${artistas}`;

            const updatePayload = { 
                estado_agenda: "Lista de espera",
                nivel: nivel,
                informe_entrevista: informeEntrevista,
                informe_admision: informeAdmisionTexto,
                perfil_psicologico: tags,
                instrumento: instrumentosSeleccionados,
                historial: hist
            };

            if (profesion) updatePayload.profesion = profesion;
            if (nombre) updatePayload.nombre = nombre;
            if (edad !== null) updatePayload.edad = edad;
            if (suscripcion) updatePayload.tipo_suscripcion = suscripcion;
            if (cambioDisp) {
                updatePayload.disponibilidad = nuevaDisp;
            }

            await updateDoc(doc(db, "alumnos", id), updatePayload);
            document.getElementById('modal-informe-admision').close();
            alert("✅ ¡Informe guardado con éxito!\nEl registro quedó actualizado y el alumno en Lista de Espera.");
            cargarVista(estadoActualVista);
        } catch(err) {
            console.error("Error al guardar informe:", err);
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
        await abrirModalPrealta(id, grupoPrev || '', inicioPrev || '', { configApp, setBotonCargando, esEdicion });
        return;
    }

    // Botón Aviso WhatsApp Pre-Alta Alumno
    if (target.classList.contains('btn-aviso-prealta-alumno') || target.closest('.btn-aviso-prealta-alumno')) {
        const btn = target.classList.contains('btn-aviso-prealta-alumno') ? target : target.closest('.btn-aviso-prealta-alumno');
        const id = btn.getAttribute('data-id');
        await abrirModalAvisoPrealtaAlumno(id, configApp);
        return;
    }

    // Botón Copiar Aviso Pre-Alta Alumno desde el Modal
    if (target.id === 'btn-copiar-aviso-prealta-alumno-action' || target.closest('#btn-copiar-aviso-prealta-alumno-action')) {
        const id = document.getElementById('aviso-alumno-id').value;
        await copiarAvisoPrealtaAlumno(id);
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

    // Botón Copiar Fila para BD de Planilla / Facturación
    if (target.classList.contains('btn-copiar-fila-excel-bd') || target.closest('.btn-copiar-fila-excel-bd')) {
        const btn = target.classList.contains('btn-copiar-fila-excel-bd') ? target : target.closest('.btn-copiar-fila-excel-bd');
        const id = btn.getAttribute('data-id');
        await copiarFilaExcelBD(id);
        return;
    }
    if (target.classList.contains('btn-copiar-fila-excel-fact') || target.closest('.btn-copiar-fila-excel-fact')) {
        const btn = target.classList.contains('btn-copiar-fila-excel-fact') ? target : target.closest('.btn-copiar-fila-excel-fact');
        const id = btn.getAttribute('data-id');
        await copiarFilaExcelFacturacion(id);
        return;
    }

    // Botón Copiar Facturación Admisión (13 columnas para Google Sheets)
    if (target.classList.contains('btn-copiar-facturacion-admision') || target.closest('.btn-copiar-facturacion-admision')) {
        const btn = target.classList.contains('btn-copiar-facturacion-admision') ? target : target.closest('.btn-copiar-facturacion-admision');
        const id = btn.getAttribute('data-id');
        await copiarFilaExcelFacturacionAdmision(id, configApp);
        return;
    }

    // Botón Auditar Calendar desde Menú ⋮
    if (target.classList.contains('btn-auditar-cal-directo') || target.closest('.btn-auditar-cal-directo')) {
        const btn = target.classList.contains('btn-auditar-cal-directo') ? target : target.closest('.btn-auditar-cal-directo');
        const id = btn.getAttribute('data-id');
        await window.auditarCalendarioAlumno(id);
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
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (alDoc.exists()) {
            const al = alDoc.data();
            const checksAlta = al.checklist_alta || [false, false, false, false, false];
            if (!checksAlta[0]) {
                return alert('⚠️ No se puede confirmar el alta:\n\nEl punto "1. Suscripción abonada" no está tildado en el checklist.\n\nPor favor verificá que el alumno haya abonado su suscripción antes de confirmar el alta.');
            }
        }
        document.getElementById('conf-alta-alumno-id').value = id;
        document.getElementById('modal-confirmar-alta').showModal();
        return;
    }
    // Guardar Confirmación de Alta
    if (target.id === 'btn-guardar-confirmacion-alta') {
        const id = document.getElementById('conf-alta-alumno-id').value, est = document.querySelector('input[name="opt-tipo-alta"]:checked').value;
        const alDoc = await getDoc(doc(db, "alumnos", id));
        const al = alDoc.exists() ? alDoc.data() : {};
        const checksAlta = al.checklist_alta || [false, false, false, false, false];
        if (!checksAlta[0]) {
            return alert('⚠️ No se puede confirmar el alta:\n\nEl punto "1. Suscripción abonada" no está tildado en el checklist.\n\nPor favor verificá que el alumno haya abonado su suscripción antes de confirmar el alta.');
        }
        setBotonCargando(target, true);
        const tipoSusc = detectarTipoSuscripcion(al.tipo_suscripcion || '');
        const esIndividual = tipoSusc === 'individual';

        // Actualizar título en Calendar a Alta Confirmada (remueve el cohete 🚀 y ❓)
        let alumnosDelGrupo = [];
        if (!esIndividual && al.grupo_asignado) {
            try {
                const grpSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", al.grupo_asignado)));
                grpSnap.forEach(d => alumnosDelGrupo.push({ id: d.id, ...d.data() }));
            } catch(e) {}
        }
        const evSync = await sincronizarEventoAltaConfirmadaCalendar({ id, ...al }, esIndividual, alumnosDelGrupo, configApp);

        const hist = al.historial || [];
        hist.push(crearEntradaHistorial(`Alta confirmada y efectiva (${est}) en el grupo/clase "${al.grupo_asignado || '-'}".`, 'alta'));
        const updatesAlta = { estado_agenda: est, historial: hist };
        if (evSync && evSync.id) {
            updatesAlta.id_evento_alta = evSync.id;
            updatesAlta.calendario_evento_alta = evSync.calendar;
        }
        await updateDoc(doc(db, "alumnos", id), updatesAlta);
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
        const ok = await window.confirmar('¿Finalizar Alta?', 'Se marcará el checklist completo, se actualizará el evento en Google Calendar y el ciclo de admisión quedará cerrado.', '🏁 Finalizar Alta', '🏆');
        if (ok) {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            const al = alDoc.exists() ? alDoc.data() : {};
            const hist = al.historial || [];
            hist.push(crearEntradaHistorial("Alta Finalizada: Todos los pasos del checklist confirmados. Ciclo de admisión cerrado con éxito.", 'alta'));

            // Actualizar evento en Google Calendar al formato de alta confirmada (sin ❓)
            try {
                const tipoSusc = (al.tipo_suscripcion || '').toLowerCase();
                const esInd = tipoSusc.includes('individual') || al.grupo_asignado === 'Clase Individual';
                let alumnosDelGrupo = [];
                if (!esInd && al.grupo_asignado) {
                    const gSnap = await getDocs(query(collection(db, "alumnos"), where("grupo_asignado", "==", al.grupo_asignado)));
                    gSnap.forEach(d => alumnosDelGrupo.push({ id: d.id, ...d.data() }));
                }
                const evFin = await sincronizarEventoAltaConfirmadaCalendar({ id, ...al }, esInd, alumnosDelGrupo, configApp);
                const updatesFin = {
                    checklist_alta: [true, true, true, true, true],
                    fecha_alta_finalizada: new Date().toISOString(),
                    historial: hist
                };
                if (evFin && evFin.id) {
                    updatesFin.id_evento_alta = evFin.id;
                    updatesFin.calendario_evento_alta = evFin.calendar;
                }
                await updateDoc(doc(db, "alumnos", id), updatesFin);
            } catch(calErr) {
                console.warn("No se pudo actualizar evento al finalizar alta:", calErr);
            }
            alert("🏁 Alta Finalizada con éxito. El registro pasó a Altas Finalizadas y el evento en Calendar fue actualizado a Alta Confirmada.");
            cargarVista(estadoActualVista);
        }
        return;
    }
    if (target.classList.contains('btn-devolver-espera') || target.closest('.btn-devolver-espera')) {
        const btn = target.classList.contains('btn-devolver-espera') ? target : target.closest('.btn-devolver-espera');
        const id = btn.getAttribute('data-id');
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const al = alDoc.data();

        const tieneEvento = Boolean(al.id_evento_alta || al.id_evento_reserva || al.reserva_id_evento);
        
        if (tieneEvento) {
            const horarioInfo = al.horario_match || al.reserva_fecha_texto || (al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : 'Clase agendada');
            const profeInfo = al.reserva_profe_nombre || al.profesor_asignado || '-';
            const okCalendario = await window.confirmar(
                `📅 Eliminar agenda de Google Calendar`,
                `El alumno ${al.nombre} tiene una clase/agenda registrada:\n\n• Horario: ${horarioInfo}\n• Docente: ${profeInfo}\n\n¿Confirmás eliminar este evento de Google Calendar y devolver el alumno a Lista de Espera?`,
                '🗑️ Eliminar Agenda y Continuar'
            );
            if (!okCalendario) return;
        }

        const motivo = prompt("¿Motivo para devolver a Lista de Espera?");
        if (motivo !== null) {
            if (motivo.trim() === "") return alert("Debes ingresar un motivo.");
            
            if (tieneEvento) {
                mostrarIndicadorCarga('Eliminando evento en Google Calendar y actualizando estado...');
                try {
                    if (al.id_evento_alta) await eliminarEventoAltaSeguro(al, configApp);
                    if (al.id_evento_reserva || al.reserva_id_evento) await eliminarEventoSeguro(al, configApp);
                } catch(calErr) {
                    console.warn("Aviso calendar al devolver a espera:", calErr);
                }
            }

            const hist = al.historial || [];
            hist.push(crearEntradaHistorial(`Devuelto a Lista de Espera desde ${al.estado_agenda || 'Altas'}. Motivo: ${motivo.trim()}`, 'alta'));
            
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
                id_evento_reserva: null,
                calendario_evento_reserva: null,
                checklist_alta: null,
                historial: hist
            });

            if (tieneEvento) ocultarIndicadorCarga();
            alert(tieneEvento ? "✅ Alumno devuelto a Lista de Espera.\nSe eliminó la agenda asociada en Google Calendar." : "✅ Alumno devuelto a Lista de Espera.");
            await cargarVista(estadoActualVista);
        }
        return;
    }
    if (target.classList.contains('btn-suspender-alta') || target.closest('.btn-suspender-alta')) { 
        const btn = target.classList.contains('btn-suspender-alta') ? target : target.closest('.btn-suspender-alta');
        const id = btn.getAttribute('data-id'); 
        const alDoc = await getDoc(doc(db, "alumnos", id));
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const al = alDoc.data();

        const tieneEvento = Boolean(al.id_evento_alta || al.id_evento_reserva || al.reserva_id_evento);
        if (tieneEvento) {
            const horarioInfo = al.horario_match || al.reserva_fecha_texto || (al.fecha_inicio_clases ? formatearFechaAmi(al.fecha_inicio_clases) : 'Clase agendada');
            const profeInfo = al.reserva_profe_nombre || al.profesor_asignado || '-';
            const okCalendario = await window.confirmar(
                `📅 Eliminar agenda de Google Calendar`,
                `El alumno ${al.nombre} tiene una clase/agenda registrada:\n\n• Horario: ${horarioInfo}\n• Docente: ${profeInfo}\n\n¿Confirmás eliminar este evento de Google Calendar y suspender el alta?`,
                '🗑️ Eliminar Agenda y Suspender'
            );
            if (!okCalendario) return;
        }

        const motivo = prompt("¿Motivo de Suspensión de Alta?"); 
        if (motivo !== null) { 
            if (motivo.trim() === "") return alert("Debes ingresar un motivo."); 
            if (tieneEvento) {
                mostrarIndicadorCarga('Eliminando evento en Google Calendar y suspendiendo...');
                try {
                    if (al.id_evento_alta) await eliminarEventoAltaSeguro(al, configApp);
                    if (al.id_evento_reserva || al.reserva_id_evento) await eliminarEventoSeguro(al, configApp);
                } catch(e) {}
            }

            const hist = al.historial || []; 
            hist.push(crearEntradaHistorial(`Alta suspendida. Motivo: ${motivo.trim()}`, 'suspension')); 
            await updateDoc(doc(db, "alumnos", id), { 
                estado_agenda: "Alta Suspendida", 
                id_evento_alta: null,
                calendario_evento_alta: null,
                id_evento_reserva: null,
                calendario_evento_reserva: null,
                historial: hist 
            }); 
            ocultarIndicadorCarga();
            alert("🛑 Alta suspendida correctamente y evento eliminado de Calendar.");
            await cargarVista(estadoActualVista); 
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

            // Aviso preventivo si el alumno no tiene disponibilidad horaria cargada en su ficha
            const disp = al.disponibilidad || {};
            const tieneDisp = Object.values(disp).some(arr => Array.isArray(arr) && arr.length > 0);
            if (!tieneDisp) {
                mostrarToast("ℹ️ El alumno no tiene disponibilidad horaria cargada en su ficha. Mostrando todos los turnos disponibles.", "warning");
            }

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
                        if (d.activo === false || d.estado === 'inactivo') return;
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
                if (d.activo === false || d.estado === 'inactivo') return;
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
            // Obtener eventos de Google Calendar deduplicando llamadas por calId único (incluyendo calendario general por defecto)
            const calDefecto = configApp.calendario_por_defecto || 'productora.mandalahouse@gmail.com';
            const calendariosUnicos = [...new Set([...todosLosProfes.map(p => p.calId), calDefecto].filter(Boolean))];
            const eventosPorCalId = {};
            for(const cId of calendariosUnicos) {
                try {
                    const data = await getEventosCalendario(cId, dS.toISOString(), dE.toISOString());
                    eventosPorCalId[cId] = data.items || [];
                } catch(e) {
                    eventosPorCalId[cId] = [];
                }
            }

            let allEv = []; 
            todosLosProfes.forEach(pr => {
                const evs = eventosPorCalId[pr.calId] || [];
                evs.forEach(ev => {
                    allEv.push({ ...ev, profeId: pr.id });
                });
            });
            if (eventosPorCalId[calDefecto]) {
                eventosPorCalId[calDefecto].forEach(ev => {
                    allEv.push({ ...ev, profeId: null });
                });
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
        const horarioCursada = al.horario_match || al.reserva_fecha_texto || fAmiInicio || '';
        const valorArancel = al.valor_arancel || configApp.valor_clase || '';
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
            valor_arancel: valorArancel,
            horario_cursada: horarioCursada,
            fecha_inicio_clases: fAmiInicio || horarioCursada,
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
                const fullOp = {
                    ...op,
                    profeId: op.profeId || al.reserva_profe_id || '',
                    profeNombre: op.profeNombre || al.reserva_profe_nombre || '',
                    calId: op.calId || al.reserva_cal_id || ''
                };
                container.innerHTML += `<label style="display:flex; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="radio" name="opt-valida-profe" value='${JSON.stringify(fullOp)}' ${index===0?'checked':''}> ${op.letra ? op.letra+'- ' : ''}${op.fechaTexto}</label>`; 
            }); 
        } else { 
            const op = { inicio: al.reserva_inicio || '', fin: al.reserva_fin || '', fechaTexto: al.reserva_fecha_texto || '', calId: al.reserva_cal_id || '', profeId: al.reserva_profe_id || '', profeNombre: al.reserva_profe_nombre || '' }; 
            container.innerHTML = `<label style="display:flex; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="radio" name="opt-valida-profe" value='${JSON.stringify(op)}' checked> ${op.fechaTexto || 'Horario a coordinar'}</label>`; 
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
            const finalProfeId = op.profeId || al.reserva_profe_id || '';
            const finalProfeNombre = op.profeNombre || al.reserva_profe_nombre || '';
            const finalCalId = op.calId || al.reserva_cal_id || '';
            const finalFechaTexto = op.fechaTexto || al.reserva_fecha_texto || '';
            const finalInicio = op.inicio || al.reserva_inicio || null;
            const finalFin = op.fin || al.reserva_fin || null;

            al.reserva_profe_id = finalProfeId;
            al.reserva_profe_nombre = finalProfeNombre;
            al.reserva_cal_id = finalCalId;
            al.reserva_fecha_texto = finalFechaTexto;
            al.reserva_inicio = finalInicio;
            al.reserva_fin = finalFin;

            const titulos = construirTitulosEvento(al, 'reserva', configApp);
            const evRes = await crearEventoSeguro(al, titulos, finalInicio, finalFin);
            const hist = al.historial || [];
            hist.push(crearEntradaHistorial(`Horario validado por evaluador/a ${finalProfeNombre}. Propuesta enviada al alumno por WhatsApp (${finalFechaTexto}).`, 'agenda'));
            
            await updateDoc(doc(db, "alumnos", id), {
                estado_agenda: "Pendiente validación por alumno",
                id_evento_reserva: evRes ? (evRes.id || null) : null,
                calendario_evento_reserva: evRes ? (evRes.calendar || null) : null,
                reserva_profe_id: finalProfeId,
                reserva_profe_nombre: finalProfeNombre,
                reserva_cal_id: finalCalId,
                reserva_fecha_texto: finalFechaTexto,
                reserva_inicio: finalInicio,
                reserva_fin: finalFin,
                opciones_propuestas: null,
                historial: hist
            });
            const dataText = await generarTextoConHistorial(id, 'texto_alumno');
            if (dataText && dataText.txt) {
                await navigator.clipboard.writeText(dataText.txt);
            }
            document.getElementById('modal-validar-profe').close();
            removerFilaOptimista(id);
            await cargarVista(estadoActualVista);
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
        try {
            const alDoc = await getDoc(doc(db, "alumnos", id));
            if (!alDoc.exists()) {
                return alert("Alumno no encontrado.");
            }
            const al = alDoc.data();

            // VALIDACIÓN CHECKLIST DE ADMISIÓN
            const checksAdm = al.checklist_admision || [false, false];
            const pendientesAdm = [];
            if (!checksAdm[0]) pendientesAdm.push('1. Clase de admisión abonada');
            if (!checksAdm[1]) pendientesAdm.push('2. Carga de formulario completa');
            if (pendientesAdm.length > 0) {
                return alert(`⚠️ No se puede confirmar la agenda:\n\nTiene los siguientes requisitos pendientes en el checklist:\n• ${pendientesAdm.join('\n• ')}\n\nPor favor tildá estos puntos antes de confirmar.`);
            }

            setBotonCargando(btn, true, 'Confirmando agenda en Calendar...');
            const descP = convertirHtmlATextoPlano(al.descripcion || '');
            const titulos = construirTitulosEvento(al, 'confirmado', configApp);
            if (al.id_evento_reserva) {
                try {
                    await actualizarEventoSeguro(al, titulos, descP);
                } catch(calErr) {
                    console.warn("Aviso: No se pudo actualizar el evento en Google Calendar:", calErr);
                }
            }
            const hist = al.historial || [];
            hist.push(crearEntradaHistorial(`Entrevista confirmada con el alumno para el ${al.reserva_fecha_texto || ''} con ${al.reserva_profe_nombre || 'Evaluador'}.`, 'agenda'));
            await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Agenda confirmada", historial: hist });
            removerFilaOptimista(id);
            await cargarVista(estadoActualVista);

            // Generar y copiar automáticamente registro de facturación de admisión (13 columnas)
            const txtFact = generarFilaExcelFacturacionAdmision(al, configApp);
            let avisoFact = "";
            try {
                await navigator.clipboard.writeText(txtFact);
                avisoFact = "\n\n💰 ¡Fila de Facturación copiada automáticamente al portapapeles!";
            } catch(e) {}
            alert("✅ ¡Agenda Confirmada exitosamente! El alumno pasó a Confirmadas." + avisoFact);
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
            mostrarToast("💬 Texto para Evaluador/Docente copiado al portapapeles", "success"); 
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
            mostrarToast("💬 Texto de WhatsApp para el alumno copiado al portapapeles", "success"); 
        } catch(e) {
            console.error("Error al copiar texto alumno:", e);
            alert("❌ Error al copiar texto: " + e.message);
        } 
        return; 
    }
    if (target.classList.contains('btn-reenviar-prealta') || target.closest('.btn-reenviar-prealta')) {
        const btn = target.classList.contains('btn-reenviar-prealta') ? target : target.closest('.btn-reenviar-prealta');
        try {
            const id = btn.getAttribute('data-id');
            const data = await generarTextoConHistorial(id, 'texto_prealta');
            await navigator.clipboard.writeText(data.txt);
            mostrarToast("💬 Mensaje de Pre-Alta copiado al portapapeles", "success");
        } catch(e) {
            console.error("Error al copiar texto prealta:", e);
            alert("❌ Error al copiar texto de pre-alta: " + e.message);
        }
        return;
    }
    if (target.classList.contains('btn-reenviar-alta') || target.closest('.btn-reenviar-alta')) {
        const btn = target.classList.contains('btn-reenviar-alta') ? target : target.closest('.btn-reenviar-alta');
        try {
            const id = btn.getAttribute('data-id');
            const data = await generarTextoConHistorial(id, 'texto_alta_confirmada');
            await navigator.clipboard.writeText(data.txt);
            mostrarToast("💬 Mensaje de Alta Confirmada copiado al portapapeles", "success");
        } catch(e) {
            console.error("Error al copiar texto alta confirmada:", e);
            alert("❌ Error al copiar texto de alta: " + e.message);
        }
        return;
    }
    if (target.classList.contains('btn-cancelar-reserva') || target.classList.contains('btn-cancelar-alumno') || target.closest('.btn-cancelar-reserva') || target.closest('.btn-cancelar-alumno')) { 
        const btn = target.closest('.btn-cancelar-reserva') || target.closest('.btn-cancelar-alumno') || target;
        const id = btn.getAttribute('data-id'); 
        const alDoc = await getDoc(doc(db, "alumnos", id)); 
        if (!alDoc.exists()) return alert("Alumno no encontrado.");
        const alData = alDoc.data(); 

        const tieneEvento = Boolean(alData.id_evento_reserva || alData.id_evento_alta || alData.reserva_fecha_texto);
        if (tieneEvento) {
            const horarioInfo = alData.reserva_fecha_texto || alData.horario_match || 'Reserva agendada';
            const profeInfo = alData.reserva_profe_nombre || alData.profesor_asignado || '-';
            const okCalendario = await window.confirmar(
                `📅 Eliminar reserva de Google Calendar`,
                `El alumno ${alData.nombre} tiene una entrevista agendada:\n\n• Horario: ${horarioInfo}\n• Docente: ${profeInfo}\n\n¿Confirmás eliminar este evento de Google Calendar y cancelar la reserva?`,
                '🗑️ Eliminar Reserva y Cancelar'
            );
            if (!okCalendario) return;
        }

        const motivo = prompt("¿Ingresa motivo para historial:"); 
        if (motivo !== null) { 
            if (motivo.trim() === "") return alert("Debes ingresar motivo."); 
            mostrarIndicadorCarga('Cancelando evento en Calendar...');
            try { 
                if (alData.id_evento_reserva) await eliminarEventoSeguro(alData, configApp); 
                if (alData.id_evento_alta) await eliminarEventoAltaSeguro(alData, configApp);
                const hist = alData.historial || []; 
                hist.push(crearEntradaHistorial(`Entrevista cancelada. Motivo: ${motivo.trim()}. Evento liberado en Google Calendar.`, 'suspension')); 
                const data = await generarTextoConHistorial(id, 'texto_cancela_alumno'); 
                if (data.al.estado_agenda === 'Pendiente validación por alumno' || data.al.estado_agenda === 'Agenda confirmada') { 
                    await navigator.clipboard.writeText(data.txt); 
                    alert("Cancelada. Texto CANCELACIÓN copiado."); 
                } 
                await updateDoc(doc(db, "alumnos", id), { estado_agenda: "Pendiente procesar", reserva_profe_id: null, reserva_profe_nombre: null, reserva_cal_id: null, reserva_fecha_texto: null, reserva_inicio: null, reserva_fin: null, id_evento_reserva: null, calendario_evento_reserva: null, id_evento_alta: null, calendario_evento_alta: null, opciones_propuestas: null, historial: hist }); 
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
                const hist = alData.historial || [];
                hist.push(crearEntradaHistorial('Derivado directamente a Lista de Espera sin entrevista previa.', 'sistema'));
                await updateDoc(doc(db, "alumnos", id), {
                    estado_agenda: 'Lista de espera',
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

            if (teniaReserva) {
                const okEliminar = await window.confirmar(
                    `📅 Eliminar agenda de Google Calendar`,
                    `El alumno ${al.nombre} tiene una agenda registrada:\n\n• Horario: ${fechaPrevTexto || 'Clase agendada'}\n• Docente: ${profPrevioNom || 'Profesor'}\n\n¿Confirmás eliminar este evento de Google Calendar y suspender la ficha?`,
                    '🗑️ Eliminar Agenda y Suspender'
                );
                if (!okEliminar) {
                    setBotonCargando(target, false);
                    return;
                }
            }

            if (al.id_evento_reserva) await eliminarEventoSeguro(al, configApp);
            if (al.id_evento_alta) await eliminarEventoAltaSeguro(al, configApp);
            
            const hist = al.historial || []; 
            const motivoCompleto = det ? `${mtv} (Detalle: ${det})` : mtv;
            hist.push(crearEntradaHistorial(`Alumno suspendido. Motivo: ${motivoCompleto}. Eventos y cupos liberados.`, 'suspension')); 
            
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
                mostrarToast("💬 Texto de Cancelación copiado al portapapeles", "success");
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
    if (target.classList.contains('btn-cerrar-modal')) { 
        const mId = target.getAttribute('data-modal');
        const dlg = document.getElementById(mId);
        if (dlg) {
            dlg.close();
            if (mId === 'modal-iniciar-prealta') {
                const warnCont = document.getElementById('prealta-match-warnings-container');
                if (warnCont) warnCont.style.display = 'none';
                const warnList = document.getElementById('prealta-match-warnings-list');
                if (warnList) warnList.innerHTML = '';
                const alertVal = document.getElementById('prealta-alerta-validacion');
                if (alertVal) alertVal.style.display = 'none';
            }
        }
        return; 
    }
    
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
            const diaRow = document.querySelector(`.dia-row[data-dia="${d.id}"]`);
            if (diaRow) {
                actualizarBotonesQuitarRangoEnFila(diaRow);
                updateDispStateForRow(diaRow);
            }
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
        const tabBtnInforme = document.querySelector('.tab-btn[data-target="tab-informe"]');
        if (tabBtnInforme) tabBtnInforme.style.display = 'none';
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
    await llenarFormularioAlumno(id, false);
    document.getElementById('modal-alta-alumno').showModal();
};

window.abrirModalPrealta = async function(id, esEdicion = false, inicioPrev = null, grupoPrev = null, options = {}) {
    const opts = (typeof options === 'object' && options !== null) ? options : {};
    await abrirModalPrealta(id, grupoPrev || '', inicioPrev || '', { configApp, setBotonCargando, esEdicion: Boolean(esEdicion), ...opts });
};

window.abrirModalPrealtaGrupal = async function(ids, grupoNom = '', cfg = null) {
    await abrirModalPrealtaGrupal(ids, grupoNom, cfg || configApp);
};

window.abrirFichaAlumnoDocente = async function(id) {
    const wrap = document.getElementById('form-alumno-wrapper');
    if (!wrap) return;
    wrap.style.display = 'block';
    document.getElementById('modal-alta-alumno').appendChild(wrap);
    document.getElementById('form-titulo').textContent = "Ficha del Alumno (Modo Lectura)";
    await llenarFormularioAlumno(id, true);
    document.getElementById('modal-alta-alumno').showModal();
};

async function llenarFormularioAlumno(id, modoLectura = false) { 
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
    
    // Renderizar informe estructurado de entrevista si existe o legacy
    const contStruct = document.getElementById('ficha-informe-entrevista-structured');
    const wrapLegacy = document.getElementById('ficha-informe-legacy-wrapper');
    const inf = d.informe_entrevista || (d.informe_admision ? {
        nivel_asignado: d.nivel || '',
        profesion: d.profesion || '',
        motivacion_expectativas: '',
        diagnostico_tecnico: d.informe_admision || '',
        artistas_estilos: '',
        disp_compartir_cantante: 'no_aplica',
        cambio_tonalidades: 'no_aplica',
        requisitos_aceptados: true,
        cierre_espera_notificado: true,
        perfil_psicologico: d.perfil_psicologico || []
    } : null);

    if (inf && contStruct) {
        contStruct.style.display = 'flex';
        if (wrapLegacy) wrapLegacy.style.display = 'none';

        contStruct.innerHTML = `
            <div style="background:var(--hover-bg); border:1px solid var(--border-color); border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                    <strong style="color:var(--text-main); font-size:13px;">📋 Informe de Entrevista & Nivelación</strong>
                    <span class="status-badge bg-blue" style="font-size:10px;">${inf.nivel_asignado || d.nivel || 'Nivel Asignado'}</span>
                </div>
                
                ${inf.profesion ? `<div><span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">💼 Profesión / Ocupación:</span><div style="font-size:12.5px; font-weight:600; color:var(--text-main); margin-top:2px;">${inf.profesion}</div></div>` : ''}

                ${inf.motivacion_expectativas ? `
                <div>
                    <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">1. Motivación, Intereses y Expectativas:</span>
                    <div style="font-size:12.5px; color:var(--text-main); background:#fff; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color); margin-top:3px; line-height:1.4;">${inf.motivacion_expectativas}</div>
                </div>` : ''}

                <div>
                    <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">2. Diagnóstico Técnico & Plasticidad:</span>
                    <div style="font-size:12.5px; color:var(--text-main); background:#fff; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color); margin-top:3px; line-height:1.4;">${inf.diagnostico_tecnico || '-'}</div>
                </div>

                ${inf.artistas_estilos ? `
                <div>
                    <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">🎵 Zona de Confort / Artistas Referentes:</span>
                    <div style="font-size:12.5px; font-weight:600; color:var(--accent-teal); background:#fff; padding:6px 10px; border-radius:6px; border:1px solid var(--border-color); margin-top:3px;">${inf.artistas_estilos}</div>
                </div>` : ''}

                ${(inf.disp_compartir_cantante && inf.disp_compartir_cantante !== 'no_aplica') || (inf.cambio_tonalidades && inf.cambio_tonalidades !== 'no_aplica') ? `
                <div style="display:grid; grid-template-columns:${(inf.disp_compartir_cantante && inf.disp_compartir_cantante !== 'no_aplica') && (inf.cambio_tonalidades && inf.cambio_tonalidades !== 'no_aplica') ? '1fr 1fr' : '1fr'}; gap:8px; font-size:11.5px; margin-top:4px;">
                    ${inf.disp_compartir_cantante && inf.disp_compartir_cantante !== 'no_aplica' ? `
                    <div style="padding:6px 8px; background:#fff; border-radius:6px; border:1px solid var(--border-color);">
                        <span style="color:var(--text-muted); font-weight:700;">🎤 COMPARTIR VOCES:</span>
                        <div style="font-weight:600; color:var(--text-main); margin-top:2px;">${inf.disp_compartir_cantante === 'compartir' ? '✅ Dispuesto a compartir y armar voces' : (inf.disp_compartir_cantante === 'solo' ? '⚠️ Prefiere cantar solo' : (inf.disp_compartir_cantante === 'ambos' ? '✅ Abierto a ambas' : '-'))}</div>
                    </div>` : ''}
                    ${inf.cambio_tonalidades && inf.cambio_tonalidades !== 'no_aplica' ? `
                    <div style="padding:6px 8px; background:#fff; border-radius:6px; border:1px solid var(--border-color);">
                        <span style="color:var(--text-muted); font-weight:700;">🎼 TONALIDADES:</span>
                        <div style="font-weight:600; color:var(--text-main); margin-top:2px;">${inf.cambio_tonalidades === 'sabe_dispuesto' ? '✅ Sabe transportar y dispuesto' : (inf.cambio_tonalidades === 'dispuesto_aprender' ? '🌱 Dispuesto a aprender' : (inf.cambio_tonalidades === 'prefiere_original' ? '⚠️ Prefiere original' : '-'))}</div>
                    </div>` : ''}
                </div>` : ''}

                ${Array.isArray(inf.perfil_psicologico) && inf.perfil_psicologico.length > 0 ? `
                <div style="margin-top:2px;">
                    <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">🧠 Perfil Emocional:</span>
                    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                        ${inf.perfil_psicologico.map(t => `<span class="profile-tag-badge" style="font-size:10px; padding:2px 7px;">${t}</span>`).join('')}
                    </div>
                </div>` : ''}

                <div style="display:flex; gap:12px; font-size:11px; color:var(--text-muted); font-weight:600; margin-top:4px;">
                    <span>✅ Propuesta charlada</span>
                    <span>✅ Requisitos acordados</span>
                    <span>✅ Notificado en Lista de Espera</span>
                </div>
            </div>
        `;
    } else {
        if (contStruct) { contStruct.style.display = 'none'; contStruct.innerHTML = ''; }
        if (wrapLegacy) wrapLegacy.style.display = 'none';
    }

    // Control de visibilidad del Tab Informe
    const tabBtnInforme = document.querySelector('.tab-btn[data-target="tab-informe"]');
    const estadosConInforme = ['Agenda confirmada', 'Lista de espera', 'Validando grupo', 'Pre-alta pendiente', 'Pre-alta iniciada', 'Alta Efectiva', 'Alta Ilegal', 'Alta Finalizada', 'Agenda suspendida', 'Alta Suspendida'];
    const tieneInformeGuardado = Boolean(d.informe_entrevista || d.informe_admision);
    const puedeVerInforme = estadosConInforme.includes(d.estado_agenda) || tieneInformeGuardado;
    
    if (tabBtnInforme) {
        tabBtnInforme.style.display = puedeVerInforme ? 'inline-flex' : 'none';
    }

    // Botón de editar informe desde la ficha
    const btnEditWrap = document.getElementById('ficha-informe-btn-edit-wrapper');
    if (btnEditWrap) {
        const roles = Array.isArray(window.usuarioActual?.roles) && window.usuarioActual.roles.length > 0
            ? window.usuarioActual.roles
            : [window.usuarioActual?.rol || 'admisiones'];
        const puedeEditarInforme = !modoLectura && (roles.includes('admin') || roles.includes('admisiones') || roles.includes('admisor') || roles.includes('evaluador'));
        btnEditWrap.style.display = (puedeEditarInforme && (d.estado_agenda === 'Lista de espera' || d.informe_entrevista || d.informe_admision || d.estado_agenda === 'Agenda confirmada')) ? 'flex' : 'none';
    }

    quillInforme.root.innerHTML = d.informe_admision || '';
    renderChipsPerfilPsicologico('ficha-perfil-psicologico-chips', d.perfil_psicologico || []);
    
    // 1. Datos de Entrevista en Tab Informe
    let fechaEntrevistaTxt = '-';
    if (d.reserva_inicio) {
        fechaEntrevistaTxt = formatearFechaHoraEstandar(d.reserva_inicio);
    } else if (d.informe_entrevista && d.informe_entrevista.fecha_evaluacion) {
        fechaEntrevistaTxt = formatearFechaHoraEstandar(d.informe_entrevista.fecha_evaluacion);
    } else if (d.opciones_propuestas && d.opciones_propuestas.length > 1) {
        fechaEntrevistaTxt = d.opciones_propuestas.map(o => `${o.letra || '-'}: ${o.fechaTexto}`).join(' / ');
    } else if (d.reserva_fecha_texto) {
        fechaEntrevistaTxt = formatearFechaHoraEstandar(d.reserva_fecha_texto);
    }
    const evaluadorTxt = d.reserva_profe_nombre || (d.informe_entrevista && d.informe_entrevista.evaluador_nombre) || '-';
    const elFechaInf = document.getElementById('modal-informe-fecha-val');
    const elEvalInf = document.getElementById('modal-informe-evaluador-val');
    if (elFechaInf) elFechaInf.textContent = fechaEntrevistaTxt;
    if (elEvalInf) elEvalInf.textContent = evaluadorTxt;

    // Configuración de Corrección de Entrevista (Solo para Administrador)
    const uActual = window.usuarioActual || {};
    const rolesUser = Array.isArray(uActual.roles) && uActual.roles.length > 0
        ? uActual.roles
        : [uActual.rol || 'admisor'];
    const esAdmin = rolesUser.includes('admin') || uActual.rol === 'admin' || uActual.email?.toLowerCase() === 'productora.mandalahouse@gmail.com' || window.modoRolActivo === 'admin';

    const btnCorregirEntrevista = document.getElementById('btn-corregir-entrevista-admin');
    const boxViewEntrevista = document.getElementById('modal-informe-entrevista-view');
    const boxEditEntrevista = document.getElementById('modal-informe-entrevista-edit');

    if (boxViewEntrevista) boxViewEntrevista.style.display = 'flex';
    if (boxEditEntrevista) boxEditEntrevista.style.display = 'none';

    if (btnCorregirEntrevista) {
        btnCorregirEntrevista.style.display = (!modoLectura && esAdmin) ? 'inline-flex' : 'none';
        btnCorregirEntrevista.onclick = async () => {
            const inpFecha = document.getElementById('modal-informe-fecha-edit-input');
            const selEval = document.getElementById('modal-informe-evaluador-select');
            const inpCustomEval = document.getElementById('modal-informe-evaluador-custom-input');

            if (inpFecha) inpFecha.value = (d.reserva_fecha_texto && d.reserva_fecha_texto !== '-') ? d.reserva_fecha_texto : (fechaEntrevistaTxt !== '-' ? fechaEntrevistaTxt : '');
            
            // Cargar lista de evaluadores / docentes en el select
            if (selEval) {
                selEval.innerHTML = '<option value="">Seleccionar evaluador...</option>';
                try {
                    const pSnap = await getDocs(collection(db, "profesores"));
                    const nombresVistos = new Set();
                    pSnap.forEach(p => {
                        const pData = p.data();
                        if (pData.activo !== false && pData.nombre && !nombresVistos.has(pData.nombre.trim())) {
                            nombresVistos.add(pData.nombre.trim());
                            const opt = document.createElement('option');
                            opt.value = pData.nombre.trim();
                            opt.dataset.profeId = p.id;
                            opt.textContent = pData.nombre.trim() + (pData.entrevista ? ' (Evaluador)' : '');
                            selEval.appendChild(opt);
                        }
                    });
                } catch(e) {
                    console.error("Error cargando profesores:", e);
                }

                // Preseleccionar si existe coincidencia
                const evalActual = (d.reserva_profe_nombre || '').trim();
                let matchEncontrado = false;
                Array.from(selEval.options).forEach(opt => {
                    if (opt.value && opt.value.toLowerCase() === evalActual.toLowerCase()) {
                        opt.selected = true;
                        matchEncontrado = true;
                    }
                });

                if (!matchEncontrado && evalActual) {
                    if (inpCustomEval) {
                        inpCustomEval.value = evalActual;
                        inpCustomEval.style.display = 'block';
                        selEval.style.display = 'none';
                    }
                } else {
                    if (inpCustomEval) {
                        inpCustomEval.value = '';
                        inpCustomEval.style.display = 'none';
                        selEval.style.display = 'block';
                    }
                }
            }

            if (boxViewEntrevista) boxViewEntrevista.style.display = 'none';
            if (boxEditEntrevista) boxEditEntrevista.style.display = 'flex';
        };
    }

    const btnCancelCorregir = document.getElementById('btn-cancelar-entrevista-admin');
    if (btnCancelCorregir) {
        btnCancelCorregir.onclick = () => {
            if (boxEditEntrevista) boxEditEntrevista.style.display = 'none';
            if (boxViewEntrevista) boxViewEntrevista.style.display = 'flex';
        };
    }

    const btnToggleCustom = document.getElementById('btn-toggle-evaluador-custom');
    if (btnToggleCustom) {
        btnToggleCustom.onclick = () => {
            const selEval = document.getElementById('modal-informe-evaluador-select');
            const inpCustom = document.getElementById('modal-informe-evaluador-custom-input');
            if (selEval && inpCustom) {
                if (selEval.style.display === 'none') {
                    selEval.style.display = 'block';
                    inpCustom.style.display = 'none';
                } else {
                    selEval.style.display = 'none';
                    inpCustom.style.display = 'block';
                    inpCustom.focus();
                }
            }
        };
    }

    const btnSaveCorregir = document.getElementById('btn-guardar-entrevista-admin');
    if (btnSaveCorregir) {
        btnSaveCorregir.onclick = async () => {
            const inpFecha = document.getElementById('modal-informe-fecha-edit-input');
            const selEval = document.getElementById('modal-informe-evaluador-select');
            const inpCustom = document.getElementById('modal-informe-evaluador-custom-input');

            const nuevaFecha = inpFecha ? inpFecha.value.trim() : '';
            let nuevoEvaluador = '';
            let nuevoEvaluadorId = '';

            if (selEval && selEval.style.display !== 'none') {
                nuevoEvaluador = selEval.value.trim();
                const selOpt = selEval.selectedOptions[0];
                if (selOpt && selOpt.dataset.profeId) nuevoEvaluadorId = selOpt.dataset.profeId;
            } else if (inpCustom && inpCustom.style.display !== 'none') {
                nuevoEvaluador = inpCustom.value.trim();
            }

            if (!nuevaFecha && !nuevoEvaluador) {
                alert("⚠️ Por favor ingresa al menos un dato (fecha o evaluador).");
                return;
            }

            try {
                btnSaveCorregir.disabled = true;
                btnSaveCorregir.textContent = 'Guardando...';

                const updates = {};
                if (nuevaFecha) updates.reserva_fecha_texto = nuevaFecha;
                if (nuevoEvaluador) {
                    updates.reserva_profe_nombre = nuevoEvaluador;
                    if (nuevoEvaluadorId) {
                        updates.reserva_profe_id = nuevoEvaluadorId;
                        updates.profesor_id = nuevoEvaluadorId;
                    }
                }

                // Actualizar dentro de informe_entrevista si ya existe
                if (d.informe_entrevista) {
                    if (nuevoEvaluador) updates['informe_entrevista.evaluador_nombre'] = nuevoEvaluador;
                    if (nuevoEvaluadorId) updates['informe_entrevista.evaluador_id'] = nuevoEvaluadorId;
                }

                const ahoraStr = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
                const adminNom = window.usuarioActual?.nombre || 'Admin';
                const entradaHistorial = `[${ahoraStr}] Datos de entrevista corregidos por Admin (${adminNom}): Fecha "${nuevaFecha || '-'}", Evaluador "${nuevoEvaluador || '-'}"`;
                
                updates.historial = [entradaHistorial, ...(d.historial || [])];

                await updateDoc(doc(db, "alumnos", id), updates);

                // Actualizar en DOM
                if (elFechaInf && nuevaFecha) elFechaInf.textContent = nuevaFecha;
                if (elEvalInf && nuevoEvaluador) elEvalInf.textContent = nuevoEvaluador;

                // Actualizar objeto en memoria
                d.reserva_fecha_texto = nuevaFecha;
                d.reserva_profe_nombre = nuevoEvaluador;

                if (boxEditEntrevista) boxEditEntrevista.style.display = 'none';
                if (boxViewEntrevista) boxViewEntrevista.style.display = 'flex';

                if (typeof mostrarToast === 'function') {
                    mostrarToast("✅ Datos de entrevista corregidos correctamente", "success");
                } else {
                    alert("✅ Datos de entrevista corregidos correctamente");
                }

                if (typeof cargarVista === 'function') {
                    cargarVista(estadoActualVista);
                }
            } catch(err) {
                console.error("Error al guardar corrección de entrevista:", err);
                alert("❌ Error al guardar: " + err.message);
            } finally {
                btnSaveCorregir.disabled = false;
                btnSaveCorregir.textContent = '💾 Guardar Corrección';
            }
        };
    }

    // 2. Datos de Suscripción de Alta en Tab Datos
    const elAltaBox = document.getElementById('modal-seccion-alta-box');
    const elAltaProfe = document.getElementById('modal-alta-profe-val');
    const elAltaGrupo = document.getElementById('modal-alta-grupo-val');
    const inpHora = document.getElementById('modal-alta-horario-input');
    const inpIni = document.getElementById('modal-alta-inicio-input');
    
    const tieneDatosAlta = d.grupo_asignado || d.horario_match || d.fecha_inicio_clases || d.profesor_asignado || (['Pre-alta pendiente', 'Pre-alta iniciada', 'Alta Efectiva', 'Alta Ilegal', 'Alta Finalizada', 'Validando grupo'].includes(d.estado_agenda) && d.reserva_profe_nombre);
    
    if (tieneDatosAlta && elAltaBox) {
        elAltaBox.style.display = 'block';
        if (elAltaProfe) elAltaProfe.textContent = d.profesor_asignado || d.reserva_profe_nombre || '-';
        if (elAltaGrupo) elAltaGrupo.textContent = d.grupo_asignado || '-';
        if (inpHora) inpHora.value = d.horario_match || d.reserva_fecha_texto || '';
        if (inpIni) {
            if (d.fecha_inicio_clases) {
                try {
                    const f = new Date(d.fecha_inicio_clases);
                    inpIni.value = !isNaN(f.getTime()) ? formatoLocalISO(f).substring(0, 16) : '';
                } catch(e) { inpIni.value = ''; }
            } else {
                inpIni.value = '';
            }
        }
    } else if (elAltaBox) {
        elAltaBox.style.display = 'none';
        if (inpHora) inpHora.value = '';
        if (inpIni) inpIni.value = '';
    }

    // Estado de Auditoría de Calendar en el Modal (Oculto para Docentes/Profesores)
    const elCalAuditBox = document.getElementById('modal-cal-audit-box');
    const badgeCalStatus = document.getElementById('badge-modal-cal-status');
    const tieneEventoCalendar = Boolean(d.id_evento_alta || d.id_evento_reserva || d.fecha_inicio_clases || d.horario_match || d.reserva_fecha_texto);
    
    const u = window.usuarioActual || {};
    const r = (u.rol || '').toLowerCase();
    const esDocenteOModoLectura = modoLectura || r === 'docente' || r === 'profesor' || (Array.isArray(u.roles) && (u.roles.includes('docente') || u.roles.includes('profesor')) && !u.roles.includes('admin') && !u.roles.includes('admisor'));

    if (elCalAuditBox) {
        elCalAuditBox.style.display = (!esDocenteOModoLectura && tieneEventoCalendar) ? 'flex' : 'none';
        if (badgeCalStatus) {
            badgeCalStatus.textContent = '⚪ Sin verificar';
            badgeCalStatus.style.background = '#e2e8f0';
            badgeCalStatus.style.color = '#475569';
        }
    }
    
    // Controles de Modo Lectura para Docentes vs Edición Admisor
    const camposForm = ['nombre', 'celular', 'edad', 'nivel', 'tipo_suscripcion', 'modal-alta-horario-input', 'modal-alta-inicio-input'];
    camposForm.forEach(cid => {
        const el = document.getElementById(cid);
        if (el) el.disabled = modoLectura;
    });

    const tabInformeBtn = document.querySelector('.tab-btn[data-target="tab-informe"]');
    if (tabInformeBtn) tabInformeBtn.style.display = modoLectura ? 'none' : 'block';

    const btnSubmit = document.getElementById('btn-submit-alumno');
    if (btnSubmit) btnSubmit.style.display = modoLectura ? 'none' : 'block';
    const contIngreso = document.getElementById('container-ingreso-directo');
    if (contIngreso) contIngreso.style.display = modoLectura ? 'none' : 'flex';

    const estadosBloqueados = ['Pendiente procesar', 'Pendiente validación por profe', 'Pendiente validación por alumno'];
    if (modoLectura || estadosBloqueados.includes(d.estado_agenda)) {
        if (!modoLectura) document.getElementById('aviso-informe-bloqueado').style.display = 'block';
        quillInforme.enable(false);
    } else {
        document.getElementById('aviso-informe-bloqueado').style.display = 'none';
        quillInforme.enable(true);
    }

    if (modoLectura) {
        quill.enable(false);
    } else {
        quill.enable(true);
    }
    
    const info = getEstadoYBadgeLocal(d);
    const badgeEl = document.getElementById('modal-status-badge');
    if (badgeEl) { badgeEl.className = `status-badge ${info.colorBadge}`; badgeEl.textContent = info.txtEstado; badgeEl.style.display = 'inline-flex'; }

    const accionesCont = document.getElementById('modal-acciones-container');
    if (accionesCont) {
        if (modoLectura) {
            accionesCont.style.display = 'none';
        } else {
            accionesCont.style.display = 'block';
            accionesCont.innerHTML = `
                <button type="button" id="btn-trigger-modal-acciones" style="background:var(--accent-teal); color:white; border:none; padding:7px 14px; border-radius:8px; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">Acciones ▾</button>
                <div class="dropdown-menu-wrapper" id="modal-acciones-dropdown" style="top:100%; left:0; right:auto; z-index:1200; min-width:220px;">
                    <div class="dropdown-menu">${generarBotonesAccion(d, id, true)}</div>
                </div>
            `;
        }
    }

    const btnNuevaSusc = document.getElementById('btn-modal-nueva-suscripcion');
    if (btnNuevaSusc) {
        btnNuevaSusc.style.display = (modoLectura || !id) ? 'none' : 'block';
        btnNuevaSusc.setAttribute('data-id', id);
    }

    const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00'; 
    poblarDisponibilidadMultiRango(d.disponibilidad || {}, 'contenedor-disponibilidad', hApe, hCie, modoLectura);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
    const tabBtns = document.querySelectorAll('.tab-btn'); 
    if(tabBtns.length > 0) { tabBtns[0].classList.add('active'); } 
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none'); 
    if(document.getElementById('tab-datos')) document.getElementById('tab-datos').style.display = 'block';
}

document.getElementById('form-alumno').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const btnSubmit = e.target.querySelector('button[type="submit"]'); 
    setBotonCargando(btnSubmit, true);
    
    const hApe = configApp.hora_apertura || '09:00', hCie = configApp.hora_cierre || '22:00'; 
    const disp = extraerDisponibilidadMultiRango('contenedor-disponibilidad', hApe, hCie); 
    
    const selInst = document.getElementById('instrumento'), instV = Array.from(selInst.selectedOptions).map(o=>o.value);
    const tagsPerfil = getPerfilPsicologicoSeleccionado('ficha-perfil-psicologico-chips');
    const inpHora = document.getElementById('modal-alta-horario-input');
    const inpIni = document.getElementById('modal-alta-inicio-input');

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

    if (inpHora && inpHora.value.trim()) {
        data.horario_match = inpHora.value.trim();
    }
    if (inpIni && inpIni.value) {
        try {
            const dIni = new Date(inpIni.value);
            if (!isNaN(dIni.getTime())) {
                data.fecha_inicio_clases = formatoLocalISO(dIni);
            }
        } catch(e) {}
    }

    try {
        const id = document.getElementById('alumno-id').value;
        if (id) {
            await updateDoc(doc(db, "alumnos", id), data);
        } else {
            const esDirecto = document.getElementById('chk-ingreso-directo').checked;
            if (esDirecto) {
                data.estado_agenda = "Lista de espera";
                data.historial.push(crearEntradaHistorial("Ingreso directo a Lista de Espera sin entrevista previa.", 'sistema'));
            } else {
                data.estado_agenda = "Pendiente procesar";
                data.historial.push(crearEntradaHistorial("Nuevo alumno registrado en bandeja de admisión.", 'sistema'));
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

// =======================================================================
// MÓDULO UNIVERSAL: MI PERFIL (TODOS LOS ROLES)
// =======================================================================
export async function abrirModalMiPerfil() {
    const usuario = window.usuarioActual || {};
    const email = usuario.email || '';
    
    document.getElementById('mi-perfil-email').value = email;
    document.getElementById('mi-perfil-nombre').value = usuario.nombre || '';
    document.getElementById('mi-perfil-celular').value = usuario.celular || '';
    document.getElementById('mi-perfil-alias').value = usuario.alias_transferencia || '';

    const rolesArr = Array.isArray(usuario.roles) && usuario.roles.length > 0 ? usuario.roles : [usuario.rol || 'admisor'];
    const esDocente = rolesArr.includes('profesor') || rolesArr.includes('evaluador') || Boolean(usuario.profesor_id);

    const secDocente = document.getElementById('mi-perfil-seccion-docente');
    
    if (esDocente) {
        if (secDocente) secDocente.style.display = 'block';

        let pDocData = null;
        if (usuario.profesor_id) {
            try {
                const pSnap = await getDoc(doc(db, "profesores", usuario.profesor_id));
                if (pSnap.exists()) pDocData = { id: pSnap.id, ...pSnap.data() };
            } catch(e) {}
        }

        if (!pDocData && email) {
            try {
                const pSnap = await getDocs(collection(db, "profesores"));
                pSnap.forEach(d => {
                    const dt = d.data();
                    if (dt.correo_calendario && dt.correo_calendario.toLowerCase() === email.toLowerCase()) {
                        pDocData = { id: d.id, ...dt };
                    }
                });
            } catch(e) {}
        }

        if (pDocData) {
            if (!document.getElementById('mi-perfil-celular').value) {
                document.getElementById('mi-perfil-celular').value = pDocData.celular || '';
            }
            if (!document.getElementById('mi-perfil-alias').value) {
                document.getElementById('mi-perfil-alias').value = pDocData.alias_transferencia || '';
            }
            if (!document.getElementById('mi-perfil-nombre').value && pDocData.nombre) {
                document.getElementById('mi-perfil-nombre').value = pDocData.nombre;
            }

            const badgesCont = document.getElementById('mi-perfil-skills-badges');
            if (badgesCont) {
                const skills = Array.isArray(pDocData.skills) ? pDocData.skills : [];
                if (skills.length > 0) {
                    badgesCont.innerHTML = skills.map(s => `
                        <span class="profile-tag-badge" style="background:#f0fdfa; color:#0f766e; border-color:#99f6e4; font-size:12.5px; padding:4px 10px; font-weight:700;">
                            ${getEmojiParaInstrumentoGlobal(s)} ${s}
                        </span>
                    `).join('');
                } else {
                    badgesCont.innerHTML = '<span style="color:var(--text-muted); font-size:12px; font-style:italic;">Sin instrumentos asignados.</span>';
                }
            }

            poblarDisponibilidadMultiRango(pDocData.disponibilidad || {}, 'contenedor-disponibilidad-mi-perfil');
        } else {
            poblarDisponibilidadMultiRango({}, 'contenedor-disponibilidad-mi-perfil');
        }
    } else {
        if (secDocente) secDocente.style.display = 'none';
    }

    const modal = document.getElementById('modal-mi-perfil');
    if (modal) modal.showModal();
}

function getEmojiParaInstrumentoGlobal(inst) {
    if (!inst) return '🎵';
    const s = String(inst).toLowerCase();
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

window.abrirModalMiPerfilGlobal = abrirModalMiPerfil;

const navMiPerfil = document.getElementById('nav-item-mi-perfil');
if (navMiPerfil) {
    navMiPerfil.addEventListener('click', abrirModalMiPerfil);
}

const btnGuardarMiPerfil = document.getElementById('btn-guardar-mi-perfil');
if (btnGuardarMiPerfil) {
    btnGuardarMiPerfil.addEventListener('click', async () => {
        const usuario = window.usuarioActual;
        if (!usuario || !usuario.id) return alert("Error: Sesión no válida.");

        const nomVal = (document.getElementById('mi-perfil-nombre')?.value || '').trim();
        const celVal = (document.getElementById('mi-perfil-celular')?.value || '').trim();
        const aliasVal = (document.getElementById('mi-perfil-alias')?.value || '').trim();

        if (!nomVal) return alert("Por favor ingresa tu nombre.");

        setBotonCargando(btnGuardarMiPerfil, true);
        try {
            const userUpdate = {
                nombre: nomVal,
                celular: celVal,
                alias_transferencia: aliasVal,
                fecha_actualizacion: new Date().toISOString()
            };

            await updateDoc(doc(db, "usuarios_sistema", usuario.id), userUpdate);

            // Actualizar objeto en memoria
            window.usuarioActual.nombre = nomVal;
            window.usuarioActual.celular = celVal;
            window.usuarioActual.alias_transferencia = aliasVal;

            const rolesArr = Array.isArray(usuario.roles) && usuario.roles.length > 0 ? usuario.roles : [usuario.rol || 'admisor'];
            const esDocente = rolesArr.includes('profesor') || rolesArr.includes('evaluador') || Boolean(usuario.profesor_id);

            if (esDocente) {
                const dispProfe = extraerDisponibilidadMultiRango('contenedor-disponibilidad-mi-perfil');
                let profesorId = usuario.profesor_id;

                if (!profesorId && usuario.email) {
                    const pQ = await getDocs(collection(db, "profesores"));
                    pQ.forEach(d => {
                        const dt = d.data();
                        if (dt.correo_calendario && dt.correo_calendario.toLowerCase() === usuario.email.toLowerCase()) {
                            profesorId = d.id;
                        }
                    });
                }

                const dataProfeUpdate = {
                    nombre: nomVal,
                    celular: celVal,
                    alias_transferencia: aliasVal,
                    disponibilidad: dispProfe
                };

                if (profesorId) {
                    await updateDoc(doc(db, "profesores", profesorId), dataProfeUpdate);
                } else {
                    const newP = await addDoc(collection(db, "profesores"), {
                        ...dataProfeUpdate,
                        correo_calendario: usuario.email,
                        skills: []
                    });
                    profesorId = newP.id;
                    await updateDoc(doc(db, "usuarios_sistema", usuario.id), { profesor_id: profesorId });
                    window.usuarioActual.profesor_id = profesorId;
                }
            }

            // Actualizar vista de usuario en Sidebar
            const userInfoBox = document.getElementById('user-info');
            if (userInfoBox) {
                userInfoBox.innerHTML = `
                    <div style="font-weight:700; color:var(--text-main); font-size:12.5px; margin-bottom:2px; word-break:break-word;">${nomVal}</div>
                    <div style="font-size:11px; color:var(--text-muted); word-break:break-all; line-height:1.25;">${usuario.email}</div>
                `;
            }

            document.getElementById('modal-mi-perfil')?.close();
            alert("✅ Perfil actualizado correctamente.");
        } catch(e) {
            alert("❌ Error al guardar perfil: " + e.message);
        } finally {
            setBotonCargando(btnGuardarMiPerfil, false);
        }
    });
}

// =======================================================================
// GENERADOR DE CASOS DE PRUEBA (TEST ENVIRONMENT AISLADO POR USUARIO)
// =======================================================================
export const USUARIOS_TEST_PERMITIDOS = [
    'belutorrentsmdl@gmail.com',
    'nfchelli@gmail.com',
    'ggkerpel@gmail.com',
    'pablobianchino@gmail.com',
    'productora.mandalahouse@gmail.com'
];

export async function generarCasosPruebaEvaluador(emailOverride = null) {
    try {
        const uActual = window.usuarioActual || {};
        const email = (emailOverride || uActual.email || 'pablobianchino@gmail.com').toLowerCase().trim();

        const uSnap = await getDocs(collection(db, "usuarios_sistema"));
        let targetUser = null;
        let targetId = null;
        uSnap.forEach(d => {
            const data = d.data();
            if ((data.email || '').toLowerCase().trim() === email) {
                targetUser = data;
                targetId = d.id;
            }
        });

        if (targetId) {
            const rolesArr = Array.isArray(targetUser?.roles) ? targetUser.roles : [targetUser?.rol || 'evaluador'];
            const modUnion = new Set(targetUser?.modulos_habilitados || []);
            rolesArr.forEach(r => (ROLES_MODULOS_DEFAULT[r] || []).forEach(m => modUnion.add(m)));
            modUnion.add('espera');
            await updateDoc(doc(db, "usuarios_sistema", targetId), {
                modulos_habilitados: Array.from(modUnion)
            });
            if (window.usuarioActual && (window.usuarioActual.id === targetId || window.usuarioActual.email === email)) {
                window.usuarioActual.modulos_habilitados = Array.from(modUnion);
                configurarSidebarPorPermisos();
            }
        }

        const profId = targetUser?.profesor_id || targetId || 'prof-' + email.split('@')[0];
        const profNombre = targetUser?.nombre || uActual.nombre || email.split('@')[0];
        const profCalId = targetUser?.correo_calendario || targetUser?.email || email;
        const ahoraStr = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

        const evalTag = (profNombre.split(' ')[0] || 'TEST').trim().toUpperCase();
        const prefix = `[TEST ${evalTag}]`;

        const ahora = new Date();
        const fVencida = new Date(ahora.getTime() - 52 * 3600 * 1000);
        const fUrgente = new Date(ahora.getTime() - 28 * 3600 * 1000);
        const fHoy = new Date(ahora.getTime() + 2 * 3600 * 1000);
        const fFutura = new Date(ahora.getTime() + 72 * 3600 * 1000);

        const casos = [
            {
                nombre: `${prefix} Lucas Bianchi`,
                celular: '+5491133445566',
                email: `lucas.test.${email.split('@')[0]}@mandalahouse.com`,
                edad: 28,
                instrumento: ['Guitarra'],
                nivel: 'Inicial I',
                tipo_suscripcion: 'Ensamble',
                estado_agenda: 'Agenda confirmada',
                reserva_profe_id: profId,
                reserva_profe_nombre: profNombre,
                reserva_cal_id: profCalId,
                reserva_fecha_texto: 'Hace 2 días (Vencida)',
                reserva_inicio: fVencida.toISOString(),
                reserva_fin: new Date(fVencida.getTime() + 45 * 60000).toISOString(),
                historial: [`[${ahoraStr}] Entrevista realizada hace más de 48 hs para ${profNombre}. Pendiente urgente de cargar Informe Post-Entrevista.`],
                es_caso_prueba: true,
                test_owner: email,
                fecha_creacion: new Date().toISOString()
            },
            {
                nombre: `${prefix} Clara Gómez`,
                celular: '+5491144556677',
                email: `clara.test.${email.split('@')[0]}@mandalahouse.com`,
                edad: 24,
                instrumento: ['Canto'],
                nivel: 'Inicial II',
                tipo_suscripcion: 'Clases Grupales',
                estado_agenda: 'Agenda confirmada',
                reserva_profe_id: profId,
                reserva_profe_nombre: profNombre,
                reserva_cal_id: profCalId,
                reserva_fecha_texto: 'Ayer (24 a 48 hs)',
                reserva_inicio: fUrgente.toISOString(),
                reserva_fin: new Date(fUrgente.getTime() + 45 * 60000).toISOString(),
                historial: [`[${ahoraStr}] Entrevista realizada ayer con ${profNombre}. Pendiente de cargar Informe Post-Entrevista.`],
                es_caso_prueba: true,
                test_owner: email,
                fecha_creacion: new Date().toISOString()
            },
            {
                nombre: `${prefix} Mateo Benítez`,
                celular: '+5491155667788',
                email: `mateo.test.${email.split('@')[0]}@mandalahouse.com`,
                edad: 32,
                instrumento: ['Batería'],
                nivel: 'Inicial I',
                tipo_suscripcion: 'Ensamble',
                estado_agenda: 'Agenda confirmada',
                reserva_profe_id: profId,
                reserva_profe_nombre: profNombre,
                reserva_cal_id: profCalId,
                reserva_fecha_texto: 'Hoy ' + fHoy.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs',
                reserva_inicio: fHoy.toISOString(),
                reserva_fin: new Date(fHoy.getTime() + 45 * 60000).toISOString(),
                historial: [`[${ahoraStr}] Entrevista confirmada para el día de hoy con ${profNombre}.`],
                es_caso_prueba: true,
                test_owner: email,
                fecha_creacion: new Date().toISOString()
            },
            {
                nombre: `${prefix} Sofía Rossi`,
                celular: '+5491166778899',
                email: `sofia.test.${email.split('@')[0]}@mandalahouse.com`,
                edad: 21,
                instrumento: ['Piano'],
                nivel: 'Inicial I',
                tipo_suscripcion: 'Clases Individuales',
                estado_agenda: 'Agenda confirmada',
                reserva_profe_id: profId,
                reserva_profe_nombre: profNombre,
                reserva_cal_id: profCalId,
                reserva_fecha_texto: fFutura.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' hs',
                reserva_inicio: fFutura.toISOString(),
                reserva_fin: new Date(fFutura.getTime() + 45 * 60000).toISOString(),
                historial: [`[${ahoraStr}] Entrevista confirmada con antelación (+48 hs) con ${profNombre}.`],
                es_caso_prueba: true,
                test_owner: email,
                fecha_creacion: new Date().toISOString()
            },
            {
                nombre: `${prefix} Julián Gómez`,
                celular: '+5491177889900',
                email: `julian.test.${email.split('@')[0]}@mandalahouse.com`,
                edad: 26,
                instrumento: ['Bajo'],
                nivel: 'Inicial II',
                tipo_suscripcion: 'Ensamble',
                estado_agenda: 'Lista de espera',
                reserva_profe_id: profId,
                reserva_profe_nombre: profNombre,
                profesor_asignado: profNombre,
                profesor_id: profId,
                historial: [`[${ahoraStr}] Alumno derivado a Lista de Espera evaluado por ${profNombre}.`],
                es_caso_prueba: true,
                test_owner: email,
                fecha_creacion: new Date().toISOString()
            }
        ];

        let creados = 0;
        for (const caso of casos) {
            await addDoc(collection(db, "alumnos"), caso);
            creados++;
        }

        if (typeof mostrarToast === 'function') {
            mostrarToast(`✅ Se crearon ${creados} casos de prueba propios para ${profNombre}`, 'success');
        } else {
            alert(`✅ Se crearon ${creados} casos de prueba propios para ${profNombre}`);
        }
        if (typeof cargarVista === 'function') cargarVista(estadoActualVista);
        return true;
    } catch(err) {
        console.error("Error al generar casos de prueba:", err);
        if (typeof mostrarToast === 'function') mostrarToast("❌ Error al crear casos: " + err.message, "error");
        return false;
    }
}
window.generarCasosPruebaEvaluador = generarCasosPruebaEvaluador;

export async function limpiarCasosPrueba() {
    try {
        const uActual = window.usuarioActual || {};
        const email = (uActual.email || '').toLowerCase().trim();

        const qSnap = await getDocs(collection(db, "alumnos"));
        let borrados = 0;
        for (const d of qSnap.docs) {
            const data = d.data();
            if (data.es_caso_prueba || (data.nombre && data.nombre.startsWith('[TEST'))) {
                // Solo borrar si pertenece al usuario logueado o si es admin y no tiene owner asignado
                const owner = (data.test_owner || '').toLowerCase().trim();
                const calId = (data.reserva_cal_id || '').toLowerCase().trim();
                const esPropio = (owner && owner === email) || (calId && calId === email) || (!owner && (email === 'pablobianchino@gmail.com' || email === 'productora.mandalahouse@gmail.com'));

                if (esPropio) {
                    await deleteDoc(doc(db, "alumnos", d.id));
                    borrados++;
                }
            }
        }
        if (typeof mostrarToast === 'function') {
            mostrarToast(`🗑️ Se eliminaron ${borrados} alumnos de prueba de ${uActual.nombre || email}`, 'info');
        } else {
            alert(`🗑️ Se eliminaron ${borrados} alumnos de prueba de ${uActual.nombre || email}`);
        }
        if (typeof cargarVista === 'function') cargarVista(estadoActualVista);
        return true;
    } catch(err) {
        console.error("Error al limpiar casos de prueba:", err);
        if (typeof mostrarToast === 'function') mostrarToast("❌ Error al limpiar casos: " + err.message, "error");
        return false;
    }
}
window.limpiarCasosPrueba = limpiarCasosPrueba;
window.copiarFilaExcelFacturacionAdmision = copiarFilaExcelFacturacionAdmision;
window.generarFilaExcelFacturacionAdmision = generarFilaExcelFacturacionAdmision;


