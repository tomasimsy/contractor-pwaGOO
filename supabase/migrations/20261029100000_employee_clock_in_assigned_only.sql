-- =====================================================================
-- An employee can record time only on company time or on a job they are
-- assigned to.
--
-- Before: the employee branch of time_entries_insert checked only that
-- the entry was their own and still pending. The app lists only assigned
-- jobs, but a screen left open after the office removed them from a job
-- — or a request made directly — could still log hours on that job.
-- Removing someone from an estimate now fully takes the job away from
-- them.
--
-- Office roles and crew leads are unchanged. Idempotent: safe to re-run.
-- =====================================================================

drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries for insert with check (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
    or (
      public.current_user_role() = 'employee'
      and employee_id in (select id from public.employees where profile_id = auth.uid())
      and status = 'submitted'
      -- Company time, or a job they are assigned to.
      and (
        estimate_id is null
        or exists (
          select 1 from public.estimate_employees ee
          where ee.estimate_id = time_entries.estimate_id and ee.employee_id = time_entries.employee_id
        )
      )
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
