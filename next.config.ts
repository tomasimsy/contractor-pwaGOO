import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium's own code locates its bin/ folder via a path
  // relative to ITS OWN file location inside node_modules. If Next's
  // compiler bundles/relocates that code into a shared chunk (which
  // Turbopack does by default), that relative lookup breaks even
  // though the real files are still on disk — the exact "input
  // directory .../bin does not exist" error this app hit in
  // production. Marking it (and puppeteer-core, for the same reason)
  // as a server-external package tells Next to leave it as a normal
  // `require()` from node_modules at runtime instead of inlining it.
  // See https://github.com/Sparticuz/chromium#bundler-configuration.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Next.js's build-time file tracing decides what each serverless
  // function's deployment bundle contains. @sparticuz/chromium ships
  // its actual Chromium binary as compressed .br files that its own
  // JS never `require()`s directly (it extracts them at runtime), so
  // tracing misses them by default — the function deploys, but
  // chromium.executablePath() then fails at runtime because the
  // binary genuinely isn't there. This explicitly forces those files
  // into the one route that needs them. Kept alongside
  // serverExternalPackages above — externalizing fixes the relative
  // PATH lookup, this makes sure the actual bin files are copied into
  // the deployed function in the first place.
  outputFileTracingIncludes: {
    "/api/estimates/[id]/send-email": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
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
