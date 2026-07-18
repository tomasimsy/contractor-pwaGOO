-- Add agent reimbursement tracking
-- Allows marking an expense as paid by an agent, creating a reimbursement obligation

-- Add paid_by_agent_id to estimate_expenses to track which agent paid for the expense
alter table public.estimate_expenses
  add column if not exists paid_by_agent_id uuid references public.sales_agents(id) on delete set null;

-- Add payment_type to agent_payments to distinguish commission from reimbursement
-- commission: agent commission earned on project
-- reimbursement: money owed back to agent for expenses they paid on behalf of project
alter table public.agent_payments
  add column if not exists payment_type varchar(20) default 'commission';

-- Link reimbursement payments back to the original expense they're reimbursing
alter table public.agent_payments
  add column if not exists expense_id uuid references public.estimate_expenses(id) on delete set null;

-- Create indexes for faster lookups
create index if not exists idx_estimate_expenses_paid_by_agent_id
  on public.estimate_expenses(paid_by_agent_id);

create index if not exists idx_agent_payments_payment_type
  on public.agent_payments(payment_type);

create index if not exists idx_agent_payments_expense_id
  on public.agent_payments(expense_id);

-- Add RLS policy: users can only see agent reimbursements for their company
-- (existing RLS on agent_payments already scopes by company_id via estimate_id)
