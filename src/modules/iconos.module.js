// ================================================================
// ÍCONOS AUTOMÁTICOS (solo presentación)
// Reemplaza, al mostrarse, el emoji a color que está al INICIO de un texto de la interfaz
// (botones, títulos, etiquetas, avisos de las ventanas) por un ícono de línea de un solo color.
// - El emoji original queda en un <span class="emoji-oculto"> (invisible): textContent/innerText no cambian,
//   así los textos que se copian o se leen por código siguen igual.
// - No toca: nombres en filas, encabezados de grupo, cajas de texto, editores, instrumentos ni emojis sin equivalente.
// ================================================================
const MAPA = {
    '⚠': 'warn', '❗': 'warn', '🚨': 'warn', '✅': 'ok', '☑': 'ok', '❌': 'err', '⛔': 'ban', '🚫': 'ban', '🛑': 'ban',
    '📅': 'cal', '🗓': 'cal', '💬': 'msg', '📩': 'msg', '🗑': 'trash', '🧩': 'puzzle', '📋': 'clip',
    '👁': 'eye', '🙈': 'eye-off', '🚀': 'rocket', '✏': 'edit', '📝': 'edit', '↩': 'undo',
    '⏳': 'clock', '🕒': 'clock', '🕐': 'clock', '⏰': 'clock', '🛋': 'clock', '🏁': 'flag', '💾': 'save',
    '🔄': 'refresh', '♻': 'refresh', '🔁': 'refresh', '🎧': 'headset', '🔍': 'search', '🔎': 'search', '➕': 'plus',
    '📞': 'phone', '☎': 'phone', '📱': 'phone', '📥': 'download', '📤': 'upload', '⚡': 'zap', '⏸': 'pause',
    '🚲': 'bike', '⚙': 'sliders', '🛠': 'sliders', '🔒': 'lock', '🔐': 'lock', '🔑': 'key', '🔔': 'bell',
    '✨': 'star', '⭐': 'star', '👑': 'star', '🎉': 'star', '📢': 'mega', '📣': 'mega',
    '💰': 'coin', '💵': 'coin', '💳': 'card', '🏦': 'coin', '📦': 'box', '🎯': 'target', '🏆': 'trophy',
    '📚': 'book', '📖': 'book', '📘': 'book', '📗': 'book', '📙': 'book', '📕': 'book', '📓': 'book', '📔': 'book', '📒': 'book', '🧪': 'flask', '🌙': 'moon', '📊': 'chart', '📈': 'chart', '💡': 'bulb',
    '📍': 'pin', '📌': 'pin', '📄': 'file', '📑': 'file', '📰': 'file', '📁': 'folder', '📂': 'folder',
    '🛡': 'shield', '🌐': 'globe', '❓': 'help', '🌱': 'leaf', '🌿': 'leaf', '🔥': 'flame', '🏷': 'tag',
    '👤': 'user', '👥': 'users', '🔹': 'dot', '🚪': 'logout',
    '👨‍🏫': 'board', '👩‍🏫': 'board', '🧑‍🏫': 'board', '🧑‍🎓': 'cap', '👨‍🎓': 'cap', '👩‍🎓': 'cap',
    // Instrumentos: el ícono depende del nombre que acompaña al emoji (guía EMOJIS_INSTRUMENTOS_A_ICONOS)
    '🎸': 'inst', '🥁': 'inst', '🎹': 'inst', '🎤': 'inst', '🎺': 'inst', '🎻': 'inst', '🎷': 'inst', '🪘': 'inst',
    '🪈': 'inst', '🪕': 'inst', '🔌': 'inst', '🎵': 'inst', '🎼': 'inst',
    '🟢': 'dot:var(--ok)', '🟡': 'dot:#c98a1a', '🔴': 'dot:var(--bad)', '🔵': 'dot:var(--info)',
    '🟠': 'dot:#d9731a', '⚪': 'dot:var(--ink-3)'
};
function iconoInstrumento(nombre, emoji) {
    const s = String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (s.includes('bater') || s.includes('drum')) return 'bateria';
    if (s.includes('bajo') || s.includes('bass')) return 'bajo';
    if (s.includes('guit') || s.includes('gtr')) return 'guitarra';
    if (/cant|voz|vocal|coro|mic/.test(s)) return 'voz';
    if (/tecl|pian|synth|sint|key/.test(s)) return 'teclado';
    if (s.includes('sax') || s.includes('vient')) return 'saxo';
    if (s.includes('viol')) return 'violin';
    if (s.includes('perc') || s.includes('cajon')) return 'percusion';
    if (s.includes('tromp')) return 'trompeta';
    if (s.includes('flaut')) return 'flauta';
    if (s.includes('ukel') || s.includes('ucu') || s.includes('charan')) return 'ukelele';
    if (s.includes('linea') || s.includes('line')) return 'linea';
    // Sin nombre reconocible: se usa el emoji original como pista
    const porEmoji = { '🎸': 'guitarra', '🥁': 'bateria', '🎹': 'teclado', '🎤': 'voz', '🎺': 'trompeta', '🎻': 'violin', '🎷': 'saxo', '🪘': 'percusion', '🪈': 'flauta', '🪕': 'ukelele', '🔌': 'linea' };
    return porEmoji[emoji] || 'otro';
}
const RE_INICIO = /^(\s*)((?:\u{1F468}‍\u{1F3EB}|\u{1F469}‍\u{1F3EB}|\u{1F9D1}‍\u{1F3EB}|\u{1F9D1}‍\u{1F393}|\u{1F468}‍\u{1F393}|\u{1F469}‍\u{1F393}|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23F3}\u{23F0}\u{23F8}\u{2190}-\u{21FF}\u{2705}\u{274C}\u{2753}])️?)/u;
const EXCLUIR = '.row-name, .group-banner-l1, .group-banner-l2, textarea, input, select, option, [contenteditable="true"], .ql-editor, pre, code, script, style, .emoji-oculto, .ico-linea, [data-keep-emoji]';

