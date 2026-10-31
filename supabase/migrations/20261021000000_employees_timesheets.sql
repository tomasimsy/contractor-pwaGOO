-- =====================================================================
-- Employees, timesheets (clock in / clock out), and estimate assignments.
--
-- Additive: no existing row or column is changed. Two existing policies
-- (estimates, projects) are narrowed so the new "employee" role cannot
-- read jobs it is not assigned to — the same shape field_lead already uses.
--
-- Money: a time entry's cost is hours × rate, counted from APPROVED
-- entries only (see the design doc). No expense row is written here.
-- ---------------------------------------------------------------------

-- 1. New role --------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['admin','office','sales','project_manager','accountant','subcontractor','agent','field_lead','employee']));

-- 2. Employees -------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  -- Optional login. Set when the person has an app account (role 'employee').
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  phone text,
  email text,
  notes text,
  hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0),
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  deleted_by uuid,
  deleted_at timestamptz,
  delete_reason text
);

comment on table public.employees is
  'W-2 employees of the company. Separate from profiles (logins), agents and subcontractors. profile_id links an employee to a login when they have one.';

create index if not exists employees_company_id_idx on public.employees (company_id) where deleted_at is null;

create unique index if not exists employees_profile_id_unique
  on public.employees (profile_id) where profile_id is not null and deleted_at is null;

-- 3. Time entries ----------------------------------------------------
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null references public.employees(id),
  -- Null = company time (shop work, training). Otherwise the estimate worked on.
  estimate_id uuid references public.estimates(id),
  work_date date not null,
  -- Clock-in / clock-out. Both null for an hours-only manual entry.
  started_at timestamptz,
  ended_at timestamptz,
  hours numeric(6,2) check (hours is null or (hours >= 0 and hours <= 24)),
  -- Rate copied from the employee when the entry is made, so a later raise
  -- never changes past labor cost.
  rate numeric(12,2) not null default 0 check (rate >= 0),
  notes text,
  status text not null default 'submitted' check (status in ('submitted','approved')),
  entered_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  deleted_by uuid,
  deleted_at timestamptz,
  delete_reason text
);

comment on table public.time_entries is
  'Hours worked by an employee, optionally on an estimate. An open shift has started_at set and ended_at null. Only approved entries count toward labor cost.';

create index if not exists time_entries_company_id_idx on public.time_entries (company_id) where deleted_at is null;
create index if not exists time_entries_employee_idx on public.time_entries (employee_id, work_date) where deleted_at is null;
create index if not exists time_entries_estimate_idx on public.time_entries (estimate_id) where deleted_at is null;

-- At most one open shift per employee, enforced by the database too.
create unique index if not exists time_entries_one_open_shift
  on public.time_entries (employee_id)
  where started_at is not null and ended_at is null and deleted_at is null;

-- 4. Estimate assignments (which employees work on which estimate) ---
create table if not exists public.estimate_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists estimate_employees_unique
  on public.estimate_employees (estimate_id, employee_id);
create index if not exists estimate_employees_employee_idx
  on public.estimate_employees (employee_id);

-- 5. Row-level security ---------------------------------------------
alter table public.employees enable row level security;
alter table public.time_entries enable row level security;
alter table public.estimate_employees enable row level security;

-- Employees: everyone in the company sees the roster, except an employee
-- login sees only its own employee row. Only non-employee roles write.
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select using (
  company_id = public.current_company_id()
  and (coalesce(public.current_user_role(), '') <> 'employee' or profile_id = auth.uid())
);

drop policy if exists employees_write on public.employees;
create policy employees_write on public.employees for all using (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') <> 'employee'
) with check (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') <> 'employee'
);

-- Time entries: office roles see all; an employee login sees and writes
-- only its own entries, and cannot change an entry once it is approved.
drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries for select using (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') <> 'employee'
    or employee_id in (select id from public.employees where profile_id = auth.uid())
  )
);

drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries for insert with check (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') <> 'employee'
    or (
      employee_id in (select id from public.employees where profile_id = auth.uid())
      and status = 'submitted'
    )
  )
);

drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries for update using (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') <> 'employee'
    or (
      employee_id in (select id from public.employees where profile_id = auth.uid())
      and status = 'submitted'
    )
  )
) with check (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') <> 'employee'
    or (
      employee_id in (select id from public.employees where profile_id = auth.uid())
      and status = 'submitted'
    )
  )
);

drop policy if exists time_entries_delete on public.time_entries;
create policy time_entries_delete on public.time_entries for delete using (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') <> 'employee'
);

-- Assignments: everyone in the company can read; only non-employee roles change them.
drop policy if exists estimate_employees_select on public.estimate_employees;
create policy estimate_employees_select on public.estimate_employees for select using (
  company_id = public.current_company_id()
);

drop policy if exists estimate_employees_write on public.estimate_employees;
create policy estimate_employees_write on public.estimate_employees for all using (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') <> 'employee'
) with check (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') <> 'employee'
);

-- 6. Narrow estimates and projects for the employee role -------------
-- Same pattern as field_lead: the blanket company policy excludes the
-- restricted role, and the role gets a narrower policy instead.
drop policy if exists "Company isolation estimates" on public.estimates;
create policy "Company isolation estimates" on public.estimates to authenticated
  using (
    company_id = (select profiles.company_id from public.profiles where profiles.id = auth.uid())
    and coalesce(public.current_user_role(), '') not in ('field_lead', 'employee')
  )
  with check (
    company_id = (select profiles.company_id from public.profiles where profiles.id = auth.uid())
    and coalesce(public.current_user_role(), '') not in ('field_lead', 'employee')
  );

drop policy if exists estimates_employee_assigned_select on public.estimates;
create policy estimates_employee_assigned_select on public.estimates
  for select using (
    public.current_user_role() = 'employee'
    and id in (
      select ee.estimate_id
      from public.estimate_employees ee
      join public.employees e on e.id = ee.employee_id
      where e.profile_id = auth.uid() and e.deleted_at is null
    )
  );

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (
    company_id = public.current_company_id()
    and coalesce(public.current_user_role(), '') not in ('field_lead', 'employee')
  );
