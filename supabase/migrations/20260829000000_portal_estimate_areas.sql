-- A roofing estimate's scope lives in estimate_areas, not
-- estimate_items — get_customer_portal's line_items is always empty
-- for one, so the portal fell back to a single lumped "Quoted work as
-- specified" line with no area breakdown, while the PDF already shows
-- each area by name with its own cost (lib/pdf/estimateProposal.ts).
-- One new narrowly-scoped function, same pattern as
-- get_portal_estimate_items, so the portal can show the same
-- per-area breakdown.
create or replace function public.get_portal_estimate_areas(p_token text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(a) order by a.sequence_number), '[]'::json)
  from public.estimate_areas a
  join public.estimates e on e.id = a.estimate_id
  where e.customer_token = p_token
    and e.deleted_at is null
    and a.deleted_at is null;
$$;

grant execute on function public.get_portal_estimate_areas(text) to anon, authenticated;
