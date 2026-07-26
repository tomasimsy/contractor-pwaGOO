# Database Integrity Audit — contractor-pwa

Scope: every file in `supabase/migrations/` (32 files), read in full. No code was changed — this is a pure findings report, per the request to output Problems / Risk level / Suggested fixes.

---

## 1. CRITICAL — `get_public_estimate_bundle()` currently exposes soft-deleted records

**Problem:** `20260712235900_public_signing_rpcs.sql` originally defined `get_public_estimate_bundle()` with `deleted_at is null` filters on `items`, `change_orders`, and `payments`. `20260720000000_company_branding_settings.sql` did a `create or replace function` on this same function (to add a `company` field to the returned JSON) and **dropped all three `deleted_at is null` filters** in the process — confirmed by direct diff of the two function bodies. `20260724000000_reapply_public_invoice_change_orders.sql` explicitly documents this regression and re-fixes `get_public_invoice_bundle()` — but its `create or replace function` list contains **only** `get_public_invoice_bundle`, not `get_public_estimate_bundle`. No migration after `20260720` touches the estimate version. This function is `security definer` and callable anonymously (no `auth.uid()` check by design, per its own doc comment) — it's the backing RPC for `app/public/estimates/[id]`.

**Risk level: High.** Any anonymous visitor with a valid (or guessed) estimate link can currently see soft-deleted line items, change orders, and payments for that estimate — data the app believes is deleted. This is the same class of bug that was already found and fixed once for invoices; the estimate side was missed.

**Suggested fix:** Add a migration that `create or replace function public.get_public_estimate_bundle(...)`, copying the current (post-branding) body and re-adding `and deleted_at is null` to the `items`, `change_orders`, and `payments` subqueries — mirroring exactly what `20260724000000` did for the invoice bundle.

---

## 2. MEDIUM — Ledger schema drift: SQL migration vs. TypeScript model

