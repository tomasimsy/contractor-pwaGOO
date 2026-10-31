-- =====================================================================
-- Payments to people: employees (hourly, day rate, job pay) and team members
-- (fixed amount per job).
--
-- One record per payment. A payment is never deleted: a mistake is reversed
-- with a reason, and the reversed row stays in the history.
--
-- Team payments also write a labor expense on the estimate (see the payroll
-- service), so job cost stays correct. Employee payments write no expense:
-- their cost already comes from approved hours.
-- ---------------------------------------------------------------------

create table if not exists public.payee_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  payee_kind text not null check (payee_kind in ('employee', 'team')),
  employee_id uuid references public.employees(id),
  profile_id uuid references public.profiles(id),
  estimate_id uuid references public.estimates(id),
  expense_id uuid references public.estimate_expenses(id),
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null,
  method text not null,
  reference text,
  notes text,
  covers text,
  reversed_at timestamptz,
  reversal_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (
    (payee_kind = 'employee' and employee_id is not null)
    or (payee_kind = 'team' and profile_id is not null)
  )
);

create index if not exists payee_payments_company_idx on public.payee_payments (company_id, paid_on);
create index if not exists payee_payments_employee_idx on public.payee_payments (employee_id);
create index if not exists payee_payments_team_idx on public.payee_payments (profile_id, estimate_id);

alter table public.payee_payments enable row level security;

-- Office roles and accountants see every payment. A person sees their own.
drop policy if exists payee_payments_select on public.payee_payments;
create policy payee_payments_select on public.payee_payments for select using (
  company_id = public.current_company_id()
  and (
    coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager', 'accountant')
    or employee_id in (select id from public.employees where profile_id = auth.uid())
    or profile_id = auth.uid()
  )
);

-- Only office roles record or reverse payments.
drop policy if exists payee_payments_insert on public.payee_payments;
create policy payee_payments_insert on public.payee_payments for insert with check (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
);

drop policy if exists payee_payments_update on public.payee_payments;
create policy payee_payments_update on public.payee_payments for update using (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
) with check (
  company_id = public.current_company_id()
  and coalesce(public.current_user_role(), '') in ('admin', 'office', 'project_manager')
);
