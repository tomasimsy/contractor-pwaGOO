-- =====================================================================
-- Fix schema drift on estimate_areas: the original roofing migration
-- (20260802000100_roofing_estimate_support.sql) used
-- `create table if not exists public.estimate_areas (...)` including
-- created_by/updated_by/deleted_by/delete_reason — but a table by that
-- name already existed (created some other way, without those columns),
-- so `IF NOT EXISTS` silently no-op'd and those columns were never
-- added. Confirmed live via direct column probes: created_by,
-- updated_by, deleted_by, delete_reason all return "column does not
-- exist" against the real database, despite the migration file
-- describing them.
--
-- This matters now because: (1) roofingAreaService's mapAreaRow()/
-- create()/update() already read/write these fields (silently getting
-- undefined on read, which is why the gap went unnoticed), and
-- (2) the generic log_audit_change() trigger attached to estimate_areas
-- references NEW.created_by directly — INSERT fails with
-- 42703 "record new has no field created_by" the moment a caller
-- actually tries to create a row, which is what surfaced this while
-- testing Estimate Roof V2's "Save Area" flow.
-- =====================================================================

alter table if exists public.estimate_areas
add column if not exists created_by uuid references public.profiles(id) on delete set null,
add column if not exists updated_by uuid references public.profiles(id) on delete set null,
add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
add column if not exists delete_reason text;

comment on column public.estimate_areas.created_by is 'Profile that created this row. Backfilled null for pre-existing rows.';
comment on column public.estimate_areas.updated_by is 'Profile that last updated this row. Backfilled null for pre-existing rows.';
comment on column public.estimate_areas.deleted_by is 'Profile that soft-deleted this row, if any.';
comment on column public.estimate_areas.delete_reason is 'Required reason text captured on soft-delete (see ValidationService.validateDeleteReason).';
