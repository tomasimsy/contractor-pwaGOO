/**
 * Resolves which domain a customer-facing portal link should use,
 * based on the estimate/invoice's own BRAND — its `profile_id`,
 * exactly as stored, never a derived/editable display name — never by
 * window.location.origin / request.nextUrl.origin. Which domain the
 * STAFF member's browser/request happened to be on has nothing to do
 * with which domain the CUSTOMER should be sent to.
 *
 * Keyed by company_profiles.id (a real, already-existing, immutable
 * primary key) rather than company_profiles.company_name: a profile's
 * NAME can be edited in Settings at any time, which would silently
 * break a name-keyed map; its `id` never changes for the life of the
 * row. No schema change either way — `id` already exists.
 *
 * "One Square Roofing" has no entry here on purpose: it is not its
 * own company_profiles row, it's the COMPANY'S OWN DEFAULT identity
 * (profile_id === null) — see the null-check below, which is what
 * actually sends it to app.onesquareroof.com, via `fallbackOrigin`
 * being whatever domain is already serving that default case today.
 *
 * SETUP STEP THIS FILE CANNOT DO ITSELF: after creating the "OSRPros"
 * Business Profile in Settings -> Business Profiles, look up its real
 * `id` (e.g. via the network tab, or a `select id from company_profiles
 * where company_name = 'OSRPros'` in the Supabase SQL editor) and
 * replace the placeholder below. Until that's done, OSRPros estimates
 * fall back to `fallbackOrigin` exactly like any other unmatched
 * profile — a quiet miss, not a crash.
 *
 * `fallbackOrigin` is ALWAYS the caller's existing origin (today's
 * exact behavior — window.location.origin client-side,
 * request.nextUrl.origin server-side) and is returned UNCHANGED
 * whenever no brand match is found — this is what keeps every
 * profile_id === null estimate (and any not-yet-mapped profile)
 * behaving exactly as it does today, with zero hardcoded default.
 */

const BRAND_ORIGIN_BY_PROFILE_ID: Record<string, string> = {
  // TODO: replace with OSRPros' real company_profiles.id once that
  // profile has been created in Settings -> Business Profiles.
  "REPLACE_WITH_OSRPROS_PROFILE_ID": "https://osrpros.com",
};

export function resolvePortalOrigin(profileId: string | null | undefined, fallbackOrigin: string): string {
  if (!profileId) return fallbackOrigin;
  return BRAND_ORIGIN_BY_PROFILE_ID[profileId] ?? fallbackOrigin;
}
