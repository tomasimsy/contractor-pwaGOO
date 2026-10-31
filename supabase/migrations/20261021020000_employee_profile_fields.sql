-- =====================================================================
-- Employee profile fields: job title, hire date, home address, emergency
-- contact, and SSN last four digits.
--
-- The full SSN is never stored. The app keeps only the last four digits,
-- which is enough to tell records apart and to confirm identity over the
-- phone. Payroll and W-2 filing need the full number later, and that will go
-- through a payroll provider or an encrypted store with a key kept outside
-- the database. Do not add a full-SSN column to this table.
--
-- Additive only: new nullable columns on employees.
-- ---------------------------------------------------------------------

alter table public.employees
  add column if not exists job_title text,
  add column if not exists hire_date date,
  add column if not exists address_street text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zip text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists ssn_last4 text;

alter table public.employees
  drop constraint if exists employees_ssn_last4_format;
alter table public.employees
  add constraint employees_ssn_last4_format check (ssn_last4 is null or ssn_last4 ~ '^[0-9]{4}$');

alter table public.employees
  drop constraint if exists employees_address_state_format;
alter table public.employees
  add constraint employees_address_state_format check (address_state is null or address_state ~ '^[A-Z]{2}$');

comment on column public.employees.ssn_last4 is
  'Last four digits of the SSN only. The full number is never stored in this database.';
