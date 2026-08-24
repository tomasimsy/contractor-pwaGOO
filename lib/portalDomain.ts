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
 * IDs below cover BOTH `companies` rows currently in live use — there
 * is a known, pre-existing duplicate-company data issue (two separate
 * `companies` rows both named "One Square Roofing LLC," out of scope
 * to fix here), and estimates have been created under either one, so
 * both accounts' real Business Profiles are mapped rather than
 * guessing which account is "the" one:
 *
 *   Company 964dfb81-a441-486a-ab75-7013456af9b4:
 *     "One Square Roofing LLC dba OSRPros" -> osrpros.com
 *     "One Square Roofing LLC"             -> app.onesquareroof.com
 *
 *   Company 6b090a65-5d62-4b5b-b190-379121329a1d:
 *     "One Square Roofing LLC dba OSRPros" -> osrpros.com
 *     "One Square Roofing LLC"             -> app.onesquareroof.com
 *
 * DEFAULT_ORIGIN is a FIXED constant, not a caller-supplied fallback —
 * a null profile_id (legacy/unassigned estimate, not a deliberate
 * brand choice) and any profile_id not in the map both resolve here,
 * deterministically, regardless of which domain admin is being used
 * from when the link is generated.
 */

const DEFAULT_ORIGIN = "https://app.onesquareroof.com";

const BRAND_ORIGIN_BY_PROFILE_ID: Record<string, string> = {
  // Company 964dfb81-a441-486a-ab75-7013456af9b4
  "651e1317-991b-4fdf-b903-d52d1d43779f": "https://osrpros.com", // One Square Roofing LLC dba OSRPros
  "c7280b32-8ea3-4cd0-8276-57d8d352365c": DEFAULT_ORIGIN, // One Square Roofing LLC
  // Company 6b090a65-5d62-4b5b-b190-379121329a1d
  "6b189d56-6109-47f5-a625-9379db6307e3": "https://osrpros.com", // One Square Roofing LLC dba OSRPros (renamed from "...OSRProsx")
  "b91770aa-516c-4800-8d89-3240b0f0b8f2": DEFAULT_ORIGIN, // One Square Roofing LLC
};

export function resolvePortalOrigin(profileId: string | null | undefined): string {
  if (!profileId) return DEFAULT_ORIGIN;
  return BRAND_ORIGIN_BY_PROFILE_ID[profileId] ?? DEFAULT_ORIGIN;
}
