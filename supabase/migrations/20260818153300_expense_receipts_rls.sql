-- =====================================================================
-- Wire up RLS for the ALREADY-EXISTING `expense_receipts` table and
-- `expense-receipts` storage bucket — both were provisioned in the live
-- database ahead of any app code ever using them (see EXPENSE_FORM.md
-- §8: "Treat receipts as unbuilt, not partially built"), so neither
-- has ever been exercised through the API. Same trap as
-- 20260805000100_company_documents_storage_policies.sql: a bucket
-- registered with no object policies silently denies every insert.
-- This migration is the receipts equivalent, applied proactively
-- before the upload route is ever called, rather than reactively after
-- the first "row-level security policy" 500.
--
-- SCOPING — the upload route writes objects at:
--   receipts/<company_id>/<expense_id>/<timestamp>.<ext>
-- storage.foldername(name) splits the directory portion, so element 2
-- (1-based) is the company id — same current_company_id() comparison
-- every other bucket's policies already use.
--
-- The `expense-receipts` bucket is PUBLIC (confirmed live), unlike the
-- private `company-documents` bucket — so unauthenticated GETs already
-- bypass RLS for read by design (that's what "public" means for a
-- storage bucket). Object policies here still gate INSERT/UPDATE/DELETE,
-- which always go through RLS regardless of the bucket's public flag.
--
-- ADDITIVE. No table, column, or bucket is created — this only adds
-- policies. Idempotent: safe to re-run.
-- =====================================================================

-- 1. Table-level RLS on expense_receipts — same 4-policy shape as
--    estimate_photos (20260730000000_estimate_photos.sql).
alter table public.expense_receipts enable row level security;

drop policy if exists expense_receipts_select on public.expense_receipts;
create policy expense_receipts_select on public.expense_receipts
  for select using (company_id = public.current_company_id());

drop policy if exists expense_receipts_insert on public.expense_receipts;
create policy expense_receipts_insert on public.expense_receipts
  for insert with check (company_id = public.current_company_id());

drop policy if exists expense_receipts_update on public.expense_receipts;
create policy expense_receipts_update on public.expense_receipts
  for update using (company_id = public.current_company_id());

drop policy if exists expense_receipts_delete on public.expense_receipts;
create policy expense_receipts_delete on public.expense_receipts
  for delete using (company_id = public.current_company_id());

-- 2. storage.objects policies for the expense-receipts bucket.
drop policy if exists expense_receipts_objects_select on storage.objects;
create policy expense_receipts_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  );

drop policy if exists expense_receipts_objects_insert on storage.objects;
create policy expense_receipts_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  );

drop policy if exists expense_receipts_objects_update on storage.objects;
create policy expense_receipts_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  )
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  );

drop policy if exists expense_receipts_objects_delete on storage.objects;
create policy expense_receipts_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  );

-- ---------------------------------------------------------------------
-- VERIFY
--   select policyname, cmd from pg_policies
--     where tablename = 'expense_receipts';
--   select policyname, cmd from pg_policies
--     where schemaname = 'storage' and tablename = 'objects'
--       and policyname like 'expense_receipts_objects_%';
--
-- ROLLBACK:
--   drop policy if exists expense_receipts_select on public.expense_receipts;
--   drop policy if exists expense_receipts_insert on public.expense_receipts;
--   drop policy if exists expense_receipts_update on public.expense_receipts;
--   drop policy if exists expense_receipts_delete on public.expense_receipts;
--   drop policy if exists expense_receipts_objects_select on storage.objects;
--   drop policy if exists expense_receipts_objects_insert on storage.objects;
--   drop policy if exists expense_receipts_objects_update on storage.objects;
--   drop policy if exists expense_receipts_objects_delete on storage.objects;
-- ---------------------------------------------------------------------
