// =======================================================================
// api/restablecer-clave.js -- Función de Vercel (servidor)
// Restablece la contraseña REAL de un usuario del sistema en Firebase Authentication.
//  - Solo la puede usar un administrador activo con sesión válida (se verifica su token de Firebase).
//  - Genera una clave temporal aleatoria, la aplica en Authentication y marca la ficha para que la persona
//    deba cambiarla en su próximo ingreso con correo y contraseña.
//  - La clave se devuelve una sola vez en la respuesta: no se guarda en ningún lado.
// Requiere la variable de entorno FIREBASE_SERVICE_ACCOUNT en Vercel (el JSON completo de la clave de servicio).
// =======================================================================
const crypto = require('crypto');

const PROYECTO = 'priel-mdl-seguimientos';
const WEB_API_KEY = 'AIzaSyCgAg2EwTJh4zbMdpkqG3VKTGfDeofblyg'; // clave pública de la app web (la misma de constants.js)
const ADMIN_EMERGENCIA_EMAIL = 'productora.mandalahouse@gmail.com';
const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789'; // sin letras ni números que se confunden (l, o, 0, 1)

const b64url = b => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function claveAleatoria(largo) {
    let s = '';
    const limite = ALFABETO.length * Math.floor(256 / ALFABETO.length);
    while (s.length < largo) {
        for (const byte of crypto.randomBytes(largo * 2)) {
            if (byte < limite) s += ALFABETO[byte % ALFABETO.length];
            if (s.length === largo) break;
        }
    }
    return s;
}

async function pedirJson(url, opciones) {
    const r = await fetch(url, opciones);
    let json = null;
    try { json = await r.json(); } catch (e) { /* respuesta sin cuerpo */ }
    return { status: r.status, json };
}

// Token de acceso de la cuenta de servicio (OAuth con JWT firmado)
async function tokenServicio(sa) {
    const ahora = Math.floor(Date.now() / 1000);
    const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const cla = b64url(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 600
    }));
    const firma = b64url(crypto.sign('RSA-SHA256', Buffer.from(cab + '.' + cla), sa.private_key));
    const r = await pedirJson('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + cab + '.' + cla + '.' + firma
    });
    if (!r.json || !r.json.access_token) throw new Error('No se pudo obtener acceso de servicio (' + r.status + ')');
    return r.json.access_token;
}

// Convierte un valor de la API REST de Firestore a JS (solo los tipos que se usan aquí)
function valorFs(v) {
    if (!v) return undefined;
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(valorFs);
    if ('nullValue' in v) return null;
    if ('integerValue' in v) return Number(v.integerValue);
    return undefined;
}

function esAdminActivo(campos) {
    if (!campos) return false;
    if (valorFs(campos.activo) === false) return false;
    const roles = valorFs(campos.roles);
    return (Array.isArray(roles) && roles.includes('admin')) || valorFs(campos.rol) === 'admin';
}

