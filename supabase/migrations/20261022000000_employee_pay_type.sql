-- =====================================================================
-- Pay type for employees: by the hour, or a fixed day rate.
--
-- hourly  the rate is per hour; cost = hours × rate
-- daily   the rate is per day worked; cost = the day rate, shared across jobs
--         by hours when one day's hours are split between jobs
--
-- The pay type is copied onto each time entry, like the rate, so a later
-- change never alters past cost.
--
-- Additive: new columns with a default, so existing rows are hourly.
-- ---------------------------------------------------------------------

alter table public.employees
  add column if not exists pay_type text not null default 'hourly';

alter table public.employees
  drop constraint if exists employees_pay_type_check;
alter table public.employees
  add constraint employees_pay_type_check check (pay_type in ('hourly', 'daily'));

alter table public.time_entries
  add column if not exists pay_type text not null default 'hourly';

alter table public.time_entries
  drop constraint if exists time_entries_pay_type_check;
alter table public.time_entries
  add constraint time_entries_pay_type_check check (pay_type in ('hourly', 'daily'));
