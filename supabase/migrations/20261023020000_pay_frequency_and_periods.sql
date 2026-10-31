-- =====================================================================
-- Each employee has a pay frequency (weekly or biweekly). Each payment records
-- the pay period it covers, so the history can show which period was paid.
-- Additive: new columns with defaults. Older payments show no period.
-- ---------------------------------------------------------------------

alter table public.employees
  add column if not exists pay_frequency text not null default 'biweekly';

alter table public.employees
  drop constraint if exists employees_pay_frequency_check;
alter table public.employees
  add constraint employees_pay_frequency_check check (pay_frequency in ('weekly', 'biweekly'));

alter table public.payee_payments
  add column if not exists period_start date,
  add column if not exists period_end date;
