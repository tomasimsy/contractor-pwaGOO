import { describe, test, expect } from "vitest";
import { validatePortalDomain } from "../lib/portalDomainValidation";

describe("validatePortalDomain", () => {
  test("accepts a plain https origin and normalizes it (no change needed)", () => {
    const result = validatePortalDomain("https://osrpros.com");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("https://osrpros.com");
  });

  test("strips a trailing slash so every saved value has one consistent shape", () => {
    const result = validatePortalDomain("https://osrpros.com/");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("https://osrpros.com");
  });

  test("an empty/blank input is valid — clears the override, falls back to the app default", () => {
    expect(validatePortalDomain("")).toEqual({ valid: true, normalized: null });
    expect(validatePortalDomain("   ")).toEqual({ valid: true, normalized: null });
  });

  test("rejects http:// (must be https)", () => {
    const result = validatePortalDomain("http://osrpros.com");
    expect(result.valid).toBe(false);
  });

  test("rejects unparseable input", () => {
    const result = validatePortalDomain("not a url at all");
    expect(result.valid).toBe(false);
  });

  test.each([
    "https://localhost",
    "https://localhost:3000",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://192.168.1.10",
    "https://172.16.0.1",
    "https://172.31.255.255",
    "https://0.0.0.0",
    "https://my-machine.local",
    "https://server.internal",
  ])("rejects local/private/internal hostname: %s", (input) => {
    expect(validatePortalDomain(input).valid).toBe(false);
  });

  test("does not false-positive a public domain that merely contains a similar substring", () => {
    // "10.0.0.5" is private, but a real public domain starting with
    // similar digits/words must not be rejected by an overly broad
    // pattern.
    expect(validatePortalDomain("https://172.32.0.1").valid).toBe(true); // outside the 172.16-31 private range
    expect(validatePortalDomain("https://osrpros-internal-app.com").valid).toBe(true);
  });

  test("rejects a path", () => {
    expect(validatePortalDomain("https://osrpros.com/portal").valid).toBe(false);
    expect(validatePortalDomain("https://osrpros.com/some/deep/path").valid).toBe(false);
  });

  test("rejects a query string or fragment", () => {
    expect(validatePortalDomain("https://osrpros.com?foo=bar").valid).toBe(false);
    expect(validatePortalDomain("https://osrpros.com#section").valid).toBe(false);
  });

  test("trims surrounding whitespace before validating", () => {
    const result = validatePortalDomain("  https://osrpros.com  ");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("https://osrpros.com");
  });
});
