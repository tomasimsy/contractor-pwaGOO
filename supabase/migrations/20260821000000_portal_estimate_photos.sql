-- =====================================================================
-- Customer Portal: estimate photos.
--
-- Real gap found: the PDF (lib/pdf/estimateProposal.ts) already shows
-- a customer their estimate's Before/After photos and roof-area
-- photos — but the portal page (app/portal/[id]/page.tsx) shows none
-- of that. A customer viewing the portal link sees scope/pricing/
-- signature only; the same estimate's PDF (reachable from the same
-- token) shows photos too. This closes that gap for the portal page
-- itself.
--
-- `get_portal_estimate_photos(p_token text)` — a NEW, narrowly-scoped
-- SECURITY DEFINER read, following the EXACT same pattern
-- `get_portal_change_orders` already established (see
-- 20260730130000_change_order_portal_approval.sql's header): a new
-- function rather than editing `get_customer_portal` in place, since
-- that function already exists live on this Supabase project (created
-- outside this repo's tracked migration history) and this migration
-- cannot safely introspect/rewrite it blind.
--
-- Returns BOTH photo sources the PDF already reads, scoped by joining
-- through the parent estimate's customer_token (neither photo table
-- has its own token column, by design):
--   - estimate_photos       (whole-estimate before/after)
--   - estimate_area_photos  (per roof-area before/after, via
--                            estimate_areas), with the area's name
--                            attached so the portal can label each
--                            group the same way the PDF does.
--
-- Photo BYTES are served the same way the PDF already serves them to
-- customers: /api/estimate-photos/download?path=... — that route is
-- already reached from a customer-token PDF render today, so no new
-- download path is introduced here, only the missing metadata read.
-- =====================================================================

create or replace function public.get_portal_estimate_photos(p_token text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'estimate_photos', (
      select coalesce(json_agg(row_to_json(ep) order by ep.photo_type, ep.display_order), '[]'::json)
      from (
        select p.id, p.photo_type, p.storage_path, p.display_order
        from public.estimate_photos p
        join public.estimates e on e.id = p.estimate_id
        where e.customer_token = p_token
          and e.deleted_at is null
          and p.deleted_at is null
      ) ep
    ),
    'area_photos', (
      select coalesce(json_agg(row_to_json(ap) order by ap.area_name, ap.photo_type, ap.display_order), '[]'::json)
      from (
        select p.id, p.photo_type, p.storage_path, p.display_order,
               a.id as area_id, a.area_name
        from public.estimate_area_photos p
        join public.estimate_areas a on a.id = p.estimate_area_id
        join public.estimates e on e.id = a.estimate_id
        where e.customer_token = p_token
          and e.deleted_at is null
          and a.deleted_at is null
          and p.deleted_at is null
      ) ap
    )
  );
$$;

grant execute on function public.get_portal_estimate_photos(text) to anon, authenticated;
