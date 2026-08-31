const CACHE_NAME = "mandala-app-v5.9.18";

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            clients.claim(),
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.map((key) => {
                        if (key !== CACHE_NAME) {
                            console.log(`[ServiceWorker] Eliminando caché obsoleta: ${key}`);
                            return caches.delete(key);
                        }
                    })
                );
            })
        ])
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass estricto de caché para APIs, Firebase y Google Calendar
    if (
        event.request.method !== 'GET' ||
        url.origin.includes('firestore.googleapis.com') ||
        url.origin.includes('googleapis.com') ||
        url.origin.includes('script.google.com') ||
        url.pathname.includes('/api/')
    ) {
        return;
    }

    // Network-First para version.json
    if (url.pathname.endsWith('version.json')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Stale-While-Revalidate para recursos estáticos
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => cachedResponse);

            return cachedResponse || fetchPromise;
        })
    );
});

// ================================================================
// MANEJO DE NOTIFICACIONES PUSH / WEB NOTIFICATIONS
// ================================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const notifData = event.notification.data || {};
    const targetUrl = notifData.url || '/';
    const fichaId = notifData.alumnoId || (targetUrl.includes('verFicha=') ? targetUrl.split('verFicha=')[1].split('&')[0] : null);

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
            // 1. Si la app ya está abierta (en primer plano o segundo plano en celular/PC)
            for (const client of clientList) {
                try {
                    await client.focus();
                } catch(eF) {}

                // Envía mensaje directo a la app para abrir la ficha de inmediato sin recarga
                if (fichaId) {
                    client.postMessage({
                        type: 'ABRIR_FICHA_NOTIFICACION',
                        fichaId: fichaId,
                        url: targetUrl,
                        action: event.action
                    });
                }

                if ('navigate' in client && targetUrl !== '/' && !client.url.includes('verFicha=')) {
                    try {
                        return await client.navigate(targetUrl);
                    } catch(eNav) {}
                }
                return;
            }
            // 2. Si la app estaba completamente cerrada, abrir ventana limpia con la URL de destino
            if (clients.openWindow) {
                return await clients.openWindow(targetUrl);
            }
        })
    );
});

self.addEventListener('push', (event) => {
    let payload = { title: 'Mandala Admisión', body: 'Novedades del día' };
    if (event.data) {
        try {
            payload = event.data.json();
        } catch(e) {
            payload.body = event.data.text();
        }
    }
    const options = {
        body: payload.body || '',
        icon: 'logo.png',
        badge: 'logo.png',
        tag: payload.tag || 'mandala-alerta-09hs',
        renotify: true,
        vibrate: [200, 100, 200],
        data: payload.data || { url: '/' },
        actions: [
            { action: 'ver_ficha', title: '👁️ Ver Ficha' }
        ]
    };
    event.waitUntil(self.registration.showNotification(payload.title || 'Mandala Admisión', options));
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'TRIGGER_NOTIFICATION') {
        const { title, options } = event.data;
        self.registration.showNotification(title, options);
    }
});
