-- DRAFT — review before running.
-- Small additive fields for the Subcontractors/Agents management pages.
alter table public.subcontractors add column if not exists contact_person text;
alter table public.subcontractors add column if not exists is_active boolean not null default true;
alter table public.agents add column if not exists commission_rate numeric;
