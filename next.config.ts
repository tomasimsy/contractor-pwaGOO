import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Files under public/ are served with a long-lived cache by
        // default. For a service worker that is actively harmful: the
        // browser would keep re-reading a stale sw.js, pinning users to
        // an old worker — and therefore an old caching strategy — long
        // after a deploy. `no-cache` forces revalidation on every
        // check, which is the standard recommendation for worker
        // scripts.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          // A worker can only control pages at or below the path it was
          // served from. sw.js is already at the root, so this is
          // insurance against a future move into a subdirectory
          // silently shrinking its scope.
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Same reasoning, gentler: the manifest changes rarely, but a
        // stale copy means renamed apps and new icons never reach
        // already-installed users.
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
