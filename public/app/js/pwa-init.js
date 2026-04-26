/* PWA init: service worker registration + install banner (Android prompt, iOS hint). */

(function () {
  'use strict';

  var swRegistration = null;
  var refreshing = false;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/app/sw.js', { scope: '/app/' })
      .then(function (reg) {
        window.__RIQ_SW_REG__ = reg;
        swRegistration = reg;
        setInterval(function () { reg.update(); }, 60000);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') { reg.update(); }
        });

        // A new worker was already waiting from a previous session — prompt
        // the user right away.
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner();
        }

        // Watch for a new worker installing in the background.
        reg.addEventListener('updatefound', function () {
          var incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener('statechange', function () {
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      })
      .catch(function () {});

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  // Force a reload even if controllerchange never fires. Some browsers
  // (notably iOS Safari and old Android WebViews) silently drop the event
  // when the new SW activates without a controller transition. After a
  // short grace period we just reload — worst case the user gets a fresh
  // page with the same code, best case they get the new version.
  function forceReloadAfterTimeout(ms) {
    setTimeout(function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }, ms);
  }

  function pickWaitingWorker() {
    // Always re-resolve at click time. The reference captured when the
    // banner was shown can be stale — by the time the user taps Refresh,
    // the SW may have moved past 'installed' or a newer one may be waiting.
    if (swRegistration && swRegistration.waiting) return swRegistration.waiting;
    if (swRegistration && swRegistration.installing) return swRegistration.installing;
    if (swRegistration && swRegistration.active) return swRegistration.active;
    return null;
  }

  function showUpdateBanner() {
    if (document.getElementById('riqUpdateBanner')) return;
    var bar = document.createElement('div');
    bar.id = 'riqUpdateBanner';
    bar.setAttribute('role', 'status');
    bar.style.cssText =
      'position:fixed;left:14px;right:14px;bottom:calc(72px + env(safe-area-inset-bottom,0px));' +
      'max-width:420px;margin:0 auto;background:#0A2460;color:#fff;border-radius:14px;' +
      'padding:12px 14px;display:flex;align-items:center;gap:12px;z-index:10001;' +
      'box-shadow:0 12px 40px rgba(10,36,96,.35);font-family:Sora,Nunito,sans-serif;' +
      'transform:translateY(120px);opacity:0;transition:transform .3s cubic-bezier(.22,1,.36,1),opacity .3s ease';
    bar.innerHTML =
      '<div style="font-size:22px;line-height:1">✨</div>' +
      '<div id="riqUpdateText" style="flex:1;min-width:0">' +
        '<div style="font-weight:700;font-size:13.5px;line-height:1.3">New version ready</div>' +
        '<div style="font-weight:600;font-size:11.5px;color:rgba(255,255,255,.75);margin-top:2px">Tap refresh to get the latest.</div>' +
      '</div>' +
      '<button type="button" id="riqUpdateRefresh" style="background:#fff;color:#0A2460;border:none;border-radius:10px;font-family:Sora,sans-serif;font-weight:800;font-size:12px;padding:9px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent;min-width:72px">Refresh</button>' +
      '<button type="button" id="riqUpdateDismiss" aria-label="Dismiss" style="background:transparent;color:rgba(255,255,255,.7);border:none;font-size:18px;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:4px 6px">×</button>';

    document.body.appendChild(bar);
    requestAnimationFrame(function () {
      bar.style.transform = 'translateY(0)';
      bar.style.opacity = '1';
    });

    var refreshBtn = document.getElementById('riqUpdateRefresh');
    var textEl = document.getElementById('riqUpdateText');

    refreshBtn.addEventListener('click', function () {
      // Disable the button immediately and give visual feedback so the user
      // knows the tap was registered. Without this, a slow SW or a missed
      // controllerchange leaves the button looking unresponsive.
      if (refreshing) return;
      refreshBtn.disabled = true;
      refreshBtn.style.opacity = '0.6';
      refreshBtn.textContent = 'Updating…';
      if (textEl) {
        textEl.innerHTML =
          '<div style="font-weight:700;font-size:13.5px;line-height:1.3">Updating now…</div>' +
          '<div style="font-weight:600;font-size:11.5px;color:rgba(255,255,255,.75);margin-top:2px">This will only take a moment.</div>';
      }

      var waiting = pickWaitingWorker();
      if (waiting) {
        try { waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (_e) {}
      }

      // Even if postMessage worked, controllerchange isn't guaranteed to
      // fire. Fall back to a forced reload after 1.5s — fresh page either
      // way, and the SW activate handler will have completed by then.
      forceReloadAfterTimeout(1500);
    });
    document.getElementById('riqUpdateDismiss').addEventListener('click', function () {
      bar.style.transform = 'translateY(120px)';
      bar.style.opacity = '0';
      setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 300);
    });
  }

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

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  if (isInstalledAsPWA() || isDismissed()) { return; }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;

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

  var isIOS        = /iPad|iPhone|iPod/.test(navigator.userAgent);
  var isStandalone = window.navigator.standalone;

  if (isIOS && !isStandalone) {
    onReady(function () {
      configureForIOS();
      showBanner();
    });
  }

  onReady(function () {
    var dismissBtn = getDismissBtn();
    if (dismissBtn) {
      dismissBtn.addEventListener('click', dismissBanner);
    }
  });

}());
