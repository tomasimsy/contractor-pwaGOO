-- =====================================================================
-- The team list (emails and roles of company members) is for office roles.
-- An employee login gets an empty list instead of the whole team.
--
-- Same signature and return columns as before, so existing callers keep working.
-- ---------------------------------------------------------------------

create or replace function public.list_company_members()
returns table (id uuid, email text, role text, disabled_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select p.id, u.email, p.role, p.disabled_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.company_id = public.current_company_id()
    and coalesce(public.current_user_role(), '') <> 'employee'
$$;
