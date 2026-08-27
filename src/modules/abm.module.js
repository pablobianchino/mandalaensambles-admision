// =======================================================================
// src/modules/abm.module.js -- ABM Profesores, Instrumentos, Suscripciones, Usuarios y Config
// =======================================================================

import { defaultCfg } from "../config/constants.js";
import { formatearPrecioMoneda } from "./altas.module.js";
import { 
    db, 
    collection, 
    getDocs, 
    getDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    addDoc 
} from "../config/firebase.js";
import {
    poblarDisponibilidadMultiRango,
    extraerDisponibilidadMultiRango,
    normalizarHora
} from "../ui/horarios.ui.js";

export function renderConfigHub(cont, callbacks = {}) {
    cont.innerHTML = `
        <div style="max-width:800px; width:100%; padding:20px;">
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="window.cargarVistaGlobal('Ajustes Generales')"><span style="font-size:1.5em; opacity:0.7;">⚙️</span><div><strong style="color:var(--text-main);">Ajustes Generales</strong><div style="font-size:12px; color:var(--text-muted);">Límites, calendarios y textos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="window.cargarVistaGlobal('Ajustes Match')"><span style="font-size:1.5em; opacity:0.7;">🧩</span><div><strong style="color:var(--text-main);">Ajustes de Match</strong><div style="font-size:12px; color:var(--text-muted);">Límites de integrantes y reglas de edad para grupos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="window.cargarVistaGlobal('ABM-Usuarios')"><span style="font-size:1.5em; opacity:0.7;">👥</span><div><strong style="color:var(--text-main);">Usuarios y Profesores</strong><div style="font-size:12px; color:var(--text-muted);">Administrar accesos, roles, docentes, disponibilidades y skills.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="window.cargarVistaGlobal('ABM-Instrumentos')"><span style="font-size:1.5em; opacity:0.7;">🎸</span><div><strong style="color:var(--text-main);">Instrumentos</strong></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="window.cargarVistaGlobal('ABM-Suscripciones')"><span style="font-size:1.5em; opacity:0.7;">🎫</span><div><strong style="color:var(--text-main);">Suscripciones</strong></div></div>
        </div>`;
}

