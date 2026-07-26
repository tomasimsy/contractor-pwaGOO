-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Reliability system, part 2: soft
-- delete gets a required reason for financial records, and a
-- verification query proving deleted records don't affect totals.
--
-- Adds delete_reason alongside the existing deleted_at/deleted_by
-- columns (20260715000000/20260715000200). Nullable at the column
-- level (existing deleted rows have no reason recorded and that's
-- fine, permanent, historical) but the APPLICATION must never
-- soft-delete a financial record without one — see
-- contractor-app-v2/lib/services/validationService.ts's
-- validateDeleteReason, called by every Layer 2 service's softDelete
-- before it does anything else. The DB column stays nullable rather
-- than NOT NULL because soft_delete_instead()'s trigger path (a stray
-- hard DELETE with no application-supplied reason) must still succeed
-- as a safety net — it just won't have a reason recorded, which is
-- itself a visible, auditable gap (see the verification query below)
-- rather than a hard failure that blocks deletion entirely.
-- =====================================================================

alter table public.estimates add column if not exists delete_reason text;
alter table public.invoices add column if not exists delete_reason text;
alter table public.invoice_payments add column if not exists delete_reason text;
alter table public.estimate_expenses add column if not exists delete_reason text;
alter table public.subcontractor_payments add column if not exists delete_reason text;
alter table public.agent_payments add column if not exists delete_reason text;
alter table public.projects add column if not exists delete_reason text;

comment on column public.invoice_payments.delete_reason is
  'Required by application-level validation (ValidationService.validateDeleteReason) for every financial-record soft delete. Nullable at the column level only as a safety net for the trigger-intercepted stray hard DELETE path — see soft_delete_instead().';

-- ---------------------------------------------------------------------
-- Verification: "deleted records must never affect calculations."
-- Run this after any deletion to confirm a deleted row's amount is not
-- still being summed. Every query here should return 0 rows.
-- ---------------------------------------------------------------------

-- Deleted invoice_payments must not still count toward any invoice's
-- amount_paid (the trigger-maintained cumulative column).
-- select ip.id, ip.amount, i.amount_paid
-- from public.invoice_payments ip
-- join public.invoices i on i.id = ip.invoice_id
-- where ip.deleted_at is not null
--   and i.amount_paid >= ip.amount; -- imprecise without recomputing from scratch; the real check is
--   -- recomputing amount_paid from only non-deleted rows and comparing:
-- select i.id, i.amount_paid as stored_amount_paid,
--        (select coalesce(sum(amount), 0) from public.invoice_payments where invoice_id = i.id and deleted_at is null) as recomputed_amount_paid
-- from public.invoices i
-- where i.amount_paid <> (select coalesce(sum(amount), 0) from public.invoice_payments where invoice_id = i.id and deleted_at is null);

-- Every financial-record deletion in the last 30 days should have a
-- reason recorded — a non-empty result here is a gap in the
-- application-level enforcement (a delete happened through some path
-- that bypassed ValidationService, or a genuine hard DELETE occurred).
-- select 'invoice_payments' as table_name, id, deleted_at, delete_reason from public.invoice_payments where deleted_at > now() - interval '30 days' and (delete_reason is null or delete_reason = '')
-- union all
-- select 'estimate_expenses', id, deleted_at, delete_reason from public.estimate_expenses where deleted_at > now() - interval '30 days' and (delete_reason is null or delete_reason = '')
-- union all
-- select 'subcontractor_payments', id, deleted_at, delete_reason from public.subcontractor_payments where deleted_at > now() - interval '30 days' and (delete_reason is null or delete_reason = '')
-- union all
-- select 'agent_payments', id, deleted_at, delete_reason from public.agent_payments where deleted_at > now() - interval '30 days' and (delete_reason is null or delete_reason = '');
