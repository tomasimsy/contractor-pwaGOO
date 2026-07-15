-- =====================================================================
-- Root cause: 20260720000000_company_branding_settings.sql redefined
-- get_public_invoice_bundle() (to add the `company` key from
-- company_settings) by copy-pasting the ORIGINAL pre-fix body from
-- 20260712235900_public_signing_rpcs.sql — silently undoing the fix
-- from 20260716000000_fix_public_invoice_change_orders.sql. That put
-- `items` back to the frozen invoice_items snapshot and dropped
-- `change_orders` entirely, which is why the public Invoice page
-- stopped matching the public Estimate page's numbers and stopped
-- showing Change Orders.
--
-- Fix: recreate get_public_invoice_bundle() combining both prior
-- fixes — company/company_settings (kept from 20260720) plus live
-- estimate_items + change_orders (restored from 20260716) plus
-- deleted_at filtering (also from 20260716, also dropped in 20260720).
-- =====================================================================

create or replace function public.get_public_invoice_bundle(p_invoice_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'invoice', (
      select to_json(i) from public.invoices i
      where i.id = p_invoice_id and i.deleted_at is null
    ),
    'client', (
      select to_json(c) from public.clients c
      where c.id = (select client_id from public.invoices where id = p_invoice_id)
        and c.deleted_at is null
    ),
    -- Sourced from the linked estimate's live estimate_items — same
    -- table and filter as get_public_estimate_bundle's `items` — instead
    -- of the one-time invoice_items copy, so anything that changes on
    -- the estimate side is never stale here.
    'items', (
      select coalesce(json_agg(i), '[]'::json) from public.estimate_items i
      where i.estimate_id = (select estimate_id from public.invoices where id = p_invoice_id)
        and i.deleted_at is null
    ),
    'change_orders', (
      select coalesce(json_agg(co order by co.created_at desc), '[]'::json)
      from public.change_orders co
      where co.estimate_id = (select estimate_id from public.invoices where id = p_invoice_id)
        and co.status <> 'draft' and co.deleted_at is null
    ),
    'payments', (
      select coalesce(json_agg(p order by p.created_at desc), '[]'::json)
      from public.invoice_payments p
      where p.invoice_id = p_invoice_id and p.deleted_at is null
    ),
    'company', (
      select to_json(cs) from public.company_settings cs
      where cs.company_id = (select company_id from public.invoices where id = p_invoice_id)
    )
  );
$$;

grant execute on function public.get_public_invoice_bundle(uuid) to anon, authenticated;