**Problem:** `20260728000300_financial_transactions_ledger.sql` (this project's own earlier migration) defines `financial_transactions` with `direction`/`category`/`source_table`/`source_id` columns and upsert-on-conflict mirror triggers. The TypeScript ledger design that followed in `contractor-app-v2` (`TransactionType`, `ReferenceType`, `reference_id`, `reference_type`, `transaction_date`) uses a different, incompatible schema. The SQL file was never revised to match.

**Risk level: Medium** (not yet live — no application code writes to this table against a real database yet — but it will block wiring the real Supabase-backed `TransactionService` without a rewrite).

**Suggested fix:** Before implementing a real (non-in-memory) `TransactionService`, replace `20260728000300` (if not yet applied to any environment) or write a follow-up migration that renames/restructures the columns to `type`/`reference_id`/`reference_type`/`transaction_date`, and regenerates the mirror triggers against the new column names.

---

## 3. MEDIUM — Duplicate payment-status derivation (DB trigger vs. TypeScript)

**Problem:** `20260725000000_customer_payments_enhancements.sql` adds `update_invoice_payment_totals()`, a trigger that independently recomputes `amount_paid`/`remaining_balance`/`payment_status`/`status`/`paid_at` on `invoices` in raw SQL (`case when total_paid = 0 then 'unpaid' when total_paid >= invoice_total then 'paid' else 'partial' end`). `contractor-app-v2`'s `financialCalculations.ts` centralizes the equivalent logic in `derivePaymentStatus()`, explicitly to have one source of truth. These are two independent implementations of the same business rule, one in Postgres and one in TypeScript, with no mechanism keeping them in sync if either is edited.

**Risk level: Medium.** No divergence detected today (both use the same thresholds), but this is exactly the "duplicate calculation" pattern the rest of this project has been eliminating at the app layer — it just also exists at the DB layer.

**Suggested fix:** Decide which layer owns this once a real DB is wired up: either (a) drop the trigger and let `InvoiceService.refreshStatus()`/`derivePaymentStatus()` be the only writer of these denormalized columns, or (b) keep the trigger as the sole writer and have the TypeScript layer treat `invoices.status`/`amount_paid` as read-only derived state it never recomputes. Having both active is the risk, not either alone.

---

## 4. MEDIUM — Dead column: `estimates.old_status`

**Problem:** `20260719_add_estimate_status_lifecycle.sql` renamed `estimates.status` → `old_status` when introducing the new `estimate_status` enum column, and backfilled the new column from it. `old_status` was never dropped in any subsequent migration — it's a permanently dead, unindexed text column that still exists in the live schema.

**Risk level: Low.** No functional impact, but it's schema clutter that could confuse future readers or tooling (e.g., an ORM introspecting the table) into thinking there are two competing status fields.

**Suggested fix:** Add a migration `alter table public.estimates drop column if exists old_status;` once it's confirmed no code path or reporting query still reads it (a quick grep across both codebases for `old_status` should suffice).

---

## 5. MEDIUM — `EstimateStatus` (TypeScript) diverges from `estimate_status` (DB enum)

**Problem:** The DB enum from `20260719_add_estimate_status_lifecycle.sql` has values `draft, sent, viewed, approved, converted_to_invoice, project_in_progress, completed, archived, cancelled`. The `EstimateStatus` type in `contractor-app-v2/lib/services/types.ts` has `draft, sent, viewed, approved, rejected, converted_to_invoice` — it's missing `project_in_progress`/`completed`/`archived`/`cancelled` (all valid in the DB) and adds `rejected` (not a valid DB enum value at all).

**Risk level: Medium.** If the app ever writes `status: "rejected"` against a real Postgres-backed estimates table, the enum constraint will reject the write outright. Conversely, any existing production row with `project_in_progress`/`completed`/`archived`/`cancelled` would fail to type-check or be silently mishandled by TypeScript code that only knows 6 of the 9 states.

**Suggested fix:** Reconcile the two: either expand `EstimateStatus` to the full 9-value DB set (dropping `rejected` or mapping it to `cancelled`), or migrate the DB enum to match the app's intended lifecycle — but the two must use one shared vocabulary before this connects to a real database.

---

## 6. LOW — Estimate/invoice number generation is not concurrency-safe (carried over from app-level stress testing, confirmed relevant at DB level too)

**Problem:** No migration defines a DB sequence or unique constraint with retry semantics for estimate/invoice numbers; this was already flagged in `STRESS_TEST_REPORT.md` at the application layer (count-based generation), and no DB-level safeguard (e.g., a `unique` constraint on `estimate_number`, or a `serial`/sequence-backed generator) exists to catch it if the app-level logic ever races.

**Risk level: Low-Medium** depending on real-world concurrent-write volume.

**Suggested fix:** Add a `unique` constraint on `(company_id, estimate_number)` / `(company_id, invoice_number)` at minimum, so a race produces a hard constraint-violation error (visible, retryable) rather than a silent duplicate; consider a DB sequence or `nextval`-based generator for the actual number assignment.

---

## 7. LOW — RLS: `company_members`-referencing policies reference a table that doesn't exist

**Problem:** `20260720_add_tax_configuration.sql` writes RLS policies for 5 tax tables using `select company_id from public.company_members where user_id = auth.uid()` — but `company_members` does not exist anywhere in this migration history (the actual membership table is `profiles.company_id` + `current_company_id()`). Empirically confirmed via anon-key testing in an earlier phase: neither the 5 tax tables nor `company_members` exist in the live production database, so this bug has no current live security impact — but the tax module is unusable against production as written, and if someone did later create a `company_members` table for an unrelated reason, these policies would silently start evaluating against the wrong source table.

**Risk level: Low** (currently inert, but latent).

**Suggested fix:** Rewrite these 5 policies to use `company_id = public.current_company_id()`, consistent with every other table's RLS policy in this schema, before the tax module migration is actually applied to any real database.

---

## 8. Previously-resolved issues, reconfirmed still fixed (no action needed)

- **Anon-key cross-company data leak** (stacked/duplicate permissive policies) — root-caused and fixed in `20260713000300_cleanup_legacy_permissive_policies.sql`.
- **`companies` table had RLS enabled with zero policies** (fully open to any authenticated user) — fixed in the same migration.
- **`profiles` had RLS enabled with zero SELECT policy** (nobody could read their own row) — fixed in `20260717000000_profiles_role_and_rls.sql`.
- **Dead `invoices.balance_due` column and dead `estimate_payments` table** — dropped in `20260713000200_drop_duplicate_payment_tracking.sql`.
- **`get_public_invoice_bundle()` deleted-record exposure** — regressed by `20260720000000`, correctly re-fixed by `20260724000000` (see Finding 1 — its sibling function was not).

---

## Summary table

| # | Finding | Category | Risk |
|---|---|---|---|
| 1 | `get_public_estimate_bundle()` missing `deleted_at` filters (regression never reapplied) | RLS / orphaned-record exposure | **High** |
| 2 | Ledger table schema (SQL) drifted from TransactionService (TypeScript) model | Duplicate data / migrations | Medium |
| 3 | `update_invoice_payment_totals()` trigger duplicates `derivePaymentStatus` logic | Duplicate data / transaction safety | Medium |
| 4 | `estimates.old_status` dead column never dropped | Nullable columns / migrations | Low-Medium |
| 5 | `EstimateStatus` (TS) vs `estimate_status` (DB enum) value mismatch | Company/data consistency | Medium |
| 6 | No DB-level uniqueness guard on estimate/invoice numbers | Duplicate data / concurrency | Low-Medium |
| 7 | Tax RLS policies reference nonexistent `company_members` table | RLS | Low (currently inert) |
