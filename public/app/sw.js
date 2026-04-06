// RenterIQ Service Worker - Cache-first strategy
const CACHE_NAME = 'renteriq-v2';
const urlsToCache = [
  '/app/',
  '/app/index.html',
  '/app/pages/vault.html',
  '/app/pages/inspection.html',
  '/app/pages/entry-audit.html',
  '/app/pages/lease.html',
  '/app/pages/exit.html',
  '/app/pages/rights.html',
  '/app/pages/renewal.html',
  '/app/pages/profile.html',
  '/app/pages/notifications.html',
  '/app/pages/application.html',
  '/app/pages/tools.html',
  '/app/pages/routine-inspection.html',
  '/app/pages/tracked.html',
  '/app/pages/webview.html',
  '/app/js/sidebar.js',
  '/assets/logo.svg'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
