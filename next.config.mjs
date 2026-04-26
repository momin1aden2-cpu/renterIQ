/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // Content Security Policy — locks the browser to the third-party origins
    // we actually use. 'unsafe-inline' on script-src is needed because most
    // pages contain inline <script> blocks; once those are extracted we can
    // drop it. Style 'unsafe-inline' covers the inline <style> blocks and
    // dynamically-set element styles.
    const csp = [
      "default-src 'self'",
      // Firebase JS SDK + reCAPTCHA Enterprise (App Check) + html2pdf
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://www.google.com https://www.googletagmanager.com https://www.recaptcha.net https://cdnjs.cloudflare.com",
      // reCAPTCHA Enterprise iframes are required for App Check + sign-in
      "frame-src 'self' https://*.firebaseapp.com https://auth.renteriq.com.au https://www.google.com https://www.recaptcha.net https://accounts.google.com https://checkout.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https: http:",
      "media-src 'self' blob:",
      // Outbound XHR/fetch — Firebase services + Stripe redirect target +
      // Gemini is server-only so not listed here. wss:// for Firestore live updates.
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://*.firebaseapp.com https://auth.renteriq.com.au https://firebasestorage.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://api.stripe.com wss://*.firebaseio.com wss://s-usc1f-nss-2089.firebaseio.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ].join('; ');

    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      {
        key: 'Permissions-Policy',
        value: 'geolocation=(self), camera=(self), microphone=(), payment=(self), usb=(), interest-cohort=()'
      },
      { key: 'Content-Security-Policy', value: csp }
    ];
    return [
      {
        // Security headers applied to every response.
        source: '/:path*',
        headers: securityHeaders
      },
      {
        // Ensure manifest.json is served with correct PWA MIME type.
        source: '/:path*manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }
        ]
      },
      {
        // The service worker file must never be HTTP-cached by the browser,
        // otherwise updates can't be discovered for hours (or days, on iOS).
        // Forcing no-store means every PWA open checks for a new sw.js.
        source: '/app/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
          { key: 'Service-Worker-Allowed', value: '/app/' }
        ]
      },
      {
        // HTML shells also shouldn't be HTTP-cached — the service worker
        // already handles offline fallback. Without this, the browser can
        // return a stale HTML referencing old JS filenames for up to 24h.
        source: '/app/:path*.html',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' }
        ]
      },
      {
        source: '/app',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' }
        ]
      }
    ];
  },
  async rewrites() {
    return [
      // PWA start URL - ensure it opens the app (both with and without trailing slash)
      { source: "/app", destination: "/app/index.html" },
      { source: "/app/", destination: "/app/index.html" },
      // Landing page
      { source: "/", destination: "/index.html" },
      // Main dashboard (app homepage) - for PWA start_url
      { source: "/dashboard", destination: "/app/index.html" },
      // Smart Search Hub
      { source: "/smart-search", destination: "/app/pages/smart-search.html" },
      { source: "/tracked", destination: "/app/pages/tracked.html" },
      { source: "/webview", destination: "/app/pages/webview.html" },
      // API routes
      { source: "/api/extract-metadata", destination: "/api/extract-metadata/route" },
      { source: "/search", destination: "/app/pages/search.html" },
      { source: "/inspect", destination: "/app/pages/inspection.html" },
      { source: "/inspect/routine", destination: "/app/pages/routine-inspection.html" },
      { source: "/vault", destination: "/app/pages/vault.html" },
      { source: "/profile", destination: "/app/pages/profile.html" },
      // Additional pages
      { source: "/lease", destination: "/app/pages/lease.html" },
      { source: "/exit", destination: "/app/pages/exit.html" },
      { source: "/rights", destination: "/app/pages/rights.html" },
      { source: "/renewal", destination: "/app/pages/renewal.html" },
      { source: "/notifications", destination: "/app/pages/notifications.html" },
      { source: "/application", destination: "/app/pages/application.html" },
      { source: "/tools", destination: "/app/pages/tools.html" },
      { source: "/move-in", destination: "/app/pages/entry-audit.html" },
      { source: "/routine-inspection", destination: "/app/pages/routine-inspection.html" },
    ];
  },
};

export default nextConfig;
