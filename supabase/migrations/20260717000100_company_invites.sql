-- DRAFT — review before running.
--
-- New table backing the "invite a teammate" flow: an Owner generates a
-- row here, shares the resulting link (…/onboarding?invite=<token>)
-- manually (no email is sent by the app), and the invitee's account
-- redeems it via the redeem_company_invite RPC in the next migration.
--
-- role is check-constrained to 'member' only — only Owners invite, and
-- there's never a reason to invite a second Owner via link (an owner
-- transfer, if ever needed, is out of scope).
--
-- status is a text enum, not a soft-delete: revoking an invite is a
-- state transition (status = 'revoked'), not a row delete — nothing
-- ever calls .delete() on this table, so it deliberately does NOT get
-- the generic trg_soft_delete trigger (see
-- 20260715000200_soft_delete_trigger.sql) — there'd be no caller to
-- intercept. It DOES join the generic audit-stamping trigger
-- (trg_audit_fields) for created_by/updated_by/updated_at, consistent
-- with the rest of the app's business tables.

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  role text not null default 'member' check (role = 'member'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.company_invites enable row level security;

-- Only members of a company can see its invites; only Owners can
-- create or update (revoke) them. No public/anonymous policy at all —
-- an unauthenticated visitor with just a token can never query this
-- table directly to enumerate tokens; redemption goes through the
-- SECURITY DEFINER redeem_company_invite RPC instead.
drop policy if exists company_invites_select on public.company_invites;
create policy company_invites_select on public.company_invites
  for select using (company_id = public.current_company_id());

drop policy if exists company_invites_insert on public.company_invites;
create policy company_invites_insert on public.company_invites
  for insert with check (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

drop policy if exists company_invites_update on public.company_invites;
create policy company_invites_update on public.company_invites
  for update using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

drop trigger if exists trg_audit_fields on public.company_invites;
create trigger trg_audit_fields
  before insert or update on public.company_invites
  for each row execute function public.set_audit_fields();
