-- =====================================================================
-- Employees see their assigned jobs by name only, never the estimate itself.
--
-- Before: an employee login could read the full estimate row for each job it
-- was assigned to, including totals, deposit and terms.
-- After: the estimates table is closed to the employee role, and a small
-- function returns just the job's id, number and title for the jobs that
-- login is assigned to. That is all the timesheet job picker needs.
--
-- Additive: one function, one restrictive policy on estimates.
-- ---------------------------------------------------------------------

create or replace function public.my_assigned_jobs()
returns table (id uuid, estimate_number text, title text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.estimate_number, e.title
  from public.estimates e
  join public.estimate_employees ee on ee.estimate_id = e.id
  join public.employees emp on emp.id = ee.employee_id
  where emp.profile_id = auth.uid()
    and emp.deleted_at is null
    and e.deleted_at is null
    and e.company_id = public.current_company_id()
  order by e.created_at desc
$$;

revoke all on function public.my_assigned_jobs() from public;
grant execute on function public.my_assigned_jobs() to authenticated;

-- Close the estimates table to the employee role. The assigned-estimate
-- policy from the earlier migration is still there, but this restrictive
-- policy stops it from returning any rows to an employee login.
drop policy if exists employee_block on public.estimates;
create policy employee_block on public.estimates as restrictive for all to authenticated
  using (coalesce(public.current_user_role(), '') <> 'employee')
  with check (coalesce(public.current_user_role(), '') <> 'employee');
