/**
 * Resolves which domain a customer-facing portal link should use,
 * read LIVE from the estimate/invoice's own brand — its `profile_id`
 * -> company_profiles.portal_domain — never from
 * window.location.origin / request.nextUrl.origin (which domain the
 * STAFF member's browser/request happened to be on has nothing to do
 * with which domain the CUSTOMER should be sent to), never from
 * company_name string matching, and never from a hardcoded profile-id
 * map in source code.
 *
 * That hardcoded map (this file's earlier version) broke every time a
 * Business Profile was deleted and recreated in Settings — a normal,
 * expected action, but one that always mints a brand-new profile_id.
 * Storing the domain ON the profile row itself (see supabase/
 * migrations/20260824000000_company_profiles_portal_domain.sql) means
 * deleting/recreating a profile just means re-entering its domain in
 * Settings -> Business Profiles — no code change, no redeploy.
 *
 * DEFAULT_ORIGIN is the one remaining fixed constant — not a per-brand
 * guess, just the app's own single default when there's no override:
 * a null profile_id (legacy/unassigned estimate, not a deliberate
 * brand choice), a profile with no portal_domain configured, or a
 * deleted/missing profile all resolve here, deterministically.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyProfileById } from "./company";

export const DEFAULT_ORIGIN = "https://app.onesquareroof.com";

export async function resolvePortalOrigin(
  supabase: SupabaseClient,
  profileId: string | null | undefined
): Promise<string> {
  if (!profileId) return DEFAULT_ORIGIN;
  const profile = await getCompanyProfileById(supabase, profileId);
  return profile?.portalDomain || DEFAULT_ORIGIN;
}
