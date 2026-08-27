/* eslint-disable no-restricted-globals */
/**
 * Service worker: offline app shell + static asset cache.
 *
 * ---------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT TOUCH
 * ---------------------------------------------------------------
 * A service worker sits in front of EVERY request the page makes, so
 * the exclusions below are the load-bearing part of this file — far
 * more than the caching is. Each one is a way this could silently break
 * the app or leak data, so read before narrowing any of them:
 *
 *  1. Cross-origin requests (Supabase above all). Every data read and
 *     write, auth token refresh and realtime call goes to the Supabase
 *     origin carrying an Authorization header. Caching any of it would
 *     serve one user's rows to the next user of the device and would
 *     make writes appear to succeed while offline. These are passed
 *     straight through — the SW never even looks at them.
 *
 *  2. Non-GET. POST/PATCH/DELETE are state changes; a cached "success"
 *     is a lie. Bypassed.
 *
 *  3. /api/*. Server routes here render PDFs and read authenticated
 *     data per request. Bypassed.
 *
 *  4. /portal/* and /invoice/*. These are the only server-rendered,
 *     data-bearing HTML pages in the app: the customer portal embeds
 *     estimate figures and is addressed by a secret token in the query
 *     string. Caching that would write a live credential and a
 *     customer's pricing into the device's disk cache, where it
 *     outlives the session and is readable by the next person to open
 *     the browser. Never cached.
 *
 *  5. Anything answered with `Cache-Control: no-store`.
 *
 * Everything the SW DOES cache is either content-hashed and immutable
 * (/_next/static/*), a static icon, or an app-shell HTML document that
 * contains no user data — every authenticated page in this app is a
 * client component that renders an empty shell and then fetches from
 * Supabase, so the HTML itself is identical for every user and safe to
 * reuse. That property is what makes offline shell caching viable here;
 * if a page is ever converted to server-render user data, add it to
 * BYPASS_PREFIXES.
 */

// Bump to invalidate everything: cache names are keyed on it, and
// activate deletes any cache whose name doesn't match the current
// version.
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const SHELL_CACHE = `shell-${VERSION}`;

const OFFLINE_URL = "/offline";

/** Precached at install so the offline fallback is guaranteed present
 * before the SW ever takes control. Kept deliberately tiny — a large
 * precache list makes installation fail as a unit on one bad entry. */
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

/** Never inspected, never cached — see notes 3 and 4 above. */
const BYPASS_PREFIXES = ["/api/", "/portal/", "/invoice/", "/auth/"];

function isBypassed(url) {
  return BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

/** Content-hashed by the build, so the filename changes whenever the
 * bytes change — safe to serve from cache indefinitely and the reason
 * a SW update can never produce a stale-chunk mismatch. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

function isCacheableResponse(response) {
  return (
    response &&
    response.ok &&
    // Opaque (no-cors cross-origin) responses can't be inspected and
    // report status 0; storing them wastes quota and can pin errors.
    response.type !== "opaque" &&
    !(response.headers.get("Cache-Control") || "").includes("no-store")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Individually, not addAll: addAll is atomic, so one 404 (say the
      // offline page was renamed) would fail the whole installation and
      // leave the app with no SW at all.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            // Non-fatal: the runtime handlers below still work, we just
            // lose this one precached entry.
          }
        })
      );
      // Safe here because the only cache-first content is immutable and
      // filename-versioned, so a mid-session activation cannot serve a
      // chunk that disagrees with the running document.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== STATIC_CACHE && name !== SHELL_CACHE)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // (2) State-changing methods are never intercepted.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // (1) Cross-origin — Supabase, fonts, anything else. Untouched.
  if (url.origin !== self.location.origin) return;

  // (3, 4) Authenticated or token-bearing routes.
  if (isBypassed(url)) return;

  // Cache-first for immutable, content-hashed assets.
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (isCacheableResponse(response)) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })()
    );
    return;
  }

  // Network-first for navigations, with the app shell as the offline
  // fallback. Network-first (not cache-first) means a user who IS
  // online always gets the current deploy — the cache exists purely as
  // a safety net, never as the primary source for HTML.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (isCacheableResponse(response)) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          // Offline. Prefer this exact page if we've seen it before,
          // then the generic offline page.
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("You are offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
  }

  // Everything else same-origin falls through to the network untouched.
});

/**
 * Web Push — displays the notification sent from lib/push/sendPush.ts
 * (JSON body: { title, body, url? }). Runs even when no tab is open,
 * which is the entire point of push vs. an in-page toast.
 */
self.addEventListener("push", (event) => {
  let payload = { title: "OSR Pros", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Malformed/non-JSON payload — fall back to the generic title above
    // rather than dropping the notification entirely.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/dashboard" },
    })
  );
});

/** Focuses an already-open tab on the target URL if one exists,
 * otherwise opens a new one — standard "bring the app to front"
 * behavior for a notification click. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clientsList.length > 0 && "focus" in clientsList[0]) {
        clientsList[0].navigate(targetUrl);
        return clientsList[0].focus();
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});
