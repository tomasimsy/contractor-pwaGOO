-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Phase 1 of the project-centered
-- architecture migration (see ARCHITECTURE_MIGRATION_PLAN.md).
--
-- Creates `projects` as the new top-level job/lifecycle entity that
-- `estimates` has been standing in for. Purely additive: no existing
-- table is altered or dropped here. Nothing reads from this table yet,
-- so running this migration has zero effect on the live app until
-- 20260728000100 and 20260728000200 also run.
--
-- `legacy_estimate_id` is a TRANSITIONAL column only, used solely to
-- carry the 1:1 mapping created during backfill (one project per
-- existing estimate — see 20260728000200). It must not be read by any
-- new application code; it exists so the backfill script and its
-- verification queries have something to join on, and gets dropped in
-- the final cleanup migration once the new shape is proven (Phase 7 of
-- the plan).
-- =====================================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_number text,
  name text not null,
  description text,
  address text,
  -- Job lifecycle status — deliberately separate from estimates.status
  -- (a sales-document status) and distinct from any one estimate's
  -- state, since a project can have an approved estimate and still be
  -- "on_hold" waiting on permits, or "completed" with a rejected
  -- follow-up estimate for extra work still sitting in draft.
  status text not null default 'draft'
    check (status in ('draft', 'active', 'in_progress', 'on_hold', 'completed', 'cancelled', 'archived')),
  start_date date,
  end_date date,
  -- Optional: the team member who owns/leads this job. Nullable — not
  -- every company assigns projects to individuals today.
  assigned_user_id uuid references public.profiles(id) on delete set null,
  legacy_estimate_id uuid references public.estimates(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.projects is
  'The customer job/lifecycle container. Parent of estimates, invoices, expenses, subcontractor/agent assignments, change orders, and tax data for that job. Introduced to stop estimates from doubling as the project entity — see ARCHITECTURE_MIGRATION_PLAN.md.';
comment on column public.projects.legacy_estimate_id is
  'TRANSITIONAL ONLY. 1:1 link back to the estimate this project was backfilled from. Do not read from new code. Dropped in the Phase 7 cleanup migration.';

create index if not exists projects_company_id_idx on public.projects(company_id) where deleted_at is null;
create index if not exists projects_client_id_idx on public.projects(client_id) where deleted_at is null;
create index if not exists projects_status_idx on public.projects(company_id, status) where deleted_at is null;
create index if not exists projects_legacy_estimate_id_idx on public.projects(legacy_estimate_id);

-- One project per company can share a project_number, but not two
-- active (non-deleted) projects in the same company.
create unique index if not exists projects_company_number_unique
  on public.projects(company_id, project_number)
  where deleted_at is null and project_number is not null;

-- ---------------------------------------------------------------------
-- RLS — identical pattern to every other company-scoped table
-- (current_company_id() from 20260713000000_company_rls_lockdown.sql).
-- ---------------------------------------------------------------------
alter table public.projects enable row level security;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (company_id = public.current_company_id());

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (company_id = public.current_company_id());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (company_id = public.current_company_id());

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete using (company_id = public.current_company_id());

-- Wire into the existing audit-trigger and soft-delete-trigger
-- functions (20260715000100, 20260715000200) so created_by/updated_by
-- and soft-delete-on-DELETE work identically to every other table —
-- no special-casing for projects.
drop trigger if exists trg_audit_fields on public.projects;
create trigger trg_audit_fields
  before insert or update on public.projects
  for each row execute function public.set_audit_fields();

drop trigger if exists trg_soft_delete on public.projects;
create trigger trg_soft_delete
  before delete on public.projects
  for each row execute function public.soft_delete_instead();
