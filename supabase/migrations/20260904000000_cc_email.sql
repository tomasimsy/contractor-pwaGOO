-- A distinct, configurable BCC address for outgoing customer emails
-- (estimate sends and payment receipts) — separate from company_email
-- (the actual From/Reply-To address). Same company-wide default +
-- per-profile override shape every other branding field already has
-- (mergeProfileOverrides in lib/company.ts).
--
-- Distinct from the existing "bcc the resolved from-address itself"
-- behavior in sendEstimateEmail.ts (so a sent copy lands in that
-- mailbox) — this is a SEPARATE, explicitly-configured recipient,
-- e.g. an office/accounting inbox that isn't the sending address at all.

alter table public.company_settings add column if not exists bcc_email text;
alter table public.company_profiles add column if not exists bcc_email text;

comment on column public.company_settings.bcc_email is
  'Company-wide default BCC recipient for customer emails (estimate sends, payment receipts). Null = no extra BCC beyond the existing "bcc the sending address itself" behavior. Overridable per Business Profile.';
comment on column public.company_profiles.bcc_email is
  'This profile''s own BCC override for customer emails — null falls back to company_settings.bcc_email.';

-- get_company_profile returns `json` (not a fixed RETURNS TABLE row
-- type), so CREATE OR REPLACE can add a column to the select list
-- without the "cannot change return type" error list_company_members
-- hit earlier — no DROP FUNCTION needed here.
create or replace function public.get_company_profile(p_profile_id uuid) returns json
    language sql stable security definer
    set search_path to 'public'
    as $$
  select row_to_json(cp)
  from (
    select id, company_id, company_name, logo_url, company_phone, company_email, bcc_email, company_website, company_address, footer_message, portal_domain, email_message_template
    from public.company_profiles
    where id = p_profile_id
      and deleted_at is null
  ) cp;
$$;
