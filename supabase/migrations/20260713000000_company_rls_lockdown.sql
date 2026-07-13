-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Not executed automatically by anyone.
--
-- Why this exists: live read-only testing against the production
-- Supabase REST API (using only the public anon key already in
-- .env.local — no login) showed that `estimates`, `clients`,
-- `profiles`, and `estimate_images` currently return real rows to a
-- completely unauthenticated request. That means anyone on the
-- internet who has your project URL and anon key (which is not a
-- secret — it ships inside your deployed app's JS bundle) can read
-- every company's estimates, every client's name/phone/email, your
-- full admin user directory, and estimate photo metadata right now.
--
-- `invoices`, `estimate_expenses`, `subcontractor_payments`,
-- `agent_payments`, and `company_settings` returned empty for the same
-- anonymous request, which is a good sign for those specifically — but
-- that was only tested as a fully anonymous caller. It does NOT confirm
-- that a logged-in user from Company A is blocked from Company B's rows
-- on those tables — several queries in the app code (see the audit)
-- fetch by id alone with no company_id filter, so if a policy on these
-- tables only checks "is authenticated" rather than "is authenticated
-- AND company matches," the same class of leak could still exist
-- between two real accounts. Test that with two accounts from two
-- different companies before considering this closed.
--
-- IMPORTANT — read before running:
-- 1. This assumes every table below actually has a `company_id`
--    column. Spot-check each one in the Supabase table editor first;
--    comment out any block for a table where that's not true, or add
--    the column first.
-- 2. Run 20260712235900_public_signing_rpcs.sql FIRST, and confirm
--    both app/public/estimates/[id] and app/public/invoices/[id] still
--    load and can sign/approve/reject end to end against those RPCs
--    (the frontend has already been switched to call them). Only after
--    that's verified should this file run — those pages currently rely
--    on exactly the open anon table access this migration removes.
-- 3. `profiles` uses a SECURITY DEFINER helper function below so its
--    own RLS policy can look up the caller's company_id without
--    recursively re-triggering RLS on itself.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: the caller's own company_id, bypassing RLS internally so it
-- can be safely used inside every policy below (including profiles').
-- ---------------------------------------------------------------------
create or replace function public.current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- profiles — a user may see their own row, and other profiles in their
-- own company (needed for name lookups like "locked_by", agent lists).
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

 

-- ---------------------------------------------------------------------
-- Standard company-scoped CRUD template, applied per table below.
-- Adjust the insert/update/delete policies per table if a role beyond
-- "any company member" should be required (e.g. only admins can
-- delete) — none of that distinction exists in the app today, so this
-- mirrors current behavior rather than inventing new restrictions.
-- ---------------------------------------------------------------------

-- estimates
alter table public.estimates enable row level security;
create policy "estimates_insert" on public.estimates for insert with check (company_id = public.current_company_id());
create policy "estimates_update" on public.estimates for update using (company_id = public.current_company_id());
create policy "estimates_delete" on public.estimates for delete using (company_id = public.current_company_id());

-- clients
alter table public.clients enable row level security;
create policy "clients_select" on public.clients for select using (company_id = public.current_company_id());
create policy "clients_insert" on public.clients for insert with check (company_id = public.current_company_id());
create policy "clients_update" on public.clients for update using (company_id = public.current_company_id());
create policy "clients_delete" on public.clients for delete using (company_id = public.current_company_id());

-- invoices
alter table public.invoices enable row level security;
create policy "invoices_select" on public.invoices for select using (company_id = public.current_company_id());
create policy "invoices_insert" on public.invoices for insert with check (company_id = public.current_company_id());
create policy "invoices_update" on public.invoices for update using (company_id = public.current_company_id());
create policy "invoices_delete" on public.invoices for delete using (company_id = public.current_company_id());

-- estimate_expenses
alter table public.estimate_expenses enable row level security;
create policy "estimate_expenses_select" on public.estimate_expenses for select using (company_id = public.current_company_id());
create policy "estimate_expenses_insert" on public.estimate_expenses for insert with check (company_id = public.current_company_id());
create policy "estimate_expenses_update" on public.estimate_expenses for update using (company_id = public.current_company_id());
create policy "estimate_expenses_delete" on public.estimate_expenses for delete using (company_id = public.current_company_id());

-- subcontractor_payments
alter table public.subcontractor_payments enable row level security;
create policy "subcontractor_payments_select" on public.subcontractor_payments for select using (company_id = public.current_company_id());
create policy "subcontractor_payments_insert" on public.subcontractor_payments for insert with check (company_id = public.current_company_id());
create policy "subcontractor_payments_update" on public.subcontractor_payments for update using (company_id = public.current_company_id());
create policy "subcontractor_payments_delete" on public.subcontractor_payments for delete using (company_id = public.current_company_id());

-- agent_payments
alter table public.agent_payments enable row level security;
create policy "agent_payments_select" on public.agent_payments for select using (company_id = public.current_company_id());
create policy "agent_payments_insert" on public.agent_payments for insert with check (company_id = public.current_company_id());
create policy "agent_payments_update" on public.agent_payments for update using (company_id = public.current_company_id());
create policy "agent_payments_delete" on public.agent_payments for delete using (company_id = public.current_company_id());

-- estimate_subcontractors
alter table public.estimate_subcontractors enable row level security;
create policy "estimate_subcontractors_select" on public.estimate_subcontractors for select using (company_id = public.current_company_id());
create policy "estimate_subcontractors_insert" on public.estimate_subcontractors for insert with check (company_id = public.current_company_id());
create policy "estimate_subcontractors_update" on public.estimate_subcontractors for update using (company_id = public.current_company_id());
create policy "estimate_subcontractors_delete" on public.estimate_subcontractors for delete using (company_id = public.current_company_id());

-- estimate_agents
alter table public.estimate_agents enable row level security;
create policy "estimate_agents_select" on public.estimate_agents for select using (company_id = public.current_company_id());
create policy "estimate_agents_insert" on public.estimate_agents for insert with check (company_id = public.current_company_id());
create policy "estimate_agents_update" on public.estimate_agents for update using (company_id = public.current_company_id());
create policy "estimate_agents_delete" on public.estimate_agents for delete using (company_id = public.current_company_id());

-- subcontractors (roster)
alter table public.subcontractors enable row level security;
create policy "subcontractors_select" on public.subcontractors for select using (company_id = public.current_company_id());
create policy "subcontractors_insert" on public.subcontractors for insert with check (company_id = public.current_company_id());
create policy "subcontractors_update" on public.subcontractors for update using (company_id = public.current_company_id());
create policy "subcontractors_delete" on public.subcontractors for delete using (company_id = public.current_company_id());

-- agents (roster)
alter table public.agents enable row level security;
create policy "agents_select" on public.agents for select using (company_id = public.current_company_id());
create policy "agents_insert" on public.agents for insert with check (company_id = public.current_company_id());
create policy "agents_update" on public.agents for update using (company_id = public.current_company_id());
create policy "agents_delete" on public.agents for delete using (company_id = public.current_company_id());

-- estimate_items (verify company_id exists here — if not, join through estimate_id via a subquery policy instead)
alter table public.estimate_items enable row level security;
create policy "estimate_items_select" on public.estimate_items for select using (
  exists (select 1 from public.estimates e where e.id = estimate_items.estimate_id and e.company_id = public.current_company_id())
);
create policy "estimate_items_write" on public.estimate_items for all using (
  exists (select 1 from public.estimates e where e.id = estimate_items.estimate_id and e.company_id = public.current_company_id())
) with check (
  exists (select 1 from public.estimates e where e.id = estimate_items.estimate_id and e.company_id = public.current_company_id())
);

-- invoice_items (same pattern, scoped through invoices)
alter table public.invoice_items enable row level security;
create policy "invoice_items_select" on public.invoice_items for select using (
  exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.company_id = public.current_company_id())
);
create policy "invoice_items_write" on public.invoice_items for all using (
  exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.company_id = public.current_company_id())
) with check (
  exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.company_id = public.current_company_id())
);

