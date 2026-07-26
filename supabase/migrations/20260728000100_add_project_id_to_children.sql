-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Phase 2 of the project-centered
-- architecture migration. Run after 20260728000000_create_projects_table.sql.
--
-- Adds a NULLABLE project_id to every table currently keyed off
-- estimate_id. Nullable is deliberate: this is an additive schema
-- change only — nothing is backfilled here (see 20260728000200) and
-- no existing query is touched, so the live app keeps working
-- unmodified after this migration runs. NOT NULL is only added in the
-- Phase 7 cleanup migration, once every row has been backfilled and
-- verified.
--
-- Tables intentionally NOT given a direct project_id here:
--   - invoice_items, change_order_line_items, estimate_items —
--     line-item children reachable via their own parent's project_id
--     (invoices.project_id, change_orders.project_id,
--     estimates.project_id respectively). Denormalizing project_id
--     onto every line-item table would just be one more place for it
--     to drift.
--   - subcontractor_payments, agent_payments, invoice_payments —
--     these already resolve to a project transitively (payment ->
--     assignment/invoice -> project), and adding project_id directly
--     to them is exactly the job of the new financial_transactions
--     ledger (20260728000300), not a column bolted onto three
--     different existing tables with three different join shapes.
-- =====================================================================

alter table public.estimates add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.invoices add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.estimate_expenses add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.estimate_subcontractors add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.estimate_agents add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.change_orders add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.mileage_trips add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.project_milestones add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists estimates_project_id_idx on public.estimates(project_id);
create index if not exists invoices_project_id_idx on public.invoices(project_id);
create index if not exists estimate_expenses_project_id_idx on public.estimate_expenses(project_id);
create index if not exists estimate_subcontractors_project_id_idx on public.estimate_subcontractors(project_id);
create index if not exists estimate_agents_project_id_idx on public.estimate_agents(project_id);
create index if not exists change_orders_project_id_idx on public.change_orders(project_id);
create index if not exists mileage_trips_project_id_idx on public.mileage_trips(project_id);
create index if not exists project_milestones_project_id_idx on public.project_milestones(project_id);

comment on column public.estimates.project_id is
  'The job this estimate belongs to. Nullable during migration; becomes NOT NULL once every row is backfilled (see ARCHITECTURE_MIGRATION_PLAN.md Phase 7). estimate_id remains the FK children use to reach this estimate until then — do not remove estimate_id yet.';
comment on column public.invoices.project_id is
  'The job this invoice bills. Nullable during migration — see estimates.project_id comment.';
