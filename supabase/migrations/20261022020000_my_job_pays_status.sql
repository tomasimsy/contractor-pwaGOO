-- =====================================================================
-- An employee's own job pays now say whether they are earned yet, so the
-- timesheet can show "earned" or "counts when complete".
--
-- A job pay is earned once its estimate's project is marked completed.
-- The return type changes, so the old function is dropped first.
-- ---------------------------------------------------------------------

drop function if exists public.my_job_pays();

create function public.my_job_pays()
returns table (estimate_id uuid, amount numeric, completed boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.estimate_id, p.amount, (pr.status = 'completed') as completed
  from public.estimate_job_pay p
  join public.employees e on e.id = p.employee_id
  join public.estimates est on est.id = p.estimate_id
  join public.projects pr on pr.id = est.project_id
  where e.profile_id = auth.uid()
    and e.deleted_at is null
    and p.company_id = public.current_company_id()
$$;

revoke all on function public.my_job_pays() from public;
grant execute on function public.my_job_pays() to authenticated;
