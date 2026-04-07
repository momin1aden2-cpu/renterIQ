/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Ensure manifest.json is served with correct PWA MIME type
        source: '/:path*manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
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
