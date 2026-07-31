-- =====================================================================
-- Add roofing estimate support to contractor-app-v2
-- Shared Supabase backend (same project as contractor-pwa)
-- =====================================================================

-- 1. Add estimate_type column to estimates table
alter table if exists public.estimates
add column if not exists estimate_type text default 'standard'
  check (estimate_type in ('standard', 'roofing'));

comment on column public.estimates.estimate_type is
  'Estimate classification: standard (line-item based) or roofing (area-based with photos).';

-- 2. Create estimate_areas table (roof areas/sections)
create table if not exists public.estimate_areas (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  area_name text not null,
  sequence_number integer not null default 0,
  scope_items text,
  area_total numeric not null default 0,

  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

comment on table public.estimate_areas is
  'Roof area/section within a roofing estimate. Parent of estimate_area_photos.';

create index if not exists estimate_areas_estimate_id_idx on public.estimate_areas(estimate_id) where deleted_at is null;
create index if not exists estimate_areas_company_id_idx on public.estimate_areas(company_id) where deleted_at is null;

-- 3. Create estimate_area_photos table (before/after photos)
create table if not exists public.estimate_area_photos (
  id uuid primary key default gen_random_uuid(),
  estimate_area_id uuid not null references public.estimate_areas(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  photo_type text not null check (photo_type in ('before', 'after')),
  storage_path text not null,
  display_order integer not null default 0,

  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.estimate_area_photos is
  'Before/after photos for roof areas in roofing estimates.';

create index if not exists estimate_area_photos_area_id_idx on public.estimate_area_photos(estimate_area_id) where deleted_at is null;
create index if not exists estimate_area_photos_company_id_idx on public.estimate_area_photos(company_id) where deleted_at is null;

-- Enable RLS on new tables (pattern from existing tables)
alter table public.estimate_areas enable row level security;
alter table public.estimate_area_photos enable row level security;

-- Assume current_company_id() function exists (from contractor-pwa migrations)
drop policy if exists estimate_areas_select on public.estimate_areas;
create policy estimate_areas_select on public.estimate_areas
  for select using (company_id = public.current_company_id());

drop policy if exists estimate_areas_insert on public.estimate_areas;
create policy estimate_areas_insert on public.estimate_areas
  for insert with check (company_id = public.current_company_id());

drop policy if exists estimate_areas_update on public.estimate_areas;
create policy estimate_areas_update on public.estimate_areas
  for update using (company_id = public.current_company_id());

drop policy if exists estimate_areas_delete on public.estimate_areas;
create policy estimate_areas_delete on public.estimate_areas
  for delete using (company_id = public.current_company_id());

drop policy if exists estimate_area_photos_select on public.estimate_area_photos;
create policy estimate_area_photos_select on public.estimate_area_photos
  for select using (company_id = public.current_company_id());

drop policy if exists estimate_area_photos_insert on public.estimate_area_photos;
create policy estimate_area_photos_insert on public.estimate_area_photos
  for insert with check (company_id = public.current_company_id());

drop policy if exists estimate_area_photos_update on public.estimate_area_photos;
create policy estimate_area_photos_update on public.estimate_area_photos
  for update using (company_id = public.current_company_id());

drop policy if exists estimate_area_photos_delete on public.estimate_area_photos;
create policy estimate_area_photos_delete on public.estimate_area_photos
  for delete using (company_id = public.current_company_id());
