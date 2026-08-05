-- =====================================================================
-- Fix: company document uploads fail with
--   "new row violates row-level security policy"
--
-- REPRODUCED against the running app, signed in, via the real endpoint:
--   POST /api/company-documents/upload  (category=business_license)
--     -> 500 {"error":"Failed to upload file: new row violates
--              row-level security policy"}
--
-- CAUSE: migration 20260802000400 created the `company-documents`
-- bucket but no policies on storage.objects for it:
--
--   insert into storage.buckets (id, name, public)
--   values ('company-documents', 'company-documents', false)
--
-- storage.objects has RLS enabled, and RLS denies by default. With the
-- bucket registered but no policy naming it, every INSERT is refused —
-- so the feature has never been able to work. The API route itself is
-- fine: it authenticates the user, resolves their company, and uploads
-- as that user (NOT with the service-role key, deliberately), which is
-- exactly what makes storage RLS the deciding layer here.
--
-- SCOPING — paths already encode the company, so the policies key off
-- that rather than needing any new column. From the upload route:
--
--   documents/<company_id>/<category>/<timestamp>.<ext>
--   logos/<company_id>/<timestamp>.<ext>
--
-- storage.foldername(name) splits the directory portion, so in BOTH
-- shapes element 2 is the company id (Postgres arrays are 1-based):
--
--   documents/964dfb81…/business_license/1.pdf -> {documents,964dfb81…,business_license}
--   logos/964dfb81…/1.png                      -> {logos,964dfb81…}
--
-- Comparing that against current_company_id() — the same function the
-- base-table policies already use — gives per-company isolation: a user
-- can neither read nor write another company's files, and the bucket
-- stays private (public = false), so there is no unauthenticated path
-- to these documents at all. That matters more here than for most
-- buckets: these are EIN letters, W-9s, insurance certificates and
-- banking documents.
--
-- All four verbs are granted because the app uses them: upload
-- (INSERT), download (SELECT), logo replacement (UPDATE, since the
-- route may re-upload), and document removal (DELETE).
--
-- ADDITIVE. No table, column, bucket or object is created or altered —
-- this only adds policies. Idempotent: safe to re-run.
-- =====================================================================

-- Ensure the bucket exists and is PRIVATE before granting anything.
-- (No-op if 20260802000400 already ran; the `do update` corrects a
-- bucket that was ever flipped public by hand in the dashboard.)
insert into storage.buckets (id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do update set public = false;

drop policy if exists company_documents_objects_select on storage.objects;
create policy company_documents_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  );

drop policy if exists company_documents_objects_insert on storage.objects;
create policy company_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  );

drop policy if exists company_documents_objects_update on storage.objects;
create policy company_documents_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  )
  with check (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  );

drop policy if exists company_documents_objects_delete on storage.objects;
create policy company_documents_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[2] = public.current_company_id()::text
  );

-- ---------------------------------------------------------------------
-- VERIFY
--
-- 1. Four policies should now exist for this bucket:
--
--      select policyname, cmd
--        from pg_policies
--       where schemaname = 'storage' and tablename = 'objects'
--         and policyname like 'company_documents_objects_%'
--       order by policyname;
--
-- 2. The bucket must still be private (expect public = false):
--
--      select id, public from storage.buckets where id = 'company-documents';
--
-- 3. From the app, signed in: Settings -> Company -> Documents, upload a
--    file. Expect success, and the row to appear in company_documents.
--
-- ROLLBACK:
--   drop policy if exists company_documents_objects_select on storage.objects;
--   drop policy if exists company_documents_objects_insert on storage.objects;
--   drop policy if exists company_documents_objects_update on storage.objects;
--   drop policy if exists company_documents_objects_delete on storage.objects;
-- ---------------------------------------------------------------------
