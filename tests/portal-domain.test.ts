import { describe, test, expect } from "vitest";
import { resolvePortalOrigin } from "../lib/portalDomain";

const TOKEN = "9f2c1a4e-9999-4b7c-8b3e-abc123456789";

// The real company_profiles.id values for BOTH company accounts
// currently in live use (retrieved directly from the live database —
// see lib/portalDomain.ts's header for how/why, including the known
// duplicate-company situation). Kept in sync by hand with that file if
// a profile is ever recreated.
const OSRPROS_PROFILE_ID = "651e1317-991b-4fdf-b903-d52d1d43779f";
const ONE_SQUARE_ROOFING_PROFILE_ID = "c7280b32-8ea3-4cd0-8276-57d8d352365c";
// Second company account.
const OTHER_COMPANY_OSRPROS_PROFILE_ID = "6b189d56-6109-47f5-a625-9379db6307e3";
const OTHER_COMPANY_DEFAULT_PROFILE_ID = "b91770aa-516c-4800-8d89-3240b0f0b8f2";
const DEFAULT_ORIGIN = "https://app.onesquareroof.com";

describe("resolvePortalOrigin", () => {
  test("OSRPros' profile id resolves to osrpros.com", () => {
    expect(resolvePortalOrigin(OSRPROS_PROFILE_ID)).toBe("https://osrpros.com");
  });

  test("One Square Roofing's own profile id resolves to app.onesquareroof.com — a deliberate selection, not the fallback", () => {
    expect(resolvePortalOrigin(ONE_SQUARE_ROOFING_PROFILE_ID)).toBe(DEFAULT_ORIGIN);
  });

  test("a null profile_id (legacy/unassigned estimate, NOT a deliberate brand choice) resolves to the fixed default origin", () => {
    expect(resolvePortalOrigin(null)).toBe(DEFAULT_ORIGIN);
    expect(resolvePortalOrigin(undefined)).toBe(DEFAULT_ORIGIN);
  });

  test("an unrecognized profile id (e.g. from the separate duplicate-company account) resolves to the fixed default — no regression, no crash", () => {
    expect(resolvePortalOrigin("00000000-0000-0000-0000-000000000000")).toBe(DEFAULT_ORIGIN);
  });

  test("the resolver never depends on the caller's current origin — same profile id, same result regardless of what domain admin is browsing from", () => {
    // No origin/host is passed in at all anymore — this test exists to
    // document that the function's signature makes it structurally
    // impossible for window.location.origin/request.nextUrl.origin to
    // influence the result, not just that it happens not to today.
    expect(resolvePortalOrigin(OSRPROS_PROFILE_ID)).toBe("https://osrpros.com");
    expect(resolvePortalOrigin(OSRPROS_PROFILE_ID)).toBe(resolvePortalOrigin(OSRPROS_PROFILE_ID));
  });

  test("the second company account's real profiles also resolve correctly — this map covers both accounts, not just one", () => {
    expect(resolvePortalOrigin(OTHER_COMPANY_OSRPROS_PROFILE_ID)).toBe("https://osrpros.com");
    expect(resolvePortalOrigin(OTHER_COMPANY_DEFAULT_PROFILE_ID)).toBe(DEFAULT_ORIGIN);
  });

  test("full portal URL assembly: brand match overrides the default, the token is untouched either way", () => {
    const osrProsUrl = `${resolvePortalOrigin(OSRPROS_PROFILE_ID)}/portal/${TOKEN}`;
    const oneSquareUrl = `${resolvePortalOrigin(ONE_SQUARE_ROOFING_PROFILE_ID)}/portal/${TOKEN}`;
    const legacyUrl = `${resolvePortalOrigin(null)}/portal/${TOKEN}`;

    expect(osrProsUrl).toBe(`https://osrpros.com/portal/${TOKEN}`);
    expect(oneSquareUrl).toBe(`${DEFAULT_ORIGIN}/portal/${TOKEN}`);
    // No regression: a legacy estimate with no profile keeps the same
    // /portal/{token} path and the same token value, just resolved to
    // the fixed default origin instead of an ambiguous browser host.
    expect(legacyUrl).toBe(`${DEFAULT_ORIGIN}/portal/${TOKEN}`);
  });
});
