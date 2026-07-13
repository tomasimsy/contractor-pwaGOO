-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- Context: querying pg_policies directly revealed that almost every
-- table already had a correctly-written "Company isolation <table>"
-- policy from earlier development — but ALSO had one or more leftover
-- "allow everything" policies stacked alongside it (things like
-- "Enable all for authenticated users" with qual=true, or "Enable read
-- access for all users" scoped to the public role). Postgres OR's
-- multiple permissive policies together, so those leftover policies
-- were silently overriding the correct ones this whole time — that's
-- the actual root cause of the live data exposure, not a missing
-- policy.
--
-- Since "Company isolation <table>" already exists and is correct on
-- every table below, the policies added by
-- 20260713000000_company_rls_lockdown.sql are redundant duplicates of
-- the same logic and are dropped here too, rather than left in place
-- alongside the pre-existing ones — one policy per table, not two.
--
-- estimate_images specifically also had `rls_enabled = false` — RLS
-- was never actually turned on for it at all (independent of any
-- policy content), which is the real reason it kept leaking. Turning
-- it on here.
--
-- companies: found via a follow-up audit query to have RLS disabled
-- AND zero policies — fully open to anyone, not caught in the original
-- pass. Enabling RLS and scoping it to the caller's own company row
-- (this table's `id` IS the company id, not a company_id foreign key).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Drop the dangerous legacy policies. "Company isolation <table>" is
-- left untouched — it already does the right thing.
-- ---------------------------------------------------------------------

-- agent_payments
drop policy if exists "Enable all for authenticated users" on public.agent_payments;
drop policy if exists "agent_payments_delete" on public.agent_payments;
drop policy if exists "agent_payments_insert" on public.agent_payments;
drop policy if exists "agent_payments_select" on public.agent_payments;
drop policy if exists "agent_payments_update" on public.agent_payments;

-- agents
drop policy if exists "agents_delete" on public.agents;
drop policy if exists "agents_insert" on public.agents;
drop policy if exists "agents_select" on public.agents;
drop policy if exists "agents_update" on public.agents;

-- change_order_line_items
drop policy if exists "change_order_line_items_select" on public.change_order_line_items;
drop policy if exists "change_order_line_items_write" on public.change_order_line_items;

-- change_orders
drop policy if exists "change_orders_select" on public.change_orders;
drop policy if exists "change_orders_write" on public.change_orders;

-- clients
drop policy if exists "ALLOW INSERT" on public.clients;
drop policy if exists "Allow public insert on clients" on public.clients;
drop policy if exists "Authenticated users can manage clients" on public.clients;
drop policy if exists "Enable all for authenticated users" on public.clients;
drop policy if exists "clients_delete" on public.clients;
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_select" on public.clients;
drop policy if exists "clients_update" on public.clients;

-- company_settings
drop policy if exists "Authenticated users can manage company settings" on public.company_settings;
drop policy if exists "company_settings_select" on public.company_settings;
drop policy if exists "company_settings_write" on public.company_settings;

-- documents
drop policy if exists "Allow delete" on public.documents;
drop policy if exists "Allow insert" on public.documents;
drop policy if exists "Allow select" on public.documents;
drop policy if exists "Allow update" on public.documents;

-- estimate_agents
drop policy if exists "estimate_agents_delete" on public.estimate_agents;
drop policy if exists "estimate_agents_insert" on public.estimate_agents;
drop policy if exists "estimate_agents_select" on public.estimate_agents;
drop policy if exists "estimate_agents_update" on public.estimate_agents;

-- estimate_expenses
drop policy if exists "Enable all for authenticated users" on public.estimate_expenses;
drop policy if exists "estimate_expenses_delete" on public.estimate_expenses;
drop policy if exists "estimate_expenses_insert" on public.estimate_expenses;
drop policy if exists "estimate_expenses_select" on public.estimate_expenses;
drop policy if exists "estimate_expenses_update" on public.estimate_expenses;

-- estimate_images — also turn RLS on; it was never actually enabled.
alter table public.estimate_images enable row level security;
drop policy if exists "Allow delete estimate images" on public.estimate_images;
drop policy if exists "Allow insert estimate images" on public.estimate_images;
drop policy if exists "Allow read estimate images" on public.estimate_images;
drop policy if exists "Enable all for authenticated users" on public.estimate_images;

-- estimate_items
drop policy if exists "Allow all operations" on public.estimate_items;
drop policy if exists "Authenticated users can manage estimate items" on public.estimate_items;
drop policy if exists "estimate_items_select" on public.estimate_items;
drop policy if exists "estimate_items_write" on public.estimate_items;

-- estimate_signatures
drop policy if exists "Allow full access to authenticated users" on public.estimate_signatures;

-- estimate_subcontractors
drop policy if exists "estimate_subcontractors_delete" on public.estimate_subcontractors;
drop policy if exists "estimate_subcontractors_insert" on public.estimate_subcontractors;
drop policy if exists "estimate_subcontractors_select" on public.estimate_subcontractors;
drop policy if exists "estimate_subcontractors_update" on public.estimate_subcontractors;

-- estimates
drop policy if exists "Allow all operations" on public.estimates;
drop policy if exists "Authenticated users can manage estimates" on public.estimates;
drop policy if exists "Enable all for authenticated users" on public.estimates;
drop policy if exists "Enable delete for authenticated users" on public.estimates;
drop policy if exists "Enable insert for authenticated users" on public.estimates;
drop policy if exists "Enable read access for all users" on public.estimates;
drop policy if exists "Enable update for authenticated users" on public.estimates;
drop policy if exists "estimates_delete" on public.estimates;
drop policy if exists "estimates_insert" on public.estimates;
drop policy if exists "estimates_select" on public.estimates;
drop policy if exists "estimates_update" on public.estimates;

-- invoice_items
drop policy if exists "invoice_items_select" on public.invoice_items;
drop policy if exists "invoice_items_write" on public.invoice_items;

-- invoice_payments
drop policy if exists "invoice_payments_select" on public.invoice_payments;
drop policy if exists "invoice_payments_write" on public.invoice_payments;

-- invoices
drop policy if exists "Allow authenticated users full access" on public.invoices;
drop policy if exists "Enable all for authenticated users" on public.invoices;
drop policy if exists "invoices_delete" on public.invoices;
drop policy if exists "invoices_insert" on public.invoices;
drop policy if exists "invoices_select" on public.invoices;
drop policy if exists "invoices_update" on public.invoices;

-- mileage_trips
drop policy if exists "Enable all for authenticated users" on public.mileage_trips;

-- subcontractor_payments
drop policy if exists "Enable all for authenticated users" on public.subcontractor_payments;
drop policy if exists "subcontractor_payments_delete" on public.subcontractor_payments;
drop policy if exists "subcontractor_payments_insert" on public.subcontractor_payments;
drop policy if exists "subcontractor_payments_select" on public.subcontractor_payments;
drop policy if exists "subcontractor_payments_update" on public.subcontractor_payments;

-- subcontractors
drop policy if exists "subcontractors_delete" on public.subcontractors;
drop policy if exists "subcontractors_insert" on public.subcontractors;
drop policy if exists "subcontractors_select" on public.subcontractors;
drop policy if exists "subcontractors_update" on public.subcontractors;

-- project_milestones already has exactly one correct policy
-- ("Company isolation project_milestones") and none of mine were ever
-- created here — nothing to drop.

-- ---------------------------------------------------------------------
-- companies — previously undiscovered: RLS was disabled and there were
-- zero policies, meaning every company's id/name was fully world
-- readable/writable via the API. This table's own `id` is the company
-- id (no separate company_id column), so it's scoped directly.
-- ---------------------------------------------------------------------
alter table public.companies enable row level security;
create policy "companies_select" on public.companies for select using (id = public.current_company_id());
create policy "companies_update" on public.companies for update using (id = public.current_company_id());

-- ---------------------------------------------------------------------
-- Dead tables — confirmed disconnected from the app, dropped entirely
-- rather than locked down.
-- ---------------------------------------------------------------------

-- estimatesXXXXX: leftover dev/test table (RLS disabled, only
-- "(dev only)"-labeled insert policies, never referenced by app code).
drop table if exists public."estimatesXXXXX";

-- matches: the soccer demo feature's table — its page (app/soccer) was
-- already deleted from the app during the code-side cleanup.
drop table if exists public.matches;
