const CACHE_NAME = 'renteriq-v2';

const PRECACHE_URLS = [
  '/index.html',
  '/app/index.html',
  '/app/css/app.css',
  '/app/manifest.json',
  'https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Nunito:wght@400;500;600;700&display=swap'
];

// Install — precache shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch — cache first, network fallback, offline fallback
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // For navigation requests, use network-first to avoid redirect issues
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/app/index.html'))
    );
    return;
  }

  // For all other requests, cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      });
    }).catch(() => {
      return caches.match('/app/index.html');
    })
  );
});

// Message — skip waiting for immediate updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
