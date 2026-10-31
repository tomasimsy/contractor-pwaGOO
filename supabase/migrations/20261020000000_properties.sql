-- =====================================================================
-- Properties — ADDITIVE ONLY.
--
-- A property is a physical address a client owns (a house, a building).
-- Before this migration, the address existed only as free text repeated
-- on each project. This migration adds a real record for it.
--
-- What this migration does NOT do:
--   * It does not change, drop or retype any existing column.
--   * It does not change projects.address. That text stays as the
--     snapshot printed on invoices, PDFs and portal pages, so an old
--     document never changes when a property is edited later.
--   * It does not touch any financial table or calculation.
--   * Projects with no client, or with a blank address, keep
--     property_id NULL. Nothing is forced.
--
-- Backfill rule: within one company and one client, projects whose
-- address matches (case and extra spaces ignored) share one property.
-- The property's street text is the first address seen in that group.
-- ---------------------------------------------------------------------

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  client_id uuid not null references public.clients(id),
  nickname text,
  street text,
  city text,
  state text,
  zip text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  deleted_by uuid,
  deleted_at timestamptz,
  delete_reason text
);

comment on table public.properties is
  'A physical address owned by a client. Projects (jobs) reference it through projects.property_id. Named "property" rather than "location" because locations already means the company''s own branches (projects.location_id).';

create index if not exists properties_company_id_idx
  on public.properties (company_id) where deleted_at is null;

create index if not exists properties_client_id_idx
  on public.properties (client_id) where deleted_at is null;

alter table public.projects
  add column if not exists property_id uuid references public.properties(id) on delete set null;

create index if not exists projects_property_id_idx
  on public.projects (property_id) where deleted_at is null;

comment on column public.projects.property_id is
  'The property this job is performed at. Nullable: projects created before properties existed, projects with no client, and projects with no address keep NULL. projects.address remains the printed snapshot and is not derived from this column.';

-- Row-level security: same company-scoped pattern as projects.
alter table public.properties enable row level security;

drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties
  for select using (
    company_id = public.current_company_id()
    and coalesce(public.current_user_role(), '') <> 'field_lead'
  );

drop policy if exists properties_insert on public.properties;
create policy properties_insert on public.properties
  for insert with check (company_id = public.current_company_id());

drop policy if exists properties_update on public.properties;
create policy properties_update on public.properties
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists properties_delete on public.properties;
create policy properties_delete on public.properties
  for delete using (company_id = public.current_company_id());

-- ---------------------------------------------------------------------
-- Backfill existing projects into properties.
-- Normalized address key: lower-case, trimmed, runs of spaces collapsed.
-- ---------------------------------------------------------------------

create temp table if not exists _property_backfill_map on commit drop as
select
  company_id,
  client_id,
  lower(btrim(regexp_replace(address, '\s+', ' ', 'g'))) as address_key,
  min(btrim(address)) as street,
  gen_random_uuid() as property_id
from public.projects
where client_id is not null
  and btrim(coalesce(address, '')) <> ''
group by company_id, client_id, lower(btrim(regexp_replace(address, '\s+', ' ', 'g')));

insert into public.properties (id, company_id, client_id, street)
select property_id, company_id, client_id, street
from _property_backfill_map
on conflict (id) do nothing;

update public.projects p
set property_id = m.property_id
from _property_backfill_map m
where p.property_id is null
  and p.company_id = m.company_id
  and p.client_id = m.client_id
  and lower(btrim(regexp_replace(p.address, '\s+', ' ', 'g'))) = m.address_key;
