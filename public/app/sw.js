// RenterIQ Service Worker v5 — fast page transitions
const CACHE_NAME = 'renteriq-v5';
const CDN_CACHE  = 'renteriq-cdn-v1';

const APP_SHELL = [
  '/app/',
  '/app/index.html',
  '/app/css/app.css',
  '/app/js/sidebar.js',
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
  '/assets/logo.svg'
];

// CDN origins we want to cache (Firebase SDK, Google Fonts)
const CDN_ORIGINS = [
  'https://www.gstatic.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

function isCdnRequest(url) {
  return CDN_ORIGINS.some(function(o) { return url.startsWith(o); });
}

function isApiRequest(url) {
  return url.includes('/api/');
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(n) {
          return n !== CACHE_NAME && n !== CDN_CACHE;
        }).map(function(n) { return caches.delete(n); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Never cache API calls
  if (isApiRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // CDN resources: stale-while-revalidate (instant from cache, update in background)
  if (isCdnRequest(url)) {
    event.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var fetchPromise = fetch(event.request).then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(function() { return cached; });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Local assets: cache-first
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          var clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        }
        return networkResponse;
      });
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
