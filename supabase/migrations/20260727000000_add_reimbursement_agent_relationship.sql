-- Add reimbursement_from_agent_id to track agent responsible for reimbursement
-- This is a optional relationship field, not a separate expense type

alter table public.subcontractor_payments
  add column if not exists reimbursement_from_agent_id uuid references public.agents(id) on delete set null;

create index if not exists idx_subcontractor_payments_reimbursement_agent
  on public.subcontractor_payments(reimbursement_from_agent_id);

alter table public.agent_payments
  add column if not exists reimbursement_from_agent_id uuid references public.agents(id) on delete set null;

create index if not exists idx_agent_payments_reimbursement_agent
  on public.agent_payments(reimbursement_from_agent_id);

-- Add comments
comment on column public.subcontractor_payments.reimbursement_from_agent_id is
  'Optional: agent responsible for reimbursing this subcontractor payment';

comment on column public.agent_payments.reimbursement_from_agent_id is
  'Optional: agent responsible for reimbursing this commission';
