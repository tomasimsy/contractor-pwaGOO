-- =====================================================================
-- Job pay mode: whether a fixed job pay REPLACES the employee's hourly pay on
-- that estimate, or is ADDED to it.
--
--   replace  the job pay is the whole labor for that employee on the estimate
--            (their hours are still tracked). Default, as before.
--   add      the job pay is paid on top of hourly pay for the hours worked.
--
-- A job pay still counts only once its project is completed, in both modes.
-- Existing rows become 'replace', so nothing changes for them.
-- ---------------------------------------------------------------------

alter table public.estimate_job_pay
  add column if not exists mode text not null default 'replace';

alter table public.estimate_job_pay
  drop constraint if exists estimate_job_pay_mode_check;
alter table public.estimate_job_pay
  add constraint estimate_job_pay_mode_check check (mode in ('replace', 'add'));

drop function if exists public.my_job_pays();

create function public.my_job_pays()
returns table (estimate_id uuid, amount numeric, completed boolean, mode text)
language sql
stable
security definer
set search_path = public
as $$
  select p.estimate_id, p.amount, (pr.status = 'completed') as completed, p.mode
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
