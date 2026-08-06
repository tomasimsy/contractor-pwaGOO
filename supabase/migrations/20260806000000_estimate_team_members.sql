-- =====================================================================
-- Team member assignments on an estimate — ADDITIVE ONLY.
--
-- Nothing existing is altered. No column is added to, removed from, or
-- retyped on any current table. Agents, commissions, payments, expenses
-- and every FinancialEngine input are untouched by this file.
--
-- WHY A NEW TABLE IS NECESSARY (and it genuinely is)
-- The app already has two assignment tables, and neither can hold this:
--
--   estimate_agents          agent_id  -> agents        (sales agents)
--   estimate_subcontractors  subcontractor_id -> subcontractors
--
-- A team member is a `profiles` row — someone who logs in. Reusing
-- either table would mean writing a profile id into a column whose
-- foreign key points at a different table: it would fail outright, or
-- (worse) silently corrupt getPayeeBalances, which reads those tables
-- by role. Modelling the assignment as an expense was the other option
-- and is wrong for a different reason: an assignment is a COMMITMENT,
-- not money spent, and writing one into estimate_expenses would inflate
-- job cost and company P&L the moment it was created.
--
-- So the shape below is deliberately a mirror of `estimate_agents` —
-- same columns, same audit/soft-delete discipline, same RLS shape —
-- with the one difference that matters: user_id -> profiles.
--
--   amount  the ASSIGNED LABOR figure (a commitment, like
--           estimate_agents.amount). It is NOT a cost and nothing in
--           FinancialEngine reads this table, so no total moves.
--   notes   free text, same as estimate_agents.notes.
--
-- The money a team member is actually OWED is not stored here. It is
-- already derivable from estimate_expenses rows where paid_by =
-- 'employee' and paid_by_id = the member — the exact rows
-- ExpenseService.listPendingReimbursements already returns. That is why
-- this table has no reimbursement columns: adding them would create a
-- second source of truth for a number the expense rows already answer.
--
-- FUTURE (labor payments): a payment to a team member is ONE EXPENSE
-- RECORD, exactly like a subcontractor payout — an estimate_expenses
-- row typed `labor`, tagged with the payee. No schema change needed,
-- which is the point of not putting balances in this table.
-- =====================================================================

create table if not exists public.estimate_team_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  -- profiles.id IS the auth user id, and is what estimate_expenses
  -- .paid_by_id already holds for an employee-paid cost. Keeping the
  -- same key is what lets the UI join assignments to what someone is
  -- owed without any mapping table.
  user_id uuid not null references public.profiles(id) on delete cascade,

  /** Assigned labor — a commitment, not a cost. Mirrors estimate_agents.amount. */
  amount numeric(12, 2) not null default 0,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  delete_reason text,

  -- One live assignment per person per estimate. Partial, so a
  -- soft-deleted assignment does not block re-assigning them later.
  constraint estimate_team_members_amount_non_negative check (amount >= 0)
);

create unique index if not exists estimate_team_members_unique_active
  on public.estimate_team_members (estimate_id, user_id)
  where deleted_at is null;

create index if not exists estimate_team_members_estimate_idx
  on public.estimate_team_members (company_id, estimate_id)
  where deleted_at is null;

create index if not exists estimate_team_members_user_idx
  on public.estimate_team_members (company_id, user_id)
  where deleted_at is null;

comment on table public.estimate_team_members is
  'Team members (profiles) assigned to an estimate, with an assigned-labor commitment. Additive: no FinancialEngine input reads this table, so no existing total changes. Amounts owed come from estimate_expenses (paid_by=employee), not from here.';

-- ---------------------------------------------------------------------
-- RLS — identical shape to every other business table: scoped by
-- current_company_id(). Without this, RLS denies by default and the
-- feature cannot work at all.
-- ---------------------------------------------------------------------
alter table public.estimate_team_members enable row level security;

drop policy if exists estimate_team_members_select on public.estimate_team_members;
create policy estimate_team_members_select on public.estimate_team_members
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists estimate_team_members_insert on public.estimate_team_members;
create policy estimate_team_members_insert on public.estimate_team_members
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists estimate_team_members_update on public.estimate_team_members;
create policy estimate_team_members_update on public.estimate_team_members
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists estimate_team_members_delete on public.estimate_team_members;
create policy estimate_team_members_delete on public.estimate_team_members
  for delete to authenticated
  using (company_id = public.current_company_id());

-- ---------------------------------------------------------------------
-- VERIFY
--   select count(*) from public.estimate_team_members;              -- 0
--   select relrowsecurity from pg_class
--    where oid = 'public.estimate_team_members'::regclass;          -- true
--   select policyname, cmd from pg_policies
--    where tablename = 'estimate_team_members' order by 1;          -- 4 rows
--
-- Confirm NOTHING existing moved (run before and after — identical):
--   select sum(amount) from public.estimate_expenses where deleted_at is null;
--   select count(*) from public.estimate_agents where deleted_at is null;
--
-- ROLLBACK (safe — nothing else references this table):
--   drop table if exists public.estimate_team_members;
-- ---------------------------------------------------------------------
