/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      {
        key: 'Permissions-Policy',
        value: 'geolocation=(self), camera=(self), microphone=(), payment=(self), usb=(), interest-cohort=()'
      }
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
