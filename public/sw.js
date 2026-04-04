const CACHE_NAME = 'renteriq-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app/index.html',
  '/app/index.html?utm_source=pwa',
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

// Install: cache static assets
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
});

// Activate: clean up old caches
self.addEventListener('activate', (e) => {
  self.clients.claim();
  e.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))));
});

// Fetch: serve from cache or network
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(cached => {
    // For PWA start_url with utm_source, serve app page
    if (e.request.url.includes('utm_source=pwa')) {
      return caches.match('/app/index.html') || fetch('/app/index.html');
    }
    return cached || fetch(e.request);
  }));
});