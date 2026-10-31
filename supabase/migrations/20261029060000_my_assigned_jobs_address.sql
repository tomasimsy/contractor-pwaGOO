-- =====================================================================
-- Employees see the job site and job details of the estimates they are
-- assigned to. No new table: everything comes from the estimate.
--
-- Employees cannot read estimates or projects directly (employee_block,
-- 20261021030000), so their job list comes from my_assigned_jobs(). This
-- adds, from each assigned estimate:
--   address      the job site — the same address the estimate's PDF
--                prints (its project's property), falling back to the
--                project's address text
--   job_details  the estimate's description (scope of work)
--   project_name the project the estimate belongs to
--
-- Same rows, same security as before (security definer, scoped to the
-- caller's own assignments). The return type changes, so the function is
-- dropped and recreated. Safe to re-run.
-- =====================================================================

drop function if exists public.my_assigned_jobs();

create function public.my_assigned_jobs()
returns table (id uuid, estimate_number text, title text, completed boolean, address text, project_name text, job_details text)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.estimate_number,
    e.title,
    (pr.status = 'completed') as completed,
    coalesce(
      nullif(concat_ws(', ', nullif(btrim(p.street), ''), nullif(btrim(p.city), ''),
        nullif(btrim(concat_ws(' ', nullif(btrim(p.state), ''), nullif(btrim(p.zip), ''))), '')), ''),
      nullif(btrim(pr.address), '')
    ) as address,
    pr.name as project_name,
    nullif(btrim(e.description), '') as job_details
  from public.estimates e
  join public.projects pr on pr.id = e.project_id
  left join public.properties p on p.id = pr.property_id and p.deleted_at is null
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
