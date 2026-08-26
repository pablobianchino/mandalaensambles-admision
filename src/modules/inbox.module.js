// =======================================================================
// src/modules/inbox.module.js -- Flujo de Estados Inbox, Kanban, Filas & Bulk
// =======================================================================

import { getEmojiInstrumento } from "./altas.module.js";
import { db, doc, updateDoc } from "../config/firebase.js";

export function getEstadoYBadge(al, getFechaReferenciaAlumno) {
    let colorIndicador = 'ind-gray', colorBadge = 'bg-gray', claseTexto = 'text-gray', txtTiempo = '', txtEstado = (al.estado_agenda || '').toUpperCase(), fechaCalculo = null;
    const rawEst = al.estado_agenda || '';
    const est = rawEst.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    if (est === 'pendiente procesar') {
        txtEstado = 'SIN AGENDAR';
        colorBadge = 'bg-blue-1';
        colorIndicador = 'ind-blue-1';
    } else if (est === 'pendiente validacion por profe' || est === 'pendiente validacion por evaluador') {
        txtEstado = 'PENDIENTE VALIDACIÓN POR EVALUADOR';
        colorBadge = 'bg-blue-2';
        colorIndicador = 'ind-blue-2';
    } else if (est === 'pendiente validacion por alumno') {
        txtEstado = 'PENDIENTE VALIDACIÓN POR ALUMNO';
        colorBadge = 'bg-blue-3';
        colorIndicador = 'ind-blue-3';
    } else if (est === 'agenda confirmada') {
        txtEstado = 'ENTREVISTA CONFIRMADA';
        colorBadge = 'bg-blue-4';
        colorIndicador = 'ind-blue-4';
    } else if (est === 'lista de espera') {
        txtEstado = 'LISTA DE ESPERA';
        colorBadge = 'bg-amber';
        colorIndicador = 'ind-amber';
    } else if (est === 'validando grupo') {
        txtEstado = 'GRUPOS EN VALIDACIÓN';
        colorBadge = 'bg-purple';
        colorIndicador = 'ind-purple';
    } else if (est === 'pre-alta pendiente') {
        txtEstado = 'ALTA PENDIENTE';
        colorBadge = 'bg-green-1';
        colorIndicador = 'ind-green-1';
    } else if (est === 'pre-alta iniciada') {
        txtEstado = 'ALTA EN CURSO';
        colorBadge = 'bg-green-2';
        colorIndicador = 'ind-green-2';
    } else if (est === 'altas incompletas') {
        txtEstado = 'ALTA CONFIRMADA INCOMPLETA';
        colorBadge = 'bg-green-3';
        colorIndicador = 'ind-green-3';
    } else if (est === 'alta efectiva' || est === 'alta ilegal' || est === 'alta finalizada') {
        let checks = al.checklist_alta || [];
        if (checks.filter(Boolean).length === 5 || est === 'alta finalizada') {
            colorBadge = 'bg-green-4';
            txtEstado = 'ALTA FINALIZADA';
            colorIndicador = 'ind-green-4';
        } else {
            colorBadge = 'bg-green-3';
            txtEstado = 'ALTA CONFIRMADA INCOMPLETA';
            colorIndicador = 'ind-green-3';
        }
    } else if (est.includes('suspendida') || est === 'alta suspendida') {
        txtEstado = rawEst.toUpperCase();
        colorBadge = 'bg-red';
        colorIndicador = 'ind-red';
    }

    if (typeof getFechaReferenciaAlumno === 'function') {
        fechaCalculo = getFechaReferenciaAlumno(al);
    }

    let badgePillHtml = '';
    let nivelUrgencia = 'normal';
    let diffHorasReal = null;

    if (fechaCalculo && !isNaN(fechaCalculo.getTime())) {
        let diffHs = (fechaCalculo - new Date()) / (1000 * 60 * 60);
        diffHorasReal = diffHs;

        if (diffHs < 0) { 
            nivelUrgencia = 'vencido';
            colorIndicador = 'ind-red';
            claseTexto = 'text-red font-bold'; 
            let horas = Math.abs(Math.round(diffHs));
            let dias = Math.floor(horas / 24);
            let txtVencido = dias >= 1 ? (dias === 1 ? `hace 1 día` : `hace ${dias} días`) : `hace ${horas} hs`;
            txtTiempo = `⚠️ Vencida (${txtVencido})`;
            badgePillHtml = `
                <div class="pill-urgencia pill-vencida" style="background:#fee2e2; color:#991b1b; border:1.5px solid #ef4444; font-weight:800; padding:4px 10px; border-radius:18px; font-size:12px; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 3px rgba(239,68,68,0.15);">
                    <span style="font-size:13px;">⚠️</span> <span>VENCIDA (${txtVencido})</span>
                </div>
            `;
        } else if (diffHs <= 24) { 
            nivelUrgencia = 'urgente-24';
            colorIndicador = 'ind-red';
            claseTexto = 'text-red font-bold'; 
            let hsRestantes = Math.round(diffHs);
            txtTiempo = `🔥 Faltan ${hsRestantes} hs (Urgente hoy)`;
            badgePillHtml = `
                <div class="pill-urgencia pill-urgente-24" style="background:#ffedd5; color:#9a3412; border:1.5px solid #f97316; font-weight:800; padding:4px 10px; border-radius:18px; font-size:12px; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 3px rgba(249,115,22,0.15);">
                    <span style="font-size:13px;">🔥</span> <span>FALTAN ${hsRestantes} HS</span>
                </div>
            `;
        } else if (diffHs <= 48) { 
            nivelUrgencia = 'urgente-48';
            colorIndicador = 'ind-yellow';
            claseTexto = 'text-yellow font-bold'; 
            let hsRestantes = Math.round(diffHs);
            txtTiempo = `⏳ Faltan ${hsRestantes} hs (en 1-2 días)`;
            badgePillHtml = `
                <div class="pill-urgencia pill-urgente-48" style="background:#fef9c3; color:#854d0e; border:1.5px solid #eab308; font-weight:700; padding:4px 10px; border-radius:18px; font-size:12px; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 3px rgba(234,179,8,0.12);">
                    <span style="font-size:13px;">⏳</span> <span>FALTAN ${hsRestantes} HS</span>
                </div>
            `;
        } else { 
            nivelUrgencia = 'programado';
            colorIndicador = 'ind-teal';
            claseTexto = 'text-teal'; 
            let dias = Math.round(diffHs / 24);
            txtTiempo = `📅 Faltan ${dias} día${dias > 1 ? 's' : ''}`;
            badgePillHtml = `
                <div class="pill-urgencia pill-programado" style="background:#f0fdf4; color:#166534; border:1px solid #86efac; font-weight:600; padding:3px 9px; border-radius:18px; font-size:11.5px; display:inline-flex; align-items:center; gap:5px;">
                    <span style="font-size:12px;">📅</span> <span>Faltan ${dias} d</span>
                </div>
            `;
        }
    }

    return { colorIndicador, colorBadge, claseTexto, txtTiempo, txtEstado, badgePillHtml, nivelUrgencia, diffHorasReal };
}

