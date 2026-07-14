-- DRAFT — review before running.
--
-- Confirmed live: companies has name (text) and slug (text), among
-- others. slug's nullability/uniqueness wasn't confirmed, so
-- create_company_and_owner generates one from the name plus a short
-- random suffix rather than risk an insert failure on a NOT NULL/
-- UNIQUE constraint we can't see from here.
--
-- Three SECURITY DEFINER RPCs, same style as the public-signing RPCs
-- in 20260712235900_public_signing_rpcs.sql — each bypasses RLS
-- safely for exactly one atomic operation instead of needing broad
-- INSERT policies on companies/profiles (which would otherwise let a
-- client write company_id/role directly).
--
-- Both onboarding RPCs guard against a caller who already has a
-- company_id — this guard (not RLS) is what stops a logged-in user
-- from hopping companies via a stray invite link or double-creating a
-- company for themselves.

create or replace function public.create_company_and_owner(p_company_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_existing uuid;
  v_slug text;
begin
  select company_id into v_existing from public.profiles where id = auth.uid();
  if v_existing is not null then
    raise exception 'You already belong to a company.';
  end if;

  v_slug := regexp_replace(lower(trim(p_company_name)), '[^a-z0-9]+', '-', 'g')
    || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.companies (name, slug) values (p_company_name, v_slug)
    returning id into v_company_id;

  insert into public.profiles (id, company_id, role)
    values (auth.uid(), v_company_id, 'owner')
  on conflict (id) do update set company_id = v_company_id, role = 'owner';

  return v_company_id;
end;
$$;

grant execute on function public.create_company_and_owner(text) to authenticated;

create or replace function public.redeem_company_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_existing uuid;
begin
  select company_id into v_existing from public.profiles where id = auth.uid();
  if v_existing is not null then
    raise exception 'You already belong to a company.';
  end if;

  select * into v_invite from public.company_invites
    where token = p_token
    for update;

  if v_invite is null then
    raise exception 'Invite not found.';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'This invite has already been used or revoked.';
  end if;
  if v_invite.expires_at < now() then
    update public.company_invites set status = 'expired' where id = v_invite.id;
    raise exception 'This invite has expired.';
  end if;

  insert into public.profiles (id, company_id, role)
    values (auth.uid(), v_invite.company_id, v_invite.role)
  on conflict (id) do update set company_id = v_invite.company_id, role = v_invite.role;

  update public.company_invites
    set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    where id = v_invite.id;

  return v_invite.company_id;
end;
$$;

grant execute on function public.redeem_company_invite(uuid) to authenticated;

-- The Team page needs teammate emails, which RLS can't expose by
-- letting the client join into auth.users directly.
create or replace function public.list_company_members()
returns table(id uuid, email text, role text)
language sql
security definer
set search_path = public
as $$
  select p.id, u.email, p.role
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.company_id = public.current_company_id();
$$;

grant execute on function public.list_company_members() to authenticated;
