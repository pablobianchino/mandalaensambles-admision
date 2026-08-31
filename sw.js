const CACHE_NAME = "mandala-app-v5.9.16";

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET and http/https requests
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    // Bypass Firestore, Google Auth, Calendar, and Google Script APIs
    const url = new URL(event.request.url);
    if (url.hostname.includes('firestore') || 
        url.hostname.includes('googleapis') || 
        url.hostname.includes('google.com') || 
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('script.google')) {
        return;
    }

    event.respondWith(
        fetch(event.request).catch(async () => {
            try {
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }
            } catch (err) {}
            
            return new Response('Offline or resource unavailable', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
            });
        })
    );
});

// ================================================================
// MANEJO DE NOTIFICACIONES PUSH / WEB NOTIFICATIONS
// ================================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    if ('navigate' in client && targetUrl !== '/' && !client.url.includes(targetUrl)) {
                        client.navigate(targetUrl);
                    }
                    return;
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
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
