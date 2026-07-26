-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Phase 4 of the project-centered
-- architecture migration. Run after 20260728000200_backfill_projects_from_estimates.sql.
--
-- financial_transactions is a NEW, additive, append-only ledger — it
-- does not replace invoice_payments / subcontractor_payments /
-- agent_payments / estimate_expenses / mileage_trips, which remain the
-- system-of-record for each payment type exactly as they are today.
-- Instead, one mirrored row is written here for every money-movement
-- row in those tables, tagged with the project_id it belongs to. This
-- is what gives every future report/dashboard/tax page a single table
-- to query ("all money in and out of this project or company, by
-- date") instead of the current pattern of five separate queries and
-- a hand-written reduce() per page — the exact duplication problem
-- documented in FINANCIAL_CONSOLIDATION_PLAN.md.
--
-- Deliberately NOT created as a replacement for the source tables:
-- rewriting every insert/update call site across the app in one
-- migration is the highest-risk way to do this. Mirroring via trigger
-- is additive and reversible — the ledger can be dropped at any time
-- with zero data loss, since it holds no information that doesn't
-- already exist in its source table.
-- =====================================================================

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  direction text not null check (direction in ('income', 'expense')),
  category text not null check (category in (
    'customer_payment', 'subcontractor_payment', 'agent_commission',
    'agent_reimbursement', 'material_expense', 'labor_expense',
    'other_expense', 'mileage_reimbursement'
  )),
  -- Which table/row this entry mirrors — lets the ledger stay a thin,
  -- derived projection instead of a second place amounts are typed in.
  source_table text not null,
  source_id uuid not null,
  amount numeric(12, 2) not null,
  transaction_date date not null default current_date,
  payment_method text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (source_table, source_id)
);

comment on table public.financial_transactions is
  'Derived, append-only ledger mirroring every money-movement row (customer payments, subcontractor/agent payments, expenses, mileage) tagged by project. Source tables remain authoritative — this table is safe to drop and rebuild at any time from them.';

create index if not exists financial_transactions_project_id_idx on public.financial_transactions(project_id) where deleted_at is null;
create index if not exists financial_transactions_company_date_idx on public.financial_transactions(company_id, transaction_date) where deleted_at is null;
create index if not exists financial_transactions_category_idx on public.financial_transactions(company_id, category) where deleted_at is null;

alter table public.financial_transactions enable row level security;

drop policy if exists financial_transactions_select on public.financial_transactions;
create policy financial_transactions_select on public.financial_transactions
  for select using (company_id = public.current_company_id());

-- Insert/update/delete are NOT exposed to normal company-scoped policy
-- here on purpose: the whole point of this table is that it is only
-- ever written by the mirror triggers below (SECURITY DEFINER), never
-- directly by the app. This prevents the ledger and its source table
-- from ever silently disagreeing because someone wrote to one and not
-- the other.
drop policy if exists financial_transactions_no_direct_write on public.financial_transactions;

drop trigger if exists trg_audit_fields on public.financial_transactions;
create trigger trg_audit_fields
  before insert or update on public.financial_transactions
  for each row execute function public.set_audit_fields();

-- ---------------------------------------------------------------------
-- Mirror triggers — one per source table. Each upserts a single
-- financial_transactions row on insert/update, and marks it deleted
-- when the source row is (soft-)deleted, keeping category/project_id/
-- amount always in sync with the row it mirrors.
-- ---------------------------------------------------------------------

create or replace function public.mirror_invoice_payment()
returns trigger
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_project_id uuid;
begin
  select i.company_id, i.project_id into v_company_id, v_project_id
  from public.invoices i where i.id = new.invoice_id;

  insert into public.financial_transactions (
    company_id, project_id, direction, category, source_table, source_id,
    amount, transaction_date, payment_method, notes, deleted_at
  ) values (
    v_company_id, v_project_id, 'income', 'customer_payment', 'invoice_payments', new.id,
    new.amount, coalesce(new.payment_date, new.created_at::date), new.method, new.notes, new.deleted_at
  )
  on conflict (source_table, source_id) do update set
    amount = excluded.amount,
    transaction_date = excluded.transaction_date,
    payment_method = excluded.payment_method,
    notes = excluded.notes,
    project_id = excluded.project_id,
    deleted_at = excluded.deleted_at;

  return new;
end;
$$;

drop trigger if exists trg_mirror_invoice_payment on public.invoice_payments;
create trigger trg_mirror_invoice_payment
  after insert or update on public.invoice_payments
  for each row execute function public.mirror_invoice_payment();

create or replace function public.mirror_subcontractor_payment()
returns trigger
language plpgsql
security definer
as $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id from public.estimate_subcontractors where id = new.estimate_subcontractor_id;

  insert into public.financial_transactions (
    company_id, project_id, direction, category, source_table, source_id,
    amount, transaction_date, payment_method, notes, deleted_at
  ) values (
    new.company_id, v_project_id, 'expense', 'subcontractor_payment', 'subcontractor_payments', new.id,
    new.amount, coalesce(new.payment_date::date, new.created_at::date), new.payment_method, new.notes, new.deleted_at
  )
  on conflict (source_table, source_id) do update set
    amount = excluded.amount,
    transaction_date = excluded.transaction_date,
    payment_method = excluded.payment_method,
    notes = excluded.notes,
    project_id = excluded.project_id,
    deleted_at = excluded.deleted_at;

  return new;
