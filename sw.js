/* =============================================================
   Service worker — Flores Amarillas
   Estrategia: red primero, caché como respaldo (offline).
   Así nunca se queda "pegado" sirviendo una versión vieja aunque
   no se cambie el número de versión; pero subir CACHE_VERSION en
   cada despliegue fuerza además una limpieza total de la caché.
   ============================================================= */

const CACHE_VERSION = 'flores-amarillas-v2';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './audio/flores-amarillas.mp3'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.allSettled(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
