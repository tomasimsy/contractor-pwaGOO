-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Run after 20260715000000_add_audit_columns.sql.
--
-- Populates created_by/created_at/updated_by/updated_at automatically
-- from auth.uid() on every insert and update — at the database level,
-- not in application code. This codebase has ~80 insert/update call
-- sites across 20+ files (including duplicate and dead components
-- writing to the same tables), so a trigger is the only way to
-- guarantee every one of them gets audited, including ones that get
-- missed, forgotten, or resurrected later.
--
-- auth.uid() resolves correctly for every authenticated call this app
-- makes (both the browser client and the API routes' cookie-based
-- client go through Supabase's normal request path). It resolves to
-- NULL for the handful of unauthenticated public-signing RPCs
-- (sign_public_estimate, approve_public_change_order, etc.) — that's
-- expected and correct: there's no staff user to attribute those
-- writes to, only an anonymous customer with a link.
--
-- Safe to run more than once — `create or replace function` and a
-- drop-then-create on the trigger make this idempotent.
-- =====================================================================

create or replace function public.set_audit_fields()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

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
    execute format('drop trigger if exists trg_audit_fields on public.%I', t);
    execute format(
      'create trigger trg_audit_fields before insert or update on public.%I for each row execute function public.set_audit_fields()',
      t
    );
  end loop;
end $$;
