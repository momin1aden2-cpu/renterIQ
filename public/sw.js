const CACHE_NAME = 'renteriq-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app/index.html',
  '/app/pages/search.html',
  '/app/pages/inspection.html',
  '/app/pages/vault.html',
  '/app/pages/profile.html',
  '/app/css/app.css',
  '/assets/logo.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', (e) => {
  self.clients.claim();
  e.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});