-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- DATABASE_INTEGRITY_AUDIT.md finding #7. 20260720_add_tax_configuration.sql
-- wrote RLS policies referencing `public.company_members`, a table
-- that does not exist anywhere in this schema (membership is modeled
-- via profiles.company_id + current_company_id(), consistent with
-- every other table's policies). Confirmed via anon-key testing that
-- neither company_members nor these 5 tax tables exist in production
-- today, so this has had no live security impact — but the tax module
-- cannot work against a real database until this is fixed, and if a
-- company_members table is ever created for an unrelated reason these
-- policies would silently start evaluating against the wrong source.
--
-- This migration only rewrites the USING clauses to match the rest of
-- the schema's convention; it does not change what the policies are
-- named or which operations they cover otherwise it is a no-op if the
-- tables don't exist yet (drop/create policy on a nonexistent table
-- would error, so each block is guarded).
-- =====================================================================

do $$
begin
  if to_regclass('public.company_tax_settings') is not null then
    drop policy if exists "Users can view tax settings for their company" on public.company_tax_settings;
    create policy "Users can view tax settings for their company" on public.company_tax_settings
      for select using (company_id = public.current_company_id());

    drop policy if exists "Users can update tax settings for their company" on public.company_tax_settings;
    create policy "Users can update tax settings for their company" on public.company_tax_settings
      for update using (company_id = public.current_company_id());
  end if;

  if to_regclass('public.subcontractor_tax_info') is not null then
    drop policy if exists "Users can view subcontractor tax info for their company" on public.subcontractor_tax_info;
    create policy "Users can view subcontractor tax info for their company" on public.subcontractor_tax_info
      for select using (company_id = public.current_company_id());
  end if;

  if to_regclass('public.agent_tax_info') is not null then
    drop policy if exists "Users can view agent tax info for their company" on public.agent_tax_info;
    create policy "Users can view agent tax info for their company" on public.agent_tax_info
      for select using (company_id = public.current_company_id());
  end if;

  if to_regclass('public.expense_receipts') is not null then
    drop policy if exists "Users can view expense receipts for their company" on public.expense_receipts;
    create policy "Users can view expense receipts for their company" on public.expense_receipts
      for select using (company_id = public.current_company_id());
  end if;

  if to_regclass('public.tax_audit_log') is not null then
    drop policy if exists "Users can view tax audit logs for their company" on public.tax_audit_log;
    create policy "Users can view tax audit logs for their company" on public.tax_audit_log
      for select using (company_id = public.current_company_id());
  end if;
end $$;
