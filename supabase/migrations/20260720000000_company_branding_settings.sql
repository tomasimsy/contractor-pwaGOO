-- Adds the remaining reusable branding/legal-text fields to company_settings
-- so every document (PDF, public signing page, etc.) can pull real company
-- content instead of a hardcoded "OSR Pros" identity, and exposes that data
-- to the public (anon) signing pages via the existing SECURITY DEFINER
-- bundle RPCs (anon has no direct RLS access to company_settings).

alter table public.company_settings add column if not exists dba text;
alter table public.company_settings add column if not exists logo_url text;
alter table public.company_settings add column if not exists footer_message text;
alter table public.company_settings add column if not exists payment_instructions text;
alter table public.company_settings add column if not exists warranty_text text;

create or replace function public.get_public_estimate_bundle(p_estimate_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'estimate', (select to_json(e) from public.estimates e where e.id = p_estimate_id),
    'client', (
      select to_json(c) from public.clients c
      where c.id = (select client_id from public.estimates where id = p_estimate_id)
    ),
    'items', (
      select coalesce(json_agg(i), '[]'::json) from public.estimate_items i
      where i.estimate_id = p_estimate_id
    ),
    'change_orders', (
      select coalesce(json_agg(co order by co.created_at desc), '[]'::json)
      from public.change_orders co
      where co.estimate_id = p_estimate_id and co.status <> 'draft'
    ),
    'invoice_id', (
      select id from public.invoices where estimate_id = p_estimate_id limit 1
    ),
    'payments', (
      select coalesce(json_agg(p order by p.created_at desc), '[]'::json)
      from public.invoice_payments p
      where p.invoice_id = (select id from public.invoices where estimate_id = p_estimate_id limit 1)
    ),
    'company', (
      select to_json(cs) from public.company_settings cs
      where cs.company_id = (select company_id from public.estimates where id = p_estimate_id)
    )
  );
$$;

create or replace function public.get_public_invoice_bundle(p_invoice_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'invoice', (select to_json(i) from public.invoices i where i.id = p_invoice_id),
    'client', (
      select to_json(c) from public.clients c
      where c.id = (select client_id from public.invoices where id = p_invoice_id)
    ),
    'items', (
      select coalesce(json_agg(it), '[]'::json) from public.invoice_items it
      where it.invoice_id = p_invoice_id
    ),
    'payments', (
      select coalesce(json_agg(p order by p.created_at desc), '[]'::json)
      from public.invoice_payments p
      where p.invoice_id = p_invoice_id
    ),
    'company', (
      select to_json(cs) from public.company_settings cs
      where cs.company_id = (select company_id from public.invoices where id = p_invoice_id)
    )
  );
$$;
