# Project-Centered Architecture: Design + Migration Plan

Companion to the earlier architecture report. Covers the target schema, the required-tables review, the gap checklist (FKs/company_id/relationships/indexes/constraints/security/RLS), and the phased migration. Implementing SQL lives in `supabase/migrations/20260728*.sql`. No UI work included — this is schema + data only.

---

## 1. Target Structure

```
Company
 ├─ profiles (Users)                 — company_id, role (owner|member)
 ├─ clients (Customers)              — company_id
 └─ projects (NEW — the job)         — company_id, client_id, assigned_user_id
      ├─ estimates                   — project_id (+ legacy estimate_id children below)
      ├─ change_orders               — project_id
      ├─ invoices                    — project_id
      │    └─ invoice_payments       — via invoice_id → invoices.project_id
      ├─ estimate_expenses           — project_id  ("project expenses": material/labor/other)
      ├─ estimate_subcontractors     — project_id  (assignment) → subcontractor_payments
      ├─ estimate_agents             — project_id  (assignment) → agent_payments (commission|reimbursement)
      ├─ mileage_trips               — project_id
      ├─ project_milestones          — project_id
      ├─ financial_transactions (NEW)— project_id  (derived ledger, all money in/out)
      └─ tax data (company_tax_settings / subcontractor_tax_info / agent_tax_info) — company_id, joined via subcontractor/agent
```

`estimates` is demoted back to what its name says: a proposal/contract-offer document. Every table that currently treats `estimate_id` as "the job" gains `project_id` and, over time, stops needing `estimate_id` at all — a project can have several estimates (revised scope) and several invoices (deposit + progress + final), none of which was possible while the estimate itself was the parent.

---

## 2. Required-Table Review

| Table asked about | Verdict | Reasoning |
|---|---|---|
| `projects` | **Create — new** | The missing job/lifecycle entity. Everything in this plan hangs off it. |
| `change_orders` | **Keep existing** | Already correctly modeled (own table, own line items). Just add `project_id`. |
| `financial_transactions` | **Create — new** | No ledger exists today; every page recomputes totals by re-querying 4-5 raw tables. This is a genuinely new capability, not a duplicate of anything. |
| `expense_items` | **Do not create — already exists as `estimate_expenses`** | Creating a second table would recreate the exact duplication problem this migration exists to fix. Add `project_id` to the existing table; consider renaming to `project_expenses` only in the Phase 7 cleanup, once nothing references the old name. |
| `subcontractor_assignments` | **Do not create — already exists as `estimate_subcontractors`** | Same reasoning. It already is the assignment table (subcontractor + contracted amount per job); it's just misnamed and mis-keyed (`estimate_id` instead of `project_id`). Repoint, don't duplicate. |
| `subcontractor_payments` | **Keep existing** | Correctly modeled against the assignment row already (`estimate_subcontractor_id`). No change needed beyond what flows through via the assignment's new `project_id`. |
| `agent_transactions` | **Do not create — already exists as `agent_payments`** | `agent_payments.payment_type` already distinguishes `commission` vs `reimbursement`, which is exactly what an "agent_transactions" table would model. A new table here would fork the same data into two places. |

**Net new tables: `projects`, `financial_transactions`. Everything else is a repoint (add `project_id`), not a rebuild.**

---

## 3. Gap Checklist

### Missing foreign keys
- Every table above keyed by `estimate_id` had no path to a job-level parent at all — that's the core gap, closed by `project_id`.
- `agent_payments.reimbursement_from_agent_id` and `subcontractor_payments.reimbursement_from_agent_id` reference `agents(id)` correctly already (added 2026-07-26/27) — no gap there.
- `invoices.estimate_id` and `change_orders.estimate_id` have no DB-level constraint forcing the estimate's `total` to match after a change-order approval — this is cascaded by application code only (`saveEstimate`, `approveChangeOrder`), not a real FK/trigger guarantee. Out of scope for this migration (it's a correctness issue independent of the project rollup), but worth a follow-up trigger.

