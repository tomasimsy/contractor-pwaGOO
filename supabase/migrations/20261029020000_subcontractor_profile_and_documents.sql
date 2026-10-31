-- =====================================================================
-- Subcontractor profile + compliance documents.
--
-- 1. More profile fields on `subcontractors`. The table already has
--    company_name (legal business name), email and notes; this adds
--    the rest of what a roofing/renovation company keeps on a sub:
--    mailing address, entity type (decides who gets a 1099), the LAST
--    FOUR of the EIN/SSN only, contractor license, and how they are paid.
--
--    The full EIN/SSN is deliberately NOT stored in a column: it lives
--    on the uploaded W-9 PDF, in the private bucket. (The legacy
--    subcontractor_tax_info.w9_ein column is not used by the app.)
--
-- 2. `subcontractor_documents`: one row per uploaded file (W-9, general
--    liability and workers' comp certificates, license, agreement...),
--    with its issue and expiration dates and, for insurance, the
--    carrier, policy number and coverage. The file itself lives in the
--    existing private `company-documents` bucket at
--      documents/<company_id>/subcontractors/<subcontractor_id>/<ts>.<ext>
--    Element 2 of that path is the company id, so the bucket's existing
--    storage policies (20260805000100) already scope it per company. No
--    new storage policy is needed.
--
-- ADDITIVE and idempotent: safe to re-run.
-- =====================================================================

begin;

alter table public.subcontractors
  add column if not exists address text,
  add column if not exists entity_type text,
  add column if not exists tax_id_last4 text,
  add column if not exists license_number text,
  add column if not exists license_state text,
  add column if not exists payment_method text,
  add column if not exists pay_to_name text;

alter table public.subcontractors drop constraint if exists subcontractors_entity_type_check;
alter table public.subcontractors add constraint subcontractors_entity_type_check
  check (entity_type is null or entity_type in ('sole_prop', 'llc', 's_corp', 'c_corp', 'partnership', 'other'));

alter table public.subcontractors drop constraint if exists subcontractors_tax_id_last4_check;
alter table public.subcontractors add constraint subcontractors_tax_id_last4_check
  check (tax_id_last4 is null or tax_id_last4 ~ '^[0-9]{4}$');

comment on column public.subcontractors.entity_type is 'sole_prop | llc | s_corp | c_corp | partnership | other. Corporations usually do not get a 1099.';
comment on column public.subcontractors.tax_id_last4 is 'Last four digits of the EIN/SSN only. The full number stays on the W-9 file.';

create table if not exists public.subcontractor_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,

  doc_type text not null check (doc_type in (
    'w9', 'general_liability', 'workers_comp', 'wc_exemption',
    'license', 'agreement', 'auto_insurance', 'other'
  )),
  name text not null,
  storage_path text not null,
  file_type text not null,
  file_size bigint not null default 0,

  issued_date date,
  expiration_date date,
  -- Insurance certificates only.
  carrier text,
  policy_number text,
  coverage_amount numeric(14, 2),
  additional_insured boolean,
  notes text,

  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  delete_reason text
);

comment on table public.subcontractor_documents is
  'Compliance documents per subcontractor (W-9, insurance certificates, license, agreement). Metadata row per file; the file lives in the company-documents bucket at storage_path.';

create index if not exists subcontractor_documents_sub_idx
  on public.subcontractor_documents(subcontractor_id) where deleted_at is null;
create index if not exists subcontractor_documents_company_idx
  on public.subcontractor_documents(company_id) where deleted_at is null;

alter table public.subcontractor_documents enable row level security;

drop policy if exists subcontractor_documents_select on public.subcontractor_documents;
create policy subcontractor_documents_select on public.subcontractor_documents
  for select using (company_id = public.current_company_id());

drop policy if exists subcontractor_documents_insert on public.subcontractor_documents;
create policy subcontractor_documents_insert on public.subcontractor_documents
  for insert with check (company_id = public.current_company_id());

drop policy if exists subcontractor_documents_update on public.subcontractor_documents;
create policy subcontractor_documents_update on public.subcontractor_documents
  for update using (company_id = public.current_company_id());

drop policy if exists subcontractor_documents_delete on public.subcontractor_documents;
create policy subcontractor_documents_delete on public.subcontractor_documents
  for delete using (company_id = public.current_company_id());

-- Employees never see subcontractor records (same rule as
-- 20261021010000_restrict_employee_data.sql applies to `subcontractors`).
drop policy if exists employee_block on public.subcontractor_documents;
create policy employee_block on public.subcontractor_documents
  as restrictive for all to authenticated
  using (coalesce(public.current_user_role(), '') <> 'employee')
  with check (coalesce(public.current_user_role(), '') <> 'employee');

commit;