export async function renderConfig(cont, configApp = defaultCfg, callbacks = {}) { 
    const { setBotonCargando, cargarConfig } = callbacks;
    let cfgSnap;
    try {
        cfgSnap = await getDoc(doc(db, "configuracion", "general"));
    } catch(e) {}
    const currentCfg = (cfgSnap && cfgSnap.exists()) ? { ...defaultCfg, ...cfgSnap.data() } : configApp;

    let tagsList = Array.isArray(currentCfg.perfil_psicologico_opciones) && currentCfg.perfil_psicologico_opciones.length > 0 
        ? [...currentCfg.perfil_psicologico_opciones] 
        : ['😊 Buena onda', '🙈 Tímido', '🎉 Extrovertido', '🦄 Raro', '🗣️ Muy hablador', '🌱 Humilde'];

    const renderTagsAdmin = () => {
        const wrap = document.getElementById('cfg-tags-admin-list');
        if (!wrap) return;
        wrap.innerHTML = tagsList.map((tag, idx) => `
            <span style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; background:var(--hover-bg); border:1px solid var(--border-color); border-radius:20px; font-size:12.5px; font-weight:600; color:var(--text-main);">
                ${tag}
                <button type="button" class="btn-del-tag-cfg" data-idx="${idx}" style="background:none; border:none; color:var(--accent-red); cursor:pointer; font-weight:bold; padding:0 2px; font-size:14px;" title="Eliminar etiqueta">✕</button>
            </span>
        `).join('');
    };

    cont.innerHTML = `
        <div style="margin-bottom:20px; font-size:0.9em; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
                <span style="cursor:pointer; color:var(--accent-teal);" onclick="window.cargarVistaGlobal('Configuración')">Configuración</span> &gt; <strong style="color:var(--text-main);">Ajustes Generales</strong>
            </div>
            <div style="display:flex; gap:8px;">
                <button type="button" id="btn-cfg-expand-all" style="padding:5px 12px; font-size:11.5px; border-radius:8px; border:1px solid var(--border-color); background:#fff; cursor:pointer; font-weight:600; color:var(--text-muted);">Expandir Todo</button>
                <button type="button" id="btn-cfg-collapse-all" style="padding:5px 12px; font-size:11.5px; border-radius:8px; border:1px solid var(--border-color); background:#fff; cursor:pointer; font-weight:600; color:var(--text-muted);">Colapsar Todo</button>
            </div>
        </div>

        <div style="max-width:850px; display:flex; flex-direction:column; gap:15px;">

            <!-- SECCIÓN 1: GENERALES -->
            <div class="cfg-accordion-card">
                <div class="cfg-accordion-header" data-target="cfg-sec-generales">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.2em;">⚙️</span>
                        <span style="font-size:1.05em; font-weight:700; color:var(--text-main);">1. Generales</span>
                    </div>
                    <span class="cfg-accordion-arrow" id="arrow-cfg-sec-generales">▼</span>
                </div>
                <div id="cfg-sec-generales" class="cfg-accordion-body" style="display:block;">
                    <h4 style="margin:0 0 12px 0; color:var(--text-main); font-size:0.95em; text-transform:uppercase; letter-spacing:0.04em;">Datos generales de la escuela</h4>
                    <div style="display:flex; gap:15px; margin-bottom:18px; flex-wrap:wrap;">
                        <div style="flex:1; min-width:140px;"><label style="font-size:12px; font-weight:600; color:var(--text-muted);">Hora Apertura:<input type="time" id="cfg-apertura" class="modern-input" value="${currentCfg.hora_apertura||'09:00'}"></label></div>
                        <div style="flex:1; min-width:140px;"><label style="font-size:12px; font-weight:600; color:var(--text-muted);">Hora Cierre:<input type="time" id="cfg-cierre" class="modern-input" value="${currentCfg.hora_cierre||'22:00'}"></label></div>
                        <div style="flex:1; min-width:140px;"><label style="font-size:12px; font-weight:600; color:var(--text-muted);">Aulas totales:<input type="number" id="cfg-aulas" class="modern-input" value="${currentCfg.cantidad_aulas||'3'}"></label></div>
                        <div style="flex:1; min-width:140px;"><label style="font-size:12px; font-weight:600; color:var(--text-muted);">Baterías totales:<input type="number" id="cfg-bats" class="modern-input" value="${currentCfg.cantidad_baterias||'2'}"></label></div>
                    </div>

                    <div style="border-top:1px solid var(--border-color); padding-top:16px; margin-top:16px;">
                        <h4 style="margin:0 0 6px 0; color:var(--text-main); font-size:0.95em; text-transform:uppercase; letter-spacing:0.04em;">🧠 Opciones de Perfil Psicológico / Emocional</h4>
                        <p style="color:var(--text-muted); font-size:0.85em; margin:0 0 12px 0;">Etiquetas que el evaluador puede seleccionar al cargar el informe o finalizar la admisión.</p>
                        <div id="cfg-tags-admin-list" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;"></div>
                        <div style="display:flex; gap:10px; max-width:420px;">
                            <input type="text" id="cfg-new-tag-input" class="modern-input" placeholder="Nueva etiqueta (ej: ⚡ Enérgico)...">
                            <button type="button" id="btn-add-tag-cfg" class="btn-primary" style="white-space:nowrap; padding:0 16px;">+ Agregar</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SECCIÓN 2: CALENDARIO -->
            <div class="cfg-accordion-card">
                <div class="cfg-accordion-header" data-target="cfg-sec-calendario">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.2em;">📅</span>
                        <span style="font-size:1.05em; font-weight:700; color:var(--text-main);">2. Calendario</span>
                    </div>
                    <span class="cfg-accordion-arrow" id="arrow-cfg-sec-calendario">▶</span>
                </div>
                <div id="cfg-sec-calendario" class="cfg-accordion-body" style="display:none;">
                    <h4 style="margin:0 0 12px 0; color:var(--text-main); font-size:0.95em; text-transform:uppercase; letter-spacing:0.04em;">Calendario y Emojis</h4>
                    <label style="margin-bottom:15px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Calendario por Defecto:
                        <input type="email" id="cfg-cal-defecto" class="modern-input" value="${currentCfg.calendario_por_defecto||''}" placeholder="productora.mandalahouse@gmail.com">
                    </label>
                    <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:8px;">Emojis por Instrumento:</label>
                    <div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;">
                        <div style="width:75px;"><label style="font-size:11px;">Batería:<input type="text" id="cfg-idbat" class="modern-input" style="text-align:center;" value="${currentCfg.identificador_bateria||'🥁'}"></label></div>
                        <div style="width:75px;"><label style="font-size:11px;">Guitarra:<input type="text" id="cfg-em-gui" class="modern-input" style="text-align:center;" value="${currentCfg.emoji_guitarra||'🎸'}"></label></div>
                        <div style="width:75px;"><label style="font-size:11px;">Cajón:<input type="text" id="cfg-em-caj" class="modern-input" style="text-align:center;" value="${currentCfg.emoji_cajon||'📦'}"></label></div>
                        <div style="width:75px;"><label style="font-size:11px;">Canto:<input type="text" id="cfg-em-can" class="modern-input" style="text-align:center;" value="${currentCfg.emoji_canto||'🎤'}"></label></div>
                        <div style="width:75px;"><label style="font-size:11px;">Piano:<input type="text" id="cfg-em-pia" class="modern-input" style="text-align:center;" value="${currentCfg.emoji_piano||'🎹'}"></label></div>
                        <div style="width:75px;"><label style="font-size:11px;">Bajo:<input type="text" id="cfg-em-baj" class="modern-input" style="text-align:center;" value="${currentCfg.emoji_bajo||'🎸'}"></label></div>
                    </div>

                    <div style="border-top:1px solid var(--border-color); padding-top:16px;">
                        <label style="margin-bottom:14px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Título para evento de reserva:
                            <input type="text" id="cfg-evt-res" class="modern-input" value="${currentCfg.formato_evento_reserva||''}">
                        </label>
                        <label style="margin-bottom:5px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Título para evento confirmado:
                            <input type="text" id="cfg-evt-conf" class="modern-input" value="${currentCfg.formato_evento_confirmado||''}">
                        </label>
                    </div>
                </div>
            </div>

            <!-- SECCIÓN 3: ADMISIÓN (ENTREVISTAS) -->
            <div class="cfg-accordion-card">
                <div class="cfg-accordion-header" data-target="cfg-sec-admision-entrevistas">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.2em;">📋</span>
                        <span style="font-size:1.05em; font-weight:700; color:var(--text-main);">3. Admisión (entrevistas)</span>
                    </div>
                    <span class="cfg-accordion-arrow" id="arrow-cfg-sec-admision-entrevistas">▶</span>
                </div>
                <div id="cfg-sec-admision-entrevistas" class="cfg-accordion-body" style="display:none;">
                    <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;">
                        <div style="flex:2; min-width:200px;">
                            <label style="font-size:12px; font-weight:600; color:var(--text-muted);">Nombre predefinido para agendar en WS:
                                <input type="text" id="cfg-nombre-agendar" class="modern-input" value="${currentCfg.texto_nombre_agendar||''}">
                            </label>
                        </div>
                        <div style="flex:1; min-width:140px;">
                            <label style="font-size:12px; font-weight:600; color:var(--text-muted);">Valor de clase de admisión:
                                <input type="text" id="cfg-valor" class="modern-input" value="${currentCfg.valor_clase||''}">
                            </label>
                        </div>
                    </div>

                    <label style="margin-bottom:14px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Texto predefinido para Docente (múltiples fechas):
                        <textarea id="cfg-txt-opt-mul" class="modern-input" style="height:150px; font-family:monospace; font-size:12px;">${currentCfg.texto_opciones_multiples || ''}</textarea>
                    </label>
                    <label style="margin-bottom:14px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Texto predefinido para Docente (una opción de fecha):
                        <textarea id="cfg-txt-p" class="modern-input" style="height:130px; font-family:monospace; font-size:12px;">${currentCfg.texto_profe || ''}</textarea>
                    </label>
                    <label style="margin-bottom:14px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Texto de propuesta de reserva de agenda para Alumno:
                        <textarea id="cfg-txt-alumno" class="modern-input" style="height:130px; font-family:monospace; font-size:12px;">${currentCfg.texto_alumno || ''}</textarea>
                    </label>
                    <label style="margin-bottom:14px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Texto para confirmar reserva a Alumno:
                        <textarea id="cfg-txt-conf-a" class="modern-input" style="height:130px; font-family:monospace; font-size:12px;">${currentCfg.texto_conf_alumno || ''}</textarea>
                    </label>
                    <label style="margin-bottom:5px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Texto de cancelación de reserva/agenda para Docente:
                        <textarea id="cfg-txt-cancela" class="modern-input" style="height:110px; font-family:monospace; font-size:12px;">${currentCfg.texto_cancela_alumno || ''}</textarea>
                    </label>
                </div>
            </div>

            <!-- SECCIÓN 4: ADMISIÓN (PRE-ALTA) -->
            <div class="cfg-accordion-card">
                <div class="cfg-accordion-header" data-target="cfg-sec-admision-prealta">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.2em;">🚀</span>
                        <span style="font-size:1.05em; font-weight:700; color:var(--text-main);">4. Admisión (pre-alta)</span>
                    </div>
                    <span class="cfg-accordion-arrow" id="arrow-cfg-sec-admision-prealta">▶</span>
                </div>
                <div id="cfg-sec-admision-prealta" class="cfg-accordion-body" style="display:none;">
                    <label style="margin-bottom:14px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Texto de aviso de pre-alta iniciada para Docente:
                        <textarea id="cfg-txt-prealta" class="modern-input" style="height:140px; font-family:monospace; font-size:12px;">${currentCfg.texto_prealta || ''}</textarea>
                    </label>
                    <label style="margin-bottom:14px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Texto de aviso de pre-alta para Alumno:
                        <textarea id="cfg-txt-prealta-alumno" class="modern-input" style="height:170px; font-family:monospace; font-size:12px;">${currentCfg.texto_prealta_alumno || ''}</textarea>
                    </label>
                    <label style="margin-bottom:5px; display:block; font-size:12px; font-weight:600; color:var(--text-muted);">Texto de aviso de pre-alta finalizada para docente:
                        <textarea id="cfg-txt-alta-conf" class="modern-input" style="height:140px; font-family:monospace; font-size:12px;">${currentCfg.texto_alta_confirmada || ''}</textarea>
                    </label>
                </div>
            </div>

            <!-- SECCIÓN 5: ARANCELES -->
            <div class="cfg-accordion-card">
                <div class="cfg-accordion-header" data-target="cfg-sec-aranceles">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.2em;">💵</span>
                        <span style="font-size:1.05em; font-weight:700; color:var(--text-main);">5. Aranceles</span>
                    </div>
                    <span class="cfg-accordion-arrow" id="arrow-cfg-sec-aranceles">▶</span>
                </div>
                <div id="cfg-sec-aranceles" class="cfg-accordion-body" style="display:none;">
                    <p style="color:var(--text-muted); font-size:0.9em; margin:0 0 16px 0;">En esta sección se ingresará el valor del arancel de las clases para su posterior utilización en mensajes y altas.</p>
                    
                    <h4 style="margin:0 0 10px 0; color:var(--text-main); font-size:0.95em; text-transform:uppercase; letter-spacing:0.04em;">Clases Individuales</h4>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
                        <label style="font-size:12px; font-weight:600; color:var(--text-muted);">Clase suelta:
                            <input type="text" id="cfg-arancel-ind-suelta" class="modern-input cfg-arancel-input" value="${formatearPrecioMoneda(currentCfg.arancel_individual_suelta)}" placeholder="Ej: $15.000">
                        </label>
                        <label style="font-size:12px; font-weight:600; color:var(--text-muted);">Quincenal:
                            <input type="text" id="cfg-arancel-ind-quincenal" class="modern-input cfg-arancel-input" value="${formatearPrecioMoneda(currentCfg.arancel_individual_quincenal)}" placeholder="Ej: $25.000">
                        </label>
                        <label style="font-size:12px; font-weight:600; color:var(--text-muted);">Full Pack:
                            <input type="text" id="cfg-arancel-ind-fullpack" class="modern-input cfg-arancel-input" value="${formatearPrecioMoneda(currentCfg.arancel_individual_fullpack)}" placeholder="Ej: $45.000">
                        </label>
                        <label style="font-size:12px; font-weight:600; color:var(--text-muted);">Full Pack (comunidad/antiguos):
                            <input type="text" id="cfg-arancel-ind-fullpack-comunidad" class="modern-input cfg-arancel-input" value="${formatearPrecioMoneda(currentCfg.arancel_individual_fullpack_comunidad)}" placeholder="Ej: $40.000">
                        </label>
                    </div>

                    <div style="border-top:1px solid var(--border-color); padding-top:16px;">
                        <h4 style="margin:0 0 10px 0; color:var(--text-main); font-size:0.95em; text-transform:uppercase; letter-spacing:0.04em;">Ensamble y Clases Grupales</h4>
                        <div style="background:var(--hover-bg); border:1px solid var(--border-color); border-radius:8px; padding:14px; margin-top:8px; margin-bottom:12px;">
                            <strong style="font-size:13px; color:var(--text-main); display:block; margin-bottom:10px;">🎸 Ensamble</strong>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
                                <label style="font-size:12px; font-weight:600; color:var(--text-muted);">Valor:
                                    <input type="text" id="cfg-arancel-ens-regular" class="modern-input cfg-arancel-input" value="${formatearPrecioMoneda(currentCfg.arancel_ensamble_regular)}" placeholder="Ej: $28.000">
                                </label>
                            </div>
                        </div>
                        <div style="background:var(--hover-bg); border:1px solid var(--border-color); border-radius:8px; padding:14px;">
                            <strong style="font-size:13px; color:var(--text-main); display:block; margin-bottom:10px;">🎸 Ensamble Mandalorian</strong>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
                                <label style="font-size:12px; font-weight:600; color:var(--text-muted);">Valor actual:
                                    <input type="text" id="cfg-arancel-ens-actual" class="modern-input cfg-arancel-input" value="${formatearPrecioMoneda(currentCfg.arancel_ensamble_actual)}" placeholder="Ej: $35.000">
                                </label>
                                <label style="font-size:12px; font-weight:600; color:var(--text-muted);">Valor comunidad/antiguos:
                                    <input type="text" id="cfg-arancel-ens-comunidad" class="modern-input cfg-arancel-input" value="${formatearPrecioMoneda(currentCfg.arancel_ensamble_comunidad)}" placeholder="Ej: $30.000">
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- BOTÓN GUARDAR GLOBAL -->
            <div style="margin-top:10px;">
                <button id="btn-guardar-cfg" class="btn-primary" style="width:100%; padding:14px; font-size:14px; font-weight:700;">💾 Guardar Ajustes Generales</button>
            </div>

        </div>`; 

    renderTagsAdmin();

    // Toggle de Acordeones
    cont.querySelectorAll('.cfg-accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.getAttribute('data-target');
            const body = document.getElementById(targetId);
            const arrow = document.getElementById(`arrow-${targetId}`);
            if (!body) return;
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'block' : 'none';
            if (arrow) arrow.textContent = isHidden ? '▼' : '▶';
        });
    });

    // Botones Expandir / Colapsar Todo
    document.getElementById('btn-cfg-expand-all')?.addEventListener('click', () => {
        cont.querySelectorAll('.cfg-accordion-body').forEach(b => b.style.display = 'block');
        cont.querySelectorAll('.cfg-accordion-arrow').forEach(a => a.textContent = '▼');
    });
    document.getElementById('btn-cfg-collapse-all')?.addEventListener('click', () => {
        cont.querySelectorAll('.cfg-accordion-body').forEach(b => b.style.display = 'none');
        cont.querySelectorAll('.cfg-accordion-arrow').forEach(a => a.textContent = '▶');
    });

    const autoGuardarTags = async () => {
        try {
            await setDoc(doc(db, "configuracion", "general"), { perfil_psicologico_opciones: tagsList }, { merge: true });
            if (typeof configApp === 'object') {
                configApp.perfil_psicologico_opciones = [...tagsList];
            }
            if (typeof cargarConfig === 'function') await cargarConfig();
        } catch(e) {}
    };

    const handleAddTag = async () => {
        const inp = document.getElementById('cfg-new-tag-input');
        const val = (inp?.value || '').trim();
        if (val && !tagsList.includes(val)) {
            tagsList.push(val);
            inp.value = '';
            renderTagsAdmin();
            await autoGuardarTags();
            alert(`Etiqueta "${val}" agregada y guardada.`, 'success');
        }
    };

    document.getElementById('btn-add-tag-cfg')?.addEventListener('click', handleAddTag);
    document.getElementById('cfg-new-tag-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTag();
        }
    });

    document.getElementById('cfg-tags-admin-list')?.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-del-tag-cfg')) {
            const idx = parseInt(e.target.dataset.idx, 10);
            if (!isNaN(idx)) {
                const [removed] = tagsList.splice(idx, 1);
                renderTagsAdmin();
                await autoGuardarTags();
                alert(`Etiqueta "${removed}" eliminada.`, 'warning');
            }
        }
    });

    document.getElementById('btn-guardar-cfg')?.addEventListener('click', async (e) => { 
        if (typeof setBotonCargando === 'function') setBotonCargando(e.target, true, 'Guardando ajustes...'); 
        const updatedData = { 
            hora_apertura: normalizarHora(document.getElementById('cfg-apertura')?.value, '09:00'), 
            hora_cierre: normalizarHora(document.getElementById('cfg-cierre')?.value, '22:00'), 
            cantidad_aulas: document.getElementById('cfg-aulas')?.value || '3', 
            cantidad_baterias: document.getElementById('cfg-bats')?.value || '2', 
            identificador_bateria: document.getElementById('cfg-idbat')?.value || '🥁', 
            emoji_guitarra: document.getElementById('cfg-em-gui')?.value || '🎸', 
            emoji_cajon: document.getElementById('cfg-em-caj')?.value || '📦', 
            emoji_canto: document.getElementById('cfg-em-can')?.value || '🎤', 
            emoji_piano: document.getElementById('cfg-em-pia')?.value || '🎹', 
            emoji_bajo: document.getElementById('cfg-em-baj')?.value || '🎸', 
            calendario_por_defecto: document.getElementById('cfg-cal-defecto')?.value || '', 
            valor_clase: document.getElementById('cfg-valor')?.value || '', 
            formato_evento_reserva: document.getElementById('cfg-evt-res')?.value || '', 
            formato_evento_confirmado: document.getElementById('cfg-evt-conf')?.value || '', 
            texto_nombre_agendar: document.getElementById('cfg-nombre-agendar')?.value || '', 
            texto_opciones_multiples: document.getElementById('cfg-txt-opt-mul')?.value || '', 
            texto_profe: document.getElementById('cfg-txt-p')?.value || '', 
            texto_alumno: document.getElementById('cfg-txt-alumno')?.value || '',
            texto_conf_alumno: document.getElementById('cfg-txt-conf-a')?.value || '', 
            texto_cancela_alumno: document.getElementById('cfg-txt-cancela')?.value || '', 
            texto_prealta: document.getElementById('cfg-txt-prealta')?.value || '', 
            texto_prealta_alumno: document.getElementById('cfg-txt-prealta-alumno')?.value || '',
            texto_alta_confirmada: document.getElementById('cfg-txt-alta-conf')?.value || '',
            arancel_individual_suelta: formatearPrecioMoneda(document.getElementById('cfg-arancel-ind-suelta')?.value || ''),
            arancel_individual_quincenal: formatearPrecioMoneda(document.getElementById('cfg-arancel-ind-quincenal')?.value || ''),
            arancel_individual_fullpack: formatearPrecioMoneda(document.getElementById('cfg-arancel-ind-fullpack')?.value || ''),
            arancel_individual_fullpack_comunidad: formatearPrecioMoneda(document.getElementById('cfg-arancel-ind-fullpack-comunidad')?.value || ''),
            arancel_ensamble_regular: formatearPrecioMoneda(document.getElementById('cfg-arancel-ens-regular')?.value || ''),
            arancel_ensamble_actual: formatearPrecioMoneda(document.getElementById('cfg-arancel-ens-actual')?.value || ''),
            arancel_ensamble_comunidad: formatearPrecioMoneda(document.getElementById('cfg-arancel-ens-comunidad')?.value || ''),
            perfil_psicologico_opciones: tagsList
        };
        await setDoc(doc(db, "configuracion", "general"), updatedData, { merge: true }); 
        if (typeof configApp === 'object') {
            Object.assign(configApp, updatedData);
        }
        if (typeof cargarConfig === 'function') await cargarConfig(); 
        if (typeof setBotonCargando === 'function') setBotonCargando(e.target, false); 
        alert('✅ Configuración guardada correctamente.'); 
    }); 

    // Auto-formateo en vivo de los inputs de aranceles
    cont.querySelectorAll('.cfg-arancel-input').forEach(inp => {
        inp.addEventListener('blur', () => {
            if (inp.value) inp.value = formatearPrecioMoneda(inp.value);
        });
    }); 
}

