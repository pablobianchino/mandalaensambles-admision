// =======================================================================
// src/config/constants.js — Constantes globales del sistema
// =======================================================================

export const APP_VERSION = "v5.9.12";
export const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzbDuDGOab4azS27_7Mt9KYixAHNgeygMgCOZHTL1I3Poba5yLceWM56qJd59hPx6g/exec";

export const firebaseConfig = {
    apiKey: "AIzaSyCgAg2EwTJh4zbMdpkqG3VKTGfDeofblyg",
    authDomain: "priel-mdl-seguimientos.firebaseapp.com",
    projectId: "priel-mdl-seguimientos",
    storageBucket: "priel-mdl-seguimientos.firebasestorage.app",
    messagingSenderId: "118730133451",
    appId: "1:118730133451:web:9e407e81a9b22ae9d0704e"
};

export const diasSemana = [
    { id: 'L', nombre: 'Lunes' },
    { id: 'M', nombre: 'Martes' },
    { id: 'X', nombre: 'Miércoles' },
    { id: 'J', nombre: 'Jueves' },
    { id: 'V', nombre: 'Viernes' },
    { id: 'S', nombre: 'Sábado' }
];

export const defaultCfg = { 
    hora_apertura: '09:00', 
    hora_cierre: '22:00', 
    calendario_por_defecto: 'productora.mandalahouse@gmail.com', 
    identificador_bateria: '🥁', 
    emoji_guitarra: '🎸', 
    emoji_cajon: '📦', 
    emoji_canto: '🎤', 
    emoji_piano: '🎹', 
    emoji_bajo: '🎸', 
    valor_clase: '$10.000', 
    cantidad_aulas: '3', 
    cantidad_baterias: '2', 
    texto_nombre_agendar: 'MDL {nombre} {edad} {año_actual} @{instrumento} @{suscripcion}', 
    formato_evento_reserva: '❓📋 {emojiinstrumento} {alumno} {edad}', 
    formato_evento_confirmado: '✅📋 {emojiinstrumento} {alumno} {edad}', 
    texto_profe: "*⚠ PRE CHECK - ENTREVISTA*\n📅 *FECHA: {fecha_hora}*\n*👥 ALUMNO:*\n🔹 {nombre} ({edad})\n🔹 {instrumento} | {suscripcion}\n*INFO:*\n{descripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", 
    texto_opciones_multiples: "*⚠ PRE CHECK - ENTREVISTA*\n*🎈 CONFIRMAR ASISTENCIA*\n\n📅 OPCIONES DE FECHA:\n{opciones}\n\n*Por favor confirmar asistencia y agendar en tu calendario. En cuanto reciba el OK y pago del alumno, te aviso con la confirmación definitiva.*\n\n*📰 INFO PARA LA ENTREVISTA:*\n{descripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", 
    texto_alumno: "📅 *Agenda de clase*\n🧩 {fecha_hora} con Profe {profe}\n✅ Inscripción: forms.gle/xxx\n💸 Valor: {valor}\n💳 Alias: {alias_profe}", 
    texto_conf_alumno: "Genial Gracias!\nTe esperamos!\n\n🧩 Suscripción: {suscripcion} {emojiinstrumento} {instrumento}\n🧩 Día y horario: {fecha_hora}\n🧩 Profe: {profe}\n📍*Dirección:* Av. Cabildo 2970, Piso 1, Depto C.", 
    texto_conf_profe: "*✅ ENTREVISTA CONFIRMADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*👥 DATOS DEL ALUMNO:*\n🔹 Nombre: {nombre}\n🔹 Edad: {edad}\n🔹 Instrumento: {instrumento}\n🔹 Clase: {suscripcion}\n\n*📰 INFO PARA LA ENTREVISTA:*\n{descripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", 
    texto_cancela_alumno: "*❗ PRE CHECK - ENTREVISTA*\n*❌ RESERVA CANCELADA*\n\n📅 *FECHA: {fecha_hora}*\n\n*👥 DATOS DEL ALUMNO:*\n🔹 Nombre: {nombre}\n🔹 Edad: {edad}\n🔹 Instrumento: {instrumento}\n🔹 Clase: {suscripcion}\n\n*🕐 HISTORIAL DE CONTACTO:*\n{historial}", 
    texto_prealta: "*⚠ PRE ALTA INICIADA*\n\n*👥 DATOS DE LA SUSCRIPCIÓN:*\n🔹 Suscripción: {suscripcion}\n🔹 Nombre de alumno: {nombre}\n🔹 Instrumento: {instrumento}\n🔹 Grupo: {grupo}\n🔹 Profesor: {profe}\n🔹 Inicio de clases: {fecha inicio clases}", 
    texto_prealta_alumno: "Hola {nombre}! Cómo estás? 👋\n\nTe cuento que ya tenemos todo listo para que te sumes a Mandala Ensambles! 🤟\n\n🧩 Suscripción: {suscripcion}\n\n👥 Grupo: {grupo}\n\n🧩 Día y horario de cursada: {horario_cursada}\n\n🧩 Fecha de inicio de clases: {fecha_inicio_clases}\n\n🧩 Profe: {profe}\n\n🧩 Arancel: {valor_arancel}\n\n🧩 Alias a transferir: {alias_profe}",
    texto_alta_confirmada: "*✅ NUEVA ALTA CONFIRMADA*\n\n*👥 DATOS DE LA SUSCRIPCIÓN:*\n🔹 Suscripción: {suscripcion}\n🔹 Nombre de alumno: {nombre}\n🔹 Instrumento: {instrumento}\n🔹 Grupo: {grupo}\n🔹 Profesor: {profe}\n🔹 Inicio de clases: {fecha inicio clases}",
    arancel_individual_suelta: '',
    arancel_individual_quincenal: '',
    arancel_individual_fullpack: '',
    arancel_individual_fullpack_comunidad: '',
    arancel_ensamble_regular: '',
    arancel_ensamble_actual: '',
    arancel_ensamble_comunidad: '',
    grupo_min_integrantes: 2,
    grupo_max_integrantes: 6,
    reglas_edad_match: [
        { desde: 20, rango_min: -4, rango_max: 8 },
        { desde: 30, rango_min: -5, rango_max: 8 },
        { desde: 40, rango_min: -5, rango_max: 10 },
        { desde: 50, rango_min: -10, rango_max: 10 },
        { desde: 60, rango_min: -5, rango_max: 10 },
        { desde: 70, rango_min: -5, rango_max: 5 }
    ],
    reglas_edad_ninos: { hasta: 13, libre: true },
    perfil_psicologico_opciones: ['😊 Buena onda', '🙈 Tímido', '🎉 Extrovertido', '🦄 Raro', '🗣️ Muy hablador', '🌱 Humilde']
};

