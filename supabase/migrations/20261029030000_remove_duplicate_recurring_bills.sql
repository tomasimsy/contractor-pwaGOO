-- =====================================================================
-- Remove duplicate bills created by recurring schedules.
--
-- CAUSE: billScheduleService.generateDue ran on every Bills page load.
-- Two loads at the same time (two tabs, or React running the effect
-- twice) each read the same next_due_date and each created the bill,
-- so every recurring bill was saved twice. Fixed in code: an occurrence
-- is now claimed on the schedule before the bill is created, so only
-- one run can create it.
--
-- WHAT THIS DOES: among bills that a schedule generated (same company,
-- project, vendor, amount and category as a schedule, due date equal to
-- the bill date, no bill #), keeps ONE per due date and soft-deletes
-- the rest with a reason. The copy kept is a paid one if any copy was
-- paid, otherwise the first one saved. Nothing is hard-deleted.
--
-- RUN STEP 1 FIRST and check the rows it lists. Then run step 2.
-- Safe to re-run: once duplicates are gone, step 2 matches nothing.
-- =====================================================================

-- STEP 1 — PREVIEW. Lists every copy; "remove" marks the ones step 2 soft-deletes.
with generated as (
  select e.id, e.company_id, e.vendor, e.amount, e.expense_type, e.due_date, e.is_paid, e.created_at,
         row_number() over (
           partition by e.company_id, e.project_id, e.vendor, e.amount, e.expense_type, e.due_date
           order by e.is_paid desc, e.created_at asc, e.id asc
         ) as copy_no
  from public.estimate_expenses e
  where e.deleted_at is null
    and e.due_date is not null
    and e.expense_date = e.due_date
    and e.bill_number is null
    and exists (
      select 1 from public.bill_schedules s
      where s.company_id = e.company_id
        and s.project_id is not distinct from e.project_id
        and s.vendor is not distinct from e.vendor
        and s.amount = e.amount
        and s.expense_type = e.expense_type
    )
)
select id, coalesce(vendor, '(no vendor)') as vendor, amount, expense_type, due_date, is_paid, created_at,
       case when copy_no > 1 then 'remove' else 'keep' end as action
from generated g
where exists (
  select 1 from generated d
  where d.company_id = g.company_id and d.vendor is not distinct from g.vendor
    and d.amount = g.amount and d.expense_type = g.expense_type and d.due_date = g.due_date and d.copy_no > 1
)
order by due_date, vendor, copy_no;

-- STEP 2 — SOFT-DELETE the extra copies. Uncomment and run after checking step 1.
-- with generated as (
--   select e.id,
--          row_number() over (
--            partition by e.company_id, e.project_id, e.vendor, e.amount, e.expense_type, e.due_date
--            order by e.is_paid desc, e.created_at asc, e.id asc
--          ) as copy_no
--   from public.estimate_expenses e
--   where e.deleted_at is null
--     and e.due_date is not null
--     and e.expense_date = e.due_date
--     and e.bill_number is null
--     and exists (
--       select 1 from public.bill_schedules s
--       where s.company_id = e.company_id
--         and s.project_id is not distinct from e.project_id
--         and s.vendor is not distinct from e.vendor
--         and s.amount = e.amount
--         and s.expense_type = e.expense_type
--     )
-- )
-- update public.estimate_expenses e
-- set deleted_at = now(),
--     delete_reason = 'Duplicate recurring bill (generated twice by concurrent page loads)'
-- from generated g
-- where e.id = g.id and g.copy_no > 1;
