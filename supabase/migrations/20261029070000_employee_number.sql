-- =====================================================================
-- Employee number: EMP-0001, EMP-0002, … per company.
--
-- 1. employees.employee_number — unique within a company (among employees
--    that are not deleted). The office can edit it, e.g. to keep numbers
--    from another system.
-- 2. Existing employees are numbered in the order they were added.
-- 3. A new employee with no number gets the next one automatically: one
--    above the highest EMP-#### number the company has ever used
--    (deleted employees included), so a number is never handed out twice.
--
-- Idempotent: safe to re-run.
-- =====================================================================

begin;

alter table public.employees
  add column if not exists employee_number text;

comment on column public.employees.employee_number is
  'Company employee number, e.g. EMP-0001. Assigned automatically on insert when blank (employees_assign_number); editable.';

-- 2. Number existing employees, oldest first, after any numbers already in use.
with numbered as (
  select e.id,
         coalesce((
           select max(nullif(regexp_replace(x.employee_number, '^EMP-0*', ''), '')::int)
           from public.employees x
           where x.company_id = e.company_id and x.employee_number ~ '^EMP-[0-9]+$'
         ), 0)
         + row_number() over (partition by e.company_id order by e.created_at, e.id) as n
  from public.employees e
  where e.employee_number is null
)
update public.employees e
set employee_number = 'EMP-' || lpad(numbered.n::text, 4, '0')
from numbered
where e.id = numbered.id;

-- 3. Next number on insert.
create or replace function public.employees_assign_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_n int;
begin
  if new.employee_number is not null and btrim(new.employee_number) <> '' then
    new.employee_number := btrim(new.employee_number);
    return new;
  end if;
  -- One company at a time, so two employees added at once can't get the same number.
  perform pg_advisory_xact_lock(hashtext('employee_number:' || new.company_id::text));
  select coalesce(max(nullif(regexp_replace(employee_number, '^EMP-0*', ''), '')::int), 0) + 1
    into next_n
  from public.employees
  where company_id = new.company_id and employee_number ~ '^EMP-[0-9]+$';
  new.employee_number := 'EMP-' || lpad(next_n::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists employees_assign_number on public.employees;
create trigger employees_assign_number
  before insert on public.employees
  for each row execute function public.employees_assign_number();

-- 1. Unique within a company (live employees).
create unique index if not exists employees_company_number_unique
  on public.employees (company_id, employee_number)
  where deleted_at is null and employee_number is not null;

commit;
