// =======================================================================
// pase_cliente.js — Canje del pase de un solo uso de Core (etapa 4, Core v1.7)
// ARCHIVO DE REFERENCIA: cada app (Admisión, Festivales, Docentes) lo copia TAL CUAL a su carpeta
// (por ejemplo src/services/pase.js) y cambia solo la ruta del import de firebase-auth si hace falta.
//
// Cómo funciona:
//  - Core abre la app con  https://<app>/#pase=XXXX  (lo que va después de # no viaja a ningún servidor).
//  - Antes de escuchar la sesión, la app llama a  usarPaseDeCore(auth, '<id de la app>').
//  - Si hay pase: lo quita de la dirección, lo canjea en Core y entra con signInWithCustomToken.
//    Eso REEMPLAZA cualquier sesión anterior de la app (por ejemplo, otro usuario que había quedado abierto).
//  - Si no hay pase, no hace nada. Si el canje falla, deja la sesión como estaba y devuelve el motivo:
//    la app sigue su arranque normal (login o sesión guardada).
// Ids de app: 'admision' | 'festival' | 'docentes'.
// =======================================================================
import { signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const URL_CANJE = 'https://mandalaensambles-core.vercel.app/api/pase-canjear';

/* Lee el pase de la dirección y lo borra de inmediato (para que no quede en el historial ni se reutilice) */
export function tomarPaseDeLaUrl() {
    const m = (location.hash || '').match(/(?:^#|&)pase=([^&]+)/);
    if (!m) return null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    return decodeURIComponent(m[1]);
}

/* Devuelve { usado: true, email } si entró con el pase; { usado: false } si no había pase;
   { usado: false, error } si había pase y no se pudo usar. */
export async function usarPaseDeCore(auth, app) {
    const pase = tomarPaseDeLaUrl();
    if (!pase) return { usado: false };
    try {
        const r = await fetch(URL_CANJE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pase, app })
        });
        let resp = null;
        try { resp = await r.json(); } catch (e) { /* sin cuerpo */ }
        if (!r.ok || !resp || !resp.token) throw new Error((resp && resp.error) || ('Respuesta ' + r.status));
        await signInWithCustomToken(auth, resp.token);
        console.log('[Pase Core] Ingreso con el pase de Core:', resp.email);
        return { usado: true, email: resp.email };
    } catch (e) {
        console.warn('[Pase Core] No se pudo usar el pase:', e && e.message ? e.message : e);
        return { usado: false, error: (e && e.message) || 'No se pudo usar el pase' };
    }
}
