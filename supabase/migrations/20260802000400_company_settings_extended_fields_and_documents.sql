-- =====================================================================
-- Company Settings page (/settings/company) + Company Documents
-- (/settings/company/documents).
--
-- Extends the EXISTING `company_settings` table (already read by
-- lib/company.ts for PDFs/portal — company_name/dba/company_address/
-- company_phone/company_email/company_website/logo_url/tax_id/
-- license_number/etc. already exist there) with the remaining fields
-- the Company Settings page needs, rather than creating a second
-- company-info table. Only genuinely new fields are added.
-- =====================================================================

alter table public.company_settings
  add column if not exists business_type text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists country text,
  add column if not exists insurance_policy text,
  add column if not exists brand_color text,
  add column if not exists notes text,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.company_settings.business_type is 'e.g. LLC, Sole Proprietorship, S-Corp — free text, no fixed enum needed yet.';
comment on column public.company_settings.brand_color is 'Hex color (e.g. #1E40AF) used for future branded documents/portal theming.';

-- =====================================================================
-- Company Documents — business documents (LLC/EIN letter/insurance/W-9/
-- etc.), soft-deletable, one row per uploaded file.
-- =====================================================================
create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  category text not null check (category in (
    'llc_articles', 'ein_letter', 'irs_documents', 'w9', 'form_1099',
    'business_license', 'contractor_license', 'insurance', 'workers_comp',
    'bond', 'banking', 'tax_documents', 'other'
  )),
  name text not null,
  storage_path text not null,
  file_type text not null,
  file_size bigint not null default 0,
  expiration_date date,

  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  delete_reason text
);

comment on table public.company_documents is
  'Business documents (licenses, insurance, tax forms, etc.) — metadata row per file; the file itself lives in the company-documents storage bucket at storage_path.';

create index if not exists company_documents_company_id_idx on public.company_documents(company_id) where deleted_at is null;
create index if not exists company_documents_category_idx on public.company_documents(company_id, category) where deleted_at is null;

alter table public.company_documents enable row level security;

drop policy if exists company_documents_select on public.company_documents;
create policy company_documents_select on public.company_documents
  for select using (company_id = public.current_company_id());

drop policy if exists company_documents_insert on public.company_documents;
create policy company_documents_insert on public.company_documents
  for insert with check (company_id = public.current_company_id());

drop policy if exists company_documents_update on public.company_documents;
create policy company_documents_update on public.company_documents
  for update using (company_id = public.current_company_id());

drop policy if exists company_documents_delete on public.company_documents;
create policy company_documents_delete on public.company_documents
  for delete using (company_id = public.current_company_id());

-- Storage bucket for the actual files — private (not public), same
-- pattern as the existing `estimate-photos` bucket. Idempotent: safe to
-- re-run.
insert into storage.buckets (id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do nothing;
