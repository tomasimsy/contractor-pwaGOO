-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- DATABASE_INTEGRITY_AUDIT.md finding #4. estimates.old_status has been
-- dead since 20260719_add_estimate_status_lifecycle.sql renamed the
-- original `status` column to `old_status` and introduced the new
-- `estimate_status` enum column (`status`) backfilled from it. No
-- migration or app code reads old_status since. Before running this
-- against production, grep both codebases for "old_status" to confirm
-- no report/query still depends on it.
-- =====================================================================

alter table public.estimates drop column if exists old_status;
