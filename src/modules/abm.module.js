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

export function renderConfig(cont, configApp = defaultCfg, callbacks = {}) { 
    const { setBotonCargando, cargarConfig } = callbacks;
    cont.innerHTML = `<div style="margin-bottom:25px; font-size:0.9em; color:var(--text-muted);"><span style="cursor:pointer; color:var(--accent-teal);" onclick="window.cargarVistaGlobal('Configuracion')">Configuracion</span> &gt; <strong style="color:var(--text-main);">Ajustes Generales</strong></div><div style="max-width:800px; padding:30px; background:white; border-radius:12px; border:1px solid var(--border-color);"> <h3 style="margin-top:0; color:var(--text-main); font-size:1.2em;">Limites de Calendario</h3> <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"> <div style="flex:1; min-width:150px;"><label>Hora Apertura:<input type="time" id="cfg-apertura" class="modern-input" value="${configApp.hora_apertura||'09:00'}"></label></div> <div style="flex:1; min-width:150px;"><label>Hora Cierre:<input type="time" id="cfg-cierre" class="modern-input" value="${configApp.hora_cierre||'22:00'}"></label></div> </div> <div style="display:flex; gap:15px; margin-bottom:25px; flex-wrap:wrap;"> <div style="flex:1; min-width:150px;"><label>Aulas totales:<input type="number" id="cfg-aulas" class="modern-input" value="${configApp.cantidad_aulas}"></label></div> <div style="flex:1; min-width:150px;"><label>Baterias totales:<input type="number" id="cfg-bats" class="modern-input" value="${configApp.cantidad_baterias}"></label></div> </div> <h3 style="margin-top:0; color:var(--text-main); border-top:1px solid var(--border-color); padding-top:20px;">Calendario y Emojis</h3> <label style="margin-bottom:15px;">Calendario Defecto:<input type="email" id="cfg-cal-defecto" class="modern-input" value="${configApp.calendario_por_defecto||''}"></label> <div style="display:flex; gap:10px; margin-bottom:25px; flex-wrap:wrap;"> <div style="width:80px;"><label>Bateria:<input type="text" id="cfg-idbat" class="modern-input" value="${configApp.identificador_bateria||''}"></label></div> <div style="width:80px;"><label>Guitarra:<input type="text" id="cfg-em-gui" class="modern-input" value="${configApp.emoji_guitarra||'🎸'}"></label></div> <div style="width:80px;"><label>Cajon:<input type="text" id="cfg-em-caj" class="modern-input" value="${configApp.emoji_cajon||'📦'}"></label></div> <div style="width:80px;"><label>Canto:<input type="text" id="cfg-em-can" class="modern-input" value="${configApp.emoji_canto||'🎤'}"></label></div> <div style="width:80px;"><label>Piano:<input type="text" id="cfg-em-pia" class="modern-input" value="${configApp.emoji_piano||'🎹'}"></label></div> <div style="width:80px;"><label>Bajo:<input type="text" id="cfg-em-baj" class="modern-input" value="${configApp.emoji_bajo||'🎸'}"></label></div> </div> <h3 style="margin-top:0; color:var(--text-main); border-top:1px solid var(--border-color); padding-top:20px;">Mensajes y Textos</h3> <label style="margin-bottom:15px;">Valor de Clase (Monto): <input type="text" id="cfg-valor" class="modern-input" value="${configApp.valor_clase}"></label> <label style="margin-bottom:15px;">Titulo Evento (Reserva): <input type="text" id="cfg-evt-res" class="modern-input" value="${configApp.formato_evento_reserva}"></label> <label style="margin-bottom:15px;">Titulo Evento (Confirmado): <input type="text" id="cfg-evt-conf" class="modern-input" value="${configApp.formato_evento_confirmado}"></label> <label style="margin-bottom:15px;">Nombre para Agendar (WS): <input type="text" id="cfg-nombre-agendar" class="modern-input" value="${configApp.texto_nombre_agendar}"></label> <label style="margin-bottom:15px;">Texto Opciones Multiples: <textarea id="cfg-txt-opt-mul" class="modern-input" style="height:200px;">${configApp.texto_opciones_multiples}</textarea></label> <label style="margin-bottom:15px;">Texto 1 Sola Opcion: <textarea id="cfg-txt-p" class="modern-input" style="height:150px;">${configApp.texto_profe}</textarea></label> <label style="margin-bottom:15px;">Texto Confirmacion Alumno: <textarea id="cfg-txt-conf-a" class="modern-input" style="height:150px;">${configApp.texto_conf_alumno}</textarea></label> <label style="margin-bottom:15px;">Texto Cancelacion: <textarea id="cfg-txt-cancela" class="modern-input" style="height:100px;">${configApp.texto_cancela_alumno}</textarea></label> <label style="margin-bottom:15px;">Texto Pre-Alta: <textarea id="cfg-txt-prealta" class="modern-input" style="height:150px;">${configApp.texto_prealta}</textarea></label> <label style="margin-bottom:20px;">Texto Nueva Alta: <textarea id="cfg-txt-alta-conf" class="modern-input" style="height:150px;">${configApp.texto_alta_confirmada}</textarea></label> <button id="btn-guardar-cfg" class="btn-primary" style="width:100%;">Guardar Configuracion</button> </div>`; 
    document.getElementById('btn-guardar-cfg')?.addEventListener('click', async (e) => { 
        if (typeof setBotonCargando === 'function') setBotonCargando(e.target, true); 
        await setDoc(doc(db, "configuracion", "general"), { 
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
            texto_conf_alumno: document.getElementById('cfg-txt-conf-a').value, 
            texto_cancela_alumno: document.getElementById('cfg-txt-cancela').value, 
            texto_prealta: document.getElementById('cfg-txt-prealta').value, 
            texto_alta_confirmada: document.getElementById('cfg-txt-alta-conf').value 
        }, { merge: true }); 
        if (typeof cargarConfig === 'function') await cargarConfig(); 
        if (typeof setBotonCargando === 'function') setBotonCargando(e.target, false); 
        alert('Guardado.'); 
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
            alert('Configuracion de Match guardada correctamente.');
        } catch(err) {
            alert('Error al guardar configuracion de Match: ' + err.message);
        }

        if (typeof setBotonCargando === 'function') setBotonCargando(btn, false);
    });
}

