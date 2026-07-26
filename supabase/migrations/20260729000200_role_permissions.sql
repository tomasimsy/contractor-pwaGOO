-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Reliability system, part 3:
-- permissions. Expands profiles.role from ('owner','member') to the
-- five roles the business actually has (owner, manager, estimator,
-- accountant, agent), and enforces them at the DATABASE level via RLS
-- — one of three required layers (service level:
-- contractor-app-v2/lib/services/permissions.ts +
-- validationService.ts's validatePermission; application level: UI
-- guards reading the same role). See RELIABILITY.md for how the three
-- layers relate — this file is only the DB layer, and DB-level denial
-- must hold even if the other two have a bug.
--
-- Existing 'member' rows are mapped to 'estimator' as a safe, narrow
-- default (view-heavy, limited write access) rather than the broadest
-- non-owner role ('manager') — widening someone's access silently
-- during a migration is worse than under-granting and having them ask
-- to be upgraded. Flag this mapping for the business owner to review
-- and correct per real team member before relying on it.
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'estimator' where role = 'member';

alter table public.profiles
  add constraint profiles_role_check check (role in ('owner', 'manager', 'estimator', 'accountant', 'agent'));

comment on column public.profiles.role is
  'One of: owner, manager, estimator, accountant, agent. Mirrors the Role type and PERMISSION_MATRIX in contractor-app-v2/lib/services/permissions.ts — the two must be kept in sync by hand; there is no shared source of truth between SQL and TypeScript for this list.';

-- ---------------------------------------------------------------------
-- Helper: the caller's own role, same SECURITY DEFINER pattern as
-- current_company_id() (20260713000000_company_rls_lockdown.sql) so it
-- can be used inside every policy below without recursive RLS issues.
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Role-gated policies. Existing company-scoped policies (company_id =
-- current_company_id()) already handle tenant isolation — these ADD an
-- AND'd role condition on top for the specific operations where role
-- actually restricts access, matching permissions.ts's PERMISSION_MATRIX.
-- Tables/operations not listed here keep their existing company-only
-- policy: every role can do everything the old model allowed, this
-- migration only ADDS restrictions, it doesn't relax anything.
-- ---------------------------------------------------------------------

-- Tax settings: owner + accountant only (matches PERMISSION_MATRIX:
-- manager/estimator/agent have no tax_settings entry at all = denied).
drop policy if exists "Users can update tax settings for their company" on public.company_tax_settings;
create policy "tax_settings_update_owner_accountant" on public.company_tax_settings
  for update using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('owner', 'accountant')
  );

-- Deleting invoices/payments/expenses: owner, manager, accountant —
-- estimator and agent can view (existing select policy, unchanged) but
-- never delete a financial record. This is the DB-level backstop for
-- validatePermission('estimator', 'invoice', 'delete') already
-- returning false at the service level — a bug in that check must not
-- be the only thing standing between an estimator and deleting an
-- invoice.
drop policy if exists "invoices_delete" on public.invoices;
create policy "invoices_delete" on public.invoices
  for delete using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('owner', 'manager', 'accountant')
  );

drop policy if exists "invoice_payments_delete" on public.invoice_payments;
create policy "invoice_payments_delete" on public.invoice_payments
  for delete using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_payments.invoice_id
        and i.company_id = public.current_company_id()
    )
    and public.current_user_role() in ('owner', 'manager', 'accountant')
  );

drop policy if exists "estimate_expenses_delete" on public.estimate_expenses;
create policy "estimate_expenses_delete" on public.estimate_expenses
  for delete using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('owner', 'manager', 'accountant')
  );

-- Agents: read-only everywhere, and only their OWN payment/assignment
-- rows — row-level scoping on top of the role check, matching
-- permissions.ts's note that the matrix says "can an agent view
-- agent_payment at all" while the DB policy says "only their own rows."
drop policy if exists "agent_payments_select" on public.agent_payments;
create policy "agent_payments_select" on public.agent_payments
  for select using (
    company_id = public.current_company_id()
    and (
      public.current_user_role() != 'agent'
      or agent_id = (select id from public.agents where id = agent_payments.agent_id and company_id = public.current_company_id())
    )
  );

-- Role management (profiles.role itself): only an owner may change
-- another user's role — prevents a manager from promoting themselves
-- or a teammate to owner. This is the DB-level twin of
-- PERMISSION_MATRIX.owner.user_roles being the only role with that
-- entry at all.
-- (profiles has no direct update policy at all today — role changes go
-- through the SECURITY DEFINER RPCs in 20260717000200 — so this is
-- documented here as a requirement for whoever writes the role-change
-- RPC, not a new policy: that RPC must check
-- public.current_user_role() = 'owner' before writing role.)
