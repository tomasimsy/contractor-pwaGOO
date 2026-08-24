-- =====================================================================
-- Business Profiles: customer-facing portal domain, stored on the
-- profile itself instead of hardcoded in source code.
--
-- Replaces lib/portalDomain.ts's earlier hardcoded profile-id -> domain
-- map, which broke every time a Business Profile was deleted and
-- recreated in Settings (a normal, expected action — profile ids are
-- not stable across recreation). Now the domain lives with the row it
-- describes: delete/recreate a profile, just re-enter its domain in
-- Settings -> Business Profiles, no code change or redeploy needed.
-- =====================================================================

alter table if exists public.company_profiles
add column if not exists portal_domain text;

comment on column public.company_profiles.portal_domain is
  'This profile''s customer-facing base URL (e.g. https://osrpros.com) for estimate/invoice portal links. Null = no override; the app''s fixed default origin is used instead. Validated at the application layer (HTTPS only, no path/query/fragment, no local/private hostnames) — see lib/portalDomainValidation.ts.';

-- No RLS policy change: company_profiles' existing whole-row policies
-- (company_id = current_company_id() for select/insert/update/delete)
-- already cover every column, including this new one.

-- get_company_profile is OUR OWN function (from
-- 20260821010000_company_profiles.sql, tracked in this repo's own
-- migration history) — unlike get_customer_portal/get_public_invoice,
-- which live outside tracked migrations, this one is safe to replace
-- in place rather than needing a second function.
create or replace function public.get_company_profile(p_profile_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select row_to_json(cp)
  from (
    select id, company_id, company_name, logo_url, company_phone, company_email, company_website, company_address, footer_message, portal_domain
    from public.company_profiles
    where id = p_profile_id
      and deleted_at is null
  ) cp;
$$;