// -----------------------------------------------------------------------
// Render de ABM (Profesores, Instrumentos, Suscripciones, Usuarios)
// -----------------------------------------------------------------------
export async function cargarABM(coleccion, titulo, cont) { 
    window.coleccionABMActual = coleccion; 
    window.tituloABMActual = titulo; 
    
    let h = `
    <div style="margin-bottom:20px; font-size:0.9em; color:var(--text-muted);">
        <span style="cursor:pointer; color:var(--accent-teal);" onclick="window.cargarVistaGlobal('Configuracion')">Configuracion</span> &gt; <strong style="color:var(--text-main);">${titulo}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; width:100%;">
        <button class="btn-primary" onclick="window.abrirEdicionABM(null, '${coleccion}')">ï¼‹ Agregar ${titulo}</button>
    </div>`; 

    try { 
        const qS = await getDocs(collection(db, coleccion)); 
        if (qS.empty) { 
            h += `<div style="color:var(--text-muted); padding:20px;">No hay registros cargados.</div>`; 
        } else { 
            qS.forEach(d => { 
                const dt = d.data(); 
                const displayNom = coleccion === 'usuarios_sistema' ? dt.email : dt.nombre; 
                let ex = ''; 
                if (coleccion === 'profesores') { 
                    ex = `<div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Calendario: ${dt.correo_calendario || 'Sin asignar'} | Cel: ${dt.celular || '-'}</div>`; 
                } 
                h += `<div class="row-item abm-row" onclick="window.abrirEdicionABM('${d.id}', '${coleccion}', '${displayNom}', '${dt.correo_calendario||''}', '${dt.celular||''}', '${dt.alias_transferencia||''}')"><div><strong style="color:var(--text-main); font-size:15px;">${displayNom}</strong>${ex}</div><button class="btn-row-action" onclick="event.stopPropagation(); window.eliminarABM('${d.id}', '${coleccion}')">🗑️ï¸</button></div>`; 
            }); 
        } 
    } catch(e) { 
        h += `<div style="color:var(--accent-red); padding:20px;">Error al cargar.</div>`; 
    } 
    cont.innerHTML = h; 
}

