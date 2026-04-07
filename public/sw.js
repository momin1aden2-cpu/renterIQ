// Self-unregistering service worker — clears all caches and unregisters itself.
// This file exists at /sw.js to clean up any old root-scope service workers
// that may have been registered by previous builds (e.g. next-pwa).
// The real app service worker lives at /app/sw.js with scope /app/.
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      // Only delete caches that belong to the root SW (start-url, dev, workbox)
      // Do NOT touch renteriq-* caches which belong to /app/sw.js
      var rootCaches = keys.filter(function(k) {
        return k === 'start-url' || k === 'dev' || k.startsWith('workbox-');
      });
      return Promise.all(rootCaches.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      return self.registration.unregister();
    }).then(function() {
      return self.clients.matchAll();
    }).then(function(clients) {
      clients.forEach(function(c) { c.navigate(c.url); });
    })
  );
});
