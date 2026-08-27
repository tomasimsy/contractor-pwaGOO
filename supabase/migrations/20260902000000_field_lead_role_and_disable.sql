-- Two things needed for the Team invite/manage feature:
--
-- 1. A new role, "field_lead" — someone who runs one job on-site but
--    isn't a full internal team member with company-wide access. Row-
--    level "only see MY assigned job" scoping is a separate, later
--    piece (needs its own RLS work on projects/estimates); this
--    migration only adds the role value itself so a profiles row can
--    legally hold it.
--
-- 2. A disable mechanism — profiles.disabled_at, same soft-delete
--    convention (nullable timestamptz) used everywhere else in this
--    schema, rather than a new boolean/enum. Enforced at the ONE
--    choke point every RLS policy in the app already depends on
--    (current_company_id()) — see that function below — so disabling
--    a user immediately blocks every table's RLS for them, with zero
--    changes needed to any individual table's policies.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['admin','office','sales','project_manager','accountant','subcontractor','agent','field_lead']));

alter table public.profiles add column if not exists disabled_at timestamptz;

comment on column public.profiles.disabled_at is
  'Set to revoke a user''s access without deleting their account or orphaning FKs (created_by, assigned_user_id, etc.) that point at their profile row. Enforced via current_company_id() below, not a per-table check.';

-- A disabled caller's company_id resolves to NULL, so `company_id =
-- public.current_company_id()` — the predicate every RLS policy in
-- this app already uses — never matches any row for them, for any
-- table, automatically. The JWT-claims fallback path is dead in
-- practice (nothing in the app ever sets user_metadata.company_id),
-- so gating only the profiles-table branch is sufficient today; if
-- that fallback is ever actually populated, it will need the same
-- disabled_at check added.
create or replace function public.current_company_id() returns uuid
    language sql stable
    as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'company_id')::uuid,
    (select company_id from public.profiles where id = auth.uid() and disabled_at is null limit 1)
  )
$$;

-- Team page needs to show/toggle disabled state — add it to the one
-- existing read path rather than a second query. DROP first: adding a
-- column to a RETURNS TABLE(...) signature is a return-type change,
-- which CREATE OR REPLACE cannot do on its own (Postgres error 42P13).
drop function if exists public.list_company_members();
create function public.list_company_members() returns table(id uuid, email text, role text, disabled_at timestamptz)
    language sql security definer
    set search_path to 'public'
    as $$
  select p.id, u.email, p.role, p.disabled_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.company_id = public.current_company_id();
$$;
