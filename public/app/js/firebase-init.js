/**
 * RenterIQ — Firebase Initialization
 * Ensures Firebase is properly initialized before any auth operations
 */

(function() {
  'use strict';

  var appCheckReady = false;

  // Activate App Check synchronously, immediately after initializeApp and
  // BEFORE any Firestore/Auth/Storage call. The compat SDK is preloaded by
  // a static <script> tag in every HTML page, so firebase.appCheck is
  // available by the time this runs. If we activated lazily/async, the
  // first Firestore listen channel would already be open without a token.
  function initializeAppCheck() {
    if (appCheckReady) return;
    var siteKey = window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.appCheckSiteKey;
    if (!siteKey) return; // not configured yet — fall open
    if (typeof firebase === 'undefined' || !firebase.appCheck) {
      console.warn('[RenterIQ] App Check SDK not loaded — site key set but the script tag is missing on this page.');
      return;
    }
    try {
      var provider = new firebase.appCheck.ReCaptchaEnterpriseProvider(siteKey);
      firebase.appCheck().activate(provider, /* isTokenAutoRefreshEnabled */ true);
      appCheckReady = true;
    } catch (e) {
      console.warn('[RenterIQ] App Check activation failed:', e);
    }
  }

  function initializeFirebase() {
    // Check if Firebase SDK is loaded
    if (typeof firebase === 'undefined') {
      console.error('[RenterIQ] Firebase SDK not loaded');
      return false;
    }

    // Check if config is available
    if (typeof window.__FIREBASE_CONFIG__ === 'undefined') {
      console.error('[RenterIQ] Firebase config not loaded');
      return false;
    }

    // Initialize Firebase if not already initialized
    if (!firebase.apps.length) {
      try {
        firebase.initializeApp(window.__FIREBASE_CONFIG__);
      } catch (error) {
        console.error('Firebase init:', error);
        return false;
      }
    }

    // App Check must activate immediately after initializeApp so subsequent
    // Firestore/Auth/Storage calls get a token attached. No-op when site key
    // isn't configured yet.
    initializeAppCheck();

    // Enable Firestore offline persistence so writes queue while offline and
    // sync when back online. Must be called before any other Firestore use.
    if (firebase.firestore && !window.__RIQ_FIRESTORE_PERSISTED__) {
      window.__RIQ_FIRESTORE_PERSISTED__ = true;
      try {
        firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(function(err) {
          if (err.code === 'failed-precondition') {
            console.warn('[RenterIQ] Firestore persistence: multiple tabs open');
          } else if (err.code === 'unimplemented') {
            console.warn('[RenterIQ] Firestore persistence not supported in this browser');
          } else {
            console.warn('[RenterIQ] Firestore persistence error:', err);
          }
        });
      } catch (e) {
        console.warn('[RenterIQ] Could not enable Firestore persistence:', e);
      }
    }

    return true;
  }

  // Wait for DOM and Firebase SDKs to be ready
  document.addEventListener('DOMContentLoaded', function() {
    // Try to initialize immediately
    if (typeof firebase !== 'undefined' && typeof window.__FIREBASE_CONFIG__ !== 'undefined') {
      initializeFirebase();
    } else {
      // If not ready, wait a bit and retry
      setTimeout(function() {
        if (typeof firebase !== 'undefined' && typeof window.__FIREBASE_CONFIG__ !== 'undefined') {
          initializeFirebase();
        } else {
          console.warn('[RenterIQ] Firebase SDK or config still not loaded after timeout');
        }
      }, 500);
    }
  });

  window.initializeFirebase = initializeFirebase;

  // Single source of truth for HTML escaping. Several pages had their own
  // partial copies (some missing " and ', which left attribute contexts
  // open). New code should always reach for window.escHtml; the local copies
  // are being phased out.
  if (!window.escHtml) {
    window.escHtml = function(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
  }

  // Attach a Firebase ID token + App Check token to outbound /api/ requests so
  // server routes can verify the caller's uid and origin, and apply per-user
  // rate limits. App Check token is attached only when the SDK has been
  // activated (i.e. APPCHECK_SITE_KEY is set) — otherwise the header is
  // omitted and the server-side gate falls open per its own env flag.
  if (!window.__RIQ_FETCH_PATCHED__) {
    window.__RIQ_FETCH_PATCHED__ = true;
    var nativeFetch = window.fetch.bind(window);

    function getAppCheckToken() {
      try {
        if (typeof firebase === 'undefined' || !firebase.appCheck) return Promise.resolve(null);
        return firebase.appCheck().getToken(/* forceRefresh */ false)
          .then(function(res) { return (res && res.token) || null; })
          .catch(function() { return null; });
      } catch (e) {
        return Promise.resolve(null);
      }
    }

    window.fetch = function(input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var isApi = false;
        try { isApi = new URL(url, window.location.href).pathname.indexOf('/api/') === 0; } catch (e) {}
        if (!isApi) return nativeFetch(input, init);
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
          return nativeFetch(input, init);
        }
        var user = firebase.auth().currentUser;
        var idTokenPromise = user ? user.getIdToken().catch(function(){ return null; }) : Promise.resolve(null);
        return Promise.all([idTokenPromise, getAppCheckToken()]).then(function(toks) {
          init = init || {};
          var headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
          if (toks[0] && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + toks[0]);
          if (toks[1] && !headers.has('X-Firebase-AppCheck')) headers.set('X-Firebase-AppCheck', toks[1]);
          init.headers = headers;
          return nativeFetch(input, init);
        }).catch(function() {
          return nativeFetch(input, init);
        });
      } catch (e) {
        return nativeFetch(input, init);
      }
    };
  }

  // Lightweight usage counter — no personal data, just aggregate feature counts.
  // Call: riqEvent('entry_audit_complete') or riqEvent('exit_report_generated')
  // Data lives in Firestore at metrics/events/{eventName} with a count field.
  window.riqEvent = function(name) {
    try {
      if (!firebase.apps || !firebase.apps.length) return;
      var db = firebase.firestore();
      var ref = db.collection('metrics').doc(name);
      ref.set({ count: firebase.firestore.FieldValue.increment(1), lastAt: Date.now() }, { merge: true }).catch(function(){});
    } catch(e){}
  };
})();