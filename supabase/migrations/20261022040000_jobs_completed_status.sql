-- =====================================================================
-- The job lists an employee or team member sees now say whether each job is
-- completed (its project is marked completed), so the timesheet can show
-- active and completed jobs separately.
--
-- The return type changes, so both functions are dropped and recreated.
-- ---------------------------------------------------------------------

drop function if exists public.my_assigned_jobs();
drop function if exists public.my_team_jobs();

create function public.my_assigned_jobs()
returns table (id uuid, estimate_number text, title text, completed boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.estimate_number, e.title, (pr.status = 'completed') as completed
  from public.estimates e
  join public.projects pr on pr.id = e.project_id
  join public.estimate_employees ee on ee.estimate_id = e.id
  join public.employees emp on emp.id = ee.employee_id
  where emp.profile_id = auth.uid()
    and emp.deleted_at is null
    and e.deleted_at is null
    and e.company_id = public.current_company_id()
  order by e.created_at desc
$$;

create function public.my_team_jobs()
returns table (id uuid, estimate_number text, title text, completed boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.estimate_number, e.title, (pr.status = 'completed') as completed
  from public.estimates e
  join public.projects pr on pr.id = e.project_id
  where e.id in (select public.my_team_estimate_ids())
    and e.deleted_at is null
  order by e.created_at desc
$$;

revoke all on function public.my_assigned_jobs() from public;
grant execute on function public.my_assigned_jobs() to authenticated;
revoke all on function public.my_team_jobs() from public;
grant execute on function public.my_team_jobs() to authenticated;
