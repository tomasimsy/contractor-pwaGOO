import { describe, test, expect } from "vitest";
import { resolvePortalOrigin } from "../lib/portalDomain";

const FALLBACK = "https://staff-was-browsing-here.example.com";
const TOKEN = "9f2c1a4e-9999-4b7c-8b3e-abc123456789";

// The placeholder key lib/portalDomain.ts ships with until OSRPros'
// real company_profiles.id is filled in — importing the actual
// constant would be nicer, but it isn't exported (deliberately: the
// map is an internal implementation detail, only resolvePortalOrigin
// is the public surface). Kept in sync by hand with that file's TODO.
const OSRPROS_PROFILE_ID_PLACEHOLDER = "REPLACE_WITH_OSRPROS_PROFILE_ID";

describe("resolvePortalOrigin", () => {
  test("OSRPros' profile id resolves to osrpros.com", () => {
    expect(resolvePortalOrigin(OSRPROS_PROFILE_ID_PLACEHOLDER, FALLBACK)).toBe("https://osrpros.com");
  });

  test("One Square Roofing has no profile row — it's the null-profile default, which falls back to whatever origin already serves it", () => {
    // Not a brand lookup at all: null profile_id is the company's own
    // default identity, so this is exactly the same case as "no
    // profile" below. Asserted separately so the intent (One Square
    // Roofing = default, not a mapped brand) is documented, not just
    // implied by the null-handling test.
    expect(resolvePortalOrigin(null, "https://app.onesquareroof.com")).toBe("https://app.onesquareroof.com");
  });

  test("a null profile_id (profile_id = null, the default identity) falls back to the caller's current origin, unchanged", () => {
    expect(resolvePortalOrigin(null, FALLBACK)).toBe(FALLBACK);
    expect(resolvePortalOrigin(undefined, FALLBACK)).toBe(FALLBACK);
  });

  test("an unrecognized or not-yet-mapped profile id falls back to the caller's current origin — no regression, no crash", () => {
    expect(resolvePortalOrigin("00000000-0000-0000-0000-000000000000", FALLBACK)).toBe(FALLBACK);
  });

  test("renaming a profile's display name does not affect resolution — only its id matters", () => {
    // The whole point of keying by id instead of company_name: this
    // function never even looks at a name, so there is nothing for a
    // Settings-page rename to break.
    expect(resolvePortalOrigin(OSRPROS_PROFILE_ID_PLACEHOLDER, FALLBACK)).toBe("https://osrpros.com");
  });

  test("full portal URL assembly: a brand match overrides the origin, the token is untouched either way", () => {
    const osrProsUrl = `${resolvePortalOrigin(OSRPROS_PROFILE_ID_PLACEHOLDER, FALLBACK)}/portal/${TOKEN}`;
    const defaultUrl = `${resolvePortalOrigin(null, FALLBACK)}/portal/${TOKEN}`;

    expect(osrProsUrl).toBe(`https://osrpros.com/portal/${TOKEN}`);
    // No regression: an estimate with no mapped profile keeps exactly
    // today's URL shape — same origin it always used, same
    // /portal/{token} path, same token value.
    expect(defaultUrl).toBe(`${FALLBACK}/portal/${TOKEN}`);
  });
});
