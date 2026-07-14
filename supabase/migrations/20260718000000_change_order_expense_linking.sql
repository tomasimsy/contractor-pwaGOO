-- DRAFT — review before running.
--
-- Two things:
-- 1. change_orders is missing two fields the Expense-page Change Order
--    feature's spec requires: `tax` and a standalone `notes` field
--    (today it only has `description`).
-- 2. estimate_expenses / subcontractor_payments / agent_payments get an
--    optional link to a specific change_order — null means "belongs to
--    the original estimate scope," which is the default and unaffected
--    by this migration. ON DELETE SET NULL: change_orders never gets a
--    real DELETE today (trg_soft_delete intercepts it), but if it ever
--    did, linked expenses fall back to "original estimate" rather than
--    being cascaded away.

alter table public.change_orders add column if not exists tax numeric not null default 0;
alter table public.change_orders add column if not exists notes text;

alter table public.estimate_expenses add column if not exists change_order_id uuid references public.change_orders(id) on delete set null;
alter table public.subcontractor_payments add column if not exists change_order_id uuid references public.change_orders(id) on delete set null;
alter table public.agent_payments add column if not exists change_order_id uuid references public.change_orders(id) on delete set null;

create index if not exists idx_estimate_expenses_change_order_id on public.estimate_expenses(change_order_id);
create index if not exists idx_subcontractor_payments_change_order_id on public.subcontractor_payments(change_order_id);
create index if not exists idx_agent_payments_change_order_id on public.agent_payments(change_order_id);

-- No RLS changes needed: all three tables are already scoped by
-- company_id via existing policies, unaffected by an added nullable
-- column, and change_orders itself is already correctly scoped
-- (see 20260713000000_company_rls_lockdown.sql).