export function generarBotonesPrincipalesVisibles(al, id) {
    let html = '';
    const rawEst = al.estado_agenda || '';
    const est = rawEst.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (est === 'pendiente procesar') {
        html += `<button type="button" class="row-quick-btn primary btn-buscar-agenda" data-id="${id}">🔍 Buscar Agenda</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-pasar-espera-directo" data-id="${id}">🛋️ A Lista de Espera</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-nombre-agendar" data-id="${id}">📋 Formato WS</button>`;
    } else if (est === 'pendiente validacion por profe' || est === 'pendiente validacion por evaluador') {
        html += `<button type="button" class="row-quick-btn primary btn-validado-profe-popup" data-id="${id}">✅ Validado por Evaluador</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'pendiente validacion por alumno') {
        html += `<button type="button" class="row-quick-btn primary btn-confirmar-entrevista" data-id="${id}">✅ Confirmar Agenda</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'agenda confirmada') {
        html += `<button type="button" class="row-quick-btn primary btn-admision-finalizada" data-id="${id}">🏁 Admisión Finalizada</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'agenda suspendida') {
        html += `<button type="button" class="row-quick-btn primary btn-recuperar-agenda" data-id="${id}">♻️ Recuperar Agenda</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-copiar-aviso-cancelacion" data-id="${id}">💬 Avisar Cancelación a Profe</button>`;
    } else if (est === 'lista de espera') {
        html += `<button type="button" class="row-quick-btn primary btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
    } else if (est === 'validando grupo') {
        const isConfirmed = al.estado_validacion_alumno === 'confirmado';
        html += `<button type="button" class="row-quick-btn secondary" onclick="window.enviarWhatsAppValidacionGrupo('${id}')">💬 WhatsApp</button>`;
        html += `<button type="button" class="row-quick-btn ${isConfirmed ? 'primary' : 'secondary'}" onclick="window.toggleValidacionAlumnoGrupo('${id}', ${!isConfirmed})">${isConfirmed ? '✔️ Desmarcar' : '✔️ Confirmó'}</button>`;
        html += `<button type="button" class="row-quick-btn primary" onclick="window.aprobarAlumnoIndividualPrealta('${id}')">🚀 Aprobar</button>`;
        html += `<button type="button" class="row-quick-btn danger" onclick="window.rechazarAlumnoGrupoYVolverEspera('${id}')">❌</button>`;
    } else if (est === 'pre-alta pendiente') {
        html += `<button type="button" class="row-quick-btn primary btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
    } else if (est === 'pre-alta iniciada') {
        html += `<button type="button" class="row-quick-btn primary btn-abrir-confirmar-alta" data-id="${id}">✅ Confirmar Alta</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Pre-Alta</button>`;
    } else if (est === 'alta efectiva' || est === 'alta ilegal' || est === 'alta finalizada') {
        let checks = al.checklist_alta || [];
        const esFinalizada = checks.filter(Boolean).length === 5 || est === 'alta finalizada';
        if (!esFinalizada) {
            html += `<button type="button" class="row-quick-btn primary btn-finalizar-alta-directa" data-id="${id}">🏁 Finalizar Alta</button>`;
        }
        html += `<button type="button" class="row-quick-btn secondary btn-reenviar-alta" data-id="${id}">💬 Copiar texto Alta Conf.</button>`;
    } else if (est === 'alta suspendida' || est.includes('suspendida')) {
        html += `<button type="button" class="row-quick-btn primary btn-devolver-espera" data-id="${id}">♻️ Enviar a Espera</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-copiar-aviso-cancelacion" data-id="${id}">💬 Avisar Cancelación a Profe</button>`;
    }

    return html;
}

