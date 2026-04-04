import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: false, // Enable in development for testing
  register: true,
  skipWaiting: true,
  // Prevent next-pwa from trying to cache non-existent build files
  buildExcludes: [
    /chunks\/.*$/,
    /app-build-manifest\.json$/,
    /webpack\/.*$/,
    /css\/.*\.css$/
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // PWA start URL - ensure it opens the app
      { source: "/app", destination: "/app/index.html" },
      // Landing page
      { source: "/", destination: "/index.html" },
      // Main dashboard (app homepage) - for PWA start_url
      { source: "/dashboard", destination: "/app/index.html" },
      // Core nav tabs
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
    ];
  },
};

export default withPWA(nextConfig);
