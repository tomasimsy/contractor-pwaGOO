-- Add reimbursement support to subcontractor_payments
-- Allows distinguishing between contract payments and reimbursements

alter table public.subcontractor_payments
  add column if not exists payment_type varchar(20) default 'payment';

-- Add index for faster filtering by payment type
create index if not exists idx_subcontractor_payments_payment_type
  on public.subcontractor_payments(payment_type);

-- Add comment
comment on column public.subcontractor_payments.payment_type is
  'Type of payment: payment (contract) or reimbursement (owed back)';

-- Ensure both agent and subcontractor payments have proper type tracking
-- (agent_payments already has payment_type from previous migration)
