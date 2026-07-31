-- =====================================================================
-- Add estimate-level photo support (Before/After photos for entire estimate)
-- =====================================================================

-- 1. Create estimate_photos table (Before/After photos for entire estimate)
create table if not exists public.estimate_photos (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  photo_type text not null check (photo_type in ('before', 'after')),
  storage_path text not null,
  display_order integer not null default 0,

  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.estimate_photos is
  'Before/after photos for the entire estimate (distinct from estimate_area_photos which are per-area).';

create index if not exists estimate_photos_estimate_id_idx on public.estimate_photos(estimate_id) where deleted_at is null;
create index if not exists estimate_photos_company_id_idx on public.estimate_photos(company_id) where deleted_at is null;

-- 2. Enable RLS
alter table public.estimate_photos enable row level security;

-- 3. RLS Policies (matching pattern from estimate_areas and estimate_area_photos)
drop policy if exists estimate_photos_select on public.estimate_photos;
create policy estimate_photos_select on public.estimate_photos
  for select using (company_id = public.current_company_id());

drop policy if exists estimate_photos_insert on public.estimate_photos;
create policy estimate_photos_insert on public.estimate_photos
  for insert with check (company_id = public.current_company_id());

drop policy if exists estimate_photos_update on public.estimate_photos;
create policy estimate_photos_update on public.estimate_photos
  for update using (company_id = public.current_company_id());

drop policy if exists estimate_photos_delete on public.estimate_photos;
create policy estimate_photos_delete on public.estimate_photos
  for delete using (company_id = public.current_company_id());
