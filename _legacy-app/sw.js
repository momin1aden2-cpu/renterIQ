const CACHE_NAME = 'renteriq-v4';

const CACHE_URLS = [
  '/',
  '/index.html',
  '/app/index.html',
  '/app/css/app.css',
  '/app/manifest.json',
  '/app/offline.html',
  '/app/pages/search.html',
  '/app/pages/inspection.html',
  '/app/pages/routine-inspection.html',
  '/app/pages/vault.html',
  '/app/pages/lease.html',
  '/app/pages/exit.html',
  '/app/pages/application.html',
  '/app/pages/rights.html',
  '/app/pages/notifications.html',
  '/app/pages/renewal.html',
  '/app/pages/profile.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match(e.request)
          .then(cached => cached || caches.match('/app/offline.html'))
        )
    );
  } else {
    e.respondWith(
      caches.match(e.request)
        .then(cached => cached || fetch(e.request))
    );
  }
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
