"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js. Renders nothing.
 *
 * PRODUCTION ONLY, on purpose. In `next dev` the framework serves
 * uncompiled, frequently-changing chunks from /_next/static, and the
 * service worker treats that path as immutable and cache-first. Under
 * dev those two assumptions collide: HMR pushes a new chunk, the SW
 * serves yesterday's from cache, and the app breaks in ways that look
 * like application bugs. Registering only in production keeps the dev
 * loop honest.
 *
 * To exercise the SW locally, run a production build:
 *   npm run build && npm start
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Registration races nothing important, but doing it after load
    // keeps it off the critical path for first paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // A failed registration must never surface to the user: the app
        // works fine without a SW, it just isn't installable/offline.
      });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
