/**
 * RenterIQ — Authentication Guard
 * Protects app pages by requiring Firebase authentication
 * If no user is authenticated, redirects to the landing page
 */

(function() {
  'use strict';

  // Configuration — redirect to in-app sign-in page (stays in PWA standalone mode)
  const REDIRECT_PATH = '/app/pages/signin.html';
  const CHECK_INTERVAL = 1000; // Check every second if Firebase not ready
  const MAX_RETRIES = 10; // Maximum retries before giving up

  let retryCount = 0;

  /**
   * Initialize Firebase and check authentication state
   */
  function initializeAuthGuard() {
    // Check if Firebase SDK is loaded
    if (typeof firebase === 'undefined') {
      console.warn('[AuthGuard] Firebase SDK not loaded yet, retrying...');
      retryAndCheck();
      return;
    }

    // Check if Firebase config is available
    if (typeof window.__FIREBASE_CONFIG__ === 'undefined') {
      console.warn('[AuthGuard] Firebase config not loaded yet, retrying...');
      retryAndCheck();
      return;
    }

    // Initialize Firebase if not already initialized
    if (!firebase.apps.length) {
      try {
        firebase.initializeApp(window.__FIREBASE_CONFIG__);
        console.log('[AuthGuard] Firebase initialized');
      } catch (error) {
        console.error('[AuthGuard] Firebase initialization error:', error);
        retryAndCheck();
        return;
      }
    }

    // Get auth instance and set up state observer
    const auth = firebase.auth();
    
    auth.onAuthStateChanged(function(user) {
      if (user) {
        // User is signed in, allow access
        console.log('[AuthGuard] User authenticated:', user.email || user.uid);
        
        // Optional: Update UI elements if needed
        updateAuthUI(user);
      } else {
        // No user signed in, redirect to landing page
        console.log('[AuthGuard] No user authenticated, redirecting to landing page');
        redirectToLanding();
      }
    }, function(error) {
      // Auth state observer error
      console.error('[AuthGuard] Auth state observer error:', error);
      
      // On critical auth errors, still redirect to landing page for security
      if (error.code === 'auth/network-request-failed' || 
          error.code === 'auth/internal-error') {
        console.warn('[AuthGuard] Auth system error, proceeding with caution');
        // Don't redirect on network errors to avoid locking users out
      } else {
        redirectToLanding();
      }
    });
  }

  /**
   * Update UI elements based on authentication state
   */
  function updateAuthUI(user) {
    // Update profile button or other UI elements if they exist
    const profileBtn = document.getElementById('profileBtn');
    const userEmailEl = document.getElementById('userEmail');
    const userNameEl = document.getElementById('userName');
    
    if (userEmailEl && user.email) {
      userEmailEl.textContent = user.email;
    }
    
    if (userNameEl && user.displayName) {
      userNameEl.textContent = user.displayName;
    }
    
    if (profileBtn) {
      profileBtn.style.display = 'block';
    }
  }

  /**
   * Redirect to the landing page
   */
  function redirectToLanding() {
    // Prevent infinite redirect loops
    if (window.location.pathname.indexOf('signin') !== -1) {
      console.warn('[AuthGuard] Already on sign-in page, skipping redirect');
      return;
    }

    console.log('[AuthGuard] Redirecting to sign-in:', REDIRECT_PATH);
    window.location.replace(REDIRECT_PATH);
  }

  /**
   * Retry initialization if Firebase isn't ready yet
   */
  function retryAndCheck() {
    if (retryCount >= MAX_RETRIES) {
      console.error('[AuthGuard] Max retries reached, redirecting to landing page');
      redirectToLanding();
      return;
    }
    
    retryCount++;
    setTimeout(initializeAuthGuard, CHECK_INTERVAL);
  }

  /**
   * Start the auth guard when DOM is ready
   */
  document.addEventListener('DOMContentLoaded', function() {
    console.log('[AuthGuard] Starting authentication guard');
    initializeAuthGuard();
  });

  // Also try to initialize immediately if DOM is already loaded
  if (document.readyState === 'loading') {
    // DOM still loading, wait for DOMContentLoaded
  } else {
    // DOM already loaded, initialize immediately
    console.log('[AuthGuard] DOM already loaded, initializing immediately');
    initializeAuthGuard();
  }

})();