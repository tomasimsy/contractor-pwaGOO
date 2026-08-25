-- get_customer_portal (external, untracked, live-only — not safe to
-- rewrite blind, same reasoning as get_portal_change_orders/
-- get_portal_estimate_photos) returns line_items with only
-- {id, name, description, quantity, unit_price, total} — no
-- category, no group_name. The portal page needs group_name to show
-- the same project grouping the estimate form and PDF now show, so
-- one new narrowly-scoped function instead of touching that one.
create or replace function public.get_portal_estimate_items(p_token text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(ei)), '[]'::json)
  from public.estimate_items ei
  join public.estimates e on e.id = ei.estimate_id
  where e.customer_token = p_token
    and e.deleted_at is null
    and ei.deleted_at is null;
$$;

grant execute on function public.get_portal_estimate_items(text) to anon, authenticated;
