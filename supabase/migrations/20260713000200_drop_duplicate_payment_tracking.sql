-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. This is a destructive migration.
-- Take a backup/snapshot of your project before running it.
--
-- Removes two confirmed-dead duplicates found during the audit:
--
-- 1. invoices.balance_due — appears nowhere in the application code
--    except a stale type declaration. Every real read/write path
--    (invoice detail page, dashboard, accounting, reports, invoice
--    list, change-order conversion) uses `remaining_balance` instead.
--    Before running: double check in the Supabase dashboard that no
--    view, trigger, or external integration reads this column that
--    this repo's code doesn't show you.
--
-- 2. estimate_payments — has exactly one call site in the whole app
--    (a SELECT on the Estimate detail page's "Payments" tab), and
--    nothing anywhere ever inserts into it. It has always been empty.
--    The app has been switched to read payments through
--    `invoice_payments` instead (joined via invoices.estimate_id),
--    which is the table actually written to when a payment is
--    recorded. If this table happens to have real historical rows in
--    production that were seeded some other way (e.g. a manual import
--    outside the app), check `select count(*) from estimate_payments`
--    before dropping — if it's not zero, migrate those rows into
--    invoice_payments first rather than dropping them.
-- =====================================================================

alter table public.invoices drop column if exists balance_due;

drop table if exists public.estimate_payments;