export const configNodosFlujo = [
    { id: 'Pendiente procesar', label: 'Sin Agendar', icon: '⏳', color: 'node-blue-1', hexColor: '#74a9d8', vistaDestino: 'Inbox - Pendientes', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'pendiente procesar' || st === 'sin agendar';
    }},
    { id: 'Pendiente validación por profe', label: 'Validando con Evaluador', icon: '👨‍🏫', color: 'node-blue-2', hexColor: '#4a8cd2', vistaDestino: 'Inbox - En Validacion', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'pendiente validacion por profe' || st === 'pendiente validacion por evaluador';
    }},
    { id: 'Pendiente validación por alumno', label: 'Validando con Alumno', icon: '🧑‍🎓', color: 'node-blue-3', hexColor: '#256bbb', vistaDestino: 'Inbox - En Validacion', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'pendiente validacion por alumno';
    }},
    { id: 'Agenda confirmada', label: 'Entrevista Confirmada', icon: '✅', color: 'node-blue-4', hexColor: '#134b8c', vistaDestino: 'Inbox - Confirmadas', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'agenda confirmada' || st === 'entrevista confirmada';
    }},
    { id: 'Lista de espera', label: 'Lista de Espera', icon: '🛋️', color: 'node-amber', hexColor: '#e5a93d', vistaDestino: 'Lista de Espera', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'lista de espera';
    }},
    { id: 'Validando Grupo', label: 'Grupos en Validación', icon: '👥', color: 'node-purple', hexColor: '#8e44ad', vistaDestino: 'Match - En Validacion', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'validando grupo';
    }},
    { id: 'Pre-alta Pendiente', label: 'Altas Pendientes', icon: '📝', color: 'node-green-1', hexColor: '#5cc88a', vistaDestino: 'Altas - Pendientes', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'pre-alta pendiente';
    }},
    { id: 'Pre-alta Iniciada', label: 'Altas en Curso', icon: '🚀', color: 'node-green-2', hexColor: '#31a364', vistaDestino: 'Altas - En Curso', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'pre-alta iniciada';
    }},
    { id: 'Altas Incompletas', label: 'Altas Confirmadas Incompletas', icon: '⚠️', color: 'node-green-3', hexColor: '#1b7f47', vistaDestino: 'Altas - Confirmadas', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return (st === 'alta efectiva' || st === 'alta ilegal' || st === 'alta finalizada') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5);
    }},
    { id: 'Altas Finalizadas', label: 'Altas Finalizadas', icon: '🏆', color: 'node-green-4', hexColor: '#0d5c30', vistaDestino: 'Altas - Finalizadas', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return (st === 'alta efectiva' || st === 'alta ilegal' || st === 'alta finalizada') && (d.checklist_alta && d.checklist_alta.filter(Boolean).length === 5);
    }}
];

