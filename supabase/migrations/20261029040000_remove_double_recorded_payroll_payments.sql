-- =====================================================================
-- Remove payments recorded twice by the old Payroll Pay button
-- (Oct 29, 2026, about 04:02–04:03).
--
-- WHAT HAPPENED: Payroll used to work out what subs and agents were owed
-- from the legacy subcontractor_payments / agent_payments tables only.
-- Payments already made from the estimate (expense rows) were invisible
-- to it, so "Review and pay" paid those jobs again into the legacy
-- tables. Migration 20261029010000 then copied those legacy rows into
-- the expense ledger (marker 'migrated-from:...'), and the jobs now show
-- paid twice. Payroll no longer reads the legacy tables, so this cannot
-- happen again.
--
-- WHICH ROWS (checked one by one against the jobs' assigned amounts):
--   Agent-1 — all 14 parts, $499.15. Every one repeats a payment
--             already recorded on Aug 9 (or, for OSR…46, at 04:06).
--   Sub-1   — 2 parts, $17.00: Bathroom Project $2 (already paid at
--             03:53) and OSR20260025 $15 (already paid $1 + $14 in Aug).
--             The other 9 Sub-1 parts were the only payment for their
--             job and are KEPT.
--
-- Soft delete only, with a reason. The matching legacy rows are soft-
-- deleted too so the two tables agree. Nothing is hard-deleted.
--
-- RUN STEP 1 FIRST and check it lists 16 rows totalling $516.15.
-- =====================================================================

-- STEP 1 — PREVIEW
select e.id, e.vendor, e.amount, e.estimate_id, e.expense_date, e.notes
from public.estimate_expenses e
where e.deleted_at is null
  and e.id in (
    -- Agent-1, $499.15
    '3d1ad661-323c-4e74-a124-ad12c1ec706d', '6b8672df-f3af-4f9c-9cc4-dcbcc303acec',
    '56534a80-209f-46ec-b973-889119775d95', '4f471ac9-db27-4ce5-a9bf-ca1415239fcc',
    'fca8e258-1f33-4457-85d2-ac7a4145acf0', '817c4409-fcfb-49c7-aedc-9077242c08ac',
    '8461e6d2-5bee-43c4-8022-39af6376c982', '88b48636-b6aa-41eb-b973-5ed8e86a7e2d',
    'e2523723-7e27-4c58-acdb-1a0035bc3818', 'eb966924-1fd7-446b-887e-96305f1b6f2a',
    '54f7d142-95a9-4a68-9837-d9b322679eae', 'd9f0ca29-5648-4973-bbe7-6a8b80d0f288',
    '5cfd6cd5-2dcb-4f90-b4a9-b3199b284d53', 'a8df4037-c729-42a0-851d-e69361aa3b0d',
    -- Sub-1, $17.00
    'ac1fe252-553c-494b-8471-222094c951cb', 'f4b9eecb-c21f-42fc-afa3-0714a477a3b7'
  )
order by e.vendor, e.amount;

-- STEP 2 — SOFT-DELETE. Uncomment and run after checking step 1.
-- begin;
--
-- with dup as (
--   update public.estimate_expenses e
--   set deleted_at = now(),
--       delete_reason = 'Recorded twice: old Payroll paid a job already paid from the estimate (Oct 29)'
--   where e.deleted_at is null
--     and e.id in (
--       '3d1ad661-323c-4e74-a124-ad12c1ec706d', '6b8672df-f3af-4f9c-9cc4-dcbcc303acec',
--       '56534a80-209f-46ec-b973-889119775d95', '4f471ac9-db27-4ce5-a9bf-ca1415239fcc',
--       'fca8e258-1f33-4457-85d2-ac7a4145acf0', '817c4409-fcfb-49c7-aedc-9077242c08ac',
--       '8461e6d2-5bee-43c4-8022-39af6376c982', '88b48636-b6aa-41eb-b973-5ed8e86a7e2d',
--       'e2523723-7e27-4c58-acdb-1a0035bc3818', 'eb966924-1fd7-446b-887e-96305f1b6f2a',
--       '54f7d142-95a9-4a68-9837-d9b322679eae', 'd9f0ca29-5648-4973-bbe7-6a8b80d0f288',
--       '5cfd6cd5-2dcb-4f90-b4a9-b3199b284d53', 'a8df4037-c729-42a0-851d-e69361aa3b0d',
--       'ac1fe252-553c-494b-8471-222094c951cb', 'f4b9eecb-c21f-42fc-afa3-0714a477a3b7'
--     )
--   returning e.notes
-- )
-- select count(*) from dup;
--
-- -- The legacy rows those expenses were copied from.
-- update public.agent_payments p
-- set deleted_at = now(), delete_reason = 'Recorded twice (Oct 29 Payroll)'
-- where p.deleted_at is null
--   and exists (select 1 from public.estimate_expenses e
--               where e.notes = 'migrated-from:agent_payments:' || p.id and e.deleted_at is not null);
--
-- update public.subcontractor_payments p
-- set deleted_at = now(), delete_reason = 'Recorded twice (Oct 29 Payroll)'
-- where p.deleted_at is null
--   and exists (select 1 from public.estimate_expenses e
--               where e.notes = 'migrated-from:subcontractor_payments:' || p.id and e.deleted_at is not null);
--
-- commit;
