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
      })
      .catch(function () {});

    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
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
