const CACHE_NAME = 'mandala-seg-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Permite el funcionamiento normal de la red sin bloquear consultas a Firebase/Calendar
    event.respondWith(fetch(event.request));
});
