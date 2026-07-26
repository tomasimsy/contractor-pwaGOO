-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Phase 3 of the project-centered
-- architecture migration. Run after 20260728000100_add_project_id_to_children.sql.
--
-- Creates exactly ONE project per existing estimate (including
-- soft-deleted ones, so nothing in /deleted becomes orphaned) and
-- back-populates project_id on every child table via estimate_id.
-- This is the "preserve old relationships temporarily" step: estimate_id
-- is left untouched everywhere, so every existing query keeps working
-- exactly as before. project_id is purely additive until Phase 6/7.
--
-- Idempotent: re-running is safe. The `where p.id is null` guard on
-- the INSERT means estimates that already have a project (from a
-- prior run of this file) are skipped, not duplicated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Step 1: one project per estimate.
-- ---------------------------------------------------------------------
insert into public.projects (
  company_id, client_id, name, status, legacy_estimate_id,
  created_by, created_at, deleted_at, deleted_by
)
select
  e.company_id,
  e.client_id,
  coalesce(nullif(e.title, ''), 'Project for ' || coalesce(e.estimate_number, e.id::text)),
  case e.status
    when 'draft' then 'draft'
    when 'sent' then 'draft'
    when 'viewed' then 'draft'
    when 'approved' then 'active'
    when 'converted_to_invoice' then 'active'
    when 'project_in_progress' then 'in_progress'
    when 'completed' then 'completed'
    when 'archived' then 'archived'
    when 'cancelled' then 'cancelled'
    else 'draft'
  end,
  e.id,
  e.created_by,
  e.created_at,
  e.deleted_at,
  e.deleted_by
from public.estimates e
left join public.projects p on p.legacy_estimate_id = e.id
where p.id is null;

-- ---------------------------------------------------------------------
-- Step 2: point every estimate at its new project.
-- ---------------------------------------------------------------------
update public.estimates e
set project_id = p.id
from public.projects p
where p.legacy_estimate_id = e.id
  and e.project_id is distinct from p.id;

-- ---------------------------------------------------------------------
-- Step 3: cascade project_id onto every table keyed by estimate_id,
-- via the estimate -> project mapping just established.
-- ---------------------------------------------------------------------
update public.invoices c
set project_id = e.project_id
from public.estimates e
where c.estimate_id = e.id
  and e.project_id is not null
  and c.project_id is distinct from e.project_id;

update public.estimate_expenses c
set project_id = e.project_id
from public.estimates e
where c.estimate_id = e.id
  and e.project_id is not null
  and c.project_id is distinct from e.project_id;

update public.estimate_subcontractors c
set project_id = e.project_id
from public.estimates e
where c.estimate_id = e.id
  and e.project_id is not null
  and c.project_id is distinct from e.project_id;

update public.estimate_agents c
set project_id = e.project_id
from public.estimates e
where c.estimate_id = e.id
  and e.project_id is not null
  and c.project_id is distinct from e.project_id;

update public.change_orders c
set project_id = e.project_id
from public.estimates e
where c.estimate_id = e.id
  and e.project_id is not null
  and c.project_id is distinct from e.project_id;

update public.mileage_trips c
set project_id = e.project_id
from public.estimates e
where c.estimate_id = e.id
  and e.project_id is not null
  and c.project_id is distinct from e.project_id;

update public.project_milestones c
set project_id = e.project_id
from public.estimates e
where c.estimate_id = e.id
  and e.project_id is not null
  and c.project_id is distinct from e.project_id;

-- ---------------------------------------------------------------------
-- Step 4: verification query — run this manually and inspect the
-- output before proceeding to any later phase. Every row here is a
-- gap that must be explained (e.g. an estimate with no company_id)
-- before trusting the backfill.
-- ---------------------------------------------------------------------
-- select 'estimates missing project_id' as check_name, count(*) from public.estimates where project_id is null
-- union all
-- select 'invoices missing project_id', count(*) from public.invoices where estimate_id is not null and project_id is null
-- union all
-- select 'estimate_expenses missing project_id', count(*) from public.estimate_expenses where estimate_id is not null and project_id is null
-- union all
-- select 'estimate_subcontractors missing project_id', count(*) from public.estimate_subcontractors where estimate_id is not null and project_id is null
-- union all
-- select 'estimate_agents missing project_id', count(*) from public.estimate_agents where estimate_id is not null and project_id is null
-- union all
-- select 'change_orders missing project_id', count(*) from public.change_orders where estimate_id is not null and project_id is null
-- union all
-- select 'mileage_trips missing project_id', count(*) from public.mileage_trips where estimate_id is not null and project_id is null
-- union all
-- select 'project_milestones missing project_id', count(*) from public.project_milestones where estimate_id is not null and project_id is null;
