const CACHE_NAME = 'renteriq-v4';
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

// Route mapping for PWA
const ROUTE_MAP = {
  '/app': '/app/index.html',
  '/search': '/app/pages/search.html',
  '/inspect': '/app/pages/inspection.html',
  '/inspect/routine': '/app/pages/routine-inspection.html',
  '/vault': '/app/pages/vault.html',
  '/profile': '/app/pages/profile.html',
  '/lease': '/app/pages/lease.html',
  '/exit': '/app/pages/exit.html',
  '/rights': '/app/pages/rights.html',
  '/renewal': '/app/pages/renewal.html',
  '/notifications': '/app/pages/notifications.html',
  '/application': '/app/pages/application.html'
};

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

// Fetch: serve from cache or network with route handling
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const path = url.pathname;
  
  // Check if this is a PWA route that needs to be mapped
  if (ROUTE_MAP[path]) {
    e.respondWith(
      caches.match(ROUTE_MAP[path]).then(cached => {
        return cached || fetch(ROUTE_MAP[path]);
      })
    );
    return;
  }
  
  // Default behavior for other requests
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});