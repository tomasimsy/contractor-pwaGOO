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

  test("skips a garbled logo line and picks the real business-name line below it — a real Lowe's receipt layout", () => {
    // Approximates what OCR actually produces for a receipt whose top
    // is a stylized logo icon (reads as near-garbage) followed by the
    // plain-text business name, address and phone — the exact shape
    // that made the old "just take line one" heuristic grab noise.
    const text = [
      "L0\\WE'§", // garbled logo OCR — low letter ratio, should be skipped
      "LOWE'S HOME CENTERS, LLC",
      "1200 DARK AVENUE",
      "MONSTERVILLE, CA 94608   (510) 555-0127",
      "- SALE -",
      "SALES#: S2513US0 3644746",
      "TRANS#: 18854480 07-09-21",
    ].join("\n");
    expect(extractVendor(text)).toBe("LOWE'S HOME CENTERS, LLC");
  });

  test("picks the single-word brand name over a longer tagline right below it — Target", () => {
    // The old word-count-weighted scoring lost this one: "EXPECT MORE.
    // PAY LESS." has 4 words vs "TARGET"'s 1, so it used to win purely
    // on word count despite being a slogan, not the vendor.
    const text = ["TARGET", "EXPECT MORE. PAY LESS.", "IRVINE - 949-857-8337", "12/21/2024  12:37 PM"].join("\n");
    expect(extractVendor(text)).toBe("TARGET");
  });

  test("picks the brand name over a longer tagline and manager boilerplate — Walmart", () => {
    const text = [
      "Walmart",
      "Save money. Live better.",
      "MANAGER IRENE BROWN",
      "(360) 532-7595",
      "ST# 2037 OP# 00003048 TE# 18 TR# 05704",
    ].join("\n");
    expect(extractVendor(text)).toBe("Walmart");
  });
});

describe("extractAmount — real receipt layout", () => {
  test("reads the final total, not the subtotal, tax, or transaction number, on a real Lowe's-shaped receipt", () => {
    const text = [
      "LOWE'S HOME CENTERS, LLC",
      "234567 OATEY 14-OZ PLUMBERS PUTT     2.99",
      "345678 MR BBQ 18-IN GRILL BRUSH      4.99",
      "456789 GORILLA GEL SUPER GLUE        5.94",
      "567890 LOGIC 12 SKILLET             23.97",
      "678901 SS 6FT ROUND BEACH MAT       13.99",
      "SUBTOTAL:  51.88",
      "TAX:        4.28",
      "INVOICE 18934 TOTAL: 56.16",
      "VISA 56.16",
    ].join("\n");
    expect(extractAmount(text)).toBe(56.16);
  });
});
