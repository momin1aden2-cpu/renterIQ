/**
 * RenterIQ — Firebase Initialization
 * Ensures Firebase is properly initialized before any auth operations
 */

(function() {
  'use strict';

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
        console.log('[RenterIQ] Firebase initialized successfully');
      } catch (error) {
        console.error('[RenterIQ] Firebase initialization error:', error);
        return false;
      }
    } else {
      console.log('[RenterIQ] Firebase already initialized');
    }

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

  // Export for manual initialization if needed
  window.initializeFirebase = initializeFirebase;
})();