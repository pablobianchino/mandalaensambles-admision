// =======================================================================
// src/modules/abm.module.js -- ABM Profesores, Instrumentos, Suscripciones, Usuarios y Config
// =======================================================================

import { defaultCfg } from "../config/constants.js";
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
    extraerDisponibilidadMultiRango
} from "../ui/horarios.ui.js";

export function renderConfigHub(cont, callbacks = {}) {
    cont.innerHTML = `
        <div style="max-width:800px; width:100%; padding:20px;">
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="window.cargarVistaGlobal('Ajustes Generales')"><span style="font-size:1.5em; opacity:0.7;">⚙️</span><div><strong style="color:var(--text-main);">Ajustes Generales</strong><div style="font-size:12px; color:var(--text-muted);">Límites, calendarios y textos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="window.cargarVistaGlobal('Ajustes Match')"><span style="font-size:1.5em; opacity:0.7;">🧩</span><div><strong style="color:var(--text-main);">Ajustes de Match</strong><div style="font-size:12px; color:var(--text-muted);">Límites de integrantes y reglas de edad para grupos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="window.cargarVistaGlobal('ABM-Usuarios')"><span style="font-size:1.5em; opacity:0.7;">🔐</span><div><strong style="color:var(--text-main);">Usuarios del Sistema</strong><div style="font-size:12px; color:var(--text-muted);">Administrar accesos.</div></div></div>
            <div style="background:var(--item-bg); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; align-items:center; gap:15px; margin-bottom:10px; cursor:pointer;" onclick="window.cargarVistaGlobal('ABM-Profesores')"><span style="font-size:1.5em; opacity:0.7;">👥</span><div><strong style="color:var(--text-main);">Profesores</strong><div style="font-size:12px; color:var(--text-muted);">Alta y disponibilidad.</div></div></div>
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
                <button type="button" class="btn-del-tag-cfg" data-idx="${idx}" style="background:none; border:none; color:var(--accent-red); cursor:pointer; font-weight:bold; padding:0 2px; font-size:14px;">✕</button>
            </span>
        `).join('');
    };

    cont.innerHTML = `
        <div style="margin-bottom:25px; font-size:0.9em; color:var(--text-muted);">
            <span style="cursor:pointer; color:var(--accent-teal);" onclick="window.cargarVistaGlobal('Configuración')">Configuración</span> &gt; <strong style="color:var(--text-main);">Ajustes Generales</strong>
        </div>
        <div style="max-width:800px; padding:30px; background:white; border-radius:12px; border:1px solid var(--border-color);">
            <h3 style="margin-top:0; color:var(--text-main); font-size:1.2em;">Límites de Calendario</h3>
            <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;">
                <div style="flex:1; min-width:150px;"><label>Hora Apertura:<input type="time" id="cfg-apertura" class="modern-input" value="${currentCfg.hora_apertura||'09:00'}"></label></div>
                <div style="flex:1; min-width:150px;"><label>Hora Cierre:<input type="time" id="cfg-cierre" class="modern-input" value="${currentCfg.hora_cierre||'22:00'}"></label></div>
            </div>
            <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;">
                <div style="flex:1; min-width:150px;"><label>Aulas totales:<input type="number" id="cfg-aulas" class="modern-input" value="${currentCfg.cantidad_aulas}"></label></div>
                <div style="flex:1; min-width:150px;"><label>Baterías totales:<input type="number" id="cfg-bats" class="modern-input" value="${currentCfg.cantidad_baterias}"></label></div>
            </div>

            <h3 style="margin-top:0; color:var(--text-main); border-top:1px solid var(--border-color); padding-top:20px;">🧠 Opciones de Perfil Psicológico / Emocional</h3>
            <p style="color:var(--text-muted); font-size:0.9em; margin-bottom:12px;">Etiquetas que el evaluador puede seleccionar al cargar el informe o finalizar la admisión.</p>
            <div id="cfg-tags-admin-list" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px;"></div>
            <div style="display:flex; gap:10px; margin-bottom:25px; max-width:400px;">
                <input type="text" id="cfg-new-tag-input" class="modern-input" placeholder="Nueva etiqueta (ej: ⚡ Enérgico)...">
                <button type="button" id="btn-add-tag-cfg" class="btn-primary" style="white-space:nowrap; padding:0 16px;">+ Agregar</button>
            </div>

            <h3 style="margin-top:0; color:var(--text-main); border-top:1px solid var(--border-color); padding-top:20px;">Calendario y Emojis</h3>
            <label style="margin-bottom:15px;">Calendario Defecto:<input type="email" id="cfg-cal-defecto" class="modern-input" value="${currentCfg.calendario_por_defecto||''}"></label>
            <div style="display:flex; gap:10px; margin-bottom:25px; flex-wrap:wrap;">
                <div style="width:80px;"><label>Batería:<input type="text" id="cfg-idbat" class="modern-input" value="${currentCfg.identificador_bateria||''}"></label></div>
                <div style="width:80px;"><label>Guitarra:<input type="text" id="cfg-em-gui" class="modern-input" value="${currentCfg.emoji_guitarra||'🎸'}"></label></div>
                <div style="width:80px;"><label>Cajón:<input type="text" id="cfg-em-caj" class="modern-input" value="${currentCfg.emoji_cajon||'📦'}"></label></div>
                <div style="width:80px;"><label>Canto:<input type="text" id="cfg-em-can" class="modern-input" value="${currentCfg.emoji_canto||'🎤'}"></label></div>
                <div style="width:80px;"><label>Piano:<input type="text" id="cfg-em-pia" class="modern-input" value="${currentCfg.emoji_piano||'🎹'}"></label></div>
                <div style="width:80px;"><label>Bajo:<input type="text" id="cfg-em-baj" class="modern-input" value="${currentCfg.emoji_bajo||'🎸'}"></label></div>
            </div>
            
            <h3 style="margin-top:0; color:var(--text-main); border-top:1px solid var(--border-color); padding-top:20px;">Mensajes y Textos</h3>
            <label style="margin-bottom:15px;">Valor de Clase (Monto): <input type="text" id="cfg-valor" class="modern-input" value="${currentCfg.valor_clase}"></label>
            <label style="margin-bottom:15px;">Título Evento (Reserva): <input type="text" id="cfg-evt-res" class="modern-input" value="${currentCfg.formato_evento_reserva}"></label>
            <label style="margin-bottom:15px;">Título Evento (Confirmado): <input type="text" id="cfg-evt-conf" class="modern-input" value="${currentCfg.formato_evento_confirmado}"></label>
            <label style="margin-bottom:15px;">Nombre para Agendar (WS): <input type="text" id="cfg-nombre-agendar" class="modern-input" value="${currentCfg.texto_nombre_agendar}"></label>
            <label style="margin-bottom:15px;">Texto Opciones Múltiples: <textarea id="cfg-txt-opt-mul" class="modern-input" style="height:200px;">${currentCfg.texto_opciones_multiples || ''}</textarea></label>
            <label style="margin-bottom:15px;">Texto 1 Sola Opción: <textarea id="cfg-txt-p" class="modern-input" style="height:150px;">${currentCfg.texto_profe || ''}</textarea></label>
            <label style="margin-bottom:15px;">Texto Propuesta Horario al Alumno (Validación por Alumno): <textarea id="cfg-txt-alumno" class="modern-input" style="height:150px;">${currentCfg.texto_alumno || ''}</textarea></label>
            <label style="margin-bottom:15px;">Texto Confirmación Alumno: <textarea id="cfg-txt-conf-a" class="modern-input" style="height:150px;">${currentCfg.texto_conf_alumno || ''}</textarea></label>
            <label style="margin-bottom:15px;">Texto Cancelación: <textarea id="cfg-txt-cancela" class="modern-input" style="height:100px;">${currentCfg.texto_cancela_alumno || ''}</textarea></label>
            <label style="margin-bottom:15px;">Texto Pre-Alta: <textarea id="cfg-txt-prealta" class="modern-input" style="height:150px;">${currentCfg.texto_prealta || ''}</textarea></label>
            <label style="margin-bottom:20px;">Texto Nueva Alta: <textarea id="cfg-txt-alta-conf" class="modern-input" style="height:150px;">${currentCfg.texto_alta_confirmada || ''}</textarea></label>
            <button id="btn-guardar-cfg" class="btn-primary" style="width:100%;">Guardar Configuración</button>
        </div>`; 

    renderTagsAdmin();

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
        if (typeof setBotonCargando === 'function') setBotonCargando(e.target, true); 
        const updatedData = { 
            hora_apertura: document.getElementById('cfg-apertura').value, 
            hora_cierre: document.getElementById('cfg-cierre').value, 
            cantidad_aulas: document.getElementById('cfg-aulas').value, 
            cantidad_baterias: document.getElementById('cfg-bats').value, 
            identificador_bateria: document.getElementById('cfg-idbat').value, 
            emoji_guitarra: document.getElementById('cfg-em-gui').value, 
            emoji_cajon: document.getElementById('cfg-em-caj').value, 
            emoji_canto: document.getElementById('cfg-em-can').value, 
            emoji_piano: document.getElementById('cfg-em-pia').value, 
            emoji_bajo: document.getElementById('cfg-em-baj').value, 
            calendario_por_defecto: document.getElementById('cfg-cal-defecto').value, 
            valor_clase: document.getElementById('cfg-valor').value, 
            formato_evento_reserva: document.getElementById('cfg-evt-res').value, 
            formato_evento_confirmado: document.getElementById('cfg-evt-conf').value, 
            texto_nombre_agendar: document.getElementById('cfg-nombre-agendar').value, 
            texto_opciones_multiples: document.getElementById('cfg-txt-opt-mul').value, 
            texto_profe: document.getElementById('cfg-txt-p').value, 
            texto_alumno: document.getElementById('cfg-txt-alumno').value,
            texto_conf_alumno: document.getElementById('cfg-txt-conf-a').value, 
            texto_cancela_alumno: document.getElementById('cfg-txt-cancela').value, 
            texto_prealta: document.getElementById('cfg-txt-prealta').value, 
            texto_alta_confirmada: document.getElementById('cfg-txt-alta-conf').value,
            perfil_psicologico_opciones: tagsList
        };
        await setDoc(doc(db, "configuracion", "general"), updatedData, { merge: true }); 
        if (typeof configApp === 'object') {
            Object.assign(configApp, updatedData);
        }
        if (typeof cargarConfig === 'function') await cargarConfig(); 
        if (typeof setBotonCargando === 'function') setBotonCargando(e.target, false); 
        alert('Configuración guardada correctamente.'); 
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
                <input type="number" class="modern-input cfg-regla-desde" value="${r.desde}" min="13" max="99" style="width:80px; padding:6px 8px;"> anos
            </td>
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-min" value="${r.rango_min}" min="-30" max="0" style="width:70px; padding:6px 8px;"> anos
            </td>
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-max" value="${r.rango_max}" min="0" max="30" style="width:70px; padding:6px 8px;"> anos
            </td>
            <td style="padding:10px 8px; text-align:center;">
                <button type="button" class="btn-borrar-regla-edad" style="background:none; border:none; cursor:pointer; color:var(--accent-red); font-size:1.1em;" title="Eliminar regla">🗑️ï¸</button>
            </td>
        </tr>
    `).join('');

    cont.innerHTML = `
        <div style="margin-bottom:25px; font-size:0.9em; color:var(--text-muted);">
            <span style="cursor:pointer; color:var(--accent-teal);" onclick="window.cargarVistaGlobal('Configuracion')">Configuracion</span> &gt; <strong style="color:var(--text-main);">Ajustes de Match</strong>
        </div>
        <div style="max-width:800px; padding:30px; background:white; border-radius:12px; border:1px solid var(--border-color); display:flex; flex-direction:column; gap:25px;">
            <div>
                <h3 style="margin-top:0; color:var(--text-main); font-size:1.2em; margin-bottom:6px;">👥 Tamano de Grupos</h3>
                <p style="color:var(--text-muted); font-size:0.9em; margin:0 0 15px 0;">Cantidad minima y maxima de integrantes permitidos por ensamble/grupo.</p>
                <div style="display:flex; gap:15px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:140px;">
                        <label>Minimo de Integrantes:
                            <input type="number" id="cfg-grupo-min" class="modern-input" min="2" max="10" value="${minInt}">
                        </label>
                    </div>
                    <div style="flex:1; min-width:140px;">
                        <label>Maximo de Integrantes:
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
                        <h3 style="margin:0; color:var(--text-main); font-size:1.2em;">📊 Reglas de Tolerancia de Edad (Adultos)</h3>
                        <p style="color:var(--text-muted); font-size:0.9em; margin:4px 0 0 0;">Define cuanto margen de diferencia en anos se tolera para armar un grupo.</p>
                    </div>
                    <button type="button" id="btn-agregar-regla-edad" class="filter-chip active" style="font-family:inherit; cursor:pointer;">ï¼‹ Agregar Tramo</button>
                </div>

                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
                        <thead>
                            <tr style="background:var(--hover-bg); border-bottom:2px solid var(--border-color); color:var(--text-muted);">
                                <th style="padding:10px 8px;">Desde Edad</th>
                                <th style="padding:10px 8px;">Rango Min. (-anos)</th>
                                <th style="padding:10px 8px;">Rango Max. (+anos)</th>
                                <th style="padding:10px 8px; width:40px; text-align:center;">Accion</th>
                            </tr>
                        </thead>
                        <tbody id="tabla-reglas-edad-body">
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <button id="btn-guardar-cfg-match" class="btn-primary" style="width:100%; padding:12px; font-size:14px; margin-top:10px;">Guardar Configuracion de Match</button>
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
                <input type="number" class="modern-input cfg-regla-desde" value="20" min="13" max="99" style="width:80px; padding:6px 8px;"> anos
            </td>
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-min" value="-5" min="-30" max="0" style="width:70px; padding:6px 8px;"> anos
            </td>
            <td style="padding:10px 8px;">
                <input type="number" class="modern-input cfg-regla-max" value="8" min="0" max="30" style="width:70px; padding:6px 8px;"> anos
            </td>
            <td style="padding:10px 8px; text-align:center;">
                <button type="button" class="btn-borrar-regla-edad" style="background:none; border:none; cursor:pointer; color:var(--accent-red); font-size:1.1em;" title="Eliminar regla">🗑️ï¸</button>
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
    evaluador: ['dashboard', 'inbox'],
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

