-- =====================================================================
-- When a bill (or any expense) was actually paid, and the check #.
--
-- Bills are expense rows with a due date; paying one sets is_paid. Until
-- now nothing recorded WHEN it was paid, so the Vendor bills page could
-- not show or sort by the payment date. paid_on is that date. It is
-- passthrough only: no cost, profit or balance figure reads it.
--
-- Backfill: bills already marked paid get their last-updated date, the
-- closest thing on record to when they were paid.
--
-- ADDITIVE and idempotent: safe to re-run.
-- =====================================================================

alter table public.estimate_expenses
  add column if not exists paid_on date,
  add column if not exists paid_reference text;

comment on column public.estimate_expenses.paid_on is
  'Date the expense was paid (set when a bill is paid). Display only; no calculation reads it.';
comment on column public.estimate_expenses.paid_reference is
  'Check # or transfer reference for the payment of a bill. Display only.';

update public.estimate_expenses
set paid_on = coalesce(updated_at, created_at)::date
where paid_on is null
  and is_paid = true
  and due_date is not null
  and deleted_at is null;
