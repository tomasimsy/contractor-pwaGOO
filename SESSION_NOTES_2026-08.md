# Session Notes — August 2026

Working notes from a long session covering a product audit, security/data-integrity
fixes, push notifications, and team/role management (including the new Field Lead
role). Written so we can pick this back up later without re-deriving context.

---

## 1. Deployment setup — the thing that caused the most confusion

- **Two branches, two different apps.** `main` = the old `contractor-pwa` codebase.
  `PWA-v2` = `contractor-app-v2`, the rewrite — this is the one we've been working
  in all session, and the one that's *supposed* to be live.
- **Vercel's Production environment was pointed at `main`** the whole time — meaning
  none of this session's work (or anything else on `PWA-v2`) was actually reaching
  `app.onesquareroof.com` until we repointed it.
- **Fix applied:** Vercel → Settings → Git → Production Branch, changed from `main`
  to `PWA-v2`. This is now correct — confirmed live (API routes built this session
  started responding once this was fixed).
- **Takeaway:** always push to `PWA-v2`, not `main`. `main` is stale/unrelated
  history at this point (confirmed via `git merge-base` — no common ancestor at
  all, different `package.json` names, different file structure).

---

## 2. P0 fixes (from the product audit)

1. **Server-side permission enforcement** — `hasPermission`/`validatePermission`
   existed but were never called anywhere. Wired into `companyService` and
   `companyProfileService` writes via a new
   `lib/services/supabase/enforcePermission.ts`. **Not a full fix** — most of the
   app writes straight from the browser to Supabase (RLS is the only real gate for
   those), so true enforcement for role-restricted actions needs RLS policies keyed
   on role, which is a bigger, separate piece (see Field Lead section — this is
   the same class of work we did there, just not yet applied everywhere).
2. **Duplicate company/profile prevention** — case-insensitive uniqueness checks
   added to company signup (`app/api/auth/signup/route.ts`) and Business Profile
   create/update (`companyProfileService.ts`). Root cause of 3 duplicate
   "One Square Roofing LLC" companies that already existed in prod.
3. **Reporting-views security fix** — confirmed live in production (all 8
   `vw_*` views correctly return `permission denied` to the anon key). This was a
   real historical data leak, already fixed in an earlier migration
   (`20260805000000_secure_reporting_views.sql`) — we just verified it actually
   took effect.
4. **PDF company logo bug** — `company.logo_url` was a real, populated Settings
   field that the PDF template never rendered. Fixed in `lib/pdf/pdfLayout.ts`'s
   `renderCompanyHeaderBlock` (now takes an `origin` param to resolve the relative
   `/api/company-documents/download?...` URL into something Puppeteer can load).
