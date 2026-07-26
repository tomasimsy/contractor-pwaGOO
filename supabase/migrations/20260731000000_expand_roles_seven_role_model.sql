-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- Expands profiles.role from the 5-role set introduced in
-- 20260729000200_role_permissions.sql (owner, manager, estimator,
-- accountant, agent) to the 7-role set the business actually uses —
-- admin, office, sales, project_manager, accountant, subcontractor,
-- agent — matching the updated PERMISSION_MATRIX in
-- contractor-app-v2/lib/services/permissions.ts. Per that migration's
-- own comment, the SQL constraint and the TypeScript matrix have no
-- shared source of truth and must be kept in sync by hand — this is
-- that sync.
--
-- Renames, not new concepts, for the first three: owner -> admin,
-- manager -> office, estimator -> sales. accountant and agent are
-- unchanged. project_manager and subcontractor are genuinely new.
-- Existing rows are remapped by the update statement below before the
-- constraint changes, so no row is left holding a now-invalid value.
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'admin' where role = 'owner';
update public.profiles set role = 'office' where role = 'manager';
update public.profiles set role = 'sales' where role = 'estimator';
-- accountant, agent: no change needed, already valid under the new set.

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'office', 'sales', 'project_manager', 'accountant', 'subcontractor', 'agent'));

comment on column public.profiles.role is
  'One of: admin, office, sales, project_manager, accountant, subcontractor, agent. Mirrors the Role type and PERMISSION_MATRIX in contractor-app-v2/lib/services/permissions.ts — the two must be kept in sync by hand; there is no shared source of truth between SQL and TypeScript for this list.';

-- current_user_role() (20260729000200) needs no change — it just reads
-- profiles.role, whatever values that column currently allows.

-- ---------------------------------------------------------------------
-- Re-point the role-gated policies from 20260729000200 at the renamed
-- values. Same policies, same intent, new role names.
-- ---------------------------------------------------------------------

drop policy if exists "tax_settings_update_owner_accountant" on public.company_tax_settings;
create policy "tax_settings_update_admin_accountant" on public.company_tax_settings
  for update using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

drop policy if exists "invoices_delete" on public.invoices;
create policy "invoices_delete" on public.invoices
  for delete using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'office', 'accountant')
  );

drop policy if exists "invoice_payments_delete" on public.invoice_payments;
create policy "invoice_payments_delete" on public.invoice_payments
  for delete using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_payments.invoice_id
        and i.company_id = public.current_company_id()
    )
    and public.current_user_role() in ('admin', 'office', 'accountant')
  );

drop policy if exists "estimate_expenses_delete" on public.estimate_expenses;
create policy "estimate_expenses_delete" on public.estimate_expenses
  for delete using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'office', 'accountant')
  );

drop policy if exists "agent_payments_select" on public.agent_payments;
create policy "agent_payments_select" on public.agent_payments
  for select using (
    company_id = public.current_company_id()
    and (
      public.current_user_role() != 'agent'
      or agent_id = (select id from public.agents where id = agent_payments.agent_id and company_id = public.current_company_id())
    )
  );

-- New: subcontractor row-scoping, same shape as the agent policy above
-- — a subcontractor-role user can only see their own payment rows.
-- This table has no subcontractor_id join to profiles/auth.uid()
-- today, so this policy is written against subcontractors.id the same
-- way the agent one is against agents.id — whoever wires real
-- subcontractor-user accounts must also link a profile to a
-- subcontractors row (not yet modeled) before this is enforceable in
-- practice; documented here as the DB-level requirement, matching
-- PERMISSION_MATRIX.subcontractor's row-scoping caveat.
drop policy if exists "subcontractor_payments_select" on public.subcontractor_payments;
create policy "subcontractor_payments_select" on public.subcontractor_payments
  for select using (
    company_id = public.current_company_id()
    and (
      public.current_user_role() != 'subcontractor'
      or estimate_subcontractor_id in (
        select id from public.estimate_subcontractors
        where company_id = public.current_company_id()
      )
    )
  );

-- Role management: only an admin may change another user's role — same
-- requirement as before, restated for the renamed value. Still no
-- direct update policy on profiles (role changes go through the
-- SECURITY DEFINER RPCs in 20260717000200) — this is documented here
-- as a requirement for that RPC, not a new policy.
