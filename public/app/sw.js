// RenterIQ Service Worker v10 — Share Target + Storage Helper
// No kill-switch. No dev-mode logic. Cache-first shell, network-first APIs.

var CACHE_NAME = 'renteriq-shell-v10';

var APP_SHELL = [
  '/app/index.html',
  '/app/css/app.css',
  '/app/js/sidebar.js',
  '/app/js/pwa-init.js',
  '/app/js/storage.js',
  '/app/js/firebase-init.js',
  '/app/js/auth-guard.js',
  '/app/js/searchService.js',
  '/app/manifest.json',
  '/app/track-share.html',
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
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/logo.svg'
];

// ── Install: pre-cache the entire app shell ──────────────────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ── Activate: wipe old caches and claim all clients immediately ──────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ── Fetch: cache-first for local assets, network-only for API calls ──────────
self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  // Never intercept API calls — always hit the network
  if (url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Ignore non-GET and chrome-extension requests
  if (event.request.method !== 'GET' || url.startsWith('chrome-extension')) {
    return;
  }

  // Share-target navigation arrives with ?title=&text=&url= — strip the query
  // when looking up the cache so we hit the precached track-share.html instantly
  // instead of forcing a network round-trip on every share.
  var matchOpts = url.includes('/app/track-share.html') ? { ignoreSearch: true } : undefined;

  // Cache-first: serve from cache, fallback to network and cache the response
  event.respondWith(
    caches.match(event.request, matchOpts).then(function (cached) {
      if (cached) { return cached; }

      return fetch(event.request).then(function (response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
