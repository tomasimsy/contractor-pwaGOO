/**
 * Pure text-parsing tests for lib/receiptOcr.ts's field extraction —
 * no Tesseract/canvas involved, just the regex logic over raw OCR text.
 *
 * The subtotal case pins a real bug: /total/i matches inside "Subtotal",
 * so the amount extractor used to return the PRE-TAX subtotal instead
 * of the final total whenever a receipt listed both (i.e. almost all
 * of them).
 */
import { describe, test, expect } from "vitest";
import { extractAmount, extractDate, extractVendor } from "../lib/receiptOcr";

describe("extractAmount", () => {
  test("prefers the final Total over Subtotal, even though Subtotal contains the substring 'total'", () => {
    const text = ["ACME HARDWARE", "Widget    $10.00", "Subtotal    $45.00", "Tax    $3.60", "Total    $48.60"].join("\n");
    expect(extractAmount(text)).toBe(48.6);
  });

  test("an unambiguous label (Amount Due) wins outright", () => {
    const text = ["Subtotal: $100.00", "Tax: $8.00", "Amount Due: $108.00"].join("\n");
    expect(extractAmount(text)).toBe(108.0);
  });

  test("falls back to the largest dollar amount when no total-shaped line exists", () => {
    const text = ["Item A  $12.50", "Item B  $7.25"].join("\n");
    expect(extractAmount(text)).toBe(12.5);
  });

  test("returns null when there's no dollar amount at all", () => {
    expect(extractAmount("no numbers here")).toBeNull();
  });
});

describe("extractDate", () => {
  test("reads a numeric MM/DD/YYYY date", () => {
    expect(extractDate("Date: 08/18/2026")).toBe("2026-08-18");
  });

  test("reads a named-month date", () => {
    expect(extractDate("Aug 18, 2026")).toBe("2026-08-18");
  });

  test("returns null with no recognizable date", () => {
    expect(extractDate("no date on this line")).toBeNull();
  });
});

describe("extractVendor", () => {
  test("takes the first non-empty line with letters as the best-effort vendor guess", () => {
    expect(extractVendor("\n\nACME HARDWARE\n123 Main St")).toBe("ACME HARDWARE");
  });

  test("returns null for text with no usable line", () => {
    expect(extractVendor("123\n456")).toBeNull();
  });
});
