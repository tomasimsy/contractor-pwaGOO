-- Lets a technician save a roof area's current fields (defect,
-- corrective action, scope, materials, default costs) as a named,
-- reusable template, and load it into a new area later — same idea as
-- the hardcoded "Emergency Roof Response" quick-start
-- (lib/estimateQuickTemplates.ts), but user-created and persisted per
-- company instead of a single fixed preset we ship.
create table if not exists public.roofing_area_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  name text not null,
  area_name text not null default '',
  quantity numeric not null default 1,
  quantity_unit text,
  defect text,
  location text,
  corrective_action text,
  materials_included text,
  scope_items text,
  material_cost numeric not null default 0,
  labor_cost numeric not null default 0,
  tax numeric not null default 0,

  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  delete_reason text
);

comment on table public.roofing_area_templates is
  'Technician-saved templates for roof area fields (RoofingAreasEditorV2) — company-scoped, applied client-side to prefill a new area, never referenced by estimate_areas itself.';

create index if not exists roofing_area_templates_company_id_idx on public.roofing_area_templates(company_id) where deleted_at is null;

alter table public.roofing_area_templates enable row level security;

drop policy if exists roofing_area_templates_select on public.roofing_area_templates;
create policy roofing_area_templates_select on public.roofing_area_templates
  for select using (company_id = public.current_company_id());

drop policy if exists roofing_area_templates_insert on public.roofing_area_templates;
create policy roofing_area_templates_insert on public.roofing_area_templates
  for insert with check (company_id = public.current_company_id());

drop policy if exists roofing_area_templates_update on public.roofing_area_templates;
create policy roofing_area_templates_update on public.roofing_area_templates
  for update using (company_id = public.current_company_id());

drop policy if exists roofing_area_templates_delete on public.roofing_area_templates;
create policy roofing_area_templates_delete on public.roofing_area_templates
  for delete using (company_id = public.current_company_id());
