-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- DATABASE_INTEGRITY_AUDIT.md finding #6, and confirmed relevant by
-- contractor-app-v2's stress test suite (STRESS_TEST_REPORT.md): both
-- codebases generate estimate/invoice numbers by counting existing
-- rows and using count+1, which is not concurrency-safe. There is
-- currently no DB-level constraint to catch a race producing a
-- duplicate number — this adds one, so a race becomes a visible,
-- retryable constraint-violation error instead of a silent duplicate.
--
-- BEFORE RUNNING: check for existing duplicates that would make this
-- constraint fail to apply —
--   select company_id, estimate_number, count(*) from public.estimates
--     where estimate_number is not null and deleted_at is null
--     group by 1, 2 having count(*) > 1;
--   select company_id, invoice_number, count(*) from public.invoices
--     where invoice_number is not null and deleted_at is null
--     group by 1, 2 having count(*) > 1;
-- If either returns rows, resolve those duplicates manually first.
--
-- Both tables have a redundant `is_deleted` boolean alongside
-- `deleted_at`, but `is_deleted` is NOT what these predicates should
-- key off: the real delete write path (lib/utils/softDelete.ts's
-- softDeleteEstimate/softDeleteInvoice) only ever sets `deleted_at` —
-- nothing in the codebase ever sets `is_deleted = true` for either
-- table (only app/deleted/page.tsx's restore flow touches it, and only
-- to reset it back to false). Keying the invoices predicate off
-- `is_deleted` (an earlier draft of this file did) would make it
-- effectively non-partial in practice — soft-deleted invoices would
-- never be excluded, since is_deleted never actually flips to true —
-- defeating the "reissue after delete" intent below. Both predicates
-- use `deleted_at`, matching what's actually written on delete.
--
-- Partial (deleted_at-excluding) so a soft-deleted record's number
-- doesn't block reissuing it.
-- =====================================================================

create unique index if not exists estimates_company_number_unique
  on public.estimates (company_id, estimate_number)
  where estimate_number is not null and deleted_at is null;

create unique index if not exists invoices_company_number_unique
  on public.invoices (company_id, invoice_number)
  where invoice_number is not null and deleted_at is null;
