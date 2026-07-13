-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- Fixes the public Invoice page (/public/invoices/:id) showing stale
-- totals after a Change Order is approved on the linked Estimate.
--
-- Root cause: get_public_invoice_bundle() only ever returned the
-- invoice's own `invoice_items` snapshot (copied once, at the moment
-- convertToInvoice() ran) and never queried `change_orders` at all.
-- Approving a Change Order on the public Estimate page recalculates
-- and writes a fresh total to `estimates.total` (see
-- approve_public_change_order below) but nothing anywhere ever
-- recalculates `invoices.total` or re-copies the new line item — so
-- the invoice bundle kept serving the frozen, at-conversion numbers
-- forever, even though the estimate had moved on.
--
-- Fix: get_public_invoice_bundle() now sources `items` from the
-- linked estimate's live `estimate_items` (instead of the one-time
-- `invoice_items` copy) and adds a live `change_orders` lookup — the
-- exact same two data sources and filters as
-- get_public_estimate_bundle()'s `items`/`change_orders` above. The
-- client then computes revisedTotal/balance the same way both the
-- public Estimate page and the internal (authenticated) Invoice page
-- already do: originalSubtotal (sum of estimate_items) + approvedTotal
-- (sum of change_orders where status = 'approved'). No stored total
-- column is written or trusted for this math anywhere now, which is
-- what let the two get out of sync in the first place.
--
-- Also backfills `deleted_at is null` filtering on both public bundle
-- functions, which predate the soft-delete migration
-- (20260715000200_soft_delete_trigger.sql) and so still expose
-- soft-deleted rows on these public, no-login pages.
-- =====================================================================

create or replace function public.get_public_estimate_bundle(p_estimate_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'estimate', (
      select to_json(e) from public.estimates e
      where e.id = p_estimate_id and e.deleted_at is null
    ),
    'client', (
      select to_json(c) from public.clients c
      where c.id = (select client_id from public.estimates where id = p_estimate_id)
        and c.deleted_at is null
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
      select id from public.invoices where estimate_id = p_estimate_id and deleted_at is null limit 1
    ),
    'payments', (
      select coalesce(json_agg(p order by p.created_at desc), '[]'::json)
      from public.invoice_payments p
      where p.invoice_id = (
        select id from public.invoices where estimate_id = p_estimate_id and deleted_at is null limit 1
      )
      and p.deleted_at is null
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
    -- table and filter as get_public_estimate_bundle's `items` above —
    -- instead of the one-time invoice_items copy, so anything that
    -- changes on the estimate side is never stale here.
    'items', (
      select coalesce(json_agg(i), '[]'::json) from public.estimate_items i
      where i.estimate_id = (select estimate_id from public.invoices where id = p_invoice_id)
        and i.deleted_at is null
    ),
    -- Previously missing entirely — this was the actual bug. Same
    -- subquery shape as get_public_estimate_bundle's `change_orders`.
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
    )
  );
$$;

grant execute on function public.get_public_estimate_bundle(uuid) to anon, authenticated;
grant execute on function public.get_public_invoice_bundle(uuid) to anon, authenticated;
