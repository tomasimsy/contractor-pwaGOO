-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- Adds soft-delete to the three tables the Project Expense page and
-- ProjectFinancialsModal write to. Today, deleting an expense,
-- subcontractor payment, or agent commission is a permanent, hard
-- `DELETE` — there's no way to recover from an accidental delete, and
-- no audit trail of what was removed or when.
--
-- `deleted_at timestamptz` (nullable) is used rather than the
-- `is_deleted boolean` pattern `estimates`/`invoices` use elsewhere in
-- this schema, matching what `clients` already does — it's a fresh
-- addition on tables with no prior soft-delete convention, and
-- recording *when* something was deleted is strictly more useful than
-- a bare flag for an auditable delete.
--
-- Safe to run any time: adds a nullable column with no default change
-- to existing rows (all existing rows get deleted_at = NULL, i.e.
-- "not deleted", which is correct — nothing already in these tables
-- should disappear).
-- =====================================================================

alter table public.estimate_expenses add column if not exists deleted_at timestamptz;
alter table public.subcontractor_payments add column if not exists deleted_at timestamptz;
alter table public.agent_payments add column if not exists deleted_at timestamptz;

-- Existing RLS policies on these tables (see the earlier lockdown
-- migrations) are unaffected — deleted_at doesn't change who can read
-- or write a row, only which rows the app chooses to show. Nothing
-- else to update here.
