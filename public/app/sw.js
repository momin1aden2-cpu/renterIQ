// RenterIQ Service Worker v39 — Photo timestamps unified across report-issue + routine + maintenance
// No kill-switch. No dev-mode logic. Network-first HTML, cache-first assets, network-only APIs.

var CACHE_NAME = 'renteriq-shell-v39';

var APP_SHELL = [
  '/app/index.html',
  '/app/css/app.css',
  '/app/js/sidebar.js',
  '/app/js/pwa-init.js',
  '/app/js/storage.js',
  '/app/js/payments.js',
  '/app/js/pdf-export.js',
  '/app/js/push-notifications.js',
  '/app/js/firebase-init.js',
  '/app/js/auth-guard.js',
  '/app/js/searchService.js',
  '/app/manifest.json',
  '/app/track-share.html',
  '/app/pages/signin.html',
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
  '/app/pages/rent-tracker.html',
  '/app/pages/bond-tracker.html',
  '/app/pages/routine-inspection.html',
  '/app/pages/report-issue.html',
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

  // For HTML documents, use NETWORK-FIRST so newly-deployed pages always show
  // up on the next visit. Falls back to cache offline. This fixes the "pushed
  // commits not visible on phone" problem. Static assets (CSS, JS, images,
  // manifest) stay cache-first with background refresh.
  var isHTML = event.request.mode === 'navigate'
    || (event.request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith(
      fetch(event.request).then(function (response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function () {
        return caches.match(event.request, matchOpts);
      })
    );
    return;
  }

  // Non-HTML: cache-first, update cache in the background on hit
  event.respondWith(
    caches.match(event.request, matchOpts).then(function (cached) {
      if (cached) {
        // Background refresh so the next load has the newest asset
        fetch(event.request).then(function (response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
        }).catch(function () {});
        return cached;
      }
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

// ── Push notifications ──────────────────────────────────────────────────────
// FCM sends a push message → SW wakes up → shows a native notification.
// The payload can include: title, body, icon, url (click target).
self.addEventListener('push', function (event) {
  if (!event.data) return;

  var payload = {};
  try { payload = event.data.json(); } catch (e) {
    // Plain text fallback
    payload = { notification: { title: 'RenterIQ', body: event.data.text() } };
  }

  var n = payload.notification || payload.data || payload;
  var title = n.title || 'RenterIQ';
  var options = {
    body: n.body || '',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    tag: n.tag || 'riq-' + Date.now(),
    data: { url: n.url || n.click_action || '/app/index.html' },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click → open the relevant page ──
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  var url = (event.notification.data && event.notification.data.url) || '/app/index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // If the app is already open, focus it and navigate
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf('/app/') !== -1 && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
