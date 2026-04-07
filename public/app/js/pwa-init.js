/**
 * RenterIQ — PWA Init (The Exterminator + Smart Install Interceptor)
 * v1.0 — Scorched Earth Rebuild
 *
 * PHASE 1 — THE EXTERMINATOR
 *   1. Unregisters ALL existing service workers
 *   2. Deletes ALL existing caches
 *   3. Registers the fresh, pristine /app/sw.js
 *
 * PHASE 3 — SMART INSTALL INTERCEPTOR
 *   Android: Captures beforeinstallprompt, fires custom banner
 *   iOS:     Detects Safari + not-standalone, shows instructions banner
 *   Both:    Respects localStorage dismissal flag — never nags again
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 1: THE EXTERMINATOR
  // ─────────────────────────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then(function (registrations) {
        // Step 1 — Unregister every active / waiting / installing service worker
        return Promise.all(
          registrations.map(function (reg) {
            return reg.unregister();
          })
        );
      })
      .then(function () {
        // Step 2 — Nuke every cache in the CacheStorage
        return caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (k) { return caches.delete(k); })
          );
        });
      })
      .then(function () {
        // Step 3 — Register the pristine new service worker
        return navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
      })
      .then(function (reg) {
        console.log('[RenterIQ] ✅ Service Worker registered. Scope:', reg.scope);
      })
      .catch(function (err) {
        console.warn('[RenterIQ] ⚠️ SW setup error:', err);
      });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 3: SMART INSTALL INTERCEPTOR
  // ─────────────────────────────────────────────────────────────────────────────
  var deferredPrompt = null;
  var DISMISSED_KEY  = 'riq-install-dismissed';
  var BANNER_ID      = 'pwaInstallBanner';

  function isInstalledAsPWA() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isDismissed() {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  }

  function getBanner()     { return document.getElementById(BANNER_ID); }
  function getInstallBtn() { return document.getElementById('pwaInstallBtn'); }
  function getDismissBtn() { return document.getElementById('pwaInstallDismiss'); }

  function showBanner() {
    var el = getBanner();
    if (el) el.style.display = 'flex';
  }

  function hideBanner() {
    var el = getBanner();
    if (el) el.style.display = 'none';
  }

  function dismissBanner() {
    hideBanner();
    localStorage.setItem(DISMISSED_KEY, '1');
  }

  /** iOS-specific: hide the install button and update the subtext with Share instructions */
  function configureForIOS() {
    var banner = getBanner();
    if (!banner) return;
    var sub = banner.querySelector('.pwa-banner-sub');
    if (sub) {
      sub.textContent =
        "Tap the Share icon below and select \u2018Add to Home Screen\u2019 to install.";
    }
    var btn = getInstallBtn();
    if (btn) btn.style.display = 'none';
  }

  /** Run fn immediately if DOM is ready, otherwise wait for DOMContentLoaded */
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // Bail out early — already installed or permanently dismissed
  if (isInstalledAsPWA() || isDismissed()) { return; }

  // ── Android / Chrome: capture the native install prompt ───────────────────────
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();   // Suppress browser's default mini-infobar
    deferredPrompt = e;   // Save it so we can fire it on the custom button click

    onReady(function () {
      showBanner();

      var installBtn = getInstallBtn();
      if (installBtn) {
        installBtn.addEventListener('click', function () {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function () {
            deferredPrompt = null;
            hideBanner();
          });
        });
      }
    });
  });

  // ── iOS Detection: Safari on iPhone / iPad / iPod, not already installed ──────
  var isIOS        = /iPad|iPhone|iPod/.test(navigator.userAgent);
  var isStandalone = window.navigator.standalone; // true only when running as installed PWA

  if (isIOS && !isStandalone) {
    onReady(function () {
      configureForIOS();
      showBanner();
    });
  }

  // ── Dismissal: "Not Now" button — hide forever via localStorage ───────────────
  onReady(function () {
    var dismissBtn = getDismissBtn();
    if (dismissBtn) {
      dismissBtn.addEventListener('click', dismissBanner);
    }
  });

}());
