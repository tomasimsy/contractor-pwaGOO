-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- Extends `projects` (created by 20260728000000_create_projects_table.sql,
-- itself still a DRAFT — CONFIRMED not yet applied to the live database:
-- an anon-key REST probe during this pass returned PGRST205 "Could not
-- find the table 'public.projects'"). This migration is written to run
-- safely either before or after that one (IF EXISTS guards), so
-- applying order doesn't matter, but 20260728000000 must ALSO be
-- applied for the table to exist at all — this file alone does not
-- create `projects`.
--
-- Two additive columns contractor-app-v2's Project type needs that the
-- original draft didn't have:
--   - location_id: the multi-location foundation (LocationService),
--     same nullable-uuid-no-FK-yet shape as profiles.location_id
--     (20260801000000_add_profiles_location_id.sql) — no `locations`
--     table exists in this schema yet either.
--   - delete_reason: the same soft-delete-reason column every other
--     financial table already has (20260729000100_soft_delete_reason.sql)
--     — that migration's table list did not include `projects` because
--     `projects` didn't exist yet when it was written.
-- =====================================================================

alter table public.projects add column if not exists location_id uuid;
alter table public.projects add column if not exists delete_reason text;

comment on column public.projects.location_id is
  'Which company location/branch this project belongs to, if any. No FK yet — see profiles.location_id''s identical comment.';
comment on column public.projects.delete_reason is
  'Required by ValidationService.validateDeleteReason at the application layer for any real user-initiated delete; nullable at the column level only as a safety net for the soft-delete trigger''s own stray-DELETE interception path, same convention as every other soft-deletable table.';
