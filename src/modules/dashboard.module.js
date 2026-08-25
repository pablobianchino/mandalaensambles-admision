// =======================================================================
// src/modules/dashboard.module.js -- Metricas, Timeline interactivo & Charts
// =======================================================================

import { configNodosFlujo } from "../config/constants.js";
import { db, collection, getDocs } from "../config/firebase.js";

let chartFlowInst = null;
let chartEntrevistasInst = null;
let chartAltasInst = null;

export function extraerInstrumentos(inst) {
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
}

export function extraerSuscripcion(sus) {
    if (!sus) return 'Sin especificar';
    if (Array.isArray(sus)) {
        const arr = sus.map(x => String(x || '').trim()).filter(Boolean);
        return arr.length > 0 ? arr.join(', ') : 'Sin especificar';
    }
    if (typeof sus === 'string') return sus.trim() || 'Sin especificar';
    return String(sus).trim() || 'Sin especificar';
}

export function renderTimelineUnificado(containerId, configNodos, datos, callbacks = {}) {
    const { generarBotonesPrincipalesVisibles, generarBotonesAccion } = callbacks;
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
                let percentage = totalNodes > 1 ? (index / (totalNodes - 1)) * 100 : 50;
                if (percentage < 15) percentage = 15;
                if (percentage > 85) percentage = 85;
                trayContent.style.setProperty('--tray-arrow-pos', `${percentage}%`);
                
                if (nodeData.length === 0) {
                    trayContent.innerHTML = `<span style="color:var(--text-muted); font-size:13px; font-weight:500;">No hay alumnos en esta etapa.</span>`;
                } else {
                    trayContent.innerHTML = nodeData.map(al => {
                        let details = [];
                        if(al.edad) details.push(`${al.edad}a`);
                        
                        let instStr = Array.isArray(al.instrumento) ? al.instrumento.join(', ') : al.instrumento;
                        let instParts = [];
                        if(instStr) instParts.push(`<strong style="color:var(--accent-teal)">${instStr}</strong>`);
                        if(al.nivel) instParts.push(`<span class="match-student-tag nivel" style="font-size:10px; padding:1px 6px;">${al.nivel}</span>`);
                        if(al.tipo_suscripcion) instParts.push(`<strong style="color:var(--accent-purple, #7d5ba6)">🧩 ${al.tipo_suscripcion}</strong>`);
                        if(instParts.length > 0) details.push(instParts.join(' '));

                        const rolDocente = index <= 4 ? 'Evaluador' : 'Profe';
                        if(al.reserva_profe_nombre) details.push(`${rolDocente}: ${al.reserva_profe_nombre}`);
                        if(al.grupo_asignado) details.push(`Grupo: ${al.grupo_asignado}`);

                        // Fecha de entrevista solo en etapas previas a Lista de Espera (índices 0 a 3)
                        const esEtapaEntrevista = index < 4;
                        if(esEtapaEntrevista) {
                            if(al.opciones_propuestas && al.opciones_propuestas.length > 1) {
                                details.push(`<strong style="color:var(--accent-teal); font-weight:700;">📅 Opciones: ${al.opciones_propuestas.map(o => `${o.letra || '-'}: ${o.fechaTexto}`).join(' / ')}</strong>`);
                            } else if(al.reserva_fecha_texto) {
                                details.push(`<strong style="color:var(--accent-teal); font-weight:700;">📅 Entrevista: ${al.reserva_fecha_texto}</strong>`);
                            }
                        }

                        // Inicio de Alta en etapas de Grupos en Validación y Altas (índices >= 5)
                        if(index >= 5 && al.fecha_inicio_clases) { 
                            try {
                                const f = new Date(al.fecha_inicio_clases);
                                if (!isNaN(f.getTime())) {
                                    details.push(`<strong style="color:var(--accent-teal); font-weight:700;">📅 Inicio de Alta: ${f.getDate()}/${f.getMonth()+1}</strong>`);
                                }
                            } catch(e) {}
                        }
                        
                        let detailsHtml = details.length > 0 ? `<div style="font-size:11px; color:var(--text-muted); line-height:1.4; display:flex; flex-wrap:wrap; gap:4px; row-gap:2px; align-items:center;"><span>${details.join('</span><span style="opacity:0.5">•</span><span>')}</span></div>` : '';
                        
                        const botonesVisibles = typeof generarBotonesPrincipalesVisibles === 'function' ? generarBotonesPrincipalesVisibles(al, al.id) : '';
                        const botonesSecundarios = typeof generarBotonesAccion === 'function' ? generarBotonesAccion(al, al.id) : '';
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

export async function renderCharts(callbacks = {}) {
    const { cargarVista } = callbacks;
    const cont = document.getElementById('estadisticas-container');
    if (!cont) return;

    cont.innerHTML = `
        <div class="metrics-grid">
            <div class="chart-card full-width">
                <div class="chart-canvas-wrapper tall">
                    <canvas id="chartFlow"></canvas>
                </div>
            </div>

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

            <div class="chart-card full-width">
                <div class="chart-canvas-wrapper">
                    <canvas id="chartAltasPorMes"></canvas>
                </div>
            </div>

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

        let flowLabels = configNodosFlujo.map(n => n.label);
        let flowData   = configNodosFlujo.map(n => allData.filter(d => n.filterFn ? n.filterFn(d) : d.estado_agenda === n.id).length);
        let phaseColors = configNodosFlujo.map(n => n.hexColor || '#1f5491');

        let entConf = allData.filter(d => d.estado_agenda === 'Agenda confirmada').length;
        let entSusp = allData.filter(d => d.estado_agenda === 'Agenda suspendida').length;

        let altFin  = allData.filter(d => (d.estado_agenda === 'Alta Efectiva' || d.estado_agenda === 'Alta Ilegal') && (d.checklist_alta && d.checklist_alta.filter(Boolean).length === 5)).length;
        let altSusp = allData.filter(d => d.estado_agenda === 'Alta Suspendida').length;

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

        const suscMap = {};
        allData.forEach(d => {
            const sus = extraerSuscripcion(d.tipo_suscripcion);
            suscMap[sus] = (suscMap[sus] || 0) + 1;
        });
        const suscLabels = Object.keys(suscMap).sort((a, b) => suscMap[b] - suscMap[a]);
        const suscData   = suscLabels.map(k => suscMap[k]);
        const suscPalette = ['#007b8f','#31a364','#e5a93d','#8e44ad','#c2563b','#256bbb','#74a9d8','#1b7f47'];

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

        [chartFlowInst, chartEntrevistasInst, chartAltasInst].forEach(c => c && c.destroy());
        if (window.chartInstrumentoInst) window.chartInstrumentoInst.destroy();
        if (window.chartSuscripcionInst) window.chartSuscripcionInst.destroy();
        if (window.chartAltasPorMesInst) window.chartAltasPorMesInst.destroy();
        if (window.chartConversionInst)  window.chartConversionInst.destroy();

        const hoverCursor = (event, chartElement) => {
            if (event.native && event.native.target) event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
        };

        const ctxFlow = document.getElementById('chartFlow');
        if (ctxFlow) {
            chartFlowInst = new Chart(ctxFlow, {
                type: 'bar',
                data: { labels: flowLabels, datasets: [{ label: 'Alumnos', data: flowData, backgroundColor: phaseColors, borderRadius: 5 }] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (evt, elements) => { 
                        if (elements?.length > 0 && typeof cargarVista === 'function') { 
                            const nodo = configNodosFlujo[elements[0].index]; 
                            if (nodo?.vistaDestino) cargarVista(nodo.vistaDestino); 
                        } 
                    },
                    onHover: hoverCursor,
                    plugins: { title: { display: true, text: 'Flow de Admisión — Alumnos por etapa', font: { size: 14, weight: 'bold' }, padding: { bottom: 8 } }, legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } }, x: { ticks: { font: { size: 10.5 } } } }
                }
            });
        }

        const ctxEnt = document.getElementById('chartEntrevistas');
        if (ctxEnt) {
            chartEntrevistasInst = new Chart(ctxEnt, {
                type: 'doughnut',
                data: { labels: ['Confirmadas', 'Suspendidas'], datasets: [{ data: [entConf, entSusp], backgroundColor: ['#007b8f', '#c2563b'] }] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
                    onClick: (evt, elements) => { 
                        if (elements?.length > 0 && typeof cargarVista === 'function') {
                            cargarVista(elements[0].index === 0 ? 'Inbox - Confirmadas' : 'Inbox - Suspendidas'); 
                        }
                    },
                    onHover: hoverCursor,
                    plugins: {
                        title: { display: true, text: 'Entrevistas', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } },
                        legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } }
                    }
                }
            });
        }

        const ctxAlt = document.getElementById('chartAltas');
        if (ctxAlt) {
            chartAltasInst = new Chart(ctxAlt, {
                type: 'doughnut',
                data: { labels: ['Finalizadas', 'Suspendidas'], datasets: [{ data: [altFin, altSusp], backgroundColor: ['#007b8f', '#c2563b'] }] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
                    onClick: (evt, elements) => { 
                        if (elements?.length > 0 && typeof cargarVista === 'function') {
                            cargarVista(elements[0].index === 0 ? 'Altas - Finalizadas' : 'Altas - Suspendidas'); 
                        }
                    },
                    onHover: hoverCursor,
                    plugins: {
                        title: { display: true, text: 'Altas', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } },
                        legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } }
                    }
                }
            });
        }

        const ctxInst = document.getElementById('chartInstrumento');
        if (ctxInst) {
            window.chartInstrumentoInst = new Chart(ctxInst, {
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
        }

        const ctxSusc = document.getElementById('chartSuscripcion');
        if (ctxSusc) {
            window.chartSuscripcionInst = new Chart(ctxSusc, {
                type: 'doughnut',
                data: { labels: suscLabels, datasets: [{ data: suscData, backgroundColor: suscPalette.slice(0, suscLabels.length) }] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
                    plugins: {
                        title: { display: true, text: 'Alumnos por Tipo de Suscripcion', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } },
                        legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10.5 } } },
                        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / (allData.length || 1) * 100)}%)` } }
                    }
                }
            });
        }

        const ctxAltMes = document.getElementById('chartAltasPorMes');
        if (ctxAltMes) {
            window.chartAltasPorMesInst = new Chart(ctxAltMes, {
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
                    plugins: { title: { display: true, text: 'Altas confirmadas por mes (ultimos 12 meses)', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } }, legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } }, x: { ticks: { font: { size: 11 } } } }
                }
            });
        }

        const ctxConv = document.getElementById('chartConversion');
        if (ctxConv) {
            window.chartConversionInst = new Chart(ctxConv, {
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
                        title: { display: true, text: 'Conversion a Alta por Instrumento', font: { size: 13, weight: 'bold' }, padding: { bottom: 6 } },
                        legend: { labels: { boxWidth: 10, font: { size: 11 } } },
                        tooltip: {
                            callbacks: {
                                afterBody: (items) => {
                                    const idx = items[0].dataIndex;
                                    const total = convTotal[idx];
                                    const alta = convAlta[idx];
                                    return total > 0 ? [`Tasa de conversion: ${Math.round(alta / total * 100)}%`] : [];
                                }
                            }
                        }
                    },
                    scales: { x: { stacked: true, ticks: { font: { size: 10.5 } } }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } } }
                }
            });
        }

    } catch(e) { console.error('Error renderCharts:', e); }
}