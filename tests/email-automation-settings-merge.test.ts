import { describe, test, expect } from "vitest";
import { resolveEffectiveSettings, type StoredAutomationRow } from "../lib/emailAutomationSettings";

function row(overrides: Partial<StoredAutomationRow>): StoredAutomationRow {
  return {
    key: "google_review",
    profileId: null,
    enabled: true,
    delayValue: 2,
    delayUnit: "days",
    condition: null,
    subjectTemplate: null,
    bodyTemplate: null,
    ...overrides,
  };
}

describe("resolveEffectiveSettings", () => {
  test("falls back to the registry default when no rows exist", () => {
    const effective = resolveEffectiveSettings("google_review", [], null);
    expect(effective).toEqual({
      enabled: true,
      delayValue: 2,
      delayUnit: "days",
      condition: null,
      subjectTemplate: null,
      bodyTemplate: null,
    });
  });

  test("a company-default row (profileId null) overrides the registry default", () => {
    const rows = [row({ enabled: false, delayValue: 5 })];
    const effective = resolveEffectiveSettings("google_review", rows, null);
    expect(effective.enabled).toBe(false);
    expect(effective.delayValue).toBe(5);
  });

  test("a profile-specific row overrides the company default for that profile", () => {
    const rows = [
      row({ profileId: null, delayValue: 5 }),
      row({ profileId: "profile-a", delayValue: 9 }),
    ];
    expect(resolveEffectiveSettings("google_review", rows, "profile-a").delayValue).toBe(9);
    // A DIFFERENT profile with no row of its own falls back to the company default, not profile-a's.
    expect(resolveEffectiveSettings("google_review", rows, "profile-b").delayValue).toBe(5);
  });

  test("requesting the company default (profileId null) ignores profile-specific rows", () => {
    const rows = [
      row({ profileId: null, delayValue: 5 }),
      row({ profileId: "profile-a", delayValue: 9 }),
    ];
    expect(resolveEffectiveSettings("google_review", rows, null).delayValue).toBe(5);
  });

  test("rows for a different automation key never leak into the result", () => {
    const rows = [row({ key: "payment_receipt", enabled: false })];
    const effective = resolveEffectiveSettings("google_review", rows, null);
    expect(effective.enabled).toBe(true); // registry default, not the payment_receipt row
  });
});
