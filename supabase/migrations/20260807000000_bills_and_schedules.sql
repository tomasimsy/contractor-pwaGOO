-- =====================================================================
-- Bills + recurring bill schedules — ADDITIVE ONLY.
--
-- No existing column is altered, dropped or retyped. No trigger, view,
-- policy or calculation changes. Every figure FinancialEngine produces
-- is identical before and after this migration.
--
-- ---------------------------------------------------------------------
-- WHY THESE TWO COLUMNS, AND WHY ON estimate_expenses
-- ---------------------------------------------------------------------
-- A vendor bill is already almost entirely representable by an existing
-- expense row: vendor, amount, expense_date, category, project_id,
-- notes, payee_type/payee_id, payment_method, is_paid and the receipt_*
-- columns all exist. `calculateExpenseTotals` already computes `unpaid`
-- (rows where is_paid is false), so even the Outstanding figure needs no
-- new arithmetic.
--
-- Two facts genuinely cannot be derived from what is there:
--
--   due_date     Overdue / Due Soon / Upcoming IS the Bills workflow.
--                `expense_date` is when the cost was INCURRED, which is
--                a different fact — a bill dated Aug 1 can be due Sep 1.
--                Nothing in the schema implies a due date.
--
--   bill_number  The vendor's own invoice number, used to reconcile
--                against their statement. It could be buried in `notes`,
--                but then it is not searchable, not indexable, and
--                competes with real notes.
--
-- Putting them HERE rather than in a separate `bills` table is the whole
-- point of the design:
--
--   A BILL IS AN EXPENSE THAT HAS A DUE DATE.
--
-- That makes the hard requirement — "if a subcontractor sends an actual
-- invoice, attach a bill to the EXISTING $4,000 expense without creating
-- another $4,000 expense" — a simple UPDATE of two nullable fields on
-- the row that already exists. There is no second record to reconcile,
-- no join table, and no possible way to double-count, because the cost
-- was and remains exactly one `estimate_expenses` row.
--
-- A separate `bills` table would have required either duplicating the
-- amount (double-counting risk) or a link table plus rules about which
-- side owns the money. Both were rejected for that reason.
--
-- NOT ADDED: `amount_paid`. Partial payment is deliberately out of
-- scope — `is_paid` is a boolean and no part of the expense or payment
-- architecture tracks a paid-to-date figure. Adding one would create a
-- second source of truth for "how much is settled" alongside the
-- existing is_paid/reimbursement_status model.
-- ---------------------------------------------------------------------

alter table public.estimate_expenses
  add column if not exists due_date date,
  add column if not exists bill_number text;

comment on column public.estimate_expenses.due_date is
  'When this cost is DUE (not when it was incurred — that is expense_date). Non-null marks the row as a Bill: something received from a vendor/payee with a payment deadline. Null for ordinary job costs. No financial calculation reads this column.';

comment on column public.estimate_expenses.bill_number is
  'The vendor''s own invoice/bill number, for reconciling against their statement. Free text, nullable.';

-- Bills lists are "unpaid, ordered by due date, for this company" —
-- a partial index keyed exactly to that, and to nothing else.
create index if not exists estimate_expenses_bills_due_idx
  on public.estimate_expenses (company_id, due_date)
  where due_date is not null and deleted_at is null;

-- =====================================================================
-- bill_schedules — the RECURRENCE RULE. Not a cost.
--
-- WHY A TABLE IS NECESSARY: a recurring bill is a template ("$450
-- insurance, monthly, on the 10th"), not money owed. Storing it as an
-- expense row would book a cost that has not happened, inflating job
-- cost and company P&L on creation — the exact double-counting this
-- whole design avoids. It has no natural home on any existing table.
--
-- A schedule holds NO amount that any calculation reads. When an
-- occurrence comes due, the app writes ONE ordinary estimate_expenses
-- row (with a due_date, i.e. a Bill) and advances `next_due_date`.
-- The generated row is the only financial record; the schedule is
-- bookkeeping about when to create the next one.
-- =====================================================================

create table if not exists public.bill_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,

  -- The template an occurrence is stamped from. Mirrors the expense
  -- columns it will populate, so generating one is a straight copy.
  vendor text,
  amount numeric(12, 2) not null default 0,
  expense_type text not null default 'miscellaneous',
  notes text,

  -- Recurrence.
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  interval_count integer not null default 1 check (interval_count >= 1),
  start_date date not null,
  /** Which date the NEXT occurrence is due. Advanced after each
   * generation; this is what makes generation idempotent. */
  next_due_date date not null,
  /** Null = never ends. */
  end_date date,
  /** Null = unlimited. Counts occurrences actually generated. */
  max_occurrences integer check (max_occurrences is null or max_occurrences >= 1),
  occurrences_generated integer not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  delete_reason text,

  constraint bill_schedules_amount_non_negative check (amount >= 0)
);

create index if not exists bill_schedules_due_idx
  on public.bill_schedules (company_id, next_due_date)
  where is_active and deleted_at is null;

comment on table public.bill_schedules is
  'Recurring bill TEMPLATES. Holds no cost: generating an occurrence writes one ordinary estimate_expenses row (with a due_date). No FinancialEngine input reads this table.';

alter table public.bill_schedules enable row level security;

drop policy if exists bill_schedules_select on public.bill_schedules;
create policy bill_schedules_select on public.bill_schedules
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists bill_schedules_insert on public.bill_schedules;
create policy bill_schedules_insert on public.bill_schedules
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists bill_schedules_update on public.bill_schedules;
create policy bill_schedules_update on public.bill_schedules
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists bill_schedules_delete on public.bill_schedules;
create policy bill_schedules_delete on public.bill_schedules
  for delete to authenticated
  using (company_id = public.current_company_id());

-- ---------------------------------------------------------------------
-- VERIFY — before AND after, these must be identical:
--   select count(*), sum(amount) from public.estimate_expenses where deleted_at is null;
--   select count(*) from public.estimate_agents where deleted_at is null;
--
-- New columns exist and are empty (every existing row is still a plain
-- expense, not a bill):
--   select count(*) filter (where due_date is not null) as bills,
--          count(*) as total
--     from public.estimate_expenses where deleted_at is null;   -- 0 bills
--
-- RLS on the new table:
--   select policyname, cmd from pg_policies
--    where tablename = 'bill_schedules' order by 1;             -- 4 rows
--
-- ROLLBACK:
--   drop table if exists public.bill_schedules;
--   drop index if exists public.estimate_expenses_bills_due_idx;
--   alter table public.estimate_expenses
--     drop column if exists due_date,
--     drop column if exists bill_number;
-- ---------------------------------------------------------------------
