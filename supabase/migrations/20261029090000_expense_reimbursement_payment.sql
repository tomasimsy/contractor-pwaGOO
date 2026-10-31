-- =====================================================================
-- Reimbursements are paid in Payroll, with a date, method and check #.
--
-- A reimbursement repays an expense a person paid for (an agent, a sub,
-- a team member). It adds no cost — the expense already counts — so it
-- stays ONE record: the expense, marked reimbursed. Until now that mark
-- had no date, method or check number, so the money going out never
-- showed as a payment. These columns record it:
--
--   reimbursed_on         the day it was paid back
--   reimbursed_method     how (as Payroll writes it, e.g. "Check 1042")
--   reimbursed_reference  check # or transfer reference
--   reimbursed_check      which Payroll payment it was part of, so a
--                         commission and a reimbursement paid together
--                         show as one check
--
-- Backfill: reimbursements already marked get their last-updated date.
-- Display only; no cost or profit figure reads these. Safe to re-run.
-- =====================================================================

alter table public.estimate_expenses
  add column if not exists reimbursed_on date,
  add column if not exists reimbursed_method text,
  add column if not exists reimbursed_reference text,
  add column if not exists reimbursed_check text;

update public.estimate_expenses
set reimbursed_on = coalesce(updated_at, created_at)::date
where reimbursement_status = 'reimbursed'
  and reimbursed_on is null
  and deleted_at is null;
