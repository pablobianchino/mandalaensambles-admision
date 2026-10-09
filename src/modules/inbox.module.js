// =======================================================================
// src/modules/inbox.module.js -- Flujo de Estados Inbox, Kanban, Filas & Bulk
// =======================================================================

import { getEmojiInstrumento } from "./altas.module.js";
import { esAlumnoAltaFinalizada, calcularDiasHabilesTranscurridos } from "../config/constants.js?v=6.10.0";
import { db, doc, updateDoc } from "../config/firebase.js";

export function getEstadoYBadge(al, getFechaReferenciaAlumno) {
    let colorIndicador = 'ind-gray', colorBadge = 'bg-gray', claseTexto = 'text-gray', txtTiempo = '', txtEstado = (al.estado_agenda || '').toUpperCase(), fechaCalculo = null;
    const rawEst = al.estado_agenda || '';
    const est = rawEst.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    if (al.seguimiento?.activo === true) {
        txtEstado = 'SEGUIMIENTO ACTIVO';
        colorBadge = 'bg-teal';
        colorIndicador = 'ind-teal';
    } else if (est === 'pendiente procesar') {
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
    } else if (est === 'agenda confirmada' || est === 'entrevista confirmada' || est.startsWith('entrevista')) {
        txtEstado = 'ENTREVISTA CONFIRMADA';
        colorBadge = 'bg-blue-4';
        colorIndicador = 'ind-blue-4';
    } else if (est === 'lista de espera') {
        txtEstado = 'LISTA DE ESPERA';
        colorBadge = 'bg-amber';
        colorIndicador = 'ind-amber';
    } else if (est === 'validando grupo') {
        txtEstado = 'GRUPO EN VALIDACIÓN';
        colorBadge = 'bg-purple';
        colorIndicador = 'ind-purple';
    } else if (est === 'pre-alta pendiente') {
        txtEstado = 'PRE-ALTA PENDIENTE';
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
        if (esAlumnoAltaFinalizada(al)) {
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
        const esSegActivo = al.seguimiento && al.seguimiento.activo === true;
        
        if (esSegActivo && al.seguimiento.fecha_proximo_seguimiento) {
            const estaContactado = Boolean(al.seguimiento.contactado);

            if (estaContactado) {
                const fCtto = al.seguimiento.fecha_contacto || al.seguimiento.fecha_mensaje_enviado || fechaCalculo;
                const diasHabilesSinRespuesta = calcularDiasHabilesTranscurridos(fCtto);
                if (diasHabilesSinRespuesta >= 2) {
                    nivelUrgencia = 'reintento-24';
                    colorIndicador = 'ind-orange';
                    claseTexto = 'text-orange font-bold';
                    txtTiempo = `🔁 Reintentar (+${diasHabilesSinRespuesta}d)`;
                    badgePillHtml = `<span class="pill-urgencia" style="background:#ffedd5; color:#9a3412; border:1px solid #fed7aa;" title="Reintentar contacto: Pasaron ${diasHabilesSinRespuesta} días hábiles desde el mensaje sin respuesta del alumno">🔁 Reintentar (+${diasHabilesSinRespuesta}d sin respuesta)</span>`;
                    diffHorasReal = -24;
                } else {
                    nivelUrgencia = 'esperando-respuesta';
                    colorIndicador = 'ind-teal';
                    claseTexto = 'text-teal font-bold';
                    txtTiempo = `⏳ Esperando respuesta`;
                    badgePillHtml = '';
                    diffHorasReal = 24;
                }
            } else {
                const parts = String(al.seguimiento.fecha_proximo_seguimiento).split('-');
                if (parts.length === 3) {
                    const anio = parseInt(parts[0], 10);
                    const mes = parseInt(parts[1], 10) - 1;
                    const dia = parseInt(parts[2], 10);
                    const hoy = new Date();
                    const hoyInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
                    const fechaPautada = new Date(anio, mes, dia).getTime();
                    const diffDias = Math.round((hoyInicio - fechaPautada) / (24 * 60 * 60 * 1000));
                    const pTxt = `${String(dia).padStart(2,'0')}/${String(mes+1).padStart(2,'0')}/${anio}`;

                    if (diffDias >= 2) {
                        nivelUrgencia = 'vencido';
                        colorIndicador = 'ind-red';
                        claseTexto = 'text-red font-bold';
                        txtTiempo = `🔴 Vencido (+${diffDias}d)`;
                        badgePillHtml = `<span class="pill-urgencia pill-rojo-critico" title="Vencido: ${diffDias} días de retraso (Pactado: ${pTxt})">🔴 Vencido</span>`;
                        diffHorasReal = -48;
                    } else if (diffDias === 1) {
                        nivelUrgencia = 'urgente-24';
                        colorIndicador = 'ind-red';
                        claseTexto = 'text-red font-bold';
                        txtTiempo = `🟠 Retraso leve (+24h)`;
                        badgePillHtml = `<span class="pill-urgencia pill-naranja-retraso" title="Retraso leve: 1 día (+24hs) (Pactado: ${pTxt})">🟠 Retraso leve</span>`;
                        diffHorasReal = -24;
                    } else if (diffDias === 0) {
                        nivelUrgencia = 'urgente-48';
                        colorIndicador = 'ind-yellow';
                        claseTexto = 'text-yellow font-bold';
                        txtTiempo = `🟡 Vence hoy`;
                        badgePillHtml = `<span class="pill-urgencia pill-amarillo-hoy" title="Vence hoy: Llegó la fecha para hacer feedback (${pTxt})">🟡 Vence hoy</span>`;
                        diffHorasReal = 0;
                    } else if (diffDias === -1) {
                        nivelUrgencia = 'programado';
                        colorIndicador = 'ind-teal';
                        claseTexto = 'text-teal';
                        txtTiempo = `🟢 En término`;
                        badgePillHtml = `<span class="pill-urgencia pill-verde-plazo" title="En término: Mañana es el día de feedback (${pTxt})">🟢 En término</span>`;
                        diffHorasReal = 24;
                    } else {
                        nivelUrgencia = 'futuro-lejano';
                        colorIndicador = 'ind-teal';
                        claseTexto = 'text-teal';
                        txtTiempo = `🟢 En término`;
                        badgePillHtml = `<span class="pill-urgencia pill-verde-plazo" title="En término: Próximo contacto el ${pTxt}">🟢 En término</span>`;
                        diffHorasReal = 48;
                    }
                }
            }
        }

        if (!badgePillHtml) {
            const hoy = new Date();
            const hoyInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
            const fechaEventoInicio = new Date(fechaCalculo.getFullYear(), fechaCalculo.getMonth(), fechaCalculo.getDate()).getTime();
            const diffDiasCalendario = Math.round((fechaEventoInicio - hoyInicio) / (24 * 60 * 60 * 1000));
            const diffHs = (fechaCalculo - new Date()) / (1000 * 60 * 60);
            diffHorasReal = diffHs;

            if (diffHs < 0) { 
                nivelUrgencia = 'vencido';
                colorIndicador = 'ind-red';
                claseTexto = 'text-red font-bold'; 
                let horas = Math.abs(Math.round(diffHs));
                let dias = Math.floor(horas / 24);
                let txtVencido = dias >= 1 ? (dias === 1 ? `hace 1 día` : `hace ${dias} días`) : `hace ${horas} hs`;
                txtTiempo = `🔴 Vencido (${txtVencido})`;
                badgePillHtml = `<span class="pill-urgencia pill-rojo-critico" title="Vencida (${txtVencido})">🔴 Vencido</span>`;
            } else if (diffDiasCalendario === 0) { 
                nivelUrgencia = 'urgente-48'; // 'Vence hoy'
                colorIndicador = 'ind-yellow';
                claseTexto = 'text-yellow font-bold'; 
                let hsRestantes = Math.round(diffHs);
                txtTiempo = `🟡 Hoy (${hsRestantes} hs)`;
                badgePillHtml = `<span class="pill-urgencia pill-amarillo-hoy" title="Es hoy (${hsRestantes} hs restantes)">🟡 Hoy</span>`;
            } else if (diffDiasCalendario === 1) { 
                nivelUrgencia = 'programado'; // 'En término / Mañana'
                colorIndicador = 'ind-teal';
                claseTexto = 'text-teal'; 
                txtTiempo = `🟢 Mañana`;
                badgePillHtml = `<span class="pill-urgencia pill-verde-plazo" title="Programada para mañana">🟢 En término</span>`;
            } else { 
                nivelUrgencia = 'futuro-lejano';
                colorIndicador = 'ind-teal';
                claseTexto = 'text-teal'; 
                txtTiempo = `🟢 En término`;
                badgePillHtml = `<span class="pill-urgencia pill-verde-plazo" title="En término: En ${diffDiasCalendario} días">🟢 En término</span>`;
            }
        }
    }

    return { colorIndicador, colorBadge, claseTexto, txtTiempo, txtEstado, badgePillHtml, nivelUrgencia, diffHorasReal };
}

export function generarBotonesPrincipalesVisibles(al, id) {
    if (window.modoVistaSimple) {
        return '';
    }

    let html = '';
    const rawEst = al.estado_agenda || '';
    const est = rawEst.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (al.seguimiento?.activo === true) {
        html += `<button type="button" class="row-quick-btn primary btn-seg-contactar" data-id="${id}" title="Registrar feedback de seguimiento">💬 Nuevo Feedback</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-seg-finalizar" data-id="${id}" title="Finalizar seguimiento">🏁 Finalizar</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-seg-ver-informe" data-id="${id}" title="Ver informe de admisión">👁️ Ver Informe</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-seg-ver-seguimiento" data-id="${id}" title="Ver seguimiento del alumno">👁️ Ver Seguimiento</button>`;
        return html;
    }

    if (est === 'pendiente procesar') {
        html += `<button type="button" class="row-quick-btn primary btn-buscar-agenda" data-id="${id}">🔍 Buscar Agenda</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-pasar-espera-directo" data-id="${id}">🛋️ A Lista de Espera</button>`;
    } else if (est === 'pendiente validacion por profe' || est === 'pendiente validacion por evaluador') {
        html += `<button type="button" class="row-quick-btn primary btn-validado-profe-popup" data-id="${id}">✅ Validado por Evaluador</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'pendiente validacion por alumno') {
        html += `<button type="button" class="row-quick-btn primary btn-confirmar-entrevista" data-id="${id}">✅ Confirmar Agenda</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'agenda confirmada' || est === 'entrevista confirmada' || est.startsWith('entrevista')) {
        html += `<button type="button" class="row-quick-btn primary btn-admision-finalizada" data-id="${id}">🏁 Finalizar Admisión</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-buscar-agenda" data-id="${id}">🔄 Re-Agendar</button>`;
    } else if (est === 'agenda suspendida') {
        html += `<button type="button" class="row-quick-btn primary btn-recuperar-agenda" data-id="${id}">♻️ Recuperar Agenda</button>`;
    } else if (est === 'lista de espera') {
        const esBici = !!al.es_bicicleta;
        html += `<button type="button" class="row-quick-btn secondary btn-ver-informe-espera" data-id="${id}">👁️ Ver Informe</button>`;
        if (!esBici) {
            html += `<button type="button" class="row-quick-btn primary btn-abrir-propuesta-espera" data-id="${id}">🧩 Armar Propuesta</button>`;
        }
    } else if (est === 'validando grupo') {
        const isConfirmed = al.estado_validacion_alumno === 'confirmado';
        html += `<button type="button" class="row-quick-btn secondary" onclick="window.enviarWhatsAppValidacionGrupo('${id}')">💬 Avisar a Alumno</button>`;
        html += `<button type="button" class="row-quick-btn ${isConfirmed ? 'primary' : 'secondary'}" onclick="window.toggleValidacionAlumnoGrupo('${id}', ${!isConfirmed})">${isConfirmed ? '✔️ Desmarcar' : '✔️ Confirmó'}</button>`;
        html += `<button type="button" class="row-quick-btn primary" onclick="window.aprobarAlumnoIndividualPrealta('${id}')">🚀 Aprobar</button>`;
        html += `<button type="button" class="row-quick-btn danger" onclick="window.rechazarAlumnoGrupoYVolverEspera('${id}')">❌</button>`;
    } else if (est === 'pre-alta pendiente') {
        html += `<button type="button" class="row-quick-btn primary btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
    } else if (est === 'pre-alta iniciada') {
        html += `<button type="button" class="row-quick-btn primary btn-abrir-confirmar-alta" data-id="${id}">💳 Suscripción Abonada</button>`;
        html += `<button type="button" class="row-quick-btn secondary btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Pre-Alta</button>`;
    } else if (est === 'alta efectiva' || est === 'alta ilegal' || est === 'alta finalizada' || est === 'alta confirmada' || est.startsWith('alta')) {
        const esFinalizada = esAlumnoAltaFinalizada(al);
        if (!esFinalizada) {
            html += `<button type="button" class="row-quick-btn primary btn-finalizar-alta-directa" data-id="${id}">🏁 Finalizar Alta</button>`;
        }
        html += `<button type="button" class="row-quick-btn secondary btn-aviso-alta-alumno" data-id="${id}">💬 Avisar a Alumno</button>`;
        if (esFinalizada) {
            html += `<button type="button" class="row-quick-btn secondary btn-seg-ver-informe" data-id="${id}">👁️ Ver Informe</button>`;
            html += `<button type="button" class="row-quick-btn secondary btn-seg-ver-seguimiento" data-id="${id}">👁️ Ver Seguimiento</button>`;
        }
    } else if (est === 'alta suspendida' || est === 'baja' || est === 'agenda suspendida' || est.includes('suspendid')) {
        html += `<button type="button" class="row-quick-btn primary btn-reingresar-alumno" data-id="${id}">🔄 Reingresar</button>`;
    }

    return html;
}

export function generarBotonesAccion(al, id, esModal = false, vista = '') {
    let html = '';
    const rawEst = al.estado_agenda || '';
    const est = rawEst.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const vistaActiva = vista || window.estadoActualVista || '';
    const esVistaSeguimiento = typeof vistaActiva === 'string' && (
        vistaActiva.toLowerCase().includes('seguimiento') ||
        vistaActiva === 'Altas - Seguimientos'
    );
    const esFinalizada = esAlumnoAltaFinalizada(al);
    const esAdmin = typeof window.esUsuarioAdministrador === 'function' ? window.esUsuarioAdministrador() : false;

    // Helper para asignar la clase correcta según sea Modal o Dropdown 3 puntos (⋮)
    const btnClass = (isPrimary = false) => esModal ? (isPrimary ? 'btn-action-primary' : 'btn-action-neutral') : 'dropdown-item';

    // 13 & 14. Bajas / Suspendidos (Acciones Unificadas)
    if (est === 'alta suspendida' || est === 'baja' || est === 'agenda suspendida' || est.includes('suspendid') || vistaActiva.toLowerCase().includes('suspendid') || vistaActiva.toLowerCase().includes('baja')) {
        html += `<button type="button" class="${btnClass(true)} btn-reingresar-alumno" data-id="${id}">🔄 Reingresar Alumno</button>`;
        html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
        if (esModal) {
            html += `<button type="button" class="${btnClass()} btn-seg-ver-informe" data-id="${id}">📄 Ver Informe</button>`;
        }
        if (esAdmin) {
            html += `<button type="button" class="${btnClass()} btn-eliminar-ficha-directo" data-id="${id}" style="color:var(--accent-red); font-weight:700; ${esModal ? 'border-color:var(--accent-red); margin-top:4px;' : 'border-top:1px solid var(--border-color); margin-top:2px;'}">🗑️ Eliminar Ficha</button>`;
        }
        return html;
    }

    // 1. Inbox > Sin Agendar
    if (est === 'pendiente procesar' || vistaActiva === 'Inbox - Pendientes') {
        html += `<button type="button" class="${btnClass(true)} btn-buscar-agenda" data-id="${id}">🔍 Buscar Agenda</button>`;
        html += `<button type="button" class="${btnClass()} btn-pasar-espera-directo" data-id="${id}">🛋️ Pasar a Lista de Espera</button>`;
        html += `<button type="button" class="${btnClass()} btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Contacto</button>`;
        html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
        html += `<button type="button" class="${btnClass()} btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } 
    // 2. Inbox > Validando Evaluador
    else if (est === 'pendiente validacion por profe' || est === 'pendiente validacion por evaluador') {
        html += `<button type="button" class="${btnClass(true)} btn-validado-profe-popup" data-id="${id}">✅ Validado por Evaluador</button>`;
        html += `<button type="button" class="${btnClass()} btn-buscar-agenda" data-id="${id}">🗓️ Re-Agendar</button>`;
        html += `<button type="button" class="${btnClass()} btn-reenviar-profe" data-id="${id}">💬 Avisar a Evaluador</button>`;
        html += `<button type="button" class="${btnClass()} btn-cancelar-alumno" data-id="${id}">❌ Alumno Cancela</button>`;
        html += `<button type="button" class="${btnClass()} btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Contacto</button>`;
        html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
        html += `<button type="button" class="${btnClass()} btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } 
    // 3. Inbox > Validando Alumno
    else if (est === 'pendiente validacion por alumno') {
        html += `<button type="button" class="${btnClass(true)} btn-confirmar-entrevista" data-id="${id}">✅ Confirmar Agenda</button>`;
        html += `<button type="button" class="${btnClass()} btn-buscar-agenda" data-id="${id}">🗓️ Re-Agendar</button>`;
        html += `<button type="button" class="${btnClass()} btn-reenviar-alumno" data-id="${id}">💬 Avisar a Alumno</button>`;
        html += `<button type="button" class="${btnClass()} btn-cancelar-alumno" data-id="${id}">❌ Alumno Cancela</button>`;
        html += `<button type="button" class="${btnClass()} btn-nombre-agendar" data-id="${id}">📋 Copiar Formato Contacto</button>`;
        html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
        html += `<button type="button" class="${btnClass()} btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } 
    // 4. Inbox > Entrevista Confirmada
    else if (est === 'agenda confirmada' || est === 'entrevista confirmada' || est.startsWith('entrevista') || vistaActiva === 'Inbox - Confirmadas') {
        html += `<button type="button" class="${btnClass(true)} btn-admision-finalizada" data-id="${id}">🏁 Finalizar Admisión</button>`;
        html += `<button type="button" class="${btnClass()} btn-enviar-conf-alumno" data-id="${id}">💬 Avisar a Alumno</button>`;
        html += `<button type="button" class="${btnClass()} btn-enviar-conf-profe" data-id="${id}">💬 Avisar a Evaluador</button>`;
        html += `<button type="button" class="${btnClass()} btn-copiar-facturacion-admision" data-id="${id}">💰 Copiar Facturación</button>`;
        html += `<button type="button" class="${btnClass()} btn-buscar-agenda" data-id="${id}">🗓️ Re-Agendar</button>`;
        if (esAdmin) {
            html += `<button type="button" class="${btnClass()} btn-auditar-cal-directo" data-id="${id}">🔍 Auditar calendario</button>`;
        }
        html += `<button type="button" class="${btnClass()} btn-cancelar-alumno" data-id="${id}">❌ Alumno Cancela</button>`;
        html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
        html += `<button type="button" class="${btnClass()} btn-suspender" data-id="${id}">⏸️ Suspender</button>`;
    } 
    // 5. Lista de Espera
    else if (est === 'lista de espera' || est === 'espera' || vistaActiva === 'Lista de Espera') {
        const esBici = !!al.es_bicicleta;
        const celSafe = (al.celular || al.telefono || '').replace(/'/g, "\\'");
        const nombreSafe = (al.nombre || '').replace(/'/g, "\\'");
        html += `<button type="button" class="${btnClass(true)} btn-ver-informe-espera" data-id="${id}">👁️ Ver Informe</button>`;
        if (!esBici) {
            html += `<button type="button" class="${btnClass(true)} btn-abrir-propuesta-espera" data-id="${id}">🧩 Armar Propuesta</button>`;
        }
        html += `<button type="button" class="${btnClass()} btn-recall-espera" onclick="window.abrirModalRegistrarContacto('${id}', '${nombreSafe}', '${celSafe}', ${esBici})">☎️ Recall</button>`;
        if (!esBici) {
            html += `<button type="button" class="${btnClass()}" onclick="window.toggleBicicletaAlumno('${id}', true, '${nombreSafe}')">🚲 Enviar a Bicicleta</button>`;
        } else {
            html += `<button type="button" class="${btnClass()}" onclick="window.toggleBicicletaAlumno('${id}', false, '${nombreSafe}')">↩️ Quitar de Bicicleta</button>`;
        }
        html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
        html += `<button type="button" class="${btnClass()} btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
    } 
    // 6. Match > En Validación
    else if (est === 'validando grupo' || est === 'en validacion' || vistaActiva.startsWith('Match')) {
        html += `<button type="button" class="${btnClass()} btn-editar-match" onclick="window.editarAlumnoModalDirecto('${id}')">✏️ Editar Ficha</button>`;
        html += `<button type="button" class="${btnClass()} btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
        html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
        html += `<button type="button" class="${btnClass()} btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
    } 
    // 7. Altas > Pendientes
    else if (est === 'pre-alta pendiente' || vistaActiva === 'Altas - Pendientes') {
        html += `<button type="button" class="${btnClass(true)} btn-abrir-prealta" data-id="${id}">⚙️ Iniciar Pre-Alta</button>`;
        html += `<button type="button" class="${btnClass()} btn-avisar-admisor-alumno" data-id="${id}">📢 Avisar al Admisor</button>`;
        html += `<button type="button" class="${btnClass()} btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
        html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
        html += `<button type="button" class="${btnClass()} btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
    } 
    // 8. Altas > En Curso
    else if (est === 'pre-alta iniciada' || vistaActiva === 'Altas - En Curso') {
        html += `<button type="button" class="${btnClass(true)} btn-abrir-confirmar-alta" data-id="${id}">💳 Suscripción Abonada</button>`;
        html += `<button type="button" class="${btnClass()} btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Pre-Alta</button>`;
        html += `<button type="button" class="${btnClass()} btn-aviso-prealta-alumno" data-id="${id}">💬 Avisar Alumno</button>`;
        html += `<button type="button" class="${btnClass()} btn-reenviar-prealta" data-id="${id}">📢 Avisar Coordinador</button>`;
        html += `<button type="button" class="${btnClass()} btn-devolver-pendientes" data-id="${id}">↩️ Devolver a Pendientes</button>`;
        html += `<button type="button" class="${btnClass()} btn-devolver-espera" data-id="${id}">🛋️ Devolver a Espera</button>`;
        html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
        html += `<button type="button" class="${btnClass()} btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
    } 
    // 10, 11 & 12. Seguimientos (Pendientes, En Curso, Finalizados) - PRIORIDAD 1 SI TIENE SEGUIMIENTO
    else if (esVistaSeguimiento || al.seguimiento?.activo === true || al.seguimiento?.finalizado === true) {
        const segActivo = al.seguimiento?.activo === true;
        const segFinalizado = al.seguimiento?.finalizado === true || vistaActiva.includes('Finalizados');

        if (segActivo) {
            // 11. Seguimientos > En Curso
            html += `<button type="button" class="${btnClass(true)} btn-seg-contactar" data-id="${id}">💬 Nuevo Feedback</button>`;
            html += `<button type="button" class="${btnClass()} btn-seg-finalizar" data-id="${id}">🏁 Finalizar Seguimiento</button>`;
            html += `<button type="button" class="${btnClass()} btn-seg-ver-informe" data-id="${id}">👁️ Ver Informe</button>`;
            html += `<button type="button" class="${btnClass()} btn-seg-ver-seguimiento" data-id="${id}">👁️ Ver Seguimiento</button>`;
            html += `<button type="button" class="${btnClass()} btn-editar-seguimiento" data-id="${id}">✏️ Editar Seguimiento</button>`;
            html += `<button type="button" class="${btnClass()} btn-devolver-espera" data-id="${id}">🛋️ Devolver a Espera</button>`;
            html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
            html += `<button type="button" class="${btnClass()} btn-dar-baja-alumno" data-id="${id}">🛑 Dar de Baja</button>`;
        } else if (segFinalizado) {
            // 12. Seguimientos > Finalizados
            html += `<button type="button" class="${btnClass()} btn-seg-ver-informe" data-id="${id}">👁️ Ver Informe</button>`;
            html += `<button type="button" class="${btnClass()} btn-seg-ver-seguimiento" data-id="${id}">👁️ Ver Seguimiento</button>`;
            html += `<button type="button" class="${btnClass()} btn-editar-seguimiento" data-id="${id}">✏️ Editar Seguimiento</button>`;
            html += `<button type="button" class="${btnClass()} btn-devolver-espera" data-id="${id}">🛋️ Devolver a Espera</button>`;
            html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
            html += `<button type="button" class="${btnClass()} btn-dar-baja-alumno" data-id="${id}">🛑 Dar de Baja</button>`;
        } else {
            // 10. Seguimientos > Pendientes
            html += `<button type="button" class="${btnClass(true)} btn-seg-reiniciar" data-id="${id}">🎧 Iniciar Seguimiento</button>`;
            html += `<button type="button" class="${btnClass()} btn-seg-ver-informe" data-id="${id}">👁️ Ver Informe</button>`;
            html += `<button type="button" class="${btnClass()} btn-seg-ver-seguimiento" data-id="${id}">👁️ Ver Seguimiento</button>`;
            html += `<button type="button" class="${btnClass()} btn-devolver-espera" data-id="${id}">🛋️ Devolver a Espera</button>`;
            html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
            html += `<button type="button" class="${btnClass()} btn-dar-baja-alumno" data-id="${id}">🛑 Dar de Baja</button>`;
        }
    }
    // 9. Altas > Finalizadas / Confirmadas (Solo si NO es seguimiento activo)
    else if (est === 'alta efectiva' || est === 'alta ilegal' || est === 'alta finalizada' || est === 'alta confirmada' || est.startsWith('alta') || vistaActiva === 'Altas - Confirmadas' || vistaActiva === 'Altas - Finalizadas') {
        if (!esFinalizada) {
            html += `<button type="button" class="${btnClass(true)} btn-finalizar-alta-directa" data-id="${id}">🏁 Finalizar Alta</button>`;
            html += `<button type="button" class="${btnClass()} btn-copiar-fila-excel-bd" data-id="${id}">📋 Copiar Registro BD</button>`;
            html += `<button type="button" class="${btnClass()} btn-copiar-fila-excel-fact" data-id="${id}">💰 Copiar Facturación</button>`;
            html += `<button type="button" class="${btnClass()} btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Alta</button>`;
            html += `<button type="button" class="${btnClass()} btn-aviso-alta-alumno" data-id="${id}">💬 Avisar Alta a Alumno</button>`;
            html += `<button type="button" class="${btnClass()} btn-reenviar-alta" data-id="${id}">📢 Avisar Alta a Docente</button>`;
            html += `<button type="button" class="${btnClass()} btn-devolver-espera" data-id="${id}">↩️ Devolver a Espera</button>`;
            html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
            html += `<button type="button" class="${btnClass()} btn-suspender-espera" data-id="${id}">⏸️ Suspender</button>`;
        } else {
            const segActivo = al.seguimiento?.activo === true || (!al.seguimiento?.fecha_finalizacion && Boolean(al.seguimiento?.fecha_proximo_seguimiento || al.fecha_proximo_seguimiento));
            if (segActivo) {
                html += `<button type="button" class="${btnClass(true)} btn-seg-contactar" data-id="${id}">💬 Nuevo Feedback</button>`;
                html += `<button type="button" class="${btnClass()} btn-seg-finalizar" data-id="${id}">🏁 Finalizar Seguimiento</button>`;
            } else {
                html += `<button type="button" class="${btnClass(true)} btn-seg-reiniciar" data-id="${id}">🎧 Iniciar Seguimiento</button>`;
            }
            html += `<button type="button" class="${btnClass()} btn-seg-ver-informe" data-id="${id}">👁️ Ver Informe</button>`;
            html += `<button type="button" class="${btnClass()} btn-seg-ver-seguimiento" data-id="${id}">👁️ Ver Seguimiento</button>`;
            html += `<button type="button" class="${btnClass()} btn-copiar-fila-excel-bd" data-id="${id}">📋 Copiar Registro BD</button>`;
            html += `<button type="button" class="${btnClass()} btn-copiar-fila-excel-fact" data-id="${id}">💰 Copiar Facturación</button>`;
            html += `<button type="button" class="${btnClass()} btn-editar-prealta" data-id="${id}" data-inicio="${al.fecha_inicio_clases||''}" data-grupo="${al.grupo_asignado||''}">✏️ Editar Alta</button>`;
            html += `<button type="button" class="${btnClass()} btn-aviso-alta-alumno" data-id="${id}">💬 Avisar Alta a Alumno</button>`;
            html += `<button type="button" class="${btnClass()} btn-reenviar-alta" data-id="${id}">📢 Avisar Alta a Docente</button>`;
            html += `<button type="button" class="${btnClass()} btn-devolver-espera" data-id="${id}">🛋️ Devolver a Espera</button>`;
            html += `<button type="button" class="${btnClass()} btn-nota-rapida" data-id="${id}">📝 Agregar Nota</button>`;
            html += `<button type="button" class="${btnClass()} btn-dar-baja-alumno" data-id="${id}">🛑 Dar de Baja</button>`;
        }
    }

    if (esAdmin) {
        html += `<button type="button" class="${btnClass()} btn-eliminar-ficha-directo" data-id="${id}" style="color:var(--accent-red); font-weight:700; ${esModal ? 'border-color:var(--accent-red); margin-top:4px;' : 'border-top:1px solid var(--border-color); margin-top:2px;'}">🗑️ Eliminar Ficha</button>`;
    }

    return html;
}

export function renderSegmentedTabs(vista) {
    const cont = document.getElementById('segmented-tabs-container');
    if (!cont) return;

    let subVistas = [];
    if (vista.startsWith('Inbox')) {
        subVistas = [
            { label: 'Sin Agendar', vista: 'Inbox - Pendientes' },
            { label: 'Confirmadas', vista: 'Inbox - Confirmadas' }
        ];
    } else if (vista.startsWith('Altas')) {
        subVistas = [
            { label: 'Pendientes', vista: 'Altas - Pendientes' },
            { label: 'En Curso', vista: 'Altas - En Curso' },
            { label: 'Confirmadas', vista: 'Altas - Confirmadas' },
            { label: 'Finalizadas', vista: 'Altas - Finalizadas' }
        ];
    } else if (vista.startsWith('Suspendidos')) {
        subVistas = [
            { label: 'Todos', vista: 'Suspendidos - Todos' },
            { label: 'De Inbox', vista: 'Suspendidos - De Inbox' },
            { label: 'De Lista de Espera', vista: 'Suspendidos - De Lista de Espera' },
            { label: 'De Pre-Alta', vista: 'Suspendidos - De Pre-Alta' }
        ];
    } else if (vista.startsWith('Match')) {
        subVistas = [
            { label: 'Sugerencias', vista: 'Match - Pendientes' },
            { label: 'En Validacion', vista: 'Match - En Validacion' },
            { label: 'Confirmados', vista: 'Match - Confirmados' }
        ];
    } else if (vista.startsWith('Seguimientos')) {
        subVistas = [
            { label: 'Pendientes', vista: 'Seguimientos - Pendientes' },
            { label: 'En Curso', vista: 'Seguimientos - En Curso' },
            { label: 'Finalizados', vista: 'Seguimientos - Finalizados' }
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