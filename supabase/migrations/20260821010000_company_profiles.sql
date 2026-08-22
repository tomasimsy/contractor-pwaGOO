-- =====================================================================
-- Brand/business profiles — one legal company (companies/company_id,
-- unchanged, still the ONLY financial/legal/RLS identity), able to
-- present as more than one customer-facing brand on estimates/invoices
-- (e.g. "One Square Roofing" vs "OSRPros"), without duplicating the
-- company, financial data, or any calculation.
--
-- Deliberately reuses company_settings' own field vocabulary (see
-- lib/company.ts's CompanySettings type) — only the fields that
-- actually vary by brand: name, logo, phone, email, website, address,
-- footer message. NOT included, and never overridden per-profile:
-- tax_id, license_number, insurance_policy, terms_conditions,
-- warranty_text, default_deposit_percentage — those remain company-
-- wide/legal facts, not branding.
--
-- `profile_id` is added as a NULLABLE column on estimates/invoices.
-- NULL is not "needs backfilling" — it means "render exactly as
-- today, using company_settings/companies directly" (see
-- lib/company.ts's getCompanySettingsByCompanyId, extended in a
-- separate commit to accept an optional profileId). Every existing
-- estimate/invoice is already in this state; no backfill migration
-- needed for the feature to be safe.
--
-- Three new SECURITY DEFINER functions, none of which touch
-- `get_customer_portal` / `get_public_invoice` in place — both already
-- exist live on this Supabase project outside this repo's tracked
-- migration history (see 20260730130000_change_order_portal_approval.sql's
-- header for the same reasoning), so this migration cannot safely
-- introspect/rewrite them blind. Same pattern as
-- get_portal_change_orders/get_portal_estimate_photos: new, narrowly-
-- scoped reads instead.
-- =====================================================================

create table if not exists public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  company_name text not null,
  logo_url text,
  company_phone text,
  company_email text,
  company_website text,
  company_address text,
  footer_message text,

  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  delete_reason text
);

comment on table public.company_profiles is
  'Customer-facing brand identities for one legal company (e.g. a dba operating under a second name). Selected per estimate/invoice via their nullable profile_id column; never duplicates company_id, financial data, or any calculation.';

create index if not exists company_profiles_company_id_idx on public.company_profiles(company_id) where deleted_at is null;

alter table public.company_profiles enable row level security;

-- Same shape as every other company-scoped table (estimate_photos,
-- estimate_areas, etc.) — staff-only, scoped to their own company.
-- Anonymous/customer access goes through the SECURITY DEFINER
-- functions below, never a direct table read.
drop policy if exists company_profiles_select on public.company_profiles;
create policy company_profiles_select on public.company_profiles
  for select using (company_id = public.current_company_id());

drop policy if exists company_profiles_insert on public.company_profiles;
create policy company_profiles_insert on public.company_profiles
  for insert with check (company_id = public.current_company_id());

drop policy if exists company_profiles_update on public.company_profiles;
create policy company_profiles_update on public.company_profiles
  for update using (company_id = public.current_company_id());

drop policy if exists company_profiles_delete on public.company_profiles;
create policy company_profiles_delete on public.company_profiles
  for delete using (company_id = public.current_company_id());

-- Nullable, additive — no backfill, no default value, no existing
-- constraint touched. Same "alter table if exists ... add column if
-- not exists" shape as estimate_type's own addition.
alter table if exists public.estimates
add column if not exists profile_id uuid references public.company_profiles(id) on delete set null;

alter table if exists public.invoices
add column if not exists profile_id uuid references public.company_profiles(id) on delete set null;

comment on column public.estimates.profile_id is
  'Which brand/business profile this estimate presents as to the customer (PDF/email/portal). Null = the company''s own default identity, unchanged from today.';
comment on column public.invoices.profile_id is
  'Copied from the source estimate at invoice creation (see InvoiceService.createFromEstimate) so an estimate and the invoice it produces always present the same brand. Null = the company''s own default identity, unchanged from today.';

-- Unconditional by-id read: access is already gated upstream by the
-- caller having validated the parent estimate/invoice via its own
-- customer_token (or staff auth) before ever learning its profile_id —
-- same security shape getCompanySettingsByCompanyId already has for
-- company_settings/companies (a plain by-id read, no token check of
-- its own). Branding fields (name/phone/email/logo/address) carry the
-- same non-sensitive posture as company_settings already does.
create or replace function public.get_company_profile(p_profile_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select row_to_json(cp)
  from (
    select id, company_id, company_name, logo_url, company_phone, company_email, company_website, company_address, footer_message
    from public.company_profiles
    where id = p_profile_id
      and deleted_at is null
  ) cp;
$$;

grant execute on function public.get_company_profile(uuid) to anon, authenticated;

-- get_customer_portal doesn't (and can't safely be made to) return
-- profile_id — this is the one-column read the portal page needs to
-- learn it, scoped the same way get_portal_change_orders is.
create or replace function public.get_portal_estimate_profile_id(p_token text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select profile_id
  from public.estimates
  where customer_token = p_token
    and deleted_at is null;
$$;

grant execute on function public.get_portal_estimate_profile_id(text) to anon, authenticated;

-- Same for the public invoice page / get_public_invoice.
create or replace function public.get_portal_invoice_profile_id(p_token text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select profile_id
  from public.invoices
  where customer_token = p_token
    and deleted_at is null;
$$;

grant execute on function public.get_portal_invoice_profile_id(text) to anon, authenticated;
