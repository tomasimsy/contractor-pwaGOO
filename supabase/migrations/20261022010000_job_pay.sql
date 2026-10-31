-- =====================================================================
-- Job pay: a fixed amount an employee earns for finishing one estimate,
-- instead of being paid by the hour on that estimate.
--
-- Rules (see the design notes):
--   * While a job pay is set, the employee's hourly cost on that estimate is
--     replaced by the job pay. Their hours are still tracked.
--   * The job pay counts as labor once the project is marked Completed.
--
-- Kept in its own table so that who can see a pay amount is decided by its own
-- policies, not by the estimate's crew list.
-- ---------------------------------------------------------------------

create table if not exists public.estimate_job_pay (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  amount numeric(12,2) not null check (amount >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create unique index if not exists estimate_job_pay_unique
  on public.estimate_job_pay (estimate_id, employee_id);
create index if not exists estimate_job_pay_employee_idx
  on public.estimate_job_pay (employee_id);

alter table public.estimate_job_pay enable row level security;

-- Who can see a job pay: office roles and accountants (all), team members on
-- that estimate, and the employee it belongs to.
drop policy if exists estimate_job_pay_select on public.estimate_job_pay;
create policy estimate_job_pay_select on public.estimate_job_pay for select using (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager', 'accountant')
    or estimate_id in (select public.my_team_estimate_ids())
    or employee_id in (select id from public.employees where profile_id = auth.uid())
  )
);

-- Only office roles set or change a job pay.
drop policy if exists estimate_job_pay_write on public.estimate_job_pay;
create policy estimate_job_pay_write on public.estimate_job_pay for all using (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
) with check (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
);

-- An employee login's own job pays, by estimate id and amount only.
create or replace function public.my_job_pays()
returns table (estimate_id uuid, amount numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.estimate_id, p.amount
  from public.estimate_job_pay p
  join public.employees e on e.id = p.employee_id
  where e.profile_id = auth.uid()
    and e.deleted_at is null
    and p.company_id = public.current_company_id()
$$;

revoke all on function public.my_job_pays() from public;
grant execute on function public.my_job_pays() to authenticated;
