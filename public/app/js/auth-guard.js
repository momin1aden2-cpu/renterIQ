/* Auth guard: redirects to signin when no Firebase user. */

(function() {
  'use strict';

  const REDIRECT_PATH = '/app/pages/signin.html';
  const CHECK_INTERVAL = 1000;
  const MAX_RETRIES = 10;

  let retryCount = 0;

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
