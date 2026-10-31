-- =====================================================================
-- One payment is one row. A "Pay in full" check lists its parts (each job,
-- money not tied to a job, and any reimbursement) in allocations, so the
-- check shows as one payment and reversing it undoes every part.
-- Additive: existing rows keep allocations null and behave as before.
-- ---------------------------------------------------------------------

alter table public.payee_payments
  add column if not exists allocations jsonb;
