/* PWA init: service worker registration + install banner (Android prompt, iOS hint). */

(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/app/sw.js', { scope: '/app/' })
      .then(function (reg) {
        window.__RIQ_SW_REG__ = reg;
        setInterval(function () { reg.update(); }, 60000);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') { reg.update(); }
        });

        // A new worker was already waiting from a previous session — prompt
        // the user right away.
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner(reg.waiting);
        }

        // Watch for a new worker installing in the background.
        reg.addEventListener('updatefound', function () {
          var incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener('statechange', function () {
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(incoming);
            }
          });
        });
      })
      .catch(function () {});

    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  function showUpdateBanner(worker) {
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
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:700;font-size:13.5px;line-height:1.3">New version ready</div>' +
        '<div style="font-weight:600;font-size:11.5px;color:rgba(255,255,255,.75);margin-top:2px">Tap refresh to get the latest.</div>' +
      '</div>' +
      '<button type="button" id="riqUpdateRefresh" style="background:#fff;color:#0A2460;border:none;border-radius:10px;font-family:Sora,sans-serif;font-weight:800;font-size:12px;padding:9px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent">Refresh</button>' +
      '<button type="button" id="riqUpdateDismiss" aria-label="Dismiss" style="background:transparent;color:rgba(255,255,255,.7);border:none;font-size:18px;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:4px 6px">×</button>';

    document.body.appendChild(bar);
    requestAnimationFrame(function () {
      bar.style.transform = 'translateY(0)';
      bar.style.opacity = '1';
    });

    document.getElementById('riqUpdateRefresh').addEventListener('click', function () {
      try { worker.postMessage({ type: 'SKIP_WAITING' }); } catch (_e) {}
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
