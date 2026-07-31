-- =====================================================================
-- Customer Portal: Change Order approval.
--
-- 1. `change_orders.signature` — mirrors `estimates.signature` (jsonb
--    {type, value, date}), so a customer's approval of a change order
--    is captured the exact same way estimate signing already is. No
--    other new columns: status/approved_at already exist and are
--    reused as-is (see lib/services/changeOrderService.ts).
--
-- 2. `get_portal_change_orders(p_token text)` — a new, narrowly-scoped
--    SECURITY DEFINER read, following the SAME pattern as this app's
--    existing `get_customer_portal` RPC: change_orders has no
--    `customer_token` of its own (by design — a change order belongs
--    to an estimate, which already has one), so access is scoped by
--    joining through the parent estimate's token, never by id alone.
--
--    This is a NEW function rather than editing `get_customer_portal`
--    in place: that function already exists live on this Supabase
--    project (created outside this repo's tracked migration history)
--    and currently returns ONLY approved change orders (filtered
--    inside the function body, which this migration cannot safely
--    introspect/rewrite blind). Adding a second, purpose-built read for
--    "every non-deleted change order, any status" avoids risking a
--    regression in the existing approved-only summary the portal page
--    already relies on for its contract-total math.
--
--    Mutation (approve) is intentionally NOT a SQL RPC — per this
--    app's established "Option A" architecture (see
--    lib/services/estimateWorkflow.ts's header), the customer-facing
--    write goes through a server-only Next.js API route
--    (app/api/portal/change-orders/[id]/approve/route.ts) using the
--    service-role key, which re-validates the token itself and then
--    calls the ONE shared changeOrderWorkflow.approveChangeOrder(...)
--    function — the same function the staff UI calls. No business
--    logic (status transition, ledger booking, estimate recalculation)
--    lives in SQL.
-- =====================================================================

alter table if exists public.change_orders
add column if not exists signature jsonb;

comment on column public.change_orders.signature is 'Customer e-signature captured on portal approval: {type, value, date}. Null for staff-approved change orders with no customer signature on file.';

create or replace function public.get_portal_change_orders(p_token text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(co) order by co.created_at desc), '[]'::json)
  from (
    select
      co.id, co.change_order_number, co.title, co.description, co.status,
      co.total_amount, co.tax, co.approved_at, co.signature, co.created_at
    from public.change_orders co
    join public.estimates e on e.id = co.estimate_id
    where e.customer_token = p_token
      and e.deleted_at is null
      and co.deleted_at is null
  ) co;
$$;

grant execute on function public.get_portal_change_orders(text) to anon, authenticated;
