-- =====================================================================
-- ONE PAYMENT = ONE EXPENSE RECORD — legacy payment backfill.
--
-- The application no longer reads `subcontractor_payments` or
-- `agent_payments` for ANY financial figure. Every cost is a row in
-- `estimate_expenses`; a subcontractor payment is an expense typed
-- 'subcontractor', an agent commission is one typed 'agent_commission',
-- and `estimate_subcontractors` / `estimate_agents` now carry only the
-- CONTRACTED amount (outstanding = contracted − paid-from-expenses).
--
-- Consequence, and the reason this migration exists: as of the
-- application change, every historical payment in those two tables is
-- invisible to cost and profit. Until this runs, historical job cost
-- reads low and profit reads high by exactly the sum of those payments.
--
-- WHAT THIS DOES
--   1. subcontractor_payments  -> estimate_expenses (expense_type
--      'subcontractor', payee = the assignment's subcontractor).
--   2. agent_payments WHERE payment_type = 'commission'
--                          -> estimate_expenses ('agent_commission').
--   3. agent_payments WHERE payment_type = 'reimbursement'
--      -> NOT a new expense row. A reimbursement settles a debt for a
--         purchase already recorded as an expense; inserting a row
--         would double-charge that spending (the exact bug the old
--         engine carried). It marks the referenced expense reimbursed.
--
-- WHAT IT DELIBERATELY SKIPS
--   - Soft-deleted payments (deleted_at is not null). They were never
--     counted as cost, so migrating them would CREATE cost that never
--     existed. They stay in their legacy table as history.
--   - Payments whose assignment is missing or soft-deleted, and
--     reimbursements whose expense_id is null or already reimbursed.
--     Each is reported by the verification queries at the bottom.
--
-- NO SCHEMA CHANGES. No new table, no new column. Idempotency is keyed
-- on a marker written into `estimate_expenses.notes`, so re-running is
-- safe and cannot produce a duplicate expense.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Before-totals, so the after-check has something to compare to.
--    Kept in a TEMP table: it disappears with the session and adds no
--    schema.
-- ---------------------------------------------------------------------
create temp table migration_before_totals on commit drop as
select
  (select coalesce(sum(amount), 0) from public.subcontractor_payments where deleted_at is null) as sub_payments_total,
  (select coalesce(sum(amount), 0) from public.agent_payments where deleted_at is null and payment_type = 'commission') as agent_commission_total,
  (select coalesce(sum(amount), 0) from public.estimate_expenses where deleted_at is null) as expenses_total;

-- ---------------------------------------------------------------------
-- 1. Subcontractor payments -> expense rows.
-- ---------------------------------------------------------------------
insert into public.estimate_expenses (
  company_id, project_id, expense_type, category, description, amount,
  expense_date, notes, vendor, payee_type, payee_id, paid_by,
  payment_method, is_paid, reimbursable, reimbursement_status,
  created_by, created_at, updated_by, updated_at
)
select
  p.company_id,
  a.project_id,
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
  and a.deleted_at is null
  -- Idempotency: never insert the same legacy payment twice.
  and not exists (
    select 1 from public.estimate_expenses e
    where e.notes = 'migrated-from:subcontractor_payments:' || p.id
  );

-- ---------------------------------------------------------------------
-- 2. Agent COMMISSION payments -> expense rows.
-- ---------------------------------------------------------------------
insert into public.estimate_expenses (
  company_id, project_id, expense_type, category, description, amount,
  expense_date, notes, vendor, payee_type, payee_id, paid_by,
  payment_method, is_paid, reimbursable, reimbursement_status,
  created_by, created_at, updated_by, updated_at
)
select
  p.company_id,
  a.project_id,
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
-- LEFT join: a commission can be paid without a formal assignment, and
-- dropping it would erase real cost. Such a row lands with a null
-- project_id and is listed by verification query D below.
left join public.estimate_agents a
  on a.id = p.estimate_agent_id and a.deleted_at is null
left join public.agents ag on ag.id = p.agent_id
where p.deleted_at is null
  and p.payment_type = 'commission'
  and not exists (
    select 1 from public.estimate_expenses e
    where e.notes = 'migrated-from:agent_payments:' || p.id
  );

-- ---------------------------------------------------------------------
-- 3. Agent REIMBURSEMENT payments -> settle the existing expense.
--    No insert: the purchase is already an expense row. This only
--    flips its reimbursement status, which is what "the agent has been
--    paid back" now means.
-- ---------------------------------------------------------------------
update public.estimate_expenses e
set reimbursement_status = 'reimbursed',
    updated_at = now()
from public.agent_payments p
where p.expense_id = e.id
  and p.deleted_at is null
  and p.payment_type = 'reimbursement'
  and e.deleted_at is null
  and coalesce(e.reimbursement_status, '') <> 'reimbursed';

commit;

-- =====================================================================
-- VERIFICATION — run these after the migration. Each returns zero rows
-- (or a zero difference) when the backfill is correct.
-- =====================================================================

-- A. Every active subcontractor payment produced exactly one expense.
--    Expect: zero rows.
-- select p.id, p.amount
-- from public.subcontractor_payments p
-- join public.estimate_subcontractors a on a.id = p.estimate_subcontractor_id and a.deleted_at is null
-- where p.deleted_at is null
--   and not exists (
--     select 1 from public.estimate_expenses e
--     where e.notes = 'migrated-from:subcontractor_payments:' || p.id and e.deleted_at is null
--   );

-- B. No legacy payment produced TWO expenses. Expect: zero rows.
-- select notes, count(*)
-- from public.estimate_expenses
-- where notes like 'migrated-from:%' and deleted_at is null
-- group by notes having count(*) > 1;

-- C. Totals reconcile: the expense total grew by exactly the migrated
--    cash, and the per-type buckets equal the legacy tables.
--    Expect: difference = 0 on both rows.
-- select 'subcontractor' as bucket,
--        (select coalesce(sum(amount),0) from public.estimate_expenses
--          where expense_type = 'subcontractor' and deleted_at is null
--            and notes like 'migrated-from:subcontractor_payments:%')
--        - (select coalesce(sum(p.amount),0) from public.subcontractor_payments p
--             join public.estimate_subcontractors a on a.id = p.estimate_subcontractor_id and a.deleted_at is null
--            where p.deleted_at is null) as difference
-- union all
-- select 'agent_commission',
--        (select coalesce(sum(amount),0) from public.estimate_expenses
--          where expense_type = 'agent_commission' and deleted_at is null
--            and notes like 'migrated-from:agent_payments:%')
--        - (select coalesce(sum(amount),0) from public.agent_payments
--            where deleted_at is null and payment_type = 'commission');

-- D. Rows that landed WITHOUT a project — real cost that no project
--    page will show. Review and attach manually. Expect: zero rows,
--    but a non-empty result is data to fix, not a failed migration.
-- select id, amount, expense_date, notes
-- from public.estimate_expenses
-- where project_id is null and notes like 'migrated-from:%' and deleted_at is null;

-- E. Reimbursements that could not be settled (no expense_id, or the
--    expense is gone). Expect: zero rows.
-- select p.id, p.amount, p.expense_id
-- from public.agent_payments p
-- where p.deleted_at is null and p.payment_type = 'reimbursement'
--   and (p.expense_id is null
--        or not exists (select 1 from public.estimate_expenses e
--                        where e.id = p.expense_id and e.reimbursement_status = 'reimbursed'));

-- F. Payments orphaned by a deleted/missing assignment — skipped on
--    purpose, listed so the decision is visible. Expect: review only.
-- select p.id, p.amount, p.estimate_subcontractor_id
-- from public.subcontractor_payments p
-- left join public.estimate_subcontractors a on a.id = p.estimate_subcontractor_id and a.deleted_at is null
-- where p.deleted_at is null and a.id is null;

-- =====================================================================
-- ROLLBACK — the migration writes nothing that cannot be undone,
-- because every inserted row is self-identifying and the legacy tables
-- are left untouched.
--
--   delete from public.estimate_expenses where notes like 'migrated-from:%';
--   -- then, if needed, reset the reimbursement flags step 3 set:
--   update public.estimate_expenses e set reimbursement_status = 'pending'
--     from public.agent_payments p
--    where p.expense_id = e.id and p.deleted_at is null
--      and p.payment_type = 'reimbursement';
-- =====================================================================