end;
$$;

drop trigger if exists trg_mirror_subcontractor_payment on public.subcontractor_payments;
create trigger trg_mirror_subcontractor_payment
  after insert or update on public.subcontractor_payments
  for each row execute function public.mirror_subcontractor_payment();

create or replace function public.mirror_agent_payment()
returns trigger
language plpgsql
security definer
as $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id from public.estimate_agents where id = new.estimate_agent_id;

  insert into public.financial_transactions (
    company_id, project_id, direction, category, source_table, source_id,
    amount, transaction_date, payment_method, notes, deleted_at
  ) values (
    new.company_id, v_project_id, 'expense',
    case when new.payment_type = 'reimbursement' then 'agent_reimbursement' else 'agent_commission' end,
    'agent_payments', new.id,
    new.amount, coalesce(new.payment_date::date, new.created_at::date), new.payment_method, new.notes, new.deleted_at
  )
  on conflict (source_table, source_id) do update set
    amount = excluded.amount,
    category = excluded.category,
    transaction_date = excluded.transaction_date,
    payment_method = excluded.payment_method,
    notes = excluded.notes,
    project_id = excluded.project_id,
    deleted_at = excluded.deleted_at;

  return new;
end;
$$;

drop trigger if exists trg_mirror_agent_payment on public.agent_payments;
create trigger trg_mirror_agent_payment
  after insert or update on public.agent_payments
  for each row execute function public.mirror_agent_payment();

create or replace function public.mirror_estimate_expense()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.financial_transactions (
    company_id, project_id, direction, category, source_table, source_id,
    amount, transaction_date, payment_method, notes, deleted_at
  ) values (
    new.company_id, new.project_id, 'expense',
    case new.category when 'material' then 'material_expense' when 'labor' then 'labor_expense' else 'other_expense' end,
    'estimate_expenses', new.id,
    new.amount, coalesce(new.expense_date, new.created_at::date), new.payment_method, new.notes, new.deleted_at
  )
  on conflict (source_table, source_id) do update set
    amount = excluded.amount,
    category = excluded.category,
    transaction_date = excluded.transaction_date,
    payment_method = excluded.payment_method,
    notes = excluded.notes,
    project_id = excluded.project_id,
    deleted_at = excluded.deleted_at;

  return new;
end;
$$;

drop trigger if exists trg_mirror_estimate_expense on public.estimate_expenses;
create trigger trg_mirror_estimate_expense
  after insert or update on public.estimate_expenses
  for each row execute function public.mirror_estimate_expense();

-- ---------------------------------------------------------------------
-- One-time backfill: mirror every existing row in the four source
-- tables now that the triggers exist for future rows. Re-running is
-- safe (on conflict upsert).
-- ---------------------------------------------------------------------
insert into public.financial_transactions (
  company_id, project_id, direction, category, source_table, source_id,
  amount, transaction_date, payment_method, notes, deleted_at
)
select i.company_id, i.project_id, 'income', 'customer_payment', 'invoice_payments', ip.id,
       ip.amount, coalesce(ip.payment_date, ip.created_at::date), ip.method, ip.notes, ip.deleted_at
from public.invoice_payments ip
join public.invoices i on i.id = ip.invoice_id
on conflict (source_table, source_id) do nothing;

insert into public.financial_transactions (
  company_id, project_id, direction, category, source_table, source_id,
  amount, transaction_date, payment_method, notes, deleted_at
)
select sp.company_id, es.project_id, 'expense', 'subcontractor_payment', 'subcontractor_payments', sp.id,
       sp.amount, coalesce(sp.payment_date::date, sp.created_at::date), sp.payment_method, sp.notes, sp.deleted_at
from public.subcontractor_payments sp
left join public.estimate_subcontractors es on es.id = sp.estimate_subcontractor_id
on conflict (source_table, source_id) do nothing;

insert into public.financial_transactions (
  company_id, project_id, direction, category, source_table, source_id,
  amount, transaction_date, payment_method, notes, deleted_at
)
select ap.company_id, ea.project_id, 'expense',
       case when ap.payment_type = 'reimbursement' then 'agent_reimbursement' else 'agent_commission' end,
       'agent_payments', ap.id,
       ap.amount, coalesce(ap.payment_date::date, ap.created_at::date), ap.payment_method, ap.notes, ap.deleted_at
from public.agent_payments ap
left join public.estimate_agents ea on ea.id = ap.estimate_agent_id
on conflict (source_table, source_id) do nothing;

insert into public.financial_transactions (
  company_id, project_id, direction, category, source_table, source_id,
  amount, transaction_date, payment_method, notes, deleted_at
)
select company_id, project_id, 'expense',
       case category when 'material' then 'material_expense' when 'labor' then 'labor_expense' else 'other_expense' end,
       'estimate_expenses', id,
       amount, coalesce(expense_date, created_at::date), payment_method, notes, deleted_at
from public.estimate_expenses
on conflict (source_table, source_id) do nothing;