5. **Schema snapshot** — `supabase/schema-snapshot.sql`, a schema-only `pg_dump`
   (no data, no secrets) committed to the repo, since core tables
   (`companies`/`clients`/`projects`/`estimates`/`invoices`/`profiles`/
   `estimate_expenses`) had no `create table` migration tracked anywhere. This is
   the reference file we used repeatedly to check real constraint/policy names
   before writing any new migration — **keep it reasonably fresh** if the schema
   changes a lot going forward (it'll drift from live reality otherwise).

---

## 3. Push notifications — "customer signed" alert

**What it does:** the moment a customer signs an estimate via the portal, every
staff device that's enabled notifications gets a push: *"Estimate signed —
[title] (#[number])"*, tapping it opens that estimate.

**How it works:**
- `push_subscriptions` table (migration `20260901000000_push_subscriptions.sql`)
  — one row per staff device, company-scoped RLS.
- `lib/push/sendPush.ts` — sends via Web Push (VAPID), using the `web-push` npm
  package. **Server-only, deliberately.** `web-push` needs Node's `net`/`http`
  internals, which breaks the client bundle if imported from anything reachable
  by browser code — this bit us once (a full `npm run build` is what actually
  catches this class of bug; `next dev` alone won't).
- The actual send call lives in `app/api/portal/sign/route.ts` (a true
  server-only route), **not** in `lib/services/estimateWorkflow.ts` — that file is
  shared with the browser (staff can sign manually from `EstimateDetail`), so it
  can never import anything Node-only.
- `app/api/push/subscribe/route.ts` — saves/removes one device's subscription.
- UI: Settings → Notifications page, and the bell icon in the header (both use
  `lib/hooks/usePushNotifications.ts`).

**Required config (already set in `.env.local`, needs to also be in Vercel →
Production env vars):**
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — safe to be public, the browser needs it
- `VAPID_PRIVATE_KEY` — must stay secret
- `VAPID_SUBJECT` — `mailto:office@onesquareroof.com`

**Gotcha we hit:** `NEXT_PUBLIC_*` vars are baked in at **build time**, not read at
runtime. Adding the var in Vercel does nothing until a fresh deployment actually
runs afterward.

---

## 4. Popover/dropdown transparency bug

`bg-popover` / `text-popover-foreground` were used throughout (`UserMenu.tsx`, the
new notification dropdown) but `--popover` was **never actually defined** in
`app/globals.css` — every dropdown rendered with a transparent background. Fixed
by adding `--popover`/`--popover-foreground` tokens (same solid color as `--card`)
in both light and dark theme blocks.

---

## 5. Team / role management + the new "Field Lead" role

### What Field Lead is
Someone who runs one job on-site but isn't a full staff member with company-wide
access. Has a real login, but can only see **their one assigned job's estimate**
and can **record expenses against it** — nothing else (no Dashboard, no other
projects, no financials, no settings).

### How to invite/manage people now (Team page)
- **Team** page (sidebar) → **Invite** button → email, role, password (admin sets
  the password directly — no email is sent, per an explicit choice this session).
- Each row has a role dropdown and a **Disable/Enable** toggle (admin-only, hidden
  for your own row). Disabling doesn't delete the account — it sets
  `profiles.disabled_at`, which blocks all data access via RLS immediately, but
  keeps their history/audit trail intact.

### How to actually restrict Field Lead to ONE job
1. **Projects** → open the project → **Edit** → new **"Assigned to"** dropdown →
   pick the person → Save. (This field existed in the database the whole time —
   it was just never exposed in the UI before this session.)
2. Row-level enforcement is in migration
   `20260903000000_field_lead_assigned_scoping.sql` — a `field_lead` role can only
   `SELECT` a project/estimate whose `assigned_user_id` is them, enforced at the
   RLS layer (not just hidden in the UI).

### Known gap — not yet done
The estimate detail page also reads line items/photos/roofing areas from other
tables (`estimate_items`, `estimate_photos`, `estimate_areas`, etc.) that are
**still company-wide scoped**, not assignment-scoped. In practice a field_lead
can't discover another job's ID through the UI (nothing links to it), but if
someone guessed/enumerated an ID they could still read that detail data. Worth
locking down fully if it ever matters — same pattern as the projects/estimates
policies, just more tables.

### Roles today (permission matrix — `lib/services/permissions.ts`)
| Role | Sees |
|---|---|
| Admin | Everything |
| Office | All day-to-day ops, not tax/settings/roles |
| Sales | Estimates/projects (full), invoices/payments (view only) |
| Project Manager | Active jobs (full), invoices/payments (view only) |
| Accountant | All money movement, not estimates or user roles |
| Subcontractor / Agent | Only their own assignments/payments |
| **Field Lead** | Only their one assigned estimate + can record expenses on it |

Dashboard is now **admin-only**. CRM/Leads/Clients/Documents/Calendar (previously
visible to *everyone* regardless of role — a pre-existing gap we found and closed)
now require the new `workspace` permission, granted to every internal role
(admin/office/sales/project_manager/accountant) but not to
subcontractor/agent/field_lead.

### Bugs found and fixed along the way
- `AuthProvider.tsx` had its own **hardcoded, out-of-sync copy** of the role list
  — would have silently broken `field_lead` (and any future role) logins. Now
  imports the one real list from `permissions.ts`.
- Login always redirected to `/dashboard` — now checks the role first and lands
  on the first page they actually have access to.
- The mobile bottom tab bar (`MobileBottomNav.tsx`) was hardcoded and ignored role
  entirely — a restricted role would've seen tabs that always errored. Now
  filters the same way the sidebar does.

---

## 6. Not built yet — deliberately deferred

- **Calendar/scheduling.** Sized as a medium feature — no new tables needed
  (`Project.startDate`/`endDate`/`assignedUserId` already exist), mainly UI work
  (a calendar library + wiring). This was the natural next step after Field Lead,
  since the assignee picker only makes sense once there's someone real to assign.
- **Full detail-table scoping** for field_lead (see gap noted in section 5).
- **Duplicate company cleanup** — the 3 existing duplicate "One Square Roofing
  LLC" companies from before the P0 fix still exist; the fix only stops *new*
  ones. Manual SQL cleanup, not urgent.

---

## 7. Migrations run this session, in order

1. `20260901000000_push_subscriptions.sql`
2. `20260902000000_field_lead_role_and_disable.sql`
3. `20260903000000_field_lead_assigned_scoping.sql`

All three are applied to the live database already.