export function renderConfigMatch(cont, configApp = defaultCfg, callbacks = {}) {
    const { setBotonCargando, cargarConfig } = callbacks;
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
            <span style="cursor:pointer; color:var(--accent-teal);" onclick="window.cargarVistaGlobal('Configuración')">Configuración</span> &gt; <strong style="color:var(--text-main);">Ajustes de Match</strong>
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
                <h3 style="margin-top:0; color:var(--text-main); font-size:1.2em; margin-bottom:6px;">🧒 Grupos de Niños (&lt; 13 años)</h3>
                <p style="color:var(--text-muted); font-size:0.9em; margin:0 0 12px 0;">Comportamiento para menores de 13 años.</p>
                <label style="cursor:pointer; font-weight:600; display:flex; align-items:center; gap:8px; text-transform:none; margin:0; color:var(--text-main);">
                    <input type="checkbox" id="cfg-ninos-libre" ${ninosCfg.libre ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--accent-teal);">
                    Rango libre (sin restricción de edad mínima entre niños &lt; 13)
                </label>
            </div>

            <div style="border-top:1px solid var(--border-color); padding-top:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div>
                        <h3 style="margin-top:0; color:var(--text-main); font-size:1.2em;">📊 Reglas de Tolerancia de Edad (Adultos)</h3>
                        <p style="color:var(--text-muted); font-size:0.9em; margin:4px 0 0 0;">Define cuánto margen de diferencia en años se tolera para armar un grupo.</p>
                    </div>
                    <button type="button" id="btn-agregar-regla-edad" class="filter-chip active" style="font-family:inherit; cursor:pointer;">➕ Agregar Tramo</button>
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

    cont.querySelectorAll('.btn-borrar-regla-edad').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tr = e.target.closest('tr');
            if (tr) tr.remove();
        });
    });

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

    document.getElementById('btn-guardar-cfg-match')?.addEventListener('click', async (e) => {
        const btn = e.target;
        if (typeof setBotonCargando === 'function') setBotonCargando(btn, true);

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

            if (typeof cargarConfig === 'function') await cargarConfig();
            alert('Configuración de Match guardada correctamente.');
        } catch(err) {
            alert('Error al guardar configuración de Match: ' + err.message);
        }

        if (typeof setBotonCargando === 'function') setBotonCargando(btn, false);
    });
}

