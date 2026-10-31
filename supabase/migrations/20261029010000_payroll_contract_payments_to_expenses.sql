-- =====================================================================
-- Subcontractor and agent payments: catch up the expense ledger.
--
-- ONE PAYMENT = ONE EXPENSE RECORD (see 20260803000000). After that
-- backfill ran, Payroll kept recording subcontractor payments into the
-- legacy `subcontractor_payments` table, which no cost, profit or
-- "still owed" figure reads. Payroll now writes expense rows, so those
-- payments are moved over here, or the subcontractor would show as
-- owed again for work already paid.
--
-- WHAT THIS DOES
--   1. Active subcontractor_payments with no expense yet -> expense
--      rows, now carrying the assignment's estimate_id so the payment
--      settles that job (the earlier backfill left it null).
--   2. Same for active agent commission payments.
--   3. Expense rows the earlier backfill created without an estimate
--      get the assignment's estimate_id, so they settle their job
--      instead of sitting at project level.
--
-- Safe to re-run: step 1 and 2 skip any payment that already has its
-- 'migrated-from:' marker, and step 3 only fills a null estimate_id.
-- Soft-deleted (reversed) payments are skipped, as before.
-- =====================================================================

begin;

-- 1. Subcontractor payments -> expense rows.
insert into public.estimate_expenses (
  company_id, project_id, estimate_id, expense_type, category, description, amount,
  expense_date, notes, vendor, payee_type, payee_id, paid_by,
  payment_method, is_paid, reimbursable, reimbursement_status,
  created_by, created_at, updated_by, updated_at
)
select
  p.company_id,
  a.project_id,
  a.estimate_id,
  'subcontractor',
  'other',
  'Subcontractor payment',
  p.amount,
  p.payment_date,
  'migrated-from:subcontractor_payments:' || p.id,
  s.name,
  'subcontractor',
  a.subcontractor_id,
  'company',
  p.payment_method,
  true,
  false,
  'not_applicable',
  p.created_by,
  p.created_at,
  p.created_by,
  p.created_at
from public.subcontractor_payments p
join public.estimate_subcontractors a on a.id = p.estimate_subcontractor_id
left join public.subcontractors s on s.id = a.subcontractor_id
where p.deleted_at is null
  and not exists (
    select 1 from public.estimate_expenses e
    where e.notes = 'migrated-from:subcontractor_payments:' || p.id
  );

-- 2. Agent commission payments -> expense rows.
insert into public.estimate_expenses (
  company_id, project_id, estimate_id, expense_type, category, description, amount,
  expense_date, notes, vendor, payee_type, payee_id, paid_by,
  payment_method, is_paid, reimbursable, reimbursement_status,
  created_by, created_at, updated_by, updated_at
)
select
  p.company_id,
  a.project_id,
  a.estimate_id,
  'agent_commission',
  'other',
  'Agent commission',
  p.amount,
  p.payment_date,
  'migrated-from:agent_payments:' || p.id,
  ag.name,
  'agent',
  p.agent_id,
  'company',
  null,
  true,
  false,
  'not_applicable',
  p.created_by,
  p.created_at,
  p.created_by,
  p.created_at
from public.agent_payments p
left join public.estimate_agents a on a.id = p.estimate_agent_id
left join public.agents ag on ag.id = p.agent_id
where p.deleted_at is null
  and p.payment_type = 'commission'
  and not exists (
    select 1 from public.estimate_expenses e
    where e.notes = 'migrated-from:agent_payments:' || p.id
  );

-- 3. Earlier backfilled rows: attach them to their job.
update public.estimate_expenses e
set estimate_id = a.estimate_id, updated_at = now()
from public.subcontractor_payments p
join public.estimate_subcontractors a on a.id = p.estimate_subcontractor_id
where e.notes = 'migrated-from:subcontractor_payments:' || p.id
  and e.estimate_id is null
  and a.estimate_id is not null;

update public.estimate_expenses e
set estimate_id = a.estimate_id, updated_at = now()
from public.agent_payments p
join public.estimate_agents a on a.id = p.estimate_agent_id
where e.notes = 'migrated-from:agent_payments:' || p.id
  and e.estimate_id is null
  and a.estimate_id is not null;

commit;

-- CHECK, after running: every active legacy payment has exactly one expense.
-- Expect zero rows.
-- select p.id, p.amount from public.subcontractor_payments p
-- where p.deleted_at is null
--   and (select count(*) from public.estimate_expenses e
--        where e.notes = 'migrated-from:subcontractor_payments:' || p.id and e.deleted_at is null) <> 1;
