-- The customer-facing "Download PDF" link on the portal page
-- (app/portal/[id]/page.tsx) hits app/api/estimates/[id]/pdf with a
-- customerToken query param. That route's loader
-- (lib/pdf/estimateProposal.ts loadEstimateProposalData) runs a plain
-- anon-key client through ~8 raw table selects (estimates, clients,
-- estimate_items, estimate_areas, estimate_area_photos,
-- estimate_photos, change_orders, company_settings, companies) — every
-- one of them blocked by each table's normal company-scoped RLS, since
-- an anon client with no session has no company context at all. The
-- link was returning "Not found" for every estimate.
--
-- Same shape of problem this app already solved for the portal PAGE
-- itself (get_customer_portal, get_portal_change_orders,
-- get_portal_estimate_photos, get_portal_estimate_profile_id): one
-- narrowly-scoped SECURITY DEFINER function, gated on the estimate's
-- own customer_token, returning exactly the rows the PDF loader needs
-- as a single JSON bundle — never a blanket anon SELECT grant on any
-- of these tables.
create or replace function public.get_portal_estimate_pdf_data(p_token text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select case when e.id is null then null else json_build_object(
    'estimate', row_to_json(e),
    'client', (select row_to_json(cl) from public.clients cl where cl.id = e.client_id),
    'items', (
      select coalesce(json_agg(row_to_json(ei)), '[]'::json)
      from public.estimate_items ei
      where ei.estimate_id = e.id and ei.deleted_at is null
    ),
    'roofing_areas', (
      select coalesce(json_agg(row_to_json(ea) order by ea.sequence_number), '[]'::json)
      from public.estimate_areas ea
      where ea.estimate_id = e.id and ea.deleted_at is null
    ),
    'roofing_area_photos', (
      select coalesce(json_agg(row_to_json(eap) order by eap.display_order), '[]'::json)
      from public.estimate_area_photos eap
      where eap.estimate_area_id in (
        select ea.id from public.estimate_areas ea where ea.estimate_id = e.id and ea.deleted_at is null
      ) and eap.deleted_at is null
    ),
    'estimate_photos', (
      select coalesce(json_agg(row_to_json(ep) order by ep.display_order), '[]'::json)
      from public.estimate_photos ep
      where ep.estimate_id = e.id and ep.deleted_at is null
    ),
    'change_orders', (
      select coalesce(json_agg(json_build_object('total_amount', co.total_amount, 'tax', co.tax, 'status', co.status)), '[]'::json)
      from public.change_orders co
      where co.estimate_id = e.id and co.company_id = e.company_id and co.deleted_at is null
    ),
    'company_settings', (select row_to_json(cs) from public.company_settings cs where cs.company_id = e.company_id),
    'company_name', (select c.name from public.companies c where c.id = e.company_id)
  ) end
  from public.estimates e
  where e.customer_token = p_token
    and e.deleted_at is null;
$$;

grant execute on function public.get_portal_estimate_pdf_data(text) to anon, authenticated;
