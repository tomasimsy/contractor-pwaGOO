-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Run after 20260715000100_audit_trigger.sql.
--
-- Converts every `DELETE` on the tables below into a soft delete —
-- `deleted_at = now(), deleted_by = auth.uid()` — instead of actually
-- removing the row. This intercepts the ~15 hard-delete call sites
-- scattered across the app (and a few duplicate/dead components) with
-- zero application code changes, since the trigger fires regardless of
-- which file issued the DELETE.
--
-- NOT applied to:
--   - estimates, invoices — these already have a working hand-rolled
--     is_deleted/deleted_at flow with a genuine PERMANENT delete
--     escape hatch (app/deleted/page.tsx's "Delete All Permanently").
--     Intercepting DELETE here would silently break that feature —
--     the permanent-delete button would stop actually deleting
--     anything, forever. Those two tables just get `deleted_by` wired
--     into their existing app-level soft-delete call sites instead
--     (separate code change, not this trigger).
--   - profiles, companies — profile/company removal should follow
--     auth.users' own lifecycle (cascade via the FK), not be silently
--     rewritten into an update.
--   - estimate_signatures, invoice_change_orders, invoice_sequences —
--     no application code references these tables at all; nothing to
--     intercept.
--
-- IMPORTANT: after running this, every place that reads these tables
-- must filter `.is("deleted_at", null)` or "deleted" rows will keep
-- showing up in lists (the delete will look broken even though it
-- worked). That's handled in the application code changes alongside
-- this migration — see the affected files list in this session's plan.
--
-- Safe to run more than once.
-- =====================================================================

create or replace function public.soft_delete_instead()
returns trigger
language plpgsql
security definer
as $$
begin
  execute format(
    'update public.%I set deleted_at = now(), deleted_by = auth.uid() where id = $1',
    TG_TABLE_NAME
  ) using OLD.id;
  return null; -- cancels the real DELETE
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'clients',
    'invoice_items', 'invoice_payments',
    'estimate_expenses', 'subcontractor_payments', 'agent_payments',
    'estimate_subcontractors', 'estimate_agents',
    'subcontractors', 'agents',
    'change_orders', 'change_order_line_items',
    'company_settings', 'estimate_images', 'documents', 'mileage_trips',
    'project_milestones', 'estimate_items'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_soft_delete on public.%I', t);
    execute format(
      'create trigger trg_soft_delete before delete on public.%I for each row execute function public.soft_delete_instead()',
      t
    );
  end loop;
end $$;
