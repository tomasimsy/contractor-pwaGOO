-- DRAFT — review before running.
--
-- profiles.role already exists in the live schema (not added by this
-- migration) but every existing row currently has role = 'admin' — a
-- value from before this multi-tenant role model existed. Nothing in
-- the app today branches on role, so every current 'admin' is
-- functionally the sole owner of their company; map them to 'owner'
-- (preserves their access exactly, just adds the ability to manage
-- teammates) rather than inventing a third role value to carry
-- forward. New rows created via the create_company_and_owner /
-- redeem_company_invite RPCs (next migration) always set role
-- explicitly to 'owner' or 'member'.

update public.profiles set role = 'owner' where role = 'admin';

alter table public.profiles alter column role set default 'owner';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('owner', 'member'));
  end if;
end $$;

-- profiles has RLS enabled (from 20260713000000_company_rls_lockdown.sql)
-- but no policy was ever added for it — meaning nobody, not even the
-- owning user, can currently select their own row via the client. Add
-- exactly one SELECT policy: a user can see their own row, and can see
-- teammates' rows (same company_id) so the Team page can list members.
drop policy if exists profiles_select_own_or_company on public.profiles;
create policy profiles_select_own_or_company on public.profiles
  for select using (
    id = auth.uid() or company_id = public.current_company_id()
  );

-- Deliberately NO insert/update policy on profiles. Every write to
-- company_id/role must go through the SECURITY DEFINER RPCs in
-- 20260717000200_company_onboarding_rpcs.sql — this is what prevents a
-- Member from editing their own row to grant themselves role='owner'
-- or move to a different company.
