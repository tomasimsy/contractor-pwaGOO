import type { MetadataRoute } from "next";

/**
 * Web app manifest — served by Next at /manifest.webmanifest.
 *
 * `start_url: "/dashboard"` rather than "/": launching the installed
 * app should land on the app, not the marketing/redirect root. An
 * unauthenticated launch still ends up at /login, because proxy.ts is
 * the auth boundary and redirects regardless of entry point — the
 * manifest is a hint about where to start, never a way around a guard.
 *
 * `display: "standalone"` is what removes the browser chrome and makes
 * the installed app feel native. Note this ALSO removes the back
 * button on Android, which is why the in-app navigation (Sidebar,
 * MobileBottomNav) has to be sufficient on its own — it is.
 *
 * Icons declare "any" and "maskable" as separate entries rather than
 * one entry with `purpose: "any maskable"`. A combined purpose tells
 * the platform a single bitmap is correct for both, which cannot be
 * true: the maskable art is inset ~40% to survive Android's crop, so
 * reusing it for "any" yields a tiny glyph swimming in padding.
 * See scripts/generate-pwa-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OSR Pros",
    short_name: "OSR Pros",
    description: "Estimates, invoices, expenses and projects for contractors.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#16794f",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Estimates", url: "/estimates" },
      { name: "Invoices", url: "/invoices" },
      { name: "Expenses", url: "/expenses" },
    ],
  };
}