function decorarTexto(nodo) {
    const padre = nodo.parentElement;
    if (!padre || padre.closest(EXCLUIR)) return;
    const m = RE_INICIO.exec(nodo.nodeValue);
    if (!m) return;
    // Debe ser lo primero visible del elemento (nada de contenido antes)
    for (let s = nodo.previousSibling; s; s = s.previousSibling) {
        if (s.nodeType === 3 && !s.nodeValue.trim()) continue;
        return;
    }
    const emoji = m[2];
    const clave = emoji.replace(/️/g, '');
    const def = MAPA[clave];
    if (!def || typeof window.iconoLinea !== 'function') return;
    let [nombre, color] = def.split(':');
    if (nombre === 'inst') {
        const base = ((padre.textContent || '').trim().length <= 4 && padre.parentElement) ? padre.parentElement : padre;
        const texto = (base.textContent || '').replace(emoji, '').slice(0, 80);
        nombre = 'inst-' + iconoInstrumento(texto, clave);
    }
    const cont = document.createElement('span');
    cont.innerHTML = window.iconoLinea(nombre, 'ico-auto') + '<span class="emoji-oculto">' + emoji + '</span>';
    if (color) cont.firstChild.style.color = color;
    const frag = document.createDocumentFragment();
    while (cont.firstChild) frag.appendChild(cont.firstChild);
    const resto = nodo.nodeValue.slice(m[1].length + emoji.length);
    if (resto) frag.appendChild(document.createTextNode(resto));
    nodo.replaceWith(frag);
}

function decorar(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { decorarTexto(raiz); return; }
    if (raiz.nodeType !== 1) return;
    if (raiz.closest && raiz.closest(EXCLUIR)) return;
    const caminante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const pendientes = [];
    for (let n = caminante.nextNode(); n; n = caminante.nextNode()) {
        if (RE_INICIO.test(n.nodeValue)) pendientes.push(n);
    }
    pendientes.forEach(decorarTexto);
}

let cola = new Set();
let programado = false;
function procesarCola() {
    programado = false;
    const lote = Array.from(cola);
    cola = new Set();
    lote.forEach(n => { if (n.isConnected) { try { decorar(n); } catch (e) { /* solo presentación */ } } });
}

function iniciar() {
    if (typeof window.iconoLinea !== 'function') { setTimeout(iniciar, 200); return; }
    try { decorar(document.body); } catch (e) { /* solo presentación */ }
    new MutationObserver((muts) => {
        for (const mu of muts) {
            mu.addedNodes.forEach(n => { if (n.nodeType === 1 || n.nodeType === 3) cola.add(n); });
        }
        if (cola.size && !programado) { programado = true; setTimeout(procesarCola, 30); }
    }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else setTimeout(iniciar, 0);