// -----------------------------------------------------------------------
// Render de ABM (Profesores, Instrumentos, Suscripciones, Usuarios RBAC)
// -----------------------------------------------------------------------
const ROLES_MODULOS = {
    admin: ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas', 'portal_profesor', 'configuracion', 'permisos'],
    admisor: ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas'],
    admisiones: ['dashboard', 'inbox', 'espera', 'match', 'match_etapa4', 'altas', 'metricas'],
    coordinador_grupos: ['dashboard', 'espera', 'match', 'match_etapa4', 'altas'],
    evaluador: ['dashboard', 'inbox', 'espera'],
    profesor: ['portal_profesor'],
    personalizado: []
};

function getEmojiParaInstrumento(inst) {
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

function renderChipsSkillsProfe(selectId, containerId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.style.display = 'none'; 
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        select.parentNode.insertBefore(container, select.nextSibling);
    }
    container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; width: 100%;';
    container.innerHTML = '';
    
    Array.from(select.options).forEach(opt => {
        if (!opt.value) return;
        const emoji = getEmojiParaInstrumento(opt.value);
        const chip = document.createElement('div');
        chip.className = 'skill-chip-toggle';
        chip.innerHTML = `<span style="font-size:14px;">${emoji}</span> <span>${opt.text}</span>`;
        chip.style.display = 'inline-flex';
        chip.style.alignItems = 'center';
        chip.style.gap = '6px';
        chip.style.padding = '6px 14px';
        chip.style.borderRadius = '20px';
        chip.style.cursor = 'pointer';
        chip.style.fontSize = '13px';
        chip.style.userSelect = 'none';
        chip.style.transition = 'all 0.15s ease';
        
        const updateChipStyle = () => {
            if (opt.selected) {
                chip.style.background = '#e0f2fe';
                chip.style.color = '#0369a1';
                chip.style.border = '1.5px solid #38bdf8';
                chip.style.boxShadow = '0 1px 3px rgba(3, 105, 161, 0.12)';
                chip.style.fontWeight = '700';
            } else {
                chip.style.background = '#f8fafc';
                chip.style.color = 'var(--text-muted)';
                chip.style.border = '1px solid var(--border-color)';
                chip.style.boxShadow = 'none';
                chip.style.fontWeight = '500';
            }
        };
        
        chip.addEventListener('click', () => {
            opt.selected = !opt.selected;
            updateChipStyle();
            select.dispatchEvent(new Event('change'));
        });
        
        updateChipStyle();
        container.appendChild(chip);
    });
}

