# ARCHITECTURE

Single source of truth for how this project is built and the rules it is built by.

Everything here was verified against the codebase and the live database. Where a
statement is a measurement it says so. Where something is a known gap it is in
[Known limitations](#14-known-limitations), not quietly omitted.

**Companion documents** (this file links rather than duplicates):

| Document | Covers |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | Agent instructions — read the bundled Next docs before writing code |
| `lib/services/SERVICE_LAYER_DESIGN.md` | Full layering rationale and the old duplications it replaced |
| `lib/services/TRANSACTION_LEDGER.md` | Ledger mirroring model |
| `lib/services/FILTER_SYSTEM.md` | Shared filtering primitives |
| `WORKFLOWS.md` | User-facing workflow narrative |
| `RELIABILITY.md` | Audit logs, soft delete, permissions |
| `TESTING.md` | In-memory reference implementation and test strategy |

---

## 1. Project overview and purpose

A multi-tenant CRM and financial platform for contractors — principally roofing
and general construction.

The product follows one job from first contact to final profit:

```
Client → Project → Estimate → (customer signs) → Invoice → Payments
                      ↓                              ↑
                 Change Orders ──────────────────────┘
                      ↓
        Expenses · Subcontractors · Agents · Mileage
```

The defining constraint is **financial trustworthiness**. This codebase is a
rebuild of an earlier app (`contractor-pwa`) whose central failure was
documented in its own `FINANCIAL_CONSOLIDATION_PLAN.md`: the same profit /
revenue / outstanding-balance math was independently reimplemented in **15+
page-level locations**, each with its own soft-delete filtering or lack of it.
Numbers silently disagreed between Dashboard, Reports, Invoice detail and Tax
pages.

Nearly every architectural rule below exists to make that class of bug
structurally impossible rather than merely discouraged.

---

## 2. Tech stack

| Concern | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | `^16.2.6` |
| UI runtime | React | `19.2.4` |
| Language | TypeScript | `^5` |
| Styling | Tailwind CSS | `^4` |
| Icons | `lucide-react` | `^1.26.0` |
| Backend | Supabase (Postgres + Auth + Storage + RLS) | `@supabase/supabase-js ^2.110.8`, `@supabase/ssr ^0.12.3` |
| Tests | Vitest | `^4.1.10` |
| Class utilities | `clsx`, `tailwind-merge`, `class-variance-authority` | — |

```bash
npm run dev     # next dev
npm run build   # next build
npm start       # next start (required to exercise the service worker)
npm test        # vitest run
npm run lint    # eslint
```

### Version-specific facts that will bite you

**This is not the Next.js most references describe.** Per `AGENTS.md`, read
`node_modules/next/dist/docs/` before writing framework code.

1. **Middleware is `proxy.ts`, not `middleware.ts`.** This Next version renamed
   the convention. A file named `middleware.ts` **silently does not run** —
   there is no error, the auth boundary just disappears.
2. **`viewport` is a separate export from `metadata`.** Putting `themeColor` or
   viewport settings inside `metadata` is silently ignored.
3. **Tailwind v4 `dark:` defaults to `@media (prefers-color-scheme: dark)`** —
   the OS setting. See [§10](#10-uiux-principles) for why that matters here.
4. **`sharp` is not a declared dependency.** `scripts/generate-pwa-icons.mjs`
   imports it and it resolves only because Next depends on it
   (`next@16.2.12 → sharp@0.34.5`). If Next ever drops it, that script breaks.
   Add it to `devDependencies` if the icon pipeline becomes load-bearing.

---

## 3. Folder structure and responsibilities

```
app/
  (app)/            Authenticated application. Shares AppLayout
                    (Sidebar + AppHeader + MobileBottomNav).
  (auth)/           login, signup.
  api/              Route handlers (9 total — see §8).
  portal/[id]/      PUBLIC customer portal. Server-rendered, token-authorized.
  invoice/[id]/     PUBLIC invoice view. Server-rendered, token-authorized.
  offline/          PWA offline fallback. No providers, no data fetching.
  manifest.ts       Web app manifest (served at /manifest.webmanifest).
  layout.tsx        Root layout: fonts, theme bootstrap, PWA wiring.
  globals.css       Design tokens for light/dark via [data-theme].

components/
  ui/               Primitives: PageContainer, PageHeader, Modal, Badge,
                    EmptyState, Skeleton.
  layout/           Sidebar, AppHeader, MobileBottomNav, Breadcrumbs,
                    CompanySwitcher, RequirePermission.
  providers/        Theme → Auth → Services → Location (nesting order matters).
  estimates/ invoices/ expenses/ clients/ projects/
  subcontractors/ agents/ changeOrders/ payments/ dashboard/
  portal/           SharePortalPanel — Copy link, SMS, Email.
  pwa/              ServiceWorkerRegistrar, InstallPrompt.
  shared/

lib/
  services/         THE business layer. See §5.
    supabase/       Supabase-backed implementations of the interfaces.
    testing/        In-memory doubles mirroring the same interfaces.
  supabase/         Client factories (browser / server / service-role).
  pdf/              PDF layout primitives shared by both PDF routes.
  hooks/            useEstimateForm, usePermission, useDashboardData, …
  company.ts        Company settings + name resolution (see §5.4).
  navigation.ts     Sidebar/nav definitions.
  utils.ts          cn() and small helpers.

supabase/migrations/  12 SQL migrations, timestamp-ordered.
tests/                27 Vitest files, 323 tests.
scripts/              generate-pwa-icons.mjs
public/               sw.js, icons/
proxy.ts              Auth boundary (NOT middleware.ts).
```

### The import boundary

```
pages / components
      ↓ may call Layer 2 (CRUD, display) and Layer 3 (anything computed)
   services
      ↓ only services may import the data layer for business tables
   Supabase
```

A page or component **never** queries Supabase directly for a business table,
and **never** computes a financial number.

---

## 4. Database

**39 tables + 8 reporting views.** Every business table carries `company_id`,
which is the tenant key and the axis every RLS policy turns on.

### 4.1 Core entity graph

```
companies ─┬─ profiles (id = auth.users.id, role, company_id, location_id)
           ├─ company_settings · company_tax_settings · company_invites
           ├─ clients ──── projects ──── estimates ──── invoices ── invoice_payments
           │                                │                 ├─ invoice_items
           │                                │                 └─ invoice_change_orders
           │                                ├─ estimate_items
           │                                ├─ estimate_areas ─┬─ estimate_area_line_items
           │                                │                  └─ estimate_area_photos
           │                                ├─ estimate_photos · estimate_images
           │                                ├─ estimate_signatures
           │                                ├─ estimate_expenses ── expense_receipts
           │                                ├─ estimate_subcontractors ── subcontractor_payments
           │                                ├─ estimate_agents ── agent_payments
           │                                ├─ change_orders ── change_order_line_items
           │                                └─ project_milestones
           ├─ subcontractors ── subcontractor_tax_info
           ├─ agents ── agent_tax_info
           ├─ mileage_trips · documents · company_documents
           ├─ financial_transactions   (ledger mirror)
           ├─ invoice_sequences        (per-company invoice numbering)
           └─ audit_logs · tax_audit_log
```

### 4.2 Table groups

| Group | Tables |
|---|---|
| Tenancy & identity | `companies`, `profiles`, `company_invites`, `company_settings`, `company_tax_settings` |
| CRM | `clients`, `projects`, `project_milestones` |
| Estimating | `estimates`, `estimate_items`, `estimate_areas`, `estimate_area_line_items`, `estimate_area_photos`, `estimate_photos`, `estimate_images`, `estimate_signatures` |
| Billing | `invoices`, `invoice_items`, `invoice_payments`, `invoice_change_orders`, `invoice_sequences` |
| Change management | `change_orders`, `change_order_line_items` |
| Cost | `estimate_expenses`, `expense_receipts`, `mileage_trips` |
| Labour | `subcontractors`, `estimate_subcontractors`, `subcontractor_payments`, `subcontractor_tax_info` |
| Sales | `agents`, `estimate_agents`, `agent_payments`, `agent_tax_info` |
| Accounting | `financial_transactions` |
| Documents | `documents`, `company_documents` |
| Audit | `audit_logs`, `tax_audit_log` |

### 4.3 Conventions

- **Soft delete everywhere.** `deleted_at` / `deleted_by` / `delete_reason`.
  Deletes require a reason. **Every query must filter `deleted_at is null`** —
  a missed filter is a silent financial error, not a display bug.
- **Audit columns** `created_by` / `updated_by` reference `profiles`.
- **Money is `numeric`**, never float.
- **Two estimate shapes**, discriminated by `estimates.estimate_type`:
  - `standard` → scope lives in `estimate_items`
  - `roofing` → scope lives in `estimate_areas` + `estimate_area_line_items`
  These are **never** mixed; see [§6.4](#64-roofing-vs-standard-estimates).

### 4.4 Reporting views

`vw_estimate_financials`, `vw_estimate_profit`, `vw_expense_breakdown`,
`vw_mileage_ytd`, `vw_monthly_pl`, `vw_open_invoices`, `vw_top_clients`,
`vw_unsold_costs`.

**No application code reads these** (verified by repo-wide grep). They are
analyst conveniences. They previously bypassed RLS entirely — see
[§7.6](#76-resolved-security-findings).

---

## 5. Service architecture

Defined in `lib/services/SERVICE_LAYER_DESIGN.md`. The rule it enforces:

> **Pages display information, collect input, and call services. Pages never calculate.**

### 5.1 Layers

```
Layer 3 — Orchestration   FinancialEngine · ReconciliationService · Tax · Reporting
Layer 2 — Domain entities Project · Estimate · Invoice · Payment · Expense ·
                          Subcontractor · AgentCommission · Client · ChangeOrder …
Layer 1 — Primitives      Transaction · Filtering
Layer 0 — Foundation      Validation · Audit · financialCalculations
```

**Dependency rule, zero exceptions:** a service may import only from its own
layer or below. `FinancialEngine` may call `ProjectService`; `ProjectService`
must never call `FinancialEngine`. Dependencies form a strict DAG, so any given
number has exactly one possible origin.

`TaxService` sits in Layer 3 specifically because an earlier draft put it in
Layer 2 with a carve-out allowing it alone to call `FinancialEngine`. **An
exception to a dependency rule means the rule was drawn in the wrong place** —
so it was reclassified rather than special-cased.

### 5.2 Interface / implementation split

Every service is a **TypeScript interface** with two implementations:

- `lib/services/supabase/*` — production
- `lib/services/testing/*` — in-memory doubles honouring the same contract

Tests run entirely against the in-memory set: fast, deterministic, no network.
See `TESTING.md`.

### 5.3 Workflow services

Multi-entity operations live in named workflow modules, never in components:

| Workflow | Responsibility |
|---|---|
| `estimateCreationWorkflow` | Resolve or create the client's project, then create the estimate |
| `estimateWorkflow` | Canonical status transitions |
| `changeOrderWorkflow` | Approve → book ledger → recalculate estimate |
| `changeOrderInvoiceSync` | Keep the existing invoice in step with approved change orders |
| `autoReconciliation` | Match payments to invoices |

`changeOrderWorkflow.approveChangeOrder` is called by **both** the staff page
and the public portal route — same function, portal supplies a signature. There
is no second approval path.

### 5.4 One name, one source

`companies.name` is authoritative for the company name and beats a stale
`company_settings.company_name`. `lib/company.ts`'s
`getCompanySettingsByCompanyId` resolves this once and is used by the PDF
routes, the customer portal, the public invoice page and `CompanySwitcher`.

---

## 6. Financial engine rules and data flow

`lib/services/financialEngine.ts` is **the** source of every calculated
financial figure. Pages have no other way to obtain one.

```
WRONG   Dashboard fetches estimates + invoices + expenses and reduce()s them.
CORRECT Dashboard calls financialEngine.getProjectFinancials(projectId).
```

### 6.1 Revenue

Calculated **at the project level**, never from `estimates.total`. An estimate
is a proposal; a project is the financial lifecycle.

Three normalized sources, each owned by its Layer 2 service:

| Source | Meaning |
|---|---|
| Invoices | what was **billed** |
| Payments | what was **collected** |
| Approved change orders | contract **growth** |

```
revisedTotal = invoicesTotal + UNBILLED approvedChangeOrderTotal
```

**The word UNBILLED is load-bearing.** Approving a change order bills it onto
the estimate's invoice as a line item (`changeOrderInvoiceSync`), so that money
is already inside `invoicesTotal`. Adding it again from `ChangeOrderService`
would double-count. Each approved change order contributes **exactly once**: as
an invoice line once billed, as standalone revenue until then (or again if the
invoice carrying it is voided).

`originalEstimateTotal` is returned **only** as a quoted-vs-billed comparison.
It must never be summed into revenue or profit.

### 6.2 Costs — ONE PAYMENT = ONE EXPENSE RECORD

Every cost is a row in `estimate_expenses`. `subcontractorCosts` and
`agentCosts` are **`byType` subsets of that same set**, never separate addends:

```ts
const subcontractorCosts = expenseTotals.byType.subcontractor ?? 0;
const agentCommissionCosts = expenseTotals.byType.agent_commission ?? 0;
```

Adding these to the expense total double-counts. This is the single most
important invariant in the financial layer.

### 6.3 Two cost models, deliberately

| Scope | Model | Why |
|---|---|---|
| Project | **Committed** — `max(assigned, paid)` per assignment | An assignment is a real cost the moment it is made |
| Company / period | **Cash basis** — money actually paid inside the range, by transaction date | A period P&L must not count unpaid commitments |

Reimbursements are cash-actual only: there is no "assigned" figure to floor
against.

### 6.4 Roofing vs standard estimates

`getScopeLines(estimateId)` is the **single normalized projection** of an
estimate's scope, whichever shape it takes. It returns `ScopeLine[]` with a
`source` discriminator (`estimate_item` / `area_line_item` / `area_repair_cost`).

Everything downstream — totals, self-heal, PDF, invoice conversion — derives
from `getScopeLines`. Enforcement:

- `updateLineItems` **throws** for a roofing estimate. Its rows would write to
  `estimate_items`, which contributes nothing to a roofing total. A user once
  edited a line from $10 to $9, saw it "save", and the total never moved.
- `estimate_type` **locks** once scope exists.
- The UI picks the editor by **`estimateType`, never by route**.

### 6.5 In-flight coalescing (not caching)

`getCompanyFinancials` shares the promise of an already-running identical
fetch, deleted on settle. Zero staleness risk. Coalescing keys deliberately
**omit `dateRange`**, because those underlying fetches pull full history and
the range is applied in memory afterwards.

`tests/company-financials-date-ranges.test.ts` exists solely to prove no
date-range leakage across concurrent calls. **If you ever make one of those
queries range-dependent, you must add `dateRange` to the coalescing key** — the
concurrent test will fail if you don't.

---

## 7. Authentication, authorization, RLS, and portal security

Four independent layers. No single one is "the" security.

### 7.1 `proxy.ts` — route boundary

Redirects unauthenticated users to `/login`. Explicitly **not** the data
boundary; it is coarse routing.

Exempt paths:

| Path | Why |
|---|---|
| `/login`, `/signup` | auth |
| `/api/*` | an API caller must never receive login HTML — each route authorizes itself |
| `/portal/*`, `/invoice/*` | the two public share pages — token-authorized |
| `sw.js`, `manifest.webmanifest`, `offline`, `icons/` | PWA; a 302'd service worker fails registration on MIME type |
| `_next/static`, images | performance |

### 7.2 `AppLayout` — UX only

The client-side redirect is convenience. `usePermission` **default-denies** when
`profile` is null.

### 7.3 Permissions — 7 roles

`admin`, `office`, `sales`, `project_manager`, `accountant`, `subcontractor`,
`agent`, over resources (`estimate`, `invoice`, `payment`, `expense`,
`company_settings`, `financial_reports`, `audit_log`, …) with actions
`view` / `create` / `update` / `delete` / `approve`.

Surfaced by `usePermission` and `RequirePermission`. **UI-level only** — it
hides controls; it does not protect data.

### 7.4 RLS — the real boundary

Every business table scopes by `company_id` via `current_company_id()`.

**Measured:**

| Caller | Result |
|---|---|
| anon, direct table read | `[]` on all 39 tables |
| authenticated (company `964dfb81…`) | 31 of 95 estimates |
| same user, other companies | **0 rows** |

The anon key is publishable and ships in the client bundle. **RLS is what makes
that safe.** Never treat the anon key as a secret, and never rely on the client
to filter by company.

### 7.5 Customer portal — the only public data path

Public entry points, and nothing else:

- `/portal/[id]?token=…` — shared estimate
- `/invoice/[id]?token=…` — shared invoice
- `/api/estimates/[id]/pdf?customerToken=…`, `/api/invoices/[id]/pdf?customerToken=…`
- `/api/portal/sign`, `/api/portal/change-orders/[id]/approve`

**The token is the credential; the URL id is not.** `app/portal/[id]/page.tsx`
does `await params` and discards it — authorization is entirely
`get_customer_portal(p_token)`. Pages use the **anon** key and read through
token-scoped `SECURITY DEFINER` RPCs that do the scoping themselves.

**Measured:** correct token → data; wrong token → `null`; anon direct table read
→ `[]`.

Service-role usage is confined to three routes and never trusts the URL:

| Route | Authorization |
|---|---|
| `/api/portal/sign` | validates `customer_token` |
| `/api/portal/change-orders/[id]/approve` | resolves change order → parent estimate → compares `customer_token` |
| `/api/auth/signup` | public by design; only **creates**, reads nothing |

Failures are **non-enumerable**: wrong token, missing record and deleted record
all return the same generic message.

### 7.6 Resolved security findings

Both found by audit, fixed, and **verified fixed**:

1. **Reporting views bypassed RLS.** A Postgres view runs with its owner's
   privileges unless `security_invoker` is set, and PostgREST exposes every
   `public` view. Anon read **95 of 95 estimates across all 5 companies** —
   revenue, profit, client names, open invoices. Fixed by
   `20260805000000_secure_reporting_views.sql` (`security_invoker = on` +
   revoke from `anon`). **Now verified: anon → HTTP 401.**

2. **Company-document download honoured a caller-supplied `Content-Type`.**
   `?contentType=text/html` served uploaded bytes as HTML on the app's own
   origin — stored XSS against a logged-in session. Type is now derived
   server-side from an extension allowlist; unknown types download with
   `Content-Disposition: attachment`; `X-Content-Type-Options: nosniff` is set.
   **SVG is deliberately non-inline** (it can carry `<script>`).

Storage follows the same tenancy model: `company-documents` is **private**, and
its policies scope by the company id embedded in the object path
(`documents/<company_id>/<category>/<file>`), compared against
`current_company_id()` — migration `20260805000100`.

---

## 8. API routes

All 9, and how each authorizes:

| Route | Auth |
|---|---|
| `POST /api/auth/signup` | Public by design; creates only. Service role. |
| `POST /api/portal/sign` | Customer token |
| `POST /api/portal/change-orders/[id]/approve` | Customer token via parent estimate |
| `GET /api/estimates/[id]/pdf` | Session **or** `customerToken`; anon key ⇒ RLS applies |
| `GET /api/invoices/[id]/pdf` | Same |
| `POST /api/company-documents/upload` | Session + company; uploads **as the user** so storage RLS applies |
| `GET /api/company-documents/download` | Session; storage RLS; server-derived content type |
| `POST /api/estimate-photos/upload` | Session |
| `GET /api/estimate-photos/download` | Session |

Uploads deliberately **do not** use the service-role key. Doing so would "work"
and would silently remove storage-level tenant isolation.

---

## 9. Core business workflows

### Clients → Projects
A client is the customer record. A project is the financial lifecycle container.

### Projects → Estimates
`estimateCreationWorkflow.createEstimateForClient` resolves the client's first
active project, creating `"{client.name} Project"` via the existing
`ProjectService` if none exists. **No duplicate projects, no bypass of project
validation.** Title is required. On save it redirects to `/estimates/{id}`.

### Estimates → signature
Customer signs on the portal. `/api/portal/sign` validates the token
server-side; the client never holds a privileged key.

### Estimates → Invoices
`InvoiceService.createFromEstimate` builds line items from `getScopeLines`, so
roofing and standard estimates convert through **one** path.

### Change orders
Approve → `changeOrderWorkflow` books the ledger and recalculates the estimate →
`changeOrderInvoiceSync` updates the **existing** invoice. It never creates a
second invoice, never touches payments, and never rewrites a LOCKED invoice.
Billed change orders are tracked by a `change-order:<uuid>` marker in the line's
existing description column — no new table or column.

### Invoices → Payments
`invoice_payments` rows; status derives from `derivePaymentStatus`. Deleted
payments must be filtered — a missed filter overstates collections.

### Expenses
One payment = one `estimate_expenses` row ([§6.2](#62-costs--one-payment--one-expense-record)).
Subcontractor and agent costs are `byType` views over the same rows.

---

## 10. UI/UX principles

**Mobile-first.** The app is used on phones, on roofs.

- Horizontal gutter is **16px on mobile**, from `AppLayout`'s `<main>` alone.
  `PageContainer` contributes **zero** mobile padding — the two used to stack
  and cost 32px per side.
- **No horizontal scrolling.** Multi-column tables render as full-width card
  lists below `sm:` and as tables from `sm:` up. Same state, same handlers.
- Desktop and tablet layouts are **unchanged** by mobile work: every mobile rule
  is an override that restores the original value at `sm:`.
- Safe-area insets (`env(safe-area-inset-bottom)`) for sticky bars — these only
  resolve non-zero because the root layout sets `viewportFit: "cover"`.
- Edit screens hide `MobileBottomNav`; the rule lives in
  `lib/layout/mobileBottomNav.ts` because three components must agree on it.

### The `dark:` trap — read before styling

The app switches themes with **`data-theme` on `<html>`**. Tailwind v4's `dark:`
variant defaults to **`@media (prefers-color-scheme: dark)`** — the OS setting —
and `globals.css` declares **no `@custom-variant dark`**.

**Every `dark:` class in this codebase therefore keys off the OS, disconnected
from the theme the app is actually rendering.** With the app light and the OS
dark this produced measured near-white text (`lab 97.8`) on `#ffffff`.

**Use design tokens** — `bg-card`, `text-foreground`, `border-input`,
`bg-muted`, `text-muted-foreground`, `text-primary`. They resolve through the
CSS variables `data-theme` actually swaps and are correct in both themes with no
variant.

A one-line global fix exists but is **not applied**, because it would change
appearance across every page that currently relies on the accident:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

---

## 11. PWA architecture

| Piece | File |
|---|---|
| Manifest | `app/manifest.ts` → `/manifest.webmanifest` |
| Icons | `public/icons/` from `scripts/generate-pwa-icons.mjs` |
| Service worker | `public/sw.js` |
| Registration | `components/pwa/ServiceWorkerRegistrar.tsx` |
| Install prompt | `components/pwa/InstallPrompt.tsx` |
| Offline fallback | `app/offline/page.tsx` |

**Caching strategy**

- `/_next/static/*`, `/icons/*` → cache-first (content-hashed, immutable)
- Navigations → **network-first**, cached shell as fallback, then `/offline`
- Everything else → straight to network

**Never cached** — the load-bearing part:

1. Cross-origin (all Supabase data and auth)
2. Non-GET
3. `/api/*`
4. `/portal/*`, `/invoice/*` — the only server-rendered pages carrying customer
   data and a token in the URL; caching them would write a live credential to
   disk
5. Anything `Cache-Control: no-store`

**Measured: 0 of 26 cache entries matched portal, token, API or cross-origin.**

Cached HTML is safe because every authenticated page is a client component that
renders an empty shell and fetches from Supabase — the HTML is identical for
every user. **If a page is ever converted to server-render user data, add it to
`BYPASS_PREFIXES`.**

Registration is **production-only**: in dev, Next serves changing chunks from
`/_next/static`, which the worker treats as immutable — breaking HMR in ways
that look like app bugs. Bump `VERSION` in `sw.js` when changing strategy.

Install requires HTTPS (localhost exempted). Offline means **shell-only** —
cached pages open, but their data comes from Supabase, so they render empty.

---

## 12. Coding standards

1. **Comments explain WHY, not what.** Prefer the non-obvious constraint, the
   measured number, the bug that motivated the line.
2. **Match surrounding code** — naming, comment density, idiom.
3. **Types at boundaries.** Services are interfaces first.
4. **`file_path:line` references** in docs and reviews.
5. **Never fabricate data.** No placeholder companies, no invented totals — see
   `CompanySwitcher`, which shows the real single company rather than faking a
   multi-company picker.
6. **Fail loudly on programmer error.** The roofing save path throws when its
   ref is unattached rather than optional-chaining into a silent no-op — an
   earlier optional chain caused **silent data loss** that only a database check
   caught.
7. **Verify against the running app**, not by reading. Measure before and after.
8. **Tests before claiming done**: `npx tsc --noEmit`, `npx vitest run`,
   `npx next build`.

---

## 13. Non-negotiable rules

1. **No duplicate logic.** One calculation, one place. This codebase exists
   because the previous one broke this rule 15+ times.
2. **No unnecessary tables, columns or fields.** Model new needs with existing
   structures first — the change-order/invoice link uses a marker in an existing
   text column, not a join table.
3. **Reuse existing services.** Never re-query a table a service already owns.
4. **Preserve business logic unless change is explicitly requested.** UI work is
   UI work: no calculation, validation, state, API or business-rule changes.
5. **Pages never calculate.** All computed money comes from `FinancialEngine`.
6. **Respect the layer DAG.** No upward imports, no exceptions. An exception
   means the boundary is wrong.
7. **Always filter `deleted_at`.**
8. **`company_id` on every business query.** RLS enforces it; code should not
   depend on that alone.
9. **Never weaken portal token validation.** The token is the credential.
10. **Never use the service-role key** where a user-scoped client works.
11. **Trace dependencies completely** before changing shared data — every
    consumer, every derived total.
12. **Migrations are additive and reversible**, with verification queries and a
    rollback block.

---

## 14. Current state

### 14.1 Completed

**Core** — multi-tenant companies/profiles; 7-role permissions; soft delete with
required reasons; audit logs; client & project CRM.

**Estimating** — unified create/edit form; standard **and** roofing estimates;
per-area line items, measurements and photos; `getScopeLines` normalization;
type locking; PDF generation; e-signature.

**Billing** — estimate → invoice conversion for both estimate types; invoice
lifecycle; payments with derived status; change orders with invoice sync;
deposits.

**Cost** — one-payment-one-expense model; subcontractor and agent assignment and
payment; reimbursements; mileage; receipts.

**Financial** — `FinancialEngine` as sole source of computed figures; committed
vs cash-basis models; ledger mirroring; reconciliation; dashboard, reports, tax
centre.

**Customer portal** — token-authorized estimate and invoice views; signing;
change-order approval; share via Copy link / SMS / Email.

**Platform** — PWA (installable, offline shell); mobile-first layouts; company
documents with preview for images, PDF and text.

**Quality** — 323 tests across 27 files, all passing; in-memory reference
implementations; typecheck and build clean.

### 14.2 Known limitations

**Security / correctness**

- **Portal tokens never expire and cannot be revoked.** A share link is a bearer
  credential valid forever; anyone it is forwarded to has permanent access.
  Fixing this needs a new column, so it was deliberately deferred.
- **`/api/auth/signup` has no rate limiting.** Unmetered account creation.
- Storage policies for buckets **other than** `company-documents` exist only in
  the Supabase dashboard, not in any migration — a rebuild from migrations would
  silently lose them.

**Architecture**

- The `dark:` / `data-theme` mismatch ([§10](#10-uiux-principles)) is unfixed
  globally. `EstimateForm` and `RoofingAreasEditorV2` are clean; `EstimateDetail`
  and others still carry OS-keyed `dark:` classes.
- `estimate_agents` (×15) and `agent_payments` (×12) N+1 queries are the largest
  remaining performance issue.
- `RoofingAreasEditor` (V1) is unimported dead code; `estimate_areas.area_total`
  is a dead column.
- **Two parallel service contexts exist, and one is a landmine.** The live one
  is `components/providers/ServicesProvider.tsx`. The other,
  `lib/services-context.tsx`, has a `ServicesProvider` that is **never mounted**,
  and its `useServices()` *throws* when called outside it. Four legacy modules
  still import it — `components/estimates/SignaturePanel.tsx`,
  `components/estimates/ChangeOrdersPanel.tsx`,
  `components/shared/PayablesTable.tsx` (plus its `SubcontractorPayablesTable` /
  `AgentPayablesTable` wrappers) and `lib/hooks/useEstimateForm.ts`. **None is
  rendered by any route today**, so nothing crashes — but mounting any of them
  throws immediately, which is exactly what happened when `useExpenses` was once
  pointed at the legacy context (see its comment). Repoint them at the live
  provider or delete them; leaving them is a trap for the next person who wires
  one up.
- `profiles.full_name` is nullable and null in practice, so user-name displays
  fall back to email.
- `sharp` is used by the icon script but undeclared ([§2](#2-tech-stack)).

**Product**

- Multi-company membership does not exist — one profile, one company.
  `CompanySwitcher` is the honest UI slot for it.
- `.doc`/`.docx` have no inline preview.
- Offline is shell-only; no offline data or write queue.
- Email/SMS are `mailto:`/`sms:` handoffs to the user's own client — no
  server-side delivery.
- Document names are altered on save (hyphens become spaces).

### 14.3 Roadmap

**Near term**
1. Decide the global `@custom-variant dark` fix and clean remaining `dark:` usage.
2. Batch the `estimate_agents` / `agent_payments` N+1s.
3. Export dashboard-created storage policies into migrations.
4. Rate-limit signup.
5. Resolve the duplicate service context — repoint or delete the four legacy
   consumers, then remove `lib/services-context.tsx`.
6. Remove dead code (`RoofingAreasEditor` V1, `estimate_areas.area_total`).

**Medium**
7. Portal token expiry and revocation (needs a schema change — requires sign-off).
8. Server-side email/SMS delivery behind the existing `buildMailtoHref` /
   `buildSmsHref` seam.
9. Offline data persistence and a write queue.
10. Auto-sync estimate edits to an existing draft invoice.

**Longer**
11. Multi-company membership.
12. Push notifications (the PWA foundation is in place).
13. Document preview for Office formats.

---

## 15. Reviewer checklist

- [ ] Did I add a calculation to a page? → move it into `FinancialEngine`.
- [ ] Did I add a table or column? → can existing structures model it?
- [ ] Did I query Supabase from a component? → use a service.
- [ ] Did I filter `deleted_at`?
- [ ] Did I scope by `company_id`?
- [ ] Did I use `dark:`? → use tokens instead.
- [ ] Does it work at 375px with no horizontal scroll?
- [ ] Are desktop/tablet unchanged?
- [ ] Did I weaken a token check or reach for the service-role key?
- [ ] Does a server-rendered page now carry user data? → add it to the SW bypass list.
- [ ] `tsc --noEmit`, `vitest run`, `next build` all clean?
- [ ] Did I verify against the running app, not just by reading?
