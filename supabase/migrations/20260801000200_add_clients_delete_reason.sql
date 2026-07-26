-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- `clients` already has created_by/updated_by/updated_at
-- (20260715000000_add_audit_columns.sql's table list includes
-- 'clients') and deleted_at/deleted_by (soft-delete trigger's table
-- list also includes 'clients') — but 20260729000100_soft_delete_reason.sql's
-- table list did NOT include clients, so it's the one soft-deletable
-- table in this schema still missing delete_reason. Closing that gap
-- for contractor-app-v2's ClientService, which requires a reason on
-- every delete via ValidationService.validateDeleteReason, same as
-- every other entity service.
-- =====================================================================

alter table public.clients add column if not exists delete_reason text;

comment on column public.clients.delete_reason is
  'Required by ValidationService.validateDeleteReason for any real user-initiated delete — see the identical column/comment on estimates/invoices/projects (20260729000100_soft_delete_reason.sql, 20260801000100_add_projects_location_id_and_delete_reason.sql).';
