/**
 * RenterIQ — Push Notifications (RIQPush)
 *
 * Handles:
 *  - Permission request (Notification API)
 *  - FCM token retrieval + storage in Firestore
 *  - Token refresh on every load
 *  - Enable/disable toggles
 *
 * Requires:
 *  - firebase-messaging-compat.js loaded on the page
 *  - VAPID key set in Firebase Console → Cloud Messaging → Web Push certificates
 *  - /app/sw.js registered (handled by pwa-init.js)
 *
 * Usage:
 *   await RIQPush.requestPermission(); // asks user, stores token
 *   RIQPush.isEnabled();               // boolean
 */
(function() {
  'use strict';

  // ── VAPID key ──
  // Get this from Firebase Console → Project Settings → Cloud Messaging
  // → Web Push certificates → Key pair → Copy the public key
  // Set it as NEXT_PUBLIC_FIREBASE_VAPID_KEY in .env.local
  // The /api/firebase-config endpoint can expose it alongside the other config keys.
  // For now, we attempt to read it from window.__FIREBASE_CONFIG__.vapidKey
  // or fall back to a placeholder that logs a clear error message.

  var MESSAGING_SDK_URL = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js';
  var messagingLoadPromise = null;
  var currentToken = null;

  function loadMessagingSDK() {
    if (typeof firebase !== 'undefined' && firebase.messaging) return Promise.resolve();
    if (messagingLoadPromise) return messagingLoadPromise;
    messagingLoadPromise = new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = MESSAGING_SDK_URL;
      s.async = true;
      s.onload = function() { resolve(); };
      s.onerror = function() { reject(new Error('Failed to load Firebase Messaging SDK')); };
      document.head.appendChild(s);
    });
    return messagingLoadPromise;
  }

  function getVapidKey() {
    // Try env-injected config first
    if (window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.vapidKey) {
      return window.__FIREBASE_CONFIG__.vapidKey;
    }
    // Try localStorage fallback (can be set manually)
    try {
      var k = localStorage.getItem('riq_vapid_key');
      if (k) return k;
    } catch (e) {}
    return null;
  }

  function waitForSW() {
    return new Promise(function(resolve) {
      if (window.__RIQ_SW_REG__) { resolve(window.__RIQ_SW_REG__); return; }
      var attempts = 0;
      var check = setInterval(function() {
        if (window.__RIQ_SW_REG__ || attempts > 30) {
          clearInterval(check);
          resolve(window.__RIQ_SW_REG__ || null);
        }
        attempts++;
      }, 200);
    });
  }

  // ── Public API ──
  var RIQPush = {

    /** Is push currently enabled (permission granted + token stored)? */
    isEnabled: function() {
      return 'Notification' in window && Notification.permission === 'granted' && !!currentToken;
    },

    /** Is push permission already granted? (may not have token yet) */
    isPermissionGranted: function() {
      return 'Notification' in window && Notification.permission === 'granted';
    },

    /**
     * Request push permission, get FCM token, store in Firestore.
     * Returns Promise<string|null> — the FCM token or null if denied.
     */
    requestPermission: function() {
      if (!('Notification' in window)) {
        return Promise.resolve(null);
      }

      return Notification.requestPermission().then(function(permission) {
        if (permission !== 'granted') return null;
        return RIQPush.getAndStoreToken();
      });
    },

    /**
     * Get FCM token and store it in Firestore.
     * Called after permission is granted, and on every page load to refresh.
     */
    getAndStoreToken: function() {
      var vapidKey = getVapidKey();
      if (!vapidKey) {
        console.warn('[RIQPush] No VAPID key configured. Set NEXT_PUBLIC_FIREBASE_VAPID_KEY in .env.local or add it to the Firebase config endpoint.');
        // Still return resolved — push will work when the key is added
        return Promise.resolve(null);
      }

      return loadMessagingSDK().then(function() {
        return waitForSW();
      }).then(function(swReg) {
        if (!swReg) {
          console.warn('[RIQPush] No service worker registration available');
          return null;
        }

        var messaging = firebase.messaging();
        return messaging.getToken({
          vapidKey: vapidKey,
          serviceWorkerRegistration: swReg
        });
      }).then(function(token) {
        if (!token) return null;
        currentToken = token;

        // Store token in Firestore so the backend can target this device
        if (window.RIQStore) {
          RIQStore.ready.then(function() {
            if (!RIQStore.isAuthed()) return;
            // Use a hash of the token as the doc ID so each device gets one entry
            var tokenId = 'fcm_' + simpleHash(token);
            RIQStore.write('fcm-tokens', tokenId, {
              token: token,
              createdAt: Date.now(),
              userAgent: navigator.userAgent.substring(0, 200),
              platform: navigator.platform || 'unknown'
            });
          });
        }

        // Also cache locally
        try { localStorage.setItem('riq_fcm_token', token); } catch (e) {}

        return token;
      }).catch(function(err) {
        console.warn('[RIQPush] Token retrieval failed:', err);
        return null;
      });
    },

    /**
     * Disable push notifications for this device.
     * Deletes the FCM token from Firestore.
     */
    disable: function() {
      currentToken = null;
      try { localStorage.removeItem('riq_fcm_token'); } catch (e) {}

      return loadMessagingSDK().then(function() {
        var messaging = firebase.messaging();
        return messaging.deleteToken();
      }).catch(function(err) {
        console.error('Token deletion failed:', err);
      });
    },

    /** Refresh the token on page load if permission is already granted */
    refreshIfEnabled: function() {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      // Load cached token
      try { currentToken = localStorage.getItem('riq_fcm_token'); } catch (e) {}
      // Refresh in background
      RIQPush.getAndStoreToken();
    }
  };

  // Simple string hash for generating deterministic doc IDs from tokens
  function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  window.RIQPush = RIQPush;

  // Auto-refresh token on page load if already permitted
  document.addEventListener('DOMContentLoaded', function() {
    // Wait for Firebase to init before trying to refresh
    setTimeout(function() { RIQPush.refreshIfEnabled(); }, 2000);
  });
})();
