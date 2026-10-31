-- =====================================================================
-- Pay rate history: raises with an effective date.
--
-- ONE RULE: unpaid hours use the rate in effect on the day they were
-- worked; paid hours never change.
--
--   employee_pay_rates   one row per rate: rate, hourly/daily, effective
--                        date. The rate on a day is the latest row whose
--                        effective_date is on or before that day.
--   time_entries.rate    still stored on every entry (every report reads
--                        it), but now SET FROM THE HISTORY:
--                          * on insert, and when the work date changes
--                            (trigger time_entries_apply_rate)
--                          * when a rate is added or removed, for every
--                            entry not yet paid (resync_employee_rates)
--   "Paid" = the entry's work date falls in a pay period that a live
--   (not reversed) wage payment to that employee covers. Those entries
--   keep the rate they were paid at; a raise that reaches back into a
--   paid period is settled with a correction in Payroll.
--   employees.hourly_rate / pay_type  kept equal to the rate in effect
--   today, for screens that show "the current rate".
--
-- Backfill: each employee starts with one row, their current rate,
-- effective from the beginning ('1900-01-01'). No time entry is changed
-- by this migration. Idempotent: safe to re-run.
-- =====================================================================

begin;

create table if not exists public.employee_pay_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  rate numeric(12, 2) not null check (rate >= 0),
  pay_type text not null default 'hourly' check (pay_type in ('hourly', 'daily')),
  effective_date date not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

comment on table public.employee_pay_rates is
  'Pay rate history per employee. The rate on a day = latest live row with effective_date <= that day. Time entries take their rate from here (see resync_employee_rates).';

-- One live rate per employee per day.
create unique index if not exists employee_pay_rates_one_per_day
  on public.employee_pay_rates (employee_id, effective_date) where deleted_at is null;
create index if not exists employee_pay_rates_company_idx
  on public.employee_pay_rates (company_id) where deleted_at is null;

alter table public.employee_pay_rates enable row level security;

-- Office roles manage rates; an employee can read their own.
drop policy if exists employee_pay_rates_select on public.employee_pay_rates;
create policy employee_pay_rates_select on public.employee_pay_rates
  for select using (
    company_id = public.current_company_id()
    and (
      coalesce(public.current_user_role(), '') <> 'employee'
      or employee_id in (select e.id from public.employees e where e.profile_id = auth.uid())
    )
  );

drop policy if exists employee_pay_rates_insert on public.employee_pay_rates;
create policy employee_pay_rates_insert on public.employee_pay_rates
  for insert with check (company_id = public.current_company_id() and coalesce(public.current_user_role(), '') <> 'employee');

drop policy if exists employee_pay_rates_update on public.employee_pay_rates;
create policy employee_pay_rates_update on public.employee_pay_rates
  for update using (company_id = public.current_company_id() and coalesce(public.current_user_role(), '') <> 'employee');

-- Backfill: the current rate, from the beginning.
insert into public.employee_pay_rates (company_id, employee_id, rate, pay_type, effective_date, note)
select e.company_id, e.id, coalesce(e.hourly_rate, 0), coalesce(e.pay_type, 'hourly'), date '1900-01-01', 'Starting rate'
from public.employees e
where not exists (select 1 from public.employee_pay_rates r where r.employee_id = e.id and r.deleted_at is null);

-- A new employee starts with their rate, from the beginning.
create or replace function public.employees_starting_rate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.employee_pay_rates (company_id, employee_id, rate, pay_type, effective_date, note, created_by)
  values (new.company_id, new.id, coalesce(new.hourly_rate, 0), coalesce(new.pay_type, 'hourly'), date '1900-01-01', 'Starting rate', auth.uid());
  return new;
end;
$$;

drop trigger if exists employees_starting_rate on public.employees;
create trigger employees_starting_rate
  after insert on public.employees
  for each row execute function public.employees_starting_rate();

-- The rate row in effect for an employee on a day.
create or replace function public.employee_rate_on(p_employee uuid, p_day date)
returns table (rate numeric, pay_type text)
language sql
stable
set search_path = public
as $$
  select r.rate, r.pay_type
  from public.employee_pay_rates r
  where r.employee_id = p_employee and r.deleted_at is null and r.effective_date <= p_day
  order by r.effective_date desc
  limit 1
$$;

-- Is this day already paid for this employee? (A live wage payment's period covers it.)
create or replace function public.employee_day_paid(p_employee uuid, p_day date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.payee_payments p
    where p.payee_kind = 'employee'
      and p.employee_id = p_employee
      and p.payment_kind = 'pay'
      and p.reversed_at is null
      and p.period_start is not null and p.period_end is not null
      and p.period_start <= p_day and p_day <= p.period_end
  )
$$;

-- New entries, and entries whose date changes, take the rate for their work date.
create or replace function public.time_entries_apply_rate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'UPDATE' and new.work_date is not distinct from old.work_date then
    return new;
  end if;
  if tg_op = 'UPDATE' and public.employee_day_paid(new.employee_id, old.work_date) then
    return new; -- paid hours keep their rate
  end if;
  select * into r from public.employee_rate_on(new.employee_id, new.work_date);
  if found then
    new.rate := r.rate;
    new.pay_type := r.pay_type;
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_apply_rate on public.time_entries;
create trigger time_entries_apply_rate
  before insert or update of work_date on public.time_entries
  for each row execute function public.time_entries_apply_rate();

-- After a rate is added or removed: every UNPAID entry follows the history,
-- and the employee's current rate is today's. Returns how many entries changed.
create or replace function public.resync_employee_rates(p_employee uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  changed integer;
  r record;
begin
  update public.time_entries t
  set rate = x.rate, pay_type = x.pay_type, updated_at = now()
  from (
    select t2.id, rr.rate, rr.pay_type
    from public.time_entries t2
    cross join lateral public.employee_rate_on(t2.employee_id, t2.work_date) rr
    where t2.employee_id = p_employee
      and t2.deleted_at is null
      and not public.employee_day_paid(t2.employee_id, t2.work_date)
  ) x
  where t.id = x.id and (t.rate is distinct from x.rate or t.pay_type is distinct from x.pay_type);
  get diagnostics changed = row_count;

  select * into r from public.employee_rate_on(p_employee, current_date);
  if found then
    update public.employees set hourly_rate = r.rate, pay_type = r.pay_type where id = p_employee;
  end if;
  return changed;
end;
$$;

revoke all on function public.resync_employee_rates(uuid) from public;
grant execute on function public.resync_employee_rates(uuid) to authenticated;

commit;
