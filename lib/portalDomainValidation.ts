/**
 * Validates a Business Profile's `portal_domain` before it's saved —
 * used both client-side (Settings -> Business Profiles, for instant
 * feedback) and server-side (CompanyProfileService, the real
 * enforcement) so the two can never disagree on what's acceptable.
 *
 * Rules: HTTPS only, origin-only (no path/query/fragment — a portal
 * link is always `${portalDomain}/portal/${token}`, so anything here
 * beyond scheme+host would silently double up or conflict with that),
 * and no localhost/private/internal hostname (this value is written
 * into real customer-facing links; a private address there is always
 * a mistake, not a valid production configuration).
 */

export interface PortalDomainValidation {
  valid: boolean;
  message?: string;
  /** Present when valid: the value to actually store — trailing
   * slash/path/query/fragment stripped, so every saved value has one
   * consistent shape (`https://host`, never `https://host/`). `null`
   * specifically means "the field was cleared" (empty input is valid
   * — portal_domain is optional), not an error. */
  normalized?: string | null;
}

const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /\.local$/i,
  /\.internal$/i,
];

export function validatePortalDomain(raw: string): PortalDomainValidation {
  const trimmed = raw.trim();
  // Optional field — clearing it is valid, not an error; the resolver
  // falls back to the app's fixed default when it's null.
  if (!trimmed) return { valid: true, normalized: null };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { valid: false, message: "Enter a full URL, e.g. https://osrpros.com" };
  }

  if (url.protocol !== "https:") {
    return { valid: false, message: "Portal domain must start with https://" };
  }
  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    return { valid: false, message: "Portal domain can't be a local/private address." };
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return { valid: false, message: "Portal domain must be just the domain, with no path — e.g. https://osrpros.com, not https://osrpros.com/something." };
  }
  if (url.search || url.hash) {
    return { valid: false, message: "Portal domain must not include a query string or fragment." };
  }

  // Strips the trailing slash a bare-origin URL object always adds
  // (`new URL("https://osrpros.com").href` -> "https://osrpros.com/")
  // — every stored value has the same shape regardless of how the
  // user typed it.
  return { valid: true, normalized: `${url.protocol}//${url.host}` };
}
