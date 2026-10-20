// Guarda la app en el móvil para que funcione sin cobertura.
const VERSION = 'control-horario-v1.0.0';
const ARCHIVOS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/logic.js',
  './js/db.js',
  './js/export.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'activar') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
      if (res.ok) {
        const copia = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copia));
      }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
