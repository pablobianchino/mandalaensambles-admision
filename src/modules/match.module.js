// =======================================================================
// src/modules/match.module.js -- Motor algoritmico y vistas de Match / Grupos
// =======================================================================

import { defaultCfg } from "../config/constants.js";
import { 
    db, 
    collection, 
    getDocs, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    addDoc, 
    query, 
    where 
} from "../config/firebase.js";
import { detectarTipoSuscripcion, validarConflictoCalendarEnVivo } from "../services/calendar.service.js";
import { 
    parsearNomenclaturaGrupoOClase, 
    formatearNomenclaturaGrupoOClase,
    getEmojiParaInstrumento,
    abrirModalSolicitudVacante,
    eliminarSolicitudVacanteDirecto
} from "./profesor.module.js";

export let matchCantidadActual = 4;
export let matchGruposSugeridos = [];
export let matchProfesores = [];
export let matchModoBusqueda = 'grupos'; // 'grupos' | 'alumnos'
export let matchAlumnosSeleccionados = new Set();
export let solicitudesParaMatch = [];
window.solicitudesParaMatch = solicitudesParaMatch;

export function normalizarHoraLocal(str, fallback = '09:00') {
    if (!str || typeof str !== 'string') return fallback;
    const s = str.trim().replace('.', ':');
    const match = s.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
        const hh = match[1].padStart(2, '0');
        const mm = match[2];
        return `${hh}:${mm}`;
    }
    const numMatch = s.match(/^(\d{1,2})$/);
    if (numMatch) {
        const hh = numMatch[1].padStart(2, '0');
        return `${hh}:00`;
    }
    return fallback;
}

export function formatearHoraParaNombreGrupo(horaStr) {
    if (!horaStr) return '';
    const partes = horaStr.split(':');
    const h = parseInt(partes[0], 10);
    const m = partes[1] ? parseInt(partes[1], 10) : 0;
    return (m === 0) ? `${h}` : `${h}.${partes[1]}`;
}

export function setMatchCantidadActual(val) {
    matchCantidadActual = val;
}

export function setMatchGruposSugeridos(val) {
    matchGruposSugeridos = val;
}

export function setMatchProfesores(val) {
    matchProfesores = val;
}

export function setMatchModoBusqueda(val) {
    matchModoBusqueda = val;
}

export async function cargarProfesoresMatch() {
    const selProfe = document.getElementById('match-profe');
    if (selProfe) selProfe.innerHTML = '<option value="">Cualquier profesor disponible</option>';
    matchProfesores = [];
    try {
        const profSnap = await getDocs(collection(db, "profesores"));
        profSnap.forEach(d => {
            const data = d.data();
            if (data.activo !== false && data.estado !== 'inactivo') {
                matchProfesores.push({ id: d.id, ...data });
            }
        });
    } catch(e) {}
    filtrarProfesoresMatch();
}

export function adaptarFormularioPorSuscripcion(nombreSusc) {
    const tipo = detectarTipoSuscripcion(nombreSusc);
    const opcGrupales = document.getElementById('match-opciones-grupales');
    const cantoWrapper = document.getElementById('match-canto-wrapper');
    const excluirWrapper = document.getElementById('match-excluir-wrapper');
    const cantWrapper = document.getElementById('match-cantidad-wrapper');
    const nivelWrapper = document.getElementById('match-nivel-wrapper');

    const instWrapper = document.getElementById('match-instrumento-wrapper');
    if (tipo === 'individual') {
        if (opcGrupales) opcGrupales.style.display = 'none';
        if (cantoWrapper) cantoWrapper.style.display = 'none';
        if (cantWrapper) cantWrapper.style.display = 'none';
        if (nivelWrapper) nivelWrapper.style.display = 'none';
        if (instWrapper) instWrapper.style.display = 'block';
    } else if (tipo === 'grupal') {
        if (opcGrupales) opcGrupales.style.display = 'flex';
        if (cantoWrapper) cantoWrapper.style.display = 'block';
        const esCanto = document.getElementById('match-chk-canto')?.checked || false;
        if (excluirWrapper) excluirWrapper.style.display = esCanto ? 'none' : 'block';
        if (instWrapper) instWrapper.style.display = esCanto ? 'none' : 'block';
        if (cantWrapper) cantWrapper.style.display = 'block';
        if (nivelWrapper) nivelWrapper.style.display = 'block';
    } else if (tipo === 'ensamble') {
        if (opcGrupales) opcGrupales.style.display = 'flex';
        if (cantoWrapper) cantoWrapper.style.display = 'none';
        if (excluirWrapper) excluirWrapper.style.display = 'block';
        if (instWrapper) instWrapper.style.display = 'block';
        if (cantWrapper) cantWrapper.style.display = 'block';
        if (nivelWrapper) nivelWrapper.style.display = 'block';
    }
    filtrarProfesoresMatch();
}

