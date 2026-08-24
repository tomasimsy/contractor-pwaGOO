import { describe, test, expect } from "vitest";
import { resolvePortalOrigin, DEFAULT_ORIGIN } from "../lib/portalDomain";
import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN = "9f2c1a4e-9999-4b7c-8b3e-abc123456789";

/** A stub Supabase client exposing only what getCompanyProfileById
 * actually calls (supabase.rpc("get_company_profile", {p_profile_id}))
 * — mirrors the RPC's real return shape (a row_to_json of the profile,
 * or null when not found/deleted). Lets these tests exercise the
 * resolver's real DB-driven code path without a live database. */
function stubSupabase(profilesById: Record<string, Record<string, unknown>>): SupabaseClient {
  return {
    rpc: async (fnName: string, args: Record<string, unknown>) => {
      if (fnName !== "get_company_profile") throw new Error(`Unexpected RPC: ${fnName}`);
      const row = profilesById[args.p_profile_id as string] ?? null;
      return { data: row, error: null };
    },
  } as unknown as SupabaseClient;
}

function profileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "profile-1",
    company_id: "company-1",
    company_name: "OSRPros",
    logo_url: null,
    company_phone: null,
    company_email: null,
    company_website: null,
    company_address: null,
    footer_message: null,
    portal_domain: null,
    ...overrides,
  };
}

describe("resolvePortalOrigin", () => {
  test("a profile with a configured portal_domain resolves to it — OSRPros case", async () => {
    const supabase = stubSupabase({
      "osrpros-id": profileRow({ id: "osrpros-id", portal_domain: "https://osrpros.com" }),
    });
    expect(await resolvePortalOrigin(supabase, "osrpros-id")).toBe("https://osrpros.com");
  });

  test("a profile with a configured portal_domain resolves to it — One Square Roofing case", async () => {
    const supabase = stubSupabase({
      "one-square-id": profileRow({ id: "one-square-id", portal_domain: "https://app.onesquareroof.com" }),
    });
    expect(await resolvePortalOrigin(supabase, "one-square-id")).toBe("https://app.onesquareroof.com");
  });

  test("a newly created profile with its own configured portal_domain resolves correctly — no source-code change needed", async () => {
    // Simulates exactly the "profile deleted and recreated in Settings"
    // scenario that broke the old hardcoded-map approach: a brand-new
    // id, never seen before, works purely because the DOMAIN is read
    // from the row itself.
    const supabase = stubSupabase({
      "brand-new-id-never-seen-before": profileRow({ id: "brand-new-id-never-seen-before", portal_domain: "https://freshly-created-brand.example.com" }),
    });
    expect(await resolvePortalOrigin(supabase, "brand-new-id-never-seen-before")).toBe("https://freshly-created-brand.example.com");
  });

  test("a null profile_id (legacy/unassigned estimate) resolves to the safe default — never queries the database", async () => {
    let called = false;
    const supabase = { rpc: async () => { called = true; return { data: null, error: null }; } } as unknown as SupabaseClient;
    expect(await resolvePortalOrigin(supabase, null)).toBe(DEFAULT_ORIGIN);
    expect(await resolvePortalOrigin(supabase, undefined)).toBe(DEFAULT_ORIGIN);
    expect(called).toBe(false);
  });

  test("a profile with no portal_domain configured resolves to the safe default", async () => {
    const supabase = stubSupabase({
      "no-domain-set": profileRow({ id: "no-domain-set", portal_domain: null }),
    });
    expect(await resolvePortalOrigin(supabase, "no-domain-set")).toBe(DEFAULT_ORIGIN);
  });

  test("a deleted/missing profile id resolves to the safe default — no crash", async () => {
    const supabase = stubSupabase({});
    expect(await resolvePortalOrigin(supabase, "does-not-exist")).toBe(DEFAULT_ORIGIN);
  });

  test("the resolver's signature makes it structurally impossible for the admin's current hostname to affect the result — no origin/host parameter exists at all", async () => {
    const supabase = stubSupabase({
      "osrpros-id": profileRow({ id: "osrpros-id", portal_domain: "https://osrpros.com" }),
    });
    // Same call, same result, regardless of what domain this code is
    // running on — there is no window/request object involved.
    const first = await resolvePortalOrigin(supabase, "osrpros-id");
    const second = await resolvePortalOrigin(supabase, "osrpros-id");
    expect(first).toBe(second);
    expect(first).toBe("https://osrpros.com");
  });

  test("full portal URL assembly: the resolved domain combines with the token, which the resolver never sees or touches", async () => {
    const supabase = stubSupabase({
      "osrpros-id": profileRow({ id: "osrpros-id", portal_domain: "https://osrpros.com" }),
    });
    const origin = await resolvePortalOrigin(supabase, "osrpros-id");
    const url = `${origin}/portal/${TOKEN}`;
    expect(url).toBe(`https://osrpros.com/portal/${TOKEN}`);

    const legacyOrigin = await resolvePortalOrigin(supabase, null);
    const legacyUrl = `${legacyOrigin}/portal/${TOKEN}`;
    expect(legacyUrl).toBe(`${DEFAULT_ORIGIN}/portal/${TOKEN}`);
  });
});
