-- Adds each area's own granular line items (estimate_area_line_items —
-- the "Line Items" table under a roof area in RoofingAreaLineItemEditor,
-- distinct from the area's defect/location/etc detail fields) to
-- get_portal_estimate_areas's payload, nested under a `line_items` key
-- per area. The customer portal previously showed an area's total cost
-- but none of the actual line items making it up.
create or replace function public.get_portal_estimate_areas(p_token text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    json_agg(
      (to_jsonb(a) || jsonb_build_object(
        'line_items', (
          select coalesce(jsonb_agg(to_jsonb(li) order by li.sequence_number), '[]'::jsonb)
          from public.estimate_area_line_items li
          where li.estimate_area_id = a.id
            and li.deleted_at is null
        )
      ))
      order by a.sequence_number
    ),
    '[]'::json
  )
  from public.estimate_areas a
  join public.estimates e on e.id = a.estimate_id
  where e.customer_token = p_token
    and e.deleted_at is null
    and a.deleted_at is null;
$$;
