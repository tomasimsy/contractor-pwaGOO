-- Customizable "Payment received" email body — same pattern as
-- company_profiles.email_message_template (the estimate-send message),
-- profile-only (no company-wide default UI, matching that field's
-- precedent). Null = use the built-in default sentence in
-- app/api/payments/receipt/route.ts.

alter table public.company_profiles add column if not exists payment_receipt_message_template text;

comment on column public.company_profiles.payment_receipt_message_template is
  'This profile''s custom "Payment received" email body. Supports {clientName}, {amount}, {documentNumber}, {paymentDate} placeholders. Null = use the built-in default sentence.';

-- get_company_profile returns `json`, not a fixed RETURNS TABLE row
-- type, so this column can be added via CREATE OR REPLACE without the
-- "cannot change return type" error a RETURNS TABLE function would hit.
create or replace function public.get_company_profile(p_profile_id uuid) returns json
    language sql stable security definer
    set search_path to 'public'
    as $$
  select row_to_json(cp)
  from (
    select id, company_id, company_name, logo_url, company_phone, company_email, bcc_email, company_website, company_address, footer_message, portal_domain, email_message_template, payment_receipt_message_template
    from public.company_profiles
    where id = p_profile_id
      and deleted_at is null
  ) cp;
$$;
