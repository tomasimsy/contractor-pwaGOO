import { describe, it, expect } from "vitest";
import { formatPhone, formatSsn, ssnLast4, formatZip, formatState, US_STATES } from "@/lib/employeeFormat";

describe("formatPhone", () => {
  it("formats as you type", () => {
    expect(formatPhone("5")).toBe("(5");
    expect(formatPhone("555")).toBe("(555");
    expect(formatPhone("5551")).toBe("(555) 1");
    expect(formatPhone("5551234")).toBe("(555) 123-4");
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
  });

  it("ignores non-digits and stops at ten digits", () => {
    expect(formatPhone("(555) 123-4567 ext 9")).toBe("(555) 123-4567");
  });
});

describe("SSN handling", () => {
  it("formats as XXX-XX-XXXX while typing", () => {
    expect(formatSsn("123")).toBe("123");
    expect(formatSsn("12345")).toBe("123-45");
    expect(formatSsn("123456789")).toBe("123-45-6789");
  });

  it("keeps only the last four digits of a complete SSN", () => {
    expect(ssnLast4("123-45-6789")).toBe("6789");
  });

  it("returns nothing for an incomplete SSN, so a partial number is never kept", () => {
    expect(ssnLast4("123-45")).toBeNull();
    expect(ssnLast4("")).toBeNull();
  });

  it("never allows more than nine digits in the field", () => {
    expect(formatSsn("1234567890123")).toBe("123-45-6789");
  });
});

describe("address fields", () => {
  it("limits ZIP to five digits", () => {
    expect(formatZip("787-01-2345")).toBe("78701");
  });

  it("uppercases a two-letter state code", () => {
    expect(formatState("tx")).toBe("TX");
    expect(formatState("texas")).toBe("TE");
  });

  it("offers all 50 states plus DC", () => {
    expect(US_STATES).toHaveLength(51);
    expect(US_STATES.some((s) => s.code === "TX")).toBe(true);
  });
});
