# Performance Audit — contractor-pwa

Audit only — no fixes applied yet, per the same audit-then-report pattern used for the DB integrity audit.

---

## 1. HIGH — Duplicate Supabase client instances (confirmed live via console warning)

**Finding:** Two separate module-level `createClient()` calls exist: `lib/supabase.ts` and `lib/supabase/client.ts`. 72 files import from the newer `lib/supabase/client.ts`; 2 files (`app/HomeScreen.tsx`, `components/mileage/useOfflineSync.ts`) still import the older `lib/supabase.ts`. This is the exact cause of the `Multiple GoTrueClient instances detected in the same browser context` warning seen live in the browser console during the last verification pass. Each instance maintains its own in-memory auth state — under concurrent use this is documented by Supabase as producing "undefined behavior," and at minimum it means auth-state changes in one part of the app aren't reflected in the other.

**Fix:** Delete `lib/supabase.ts`, repoint its 2 importers to `lib/supabase/client.ts`.

---

## 2. HIGH — Redundant realtime + polling for the same data

**Finding:** `components/RealtimeNotificationListener.tsx` opens a Postgres-changes realtime subscription AND unconditionally calls `fetchNewApproved()` immediately on mount (outside the subscribe callback), then again inside the `SUBSCRIBED` callback, with a 5s-fallback timer that starts a 10-second poll if no realtime event arrives. Confirmed live: browser console showed the channel repeatedly flapping `CLOSED` → `SUBSCRIBED` on a single page load, and each flap re-triggers `fetchNewApproved()` — two full queries (`estimates` then `clients`) every time. This component appears to be mounted more than once per page load too (every console line appeared exactly twice), doubling the effect again.

**Fix:** (a) find why the channel subscribes twice / flaps (likely mounted in two places, e.g. both a root layout and a nested one — grep for `<RealtimeNotificationListener` usages); (b) only call `fetchNewApproved()` once per lifecycle transition, not on every `SUBSCRIBED` event; (c) once realtime is confirmed working in production, consider dropping the polling fallback's `fetchNewApproved()` "belt and suspenders" initial call.

---

## 3. MEDIUM — Missing pagination on several core queries

**Finding:** Of the query modules in `lib/queries/`, only `invoices.ts`, `projects.ts`, and `expenses.ts` use `.range()`/`.limit()`. These have no pagination at all: `estimates.ts`, `clients.ts`, `subcontractors.ts`, `changeOrders.ts`, `customerPayments.ts`, `tax.ts`, `analytics.ts`. Estimates and clients in particular are core, growing tables — an established contractor account will eventually fetch its entire estimate/client history on every dashboard/list load.

**Fix:** Add `.range()`-based pagination (or cursor-based, matching whatever `invoices.ts` already does) to `estimates.ts` and `clients.ts` first — those are the two most likely to grow unbounded.

---

## 4. MEDIUM — No client-side data-fetching cache layer

**Finding:** No `@tanstack/react-query` or `swr` in `package.json`. Data fetching is 88 files' worth of hand-rolled `useEffect` + `useState`. This means every time a user navigates back to a page they were just on, the full query set re-runs from scratch — no request de-duplication, no stale-while-revalidate, no shared cache between components that both need (e.g.) the client list.

**Fix:** Not a quick patch — this is an architectural gap. If it's worth investing in, react-query is the natural fit given the codebase already centralizes fetching in `lib/queries/*`; it would slot in as a thin wrapper around the existing query functions rather than a rewrite.

---

## 5. MEDIUM — Duplicate/overlapping dependencies, some entirely unused

**Finding:**
- `html2pdf.js`, `jspdf`, `html2canvas`, and `aos` are all listed in `package.json` dependencies but **zero files import any of them** (confirmed via grep across `app/`, `components/`, `lib/`). Dead weight in `node_modules`/install size, though since they're never imported they don't inflate the actual client bundle.
- `@react-pdf/renderer` is the one PDF library actually in use (`components/pdf/InvoicePDF.tsx`, `EstimatePDF.tsx`) — so `html2pdf.js`/`jspdf`/`html2canvas` are very likely leftovers from a prior PDF-generation approach that was replaced but never cleaned up.
- `framer-motion` (used) and no other animation lib actually imported (`aos` unused, confirmed above) — no actual conflict, just the dead `aos` dependency again.

**Fix:** `npm uninstall html2pdf.js jspdf html2canvas aos` after confirming (e.g. via a build) nothing dynamically requires them by string.

---

## 6. LOW-MEDIUM — Sparse memoization

**Finding:** Only 9 `useMemo` and 17 `useCallback` call sites across the entire `app/`+`components/` tree (144 client components). Not inherently a problem — over-memoizing is its own anti-pattern — but combined with finding #7 (no query cache) and the dashboard's card-grid re-rendering on every data refresh, list-heavy pages (Estimates, Invoices, Clients) are worth checking individually for expensive re-renders on every keystroke/filter change.

**Fix:** Profile the actual list pages with React DevTools before adding memoization anywhere — don't add `useMemo`/`useCallback` speculatively.

---

## 7. LOW — Bundle/code-splitting: framer-motion loads on every route

**Finding:** `app/template.tsx` — a Next.js special file that wraps every route and remounts on every navigation — imports `framer-motion` directly (not via `next/dynamic`). Since `template.tsx` sits at the app root, this ships framer-motion in the shared bundle for every page, including the public marketing pages (landing page, public estimate/invoice signing pages) that don't need the dashboard's tab-slide animation. Only one `next/dynamic` call exists in the whole codebase (`components/mileage/MileageTracker.tsx`, appropriately lazy-loading the Leaflet map).

**Fix:** Lower priority than the others — worth a real bundle-analyzer run (`@next/bundle-analyzer`) before deciding whether to split this out, since framer-motion may already be reasonably sized after tree-shaking. Not verified with an actual build in this pass.

---

## 8. Not yet verified this pass

- **Optimistic updates**: not checked — would need to trace individual mutation call sites (e.g. payment recording, expense creation) to see whether UI updates before or after the round-trip resolves.
- **Loading states**: spot-checked live in the previous verification pass — dashboard shows a real loading gap before data resolves, no broken flash. Not re-verified per-page here.
- **Actual bundle size numbers**: no production build was run in this pass; findings #5 and #7 are based on import-graph inspection, not measured KB. A real `next build` + `@next/bundle-analyzer` pass would give concrete numbers and should be the next step if bundle size specifically is a priority.

---

## Summary table

| # | Finding | Category | Risk |
|---|---|---|---|
| 1 | Two separate Supabase client singletons (confirmed via live console warning) | Duplicate queries / correctness | High |
| 2 | Realtime subscription + polling both fire redundantly, component likely double-mounted | Unnecessary API calls | High |
| 3 | `estimates`/`clients`/others fetch unbounded — no pagination | Missing pagination | Medium |
| 4 | No react-query/SWR — every nav refetches everything, no cache | Caching opportunity | Medium |
| 5 | 4 unused PDF/animation deps (`html2pdf.js`, `jspdf`, `html2canvas`, `aos`) | Duplicate data / bundle | Medium |
| 6 | Only 9 useMemo / 17 useCallback across 144 client components | Missing memoization | Low-Medium |
| 7 | framer-motion loads app-wide via root `template.tsx`, only 1 dynamic import in whole app | Code splitting | Low |
