const CACHE_NAME = "mandala-app-v4.30.4";

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
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
