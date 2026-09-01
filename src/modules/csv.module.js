// =======================================================================
// src/modules/csv.module.js — Importación y Carga Masiva CSV para Lista de Espera
// =======================================================================

import { db, addDoc, collection } from '../config/firebase.js';

let alumnosCSVEnMemoria = [];

/**
 * Parsea un contenido CSV respetando estándar RFC 4180 (comillas, saltos de línea y comas).
 */
export function parseCSV(content) {
    const lines = [];
    let curLine = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const c = content[i];
        if (c === '"') {
            if (inQuotes && content[i + 1] === '"') {
                curLine += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && content[i + 1] === '\n') i++;
            if (curLine.trim().length > 0) lines.push(curLine);
            curLine = '';
        } else {
            curLine += c;
        }
    }
    if (curLine.trim().length > 0) lines.push(curLine);
    return lines.map(parseCSVLine);
}

function parseCSVLine(text) {
    const p = [];
    let cur = '';
    let inQuotes = false;
    
    // Detección inteligente del delimitador más probable (coma, punto y coma o tab)
    let delim = ',';
    if (!text.includes(',') && text.includes(';')) delim = ';';
    else if (!text.includes(',') && !text.includes(';') && text.includes('\t')) delim = '\t';
    else if (text.includes(';') && (text.match(/;/g) || []).length > (text.match(/,/g) || []).length) delim = ';';
    else if (text.includes('\t') && (text.match(/\t/g) || []).length > (text.match(/,/g) || []).length) delim = '\t';

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (inQuotes && text[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === delim && !inQuotes) {
            p.push(cur);
            cur = '';
        } else {
            cur += c;
        }
    }
    p.push(cur);
    return p;
}