function poblarDisponibilidadLocal(disp = {}, containerRef = 'contenedor-disponibilidad-user-profe', hApe = '09:00', hCie = '22:00') {
    if (typeof window.poblarDisponibilidadMultiRango === 'function') {
        window.poblarDisponibilidadMultiRango(disp, containerRef, hApe, hCie);
        return;
    }
}

function extraerDisponibilidadLocal(containerRef = 'contenedor-disponibilidad-user-profe', hApe = '09:00', hCie = '22:00') {
    if (typeof window.extraerDisponibilidadMultiRango === 'function') {
        return window.extraerDisponibilidadMultiRango(containerRef, hApe, hCie);
    }
    return {};
}

export async function cargarABM(coleccion, titulo, cont) { 
    window.coleccionABMActual = coleccion; 
    window.tituloABMActual = titulo; 
    
    let h = `
    <div style="margin-bottom:20px; font-size:0.9em; color:var(--text-muted);">
        <span style="cursor:pointer; color:var(--accent-teal);" onclick="window.cargarVistaGlobal('Configuración')">Configuración</span> &gt; <strong style="color:var(--text-main);">${titulo}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; width:100%;">
        <button class="btn-primary" onclick="window.abrirEdicionABM(null, '${coleccion}')">➕ Agregar ${titulo}</button>
    </div>`; 

    try { 
        const qS = await getDocs(collection(db, coleccion)); 
        if (qS.empty) { 
            h += `<div style="color:var(--text-muted); padding:20px;">No hay registros cargados.</div>`; 
        } else { 
            if (coleccion === 'usuarios_sistema') {
                const profsSnap = await getDocs(collection(db, "profesores"));
                const profsMap = {};
                const profsByEmail = {};
                profsSnap.forEach(d => {
                    const dt = d.data();
                    profsMap[d.id] = { id: d.id, ...dt };
                    if (dt.correo_calendario) profsByEmail[dt.correo_calendario.toLowerCase()] = { id: d.id, ...dt };
                });

                qS.forEach(d => {
                    const u = d.data();
                    const rolesArr = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : (u.rol ? [u.rol] : ['admisor']);
                    const esActivo = u.activo !== false;
                    const mods = Array.isArray(u.modulos_habilitados) ? u.modulos_habilitados : (ROLES_MODULOS[rolesArr[0]] || []);
                    const pDoc = profsMap[u.profesor_id] || (u.email ? profsByEmail[u.email.toLowerCase()] : null);
                    
                    const badgesRoles = rolesArr.map(r => {
                        if (r === 'admin') return '<span class="profile-tag-badge" style="background:#fef5e7; color:#d35400; border-color:#fad7a0;">👑 Administrador</span>';
                        if (r === 'admisor' || r === 'admisiones') return '<span class="profile-tag-badge" style="background:#e8f4fd; color:#2980b9; border-color:#beddf3;">📥 Admisor</span>';
                        if (r === 'coordinador_grupos' || r === 'coordinador') return '<span class="profile-tag-badge" style="background:#faf5ff; color:#6d28d9; border-color:#c4b5fd;">🧩 Coordinador</span>';
                        if (r === 'evaluador') return '<span class="profile-tag-badge" style="background:#f0fdfa; color:#0f766e; border-color:#99f6e4;">🎧 Evaluador</span>';
                        if (r === 'profesor') return '<span class="profile-tag-badge" style="background:#eafaf1; color:#27ae60; border-color:#a9dfbf;">👨‍🏫 Profesor</span>';
                        if (r === 'personalizado') return '<span class="profile-tag-badge" style="background:#f4ecf7; color:#8e44ad; border-color:#d2b4de;">🛠️ Personalizado</span>';
                        return '<span class="profile-tag-badge" style="background:#e8f4fd; color:#2980b9; border-color:#beddf3;">📥 Admisor</span>';
                    }).join(' ');

                    const badgeActivo = esActivo 
                        ? '<span class="status-val-ok">🟢 Activo</span>'
                        : '<span class="status-val-reject">🔴 Inactivo</span>';

                    const esDocente = rolesArr.includes('profesor') || rolesArr.includes('evaluador') || !!pDoc;

                    const celular = u.celular || pDoc?.celular || '';
                    const alias = u.alias_transferencia || pDoc?.alias_transferencia || '';
                    let detalles = [];
                    if (celular) detalles.push(`📱 <strong>${celular}</strong>`);
                    if (alias) detalles.push(`🏦 Alias: <strong>${alias}</strong>`);
                    if (!esDocente) detalles.push(`<span style="opacity:0.85;">(${mods.length} módulos autorizados)</span>`);
                    const detallesHtml = detalles.length > 0 
                        ? `<div style="display:flex; align-items:center; gap:14px; font-size:12.5px; color:var(--text-muted); margin-top:5px; flex-wrap:wrap;">${detalles.join('<span style="opacity:0.4;">•</span>')}</div>` 
                        : '';

                    let aptitudesHtml = '';
                    let skillsHtml = '';
                    if (esDocente) {
                        let aptitudes = [];
                        if (pDoc?.entrevista || u.entrevista) aptitudes.push('<span class="tag-chip" style="background:#e0f2fe; color:#0369a1; font-size:11px; padding:2px 7px; font-weight:600;">🎧 Admisiones</span>');
                        if (pDoc?.grupales || u.grupales) aptitudes.push('<span class="tag-chip" style="background:#dcfce7; color:#15803d; font-size:11px; padding:2px 7px; font-weight:600;">👥 Grupales</span>');
                        if (pDoc?.ensambles || u.ensambles) aptitudes.push('<span class="tag-chip" style="background:#fef3c7; color:#b45309; font-size:11px; padding:2px 7px; font-weight:600;">🎵 Ensambles</span>');
                        if (aptitudes.length > 0) {
                            aptitudesHtml = `
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:6px;">
                                    <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em;">Aptitudes:</span>
                                    ${aptitudes.join('')}
                                </div>`;
                        }

                        const skills = pDoc?.skills || u.skills || [];
                        if (skills.length > 0) {
                            skillsHtml = `
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:5px;">
                                    <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em;">Instrumentos:</span>
                                    ${skills.map(s => `<span class="profile-tag-badge" style="background:#f0fdfa; color:#0f766e; border-color:#99f6e4; font-size:11.5px; padding:2px 8px; font-weight:600;">${getEmojiParaInstrumento(s)} ${s}</span>`).join('')}
                                </div>`;
                        }
                    }

                    const displayNombre = u.nombre || pDoc?.nombre || u.email.split('@')[0];

                    h += `
                        <div class="row-item abm-row" style="padding:15px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:10px; cursor:pointer;" onclick="window.abrirEdicionABM('${d.id}', 'usuarios_sistema', '${u.email}')">
                            <div style="flex:1; min-width:240px;">
                                <!-- Nivel 1: Nombre, Correo, Roles del Sistema y Estado -->
                                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                    <strong style="color:var(--text-main); font-size:15.5px;">${displayNombre}</strong>
                                    <span style="color:var(--text-muted); font-size:13px; font-weight:500;">(${u.email})</span>
                                    ${badgesRoles}
                                    ${badgeActivo}
                                </div>

                                <!-- Nivel 2: Información Personal (Celular y Alias CBU/CVU) -->
                                ${detallesHtml}

                                <!-- Nivel 3: Aptitudes Docentes -->
                                ${aptitudesHtml}

                                <!-- Nivel 4: Skills e Instrumentos -->
                                ${skillsHtml}
                            </div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <button type="button" class="btn-row-action" title="Revocar Acceso / Eliminar" onclick="event.stopPropagation(); window.eliminarABM('${d.id}', 'usuarios_sistema')">🗑️</button>
                            </div>
                        </div>
                    `;
                });
            } else if (coleccion === 'profesores') {
                qS.forEach(d => { 
                    const dt = d.data(); 
                    const displayNom = dt.nombre || dt.email || d.id; 
                    
                    const skills = Array.isArray(dt.skills) ? dt.skills : [];
                    const skillsBadges = skills.length > 0
                        ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:5px;">${skills.map(s => `<span class="profile-tag-badge" style="background:#f0fdfa; color:#0f766e; border-color:#99f6e4; font-size:11px;">${getEmojiParaInstrumento(s)} ${s}</span>`).join('')}</div>`
                        : '<div style="font-size:11.5px; color:var(--text-muted); margin-top:3px;">Sin skills asignados</div>';
                        
                    let aptitudes = [];
                    if (dt.entrevista) aptitudes.push('<span class="tag-chip" style="background:#e0f2fe; color:#0369a1; font-size:10.5px; padding:2px 6px;">🎧 Admisiones</span>');
                    if (dt.grupales) aptitudes.push('<span class="tag-chip" style="background:#dcfce7; color:#15803d; font-size:10.5px; padding:2px 6px;">👥 Grupales</span>');
                    if (dt.ensambles) aptitudes.push('<span class="tag-chip" style="background:#fef3c7; color:#b45309; font-size:10.5px; padding:2px 6px;">🎵 Ensambles</span>');
                    const aptitudesHtml = aptitudes.length > 0 ? `<div style="display:flex; gap:4px; margin-top:2px;">${aptitudes.join('')}</div>` : '';

                    let detallesProfe = [];
                    if (dt.celular) detallesProfe.push(`Cel: <strong>${dt.celular}</strong>`);
                    if (dt.alias_transferencia) detallesProfe.push(`Alias: <strong>${dt.alias_transferencia}</strong>`);
                    const ex = detallesProfe.length > 0 ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${detallesProfe.join(' | ')}</div>` : '';
                    
                    h += `
                        <div class="row-item abm-row" style="padding:14px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px; cursor:pointer;" onclick="window.abrirEdicionABM('${d.id}', '${coleccion}', '${displayNom}', '${dt.correo_calendario||''}', '${dt.celular||''}', '${dt.alias_transferencia||''}')">
                            <div style="flex:1; min-width:240px;">
                                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                    <strong style="color:var(--text-main); font-size:15px;">${displayNom}</strong>
                                    ${aptitudesHtml}
                                </div>
                                ${skillsBadges}
                                ${ex}
                            </div>
                            <button type="button" class="btn-row-action" title="Eliminar Profesor" onclick="event.stopPropagation(); window.eliminarABM('${d.id}', '${coleccion}')">🗑️</button>
                        </div>
                    `; 
                }); 
            } else {
                qS.forEach(d => { 
                    const dt = d.data(); 
                    const displayNom = dt.nombre || dt.email || d.id; 
                    h += `<div class="row-item abm-row" onclick="window.abrirEdicionABM('${d.id}', '${coleccion}', '${displayNom}')"><div><strong style="color:var(--text-main); font-size:15px;">${displayNom}</strong></div><button class="btn-row-action" onclick="event.stopPropagation(); window.eliminarABM('${d.id}', '${coleccion}')">🗑️</button></div>`; 
                }); 
            }
        } 
    } catch(e) { 
        h += `<div style="color:var(--accent-red); padding:20px;">Error al cargar: ${e.message}</div>`; 
    } 
    cont.innerHTML = h; 
}

export async function abrirEdicionABM(id, col, nom = '', cor = '', cel = '', ali = '', callbacks = {}) { 
    const { syncSelectToChips, poblarDisponibilidadMultiRango } = callbacks;
    document.getElementById('abm-edit-id').value = id || ''; 
    document.getElementById('abm-edit-coleccion').value = col; 
    document.getElementById('label-abm-edit-nombre').innerHTML = col === 'usuarios_sistema' 
        ? `Correo Electrónico (Google Auth) *: <input type="email" id="abm-edit-nombre" class="modern-input" placeholder="usuario@gmail.com" required>` 
        : `Nombre *: <input type="text" id="abm-edit-nombre" class="modern-input" required>`; 
    document.getElementById('abm-edit-nombre').value = nom || '';
    
    const tituloModal = document.querySelector('#modal-abm-edit h3');
    if (tituloModal) {
        const nombreEntidad = col === 'usuarios_sistema' ? 'Usuario y Permisos' : (col === 'profesores' ? 'Profesor' : (col === 'instrumentos' ? 'Instrumento' : 'Suscripción'));
        tituloModal.textContent = id ? `Editar ${nombreEntidad}` : `Nuevo ${nombreEntidad}`;
    }

    const divUser = document.getElementById('div-abm-edit-usuario');
    const divProfe = document.getElementById('div-abm-edit-profe');

    if (col === 'usuarios_sistema') {
        if (divUser) divUser.style.display = 'block';
        if (divProfe) divProfe.style.display = 'none';

        // 1. Cargar catálogo de instrumentos en el select de skills del usuario
        const selSkillsUser = document.getElementById('abm-user-skills');
        if (selSkillsUser) {
            selSkillsUser.innerHTML = '';
            try {
                const iSnap = await getDocs(collection(db, "instrumentos"));
                iSnap.forEach(d => {
                    const instNom = d.data().nombre;
                    selSkillsUser.innerHTML += `<option value="${instNom}">${instNom}</option>`;
                });
            } catch(e) {}
        }

        const toggleSeccionDocente = () => {
            const rolesSeleccionados = [];
            document.querySelectorAll('.chk-user-rol:checked').forEach(c => rolesSeleccionados.push(c.value));
            const esDocente = rolesSeleccionados.includes('profesor') || rolesSeleccionados.includes('evaluador');
            const secDoc = document.getElementById('abm-user-seccion-docente');
            if (secDoc) secDoc.style.display = esDocente ? 'block' : 'none';
        };

        const aplicarPlantillaRoles = () => {
            const rolesSeleccionados = [];
            document.querySelectorAll('.chk-user-rol:checked').forEach(c => rolesSeleccionados.push(c.value));
            toggleSeccionDocente();
            
            if (rolesSeleccionados.length === 0) return;

            const modulosUnion = new Set();
            rolesSeleccionados.forEach(r => {
                const m = ROLES_MODULOS[r] || [];
                m.forEach(mod => modulosUnion.add(mod));
            });

            document.querySelectorAll('.chk-user-modulo').forEach(chk => {
                chk.checked = modulosUnion.has(chk.value);
            });
        };

        document.querySelectorAll('.chk-user-rol').forEach(chk => {
            chk.onchange = () => aplicarPlantillaRoles();
        });

        const chkActivo = document.getElementById('abm-user-activo');
        const lblActivo = document.getElementById('abm-user-activo-label');
        if (chkActivo && lblActivo) {
            chkActivo.onchange = (e) => {
                lblActivo.textContent = e.target.checked ? 'Activo' : 'Inactivo';
                lblActivo.style.color = e.target.checked ? 'var(--accent-teal)' : 'var(--accent-red)';
            };
        }

        if (id) {
            try {
                const uDoc = await getDoc(doc(db, "usuarios_sistema", id));
                if (uDoc.exists()) {
                    const uData = uDoc.data();
                    document.getElementById('abm-edit-nombre').value = uData.email || '';
                    document.getElementById('abm-user-nombre').value = uData.nombre || '';
                    document.getElementById('abm-user-celular').value = uData.celular || '';
                    document.getElementById('abm-user-alias').value = uData.alias_transferencia || '';
                    
                    const rolesCargados = Array.isArray(uData.roles) && uData.roles.length > 0 ? uData.roles : (uData.rol ? [uData.rol] : ['admisor']);
                    document.querySelectorAll('.chk-user-rol').forEach(chk => {
                        chk.checked = rolesCargados.includes(chk.value) || (chk.value === 'admisor' && rolesCargados.includes('admisiones'));
                    });

                    if (chkActivo) {
                        chkActivo.checked = uData.activo !== false;
                        if (lblActivo) {
                            lblActivo.textContent = chkActivo.checked ? 'Activo' : 'Inactivo';
                            lblActivo.style.color = chkActivo.checked ? 'var(--accent-teal)' : 'var(--accent-red)';
                        }
                    }

                    const uMods = Array.isArray(uData.modulos_habilitados) ? uData.modulos_habilitados : (ROLES_MODULOS[rolesCargados[0]] || []);
                    document.querySelectorAll('.chk-user-modulo').forEach(chk => {
                        chk.checked = uMods.includes(chk.value);
                    });

                    // Cargar datos docentes si existen
                    let pData = null;
                    if (uData.profesor_id) {
                        try {
                            const pSnap = await getDoc(doc(db, "profesores", uData.profesor_id));
                            if (pSnap.exists()) pData = pSnap.data();
                        } catch(e) {}
                    } else if (uData.email) {
                        try {
                            const pQ = await getDocs(collection(db, "profesores"));
                            pQ.forEach(docP => {
                                const dtP = docP.data();
                                if (dtP.correo_calendario && dtP.correo_calendario.toLowerCase() === uData.email.toLowerCase()) {
                                    pData = dtP;
                                }
                            });
                        } catch(e) {}
                    }

                    if (pData) {
                        if (!document.getElementById('abm-user-celular').value) document.getElementById('abm-user-celular').value = pData.celular || '';
                        if (!document.getElementById('abm-user-alias').value) document.getElementById('abm-user-alias').value = pData.alias_transferencia || '';
                        document.getElementById('abm-user-correo-calendario').value = pData.correo_calendario || uData.correo_calendario || uData.email || '';
                        if (document.getElementById('abm-user-entrevista')) document.getElementById('abm-user-entrevista').checked = !!pData.entrevista;
                        if (document.getElementById('abm-user-grupales')) document.getElementById('abm-user-grupales').checked = !!pData.grupales;
                        if (document.getElementById('abm-user-ensambles')) document.getElementById('abm-user-ensambles').checked = !!pData.ensambles;

                        const skillsP = Array.isArray(pData.skills) ? pData.skills : [];
                        if (selSkillsUser) {
                            Array.from(selSkillsUser.options).forEach(opt => {
                                opt.selected = skillsP.includes(opt.value);
                            });
                        }
                        poblarDisponibilidadLocal(pData.disponibilidad || {}, 'contenedor-disponibilidad-user-profe');
                    } else {
                        document.getElementById('abm-user-correo-calendario').value = uData.correo_calendario || uData.email || '';
                        if (document.getElementById('abm-user-entrevista')) document.getElementById('abm-user-entrevista').checked = false;
                        if (document.getElementById('abm-user-grupales')) document.getElementById('abm-user-grupales').checked = false;
                        if (document.getElementById('abm-user-ensambles')) document.getElementById('abm-user-ensambles').checked = false;
                        poblarDisponibilidadLocal({}, 'contenedor-disponibilidad-user-profe');
                    }

                    if (typeof syncSelectToChips === 'function') {
                        syncSelectToChips('abm-user-skills', 'chips-abm-user-skills');
                    } else if (typeof window.syncSelectToChips === 'function') {
                        window.syncSelectToChips('abm-user-skills', 'chips-abm-user-skills');
                    }

                    toggleSeccionDocente();
                }
            } catch(e) {}
        } else {
            document.getElementById('abm-user-nombre').value = '';
            document.getElementById('abm-user-celular').value = '';
            document.getElementById('abm-user-alias').value = '';
            document.getElementById('abm-user-correo-calendario').value = '';
            document.querySelectorAll('.chk-user-rol').forEach(chk => {
                chk.checked = chk.value === 'admisor';
            });
            if (document.getElementById('abm-user-entrevista')) document.getElementById('abm-user-entrevista').checked = false;
            if (document.getElementById('abm-user-grupales')) document.getElementById('abm-user-grupales').checked = false;
            if (document.getElementById('abm-user-ensambles')) document.getElementById('abm-user-ensambles').checked = false;
            if (selSkillsUser) Array.from(selSkillsUser.options).forEach(o => o.selected = false);
            if (typeof syncSelectToChips === 'function') {
                syncSelectToChips('abm-user-skills', 'chips-abm-user-skills');
            } else if (typeof window.syncSelectToChips === 'function') {
                window.syncSelectToChips('abm-user-skills', 'chips-abm-user-skills');
            }
            poblarDisponibilidadLocal({}, 'contenedor-disponibilidad-user-profe');
            aplicarPlantillaRoles();
            if (chkActivo) {
                chkActivo.checked = true;
                if (lblActivo) {
                    lblActivo.textContent = 'Activo';
                    lblActivo.style.color = 'var(--accent-teal)';
                }
            }
        }

    } else if (col === 'profesores') { 
        if (divUser) divUser.style.display = 'none';
        if (divProfe) divProfe.style.display = 'block';

        // 1. Cargar catálogo de instrumentos en el select de skills
        const selSkills = document.getElementById('abm-edit-skills');
        if (selSkills) {
            selSkills.innerHTML = '';
            const iSnap = await getDocs(collection(db, "instrumentos"));
            iSnap.forEach(d => {
                const instNom = d.data().nombre;
                selSkills.innerHTML += `<option value="${instNom}">${instNom}</option>`;
            });
        }

        // 2. Si es edición, leer la ficha única y específica del profesor desde Firestore
        if (id) {
            const snap = await getDoc(doc(db, "profesores", id));
            if (snap.exists()) {
                const pr = snap.data();
                document.getElementById('abm-edit-correo').value = pr.correo_calendario || cor || ''; 
                document.getElementById('abm-edit-celular').value = pr.celular || cel || ''; 
                document.getElementById('abm-edit-alias').value = pr.alias_transferencia || ali || ''; 
                document.getElementById('abm-edit-entrevista').checked = !!pr.entrevista;
                document.getElementById('abm-edit-grupales').checked = !!pr.grupales;
                document.getElementById('abm-edit-ensambles').checked = !!pr.ensambles;
                
                // Marcar en el select los skills guardados
                const skillsGuardados = Array.isArray(pr.skills) ? pr.skills : [];
                if (selSkills) {
                    Array.from(selSkills.options).forEach(opt => {
                        opt.selected = skillsGuardados.includes(opt.value);
                    });
                }
                
                poblarDisponibilidadLocal(pr.disponibilidad || {}, 'contenedor-disponibilidad-profe');
            }
        } else {
            document.getElementById('abm-edit-correo').value = cor || ''; 
            document.getElementById('abm-edit-celular').value = cel || ''; 
            document.getElementById('abm-edit-alias').value = ali || ''; 
            document.getElementById('abm-edit-entrevista').checked = false;
            document.getElementById('abm-edit-grupales').checked = false;
            document.getElementById('abm-edit-ensambles').checked = false;
            if (selSkills) {
                Array.from(selSkills.options).forEach(opt => opt.selected = false);
            }
            poblarDisponibilidadLocal({}, 'contenedor-disponibilidad-profe');
        }

        if (typeof syncSelectToChips === 'function') {
            syncSelectToChips('abm-edit-skills', 'chips-abm-edit-skills');
        } else if (typeof window.syncSelectToChips === 'function') {
            window.syncSelectToChips('abm-edit-skills', 'chips-abm-edit-skills');
        }
    } else { 
        if (divUser) divUser.style.display = 'none';
        if (divProfe) divProfe.style.display = 'none';
    } 
    document.getElementById('modal-abm-edit')?.showModal(); 
}

export async function eliminarABM(id, col, callbacks = {}) { 
    const { cargarVista } = callbacks;
    const msg = col === 'usuarios_sistema' 
        ? '¿Revocar acceso y eliminar a este usuario del sistema?'
        : '¿Eliminar registro? Esta acción no se puede deshacer.';
    
    if (await window.confirmar(msg, 'Esta acción no se puede deshacer.', 'Eliminar')) { 
        await deleteDoc(doc(db, col, id)); 
        alert('Registro eliminado.');
        if (typeof cargarVista === 'function') {
            cargarVista('ABM-' + (window.tituloABMActual || '')); 
        } else if (window.cargarVistaGlobal) {
            window.cargarVistaGlobal('ABM-' + (window.tituloABMActual || ''));
        }
    } 
}

// Handler de guardado de edición ABM
document.getElementById('btn-guardar-abm-edit')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-guardar-abm-edit');
    const id = document.getElementById('abm-edit-id').value;
    const col = document.getElementById('abm-edit-coleccion').value;
    const nomVal = (document.getElementById('abm-edit-nombre').value || '').trim();

    if (!nomVal) return alert('Por favor, completa el campo principal requerido.');

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        if (col === 'usuarios_sistema') {
            const email = nomVal.toLowerCase();
            const nombre = (document.getElementById('abm-user-nombre')?.value || '').trim();
            const celular = (document.getElementById('abm-user-celular')?.value || '').trim();
            const alias = (document.getElementById('abm-user-alias')?.value || '').trim();
            const calIdVal = (document.getElementById('abm-user-correo-calendario')?.value || '').trim() || email;
            
            const rolesChecked = [];
            document.querySelectorAll('.chk-user-rol:checked').forEach(c => rolesChecked.push(c.value));
            if (rolesChecked.length === 0) rolesChecked.push('personalizado');
            const rolPrincipal = rolesChecked[0] || 'admisor';

            const activo = document.getElementById('abm-user-activo')?.checked !== false;
            
            const modulosChecked = [];
            document.querySelectorAll('.chk-user-modulo:checked').forEach(c => modulosChecked.push(c.value));

            const esDocente = rolesChecked.includes('profesor') || rolesChecked.includes('evaluador');

            let profesor_id = '';
            if (id) {
                try {
                    const uDoc = await getDoc(doc(db, "usuarios_sistema", id));
                    if (uDoc.exists()) profesor_id = uDoc.data().profesor_id || '';
                } catch(e) {}
            }

            // Si es docente o ya tenía ficha de profesor, sincronizar en la colección profesores
            if (esDocente || profesor_id) {
                const selSkills = document.getElementById('abm-user-skills');
                const skillsArr = selSkills ? Array.from(selSkills.selectedOptions).map(o => o.value) : [];
                const dispProfe = extraerDisponibilidadLocal('contenedor-disponibilidad-user-profe');
                
                const dataProfe = {
                    nombre: nombre || email.split('@')[0],
                    correo_calendario: calIdVal,
                    celular: celular,
                    alias_transferencia: alias,
                    activo: activo,
                    entrevista: Boolean(document.getElementById('abm-user-entrevista')?.checked),
                    grupales: Boolean(document.getElementById('abm-user-grupales')?.checked),
                    ensambles: Boolean(document.getElementById('abm-user-ensambles')?.checked),
                    skills: skillsArr,
                    disponibilidad: dispProfe
                };

                if (profesor_id) {
                    try {
                        await updateDoc(doc(db, "profesores", profesor_id), dataProfe);
                    } catch(e) {
                        const newProf = await addDoc(collection(db, "profesores"), dataProfe);
                        profesor_id = newProf.id;
                    }
                } else {
                    // Buscar si existía un profesor con el mismo email o calendarId
                    const pQ = await getDocs(collection(db, "profesores"));
                    let profEncontradoId = null;
                    pQ.forEach(docP => {
                        const dtP = docP.data();
                        if ((dtP.correo_calendario && dtP.correo_calendario.toLowerCase() === email) || (dtP.correo_calendario && dtP.correo_calendario.toLowerCase() === calIdVal.toLowerCase())) {
                            profEncontradoId = docP.id;
                        }
                    });

                    if (profEncontradoId) {
                        await updateDoc(doc(db, "profesores", profEncontradoId), dataProfe);
                        profesor_id = profEncontradoId;
                    } else {
                        const newProf = await addDoc(collection(db, "profesores"), dataProfe);
                        profesor_id = newProf.id;
                    }
                }
            }

            const userData = {
                email,
                nombre: nombre || email.split('@')[0],
                celular,
                alias_transferencia: alias,
                correo_calendario: calIdVal,
                roles: rolesChecked,
                rol: rolPrincipal,
                profesor_id: profesor_id || '',
                activo,
                modulos_habilitados: modulosChecked,
                fecha_actualizacion: new Date().toISOString()
            };

            if (id) {
                await updateDoc(doc(db, "usuarios_sistema", id), userData);
            } else {
                userData.fecha_creacion = new Date().toISOString();
                await addDoc(collection(db, "usuarios_sistema"), userData);
            }

            alert(`✅ Usuario "${nombre || email}" guardado correctamente.`);

        } else if (col === 'profesores') {
            const selSkills = document.getElementById('abm-edit-skills');
            const skillsArr = selSkills ? Array.from(selSkills.selectedOptions).map(o => o.value) : [];
            const dispProfe = extraerDisponibilidadLocal('contenedor-disponibilidad-profe');
            const dataProfe = {
                nombre: nomVal,
                correo_calendario: document.getElementById('abm-edit-correo')?.value || '',
                celular: document.getElementById('abm-edit-celular')?.value || '',
                alias_transferencia: document.getElementById('abm-edit-alias')?.value || '',
                activo: true,
                entrevista: !!document.getElementById('abm-edit-entrevista')?.checked,
                grupales: !!document.getElementById('abm-edit-grupales')?.checked,
                ensambles: !!document.getElementById('abm-edit-ensambles')?.checked,
                skills: skillsArr,
                disponibilidad: dispProfe
            };

            if (id) {
                await updateDoc(doc(db, "profesores", id), dataProfe);
            } else {
                await addDoc(collection(db, "profesores"), dataProfe);
            }
            alert('✅ Profesor guardado correctamente.');

        } else {
            const simpleData = { nombre: nomVal };
            if (id) {
                await updateDoc(doc(db, col, id), simpleData);
            } else {
                await addDoc(collection(db, col), simpleData);
            }
            alert('✅ Registro guardado.');
        }

        document.getElementById('modal-abm-edit')?.close();
        if (window.cargarVistaGlobal) {
            window.cargarVistaGlobal('ABM-' + (window.tituloABMActual || ''));
        }
    } catch(err) {
        alert('Error al guardar: ' + err.message);
    }

    btn.disabled = false;
    btn.textContent = 'Guardar Cambios';
});

// Window Global Bindings
window.abrirEdicionABM = abrirEdicionABM;
window.eliminarABM = eliminarABM;
window.cargarABM = cargarABM;