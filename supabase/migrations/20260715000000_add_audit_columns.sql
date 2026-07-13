-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Run this file first, before the two
-- trigger migrations that follow it (20260715000100, 20260715000200).
--
-- Adds the standard audit-log columns to every business table:
--   created_by / created_at — who made the row, and when
--   updated_by / updated_at — who last changed it, and when
--   deleted_by / deleted_at — who soft-deleted it, and when
--
-- All six use `add column if not exists`, so this file is safe to run
-- more than once. `created_at`/`updated_at` already exist on several
-- tables (estimates, clients, change_orders, company_settings,
-- documents, project_milestones, companies, estimate_items,
-- invoice_sequences) — the `if not exists` guard makes those a no-op.
--
-- Values are populated by triggers in the next two migration files,
-- not by application code — see those files for why.
-- =====================================================================

do $$
declare
  t text;
  tables text[] := array[
    'estimates', 'invoices', 'clients',
    'invoice_items', 'invoice_payments',
    'estimate_expenses', 'subcontractor_payments', 'agent_payments',
    'estimate_subcontractors', 'estimate_agents',
    'subcontractors', 'agents',
    'change_orders', 'change_order_line_items',
    'company_settings', 'estimate_images', 'documents', 'mileage_trips',
    'project_milestones', 'estimate_items',
    'profiles', 'companies',
    'estimate_signatures', 'invoice_change_orders', 'invoice_sequences'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I add column if not exists created_by uuid references auth.users(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists deleted_by uuid references auth.users(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists created_at timestamptz default now()', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz default now()', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
  end loop;
end $$;