-- invoice_payments
alter table public.invoice_payments enable row level security;
create policy "invoice_payments_select" on public.invoice_payments for select using (
  exists (select 1 from public.invoices i where i.id = invoice_payments.invoice_id and i.company_id = public.current_company_id())
);
create policy "invoice_payments_write" on public.invoice_payments for all using (
  exists (select 1 from public.invoices i where i.id = invoice_payments.invoice_id and i.company_id = public.current_company_id())
) with check (
  exists (select 1 from public.invoices i where i.id = invoice_payments.invoice_id and i.company_id = public.current_company_id())
);

-- estimate_payments is intentionally NOT locked down here — it's dead
-- (nothing ever wrote to it) and gets dropped entirely by
-- 20260713000200_drop_duplicate_payment_tracking.sql. No policy needed
-- for a table that's going away.

-- change_orders / change_order_line_items
alter table public.change_orders enable row level security;
create policy "change_orders_select" on public.change_orders for select using (company_id = public.current_company_id());
create policy "change_orders_write" on public.change_orders for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

alter table public.change_order_line_items enable row level security;
create policy "change_order_line_items_select" on public.change_order_line_items for select using (
  exists (select 1 from public.change_orders c where c.id = change_order_line_items.change_order_id and c.company_id = public.current_company_id())
);
create policy "change_order_line_items_write" on public.change_order_line_items for all using (
  exists (select 1 from public.change_orders c where c.id = change_order_line_items.change_order_id and c.company_id = public.current_company_id())
) with check (
  exists (select 1 from public.change_orders c where c.id = change_order_line_items.change_order_id and c.company_id = public.current_company_id())
);

-- company_settings
alter table public.company_settings enable row level security;
create policy "company_settings_select" on public.company_settings for select using (company_id = public.current_company_id());
create policy "company_settings_write" on public.company_settings for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

-- estimate_images — confirmed leaking real rows to anonymous requests
-- during the audit (same class of issue as estimates/clients/profiles).
alter table public.estimate_images enable row level security;
create policy "estimate_images_select" on public.estimate_images for select using (company_id = public.current_company_id());
create policy "estimate_images_write" on public.estimate_images for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

-- documents
alter table public.documents enable row level security;
create policy "documents_select" on public.documents for select using (company_id = public.current_company_id());
create policy "documents_write" on public.documents for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

-- mileage_trips
alter table public.mileage_trips enable row level security;
create policy "mileage_trips_select" on public.mileage_trips for select using (company_id = public.current_company_id());
create policy "mileage_trips_write" on public.mileage_trips for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

-- project_milestones
alter table public.project_milestones enable row level security;
create policy "project_milestones_select" on public.project_milestones for select using (company_id = public.current_company_id());
create policy "project_milestones_write" on public.project_milestones for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

-- NOTE: `teams` and `project_progress` were referenced in the codebase
-- grep but don't exist under those names in the live schema (checked
-- directly — PostgREST returned "table not found in schema cache" for
-- both). If those features are live under different table names,
-- confirm and add matching policies before considering this complete.
