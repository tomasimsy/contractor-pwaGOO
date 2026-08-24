/**
 * Resolves which domain a customer-facing portal link should use,
 * based ENTIRELY on the estimate's own `profile_id` — never on
 * window.location.origin / request.nextUrl.origin. Which domain the
 * STAFF member's browser/request happened to be on has nothing to do
 * with which domain the CUSTOMER should be sent to; the two brand
 * domains (osrpros.com, app.onesquareroof.com) are Vercel aliases of
 * the SAME admin app, so staff can legitimately be logged in via
 * either one at any time.
 *
 * Keyed by company_profiles.id (a real, already-existing, immutable
 * primary key), retrieved directly from the live database — NOT by
 * company_name (editable in Settings at any time) and NOT by
 * hardcoding a guess. No schema change: `id` already exists.
 *
 * IDs below belong to ONE specific `companies` row
 * (964dfb81-a441-486a-ab75-7013456af9b4) — confirmed to be the
 * account actually in use. There is a SEPARATE, unrelated `companies`
 * row also named "One Square Roofing LLC" (a known, pre-existing
 * duplicate-company data issue, out of scope here) with its own
 * different profile ids; this map intentionally does not cover it.
 *
 *   "One Square Roofing LLC dba OSRPros" -> osrpros.com
 *   "One Square Roofing LLC"             -> app.onesquareroof.com
 *
 * DEFAULT_ORIGIN is a FIXED constant, not a caller-supplied fallback —
 * a null profile_id (legacy/unassigned estimate, not a deliberate
 * brand choice) and any profile_id not in the map both resolve here,
 * deterministically, regardless of which domain admin is being used
 * from when the link is generated.
 */

const DEFAULT_ORIGIN = "https://app.onesquareroof.com";

const BRAND_ORIGIN_BY_PROFILE_ID: Record<string, string> = {
  "651e1317-991b-4fdf-b903-d52d1d43779f": "https://osrpros.com", // One Square Roofing LLC dba OSRPros
  "c7280b32-8ea3-4cd0-8276-57d8d352365c": DEFAULT_ORIGIN, // One Square Roofing LLC
};

export function resolvePortalOrigin(profileId: string | null | undefined): string {
  if (!profileId) return DEFAULT_ORIGIN;
  return BRAND_ORIGIN_BY_PROFILE_ID[profileId] ?? DEFAULT_ORIGIN;
}
