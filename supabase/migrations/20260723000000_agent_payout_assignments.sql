-- Wires the existing (legacy, already-RLS-protected) estimate_agents
-- assignment table into the same payout pattern estimate_subcontractors
-- already uses: agent_payments needs to reference a specific assignment
-- row so "assigned amount vs. paid so far" can be computed per-assignment,
-- exactly like subcontractor_payments.estimate_subcontractor_id already
-- does. No new tables — reusing estimate_agents and agent_payments.

alter table public.agent_payments
  add column if not exists estimate_agent_id uuid references public.estimate_agents(id) on delete set null;

create index if not exists idx_agent_payments_estimate_agent_id on public.agent_payments(estimate_agent_id);