function responder(res, status, cuerpo) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(status).send(JSON.stringify(cuerpo));
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido.' });

    let datos = req.body;
    if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (e) { datos = null; } }
    const idToken = datos && typeof datos.idToken === 'string' ? datos.idToken : '';
    const usuarioId = datos && typeof datos.usuarioId === 'string' ? datos.usuarioId.trim() : '';
    if (!idToken || !usuarioId || !/^[A-Za-z0-9_-]{1,128}$/.test(usuarioId)) {
        return responder(res, 400, { error: 'Pedido incompleto.' });
    }

    let sa;
    try { sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); } catch (e) { sa = null; }
    if (!sa || !sa.private_key || !sa.client_email) {
        return responder(res, 500, { error: 'El servidor no tiene configurada la clave de servicio (FIREBASE_SERVICE_ACCOUNT).' });
    }

    try {
        // 1. Sesión de quien pide: Firebase valida el token y devuelve su correo
        const ses = await pedirJson('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + WEB_API_KEY, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken })
        });
        const yo = ses.json && ses.json.users && ses.json.users[0];
        const miCorreo = yo && yo.email ? String(yo.email).toLowerCase() : '';
        if (ses.status !== 200 || !miCorreo) return responder(res, 401, { error: 'Sesión no válida. Volvé a iniciar sesión.' });

        const token = await tokenServicio(sa);
        const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
        const baseFs = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents/';

        // 2. Quien pide debe ser administrador activo (se lee usuarios_sistema con la cuenta de servicio)
        const lista = await pedirJson(baseFs + 'usuarios_sistema?pageSize=300', { headers: H });
        if (lista.status !== 200) throw new Error('No se pudieron leer los usuarios (' + lista.status + ')');
        const docs = (lista.json && lista.json.documents) || [];
        const esAdmin = miCorreo === ADMIN_EMERGENCIA_EMAIL || docs.some(d =>
            String(valorFs(d.fields && d.fields.email) || '').toLowerCase().trim() === miCorreo && esAdminActivo(d.fields));
        if (!esAdmin) return responder(res, 403, { error: 'Solo un administrador puede restablecer contraseñas.' });

        // 3. Usuario a restablecer
        const destino = docs.find(d => d.name.endsWith('/usuarios_sistema/' + usuarioId));
        const correo = destino ? String(valorFs(destino.fields && destino.fields.email) || '').toLowerCase().trim() : '';
        if (!correo) return responder(res, 404, { error: 'No se encontró el usuario o no tiene correo cargado.' });
        if (correo === ADMIN_EMERGENCIA_EMAIL) return responder(res, 403, { error: 'La cuenta de emergencia no se puede restablecer desde la app.' });

        // 4. Cambiar (o crear) la cuenta en Authentication
        const clave = claveAleatoria(10);
        const bus = await pedirJson('https://identitytoolkit.googleapis.com/v1/projects/' + PROYECTO + '/accounts:lookup', {
            method: 'POST', headers: H, body: JSON.stringify({ email: [correo] })
        });
        const cuenta = bus.json && bus.json.users && bus.json.users[0];
        let cuentaCreada = false;
        if (cuenta) {
            const up = await pedirJson('https://identitytoolkit.googleapis.com/v1/projects/' + PROYECTO + '/accounts:update', {
                method: 'POST', headers: H, body: JSON.stringify({ localId: cuenta.localId, password: clave })
            });
            if (up.status !== 200) throw new Error('Firebase no aceptó el cambio de clave (' + up.status + ')');
        } else {
            const cr = await pedirJson('https://identitytoolkit.googleapis.com/v1/projects/' + PROYECTO + '/accounts', {
                method: 'POST', headers: H, body: JSON.stringify({ email: correo, password: clave })
            });
            if (cr.status !== 200) throw new Error('Firebase no pudo crear la cuenta (' + cr.status + ')');
            cuentaCreada = true;
        }

        // 5. Marcar la ficha: debe cambiar la clave al ingresar; queda registrado quién y cuándo (sin la clave)
        const ahoraIso = new Date().toISOString();
        const campos = ['password_modificada', 'password_inicial_asignada', 'fecha_reset_password', 'reset_password_por'];
        const mascara = campos.map(c => 'updateMask.fieldPaths=' + c).join('&');
        const pa = await pedirJson('https://firestore.googleapis.com/v1/' + destino.name + '?' + mascara, {
            method: 'PATCH', headers: H, body: JSON.stringify({ fields: {
                password_modificada: { booleanValue: false },
                password_inicial_asignada: { booleanValue: true },
                fecha_reset_password: { stringValue: ahoraIso },
                reset_password_por: { stringValue: miCorreo }
            } })
        });
        const fichaMarcada = pa.status === 200;

        return responder(res, 200, { ok: true, email: correo, clave, cuentaCreada, fichaMarcada });
    } catch (e) {
        return responder(res, 500, { error: 'No se pudo restablecer la contraseña: ' + (e && e.message ? e.message : 'error desconocido') });
    }
};