### Missing company_id fields
- `estimate_items`, `invoice_items`, `change_order_line_items` have **no direct `company_id` column** — their RLS policies use an `EXISTS` subquery through the parent (estimate/invoice/change_order) instead. Functionally safe today, but it means every read pays a subquery-join cost and any future direct query against these tables without going through the parent risks bypassing the intended scope. Recommend denormalizing `company_id` onto these three tables with a `not null` constraint, backfilled from the parent, purely for defense-in-depth and index-ability — not required for correctness.

### Missing relationships
- No relationship at all from `estimate_subcontractors`/`estimate_agents`/`estimate_expenses`/`mileage_trips` to a job independent of one estimate — closed by this migration.
- No relationship from any status-changing action (estimate approved, change order approved, project completed) to an audit/event record — there is no history of who changed status when. Not required for the project migration itself, but should be tracked as a follow-up (`project_status_history` or similar), especially since the tax module cares about "when did this become taxable revenue."

### Missing indexes
- New indexes added on every new `project_id` column (see migration files) — without these, every project-scoped query (which will become the majority of the app's read pattern) would full-scan.
- `financial_transactions(company_id, transaction_date)` and `financial_transactions(project_id)` indexes are required from day one since this table is designed to be queried by date range and by project constantly (dashboard, tax module, reports).

### Missing constraints
- `projects.status` has an explicit `check` constraint (mirrors the pattern already used for `profiles.role`) — prevents free-text drift like the one already observed on `estimates.status` (`status` vs the unused `old_status` vs `payment_status`).
- `projects(company_id, project_number)` gets a partial unique index (excluding soft-deleted rows) so project numbers can't collide within a company but a deleted project's number can be reused.
- `financial_transactions` gets a `unique(source_table, source_id)` constraint — this is what makes the mirror triggers idempotent (upsert) instead of accumulating duplicate ledger rows on every update.

### Security problems
- Carried over from the first report, still open: the RLS lockdown migration (`20260713000000`) fixed anonymous access but explicitly flagged that **cross-company access between two authenticated users has not been verified** — several query call sites fetch by `id` alone with no `company_id` filter. This should be tested (two real accounts, two companies, try to fetch each other's rows by guessed/enumerated id) before or alongside this migration, since `projects` will inherit the same `current_company_id()` policy pattern and is only as safe as that pattern is proven to be.
- `financial_transactions` is deliberately given **no direct insert/update/delete policy** — the only writes come from `SECURITY DEFINER` mirror triggers on the four source tables. This is intentional: it's the one new design decision in this plan that removes a class of bug (ledger and source table disagreeing) by construction rather than by convention.
- `middleware.ts` still performs no real auth check (noted in the first report) — unrelated to this migration but still an open gap in defense-in-depth; RLS is the only real gate today.

### RLS requirements
- `projects`: standard 4-policy company-scoped template (select/insert/update/delete via `current_company_id()`), identical to `estimates`/`invoices`/etc. — implemented in `20260728000000_create_projects_table.sql`.
- `financial_transactions`: select-only policy for the company; no write policies (writes are trigger-only, see above) — implemented in `20260728000300_financial_transactions_ledger.sql`.
- No new policies needed on the repointed tables (`estimate_expenses`, `estimate_subcontractors`, `estimate_agents`, `change_orders`, `mileage_trips`, `invoices`, `estimates`) — their existing `company_id`-scoped policies already cover the new `project_id` column; it's just an additional attribute on an already-protected row.

---

## 4. Migration Plan (Safe / Reversible / Auditable)

Implemented as four sequential, idempotent migration files — every one can be re-run with no duplicate side effects, and every one is additive (no `DROP COLUMN`, no `NOT NULL` added to an existing column, no existing row rewritten in a way that changes what current queries return).

| Phase | File | What it does | Reversible how |
|---|---|---|---|
| 1 | `20260728000000_create_projects_table.sql` | Creates `projects` + RLS + audit/soft-delete trigger wiring. | `drop table public.projects` — nothing else references it yet. |
| 2 | `20260728000100_add_project_id_to_children.sql` | Adds nullable `project_id` FK to `estimates`, `invoices`, `estimate_expenses`, `estimate_subcontractors`, `estimate_agents`, `change_orders`, `mileage_trips`, `project_milestones`. | `alter table ... drop column project_id` on each — no other column touched. |
| 3 | `20260728000200_backfill_projects_from_estimates.sql` | Creates one `project` per existing `estimate` (status-mapped, including soft-deleted ones), then back-populates `project_id` on every child table via the existing `estimate_id`. `estimate_id` is left untouched everywhere. | Re-deletable by `delete from projects where legacy_estimate_id is not null` (cascades `project_id` back to null via `on delete set null` on every child FK) — `estimate_id` relationships are never modified, so the app keeps working before, during, and after a rollback. |
| 4 | `20260728000300_financial_transactions_ledger.sql` | Creates the `financial_transactions` ledger, mirror triggers on the four money tables, and a one-time backfill of existing rows. | `drop table public.financial_transactions cascade` — it holds no information not already in its source tables. |

**Not yet included (deliberately deferred until Phase 3/4 are verified in production):**

- **Phase 5 — Dual-write cutover:** switch `lib/queries/financialCalculations.ts` to accept `project_id` as its primary key instead of `estimate_id`, behind a flag, and run both paths for a period, diffing output per company.
- **Phase 6 — Application cutover:** new estimates/invoices/expenses/assignments require a `project_id` at creation time; new code stops writing `estimate_id`-only relationships.
- **Phase 7 — Cleanup:** `project_id` becomes `NOT NULL` on all children, `estimate_id` columns are dropped from tables that no longer need them (their relationship to an estimate becomes indirect, through the shared project), and `projects.legacy_estimate_id` is dropped.

Each of those is intentionally a separate, later migration — none of them is safe to write correctly before Phases 1–4 have been run against a real copy of the data and the verification query below has been checked.

### Verification — run before AND after Phase 3/4, compare output

```sql
-- Company-wide totals must match exactly before/after backfill,
-- since Phase 3 changes zero existing columns — it only adds project_id.
select
  (select coalesce(sum(total), 0) from public.estimates where is_deleted = false) as estimates_total,
  (select coalesce(sum(total), 0) from public.invoices where is_deleted = false) as invoices_total,
  (select coalesce(sum(amount), 0) from public.invoice_payments where deleted_at is null) as payments_total,
  (select coalesce(sum(amount), 0) from public.estimate_expenses where deleted_at is null) as expenses_total,
  (select coalesce(sum(amount), 0) from public.subcontractor_payments where deleted_at is null) as sub_payments_total,
  (select coalesce(sum(amount), 0) from public.agent_payments where deleted_at is null) as agent_payments_total;

-- After Phase 4, the ledger's totals per category must equal the
-- equivalent sum on its source table — if these don't match, a mirror
-- trigger has a bug and financial_transactions cannot be trusted yet.
select
  (select coalesce(sum(amount), 0) from public.financial_transactions where category = 'customer_payment' and deleted_at is null) as ledger_customer_payments,
  (select coalesce(sum(amount), 0) from public.invoice_payments where deleted_at is null) as source_customer_payments,
  (select coalesce(sum(amount), 0) from public.financial_transactions where category = 'subcontractor_payment' and deleted_at is null) as ledger_sub_payments,
  (select coalesce(sum(amount), 0) from public.subcontractor_payments where deleted_at is null) as source_sub_payments,
  (select coalesce(sum(amount), 0) from public.financial_transactions where category in ('agent_commission', 'agent_reimbursement') and deleted_at is null) as ledger_agent_payments,
  (select coalesce(sum(amount), 0) from public.agent_payments where deleted_at is null) as source_agent_payments;

-- Every non-deleted estimate must now have exactly one project, and
-- every project must trace back to exactly one estimate (1:1 at this
-- stage — N:1 only becomes possible starting Phase 6).
select count(*) from public.estimates where project_id is null and is_deleted = false; -- expect 0
select count(*) from public.projects where legacy_estimate_id is null; -- expect 0 at this stage
```

Auditability: every row this plan creates or touches goes through the existing `set_audit_fields()` trigger (`created_by`/`updated_by` = `auth.uid()`, or `null` for the backfill scripts run by a migration — same convention already used for the public-signing RPCs), and every table this plan touches already has `deleted_at`/`deleted_by` soft-delete wired in from the July 2026 audit migrations. Nothing in this plan performs a hard delete or an irreversible rewrite anywhere.
