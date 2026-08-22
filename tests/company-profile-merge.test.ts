import { describe, test, expect } from "vitest";
import { mergeCompanyDefaults, mergeProfileOverrides, parseCompanyProfileRow, type CompanyProfile } from "../lib/company";

function profile(overrides: Partial<CompanyProfile>): CompanyProfile {
  return {
    id: "profile-1",
    companyId: "company-1",
    companyName: "OSRPros",
    logoUrl: null,
    companyPhone: null,
    companyEmail: null,
    companyWebsite: null,
    companyAddress: null,
    footerMessage: null,
    ...overrides,
  };
}

describe("mergeProfileOverrides", () => {
  test("a null profile returns the base company settings untouched", () => {
    const base = mergeCompanyDefaults({ company_name: "One Square Roofing LLC", company_phone: "555-1000" });
    expect(mergeProfileOverrides(base, null)).toEqual(base);
  });

  test("overrides only the fields the profile actually sets, falling back to the company default for the rest", () => {
    const base = mergeCompanyDefaults({
      company_name: "One Square Roofing LLC",
      company_phone: "555-1000",
      company_email: "info@onesquareroofing.com",
      license_number: "LIC-123",
      tax_id: "TAX-456",
    });
    const merged = mergeProfileOverrides(base, profile({ companyName: "OSRPros", companyPhone: "555-2000" }));

    expect(merged.company_name).toBe("OSRPros");
    expect(merged.company_phone).toBe("555-2000");
    // Not overridden by the profile — falls back to the company's own value.
    expect(merged.company_email).toBe("info@onesquareroofing.com");
    // Legal/company-wide facts are never touched by a brand profile.
    expect(merged.license_number).toBe("LIC-123");
    expect(merged.tax_id).toBe("TAX-456");
  });

  test("never overrides tax_id/license_number/terms/warranty — those stay company-wide", () => {
    const base = mergeCompanyDefaults({ terms_conditions: "Company-wide terms", warranty_text: "Company-wide warranty" });
    const merged = mergeProfileOverrides(base, profile({ companyName: "OSRPros" }));
    expect(merged.terms_conditions).toBe("Company-wide terms");
    expect(merged.warranty_text).toBe("Company-wide warranty");
  });
});

describe("parseCompanyProfileRow", () => {
  test("returns null for a null row", () => {
    expect(parseCompanyProfileRow(null)).toBeNull();
  });

  test("maps the raw snake_case row (as returned by get_company_profile) to a CompanyProfile", () => {
    const row = {
      id: "profile-1",
      company_id: "company-1",
      company_name: "OSRPros",
      logo_url: "https://example.com/logo.png",
      company_phone: "555-2000",
      company_email: "hello@osrpros.com",
      company_website: "https://osrpros.com",
      company_address: "123 Main St",
      footer_message: "Thanks for choosing OSRPros!",
    };
    expect(parseCompanyProfileRow(row)).toEqual({
      id: "profile-1",
      companyId: "company-1",
      companyName: "OSRPros",
      logoUrl: "https://example.com/logo.png",
      companyPhone: "555-2000",
      companyEmail: "hello@osrpros.com",
      companyWebsite: "https://osrpros.com",
      companyAddress: "123 Main St",
      footerMessage: "Thanks for choosing OSRPros!",
    });
  });
});
