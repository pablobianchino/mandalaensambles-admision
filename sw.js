const CACHE_NAME = "mandala-app-v4.9.0";

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request).catch(() => {
        return caches.match(event.request);
    }));
});
