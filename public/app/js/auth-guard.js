/* Auth guard: redirects to signin when no Firebase user.
 * Also wraps fetch() so every /api/* call automatically carries the current
 * Firebase ID token. Done once here so individual pages don't have to know
 * about auth headers.
 */

(function() {
  'use strict';

  const REDIRECT_PATH = '/app/pages/signin.html';
  const CHECK_INTERVAL = 1000;
  const MAX_RETRIES = 10;

  let retryCount = 0;

  // ── Attach Firebase ID token to /api/* requests ────────────────────────
  // Monkey-patch window.fetch once on script load. Non-api URLs pass through
  // untouched. If the user isn't signed in yet the request goes out without a
  // token and the server decides how to respond.
  if (window.fetch && !window.__riqFetchPatched) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
      init = init || {};
      const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
      const isApi =
        urlStr.indexOf('/api/') === 0 ||
        urlStr.indexOf(window.location.origin + '/api/') === 0;
      if (!isApi) return originalFetch(input, init);

      let attachedToken = false;
      try {
        const user =
          typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser
            ? firebase.auth().currentUser
            : null;
        if (user && typeof user.getIdToken === 'function') {
          const token = await user.getIdToken();
          const headers = new Headers(init.headers || {});
          if (!headers.has('Authorization')) {
            headers.set('Authorization', 'Bearer ' + token);
          }
          init = Object.assign({}, init, { headers });
          attachedToken = true;
        }
      } catch (_e) { /* fall through without token */ }

      console.log('[RIQ api]', urlStr.replace(window.location.origin, ''), 'token?', attachedToken);
      return originalFetch(input, init);
    };
    window.__riqFetchPatched = true;
    console.log('[RIQ] fetch patched for /api/* auth');
  }

  function initializeAuthGuard() {
    if (typeof firebase === 'undefined') { retryAndCheck(); return; }
    if (typeof window.__FIREBASE_CONFIG__ === 'undefined') { retryAndCheck(); return; }

    if (!firebase.apps.length) {
      try {
        firebase.initializeApp(window.__FIREBASE_CONFIG__);
      } catch (error) {
        console.error('Firebase init:', error);
        retryAndCheck();
        return;
      }
    }

    firebase.auth().onAuthStateChanged(function(user) {
      if (user) {
        updateAuthUI(user);
      } else {
        redirectToLanding();
      }
    }, function(error) {
      console.error('Auth state:', error);
      if (error.code !== 'auth/network-request-failed' &&
          error.code !== 'auth/internal-error') {
        redirectToLanding();
      }
    });
  }

  function updateAuthUI(user) {
    const profileBtn = document.getElementById('profileBtn');
    const userEmailEl = document.getElementById('userEmail');
    const userNameEl = document.getElementById('userName');

    if (userEmailEl && user.email) userEmailEl.textContent = user.email;
    if (userNameEl && user.displayName) userNameEl.textContent = user.displayName;
    if (profileBtn) profileBtn.style.display = 'block';
  }

  function redirectToLanding() {
    if (window.location.pathname.indexOf('signin') !== -1) return;
    window.location.replace(REDIRECT_PATH);
  }

  function retryAndCheck() {
    if (retryCount >= MAX_RETRIES) { redirectToLanding(); return; }
    retryCount++;
    setTimeout(initializeAuthGuard, CHECK_INTERVAL);
  }

  document.addEventListener('DOMContentLoaded', initializeAuthGuard);

  if (document.readyState !== 'loading') {
    initializeAuthGuard();
  }

})();