export function abrirEdicionABM(id, col, nom = '', cor = '', cel = '', ali = '', callbacks = {}) { 
    const { syncSelectToChips, poblarDisponibilidadMultiRango } = callbacks;
    document.getElementById('abm-edit-id').value = id || ''; 
    document.getElementById('abm-edit-coleccion').value = col; 
    document.getElementById('label-abm-edit-nombre').innerHTML = col === 'usuarios_sistema' ? `Correo: <input type="text" id="abm-edit-nombre" class="modern-input" required>` : `Nombre: <input type="text" id="abm-edit-nombre" class="modern-input" required>`; 
    document.getElementById('abm-edit-nombre').value = nom || '';
    
    const tituloModal = document.querySelector('#modal-abm-edit h3');
    if (tituloModal) {
        const nombreEntidad = col === 'usuarios_sistema' ? 'Usuario' : (col === 'profesores' ? 'Profesor' : (col === 'instrumentos' ? 'Instrumento' : 'Suscripcion'));
        tituloModal.textContent = id ? `Editar ${nombreEntidad}` : `Nuevo ${nombreEntidad}`;
    }

    if (col === 'profesores') { 
        document.getElementById('div-abm-edit-profe').style.display='block'; 
        document.getElementById('abm-edit-correo').value = cor || ''; 
        document.getElementById('abm-edit-celular').value = cel || ''; 
        document.getElementById('abm-edit-alias').value = ali || ''; 

        document.getElementById('abm-edit-entrevista').checked = !id;
        document.getElementById('abm-edit-grupales').checked = false;
        document.getElementById('abm-edit-ensambles').checked = false;

        const selSkills = document.getElementById('abm-edit-skills');
        if (selSkills) {
            getDocs(collection(db, "instrumentos")).then(iSnap => {
                selSkills.innerHTML = '';
                iSnap.forEach(d => {
                    const instNom = d.data().nombre;
                    selSkills.innerHTML += `<option value="${instNom}">${instNom}</option>`;
                });
                
                if (id) {
                    getDoc(doc(db, "profesores", id)).then(snap => {
                        if (snap.exists()) {
                            const pr = snap.data();
                            document.getElementById('abm-edit-entrevista').checked = !!pr.entrevista;
                            document.getElementById('abm-edit-grupales').checked = !!pr.grupales;
                            document.getElementById('abm-edit-ensambles').checked = !!pr.ensambles;
                            const skills = pr.skills || [];
                            Array.from(selSkills.options).forEach(opt => {
                                opt.selected = skills.includes(opt.value);
                            });
                            if (typeof syncSelectToChips === 'function') {
                                syncSelectToChips('abm-edit-skills', 'chips-abm-edit-skills');
                            }
                        }
                    });
                } else {
                    if (typeof syncSelectToChips === 'function') {
                        syncSelectToChips('abm-edit-skills', 'chips-abm-edit-skills');
                    }
                }
            });
        }

        if (typeof poblarDisponibilidadMultiRango === 'function') {
            if (id) { 
                getDoc(doc(db, "profesores", id)).then(snap => { 
                    if(snap.exists()) poblarDisponibilidadMultiRango(snap.data().disponibilidad || {}, true); 
                    else poblarDisponibilidadMultiRango({}, true); 
                }); 
            } else { 
                poblarDisponibilidadMultiRango({}, true); 
            } 
        }
    } else { 
        document.getElementById('div-abm-edit-profe').style.display='none'; 
    } 
    document.getElementById('modal-abm-edit')?.showModal(); 
}

export async function eliminarABM(id, col, callbacks = {}) { 
    const { cargarVista } = callbacks;
    if (await window.confirmar('?Eliminar registro?', 'Esta accion no se puede deshacer.', 'Eliminar')) { 
        await deleteDoc(doc(db, col, id)); 
        if (typeof cargarVista === 'function') {
            cargarVista('ABM-' + window.tituloABMActual); 
        }
    } 
}

// Window Global Bindings
window.abrirEdicionABM = abrirEdicionABM;
window.eliminarABM = eliminarABM;