function parseHoraVal(val) {
    if (!val) return '09:00';
    let s = val.toString().trim().replace('.', ':');
    let h = 0, m = 0;
    if (s.includes(':')) {
        const parts = s.split(':');
        h = parseInt(parts[0], 10) || 0;
        m = parseInt(parts[1], 10) || 0;
    } else {
        h = parseInt(s, 10) || 0;
    }

    // Si la hora es un número bajo (1 a 7), en el contexto de escuela de música vespertina corresponde a la tarde (13 a 19)
    if (h >= 1 && h <= 7) {
        h += 12;
    }

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function parseDisponibilidadCelda(celda) {
    if (!celda) return [];
    let str = celda.trim().toLowerCase();
    if (!str || str === 'no' || str === '-' || str === '?' || str === 'consultar' || str === 'x') return [];
    if (str === 'all' || str === 'flex' || str === 'si' || str === 'ideal' || str === 'libre' || str.includes('acomodable')) {
        return [{ inicio: '09:00', fin: '22:00' }];
    }
    if (str === 'am') return [{ inicio: '09:00', fin: '14:00' }];
    if (str === 'pm') return [{ inicio: '14:00', fin: '22:00' }];

    const partes = str.split(/[;,]/).map(p => p.trim()).filter(Boolean);
    const rangos = [];

    partes.forEach(p => {
        let clean = p.replace(/\+/g, '').replace(/a partir de las/g, '').replace(/hs/g, '').replace(/acomodable/g, '').replace(/\(ideal\)/g, '').trim();
        if (p.includes('+') || p.includes('desde')) {
            let horaIni = parseHoraVal(clean);
            rangos.push({ inicio: horaIni, fin: '22:00' });
        } else if (clean.includes('-') || clean.includes(' a ')) {
            let parts = clean.split(/[-a]/).map(x => x.trim()).filter(Boolean);
            if (parts.length >= 2) {
                rangos.push({ inicio: parseHoraVal(parts[0]), fin: parseHoraVal(parts[1]) });
            } else if (parts.length === 1) {
                rangos.push({ inicio: parseHoraVal(parts[0]), fin: '22:00' });
            }
        } else {
            let h = parseInt(clean, 10);
            if (!isNaN(h) && h >= 1 && h <= 23) {
                rangos.push({ inicio: parseHoraVal(clean), fin: '22:00' });
            }
        }
    });

    return rangos.length > 0 ? rangos : [];
}

export function normalizarSuscripcion(str) {
    if (!str) return 'Ensamble';
    let s = str.toLowerCase();
    if (s.includes('grupal')) return 'Clases Grupales';
    if (s.includes('ensamble')) return 'Ensamble';
    if (s.includes('indiv')) return 'Clase Individual';
    return 'Ensamble';
}

export function normalizarNivel(str) {
    if (!str) return 'Inicial I';
    let s = str.trim().toLowerCase();
    if (s.includes('inicial 1') || (s.includes('inicial i') && !s.includes('inicial ii'))) return 'Inicial I';
    if (s.includes('inicial 2') || s.includes('inicial ii')) return 'Inicial II';
    if (s.includes('intermedio')) return 'Intermedio';
    if (s.includes('avanzado')) return 'Avanzado';
    return 'Inicial I';
}

export function normalizarInstrumento(str) {
    if (!str) return ['Canto'];
    const parts = str.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    const validos = ['Canto', 'Guitarra', 'Bajo', 'Batería', 'Bateria', 'Piano', 'Teclado', 'Saxo', 'Ukelele', 'Cajón', 'Cajon'];
    const insts = [];
    parts.forEach(p => {
        let match = validos.find(v => v.toLowerCase() === p.toLowerCase());
        if (match) {
            if (match === 'Bateria') match = 'Batería';
            if (match === 'Cajon') match = 'Cajón';
            insts.push(match);
        } else {
            insts.push(p);
        }
    });
    return insts.length > 0 ? insts : ['Canto'];
}

export function normalizarPerfilTags(texto) {
    if (!texto) return [];
    const tagsPosibles = [
        { tag: '😊 Buena onda', terms: ['buena onda', 'copada', 'copado', 'simpatica', 'simpatico', 'agradable', 'divina', 'divino'] },
        { tag: '🙈 Tímido', terms: ['timido', 'timida', 'insegura', 'inseguro', 'nerviosa', 'nervioso', 'inseguridades'] },
        { tag: '🎉 Extrovertido', terms: ['extrovertido', 'extrovertida', 'manija', 'sociable', 'entusiasta'] },
        { tag: '🦄 Raro', terms: ['raro', 'rara', 'personaje', 'vueltero', 'conflictivo'] },
        { tag: '🗣️ Muy hablador', terms: ['hablador', 'charlatan', 'charlera', 'charlero', 'habla mucho'] },
        { tag: '🌱 Humilde', terms: ['humilde', 'tranquilo', 'tranquila', 'sencillo', 'receptivo', 'educado', 'respetuoso'] }
    ];
    const tagsEncontrados = [];
    const lower = texto.toLowerCase();
    tagsPosibles.forEach(t => {
        if (t.terms.some(term => lower.includes(term))) {
            tagsEncontrados.push(t.tag);
        }
    });
    return tagsEncontrados;
}

function formatearChipsDia(codigoDia, rangos) {
    if (!rangos || rangos.length === 0) return '';
    return rangos.map(r => {
        let str = '';
        if (r.inicio === '09:00' && r.fin === '22:00') {
            str = 'Flex';
        } else if (r.fin === '22:00' || r.fin === '23:00') {
            str = `${r.inicio.replace(':00', '')}+`;
        } else {
            const hIni = r.inicio.replace(':00', '');
            const hFin = r.fin.replace(':00', '');
            str = `${hIni}-${hFin}`;
        }
        return `<span style="background:rgba(0,123,143,0.08); color:#005b6a; padding:1px 5px; border-radius:4px; font-weight:700; font-size:11px; margin-right:3px; white-space:nowrap; border:1px solid rgba(0,123,143,0.2);">${codigoDia} ${str}</span>`;
    }).join('');
}

/**
 * Procesa las filas crudas del archivo CSV ordenado según las especificaciones del usuario.
 */
export function procesarFilasCSV(filas, alumnosExistentesBD = []) {
    if (!filas || filas.length === 0) return [];
    
    let startIndex = 0;
    const primeraFilaStr = (filas[0] || []).join(' ').toLowerCase();
    if (primeraFilaStr.includes('nombre') || primeraFilaStr.includes('dias esperando') || primeraFilaStr.includes('celu')) {
        startIndex = 1;
    }

    const alumnos = [];
    const fnCrearHistorial = window.crearEntradaHistorial || ((txt, tipo, aut) => ({ id: Date.now(), fecha: new Date().toLocaleDateString(), texto: txt, tipo: tipo || 'sistema', autor: aut || 'Sistema' }));

    for (let i = startIndex; i < filas.length; i++) {
        const row = filas[i];
        if (!row || row.length === 0) continue;
        
        const nombreRaw = (row[0] || '').trim();
        if (!nombreRaw) continue;

        // Descartar filas separadoras o de títulos de categoría
        const celdasNoVacias = row.filter(c => c && c.trim().length > 0);
        if (celdasNoVacias.length <= 1) continue;
        const nombreUpper = nombreRaw.toUpperCase();
        if (nombreUpper.includes('CLASES DE') || nombreUpper.includes('🧩') || nombreUpper.includes('🚲') || nombreUpper.includes('EN ESPERA DE') || nombreUpper.includes('LISTA DE ESPERA')) {
            continue;
        }

        const diasEspRaw = parseInt((row[1] || '').trim(), 10);
        const diasContRaw = parseInt((row[2] || '').trim(), 10);
        const diasEsperando = isNaN(diasEspRaw) ? null : diasEspRaw;
        const diasContacto = isNaN(diasContRaw) ? diasEsperando : diasContRaw;

        const celuRaw = (row[3] || '').trim();
        const edadRaw = (row[4] || '').trim();
        const instRaw = (row[5] || '').trim();
        const suscRaw = (row[6] || '').trim();
        const nivelRaw = (row[7] || '').trim();

        // Disponibilidad L M X J V S (columnas 8, 9, 10, 11, 12, 13)
        const dispL = parseDisponibilidadCelda(row[8]);
        const dispM = parseDisponibilidadCelda(row[9]);
        const dispX = parseDisponibilidadCelda(row[10]);
        const dispJ = parseDisponibilidadCelda(row[11]);
        const dispV = parseDisponibilidadCelda(row[12]);
        const dispS = parseDisponibilidadCelda(row[13]);

        // Derivado a (evaluador) columna 15
        const evaluadorRaw = (row[15] || '').trim();
        // Fecha entrevista columna 18
        const fechaEntrevistaRaw = (row[18] || '').trim();
        // Detalle (columna 20) -> va a historial y descripcion
        const detalleRaw = (row[20] || '').trim();
        // Devolución técnica (columna 21) -> va a informe
        const devolucionRaw = (row[21] || '').trim();
        // Perfil Psicológico (columna 22) -> va a tags e informe
        const perfilRaw = (row[22] || '').trim();

        const edadNum = parseInt(edadRaw, 10);
        const instrumentos = normalizarInstrumento(instRaw);
        const suscripcion = normalizarSuscripcion(suscRaw);
        const nivel = normalizarNivel(nivelRaw);
        const perfilTags = normalizarPerfilTags(perfilRaw);

        // Comprobación de duplicados por nombre
        const nombreNorm = nombreRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const yaExiste = alumnosExistentesBD.some(e => {
            const eNorm = (e.nombre || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return eNorm === nombreNorm;
        });

        // Construir historial inicial
        const historialInicial = [];
        if (detalleRaw) {
            historialInicial.push(fnCrearHistorial(`Detalle inicial: ${detalleRaw}`, 'nota', 'CSV Import'));
        }
        historialInicial.push(fnCrearHistorial('Importado a Lista de Espera mediante carga masiva CSV.', 'sistema', 'CSV Import'));

        let informeHtml = '';
        if (devolucionRaw || perfilRaw) {
            informeHtml = `<p><strong>Devolución de entrevista:</strong> ${devolucionRaw || 'Sin detalle técnico'}</p>`;
            if (perfilRaw) {
                informeHtml += `<p><strong>Perfil emocional/psicológico:</strong> ${perfilRaw}</p>`;
            }
        }

        const alumnoObj = {
            id_temporal: `csv_${Date.now()}_${i}`,
            nombre: nombreRaw,
            celular: celuRaw,
            edad: isNaN(edadNum) ? null : edadNum,
            instrumento: instrumentos,
            instrumento_asignado: instrumentos[0] || 'Canto',
            tipo_suscripcion: suscripcion,
            nivel: nivel,
            disponibilidad: {
                L: dispL,
                M: dispM,
                X: dispX,
                J: dispJ,
                V: dispV,
                S: dispS,
                lunes: dispL,
                martes: dispM,
                miercoles: dispX,
                jueves: dispJ,
                viernes: dispV,
                sabado: dispS
            },
            reserva_profe_nombre: evaluadorRaw || null,
            reserva_fecha_texto: fechaEntrevistaRaw || null,
            descripcion: detalleRaw ? `<p>${detalleRaw.replace(/\n/g, '<br>')}</p>` : '',
            informe_admision: informeHtml,
            perfil_psicologico: perfilTags,
            estado_agenda: 'Lista de espera',
            dias_esperando_historico: diasEsperando,
            dias_contacto_historico: diasContacto,
            fecha_ingreso_espera: diasEsperando !== null ? new Date(Date.now() - diasEsperando * 24 * 3600 * 1000).toISOString() : new Date().toISOString(),
            fecha_ultimo_contacto: diasContacto !== null ? new Date(Date.now() - diasContacto * 24 * 3600 * 1000).toISOString() : new Date().toISOString(),
            historial: historialInicial,
            origen_creacion: 'Carga Masiva CSV',
            es_bicicleta: Boolean(nombreRaw.includes('🚲') || detalleRaw.toLowerCase().includes('bicicleta') || perfilRaw.toLowerCase().includes('bicicleta')),
            es_duplicado: yaExiste
        };

        alumnos.push(alumnoObj);
    }

    return alumnos;
}

/**
 * Abre el modal de previsualización interactiva con tabla y checkboxes.
 */
export function mostrarModalPreviewCSV(alumnos) {
    alumnosCSVEnMemoria = alumnos;
    const dialog = document.getElementById('modal-preview-csv-espera');
    if (!dialog) return;

    const conteoElem = document.getElementById('preview-csv-conteo');
    const tableWrapper = document.getElementById('preview-csv-table-wrapper');
    const btnConfirmar = document.getElementById('btn-confirmar-importacion-csv');
    const progressBar = document.getElementById('preview-csv-progress-bar');
    
    if (progressBar) progressBar.style.display = 'none';

    const cantDuplicados = alumnos.filter(a => a.es_duplicado).length;
    const cantNuevos = alumnos.length - cantDuplicados;

    if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = `Confirmar Importación (${alumnos.length})`;
    }

    if (conteoElem) {
        let msgConteo = `<strong>${alumnos.length}</strong> alumnos detectados (${cantNuevos} nuevos`;
        if (cantDuplicados > 0) {
            msgConteo += `, <span style="color:#9c6500; font-weight:700;">⚠️ ${cantDuplicados} ya existen en BD</span>`;
        }
        msgConteo += `)`;
        conteoElem.innerHTML = msgConteo;
    }

    if (tableWrapper) {
        if (alumnos.length === 0) {
            tableWrapper.innerHTML = `
                <div style="padding:40px; text-align:center; color:var(--text-muted);">
                    ⚠️ No se detectaron filas válidas de alumnos en el archivo CSV seleccionado.
                </div>`;
        } else {
            let rowsHtml = alumnos.map((al, idx) => {
                const disp = al.disponibilidad || {};
                const chipsL = formatearChipsDia('L', disp.L || disp.lunes);
                const chipsM = formatearChipsDia('M', disp.M || disp.martes);
                const chipsX = formatearChipsDia('X', disp.X || disp.miercoles);
                const chipsJ = formatearChipsDia('J', disp.J || disp.jueves);
                const chipsV = formatearChipsDia('V', disp.V || disp.viernes);
                const chipsS = formatearChipsDia('S', disp.S || disp.sabado);

                const totalChips = chipsL + chipsM + chipsX + chipsJ + chipsV + chipsS;
                const dispHtml = totalChips.trim().length > 0 
                    ? `<div style="display:flex; flex-wrap:wrap; gap:3px; max-width:280px;">${totalChips}</div>` 
                    : '<span style="color:#d99a29; font-style:italic;">Sin horarios especificados</span>';

                const badgeDuplicado = al.es_duplicado 
                    ? `<span style="background:rgba(217, 154, 41, 0.12); color:#9c6500; padding:1px 6px; border-radius:4px; font-weight:700; font-size:10px; border:1px solid rgba(217, 154, 41, 0.25); display:inline-block; margin-top:2px;">⚠️ Ya existe</span>` 
                    : '';

                const rowBg = al.es_duplicado ? 'background:rgba(217, 154, 41, 0.04);' : '';

                return `
                <tr style="border-bottom:1px solid var(--border-color); font-size:12.5px; ${rowBg}">
                    <td style="padding:8px 10px; text-align:center;">
                        <input type="checkbox" class="chk-csv-row" data-idx="${idx}" ${al.es_duplicado ? '' : 'checked'} style="width:16px; height:16px; accent-color:var(--accent-teal); cursor:pointer;">
                    </td>
                    <td style="padding:8px 10px; font-weight:700; color:var(--text-main); white-space:nowrap;">
                        <div>${al.nombre}</div>
                        ${badgeDuplicado}
                    </td>
                    <td style="padding:8px 10px; color:var(--text-muted); white-space:nowrap;">
                        ${al.celular || '-'}
                    </td>
                    <td style="padding:8px 10px; text-align:center;">
                        ${al.edad ? al.edad + ' a.' : '-'}
                    </td>
                    <td style="padding:8px 10px; white-space:nowrap;">
                        <span style="background:rgba(0,123,143,0.1); color:var(--accent-teal); padding:2px 6px; border-radius:4px; font-weight:600; font-size:11px;">
                            ${al.instrumento.join(', ')}
                        </span>
                    </td>
                    <td style="padding:8px 10px; white-space:nowrap;">
                        <span style="background:rgba(125,91,166,0.12); color:#7d5ba6; padding:2px 6px; border-radius:4px; font-weight:600; font-size:11px;">
                            🧩 ${al.tipo_suscripcion}
                        </span>
                    </td>
                    <td style="padding:8px 10px; white-space:nowrap; font-weight:600;">
                        ${al.nivel}
                    </td>
                    <td style="padding:8px 10px;">
                        ${dispHtml}
                    </td>
                    <td style="padding:8px 10px; color:var(--text-muted); font-size:11px; white-space:nowrap;">
                        ${al.reserva_profe_nombre || '-'}
                    </td>
                </tr>`;
            }).join('');

            tableWrapper.innerHTML = `
                <table style="width:100%; border-collapse:collapse; text-align:left;">
                    <thead style="background:var(--hover-bg); position:sticky; top:0; z-index:1; border-bottom:2px solid var(--border-color);">
                        <tr style="font-size:11.5px; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.04em;">
                            <th style="padding:10px; text-align:center; width:35px;">✓</th>
                            <th style="padding:10px;">Nombre</th>
                            <th style="padding:10px;">Celular</th>
                            <th style="padding:10px; text-align:center;">Edad</th>
                            <th style="padding:10px;">Instrumento</th>
                            <th style="padding:10px;">Suscripción</th>
                            <th style="padding:10px;">Nivel</th>
                            <th style="padding:10px;">Disponibilidad (L-S)</th>
                            <th style="padding:10px;">Evaluador</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>`;

            // Actualizar estado de checkbox general
            const checkedCount = document.querySelectorAll('.chk-csv-row:checked').length;
            const allChk = document.getElementById('chk-select-all-csv');
            if (allChk) allChk.checked = (checkedCount === alumnos.length);
            if (btnConfirmar) btnConfirmar.textContent = `Confirmar Importación (${checkedCount})`;
        }
    }

    dialog.showModal();
}

/**
 * Ejecuta la importación en lotes hacia Firestore para los alumnos seleccionados en la tabla,
 * validando antes los duplicados y pidiendo confirmación explícita al usuario.
 */
export async function ejecutarImportacionMasiva(onProgress, onComplete) {
    const checkboxes = document.querySelectorAll('.chk-csv-row:checked');
    const seleccionados = [];
    checkboxes.forEach(chk => {
        const idx = parseInt(chk.getAttribute('data-idx'), 10);
        if (alumnosCSVEnMemoria[idx]) {
            seleccionados.push(alumnosCSVEnMemoria[idx]);
        }
    });

    if (seleccionados.length === 0) {
        alert("Por favor selecciona al menos un alumno para importar.");
        return;
    }

    // Validación de Duplicados
    const duplicadosSeleccionados = seleccionados.filter(al => al.es_duplicado);
    if (duplicadosSeleccionados.length > 0) {
        const listaNombres = duplicadosSeleccionados.map(a => `• ${a.nombre}`).join('\n');
        const confirmMsg = `⚠️ Se detectaron ${duplicadosSeleccionados.length} alumno(s) que YA EXISTEN en la base de datos:\n\n${listaNombres}\n\n¿Deseas cargarlos IGUALMENTE como repetidos?\n\n- "Aceptar": Carga a todos los seleccionados (incluyendo duplicados).\n- "Cancelar": Descarta los duplicados (se desmarcarán de la lista) para que importes solo los nuevos.`;
        const deseaCargarRepetidos = confirm(confirmMsg);
        
        if (!deseaCargarRepetidos) {
            // Deseleccionar duplicados en la UI
            document.querySelectorAll('.chk-csv-row:checked').forEach(chk => {
                const idx = parseInt(chk.getAttribute('data-idx'), 10);
                if (alumnosCSVEnMemoria[idx] && alumnosCSVEnMemoria[idx].es_duplicado) {
                    chk.checked = false;
                }
            });
            const allChk = document.getElementById('chk-select-all-csv');
            if (allChk) allChk.checked = false;
            const newCount = document.querySelectorAll('.chk-csv-row:checked').length;
            const btnConfirmar = document.getElementById('btn-confirmar-importacion-csv');
            if (btnConfirmar) {
                btnConfirmar.textContent = `Confirmar Importación (${newCount})`;
                btnConfirmar.disabled = false;
            }
            alert(`ℹ️ Se han desmarcado los ${duplicadosSeleccionados.length} alumnos duplicados. Ahora puedes hacer clic en "Confirmar Importación" para cargar solo los nuevos.`);
            return;
        }
    }

    const total = seleccionados.length;
    let guardados = 0;

    for (let i = 0; i < total; i++) {
        const alumno = seleccionados[i];
        const alumnoParaGuardar = { ...alumno };
        delete alumnoParaGuardar.id_temporal;
        delete alumnoParaGuardar.es_duplicado;

        try {
            await addDoc(collection(db, "alumnos"), alumnoParaGuardar);
            guardados++;
            if (onProgress) onProgress(guardados, total);
        } catch (err) {
            console.error("Error al importar alumno:", alumno.nombre, err);
        }
    }

    if (onComplete) onComplete(guardados, total);
}
