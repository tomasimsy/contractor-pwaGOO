-- =====================================================================
-- Corrections after a period is paid: an adjustment adds to (or takes away
-- from) what is owed, with a reason. Pay in a paid period cannot change, so an
-- adjustment is the only way to correct it.
--
-- Adjustments are the only payment rows that can be negative.
-- ---------------------------------------------------------------------

alter table public.payee_payments
  drop constraint if exists payee_payments_payment_kind_check;
alter table public.payee_payments
  add constraint payee_payments_payment_kind_check check (payment_kind in ('pay', 'reimbursement', 'adjustment'));

alter table public.payee_payments
  drop constraint if exists payee_payments_amount_check;
alter table public.payee_payments
  add constraint payee_payments_amount_check check (
    (payment_kind = 'adjustment' and amount <> 0) or (payment_kind <> 'adjustment' and amount > 0)
  );
