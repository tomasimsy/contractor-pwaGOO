-- Lets a Business Profile (company_profiles) override the default
-- "Email Customer" message body — same override pattern as
-- portal_domain (20260824000000_company_profiles_portal_domain.sql):
-- nullable, code-level default when unset.
alter table if exists public.company_profiles
add column if not exists email_message_template text;

comment on column public.company_profiles.email_message_template is
  'This profile''s default "Email Customer" message body. Supports {clientName} and {companyName} placeholders. Null = use buildDefaultEstimateMessage''s built-in default instead.';

create or replace function public.get_company_profile(p_profile_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select row_to_json(cp)
  from (
    select id, company_id, company_name, logo_url, company_phone, company_email, company_website, company_address, footer_message, portal_domain, email_message_template
    from public.company_profiles
    where id = p_profile_id
      and deleted_at is null
  ) cp;
$$;
