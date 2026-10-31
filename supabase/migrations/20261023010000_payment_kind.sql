-- =====================================================================
-- A payment is either pay (hourly, job pay, fixed team amounts) or a
-- reimbursement (money back for an expense a person paid for the company).
-- Pay totals ignore reimbursement payments, and the reverse.
-- Additive: one column with a default, so existing payments stay 'pay'.
-- ---------------------------------------------------------------------

alter table public.payee_payments
  add column if not exists payment_kind text not null default 'pay';

alter table public.payee_payments
  drop constraint if exists payee_payments_payment_kind_check;
alter table public.payee_payments
  add constraint payee_payments_payment_kind_check check (payment_kind in ('pay', 'reimbursement'));