function poblarDisponibilidadLocal(disp = {}, esProfe = false, hApe = '09:00', hCie = '22:00') {
    if (typeof window.poblarDisponibilidadMultiRango === 'function') {
        window.poblarDisponibilidadMultiRango(disp, esProfe, hApe, hCie);
        return;
    }
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    const estadoPrefix = esProfe ? 'estado-p-' : 'estado-';
    const dias = [
        { id: 'L', nombre: 'Lunes' },
        { id: 'M', nombre: 'Martes' },
        { id: 'X', nombre: 'Miércoles' },
        { id: 'J', nombre: 'Jueves' },
        { id: 'V', nombre: 'Viernes' },
        { id: 'S', nombre: 'Sábado' },
        { id: 'D', nombre: 'Domingo' }
    ];
    dias.forEach(dia => {
        const dD = disp[dia.id] || [];
        const rangosCont = document.getElementById(`rangos-${prefix}${dia.id}`);
        const cA = document.getElementById(`${prefix}${dia.id}-all`);
        const cN = document.getElementById(`${prefix}${dia.id}-none`);
        const sE = document.getElementById(`${estadoPrefix}${dia.id}`);
        
        if (!rangosCont) return;
        rangosCont.innerHTML = '';
        if (cA) cA.checked = false;
        if (cN) cN.checked = false;
        if (sE) sE.textContent = "";
        
        const filaRango = (ini = '', fin = '', idx = 0) => `
            <div class="rango-item" style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                <input type="time" class="modern-input rango-inicio" value="${ini}" style="width:auto; padding:5px 8px; font-size:12.5px;">
                <span style="font-size:12px; color:var(--text-muted);">a</span>
                <input type="time" class="modern-input rango-fin" value="${fin}" style="width:auto; padding:5px 8px; font-size:12.5px;">
                <button type="button" class="btn-quitar-rango" data-dia="${dia.id}" data-profe="${esProfe}" style="background:none; border:none; cursor:pointer; font-size:1em; padding:2px 4px; ${idx === 0 ? 'display:none;' : ''}">🗑️</button>
            </div>
        `;

        if (dD.length === 0) {
            if (cN) cN.checked = true;
            rangosCont.innerHTML = filaRango('', '', 0);
        } else if (dD.length === 1 && dD[0].inicio === hApe && dD[0].fin === hCie) {
            if (cA) cA.checked = true;
            rangosCont.innerHTML = filaRango('', '', 0);
        } else {
            dD.forEach((rango, idx) => {
                rangosCont.innerHTML += filaRango(rango.inicio || '', rango.fin || '', idx);
            });
        }
        if (typeof window.updateDispStateForDay === 'function') {
            window.updateDispStateForDay(dia.id, esProfe);
        }
    });
}

