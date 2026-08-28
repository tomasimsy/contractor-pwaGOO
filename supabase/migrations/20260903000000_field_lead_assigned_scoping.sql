-- Row-level "field_lead sees only THEIR assigned job" — the piece
-- deliberately deferred when the role was first added. Until now,
-- field_lead's restriction was UI/permission-matrix only
-- (permissions.ts says "can view an estimate at all") — the actual
-- RLS policies on estimates/projects only checked company_id, so a
-- field_lead session could already read every estimate/project in the
-- company by hitting the URL directly, regardless of what the nav
-- showed. This closes that gap at the database layer.
--
-- Scope of this pass: `estimates` and `projects` only — the two
-- tables field_lead actually needs to see anything at all. Detail
-- tables an estimate page also reads (estimate_items, estimate_areas,
-- estimate_photos, estimate_area_photos) are NOT touched here and
-- still only company-scope — a field_lead who somehow obtained
-- another estimate's item/photo id could still read those rows. Follow-
-- up if that matters in practice; not attempted blind in this pass.

-- Mirrors current_company_id()'s exact shape/caveats (disabled users
-- resolve to no role, same as no company).
create or replace function public.current_user_role() returns text
    language sql stable
    as $$
  select role from public.profiles where id = auth.uid() and disabled_at is null limit 1
$$;

-- projects: the blanket company-wide policy now excludes field_lead...
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (
    company_id = public.current_company_id()
    and coalesce(public.current_user_role(), '') <> 'field_lead'
  );

-- ...and field_lead gets a separate, narrower policy: only the project
-- actually assigned to them (Project.assignedUserId in the app).
drop policy if exists projects_field_lead_assigned_select on public.projects;
create policy projects_field_lead_assigned_select on public.projects
  for select using (
    public.current_user_role() = 'field_lead'
    and assigned_user_id = auth.uid()
  );

-- estimates: same shape. The existing policy here is named
-- "Company isolation estimates" (legacy naming, applies to every
-- command — SELECT/INSERT/UPDATE/DELETE — via one USING/WITH CHECK
-- pair) rather than the newer per-command _select/_insert/... naming
-- other tables use; kept as-is, just narrowed.
drop policy if exists "Company isolation estimates" on public.estimates;
create policy "Company isolation estimates" on public.estimates to authenticated
  using (
    company_id = (select profiles.company_id from public.profiles where profiles.id = auth.uid())
    and coalesce(public.current_user_role(), '') <> 'field_lead'
  )
  with check (
    company_id = (select profiles.company_id from public.profiles where profiles.id = auth.uid())
    and coalesce(public.current_user_role(), '') <> 'field_lead'
  );

-- field_lead's estimate access: SELECT only (they never write an
-- estimate directly — matches permissions.ts, which grants them
-- estimate:view, nothing else), and only estimates belonging to a
-- project assigned to them.
drop policy if exists estimates_field_lead_assigned_select on public.estimates;
create policy estimates_field_lead_assigned_select on public.estimates
  for select using (
    public.current_user_role() = 'field_lead'
    and project_id in (select id from public.projects where assigned_user_id = auth.uid())
  );