export function filtrarProfesoresMatch() {
    const susc = document.getElementById('match-suscripcion')?.value || '';
    const tipo = detectarTipoSuscripcion(susc);
    const esCanto = tipo === 'grupal' && (document.getElementById('match-chk-canto')?.checked || false);
    const instFiltro = (document.getElementById('match-instrumento-filtro')?.value || '').trim().toLowerCase();
    
    // Días y Horarios seleccionados en el formulario
    const diasMap = { 'lunes': 'L', 'martes': 'M', 'miercoles': 'X', 'jueves': 'J', 'viernes': 'V', 'sabado': 'S' };
    const diasSeleccionados = Array.from(document.querySelectorAll('.match-day-pill.active')).map(p => diasMap[p.dataset.dia] || p.dataset.dia);
    const horaDesde = document.getElementById('match-hora-desde')?.value || null;
    const horaHasta = document.getElementById('match-hora-hasta')?.value || null;

    const selProfe = document.getElementById('match-profe');
    if (!selProfe) return;
    const valActual = selProfe.value;

    selProfe.innerHTML = '<option value="">Cualquier profesor disponible</option>';

    const profesFiltrados = matchProfesores.filter(pr => {
        const skills = (pr.skills || []).map(s => s.toLowerCase().trim());

        // 1. Aptitud por Suscripción
        if (tipo === 'ensamble' && pr.ensambles !== true) return false;
        if (tipo === 'grupal' && !pr.grupales && !pr.ensambles) return false;

        // 2. Skills por Instrumento Objetivo / Canto
        if (esCanto) {
            const tieneCanto = skills.some(s => s.includes('canto') || s.includes('voz'));
            if (!tieneCanto) return false;
        } else if (instFiltro) {
            const tieneInst = skills.some(s => s.includes(instFiltro));
            if (!tieneInst) return false;
        }

        // 3. Disponibilidad en Días y Horarios seleccionados
        if (diasSeleccionados.length > 0 || (horaDesde && horaHasta)) {
            const dispPr = pr.disponibilidad || {};
            const diasAEval = diasSeleccionados.length > 0 ? diasSeleccionados : ['L', 'M', 'X', 'J', 'V', 'S'];
            let tieneHueco = false;

            for (let dia of diasAEval) {
                const rangos = dispPr[dia] || [];
                for (let r of rangos) {
                    if (!r) continue;
                    let rIni = normalizarHoraLocal(typeof r === 'object' ? r.inicio : (typeof r === 'string' ? r.split(/[-a]/)[0] : '09:00'), '09:00');
                    let rFin = normalizarHoraLocal(typeof r === 'object' ? r.fin : (typeof r === 'string' ? (r.split(/[-a]/)[1] || r.split(/[-a]/)[0]) : '22:00'), '22:00');

                    let pStart = convertirHoraAMinutos(rIni);
                    let pEnd = convertirHoraAMinutos(rFin);

                    let fStart = horaDesde ? convertirHoraAMinutos(horaDesde) : pStart;
                    let fEnd = horaHasta ? convertirHoraAMinutos(horaHasta) : pEnd;

                    const overlapStart = Math.max(pStart, fStart);
                    const overlapEnd = Math.min(pEnd, fEnd);

                    if (overlapEnd - overlapStart >= 60) {
                        tieneHueco = true;
                        break;
                    }
                }
                if (tieneHueco) break;
            }

            if (!tieneHueco) return false;
        }

        return true;
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

    if (valActual && profesFiltrados.some(p => p.id === valActual)) {
        selProfe.value = valActual;
    }
    mostrarSkillsProfe();
}

export function mostrarSkillsProfe() {
    const selProfe = document.getElementById('match-profe');
    const cont = document.getElementById('match-profe-skills');
    if (!cont || !selProfe) return;
    const opt = selProfe.options[selProfe.selectedIndex];
    if (!opt || !opt.value) { cont.innerHTML = ''; return; }
    try {
        const skills = JSON.parse(opt.dataset.skills || '[]');
        cont.innerHTML = skills.length > 0
            ? skills.map(s => `<span class="match-skill-tag">${s}</span>`).join('')
            : '<span style="font-size:12px; color:var(--text-light);">Sin skills registrados</span>';
    } catch { cont.innerHTML = ''; }
}

export async function cargarSolicitudesEnSelectorMatch(solicitudIdPreseleccionada = '') {
    const sel = document.getElementById('match-sel-solicitud-cargada');
    if (!sel) return;
    try {
        const snap = await getDocs(query(collection(db, "solicitudes_vacantes"), where("estado", "==", "Pendiente")));
        const sols = [];
        snap.forEach(d => sols.push({ id: d.id, ...d.data() }));

        let html = '<option value="">-- Selecciona una solicitud para autocompletar o buscar --</option>';
        if (sols.length > 1) {
            html += '<option value="todas">⚡ [TODAS LAS SOLICITUDES ACTIVAS] (Buscar Bloques por Solicitud)</option>';
        }

        sols.forEach(s => {
            const selAttr = (s.id === solicitudIdPreseleccionada) ? 'selected' : '';
            const tipoStr = s.tipoGrupo || (s.modalidad === 'individual' ? 'Individual' : 'Grupo');
            const durStr = s.duracionMinutos ? `${s.duracionMinutos}m` : '60m';
            html += `<option value="${s.id}" ${selAttr}>📢 ${s.profesorNombre} • ${s.grupoNombre} (${s.instrumento} - ${s.nivel || 'Cualquiera'}) [${tipoStr} ${durStr}]</option>`;
        });

        sel.innerHTML = html;
        window.cachedSolicitudesMatchList = sols;
        if (solicitudIdPreseleccionada) {
            sel.value = solicitudIdPreseleccionada;
            aplicarSolicitudEnFiltrosMatch(solicitudIdPreseleccionada);
        }
    } catch(err) {
        console.error("Error al cargar solicitudes en match selector:", err);
    }
}

export function aplicarSolicitudEnFiltrosMatch(solId) {
    if (!solId || !window.cachedSolicitudesMatchList) return;
    if (solId === 'todas') {
        window.solicitudesParaMatch = 'todas';
        return;
    }
    const sol = window.cachedSolicitudesMatchList.find(s => s.id === solId);
    if (!sol) return;

    window.solicitudesParaMatch = [sol.id];
    window.solicitudActivaParaMatch = sol;

    // Suscripción
    const selSusc = document.getElementById('match-suscripcion');
    if (selSusc) {
        const opts = Array.from(selSusc.options).map(o => o.value);
        let matchSusc = opts.find(o => o.toLowerCase().includes((sol.tipoGrupo || '').toLowerCase())) 
            || (sol.modalidad === 'individual' ? opts.find(o => o.toLowerCase().includes('indiv')) : opts.find(o => o.toLowerCase().includes('ensamble') || o.toLowerCase().includes('grup')));
        if (matchSusc) selSusc.value = matchSusc;
        adaptarFormularioPorSuscripcion(selSusc.value);
    }

    // Instrumento objetivo
    const selInst = document.getElementById('match-instrumento-filtro');
    if (selInst && sol.instrumento) {
        const instsFirst = sol.instrumento.split(',')[0].trim();
        const opt = Array.from(selInst.options).find(o => o.value.toLowerCase() === instsFirst.toLowerCase());
        if (opt) selInst.value = opt.value;
    }

    // Profesor
    const selProfe = document.getElementById('match-profe');
    if (selProfe && (sol.profesorId || sol.profesorNombre)) {
        const opt = Array.from(selProfe.options).find(o => o.value === sol.profesorId || o.textContent.toLowerCase().includes((sol.profesorNombre || '').toLowerCase()));
        if (opt) selProfe.value = opt.value;
        mostrarSkillsProfe();
    }

    // Día
    const parsed = parsearNomenclaturaGrupoOClase(sol.grupoNombre, sol.duracionMinutos || 60);
    const diaCod = (parsed ? parsed.diaCod : sol.diaCod) || '';
    if (diaCod) {
        const mapaCodPill = { 'L': 'lunes', 'M': 'martes', 'X': 'miercoles', 'J': 'jueves', 'V': 'viernes', 'S': 'sabado' };
        const diaNombrePill = mapaCodPill[diaCod.toUpperCase()];
        document.querySelectorAll('.match-day-pill').forEach(p => {
            if (p.dataset.dia === diaNombrePill) p.classList.add('active');
            else p.classList.remove('active');
        });
    }

    // Horas
    const hIni = parsed ? parsed.horaInicio : sol.horaInicio;
    const hFin = parsed ? parsed.horaFin : sol.horaFin;
    if (hIni && document.getElementById('match-hora-desde')) document.getElementById('match-hora-desde').value = hIni;
    if (hFin && document.getElementById('match-hora-hasta')) document.getElementById('match-hora-hasta').value = hFin;

    // Niveles
    const nivs = (sol.nivelesArray && sol.nivelesArray.length > 0) ? sol.nivelesArray : (sol.nivel ? sol.nivel.split(',') : []);
    const nivsClean = nivs.map(n => n.trim().toLowerCase());
    document.querySelectorAll('input[name="match-nivel"]').forEach(chk => {
        const val = chk.value.trim().toLowerCase();
        chk.checked = nivsClean.includes('cualquiera') || nivsClean.includes(val);
    });
}

export function actualizarModoBusquedaUI(solicitudIdOpcional = null) {
    const btnModoGrupos = document.getElementById('match-tab-modo-grupos');
    const btnModoAlumnos = document.getElementById('match-tab-modo-alumnos');
    const btnBuscar = document.getElementById('match-btn-buscar');
    const secSol = document.getElementById('match-solicitudes-profes-container');
    if (matchModoBusqueda === 'grupos') {
        if (btnModoGrupos) {
            btnModoGrupos.className = 'btn-app btn-primary';
            btnModoGrupos.style.cssText = 'height:32px; font-size:12px; font-weight:700; padding:0 14px; border-radius:7px; cursor:pointer; background:var(--accent-teal); color:#ffffff; border:1px solid var(--accent-teal);';
        }
        if (btnModoAlumnos) {
            btnModoAlumnos.className = 'btn-app btn-secondary';
            btnModoAlumnos.style.cssText = 'height:32px; font-size:12px; font-weight:700; padding:0 14px; border-radius:7px; cursor:pointer; background:transparent; color:var(--text-main); border:1px solid transparent;';
        }
        if (btnBuscar) btnBuscar.innerHTML = '🔍 Buscar Matches';
        if (secSol) secSol.style.display = 'none';
    } else {
        if (btnModoAlumnos) {
            btnModoAlumnos.className = 'btn-app btn-primary';
            btnModoAlumnos.style.cssText = 'height:32px; font-size:12px; font-weight:700; padding:0 14px; border-radius:7px; cursor:pointer; background:var(--accent-teal); color:#ffffff; border:1px solid var(--accent-teal);';
        }
        if (btnModoGrupos) {
            btnModoGrupos.className = 'btn-app btn-secondary';
            btnModoGrupos.style.cssText = 'height:32px; font-size:12px; font-weight:700; padding:0 14px; border-radius:7px; cursor:pointer; background:transparent; color:var(--text-main); border:1px solid transparent;';
        }
        if (btnBuscar) btnBuscar.innerHTML = '🔍 Buscar Alumnos';
        if (secSol) secSol.style.display = 'block';
        cargarSolicitudesEnSelectorMatch(solicitudIdOpcional);
    }
}

export async function activarBusquedaMatchPorSolicitudDirecta(solicitudId, callbacks = {}) {
    const fnCargarVista = callbacks.cargarVista || window.cargarVistaGlobal;
    const fnSetBotonCargando = callbacks.setBotonCargando || window.setBotonCargando;

    // 1. Navegar a la vista de Match (Armar Grupos y Clases)
    if (typeof fnCargarVista === 'function') {
        await fnCargarVista('Match - Pendientes');
    } else {
        const cont = document.getElementById('match-pendientes-container');
        if (cont) cont.style.display = 'flex';
    }

    // 2. Activar modo Alumnos (Perfiles)
    matchModoBusqueda = 'alumnos';
    actualizarModoBusquedaUI();

    // 3. Cargar solicitudes en el selector y autocompletar filtros
    const selTargetId = (solicitudId === 'todas' || Array.isArray(solicitudId))
        ? (Array.isArray(solicitudId) && solicitudId.length === 1 ? solicitudId[0] : 'todas')
        : solicitudId;

    window.solicitudesParaMatch = (solicitudId === 'todas' || Array.isArray(solicitudId)) ? solicitudId : [solicitudId];
    await cargarSolicitudesEnSelectorMatch(selTargetId);

    // 4. Ejecutar la búsqueda DIRECTAMENTE
    const ids = Array.isArray(solicitudId) ? solicitudId : (solicitudId ? [solicitudId] : []);
    if (solicitudId === 'todas') {
        await ejecutarBusquedaAlumnosOpcionA('todas', fnSetBotonCargando);
    } else if (ids.length > 0) {
        await ejecutarBusquedaAlumnosOpcionA(ids, fnSetBotonCargando);
    } else {
        await ejecutarBusquedaAlumnosMatch(fnSetBotonCargando);
    }

    // 5. Scroll suave hacia los resultados
    setTimeout(() => {
        const resSec = document.getElementById('match-resultados');
        if (resSec) {
            resSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 150);
}
window.activarBusquedaMatchPorSolicitudDirecta = activarBusquedaMatchPorSolicitudDirecta;

export function initMatchFormListeners(cfgMin = 2, cfgMax = 6, callbacks = {}) {
    const { setBotonCargando, syncSelectToChips, cargarVista } = callbacks;

    // Panel colapsable
    document.getElementById('match-criterios-toggle')?.addEventListener('click', () => {
        document.getElementById('match-criterios-panel')?.classList.toggle('collapsed');
    });

    // Segmented control: Buscar Grupos vs Buscar Alumnos
    const btnModoGrupos = document.getElementById('match-tab-modo-grupos');
    const btnModoAlumnos = document.getElementById('match-tab-modo-alumnos');

    if (btnModoGrupos) {
        btnModoGrupos.addEventListener('click', () => {
            matchModoBusqueda = 'grupos';
            actualizarModoBusquedaUI();
        });
    }

    if (btnModoAlumnos) {
        btnModoAlumnos.addEventListener('click', () => {
            matchModoBusqueda = 'alumnos';
            actualizarModoBusquedaUI();
        });
    }

    // Selector de Solicitudes de Profesores en Modo Alumnos
    const selSolMatch = document.getElementById('match-sel-solicitud-cargada');
    const btnCargarSolMatch = document.getElementById('btn-match-cargar-solicitud');

    selSolMatch?.addEventListener('change', (e) => {
        aplicarSolicitudEnFiltrosMatch(e.target.value);
    });

    btnCargarSolMatch?.addEventListener('click', () => {
        if (selSolMatch?.value) {
            aplicarSolicitudEnFiltrosMatch(selSolMatch.value);
        } else {
            alert("Por favor selecciona una solicitud de la lista.");
        }
    });

    // Si había una solicitud pre-seleccionada desde otra vista
    if (window.solicitudesParaMatch && window.solicitudesParaMatch.length > 0) {
        matchModoBusqueda = 'alumnos';
        actualizarModoBusquedaUI();
        if (window.solicitudesParaMatch !== 'todas' && window.solicitudesParaMatch.length === 1) {
            cargarSolicitudesEnSelectorMatch(window.solicitudesParaMatch[0]);
        } else if (window.solicitudesParaMatch === 'todas') {
            cargarSolicitudesEnSelectorMatch('todas');
        }
    }

    // Cambio de Suscripcion
    document.getElementById('match-suscripcion')?.addEventListener('change', (e) => {
        adaptarFormularioPorSuscripcion(e.target.value);
    });

    // Checkbox Canto
    document.getElementById('match-chk-canto')?.addEventListener('change', () => {
        const esCanto = document.getElementById('match-chk-canto').checked;
        const excWrapper = document.getElementById('match-excluir-wrapper');
        if (excWrapper) excWrapper.style.display = esCanto ? 'none' : 'block';
        const instWrapper = document.getElementById('match-instrumento-wrapper');
        if (instWrapper) instWrapper.style.display = esCanto ? 'none' : 'block';
        filtrarProfesoresMatch();
    });

    // Filtros dinámicos de profesores por instrumento y horarios
    document.getElementById('match-instrumento-filtro')?.addEventListener('change', filtrarProfesoresMatch);
    document.getElementById('match-hora-desde')?.addEventListener('input', filtrarProfesoresMatch);
    document.getElementById('match-hora-hasta')?.addEventListener('input', filtrarProfesoresMatch);

    // Cambio de profesor
    document.getElementById('match-profe')?.addEventListener('change', mostrarSkillsProfe);

    // Pills de dias
    document.querySelectorAll('.match-day-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            pill.classList.toggle('active');
            filtrarProfesoresMatch();
        });
    });

    // Stepper cantidad
    document.getElementById('match-cant-menos')?.addEventListener('click', () => {
        if (matchCantidadActual > cfgMin) {
            matchCantidadActual--;
            const el = document.getElementById('match-cantidad-valor');
            if (el) el.textContent = matchCantidadActual;
        }
    });
    document.getElementById('match-cant-mas')?.addEventListener('click', () => {
        if (matchCantidadActual < cfgMax) {
            matchCantidadActual++;
            const el = document.getElementById('match-cantidad-valor');
            if (el) el.textContent = matchCantidadActual;
        }
    });

    // Cargar alumnos de prueba
    document.getElementById('btn-mock-match-data')?.addEventListener('click', () => generarAlumnosPruebaMatch(setBotonCargando));
    document.getElementById('btn-mock-match-indiv')?.addEventListener('click', () => generarAlumnosIndividualesPruebaMatch(setBotonCargando));
    document.getElementById('btn-limpiar-mock-data')?.addEventListener('click', () => limpiarAlumnosPruebaMatch(setBotonCargando, cargarVista));

    // Limpiar formulario
    document.getElementById('match-btn-limpiar')?.addEventListener('click', () => resetMatchForm(syncSelectToChips));

    // Botón armar grupo con alumnos seleccionados (desde modo Buscar Alumnos)
    document.getElementById('btn-match-armar-grupo-seleccionados')?.addEventListener('click', () => {
        const ids = Array.from(matchAlumnosSeleccionados);
        if (ids.length < 2) {
            return alert("Por favor selecciona al menos 2 alumnos para armar un grupo.");
        }
        if (window.abrirModalPrealtaGrupal) {
            window.abrirModalPrealtaGrupal(ids, '', callbacks.configApp || defaultCfg);
        }
    });

    // Buscar matches o alumnos según el selector activo
    document.getElementById('match-btn-buscar')?.addEventListener('click', () => {
        if (matchModoBusqueda === 'alumnos') {
            ejecutarBusquedaAlumnosMatch(setBotonCargando);
        } else {
            ejecutarBusquedaMatch(setBotonCargando);
        }
    });

    // Confirmar desde modal de confirmacion
    document.getElementById('btn-ejecutar-confirmar-match')?.addEventListener('click', () => ejecutarConfirmarMatch(setBotonCargando, cargarVista));

    // Confirmar desde modal de detalle
    document.getElementById('btn-detalle-confirmar')?.addEventListener('click', () => {
        const idx = parseInt(document.getElementById('detalle-grupo-index')?.value);
        if (!isNaN(idx) && matchGruposSugeridos[idx]) {
            document.getElementById('modal-detalle-grupo')?.close();
            abrirModalConfirmarMatch(matchGruposSugeridos[idx]);
        }
    });
}

export function resetMatchForm(syncSelectToChipsFn) {
    const selSusc = document.getElementById('match-suscripcion');
    if (selSusc) selSusc.selectedIndex = 0;
    adaptarFormularioPorSuscripcion('');

    const chkCanto = document.getElementById('match-chk-canto');
    if (chkCanto) chkCanto.checked = false;

    const selProfe = document.getElementById('match-profe');
    if (selProfe) selProfe.selectedIndex = 0;
    const skillsCont = document.getElementById('match-profe-skills');
    if (skillsCont) skillsCont.innerHTML = '';
    filtrarProfesoresMatch();

    const edadD = document.getElementById('match-edad-desde');
    if (edadD) edadD.value = '';
    const edadH = document.getElementById('match-edad-hasta');
    if (edadH) edadH.value = '';

    matchCantidadActual = 4;
    const cantVal = document.getElementById('match-cantidad-valor');
    if (cantVal) cantVal.textContent = 4;

    document.querySelectorAll('[name="match-nivel"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('.match-day-pill').forEach(p => p.classList.remove('active'));

    const hDesde = document.getElementById('match-hora-desde');
    if (hDesde) hDesde.value = '';
    const hHasta = document.getElementById('match-hora-hasta');
    if (hHasta) hHasta.value = '';

    const excSel = document.getElementById('match-excluir-instrumentos');
    if (excSel) {
        Array.from(excSel.options).forEach(o => o.selected = false);
        if (typeof syncSelectToChipsFn === 'function') {
            syncSelectToChipsFn('match-excluir-instrumentos', 'match-chips-excluir');
        }
    }

    ocultarResultadosMatch();
}

export function ocultarResultadosMatch() {
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

const mapaDiasCodigos = { 'L': 'Lunes', 'M': 'Martes', 'X': 'Miercoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sabado' };

export function sonNivelesCompatibles(niveles) {
    const limpios = niveles.filter(n => n && typeof n === 'string' && n.trim() !== '');
    if (limpios.length <= 1) return true;
    const esInicial = limpios.every(n => n === 'Inicial I' || n === 'Inicial II');
    const esAvanzado = limpios.every(n => n === 'Intermedio' || n === 'Avanzado');
    return esInicial || esAvanzado;
}

export function sonEdadesCompatibles(edades, cfg = defaultCfg) {
    const validas = edades.filter(e => typeof e === 'number' && !isNaN(e) && e > 0);
    if (validas.length <= 1) return true;

    const tieneNinos = validas.some(e => e < 13);
    const tieneAdultos = validas.some(e => e >= 13);

    if (tieneNinos && tieneAdultos) return false;

    if (tieneNinos && !tieneAdultos) {
        const ninosLibre = cfg.reglas_edad_ninos?.libre !== false;
        if (ninosLibre) return true;
        const minE = Math.min(...validas), maxE = Math.max(...validas);
        return (maxE - minE) <= 3;
    }

    const minEdad = Math.min(...validas);
    const maxEdad = Math.max(...validas);
    const diffEdad = maxEdad - minEdad;

    const reglas = Array.isArray(cfg.reglas_edad_match) && cfg.reglas_edad_match.length > 0
        ? cfg.reglas_edad_match
        : defaultCfg.reglas_edad_match;

    let reglaAplicable = reglas[0];
    for (let r of reglas) {
        if (minEdad >= r.desde) {
            reglaAplicable = r;
        }
    }

    const tolerancia = Math.abs(reglaAplicable.rango_max - reglaAplicable.rango_min);
    return diffEdad <= tolerancia;
}

export function buscarHuecosComunes(alumnos, profe, diasFiltro, horaDesde, horaHasta) {
    const slots = [];
    const diasEvaluar = diasFiltro && diasFiltro.length > 0
        ? diasFiltro
        : ['L', 'M', 'X', 'J', 'V', 'S'];

    diasEvaluar.forEach(diaId => {
        const dispProfe = (profe.disponibilidad && profe.disponibilidad[diaId]) || [];
        if (dispProfe.length === 0) return;

        const dispAlumnos = alumnos.map(al => (al.disponibilidad && al.disponibilidad[diaId]) || []);
        if (dispAlumnos.some(d => d.length === 0)) return;

        dispProfe.forEach(rProfe => {
            let pIniMins = convertirHoraAMinutos(rProfe.inicio || '09:00');
            let pFinMins = convertirHoraAMinutos(rProfe.fin || '22:00');

            if (horaDesde) {
                const fIniMins = convertirHoraAMinutos(horaDesde);
                if (fIniMins > pIniMins) pIniMins = fIniMins;
            }
            if (horaHasta) {
                const fFinMins = convertirHoraAMinutos(horaHasta);
                if (fFinMins < pFinMins) pFinMins = fFinMins;
            }

            if (pFinMins - pIniMins < 60) return;

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

export function calcularScoreCompatibilidad(alumnos, profe, slot, esCanto, esGrupal) {
    let score = 0;
    const desglose = [];

    if (slot.duracionTotalMin >= 120) {
        score += 30;
        desglose.push('🕐 Gran flexibilidad horaria (+30%)');
    } else if (slot.duracionTotalMin >= 60) {
        score += 25;
        desglose.push('🕒 Coincidencia horaria (+25%)');
    }

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

export function generarCombinaciones(arr, k) {
    if (k === 1) return arr.map(e => [e]);
    const res = [];
    for (let i = 0; i < arr.length - k + 1; i++) {
        const head = arr[i];
        const tailCombos = generarCombinaciones(arr.slice(i + 1), k - 1);
        tailCombos.forEach(t => res.push([head, ...t]));
    }
    return res;
}

// -----------------------------------------------------------------------
// Búsqueda de Alumnos Organizados por Solicitud (Opción A)
// -----------------------------------------------------------------------
export async function ejecutarBusquedaAlumnosOpcionA(solicitudesIds = [], setBotonCargandoFn) {
    const btnBuscar = document.getElementById('match-btn-buscar');
    const resSec = document.getElementById('match-resultados');
    const grid = document.getElementById('match-resultados-grid');
    const noRes = document.getElementById('match-sin-resultados');
    const badge = document.getElementById('match-resultados-badge');
    const tituloRes = document.getElementById('match-resultados-titulo');
    const bulkBar = document.getElementById('match-alumnos-bulk-bar');

    if (resSec) resSec.style.display = 'flex';
    if (grid) {
        grid.innerHTML = '';
        grid.style.display = 'flex';
        grid.style.flexDirection = 'column';
        grid.style.width = '100%';
        grid.style.gridTemplateColumns = 'none';
    }
    if (badge) badge.style.display = 'none';
    if (bulkBar) bulkBar.style.display = 'none';
    if (tituloRes) tituloRes.textContent = 'Matches Organizados por Solicitud (Opción A)';
    if (noRes) {
        noRes.style.display = 'block';
        noRes.textContent = '🔄 Consultando solicitudes activas, alumnos en lista de espera y validando con Google Calendar...';
    }

    try {
        // 1. Obtener solicitudes a evaluar
        const solSnap = await getDocs(query(collection(db, "solicitudes_vacantes"), where("estado", "==", "Pendiente")));
        let todasSols = [];
        solSnap.forEach(d => todasSols.push({ id: d.id, ...d.data() }));

        let solsAEvaluar = [];
        if (solicitudesIds === 'todas' || (Array.isArray(solicitudesIds) && solicitudesIds.includes('todas'))) {
            solsAEvaluar = todasSols;
        } else if (Array.isArray(solicitudesIds) && solicitudesIds.length > 0) {
            solsAEvaluar = todasSols.filter(s => solicitudesIds.includes(s.id));
        } else {
            const selSolVal = document.getElementById('match-sel-solicitud-cargada')?.value;
            if (selSolVal === 'todas') {
                solsAEvaluar = todasSols;
            } else if (selSolVal) {
                solsAEvaluar = todasSols.filter(s => s.id === selSolVal);
            } else {
                solsAEvaluar = todasSols;
            }
        }

        if (solsAEvaluar.length === 0) {
            if (noRes) noRes.textContent = 'No se encontraron solicitudes de profesores pendientes para evaluar.';
            return;
        }

        // 2. Obtener alumnos en Lista de Espera
        const alSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Lista de espera")));
        const alumnosEspera = [];
        alSnap.forEach(d => alumnosEspera.push({ id: d.id, ...d.data() }));

        if (alumnosEspera.length === 0) {
            if (noRes) noRes.textContent = 'No hay alumnos en Lista de Espera actualmente.';
            return;
        }

        // 3. Procesar cada solicitud en su bloque independiente (Opción A)
        const bloquesHtml = [];
        let totalCandidatosEncontrados = 0;
        const mapaCandidatosPorSol = {};

        for (const sol of solsAEvaluar) {
            const durMin = sol.duracionMinutos || (sol.tipoGrupo === 'Ensamble Mandalorian' ? 90 : 60);
            const parsed = parsearNomenclaturaGrupoOClase(sol.grupoNombre, durMin);
            const diaCod = (parsed ? parsed.diaCod : sol.diaCod) || '';
            const horaIni = (parsed ? parsed.horaInicio : sol.horaInicio) || '18:00';
            const horaFin = (parsed ? parsed.horaFin : sol.horaFin) || '19:00';

            // Determinar tipo de suscripción requerido por la solicitud (Ensamble vs Grupal vs Individual)
            let tipoSuscSol = 'individual';
            if (sol.tipoGrupo) {
                tipoSuscSol = detectarTipoSuscripcion(sol.tipoGrupo);
            } else if (sol.modalidad === 'individual') {
                tipoSuscSol = 'individual';
            } else {
                const gNom = (sol.grupoNombre || '').toLowerCase();
                if (gNom.includes('ensamble') || gNom.includes('mandalorian')) {
                    tipoSuscSol = 'ensamble';
                } else if (gNom.includes('grupal') || gNom.includes('grupo') || sol.modalidad === 'grupal') {
                    tipoSuscSol = 'grupal';
                } else {
                    tipoSuscSol = detectarTipoSuscripcion(sol.suscripcion || '');
                }
            }

            // Evaluar candidatos
            const candidatosSol = [];

            for (const al of alumnosEspera) {
                let score = 0;
                let motivos = [];
                let alertas = [];

                // 0. Validar Tipo de Suscripción (CRÍTICO: Ensamble vs Grupal vs Individual)
                const tipoSuscAl = detectarTipoSuscripcion(al.tipo_suscripcion || '');
                if (tipoSuscAl !== tipoSuscSol) {
                    continue; // Descartar: no coincide el tipo de suscripción (ej: alumno de clase grupal buscando vacante en ensamble)
                }

                // A. Instrumento
                const instsPed = Array.isArray(sol.instrumentos) && sol.instrumentos.length > 0
                    ? sol.instrumentos.map(i => (i || '').trim().toLowerCase())
                    : (sol.instrumento ? sol.instrumento.split(',').map(s => s.trim().toLowerCase()) : []);
                const instsAl = Array.isArray(al.instrumento) ? al.instrumento.map(i => (i || '').trim().toLowerCase()) : [(al.instrumento || '').trim().toLowerCase()];

                const coincideInst = instsPed.length === 0 || instsAl.some(i => instsPed.includes(i));
                if (!coincideInst) continue; // Descartar si no coincide el instrumento
                score += 40;
                motivos.push(`Instrumento: ${instsAl.filter(i => instsPed.includes(i)).join(', ') || sol.instrumento}`);

                // B. Nivel pedagógico
                const nivelAl = (al.nivel || '').trim().toLowerCase();
                const nivelesPed = Array.isArray(sol.niveles) && sol.niveles.length > 0
                    ? sol.niveles.map(n => (n || '').trim().toLowerCase())
                    : (sol.nivel ? sol.nivel.split(',').map(s => s.trim().toLowerCase()) : []);
                const esNivelLibre = nivelesPed.length === 0 || nivelesPed.includes('cualquiera');
                const coincideNivel = esNivelLibre || nivelesPed.includes(nivelAl);
                if (coincideNivel) {
                    score += 30;
                    motivos.push(`Nivel: ${al.nivel || 'Inicial I'}`);
                } else {
                    score += 10;
                    alertas.push(`Nivel alumno: ${al.nivel || 's/d'} (Buscado: ${sol.nivel})`);
                }

                // C. Disponibilidad horaria del alumno
                let coincideDisp = false;
                if (diaCod && al.disponibilidad && al.disponibilidad[diaCod]) {
                    const rangosDia = al.disponibilidad[diaCod];
                    const solIniMins = convertirHoraAMinutos(horaIni);
                    const solFinMins = convertirHoraAMinutos(horaFin);

                    for (let r of rangosDia) {
                        let rIni = normalizarHoraLocal(typeof r === 'object' ? r.inicio : (typeof r === 'string' ? r.split(/[-a]/)[0] : '09:00'), '09:00');
                        let rFin = normalizarHoraLocal(typeof r === 'object' ? r.fin : (typeof r === 'string' ? (r.split(/[-a]/)[1] || r.split(/[-a]/)[0]) : '22:00'), '22:00');
                        let aStart = convertirHoraAMinutos(rIni);
                        let aEnd = convertirHoraAMinutos(rFin);

                        if (aStart <= solIniMins && aEnd >= solFinMins) {
                            coincideDisp = true;
                            break;
                        }
                    }
                }

                if (coincideDisp) {
                    score += 30;
                    motivos.push(`Disponible ${diaCod} ${horaIni} a ${horaFin}`);
                } else {
                    score += 5;
                    alertas.push(`Disponibilidad parcial o a coordinar en ${diaCod}`);
                }

                // D. Rango de Edad (si fue ingresado por el profesor en la solicitud)
                const edadMinSol = (sol.edadMin !== undefined && sol.edadMin !== null && sol.edadMin !== '') ? parseInt(sol.edadMin, 10) : null;
                const edadMaxSol = (sol.edadMax !== undefined && sol.edadMax !== null && sol.edadMax !== '') ? parseInt(sol.edadMax, 10) : null;
                const hayRangoEdad = (edadMinSol !== null || edadMaxSol !== null);

                if (hayRangoEdad) {
                    const edadAl = parseInt(al.edad, 10);
                    if (!isNaN(edadAl) && edadAl > 0) {
                        const cumpleMin = edadMinSol === null || edadAl >= edadMinSol;
                        const cumpleMax = edadMaxSol === null || edadAl <= edadMaxSol;
                        if (!cumpleMin || !cumpleMax) {
                            continue; // Descartar: no coincide con el rango etario solicitado por el docente
                        }
                        motivos.push(`Edad adecuada (${edadAl} años)`);
                    } else {
                        const txtRango = sol.rangoEdadTexto || ((edadMinSol && edadMaxSol) ? `${edadMinSol}-${edadMaxSol} años` : (edadMinSol ? `≥${edadMinSol}a` : `≤${edadMaxSol}a`));
                        alertas.push(`Edad sin registrar (solicitado: ${txtRango})`);
                    }
                }

                candidatosSol.push({
                    alumno: al,
                    score: Math.min(score, 100),
                    motivos,
                    alertas
                });
            }

            candidatosSol.sort((a, b) => b.score - a.score);
            totalCandidatosEncontrados += candidatosSol.length;
            mapaCandidatosPorSol[sol.id] = candidatosSol;

            // Renderizar el bloque de esta solicitud
            let candidatosHtml = '';
            if (candidatosSol.length === 0) {
                candidatosHtml = `
                    <div style="grid-column:1/-1; padding:20px; background:var(--hover-bg); border-radius:10px; border:1px dashed var(--border-color); text-align:center; color:var(--text-muted); font-size:13px;">
                        ⚠️ No se encontraron alumnos en Lista de Espera con suscripción <strong>${tipoSuscSol.toUpperCase()}</strong> que coincidan con los instrumentos, horarios ${sol.rangoEdadTexto ? `y edad (${sol.rangoEdadTexto}) ` : ''}de <strong>${sol.grupoNombre}</strong>.
                    </div>
                `;
            } else {
                candidatosHtml = candidatosSol.map(c => {
                    const al = c.alumno;
                    const instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'Sin inst.');
                    const badgeMatch = c.score >= 90
                        ? `<span class="status-val-ok" style="font-size:12px; font-weight:800;">🟢 ${c.score}% MATCH</span>`
                        : (c.score >= 70 
                            ? `<span class="status-val-pending" style="font-size:12px; font-weight:800;">🟡 ${c.score}% MATCH</span>`
                            : `<span class="status-val-reject" style="font-size:12px; font-weight:800;">🟠 ${c.score}% PARCIAL</span>`);

                    const diffDias = al.fecha_creacion ? Math.floor((new Date() - new Date(al.fecha_creacion)) / (1000 * 60 * 60 * 24)) : null;
                    const badgeEspera = diffDias !== null ? `<span class="match-chip" style="background:#f1f5f9; color:#475569; font-size:10.5px; padding:2px 6px; border-radius:6px;">⏳ ${diffDias}d espera</span>` : '';

                    const motivosHtml = c.motivos.map(m => `<span style="color:#0d5c30;">✅ ${m}</span>`).join(' • ');
                    const alertasHtml = c.alertas.length > 0 ? c.alertas.map(a => `<span style="color:var(--accent-red);">⚠️ ${a}</span>`).join(' • ') : '';

                    return `
                        <div class="match-card" style="display:flex; flex-direction:column; justify-content:space-between; padding:14px; border-radius:10px; border:1px solid var(--border-color); background:var(--card-bg); box-shadow:0 1px 4px rgba(0,0,0,0.03); width:100%; max-width:100%; box-sizing:border-box;">
                            <div>
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                                    <div>
                                        <strong style="font-size:14.5px; color:var(--text-main); cursor:pointer;" onclick="window.editarAlumnoModalDirecto('${al.id}')">${al.nombre}</strong>
                                        <div style="font-size:12px; color:var(--text-muted);">${al.edad ? `${al.edad} años` : ''} • 📚 ${al.nivel || 'Inicial I'}</div>
                                    </div>
                                    ${badgeMatch}
                                </div>
                                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
                                    <span class="match-chip" style="background:rgba(0,123,143,0.08); color:var(--accent-teal); font-weight:600; font-size:11px; padding:2px 8px; border-radius:6px;">🎸 ${instStr}</span>
                                    ${al.tipo_suscripcion ? `<span class="match-chip" style="background:#f3e8ff; color:#6b21a8; font-weight:700; font-size:10.5px; padding:2px 6px; border-radius:6px;">🏷️ ${al.tipo_suscripcion}</span>` : ''}
                                    ${badgeEspera}
                                    <span class="match-chip" style="background:#ecfdf5; color:#065f46; font-weight:600; font-size:10.5px; padding:2px 6px; border-radius:6px;">📅 Calendar Validado (${durMin}m)</span>
                                </div>
                                <div style="font-size:11.5px; line-height:1.4; background:var(--hover-bg); padding:6px 8px; border-radius:6px; border:1px solid var(--border-color); color:var(--text-muted); margin-bottom:8px;">
                                    ${motivosHtml} ${alertasHtml ? ` | ${alertasHtml}` : ''}
                                </div>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:10px; gap:8px;">
                                <button type="button" class="btn-app btn-secondary" onclick="window.editarAlumnoModalDirecto('${al.id}')" style="font-size:11px; height:30px; padding:0 10px;">👁️ Ver Ficha</button>
                                <button type="button" class="btn-app btn-primary btn-iniciar-prealta-solicitud" data-al-id="${al.id}" data-sol-id="${sol.id}" style="font-size:11.5px; height:30px; padding:0 12px; background:var(--accent-teal); font-weight:700;">🚀 Iniciar Pre-Alta</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            const edadReqTexto = sol.rangoEdadTexto || ((sol.edadMin || sol.edadMax) ? `${sol.edadMin || '0'} a ${sol.edadMax || '∞'} años` : '');
            const edadBadgeHeader = edadReqTexto ? `<span class="status-badge" style="background:#fdf2f8; color:#be185d; font-weight:700; font-size:11px;">🎂 Edad: ${edadReqTexto}</span>` : '';

            bloquesHtml.push(`
                <div style="background:#fff; border:1px solid var(--border-color); border-top:4px solid var(--accent-teal); border-radius:12px; padding:18px 20px; box-shadow:0 2px 8px rgba(0,0,0,0.03); margin-bottom:18px; width:100%; box-sizing:border-box;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:12px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span style="font-family:monospace; font-size:16px; font-weight:800; color:var(--accent-teal);">${sol.grupoNombre}</span>
                                <span class="status-badge" style="background:#fef3c7; color:#92400e; font-weight:700; font-size:11px;">${sol.tipoGrupo || 'Grupo'}</span>
                                <span class="status-badge" style="background:#e0f2fe; color:#0369a1; font-weight:700; font-size:11px;">⏱️ Duración de Clase: ${durMin} min</span>
                                ${edadBadgeHeader}
                            </div>
                            <div style="font-size:12.5px; color:var(--text-muted); margin-top:4px;">
                                Docente: <strong style="color:var(--text-main);">${sol.profesorNombre}</strong> • Horario: <strong style="color:var(--text-main);">${sol.horario}</strong> • Instrumento: <strong style="color:var(--text-main);">${sol.instrumento}</strong> • Nivel: <strong>${sol.nivel || 'Cualquiera'}</strong> ${edadReqTexto ? `• Rango Edad: <strong>${edadReqTexto}</strong>` : ''}
                            </div>
                            ${sol.observaciones ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-style:italic;">"${sol.observaciones}"</div>` : ''}
                        </div>
                        <span class="status-badge" style="background:${candidatosSol.length > 0 ? 'rgba(0,123,143,0.1)' : '#f1f5f9'}; color:${candidatosSol.length > 0 ? 'var(--accent-teal)' : '#64748b'}; font-weight:800; font-size:12px;">
                            ${candidatosSol.length} Candidato${candidatosSol.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px; width:100%; box-sizing:border-box;">
                        ${candidatosHtml}
                    </div>
                </div>
            `);
        }

        if (noRes) noRes.style.display = 'none';
        if (badge) {
            badge.textContent = `${totalCandidatosEncontrados} candidatos en ${solsAEvaluar.length} solicitud(es)`;
            badge.style.display = 'inline-flex';
        }

        grid.innerHTML = `
            <div style="width:100%; display:flex; flex-direction:column; gap:12px; box-sizing:border-box;">
                ${bloquesHtml.join('')}
            </div>
        `;

        // Listeners para Iniciar Pre-Alta en cada tarjeta de candidato
        grid.querySelectorAll('.btn-iniciar-prealta-solicitud').forEach(btn => {
            btn.addEventListener('click', () => {
                const alId = btn.getAttribute('data-al-id');
                const solId = btn.getAttribute('data-sol-id');
                const sol = solsAEvaluar.find(s => s.id === solId);
                if (!sol) return;

                const cand = (mapaCandidatosPorSol[sol.id] || []).find(c => c.alumno.id === alId);
                const discrepancias = cand ? (cand.alertas || []) : [];
                const instAlumno = cand && cand.alumno 
                    ? (Array.isArray(cand.alumno.instrumento) ? cand.alumno.instrumento[0] : cand.alumno.instrumento)
                    : sol.instrumento;

                if (window.abrirModalPrealta) {
                    window.abrirModalPrealta(alId, false, '', sol.grupoNombre, {
                        profeIdSugerido: sol.profesorId,
                        profeNombreSugerido: sol.profesorNombre,
                        instSugerido: instAlumno || sol.instrumento,
                        solicitudId: sol.id,
                        solicitud: sol,
                        esMatchSolicitud: true,
                        discrepancias: discrepancias
                    });
                }
            });
        });

    } catch(err) {
        console.error("Error en Opción A de búsqueda:", err);
        if (noRes) noRes.textContent = 'Error al ejecutar búsqueda por solicitudes: ' + err.message;
    } finally {
        if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnBuscar, false);
    }
}

// -----------------------------------------------------------------------
// Búsqueda de Alumnos Candidatos (Perfiles Sueltos en Lista de Espera)
// -----------------------------------------------------------------------
export async function ejecutarBusquedaAlumnosMatch(setBotonCargandoFn) {
    const btnBuscar = document.getElementById('match-btn-buscar');
    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnBuscar, true);

    const selSolEl = document.getElementById('match-sel-solicitud-cargada');
    const solVal = selSolEl ? selSolEl.value : '';
    const haySolicitudEspecífica = solVal || (window.solicitudesParaMatch && (window.solicitudesParaMatch === 'todas' || window.solicitudesParaMatch.length > 0));

    if (haySolicitudEspecífica) {
        const ids = (window.solicitudesParaMatch && (window.solicitudesParaMatch === 'todas' || window.solicitudesParaMatch.length > 0))
            ? window.solicitudesParaMatch
            : solVal;
        await ejecutarBusquedaAlumnosOpcionA(ids, setBotonCargandoFn);
        return;
    }

    const susc = document.getElementById('match-suscripcion')?.value || '';
    const selExcluir = document.getElementById('match-excluir-instrumentos');
    const excluirInsts = selExcluir ? Array.from(selExcluir.selectedOptions).map(o => o.value) : [];
    const edadDesde = parseInt(document.getElementById('match-edad-desde')?.value) || null;
    const edadHasta = parseInt(document.getElementById('match-edad-hasta')?.value) || null;
    const nivelesSeleccionados = Array.from(document.querySelectorAll('input[name="match-nivel"]:checked')).map(cb => cb.value);

    const diasMap = { 'lunes': 'L', 'martes': 'M', 'miercoles': 'X', 'jueves': 'J', 'viernes': 'V', 'sabado': 'S' };
    const diasSeleccionados = Array.from(document.querySelectorAll('.match-day-pill.active')).map(p => diasMap[p.dataset.dia] || p.dataset.dia);

    const horaDesde = document.getElementById('match-hora-desde')?.value || null;
    const horaHasta = document.getElementById('match-hora-hasta')?.value || null;
    const instFiltro = (document.getElementById('match-instrumento-filtro')?.value || '').trim().toLowerCase();
    const esCanto = document.getElementById('match-chk-canto')?.checked || false;

    const profeIdSeleccionado = document.getElementById('match-profe')?.value || '';
    const profeSeleccionado = profeIdSeleccionado ? matchProfesores.find(p => p.id === profeIdSeleccionado) : null;

    const resSec = document.getElementById('match-resultados');
    const grid = document.getElementById('match-resultados-grid');
    const noRes = document.getElementById('match-sin-resultados');
    const badge = document.getElementById('match-resultados-badge');
    const tituloRes = document.getElementById('match-resultados-titulo');
    const bulkBar = document.getElementById('match-alumnos-bulk-bar');

    if (resSec) resSec.style.display = 'flex';
    if (grid) grid.innerHTML = '';
    if (badge) badge.style.display = 'none';
    if (bulkBar) bulkBar.style.display = 'none';
    if (tituloRes) {
        tituloRes.textContent = profeSeleccionado 
            ? `Alumnos Asignables a ${profeSeleccionado.nombre}` 
            : 'Alumnos Candidatos Encontrados';
    }
    if (noRes) { noRes.style.display = 'block'; noRes.textContent = '🔄 Buscando perfiles de alumnos en lista de espera...'; }

    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Lista de espera")));
        let candidatos = [];

        qSnap.forEach(d => {
            const al = { id: d.id, ...d.data() };
            if (susc && al.tipo_suscripcion !== susc) return;

            const hayRangoEdad = edadDesde !== null || edadHasta !== null;
            if (hayRangoEdad) {
                const e = parseInt(al.edad, 10);
                if (isNaN(e) || e <= 0) return;
                if (edadDesde !== null && e < edadDesde) return;
                if (edadHasta !== null && e > edadHasta) return;
            }

            if (nivelesSeleccionados.length > 0 && al.nivel && !nivelesSeleccionados.includes(al.nivel)) return;

            const insts = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);

            if (instFiltro) {
                const tieneInst = insts.some(i => (i || '').toLowerCase().trim().includes(instFiltro));
                if (!tieneInst) return;
            }

            if (esCanto) {
                const tieneCanto = insts.some(i => (i || '').toLowerCase().includes('canto') || (i || '').toLowerCase().includes('voz'));
                if (!tieneCanto) return;
            }

            if (excluirInsts.length > 0) {
                const disponibles = insts.filter(i => !excluirInsts.includes(i));
                if (disponibles.length === 0) return;
            }

            // 1. Si se seleccionó un profesor, validar aptitud por suscripción, skills y disponibilidad
            if (profeSeleccionado) {
                const tipoAl = detectarTipoSuscripcion(al.tipo_suscripcion || '');
                if (tipoAl === 'ensamble' && profeSeleccionado.ensambles !== true) return;
                if (tipoAl === 'grupal' && !profeSeleccionado.grupales && !profeSeleccionado.ensambles) return;

                const profeSkills = (profeSeleccionado.skills || []).map(s => s.toLowerCase().trim());
                if (insts.length > 0) {
                    const cubreInst = insts.some(i => {
                        const iNorm = (i || '').toLowerCase().trim();
                        if (iNorm.includes('canto') || iNorm.includes('voz')) {
                            return profeSkills.some(s => s.includes('canto') || s.includes('voz'));
                        }
                        return profeSkills.some(s => s.includes(iNorm));
                    });
                    if (!cubreInst) return;
                }

                // La disponibilidad del profesor actúa como filtro directo de disponibilidad para el alumno
                const dispProfe = profeSeleccionado.disponibilidad || {};
                const dispAl = al.disponibilidad || {};
                let coincideConProfe = false;

                const diasAEvalProfe = diasSeleccionados.length > 0 ? diasSeleccionados : ['L', 'M', 'X', 'J', 'V', 'S'];
                for (let dia of diasAEvalProfe) {
                    const rangosProfe = dispProfe[dia] || [];
                    const rangosAl = dispAl[dia] || [];
                    if (rangosProfe.length === 0 || rangosAl.length === 0) continue;

                    for (let rp of rangosProfe) {
                        if (!rp) continue;
                        let rpIni = normalizarHoraLocal(typeof rp === 'object' ? rp.inicio : (typeof rp === 'string' ? rp.split(/[-a]/)[0] : '09:00'), '09:00');
                        let rpFin = normalizarHoraLocal(typeof rp === 'object' ? rp.fin : (typeof rp === 'string' ? (rp.split(/[-a]/)[1] || rp.split(/[-a]/)[0]) : '22:00'), '22:00');
                        let pStart = convertirHoraAMinutos(rpIni);
                        let pEnd = convertirHoraAMinutos(rpFin);

                        if (horaDesde) pStart = Math.max(pStart, convertirHoraAMinutos(horaDesde));
                        if (horaHasta) pEnd = Math.min(pEnd, convertirHoraAMinutos(horaHasta));
                        if (pEnd - pStart < 60) continue;

                        for (let ra of rangosAl) {
                            if (!ra) continue;
                            let raIni = normalizarHoraLocal(typeof ra === 'object' ? ra.inicio : (typeof ra === 'string' ? ra.split(/[-a]/)[0] : '09:00'), '09:00');
                            let raFin = normalizarHoraLocal(typeof ra === 'object' ? ra.fin : (typeof ra === 'string' ? (ra.split(/[-a]/)[1] || ra.split(/[-a]/)[0]) : '22:00'), '22:00');
                            let aStart = convertirHoraAMinutos(raIni);
                            let aEnd = convertirHoraAMinutos(raFin);

                            const overlapStart = Math.max(pStart, aStart);
                            const overlapEnd = Math.min(pEnd, aEnd);

                            if (overlapEnd - overlapStart >= 60) {
                                coincideConProfe = true;
                                break;
                            }
                        }
                        if (coincideConProfe) break;
                    }
                    if (coincideConProfe) break;
                }

                if (!coincideConProfe) return;
                al.profeMatchAsignado = profeSeleccionado;
            } else {
                // Si no hay profesor seleccionado, aplicar filtro general de días y horarios si se marcaron
                if (diasSeleccionados.length > 0 || (horaDesde && horaHasta)) {
                    const dispAl = al.disponibilidad || {};
                    let tieneCoincidencia = false;

                    const diasAEval = diasSeleccionados.length > 0 ? diasSeleccionados : ['L', 'M', 'X', 'J', 'V', 'S'];
                    for (let dia of diasAEval) {
                        const rangosDia = dispAl[dia] || [];
                        for (let r of rangosDia) {
                            if (!r) continue;
                            let rIni = normalizarHoraLocal(typeof r === 'object' ? r.inicio : (typeof r === 'string' ? r.split(/[-a]/)[0] : '09:00'), '09:00');
                            let rFin = normalizarHoraLocal(typeof r === 'object' ? r.fin : (typeof r === 'string' ? (r.split(/[-a]/)[1] || r.split(/[-a]/)[0]) : '22:00'), '22:00');
                            
                            let alIniMins = convertirHoraAMinutos(rIni);
                            let alFinMins = convertirHoraAMinutos(rFin);

                            let filtroIniMins = horaDesde ? convertirHoraAMinutos(horaDesde) : alIniMins;
                            let filtroFinMins = horaHasta ? convertirHoraAMinutos(horaHasta) : alFinMins;

                            const overlapStart = Math.max(alIniMins, filtroIniMins);
                            const overlapEnd = Math.min(alFinMins, filtroFinMins);

                            if (overlapEnd - overlapStart >= 60) {
                                tieneCoincidencia = true;
                                break;
                            }
                        }
                        if (tieneCoincidencia) break;
                    }

                    if (!tieneCoincidencia) return;
                }
            }

            candidatos.push(al);
        });

        if (candidatos.length === 0) {
            if (noRes) noRes.textContent = profeSeleccionado
                ? `No se encontraron alumnos en Lista de Espera asignables a ${profeSeleccionado.nombre} con coincidencia horaria y de instrumento.`
                : 'No se encontraron alumnos en Lista de Espera que coincidan con los criterios seleccionados.';
            if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnBuscar, false);
            return;
        }

        if (noRes) noRes.style.display = 'none';
        if (badge) {
            badge.textContent = `${candidatos.length} alumnos candidatos`;
            badge.style.display = 'inline-block';
        }

        renderResultadosAlumnosMatch(candidatos);

    } catch(err) {
        console.error("Error en búsqueda de alumnos:", err);
        if (noRes) noRes.textContent = 'Error al realizar la búsqueda: ' + err.message;
    } finally {
        if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnBuscar, false);
    }
}

export function renderResultadosAlumnosMatch(candidatos = []) {
    const grid = document.getElementById('match-resultados-grid');
    const noRes = document.getElementById('match-sin-resultados');
    const badge = document.getElementById('match-resultados-badge');
    const bulkBar = document.getElementById('match-alumnos-bulk-bar');
    const countEl = document.getElementById('match-alumnos-selected-count');

    if (!grid || !noRes || !badge) return;

    if (candidatos.length === 0) {
        grid.innerHTML = '';
        noRes.style.display = 'block';
        noRes.textContent = 'No se encontraron alumnos compatibles con los filtros seleccionados.';
        badge.style.display = 'none';
        if (bulkBar) bulkBar.style.display = 'none';
        return;
    }

    noRes.style.display = 'none';
    badge.style.display = 'inline-flex';
    badge.textContent = `${candidatos.length} alumnos encontrados`;
    matchAlumnosSeleccionados.clear();
    window.matchAlumnosSeleccionados = matchAlumnosSeleccionados;
    window.selectedBulkIds = [];
    const globalBarInit = document.getElementById('bulk-actions-bar');
    if (globalBarInit) globalBarInit.style.display = 'none';

    const actualizarContadorBulk = () => {
        // Asegurar que la barra global inferior no interfiera ni quede flotando
        const globalBar = document.getElementById('bulk-actions-bar');
        if (globalBar) globalBar.style.display = 'none';

        // Sincronizar selección global
        window.selectedBulkIds = Array.from(matchAlumnosSeleccionados);

        if (matchAlumnosSeleccionados.size > 0) {
            if (bulkBar) bulkBar.style.display = 'flex';
            if (countEl) countEl.textContent = `${matchAlumnosSeleccionados.size} alumno${matchAlumnosSeleccionados.size > 1 ? 's' : ''} seleccionado${matchAlumnosSeleccionados.size > 1 ? 's' : ''}`;
        } else {
            if (bulkBar) bulkBar.style.display = 'none';
        }
    };

    grid.innerHTML = candidatos.map(al => {
        const insts = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'Sin inst.');
        const susc = al.tipo_suscripcion || 'Sin suscripción';
        const nivel = al.nivel || 'Inicial I';
        const edad = al.edad ? `${al.edad} años` : 'Edad s/d';
        const evalTxt = al.reserva_profe_nombre || al.profesor_asignado || '';

        // Resumen de disponibilidad
        const disp = al.disponibilidad || {};
        const diasConDisp = Object.keys(disp).filter(k => Array.isArray(disp[k]) && disp[k].length > 0);
        const dispResumen = diasConDisp.length > 0 
            ? diasConDisp.map(d => `${d}: ${disp[d].map(r => typeof r === 'string' ? r : `${r.inicio || '09:00'}-${r.fin || '22:00'}`).join(', ')}`).join(' • ')
            : 'Sin franjas registradas';

        const matchProfeTag = al.profeMatchAsignado
            ? `<span class="match-chip" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px;">🧑‍🏫 Match Profe: ${al.profeMatchAsignado.nombre}</span>`
            : '';

        return `
            <div class="match-card" style="display:flex; flex-direction:column; justify-content:space-between; padding:16px; border-radius:12px; border:1px solid var(--border-color); background:#ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.04); position:relative;">
                <div>
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <input type="checkbox" class="match-alumno-chk" data-id="${al.id}" style="width:18px; height:18px; cursor:pointer; accent-color:var(--accent-teal);">
                            <div>
                                <div style="font-weight:800; font-size:15px; color:var(--text-main); cursor:pointer;" onclick="window.editarAlumnoModalDirecto('${al.id}')">${al.nombre}</div>
                                <div style="font-size:12px; color:var(--text-muted);">${edad} • 📚 ${nivel}</div>
                            </div>
                        </div>
                        <span class="status-badge" style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700;">${susc}</span>
                    </div>

                    <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px;">
                        <span class="match-chip chip-inst" style="background:rgba(0,123,143,0.08); color:var(--accent-teal); border:1px solid rgba(0,123,143,0.2); font-size:11px; font-weight:600; padding:2px 8px; border-radius:6px;">🎸 ${insts}</span>
                        ${matchProfeTag}
                        ${evalTxt ? `<span class="match-chip" style="background:#f1f5f9; color:#475569; font-size:11px; padding:2px 8px; border-radius:6px;">🧑‍🏫 Eval: ${evalTxt}</span>` : ''}
                    </div>

                    <div style="background:#f8fafc; border-radius:8px; padding:8px 10px; font-size:11.5px; color:var(--text-muted); margin-bottom:12px;">
                        <div style="font-weight:700; color:var(--text-main); margin-bottom:2px;">🕒 Disponibilidad Declarada:</div>
                        <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${dispResumen}">${dispResumen}</div>
                    </div>
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid #f1f5f9; padding-top:10px; gap:8px;">
                    <button type="button" class="btn-app btn-secondary" onclick="window.editarAlumnoModalDirecto('${al.id}')" style="font-size:11.5px; padding:4px 10px; height:30px;">👁️ Ver Ficha</button>
                    <button type="button" class="btn-app btn-primary btn-iniciar-prealta-al" data-id="${al.id}" data-profe-id="${al.profeMatchAsignado ? al.profeMatchAsignado.id : ''}" style="font-size:11.5px; padding:4px 12px; height:30px; background:var(--accent-teal);">🚀 Iniciar Pre-Alta</button>
                </div>
            </div>
        `;
    }).join('');

    // Event listeners para checkboxes y botones
    grid.querySelectorAll('.match-alumno-chk').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const id = chk.getAttribute('data-id');
            if (chk.checked) matchAlumnosSeleccionados.add(id);
            else matchAlumnosSeleccionados.delete(id);
            actualizarContadorBulk();
        });
    });

    grid.querySelectorAll('.btn-iniciar-prealta-al').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const profeId = btn.getAttribute('data-profe-id') || '';
            if (window.abrirModalPrealta) {
                window.abrirModalPrealta(id, false, null, null, { profeIdSugerido: profeId });
            }
        });
    });
}

export async function ejecutarBusquedaMatch(setBotonCargandoFn) {
    const susc = document.getElementById('match-suscripcion')?.value;
    if (!susc) {
        alert('Por favor selecciona una suscripcion.');
        return;
    }

    const btnBuscar = document.getElementById('match-btn-buscar');
    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnBuscar, true);

    const tipoDetectado = detectarTipoSuscripcion(susc);
    const esGrupal = tipoDetectado !== 'individual';
    const esCanto = tipoDetectado === 'grupal' && (document.getElementById('match-chk-canto')?.checked || false);

    const selExcluir = document.getElementById('match-excluir-instrumentos');
    const excluirInsts = selExcluir ? Array.from(selExcluir.selectedOptions).map(o => o.value) : [];

    const profeIdSeleccionado = document.getElementById('match-profe')?.value;
    const edadDesde = parseInt(document.getElementById('match-edad-desde')?.value) || null;
    const edadHasta = parseInt(document.getElementById('match-edad-hasta')?.value) || null;
    const cantidadDeseada = matchCantidadActual || 4;

    const nivelesSeleccionados = Array.from(document.querySelectorAll('input[name="match-nivel"]:checked')).map(cb => cb.value);

    const diasMap = { 'lunes': 'L', 'martes': 'M', 'miercoles': 'X', 'jueves': 'J', 'viernes': 'V', 'sabado': 'S' };
    const diasSeleccionados = Array.from(document.querySelectorAll('.match-day-pill.active')).map(p => diasMap[p.dataset.dia] || p.dataset.dia);

    const horaDesde = document.getElementById('match-hora-desde')?.value || null;
    const horaHasta = document.getElementById('match-hora-hasta')?.value || null;
    const instFiltro = document.getElementById('match-instrumento-filtro')?.value || '';

    const resSec = document.getElementById('match-resultados');
    const grid = document.getElementById('match-resultados-grid');
    const noRes = document.getElementById('match-sin-resultados');
    const badge = document.getElementById('match-resultados-badge');

    if (resSec) resSec.style.display = 'flex';
    if (grid) grid.innerHTML = '';
    if (badge) badge.style.display = 'none';
    if (noRes) { noRes.style.display = 'block'; noRes.textContent = '🔄 Buscando alumnos en lista de espera y cruzando horarios...'; }

    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Lista de espera")));
        let candidatos = [];

        qSnap.forEach(d => {
            const al = { id: d.id, ...d.data() };
            if (al.tipo_suscripcion !== susc) return;

            const hayRangoEdad = edadDesde !== null || edadHasta !== null;
            if (hayRangoEdad) {
                const e = parseInt(al.edad, 10);
                if (isNaN(e) || e <= 0) return;
                if (edadDesde !== null && e < edadDesde) return;
                if (edadHasta !== null && e > edadHasta) return;
            }

            if (esGrupal && nivelesSeleccionados.length > 0 && al.nivel && !nivelesSeleccionados.includes(al.nivel)) return;

            const insts = Array.isArray(al.instrumento) ? al.instrumento : (al.instrumento ? [al.instrumento] : []);

            if (instFiltro) {
                const tieneInst = insts.some(i => i.toLowerCase().trim() === instFiltro.toLowerCase().trim());
                if (!tieneInst) return;
            }

            if (esCanto) {
                const tieneCanto = insts.some(i => i.toLowerCase().includes('canto') || i.toLowerCase().includes('voz'));
                if (!tieneCanto) return;
            }

            if (excluirInsts.length > 0) {
                const disponibles = insts.filter(i => !excluirInsts.includes(i));
                if (disponibles.length === 0) return;
            }

            candidatos.push(al);
        });

        if (candidatos.length === 0) {
            if (noRes) noRes.textContent = 'No hay alumnos en Lista de Espera que coincidan con la suscripcion y filtros seleccionados.';
            if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnBuscar, false);
            return;
        }

        let profesAEvaluar = matchProfesores.filter(pr => {
            if (profeIdSeleccionado && pr.id !== profeIdSeleccionado) return false;
            if (!esGrupal) return true;
            if (esCanto) return (pr.skills || []).some(s => s.toLowerCase().includes('canto'));
            return pr.ensambles === true;
        });

        if (profesAEvaluar.length === 0) {
            if (noRes) noRes.textContent = 'No hay profesores disponibles con las habilidades/aptitud para esta busqueda.';
            if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnBuscar, false);
            return;
        }

        const sugerencias = [];
        const configActiva = defaultCfg;
        const minIntegrantes = configActiva.grupo_min_integrantes || 2;

        if (!esGrupal) {
            candidatos.forEach(al => {
                const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento];
                const instElegido = instFiltro || al.instrumento_asignado || insts[0] || '';

                profesAEvaluar.forEach(pr => {
                    const profeSkills = pr.skills || [];
                    const ensenaInst = profeSkills.includes(instElegido) || profeSkills.length === 0 || insts.some(i => profeSkills.includes(i));
                    if (!ensenaInst) return;

                    const huecos = buscarHuecosComunes([al], pr, diasSeleccionados, horaDesde, horaHasta);
                    huecos.forEach(slot => {
                        const { porcentaje, desglose } = calcularScoreCompatibilidad([al], pr, slot, false, false);
                        const horaCorta = formatearHoraParaNombreGrupo(slot.inicio);
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
            const tamanoMaximo = Math.min(cantidadDeseada, candidatos.length);
            const tamanos = [];
            for (let t = tamanoMaximo; t >= minIntegrantes; t--) {
                tamanos.push(t);
            }

            for (let tam of tamanos) {
                const combinaciones = generarCombinaciones(candidatos, tam);

                for (let grupoAlumnos of combinaciones) {
                    const nivelesGrupo = grupoAlumnos.map(a => a.nivel);
                    if (!sonNivelesCompatibles(nivelesGrupo)) continue;

                    const edadesGrupo = grupoAlumnos.map(a => a.edad);
                    const hayRangoDefinido = edadDesde !== null || edadHasta !== null;
                    if (!hayRangoDefinido) {
                        if (!sonEdadesCompatibles(edadesGrupo, configActiva)) continue;
                    }

                    if (!esCanto) {
                        const instDistintos = new Set();
                        grupoAlumnos.forEach(a => {
                            const insts = Array.isArray(a.instrumento) ? a.instrumento : [a.instrumento];
                            insts.forEach(i => { if (i) instDistintos.add(i); });
                        });
                        if (instDistintos.size < 2) continue;
                    }

                    profesAEvaluar.forEach(pr => {
                        const huecos = buscarHuecosComunes(grupoAlumnos, pr, diasSeleccionados, horaDesde, horaHasta);
                        huecos.forEach(slot => {
                            const { porcentaje, desglose } = calcularScoreCompatibilidad(grupoAlumnos, pr, slot, esCanto, true);
                            const horaCorta = formatearHoraParaNombreGrupo(slot.inicio);
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

        sugerencias.sort((a, b) => {
            if (b.compatibilidad !== a.compatibilidad) return b.compatibilidad - a.compatibilidad;
            return b.alumnos.length - a.alumnos.length;
        });

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
        console.error("Error en busqueda de matches:", err);
        if (noRes) noRes.textContent = 'Ocurrio un error al procesar el match: ' + err.message;
    }

    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnBuscar, false);
}

export function renderResultadosMatch() {
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
            const tagsPsicoHtml = (Array.isArray(al.perfil_psicologico) && al.perfil_psicologico.length > 0)
                ? al.perfil_psicologico.map(t => `<span class="profile-tag-badge" style="font-size:9.5px; padding:1px 6px;">🧠 ${t}</span>`).join('')
                : '';

            return `
                <div class="match-student-row" style="cursor:pointer;" onclick="window.editarAlumnoModalDirecto('${al.id}')" title="Ver ficha y registro completo de ${al.nombre}">
                    <span class="match-student-name" style="cursor:pointer;">👤 ${al.nombre}</span>
                    <div class="match-student-tags">
                        <span class="match-student-tag">${instStr}</span>
                        ${nivelStr ? `<span class="match-student-tag nivel">${nivelStr}</span>` : ''}
                        ${edadStr ? `<span class="match-student-tag edad">${edadStr}</span>` : ''}
                        ${tagsPsicoHtml}
                    </div>
                </div>
            `;
            }).join('');

            const cardTitulo = isInd ? `👤 ${grupo.alumnos[0].nombre}` : grupo.nombreSugerido;
            const cardSubtitulo = isInd ? `Clase Individual con ${grupo.profeNombre}` : `${grupo.tipo} • ${grupo.alumnos.length} integrantes`;
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

                <div class="match-compat-bar-wrapper">
                    <div class="match-compat-label">
                        <span style="font-size:11px; font-weight:700; color:var(--text-muted);">COMPATIBILIDAD</span>
                        <span class="match-compat-pct" style="color:var(--accent-teal);">${pct}%</span>
                    </div>
                    <div class="match-compat-bar-track">
                        <div class="match-compat-bar ${barClass}" style="width:${pct}%;"></div>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:6px;">
                    ${alumnosHtml}
                </div>

                <div class="match-card-footer">
                    <div>📅 <strong>${grupo.horario}</strong></div>
                    <div>👨‍🏫 Profesor: <strong>${grupo.profeNombre}</strong></div>
                </div>

                <div class="match-card-actions">
                    <button type="button" class="match-card-btn-revisar" onclick="window.abrirModalDetalleGrupo(${idx})">👁️ Revisar</button>
                    <button type="button" class="btn-primary" onclick="window.abrirModalConfirmarMatchPorIndice(${idx})">${btnAccionTxt}</button>
                </div>
            </div>
        `;
        }).join('');
    }

    export function abrirModalDetalleGrupo(idx) {
        const grupo = matchGruposSugeridos[idx];
        if (!grupo) return;

        const idxEl = document.getElementById('detalle-grupo-index');
        if (idxEl) idxEl.value = idx;
        const titEl = document.getElementById('detalle-grupo-titulo');
        if (titEl) titEl.textContent = grupo.nombreSugerido;
        const bdgEl = document.getElementById('detalle-grupo-badge');
        if (bdgEl) bdgEl.textContent = `${grupo.tipo} • ${grupo.alumnos.length} alumnos`;

        const pct = grupo.compatibilidad || 80;
        const pctEl = document.getElementById('detalle-compat-pct');
        if (pctEl) pctEl.textContent = `${pct}%`;
        const bar = document.getElementById('detalle-compat-bar');
        if (bar) {
            bar.style.width = `${pct}%`;
            bar.className = `match-compat-bar ${pct >= 80 ? 'high' : (pct >= 60 ? 'medium' : 'low')}`;
        }

        const desgloseCont = document.getElementById('detalle-compat-desglose');
        if (desgloseCont) {
            desgloseCont.innerHTML = (grupo.desglose || []).map(item =>
                `<span style="font-size:11px; padding:4px 10px; background:var(--hover-bg); border:1px solid var(--border-color); border-radius:20px; color:var(--text-main); font-weight:600;">${item}</span>`
            ).join('');
        }

        const intCont = document.getElementById('detalle-grupo-integrantes');
        if (intCont) {
            intCont.innerHTML = grupo.alumnos.map(al => {
                const instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'Sin inst.');
                const tagsPsicoHtml = (Array.isArray(al.perfil_psicologico) && al.perfil_psicologico.length > 0)
                    ? al.perfil_psicologico.map(t => `<span class="profile-tag-badge" style="font-size:10px;">🧠 ${t}</span>`).join('')
                    : '';
                return `
                <div class="match-confirm-row" style="cursor:pointer;" onclick="window.editarAlumnoModalDirecto('${al.id}')" title="Ver ficha y registro completo de ${al.nombre}">
                    <div style="flex:1;">
                        <div style="font-weight:700; color:var(--text-main); font-size:13.5px;">👤 ${al.nombre}</div>
                        <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">📱 ${al.celular || 'Sin celular'} • ${al.tipo_suscripcion || ''}</div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; align-items:center;">
                        <span class="match-student-tag">${instStr}</span>
                        ${al.nivel ? `<span class="match-student-tag nivel">${al.nivel}</span>` : ''}
                        ${al.edad ? `<span class="match-student-tag edad">${al.edad}a</span>` : ''}
                        ${tagsPsicoHtml}
                    </div>
                </div>
            `;
            }).join('');
        }

        const infoCont = document.getElementById('detalle-grupo-info');
        if (infoCont) {
            infoCont.innerHTML = `
            <div>📅 <strong>Horario:</strong> ${grupo.horario}</div>
            <div>👨‍🏫 <strong>Profesor Asignado:</strong> ${grupo.profeNombre}</div>
        `;
        }

        document.getElementById('modal-detalle-grupo')?.showModal();
    }

    export function abrirModalConfirmarMatch(grupo) {
        const isInd = grupo.tipo === 'Individual';
        const nombreSugerido = isInd ? 'Clase Individual' : (grupo.nombreSugerido || '');
        const modalTitulo = document.getElementById('match-confirm-modal-titulo');
        const wrapperNombre = document.getElementById('match-confirm-nombre-grupo-wrapper');
        const btnEjecutar = document.getElementById('btn-ejecutar-confirmar-match');

        if (modalTitulo) modalTitulo.textContent = isInd ? '👤 Asignar Profesor a Alumno' : '🧩 Confirmar Match de Grupo';
        if (wrapperNombre) wrapperNombre.style.display = isInd ? 'none' : 'block';
        if (btnEjecutar) btnEjecutar.textContent = isInd ? '✅ Asignar Profesor' : '✅ Confirmar y Asignar';

        const nombreGrpInput = document.getElementById('match-confirm-nombre-grupo');
        if (nombreGrpInput) nombreGrpInput.value = nombreSugerido;

        const resCont = document.getElementById('match-confirm-resumen');
        if (resCont) {
            resCont.innerHTML = `
            <div>📅 <strong>${grupo.horario || 'Horario por definir'}</strong></div>
            <div>👨‍🏫 Profesor: <strong>${grupo.profeNombre || 'Sin asignar'}</strong></div>
        `;
        }

        const intCont = document.getElementById('match-confirm-integrantes');
        if (intCont) {
            intCont.innerHTML = (grupo.alumnos || []).map(al =>
                `<div class="match-confirm-row">
                <span class="match-confirm-row-name">👤 ${al.nombre}</span>
                <span class="match-confirm-row-info">${(al.instrumento || []).join(', ')} • ${al.nivel || '-'} • ${al.edad ? al.edad + 'a' : '-'}</span>
            </div>`
            ).join('');
        }

        const dataInput = document.getElementById('match-confirm-data');
        if (dataInput) dataInput.value = JSON.stringify(grupo);

        document.getElementById('modal-confirmar-match')?.showModal();
    }

    export function calcularProximaFechaDiaHora(diaCodigo, horaStr) {
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

export async function ejecutarConfirmarMatch(setBotonCargandoFn, cargarVistaFn) {
    const dataRaw = document.getElementById('match-confirm-data')?.value;
    if (!dataRaw) return;

    const grupo = JSON.parse(dataRaw);
    const isInd = grupo.tipo === 'Individual';
    let nombreGrupo = document.getElementById('match-confirm-nombre-grupo')?.value?.trim() || '';

    if (!isInd && !nombreGrupo) {
        alert('Por favor ingresa un nombre para el grupo.');
        return;
    }
    if (isInd) nombreGrupo = 'Clase Individual';

    const btnConfirm = document.getElementById('btn-ejecutar-confirmar-match');
    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnConfirm, true);

    const now = new Date();
    const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

    const diaId = grupo.slot?.diaId || 'M';
    const horaInicio = grupo.slot?.inicio || '18:00';
    const fechaSugerida = calcularProximaFechaDiaHora(diaId, horaInicio);

    // Validación estricta en Google Calendar antes de confirmar el grupo/clase
    const tieneBateria = (grupo.alumnos || []).some(al => {
        const insts = Array.isArray(al.instrumento) ? al.instrumento : [al.instrumento || ''];
        return insts.some(i => (i || '').toLowerCase().includes('bat')) || (al.instrumento_asignado || '').toLowerCase().includes('bat');
    });

    if (fechaSugerida) {
        const dStart = new Date(fechaSugerida);
        const dEnd = new Date(dStart.getTime() + 60 * 60000);
        try {
            const valCal = await validarConflictoCalendarEnVivo({
                inicioISO: dStart.toISOString(),
                finISO: dEnd.toISOString(),
                profeId: grupo.profeId || '',
                profeNombre: grupo.profeNombre || '',
                profeCalId: grupo.correoCalendario || '',
                esBateria: tieneBateria,
                configApp: defaultCfg
            });

            if (!valCal.valido) {
                const forzarConflicto = confirm(`⚠️ Conflicto detectado en Google Calendar:\n\n• ${valCal.motivo}\n\n¿Deseas confirmar la propuesta de todas formas?`);
                if (!forzarConflicto) {
                    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnConfirm, false);
                    return;
                }
            }
        } catch(errVal) {
            console.warn("No se pudo verificar conflicto con Google Calendar:", errVal);
        }
    }

    try {
        for (const al of grupo.alumnos) {
            const alRef = doc(db, "alumnos", al.id);
            const alDoc = await getDoc(alRef);
            const alData = alDoc.exists() ? alDoc.data() : {};
            const hist = alData.historial || [];

            const textoHist = isInd
                ? `Propuesta individual pre-armada con Profe ${grupo.profeNombre || 'a definir'} (${grupo.horario}). En espera de validacion con el alumno.`
                : `Match pre-armado: Asignado al grupo "${nombreGrupo}" (${grupo.horario}) con Profe ${grupo.profeNombre || 'a definir'}. En espera de validacion con el alumno.`;

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

        document.getElementById('modal-confirmar-match')?.close();

        if (isInd) {
            alert(`✅ Propuesta individual creada con exito. Paso a "Grupos en Validacion" para coordinar con el alumno.`);
        } else {
            alert(`✅ Grupo "${nombreGrupo}" pre-armado con exito. Paso a "Grupos en Validacion" para coordinar con los alumnos.`);
        }

        if (typeof cargarVistaFn === 'function') {
            await cargarVistaFn('Match - En Validacion');
        }

    } catch(err) {
        console.error("Error al confirmar match:", err);
        alert("Error al confirmar: " + err.message);
    }

    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btnConfirm, false);
}

export function obtenerEmojiInstrumento(inst) {
    if (!inst) return '🎵';
    const s = (Array.isArray(inst) ? inst.join(' ') : String(inst)).toLowerCase();
    if (s.includes('gui') || s.includes('electr')) return defaultCfg.emoji_guitarra || '🎸';
    if (s.includes('bat')) return defaultCfg.identificador_bateria || '🥁';
    if (s.includes('canto') || s.includes('voz') || s.includes('coro')) return defaultCfg.emoji_canto || '🎤';
    if (s.includes('pian') || s.includes('tecl')) return defaultCfg.emoji_piano || '🎹';
    if (s.includes('baj')) return defaultCfg.emoji_bajo || '🎸';
    if (s.includes('caj')) return defaultCfg.emoji_cajon || '📦';
    if (s.includes('sax') || s.includes('vient')) return '🎷';
    if (s.includes('viol')) return '🎻';
    if (s.includes('ukel') || s.includes('ucu')) return '🪕';
    return '🎵';
}

export async function renderMatchEnValidacion(container) {
    const tit = document.getElementById('vista-titulo');
    if (tit) tit.innerHTML = '<span style="color:var(--text-muted); font-weight:500;">Match › </span><span style="color:var(--text-main); font-weight:700;">Grupos en Validación</span>';
    const cVista = document.getElementById('controles-vista');
    if (cVista) cVista.style.display = 'none';
    const sGen = document.getElementById('search-container-general');
    if (sGen) sGen.style.display = 'none';
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
                    <div style="font-size:16px; font-weight:700; color:var(--text-main); margin-bottom:6px;">No hay grupos en validacion</div>
                    <div style="font-size:13px; max-width:450px; margin:0 auto;">Crea una propuesta desde <strong>"Crear Grupos / Match"</strong> para comenzar a coordinar y validar con los alumnos.</div>
                </div>
            `;
            return;
        }

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
            const confirmados = integrantes.filter(i => i.estado_validacion_alumno === 'confirmado').length;
            const total = integrantes.length;
            const todosConfirmados = confirmados === total;

            const chipClass = todosConfirmados ? 'status-val-ok' : 'status-val-pending';
            const chipTxt = `${confirmados}/${total} Validados`;

            const integrantesHtml = integrantes.map(al => {
                const isConfirmed = al.estado_validacion_alumno === 'confirmado';
                const instAsignado = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'Sin inst.'));
                const emojiInst = obtenerEmojiInstrumento(instAsignado);
                
                let datosParts = [];
                if (al.edad) datosParts.push(`${al.edad} años`);
                if (al.nivel) datosParts.push(`<span class="match-student-tag nivel" style="font-size:10px; padding:2px 7px;">${al.nivel}</span>`);
                if (instAsignado) datosParts.push(`<strong style="color:var(--accent-teal); font-weight:600;">${emojiInst} ${instAsignado}</strong>`);
                if (al.tipo_suscripcion) datosParts.push(`<strong style="color:var(--accent-purple); font-weight:600;">🧩 ${al.tipo_suscripcion}</strong>`);

                const filaDatos = datosParts.length > 0
                    ? `<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:12px; color:var(--text-muted); text-align:left;">${datosParts.join(' • ')}</div>`
                    : '';

                const tagsPsicoHtml = (Array.isArray(al.perfil_psicologico) && al.perfil_psicologico.length > 0)
                    ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px; text-align:left;">${al.perfil_psicologico.map(t => `<span class="profile-tag-badge" style="font-size:9.5px; padding:1px 6px;">🧠 ${t}</span>`).join('')}</div>`
                    : '';
                
                return `
                    <div class="group-member-row" style="padding:12px 14px; align-items:center; justify-content:space-between; gap:12px;">
                        <div class="group-member-info" style="display:flex; flex-direction:column; align-items:flex-start; text-align:left; gap:3px; cursor:pointer; flex:1;" onclick="window.editarAlumnoModalDirecto('${al.id}')" title="Ver ficha y registro completo de ${al.nombre}">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; text-align:left;">
                                <span class="group-member-name" style="font-size:14px; font-weight:700; color:var(--text-main);">👤 ${al.nombre}</span>
                                <span class="group-member-status-chip ${isConfirmed ? 'status-val-ok' : 'status-val-pending'}">
                                    ${isConfirmed ? '✅ Confirmó' : '⏳ Pendiente'}
                                </span>
                            </div>
                            ${filaDatos}
                            ${tagsPsicoHtml}
                        </div>
                        <div class="group-member-actions" onclick="event.stopPropagation();" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; flex-shrink:0;">
                            <button type="button" class="row-quick-btn secondary" onclick="window.enviarWhatsAppValidacionGrupo('${al.id}')" title="Mensaje WhatsApp">💬 WhatsApp</button>
                            <button type="button" class="row-quick-btn ${isConfirmed ? 'primary' : 'secondary'}" onclick="window.toggleValidacionAlumnoGrupo('${al.id}', ${!isConfirmed})" title="Marcar confirmacion">
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
        container.innerHTML = `<div style="padding:20px; color:var(--accent-red);">Error al cargar grupos en validacion: ${err.message}</div>`;
    }
}

export async function generarAlumnosPruebaMatch(setBotonCargandoFn) {
    const btn = document.getElementById('btn-mock-match-data');
    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btn, true);

    try {
        const suscDocs = await getDocs(collection(db, "tipos_suscripcion"));
        const listaSusc = [];
        suscDocs.forEach(d => listaSusc.push(d.data().nombre));

        const suscEnsamble = listaSusc.find(s => s.toLowerCase().includes('ensamble')) || 'Ensamble';
        const suscGrupal = listaSusc.find(s => s.toLowerCase().includes('grupal')) || 'Clases Grupales';
        const suscIndividual = listaSusc.find(s => s.toLowerCase().includes('individual')) || 'Clases Individuales';

        const now = new Date();
        const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

        const mockStudents = [
            {
                nombre: "Lucas Benitez (Test)",
                celular: "+54 9 11 5555-0101",
                edad: 25,
                nivel: "Inicial I",
                instrumento: ["Guitarra"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [{ inicio: "18:00", fin: "21:00" }],
                    M: [{ inicio: "18:00", fin: "21:00" }],
                    X: [{ inicio: "18:00", fin: "21:00" }],
                    J: [], V: [], S: []
                },
                historial: [{ id: Date.now() + 1, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Martina Rossi (Test)",
                celular: "+54 9 11 5555-0102",
                edad: 27,
                nivel: "Inicial I",
                instrumento: ["Bateria"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [],
                    M: [{ inicio: "18:00", fin: "21:00" }],
                    X: [{ inicio: "18:00", fin: "21:00" }],
                    J: [{ inicio: "18:00", fin: "21:00" }],
                    V: [], S: []
                },
                historial: [{ id: Date.now() + 2, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Santiago Diaz (Test)",
                celular: "+54 9 11 5555-0103",
                edad: 24,
                nivel: "Inicial I",
                instrumento: ["Bajo"],
                tipo_suscripcion: suscEnsamble,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [],
                    M: [{ inicio: "17:00", fin: "21:00" }],
                    X: [{ inicio: "17:00", fin: "21:00" }],
                    J: [], V: [], S: []
                },
                historial: [{ id: Date.now() + 3, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Valentina Gomez (Test Canto)",
                celular: "+54 9 11 5555-0201",
                edad: 32,
                nivel: "Inicial II",
                instrumento: ["Canto"],
                tipo_suscripcion: suscGrupal,
                estado_agenda: "Lista de espera",
                disponibilidad: {
                    L: [], M: [], X: [],
                    J: [{ inicio: "18:00", fin: "20:00" }],
                    V: [],
                    S: [{ inicio: "11:00", fin: "14:00" }]
                },
                historial: [{ id: Date.now() + 5, texto: "Alumno de prueba generado para Match.", fecha: fechaStr }]
            },
            {
                nombre: "Camila Vega (Test Canto)",
                celular: "+54 9 11 5555-0202",
                edad: 30,
                nivel: "Inicial II",
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
            {
                nombre: "Tomas Navarro (Test Nino)",
                celular: "+54 9 11 5555-0301",
                edad: 9,
                nivel: "Inicial I",
                instrumento: ["Bateria"],
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
                nombre: "Joaquin Paz (Test Nino)",
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
                nombre: "Emma Silva (Test Nina)",
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
            }
        ];

        for (let st of mockStudents) {
            await addDoc(collection(db, "alumnos"), st);
        }

        alert(`✅ Se crearon ${mockStudents.length} alumnos de prueba en Lista de Espera.`);
        
        const selSusc = document.getElementById('match-suscripcion');
        if (selSusc && suscEnsamble) {
            selSusc.value = suscEnsamble;
            adaptarFormularioPorSuscripcion(suscEnsamble);
        }

    } catch(e) {
        console.error("Error al generar alumnos de prueba:", e);
        alert("Error al generar alumnos de prueba: " + e.message);
    }

    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btn, false);
}

export async function generarAlumnosIndividualesPruebaMatch(setBotonCargandoFn) {
    const btn = document.getElementById('btn-mock-match-indiv');
    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btn, true);

    try {
        const suscDocs = await getDocs(collection(db, "tipos_suscripcion"));
        const listaSusc = [];
        suscDocs.forEach(d => listaSusc.push(d.data().nombre));

        const suscIndividual = listaSusc.find(s => s.toLowerCase().includes('individual')) || 'Clases Individuales';

        const now = new Date();
        const fechaStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;

        const mockIndividuales = [
            {
                nombre: "Nicolas Varela (Test Indiv)",
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
                nombre: "Paula Mendez (Test Indiv)",
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
                instrumento: ["Bateria"],
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

        alert("✅ Se cargaron 4 alumnos individuales de prueba en Lista de Espera.");

        const selSusc = document.getElementById('match-suscripcion');
        if (selSusc && suscIndividual) {
            selSusc.value = suscIndividual;
            adaptarFormularioPorSuscripcion(suscIndividual);
        }

    } catch(err) {
        console.error("Error al generar alumnos individuales de prueba:", err);
        alert("Error al generar alumnos: " + err.message);
    }

    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btn, false);
}

export async function limpiarAlumnosPruebaMatch(setBotonCargandoFn, cargarVistaFn) {
    if (!(await window.confirmar('Eliminar alumnos de prueba', 'Se eliminaran todos los registros de prueba. Esta accion no se puede deshacer.', 'Eliminar'))) return;
    const btn = document.getElementById('btn-limpiar-mock-data');
    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btn, true);

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
    } catch(e) {
        console.error("Error al eliminar pruebas:", e);
        alert("Error al eliminar pruebas: " + e.message);
    }
    if (typeof setBotonCargandoFn === 'function') setBotonCargandoFn(btn, false);
}

// Ventana global bindings
window.abrirModalDetalleGrupo = abrirModalDetalleGrupo;
window.abrirModalConfirmarMatchPorIndice = function(idx) {
    const grupo = matchGruposSugeridos[idx];
    if (grupo) abrirModalConfirmarMatch(grupo);
};
window.toggleValidacionAlumnoGrupo = async function(alumnoId, nuevoEstado) {
    try {
        await updateDoc(doc(db, "alumnos", alumnoId), {
            estado_validacion_alumno: nuevoEstado ? "confirmado" : "pendiente"
        });
        const cont = document.getElementById('lista-generica');
        if (cont) await renderMatchEnValidacion(cont);
    } catch(err) {
        alert('Error al actualizar validacion: ' + err.message);
    }
};

window.aprobarGrupoCompletoPrealta = async function(nombreGrupo) {
    if (!(await window.confirmar('Aprobar grupo', 'Todos sus integrantes pasarán a Altas Pendientes.', 'Aprobar Grupo'))) return;
    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Validando Grupo")));
        for (const d of qSnap.docs) {
            const data = d.data();
            if ((data.grupo_asignado || 'Clases Individuales') === nombreGrupo) {
                const hist = data.historial || [];
                const fnHist = window.crearEntradaHistorial || ((txt, tipo) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: tipo || 'sistema' }));
                hist.push(fnHist(`Validación grupal aprobada: Grupo "${nombreGrupo}" pasa a Altas Pendientes.`, 'match'));
                await updateDoc(doc(db, "alumnos", d.id), {
                    estado_agenda: "Pre-alta Pendiente",
                    estado_validacion_alumno: "confirmado",
                    historial: hist
                });
            }
        }
        alert(`✅ Grupo "${nombreGrupo}" aprobado con éxito. Pasó a Altas Pendientes.`);
        if (typeof window.cargarVistaGlobal === 'function') {
            await window.cargarVistaGlobal('Altas - Pendientes');
        }
    } catch(err) {
        alert('Error al aprobar grupo: ' + err.message);
    }
};

window.aprobarAlumnoIndividualPrealta = async function(alumnoId) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", alumnoId));
        if (!alDoc.exists()) return;
        const al = alDoc.data();
        if (!(await window.confirmar('Aprobar alumno', 'El alumno pasará a Altas Pendientes.', 'Aprobar'))) return;

        if (typeof window.mostrarIndicadorCarga === 'function') window.mostrarIndicadorCarga(`Aprobando a ${al.nombre}...`);
        try {
            const hist = al.historial || [];
            const fnHist = window.crearEntradaHistorial || ((txt, tipo) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: tipo || 'sistema' }));
            hist.push(fnHist(`Validación individual aprobada para ${al.grupo_asignado || 'clase'}. Pasa a Altas Pendientes.`, 'match'));

            await updateDoc(doc(db, "alumnos", alumnoId), {
                estado_agenda: "Pre-alta Pendiente",
                estado_validacion_alumno: "confirmado",
                historial: hist
            });

            if (typeof window.removerFilaOptimista === 'function') window.removerFilaOptimista(alumnoId);
            const cont = document.getElementById('lista-generica');
            if (cont) await renderMatchEnValidacion(cont);
            alert(`✅ ${al.nombre} aprobado a Altas Pendientes.`);
        } finally {
            if (typeof window.ocultarIndicadorCarga === 'function') window.ocultarIndicadorCarga();
        }
    } catch(err) {
        alert('Error al aprobar alumno: ' + err.message);
    }
};

window.rechazarAlumnoGrupoYVolverEspera = async function(alumnoId) {
    try {
        const alDoc = await getDoc(doc(db, "alumnos", alumnoId));
        if (!alDoc.exists()) return;
        const al = alDoc.data();
        if (!(await window.confirmar('Confirmar rechazo', 'El alumno volverá a Lista de Espera.', 'Confirmar rechazo'))) return;

        if (typeof window.mostrarIndicadorCarga === 'function') window.mostrarIndicadorCarga(`Moviendo a ${al.nombre} a Espera...`);
        try {
            const hist = al.historial || [];
            const fnHist = window.crearEntradaHistorial || ((txt, tipo) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: tipo || 'sistema' }));
            hist.push(fnHist(`Propuesta de grupo "${al.grupo_asignado || ''}" rechazada/no disponible. Vuelve a Lista de Espera.`, 'match'));

            await updateDoc(doc(db, "alumnos", alumnoId), {
                estado_agenda: "Lista de espera",
                grupo_asignado: "",
                estado_validacion_alumno: null,
                historial: hist
            });

            if (typeof window.removerFilaOptimista === 'function') window.removerFilaOptimista(alumnoId);
            const cont = document.getElementById('lista-generica');
            if (cont) await renderMatchEnValidacion(cont);
            alert(`↩️ ${al.nombre} volvió a Lista de Espera.`);
        } finally {
            if (typeof window.ocultarIndicadorCarga === 'function') window.ocultarIndicadorCarga();
        }
    } catch(err) {
        alert('Error al devolver alumno a lista de espera: ' + err.message);
    }
};

window.desarmarGrupoValidacion = async function(nombreGrupo) {
    if (!(await window.confirmar('Desarmar grupo', 'Todos los integrantes volverán a Lista de Espera.', 'Desarmar'))) return;
    if (typeof window.mostrarIndicadorCarga === 'function') window.mostrarIndicadorCarga(`Desarmando grupo "${nombreGrupo}"...`);
    try {
        const qSnap = await getDocs(query(collection(db, "alumnos"), where("estado_agenda", "==", "Validando Grupo")));

        for (const d of qSnap.docs) {
            const data = d.data();
            if ((data.grupo_asignado || 'Clases Individuales') === nombreGrupo) {
                const hist = data.historial || [];
                const fnHist = window.crearEntradaHistorial || ((txt, tipo) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: tipo || 'sistema' }));
                hist.push(fnHist(`Propuesta de grupo "${nombreGrupo}" desarmada. Alumno vuelve a Lista de Espera.`, 'match'));
                await updateDoc(doc(db, "alumnos", d.id), {
                    estado_agenda: "Lista de espera",
                    grupo_asignado: "",
                    estado_validacion_alumno: null,
                    historial: hist
                });
            }
        }
        const cont = document.getElementById('lista-generica');
        if (cont) await renderMatchEnValidacion(cont);
        alert(`↩️ Grupo "${nombreGrupo}" desarmado. Alumnos retornaron a Lista de Espera.`);
    } catch(err) {
        alert('Error al desarmar grupo: ' + err.message);
    } finally {
        if (typeof window.ocultarIndicadorCarga === 'function') window.ocultarIndicadorCarga();
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
        const inst = al.instrumento_asignado || (Array.isArray(al.instrumento) ? al.instrumento.join(', ') : (al.instrumento || 'musica'));
        const susc = al.tipo_suscripcion || 'tu suscripcion';
        const emojiInst = obtenerEmojiInstrumento(inst);

        const txt = `¡Hola ${al.nombre}! 🧩 Te escribo de Mandala Ensambles. Mi nombre es Nacho.
Tenemos armada una propuesta para ${susc} de ${emojiInst} ${inst} con el Profe *${prof}* los días *${hor}*.

¿Nos confirmás si te queda bien este horario para asegurar tu lugar e iniciar tu pre-alta? ¡Muchas gracias! 😊`;

        await navigator.clipboard.writeText(txt);
        alert(`📋 Mensaje copiado al portapapeles.\n\nAbriendo WhatsApp para ${al.nombre}...`);

        if (cel) {
            window.open(`https://wa.me/${cel}?text=${encodeURIComponent(txt)}`, '_blank');
        } else {
            alert('El alumno no tiene numero de celular registrado.');
        }
    } catch(err) {
        alert('Error al generar WhatsApp: ' + err.message);
    }
};

// =======================================================================
// SUGERENCIA AUTOMÁTICA Y SOLICITUDES DE PROFESORES
// =======================================================================
export function buscarAlumnosCandidatosParaSolicitud(solicitud, alumnosEspera) {
    return alumnosEspera.map(alumno => {
        let score = 0;
        let motivos = [];
        let alertas = [];

        // 1. Coincidencia de Instrumentos Multi-selección
        const instsPed = Array.isArray(solicitud.instrumentos) && solicitud.instrumentos.length > 0
            ? solicitud.instrumentos.map(i => (i || '').trim().toLowerCase())
            : (solicitud.instrumento ? solicitud.instrumento.split(',').map(s => s.trim().toLowerCase()) : []);

        const instsAl = Array.isArray(alumno.instrumento)
            ? alumno.instrumento.map(i => (i || '').trim().toLowerCase())
            : [(alumno.instrumento || '').trim().toLowerCase()];

        const coincideInst = instsPed.length === 0 || instsAl.some(i => instsPed.includes(i));
        if (coincideInst) {
            score += 40;
            const matchingInsts = instsAl.filter(i => instsPed.includes(i));
            motivos.push(`Instrumento coincidente (${matchingInsts.join(', ') || solicitud.instrumento})`);
        } else {
            alertas.push(`Instrumentos alumno: ${instsAl.join(', ') || 'Sin inst.'} vs Buscados: ${solicitud.instrumento}`);
        }

        // 2. Coincidencia de Niveles Multi-selección
        const nivelAl = (alumno.nivel || '').trim().toLowerCase();
        const nivelesPed = Array.isArray(solicitud.niveles) && solicitud.niveles.length > 0
            ? solicitud.niveles.map(n => (n || '').trim().toLowerCase())
            : (solicitud.nivel ? solicitud.nivel.split(',').map(s => s.trim().toLowerCase()) : []);

        const esNivelLibre = nivelesPed.length === 0 || nivelesPed.includes('cualquiera');
        const coincideNivel = esNivelLibre || nivelesPed.includes(nivelAl);

        if (coincideNivel) {
            score += 30;
            motivos.push(`Nivel coincidente (${alumno.nivel || 'Estándar'})`);
        } else {
            alertas.push(`Nivel alumno: ${alumno.nivel || 'Sin nivel'} vs Solicitados: ${solicitud.nivel || 'Cualquiera'}`);
        }

        // 3. Coincidencia de Disponibilidad Horaria en el día del grupo
        const diaSol = (solicitud.dia || '').trim().toUpperCase();
        const dispDia = alumno.disponibilidad && (alumno.disponibilidad[diaSol] || alumno.disponibilidad[solicitud.dia]);
        if (Array.isArray(dispDia) && dispDia.length > 0) {
            score += 30;
            motivos.push(`Disponible día ${solicitud.dia || diaSol}`);
        } else {
            alertas.push(`Sin disponibilidad declarada día ${solicitud.dia || diaSol}`);
        }

        return {
            alumno,
            score, // 0 a 100
            motivos,
            alertas,
            esMatchOptimo: score >= 70
        };
    }).filter(res => res.score >= 40)
      .sort((a, b) => b.score - a.score);
}

export async function renderMatchSolicitudesProfes(cont, configApp, callbacks = {}) {
    cont.innerHTML = `
        <div style="display:flex; justify-content:center; padding:40px 0;">
            <div class="skeleton-row" style="height:120px; width:100%; max-width:900px; border-radius:12px;"></div>
        </div>
    `;

    try {
        const solSnap = await getDocs(collection(db, "solicitudes_vacantes"));
        const solicitudes = [];
        solSnap.forEach(d => solicitudes.push({ id: d.id, ...d.data() }));

        const pendientes = solicitudes.filter(s => s.estado === 'Pendiente' || s.estado === 'En Proceso');
        const cubiertas = solicitudes.filter(s => s.estado === 'Cubierta' || s.estado === 'Cancelada');

        const rolActual = (window.usuarioActual?.rol || configApp?.usuarioActual?.rol || 'admin').toLowerCase();
        const puedeBuscar = ['admin', 'coordinador', 'admisor'].includes(rolActual);

        if (pendientes.length === 0 && cubiertas.length === 0) {
            cont.innerHTML = `
                <div style="background:white; border:1px solid var(--border-color); border-radius:12px; padding:40px 20px; text-align:center; color:var(--text-muted); max-width:900px; margin:0 auto;">
                    <div style="font-size:2.2em; margin-bottom:8px;">🔔</div>
                    <div style="font-weight:700; font-size:16px; color:var(--text-main);">No hay solicitudes de vacantes de profesores</div>
                    <div style="font-size:13px; margin-top:4px;">Cuando los docentes soliciten alumnos desde su portal aparecerán aquí para buscar matches en la Lista de Espera.</div>
                </div>
            `;
            return;
        }

        let html = `
            <div style="max-width:950px; width:100%; margin:0 auto; display:flex; flex-direction:column; gap:20px;">
                <!-- Header y barra de acciones masivas -->
                <div style="background:white; border:1px solid var(--border-color); border-radius:12px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
                    <div>
                        <h3 style="margin:0 0 4px 0; color:var(--text-main); font-size:1.3em; display:flex; align-items:center; gap:8px;">
                            <span>📩</span> Solicitudes de Profes (${pendientes.length})
                        </h3>
                        <div style="font-size:12.5px; color:var(--text-muted);">
                            Selecciona solicitudes para buscar candidatos con validación de horarios y Google Calendar.
                        </div>
                    </div>
                    ${puedeBuscar && pendientes.length > 0 ? `
                        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12.5px; font-weight:600; color:var(--text-main); margin:0;">
                                <input type="checkbox" id="chk-solicitudes-select-todas" style="accent-color:var(--accent-teal); width:16px; height:16px;">
                                Seleccionar todas
                            </label>
                            <button type="button" id="btn-sol-buscar-seleccionadas" class="btn-app btn-secondary" style="font-size:12px; height:34px; padding:0 14px; font-weight:700; background:#fff; color:var(--accent-teal); border:1px solid var(--accent-teal);" disabled>
                                🔍 Buscar Seleccionadas (<span id="sol-sel-count">0</span>)
                            </button>
                            <button type="button" id="btn-sol-buscar-todas" class="btn-app btn-primary" style="font-size:12px; height:34px; padding:0 14px; font-weight:700; background:var(--accent-teal); color:#fff;">
                                🔍 Buscar Todas las Solicitudes
                            </button>
                        </div>
                    ` : ''}
                </div>
        `;

        if (pendientes.length === 0) {
            html += `<div style="background:white; padding:20px; border-radius:10px; border:1px solid var(--border-color); color:var(--text-muted);">No hay solicitudes pendientes en este momento.</div>`;
        } else {
            html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">`;
            pendientes.forEach(sol => {
                const durMin = sol.duracionMinutos || (sol.tipoGrupo === 'Ensamble Mandalorian' ? 90 : 60);
                const durBadge = durMin === 90 
                    ? '<span class="status-badge" style="background:#f3e8ff; color:#7e22ce; font-weight:700; font-size:11px;">⏱️ 90 min (1.5h)</span>'
                    : '<span class="status-badge" style="background:#e0f2fe; color:#0369a1; font-weight:700; font-size:11px;">⏱️ 60 min</span>';

                const instsArray = sol.instrumentosArray || (sol.instrumento ? sol.instrumento.split(',').map(s => s.trim()) : []);
                const chipsInstHtml = instsArray.map(inst => {
                    const emoji = getEmojiParaInstrumento(inst);
                    return `<span class="match-student-tag" style="font-size:11.5px; font-weight:600;">${emoji} ${inst}</span>`;
                }).join(' ');

                const nivelesStr = sol.nivel || 'Cualquiera';

                html += `
                    <div class="match-card" style="display:flex; flex-direction:column; justify-content:space-between; padding:16px; border-radius:12px; border:1px solid var(--border-color); background:#ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.04); position:relative; min-height:260px; border-top:4px solid #e5a93d;">
                        <div>
                            <!-- Top: Checkbox, Nombre del Grupo/Clase y Estado -->
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:10px;">
                                <div style="display:flex; align-items:flex-start; gap:10px;">
                                    ${puedeBuscar ? `
                                        <input type="checkbox" class="chk-solicitud-item" data-id="${sol.id}" style="width:18px; height:18px; cursor:pointer; accent-color:var(--accent-teal); margin-top:2px;">
                                    ` : ''}
                                    <div>
                                        <div style="font-family:monospace; font-size:16px; font-weight:800; color:var(--accent-teal); line-height:1.2;">${sol.grupoNombre}</div>
                                        <div style="font-size:12px; color:var(--text-muted); margin-top:3px;">
                                            👨‍🏫 Profe: <strong style="color:var(--text-main);">${sol.profesorNombre}</strong>
                                        </div>
                                    </div>
                                </div>
                                <span class="status-val-pending" style="font-size:11px; font-weight:700;">⏳ ${sol.estado}</span>
                            </div>

                            <!-- Badges de Tipo y Duración -->
                            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
                                <span class="status-badge" style="background:#fef3c7; color:#92400e; font-weight:700; font-size:11px;">${sol.tipoGrupo || 'Grupo'}</span>
                                ${durBadge}
                            </div>

                            <!-- FECHA / HORARIO -->
                            <div style="background:#f0fdfa; border:1px solid #ccfbf1; border-radius:8px; padding:7px 10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="font-size:14px;">📅</span>
                                    <div>
                                        <div style="font-weight:700; font-size:12.5px; color:var(--accent-teal);">${sol.horario || 'Sin horario'}</div>
                                        ${sol.fechaCreacion ? `<div style="font-size:10px; color:var(--text-muted);">Creada: ${new Date(sol.fechaCreacion).toLocaleDateString()}</div>` : ''}
                                    </div>
                                </div>
                            </div>

                            <!-- Instrumentos, Niveles y Edad -->
                            <div style="background:#f8fafc; border-radius:8px; padding:8px 10px; margin-bottom:10px; font-size:11.5px;">
                                <div style="color:var(--text-muted); margin-bottom:4px; font-weight:600;">🎯 Requisitos:</div>
                                <div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
                                    ${chipsInstHtml}
                                    <span class="match-student-tag nivel" style="font-size:11px;">📚 ${nivelesStr}</span>
                                    ${(sol.rangoEdadTexto || (sol.edadMin || sol.edadMax)) ? `<span class="match-chip" style="background:#fdf2f8; color:#be185d; font-size:11px; padding:2px 7px; border-radius:6px; font-weight:700;">🎂 ${sol.rangoEdadTexto || ((sol.edadMin && sol.edadMax) ? `${sol.edadMin}-${sol.edadMax} años` : (sol.edadMin ? `≥ ${sol.edadMin} años` : `≤ ${sol.edadMax} años`))}</span>` : ''}
                                </div>
                            </div>

                            <!-- Observaciones (si existen) -->
                            ${sol.observaciones ? `
                                <div style="font-size:11.5px; color:var(--text-muted); background:var(--hover-bg); padding:6px 10px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:10px; font-style:italic;">
                                    📝 "${sol.observaciones}"
                                </div>
                            ` : ''}
                        </div>

                        <!-- Footer con Botones de Acción -->
                        <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid #f1f5f9; padding-top:10px; gap:8px; margin-top:8px;">
                            <div style="display:flex; gap:6px;">
                                <button type="button" class="btn-app btn-secondary btn-editar-sol-directo" data-id="${sol.id}" style="font-size:11.5px; padding:4px 8px; height:30px;" title="Editar solicitud">
                                    ✏️ Editar
                                </button>
                                <button type="button" class="btn-app btn-secondary btn-eliminar-sol-directo" data-id="${sol.id}" data-grupo="${sol.grupoNombre}" style="font-size:11.5px; padding:4px 8px; height:30px; color:var(--accent-red); border-color:#fca5a5;" title="Eliminar solicitud">
                                    🗑️
                                </button>
                            </div>
                            ${puedeBuscar ? `
                                <button type="button" class="btn-primary btn-buscar-matches-sol" data-id="${sol.id}" style="font-size:11.5px; padding:5px 12px; height:30px; font-weight:700;">
                                    🔍 Buscar Matches
                                </button>
                            ` : `
                                <span style="font-size:11.5px; color:var(--text-muted); font-style:italic;">Solo Coordinación</span>
                            `}
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        if (cubiertas.length > 0) {
            html += `
                <div style="margin-top:20px;">
                    <h4 style="color:var(--text-muted); font-size:1.1em; margin-bottom:10px;">✅ Solicitudes Cubiertas / Historial (${cubiertas.length})</h4>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${cubiertas.map(sol => `
                            <div style="background:white; border:1px solid var(--border-color); border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; opacity:0.85;">
                                <div>
                                    <strong style="color:var(--text-main); font-size:13px;">${sol.instrumento} para ${sol.grupoNombre}</strong>
                                    <div style="font-size:11.5px; color:var(--text-muted);">Profe ${sol.profesorNombre} • Asignado a: <strong>${sol.alumnoAsignadoNombre || 'Alumno'}</strong></div>
                                </div>
                                <span class="status-val-ok">✅ Cubierta</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        cont.innerHTML = html;

        // Listeners individuales de búsqueda directa
        cont.querySelectorAll('.btn-buscar-matches-sol').forEach(btn => {
            btn.addEventListener('click', async () => {
                const solId = btn.getAttribute('data-id');
                btn.disabled = true;
                btn.textContent = 'Buscando...';
                await activarBusquedaMatchPorSolicitudDirecta(solId, callbacks);
            });
        });

        // Listeners para Editar y Eliminar desde la Ficha
        cont.querySelectorAll('.btn-click-fecha-sol, .btn-editar-sol-directo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const solId = btn.getAttribute('data-id');
                const sol = pendientes.find(s => s.id === solId);
                abrirModalSolicitudVacante(sol || solId, () => renderMatchSolicitudesProfes(cont, configApp, callbacks));
            });
        });

        cont.querySelectorAll('.btn-eliminar-sol-directo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const solId = btn.getAttribute('data-id');
                const grp = btn.getAttribute('data-grupo');
                eliminarSolicitudVacanteDirecto(solId, grp, () => renderMatchSolicitudesProfes(cont, configApp, callbacks));
            });
        });

        // Bulk selection
        const chkSelectTodas = document.getElementById('chk-solicitudes-select-todas');
        const btnBuscarSeleccionadas = document.getElementById('btn-sol-buscar-seleccionadas');
        const btnBuscarTodas = document.getElementById('btn-sol-buscar-todas');
        const countSpan = document.getElementById('sol-sel-count');

        const actualizarEstadoBulk = () => {
            const chks = Array.from(cont.querySelectorAll('.chk-solicitud-item:checked'));
            if (countSpan) countSpan.textContent = chks.length;
            if (btnBuscarSeleccionadas) {
                btnBuscarSeleccionadas.disabled = (chks.length === 0);
            }
        };

        chkSelectTodas?.addEventListener('change', (e) => {
            cont.querySelectorAll('.chk-solicitud-item').forEach(c => c.checked = e.target.checked);
            actualizarEstadoBulk();
        });

        cont.querySelectorAll('.chk-solicitud-item').forEach(c => {
            c.addEventListener('change', actualizarEstadoBulk);
        });

        btnBuscarSeleccionadas?.addEventListener('click', async () => {
            const chks = Array.from(cont.querySelectorAll('.chk-solicitud-item:checked'));
            const ids = chks.map(c => c.getAttribute('data-id'));
            if (ids.length > 0) {
                btnBuscarSeleccionadas.disabled = true;
                btnBuscarSeleccionadas.textContent = 'Buscando...';
                await activarBusquedaMatchPorSolicitudDirecta(ids, callbacks);
            }
        });

        btnBuscarTodas?.addEventListener('click', async () => {
            btnBuscarTodas.disabled = true;
            btnBuscarTodas.textContent = 'Buscando...';
            await activarBusquedaMatchPorSolicitudDirecta('todas', callbacks);
        });

    } catch(err) {
        cont.innerHTML = `<div style="color:var(--accent-red); padding:30px; text-align:center; font-weight:700;">Error al cargar solicitudes de profesores: ${err.message}</div>`;
    }
}