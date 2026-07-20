-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- RUN THIS MIGRATION *BEFORE* 20260713000000_company_rls_lockdown.sql,
-- and confirm both public pages (app/public/estimates/[id],
-- app/public/invoices/[id]) still work end-to-end against these RPCs
-- BEFORE applying the RLS lockdown. The frontend has already been
-- switched to call these functions instead of querying tables
-- directly, but the functions don't exist until this file is run.
--
-- Why this exists: the RLS lockdown migration removes the open table
-- access these two client-facing, no-login pages currently rely on.
-- Rather than leave them broken, each read/write they perform is
-- reproduced here as a narrow SECURITY DEFINER function scoped to a
-- single row by id — so a visitor with a signing link can still view
-- and sign that one estimate/invoice, without the table itself being
-- openly readable to anyone who doesn't have a link.
--
-- These functions intentionally do NOT check auth.uid() — they're
-- meant to be called by anonymous visitors holding a link. The only
-- thing standing between "anyone with the link" and "anyone at all" is
-- the estimate/invoice id being an unguessable UUID. If you want a
-- stronger guarantee later (e.g. links that expire), that needs an
-- additional token column — flagging as a possible follow-up, not
-- implemented here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Public estimate page
-- ---------------------------------------------------------------------

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
    )
  );
$$;

create or replace function public.sign_public_estimate(p_estimate_id uuid, p_signature jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.estimates
  set signature = p_signature, status = 'approved'
  where id = p_estimate_id;
$$;

create or replace function public.remove_public_estimate_signature(p_estimate_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.estimates
  set signature = null, status = 'pending'
  where id = p_estimate_id;
$$;

-- Records a view (location/device) the first time from a given
-- city/IP, and always bumps the open count — mirrors the previous
-- inline logic in trackLocation().
create or replace function public.track_public_estimate_view(
  p_estimate_id uuid,
  p_location jsonb,
  p_device text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_locations jsonb;
  already_seen boolean;
begin
  select coalesce(view_locations, '[]'::jsonb), coalesce(opened_count, 0) > 0
  into current_locations, already_seen
  from public.estimates where id = p_estimate_id;

  if p_location is not null and not exists (
    select 1 from jsonb_array_elements(current_locations) loc
    where loc->>'city' = p_location->>'city' or loc->>'ip' = p_location->>'ip'
  ) then
    update public.estimates
    set
      view_locations = current_locations || jsonb_build_array(p_location),
      unique_locations = jsonb_array_length(current_locations) + 1,
      opened_at = now(),
      opened_count = coalesce(opened_count, 0) + 1,
      opened_device = p_device,
      opened_ip = p_location->>'ip'
    where id = p_estimate_id;
  else
    update public.estimates
    set opened_count = coalesce(opened_count, 0) + 1
    where id = p_estimate_id;
  end if;
end;
$$;

-- Approves a pending change order and rolls the new approved total
-- into estimates.total — mirrors confirmApprove()'s two-step update.
create or replace function public.approve_public_change_order(p_change_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate_id uuid;
  v_original_subtotal numeric;
  v_new_approved_total numeric;
begin
  select estimate_id into v_estimate_id from public.change_orders where id = p_change_order_id;
  if v_estimate_id is null then
    raise exception 'Change order not found';
  end if;

  update public.change_orders
  set status = 'approved', approved_at = now()
  where id = p_change_order_id;

  select coalesce(sum(total), 0) into v_original_subtotal
  from public.estimate_items where estimate_id = v_estimate_id;

  select coalesce(sum(total_amount), 0) into v_new_approved_total
  from public.change_orders where estimate_id = v_estimate_id and status = 'approved';

  update public.estimates
  set total = v_original_subtotal + v_new_approved_total
  where id = v_estimate_id;
end;
$$;

create or replace function public.reject_public_change_order(p_change_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.change_orders
  set status = 'rejected', rejected_at = now()
  where id = p_change_order_id;
$$;

-- ---------------------------------------------------------------------
-- Public invoice page
-- ---------------------------------------------------------------------

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
      where it.invoice_id = p_invoice_id and it.deleted_at is null
    ),
    'payments', (
      select coalesce(json_agg(p order by p.created_at desc), '[]'::json)
      from public.invoice_payments p
      where p.invoice_id = p_invoice_id and p.deleted_at is null
    )
  );
$$;

create or replace function public.sign_public_invoice(p_invoice_id uuid, p_signature jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.invoices
  set signature = p_signature, status = 'signed'
  where id = p_invoice_id;
$$;

-- ---------------------------------------------------------------------
-- Let anonymous visitors call these — nothing else needs anon access.
-- ---------------------------------------------------------------------
grant execute on function public.get_public_estimate_bundle(uuid) to anon, authenticated;
grant execute on function public.sign_public_estimate(uuid, jsonb) to anon, authenticated;
grant execute on function public.remove_public_estimate_signature(uuid) to anon, authenticated;
grant execute on function public.track_public_estimate_view(uuid, jsonb, text) to anon, authenticated;
grant execute on function public.approve_public_change_order(uuid) to anon, authenticated;
grant execute on function public.reject_public_change_order(uuid) to anon, authenticated;
grant execute on function public.get_public_invoice_bundle(uuid) to anon, authenticated;
grant execute on function public.sign_public_invoice(uuid, jsonb) to anon, authenticated;