export const configNodosFlujoCoordinador = [
    { id: 'Lista de espera', label: 'Lista de Espera', icon: '🛋️', color: 'node-amber', hexColor: '#e5a93d', vistaDestino: 'Lista de Espera', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'lista de espera';
    }},
    { id: 'Validando Grupo', label: 'Grupos en Validación', icon: '👥', color: 'node-purple', hexColor: '#8e44ad', vistaDestino: 'Match - En Validacion', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'validando grupo';
    }},
    { id: 'Pre-alta Pendiente', label: 'Altas Pendientes', icon: '📝', color: 'node-green-1', hexColor: '#5cc88a', vistaDestino: 'Altas - Pendientes', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'pre-alta pendiente';
    }},
    { id: 'Pre-alta Iniciada', label: 'Altas en Curso', icon: '🚀', color: 'node-green-2', hexColor: '#31a364', vistaDestino: 'Altas - En Curso', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return st === 'pre-alta iniciada';
    }},
    { id: 'Altas Incompletas', label: 'Altas Confirmadas Incompletas', icon: '⚠️', color: 'node-green-3', hexColor: '#1b7f47', vistaDestino: 'Altas - Confirmadas', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return (st === 'alta efectiva' || st === 'alta ilegal' || st === 'alta finalizada') && (!d.checklist_alta || d.checklist_alta.filter(Boolean).length < 5);
    }},
    { id: 'Altas Finalizadas', label: 'Altas Finalizadas', icon: '🏆', color: 'node-green-4', hexColor: '#0d5c30', vistaDestino: 'Altas - Finalizadas', filterFn: (d) => {
        const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return (st === 'alta efectiva' || st === 'alta ilegal' || st === 'alta finalizada') && (d.checklist_alta && d.checklist_alta.filter(Boolean).length === 5);
    }}
];

export const configNodosFlujoEvaluador = [
    { 
        id: 'Pendiente validación por profe', 
        label: 'Validando con Evaluador', 
        icon: '👨‍🏫', 
        color: 'node-blue-2', 
        hexColor: '#4a8cd2', 
        vistaDestino: 'Inbox - Validar Evaluador', 
        filterFn: (d) => {
            const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return st === 'pendiente validacion por profe' || st === 'pendiente validacion por evaluador';
        }
    },
    { 
        id: 'Pendiente validación por alumno', 
        label: 'Validando con Alumno', 
        icon: '🧑‍🎓', 
        color: 'node-blue-3', 
        hexColor: '#256bbb', 
        vistaDestino: 'Inbox - Validar Alumno', 
        filterFn: (d) => {
            const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return st === 'pendiente validacion por alumno';
        }
    },
    { 
        id: 'Agenda confirmada', 
        label: 'Entrevista Confirmada', 
        icon: '✅', 
        color: 'node-blue-4', 
        hexColor: '#134b8c', 
        vistaDestino: 'Inbox - Confirmadas', 
        filterFn: (d) => {
            const st = (d.estado_agenda || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return st === 'agenda confirmada' || st === 'entrevista confirmada';
        }
    }
];
