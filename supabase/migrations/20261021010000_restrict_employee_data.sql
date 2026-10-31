-- =====================================================================
-- Keep the "employee" role out of company data it does not need.
--
-- Most tables are readable by every role in the company. An employee login
-- must not read money, customers, or other people's pay, even though the
-- menus hide those pages. The database has to refuse it too.
--
-- Method: one RESTRICTIVE policy per table. A restrictive policy is ANDed
-- with the existing permissive policies, so existing rules are unchanged for
-- every other role, and nothing is rewritten.
--
-- Deliberately NOT restricted:
--   profiles             the caller's own profile is read on every page load
--   employees            the employee reads its own row (see its own policies)
--   time_entries         the employee's own timesheet (see its own policies)
--   estimate_employees   which employees are on an estimate (names only via employees)
--   estimates, projects  already narrowed to assigned work (earlier migrations)
--   companies, company_settings, company_profiles
--                        shell data (name, logo) the app needs to render pages;
--                        review if these ever hold sensitive fields
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  blocked text[] := array[
    -- customers and their places
    'clients', 'properties',
    -- money owed to and by the company
    'invoices', 'invoice_items', 'invoice_payments', 'invoice_change_orders', 'invoice_sequences',
    'financial_transactions', 'mileage_trips',
    -- costs
    'estimate_expenses', 'expense_receipts',
    -- partners and their pay
    'subcontractors', 'subcontractor_payments', 'subcontractor_tax_info',
    'agents', 'agent_payments', 'agent_tax_info',
    'estimate_agents', 'estimate_subcontractors', 'estimate_team_members',
    -- change orders and estimate contents (scope, pricing, photos, notes)
    'change_orders', 'change_order_line_items', 'project_milestones',
    'estimate_items', 'estimate_areas', 'estimate_area_line_items', 'estimate_area_photos',
    'estimate_photos', 'estimate_images', 'estimate_notes', 'estimate_emails',
    'estimate_signatures', 'roofing_area_templates',
    -- tax, audit, automation and company documents
    'company_tax_settings', 'tax_audit_log', 'audit_logs',
    'email_automations', 'automation_email_log', 'company_invites',
    'company_documents', 'documents', 'bill_schedules'
  ];
begin
  foreach t in array blocked loop
    -- Skip a table that does not exist in this database, rather than failing the whole migration.
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'employee_block: table public.% not found, skipped', t;
      continue;
    end if;
    execute format('drop policy if exists employee_block on public.%I', t);
    execute format(
      'create policy employee_block on public.%I as restrictive for all to authenticated '
      'using (coalesce(public.current_user_role(), '''') <> ''employee'') '
      'with check (coalesce(public.current_user_role(), '''') <> ''employee'')',
      t
    );
  end loop;
end
$$;