function extraerDisponibilidadLocal(esProfe = false, hApe = '09:00', hCie = '22:00') {
    if (typeof window.extraerDisponibilidadMultiRango === 'function') {
        return window.extraerDisponibilidadMultiRango(esProfe, hApe, hCie);
    }
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const disp = {};
    dias.forEach(d => {
        const cA = document.getElementById(`${prefix}${d}-all`)?.checked;
        const cN = document.getElementById(`${prefix}${d}-none`)?.checked;
        if (cN) {
            disp[d] = [];
        } else if (cA) {
            disp[d] = [{ inicio: hApe, fin: hCie }];
        } else {
            const rangosCont = document.getElementById(`rangos-${prefix}${d}`);
            const items = rangosCont ? rangosCont.querySelectorAll('.rango-item') : [];
            const arr = [];
            items.forEach(item => {
                const i = item.querySelector('.rango-inicio')?.value || '';
                const f = item.querySelector('.rango-fin')?.value || '';
                if (i || f) {
                    arr.push({ inicio: i || hApe, fin: f || hCie });
                }
            });
            disp[d] = arr;
        }
    });
    return disp;
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
                profsSnap.forEach(d => profsMap[d.id] = d.data().nombre || d.id);

                qS.forEach(d => {
                    const u = d.data();
                    const rolesArr = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : (u.rol ? [u.rol] : ['admisiones']);
                    const esActivo = u.activo !== false;
                    const mods = Array.isArray(u.modulos_habilitados) ? u.modulos_habilitados : (ROLES_MODULOS[rolesArr[0]] || []);
                    
                    const badgesRoles = rolesArr.map(r => {
                        if (r === 'admin') return '<span class="profile-tag-badge" style="background:#fef5e7; color:#d35400; border-color:#fad7a0;">👑 Administrador</span>';
                        if (r === 'admisor' || r === 'admisiones') return '<span class="profile-tag-badge" style="background:#e8f4fd; color:#2980b9; border-color:#beddf3;">📥 Admisor</span>';
                        if (r === 'coordinador_grupos' || r === 'coordinador') return '<span class="profile-tag-badge" style="background:#fef3c7; color:#92400e; border-color:#fde68a;">🧩 Coordinador</span>';
                        if (r === 'evaluador') return '<span class="profile-tag-badge" style="background:#f0fdfa; color:#0f766e; border-color:#99f6e4;">🎧 Evaluador</span>';
                        if (r === 'profesor') return '<span class="profile-tag-badge" style="background:#eafaf1; color:#27ae60; border-color:#a9dfbf;">👨‍🏫 Profesor</span>';
                        if (r === 'personalizado') return '<span class="profile-tag-badge" style="background:#f4ecf7; color:#8e44ad; border-color:#d2b4de;">🛠️ Personalizado</span>';
                        return '<span class="profile-tag-badge" style="background:#e8f4fd; color:#2980b9; border-color:#beddf3;">📥 Admisor</span>';
                    }).join(' ');

                    const badgeActivo = esActivo 
                        ? '<span class="status-val-ok">🟢 Activo</span>'
                        : '<span class="status-val-reject">🔴 Inactivo</span>';

                    const profeNom = u.profesor_id && profsMap[u.profesor_id] ? ` • Profe vinculado: <strong>${profsMap[u.profesor_id]}</strong>` : '';

                    h += `
                        <div class="row-item abm-row" style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:10px; cursor:pointer;" onclick="window.abrirEdicionABM('${d.id}', 'usuarios_sistema', '${u.email}')">
                            <div style="flex:1; min-width:240px;">
                                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                    <strong style="color:var(--text-main); font-size:15px;">${u.email}</strong>
                                    ${badgesRoles}
                                    ${badgeActivo}
                                </div>
                                <div style="font-size:12.5px; color:var(--text-muted); margin-top:4px;">
                                    ${u.nombre ? `<span>${u.nombre}</span>` : '<span>Sin nombre de referencia</span>'}
                                    ${profeNom}
                                    <span style="margin-left:8px; font-size:11.5px; color:var(--text-muted);">(${mods.length} módulos autorizados)</span>
                                </div>
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

        // Cargar lista de profesores para vincular
        const selProfLink = document.getElementById('abm-user-profesor-id');
        if (selProfLink) {
            selProfLink.innerHTML = '<option value="">Ninguno / No asociar a profesor</option>';
            const pSnap = await getDocs(collection(db, "profesores"));
            pSnap.forEach(d => {
                const nom = d.data().nombre || d.id;
                selProfLink.innerHTML += `<option value="${d.id}" data-nombre="${nom}">${nom}</option>`;
            });

            selProfLink.onchange = (e) => {
                const opt = selProfLink.selectedOptions[0];
                const profNombre = opt?.getAttribute('data-nombre') || '';
                const inpNom = document.getElementById('abm-user-nombre');
                if (profNombre && inpNom) {
                    inpNom.value = profNombre;
                }
            };
        }

        const aplicarPlantillaRoles = () => {
            const rolesSeleccionados = [];
            document.querySelectorAll('.chk-user-rol:checked').forEach(c => rolesSeleccionados.push(c.value));
            
            // Si no hay roles seleccionados, no pisar
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
                    
                    const rolesCargados = Array.isArray(uData.roles) && uData.roles.length > 0 ? uData.roles : (uData.rol ? [uData.rol] : ['admisor']);
                    document.querySelectorAll('.chk-user-rol').forEach(chk => {
                        chk.checked = rolesCargados.includes(chk.value) || (chk.value === 'admisor' && rolesCargados.includes('admisiones'));
                    });

                    if (selProfLink) selProfLink.value = uData.profesor_id || '';
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
                }
            } catch(e) {}
        } else {
            document.getElementById('abm-user-nombre').value = '';
            document.querySelectorAll('.chk-user-rol').forEach(chk => {
                chk.checked = chk.value === 'admisor';
            });
            aplicarPlantillaRoles();
            if (chkActivo) {
                chkActivo.checked = true;
                if (lblActivo) {
                    lblActivo.textContent = 'Activo';
                    lblActivo.style.color = 'var(--accent-teal)';
                }
            }
            if (selProfLink) selProfLink.value = '';
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
                
                const skills = Array.isArray(pr.skills) ? pr.skills : [];
                if (selSkills) {
                    Array.from(selSkills.options).forEach(opt => {
                        opt.selected = skills.includes(opt.value);
                    });
                    renderChipsSkillsProfe('abm-edit-skills', 'chips-abm-edit-skills');
                }
                
                // Cargar la disponibilidad individual de este profesor
                poblarDisponibilidadLocal(pr.disponibilidad || {}, true);
            }
        } else {
            document.getElementById('abm-edit-correo').value = ''; 
            document.getElementById('abm-edit-celular').value = ''; 
            document.getElementById('abm-edit-alias').value = ''; 
            document.getElementById('abm-edit-entrevista').checked = true;
            document.getElementById('abm-edit-grupales').checked = false;
            document.getElementById('abm-edit-ensambles').checked = false;
            if (selSkills) {
                Array.from(selSkills.options).forEach(opt => opt.selected = false);
                renderChipsSkillsProfe('abm-edit-skills', 'chips-abm-edit-skills');
            }
            poblarDisponibilidadLocal({}, true);
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

// Handler de guardado de modal ABM
document.getElementById('btn-guardar-abm-edit')?.addEventListener('click', async (e) => {
    const btn = e.target;
    const id = document.getElementById('abm-edit-id')?.value;
    const col = document.getElementById('abm-edit-coleccion')?.value;
    const nomVal = (document.getElementById('abm-edit-nombre')?.value || '').trim();

    if (!nomVal) {
        alert(col === 'usuarios_sistema' ? 'Debes ingresar un correo electrónico.' : 'Debes ingresar un nombre.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        if (col === 'usuarios_sistema') {
            const email = nomVal.toLowerCase();
            const nombre = (document.getElementById('abm-user-nombre')?.value || '').trim();
            
            const rolesChecked = [];
            document.querySelectorAll('.chk-user-rol:checked').forEach(c => rolesChecked.push(c.value));
            if (rolesChecked.length === 0) rolesChecked.push('personalizado');
            const rolPrincipal = rolesChecked[0] || 'admisor';

            const profesor_id = document.getElementById('abm-user-profesor-id')?.value || '';
            const activo = document.getElementById('abm-user-activo')?.checked !== false;
            
            const modulosChecked = [];
            document.querySelectorAll('.chk-user-modulo:checked').forEach(c => modulosChecked.push(c.value));

            const userData = {
                email,
                nombre: nombre || email.split('@')[0],
                roles: rolesChecked,
                rol: rolPrincipal,
                profesor_id,
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

            alert(`✅ Permisos de "${email}" guardados correctamente.`);

        } else if (col === 'profesores') {
            const selSkills = document.getElementById('abm-edit-skills');
            const skillsArr = selSkills ? Array.from(selSkills.selectedOptions).map(o => o.value) : [];
            const dispProfe = extraerDisponibilidadLocal(true);
            const dataProfe = {
                nombre: nomVal,
                correo_calendario: document.getElementById('abm-edit-correo')?.value || '',
                celular: document.getElementById('abm-edit-celular')?.value || '',
                alias_transferencia: document.getElementById('abm-edit-alias')?.value || '',
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