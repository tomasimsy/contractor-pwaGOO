-- =====================================================================
-- Estimate Roof V2: per-area line items + unit field on line items
-- Additive only — existing estimate_areas.area_total and estimate_items
-- stay untouched, so the current Estimate / Roofing tab keep working
-- unmodified against their existing contract.
-- =====================================================================

-- 1. Add nullable `unit` column to estimate_items (shared by Standard
--    and Roofing V2 line items — avoids a duplicate enum in two places).
alter table if exists public.estimate_items
add column if not exists unit text
  check (unit is null or unit in ('EA', 'SF', 'SQFT', 'SQ', 'LF', 'FT', 'HR', 'DAY', 'LS'));

comment on column public.estimate_items.unit is
  'Optional unit of measure for the line item (EA, SF, SQFT, SQ, LF, FT, HR, DAY, LS). Null for legacy rows.';

-- 2. Create estimate_area_line_items table (per-roofing-area line items)
create table if not exists public.estimate_area_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_area_id uuid not null references public.estimate_areas(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  category text not null default 'material' check (category in ('material', 'labor', 'other')),
  name text not null,
  description text,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  unit text check (unit is null or unit in ('EA', 'SF', 'SQFT', 'SQ', 'LF', 'FT', 'HR', 'DAY', 'LS')),
  total numeric not null default 0,
  taxable boolean not null default true,
  sequence_number integer not null default 0,

  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

comment on table public.estimate_area_line_items is
  'Line items scoped to a single estimate_areas row (Estimate Roof V2). Mirrors estimate_items structure. Does not affect estimate_areas.area_total, which remains a separate, manually-set flat field used by the existing (V1) Roofing tab.';

create index if not exists estimate_area_line_items_area_id_idx on public.estimate_area_line_items(estimate_area_id) where deleted_at is null;
create index if not exists estimate_area_line_items_company_id_idx on public.estimate_area_line_items(company_id) where deleted_at is null;

alter table public.estimate_area_line_items enable row level security;

drop policy if exists estimate_area_line_items_select on public.estimate_area_line_items;
create policy estimate_area_line_items_select on public.estimate_area_line_items
  for select using (company_id = public.current_company_id());

drop policy if exists estimate_area_line_items_insert on public.estimate_area_line_items;
create policy estimate_area_line_items_insert on public.estimate_area_line_items
  for insert with check (company_id = public.current_company_id());

drop policy if exists estimate_area_line_items_update on public.estimate_area_line_items;
create policy estimate_area_line_items_update on public.estimate_area_line_items
  for update using (company_id = public.current_company_id());

drop policy if exists estimate_area_line_items_delete on public.estimate_area_line_items;
create policy estimate_area_line_items_delete on public.estimate_area_line_items
  for delete using (company_id = public.current_company_id());

-- 3. Add optional measurements/inspection/notes fields to estimate_areas
--    for Estimate Roof V2 (nullable — existing V1 Roofing tab rows and
--    UI are unaffected since it never reads/writes these columns).
alter table if exists public.estimate_areas
add column if not exists measurements text,
add column if not exists inspection_notes text,
add column if not exists notes text;

comment on column public.estimate_areas.measurements is
  'Optional free-text measurements for this roof area (Estimate Roof V2). Null for legacy rows.';
comment on column public.estimate_areas.inspection_notes is
  'Optional inspection/condition notes for this roof area (Estimate Roof V2). Null for legacy rows.';
comment on column public.estimate_areas.notes is
  'Optional general notes for this roof area (Estimate Roof V2). Null for legacy rows.';
