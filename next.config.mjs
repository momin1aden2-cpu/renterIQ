import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Landing page
      { source: "/", destination: "/index.html" },
      // Main dashboard (app homepage)
      { source: "/dashboard", destination: "/app/index.html" },
      { source: "/app", destination: "/app/index.html" },
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
