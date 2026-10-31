-- =====================================================================
-- Team members supervise a crew on the estimates they are assigned to.
--
-- A team member (estimate_team_members) can, for THEIR estimates only:
--   * see the estimate and the employees assigned to it
--   * see those employees' time entries
--   * clock those employees in and out, and add hours
--   * approve those employees' hours
-- They cannot see other jobs, pay rates beyond the crew, or delete hours.
--
-- Also tightened, because the old rules were too broad:
--   * time entries: only office roles (admin, office, project manager) can
--     change any entry. Before, any non-employee role could, including
--     field_lead and accountant.
--   * employees and crew assignments: only office roles can add or change
--     them. Before, field_lead and others could.
--   * the employee roster is visible to office roles and accountants, to the
--     employee's own login, and to team members for their own crew.
-- ---------------------------------------------------------------------

-- Helper: the estimates the signed-in user is a team member on.
create or replace function public.my_team_estimate_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select etm.estimate_id
  from public.estimate_team_members etm
  where etm.user_id = auth.uid()
    and etm.deleted_at is null
    and etm.company_id = public.current_company_id()
$$;

revoke all on function public.my_team_estimate_ids() from public;
grant execute on function public.my_team_estimate_ids() to authenticated;

-- Helper: the jobs (name only) the signed-in user supervises, for the timesheet picker.
create or replace function public.my_team_jobs()
returns table (id uuid, estimate_number text, title text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.estimate_number, e.title
  from public.estimates e
  where e.id in (select public.my_team_estimate_ids())
    and e.deleted_at is null
  order by e.created_at desc
$$;

revoke all on function public.my_team_jobs() from public;
grant execute on function public.my_team_jobs() to authenticated;

-- 1. Estimates: a team member can open the estimate they supervise.
drop policy if exists estimates_team_member_select on public.estimates;
create policy estimates_team_member_select on public.estimates
  for select using (id in (select public.my_team_estimate_ids()));

-- 2. Time entries ----------------------------------------------------
drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries for select using (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager', 'accountant')
    or (
      public.current_user_role() = 'employee'
      and employee_id in (select id from public.employees where profile_id = auth.uid())
    )
    or estimate_id in (select public.my_team_estimate_ids())
  )
);

-- Who may write one entry. Used for both USING and WITH CHECK below.
drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries for insert with check (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
    or (
      public.current_user_role() = 'employee'
      and employee_id in (select id from public.employees where profile_id = auth.uid())
      and status = 'submitted'
    )
    or (
      estimate_id in (select public.my_team_estimate_ids())
      and status = 'submitted'
      and employee_id in (
        select ee.employee_id from public.estimate_employees ee where ee.estimate_id = time_entries.estimate_id
      )
    )
  )
);

drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries for update using (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
    or (
      public.current_user_role() = 'employee'
      and employee_id in (select id from public.employees where profile_id = auth.uid())
      and status = 'submitted'
    )
    or (
      estimate_id in (select public.my_team_estimate_ids())
      and employee_id in (
        select ee.employee_id from public.estimate_employees ee where ee.estimate_id = time_entries.estimate_id
      )
    )
  )
) with check (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
    or (
      public.current_user_role() = 'employee'
      and employee_id in (select id from public.employees where profile_id = auth.uid())
      and status = 'submitted'
    )
    or (
      estimate_id in (select public.my_team_estimate_ids())
      and employee_id in (
        select ee.employee_id from public.estimate_employees ee where ee.estimate_id = time_entries.estimate_id
      )
    )
  )
);

drop policy if exists time_entries_delete on public.time_entries;
create policy time_entries_delete on public.time_entries for delete using (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
);

-- 3. Employees -------------------------------------------------------
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select using (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager', 'accountant')
    or profile_id = auth.uid()
    or id in (
      select ee.employee_id from public.estimate_employees ee
      where ee.estimate_id in (select public.my_team_estimate_ids())
    )
  )
);

drop policy if exists employees_write on public.employees;
create policy employees_write on public.employees for all using (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
) with check (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
);

-- 4. Crew assignments: only office roles add or remove people from an estimate.
drop policy if exists estimate_employees_write on public.estimate_employees;
create policy estimate_employees_write on public.estimate_employees for all using (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
) with check (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
);
