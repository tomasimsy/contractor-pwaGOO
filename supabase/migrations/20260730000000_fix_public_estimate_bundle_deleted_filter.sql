-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- Fixes a live regression found in DATABASE_INTEGRITY_AUDIT.md (finding
-- #1): 20260720000000_company_branding_settings.sql did a `create or
-- replace function` on get_public_estimate_bundle() to add a `company`
-- field, and in the process dropped the `deleted_at is null` filters
-- that 20260712235900_public_signing_rpcs.sql originally had on
-- items/change_orders/payments. 20260724000000_reapply_public_invoice_
-- change_orders.sql re-fixed the sibling get_public_invoice_bundle()
-- but never re-fixed this one.
--
-- This function is security definer and callable by anonymous visitors
-- (by design, for the public signing link flow) — without this fix,
-- anyone with a link can see soft-deleted line items, change orders,
-- and payments for that estimate.
--
-- Body below is copied from the current (post-branding) version with
-- the three `deleted_at is null` filters restored — nothing else
-- changed.
-- =====================================================================

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
      where i.estimate_id = p_estimate_id and i.deleted_at is null
    ),
    'change_orders', (
      select coalesce(json_agg(co order by co.created_at desc), '[]'::json)
      from public.change_orders co
      where co.estimate_id = p_estimate_id and co.status <> 'draft' and co.deleted_at is null
    ),
    'invoice_id', (
      select id from public.invoices where estimate_id = p_estimate_id limit 1
    ),
    'payments', (
      select coalesce(json_agg(p order by p.created_at desc), '[]'::json)
      from public.invoice_payments p
      where p.invoice_id = (select id from public.invoices where estimate_id = p_estimate_id limit 1)
        and p.deleted_at is null
    ),
    'company', (
      select to_json(cs) from public.company_settings cs
      where cs.company_id = (select company_id from public.estimates where id = p_estimate_id)
    )
  );
$$;

-- Sanity check to run manually after applying: pick an estimate with at
-- least one soft-deleted item/change_order/payment and confirm it no
-- longer appears in the returned bundle.
-- select public.get_public_estimate_bundle('<estimate-id>');