export function generarBotonesAccion(al, id, esModal = false) {
    let html = '';
    const rawEst = al.estado_agenda || '';
    const est = rawEst.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (esModal) {
        if (est === 'pendiente procesar') {
            html += `<button type="button" class="btn-action-primary btn-buscar-agenda" data-id="${id}">🔍 Buscar Agenda</button>`;
            html += `<button type="button" class="btn-action-neutral btn-pasar-espera-directo" data-id="${id}">🛋️ Pasar a Lista de Espera</button>`;
            html += `<button type="button" class="btn-action-neutral btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
            html += `<button type="button" class="btn-action-neutral btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
        } else if (est === 'pendiente validacion por profe' || est === 'pendiente validacion por evaluador') {
            html += `<button type="button" class="btn-action-primary btn-validado-profe-popup" data-id="${id}">✅ Validado por Evaluador</button>`;
            html += `<button type="button" class="btn-action-neutral btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
            html += `<button type="button" class="btn-action-neutral btn-reenviar-profe" data-id="${id}">💬 Reenviar WhatsApp Evaluador</button>`;
            html += `<button type="button" class="btn-action-neutral btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
            html += `<button type="button" class="btn-action-neutral btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
        } else if (est === 'pendiente validacion por alumno') {
            html += `<button type="button" class="btn-action-primary btn-confirmar-entrevista" data-id="${id}">✅ Confirmar Agenda</button>`;
            html += `<button type="button" class="btn-action-neutral btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
            html += `<button type="button" class="btn-action-neutral btn-reenviar-alumno" data-id="${id}">💬 Reenviar WhatsApp Alumno</button>`;
            html += `<button type="button" class="btn-action-neutral btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
            html += `<button type="button" class="btn-action-neutral btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
        } else if (est === 'agenda confirmada') {
            html += `<button type="button" class="btn-action-primary btn-admision-finalizada" data-id="${id}">🏁 Admisión Finalizada</button>`;
            html += `<button type="button" class="btn-action-neutral btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
            html += `<button type="button" class="btn-action-neutral btn-cancelar-alumno" data-id="${id}">❌ Alumno Cancela</button>`;
            html += `<button type="button" class="btn-action-neutral btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
            html += `<button type="button" class="btn-action-neutral btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
        } else if (est === 'agenda suspendida') {
            html += `<button type="button" class="btn-action-primary btn-recuperar-agenda" data-id="${id}">♻️ Recuperar Agenda</button>`;
            html += `<button type="button" class="btn-action-neutral btn-copiar-aviso-cancelacion" data-id="${id}">💬 Avisar Cancelación a Profe</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        } else if (est === 'lista de espera') {
            html += `<button type="button" class="btn-action-primary btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
            html += `<button type="button" class="btn-action-neutral btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
            html += `<button type="button" class="btn-action-neutral btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
        } else if (est === 'validando grupo') {
            html += `<button type="button" class="btn-action-neutral" onclick="window.editarAlumnoModalDirecto('${id}')">✏️ Editar Ficha</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        } else if (est === 'pre-alta pendiente') {
            html += `<button type="button" class="btn-action-primary btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
            html += `<button type="button" class="btn-action-neutral btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
            html += `<button type="button" class="btn-action-neutral btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
        } else if (est === 'pre-alta iniciada') {
            html += `<button type="button" class="btn-action-primary btn-abrir-confirmar-alta" data-id="${id}">✅ Confirmar Alta</button>`;
            html += `<button type="button" class="btn-action-neutral btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Pre-Alta</button>`;
            html += `<button type="button" class="btn-action-neutral btn-aviso-prealta-alumno" data-id="${id}">💬 WhatsApp Pre-Alta Alumno</button>`;
            html += `<button type="button" class="btn-action-neutral btn-reenviar-prealta" data-id="${id}">💬 WhatsApp Pre-Alta Docente</button>`;
            html += `<button type="button" class="btn-action-neutral btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
            html += `<button type="button" class="btn-action-neutral btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
        } else if (est === 'alta efectiva' || est === 'alta ilegal' || est === 'alta finalizada') {
            let checks = al.checklist_alta || [];
            const esFinalizada = checks.filter(Boolean).length === 5 || est === 'alta finalizada';
            if (!esFinalizada) {
                html += `<button type="button" class="btn-action-primary btn-finalizar-alta-directa" data-id="${id}">🏁 Finalizar Alta</button>`;
            }
            html += `<button type="button" class="btn-action-neutral btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Alta</button>`;
            html += `<button type="button" class="btn-action-neutral btn-aviso-prealta-alumno" data-id="${id}">💬 WhatsApp Pre-Alta Alumno</button>`;
            html += `<button type="button" class="btn-action-neutral btn-reenviar-alta" data-id="${id}">💬 Copiar texto Alta Conf.</button>`;
            html += `<button type="button" class="btn-action-neutral btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
            html += `<button type="button" class="btn-action-neutral btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
        } else if (est === 'alta suspendida' || est.includes('suspendida')) {
            html += `<button type="button" class="btn-action-primary btn-devolver-espera" data-id="${id}">♻️ Enviar a Espera</button>`;
            html += `<button type="button" class="btn-action-neutral btn-copiar-aviso-cancelacion" data-id="${id}">💬 Avisar Cancelación a Profe</button>`;
            html += `<button type="button" class="btn-action-neutral btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        }
        return html;
    }

    if (est === 'pendiente procesar') {
        html += `<button type="button" class="dropdown-item btn-pasar-espera-directo" data-id="${id}">🛋️ Pasar a Lista de Espera</button>`;
        html += `<button type="button" class="dropdown-item btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        html += `<button type="button" class="dropdown-item btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'pendiente validacion por profe' || est === 'pendiente validacion por evaluador') {
        html += `<button type="button" class="dropdown-item btn-reenviar-profe" data-id="${id}">💬 Reenviar WhatsApp Evaluador</button>`;
        html += `<button type="button" class="dropdown-item btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        html += `<button type="button" class="dropdown-item btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'pendiente validacion por alumno') {
        html += `<button type="button" class="dropdown-item btn-reenviar-alumno" data-id="${id}">💬 Reenviar WhatsApp Alumno</button>`;
        html += `<button type="button" class="dropdown-item btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        html += `<button type="button" class="dropdown-item btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'agenda confirmada') {
        html += `<button type="button" class="dropdown-item btn-cancelar-alumno" data-id="${id}">❌ Alumno Cancela</button>`;
        html += `<button type="button" class="dropdown-item btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        html += `<button type="button" class="dropdown-item btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'agenda suspendida') {
        html += `<button type="button" class="dropdown-item btn-copiar-aviso-cancelacion" data-id="${id}">💬 Avisar Cancelación a Profe</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
    } else if (est === 'lista de espera') {
        html += `<button type="button" class="dropdown-item btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Agenda WS</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        html += `<button type="button" class="dropdown-item btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'validando grupo') {
        html += `<button type="button" class="dropdown-item" onclick="window.editarAlumnoModalDirecto('${id}')">✏️ Editar Ficha</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
    } else if (est === 'pre-alta pendiente') {
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        html += `<button type="button" class="dropdown-item btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'pre-alta iniciada') {
        html += `<button type="button" class="dropdown-item btn-aviso-prealta-alumno" data-id="${id}">💬 WhatsApp Pre-Alta Alumno</button>`;
        html += `<button type="button" class="dropdown-item btn-reenviar-prealta" data-id="${id}">💬 WhatsApp Pre-Alta Docente</button>`;
        html += `<button type="button" class="dropdown-item btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        html += `<button type="button" class="dropdown-item btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'alta efectiva' || est === 'alta ilegal' || est === 'alta finalizada') {
        html += `<button type="button" class="dropdown-item btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Alta</button>`;
        html += `<button type="button" class="dropdown-item btn-aviso-prealta-alumno" data-id="${id}">💬 WhatsApp Pre-Alta Alumno</button>`;
        html += `<button type="button" class="dropdown-item btn-reenviar-alta" data-id="${id}">💬 Copiar texto Alta Conf.</button>`;
        html += `<button type="button" class="dropdown-item btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
        html += `<button type="button" class="dropdown-item btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
    } else if (est === 'alta suspendida' || est.includes('suspendida')) {
        html += `<button type="button" class="dropdown-item btn-copiar-aviso-cancelacion" data-id="${id}">💬 Avisar Cancelación a Profe</button>`;
        html += `<button type="button" class="dropdown-item btn-abrir-nueva-suscripcion" data-id="${id}">➕ Nueva Suscripción</button>`;
    }

    return html;
}

export function renderSegmentedTabs(vista) {
    const cont = document.getElementById('segmented-tabs-container');
    if (!cont) return;

    let subVistas = [];
    if (vista.startsWith('Inbox')) {
        subVistas = [
            { label: 'Pendientes', vista: 'Inbox - Pendientes' },
            { label: 'Confirmadas', vista: 'Inbox - Confirmadas' },
            { label: 'Suspendidas', vista: 'Inbox - Suspendidas' }
        ];
    } else if (vista.startsWith('Altas')) {
        subVistas = [
            { label: 'Pendientes', vista: 'Altas - Pendientes' },
            { label: 'Finalizadas', vista: 'Altas - Finalizadas' },
            { label: 'Suspendidas', vista: 'Altas - Suspendidas' }
        ];
    } else if (vista.startsWith('Match')) {
        subVistas = [
            { label: 'Sugerencias', vista: 'Match - Pendientes' },
            { label: 'En Validacion', vista: 'Match - En Validacion' },
            { label: 'Confirmados', vista: 'Match - Confirmados' }
        ];
    }

    if (subVistas.length > 0) {
        cont.style.display = 'flex';
        cont.innerHTML = subVistas.map(sv => `
            <button type="button" class="segmented-tab ${sv.vista === vista ? 'active' : ''}" data-vista="${sv.vista}">${sv.label}</button>
        `).join('');

        cont.querySelectorAll('.segmented-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetVista = e.currentTarget.getAttribute('data-vista');
                if (targetVista && typeof window.cargarVistaGlobal === 'function') {
                    window.cargarVistaGlobal(targetVista);
                }
            });
        });
    } else {
        cont.style.display = 'none';
        cont.innerHTML = '';
    }
}