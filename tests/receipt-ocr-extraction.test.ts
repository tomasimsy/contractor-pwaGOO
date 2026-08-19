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

  test("ignores Cash/Change/Tip/Payment lines even though they're larger than the real total", () => {
    // Cash tendered and change are routinely bigger numbers than the
    // total they're change for — a plain "largest number on the
    // receipt" fallback picks the $60.00 cash line here, not the
    // $56.16 total.
    const text = [
      "Subtotal    51.88",
      "Tax          4.28",
      "Total       56.16",
      "Cash Tendered 60.00",
      "Change         3.84",
    ].join("\n");
    expect(extractAmount(text)).toBe(56.16);
  });

  test("ignores a card-brand/payment line in the largest-amount fallback when no Total line exists", () => {
    const text = ["Item A  $12.50", "Item B  $7.25", "VISA  $19.75"].join("\n");
    expect(extractAmount(text)).toBe(12.5);
  });

  test("uses subtotal + tax arithmetic to confirm the total when the word 'total' never appears", () => {
    // OCR dropped the "Total" label itself, but Subtotal/Tax are
    // legible and a line elsewhere carries their sum — that's strong
    // enough evidence to prefer it over the largest raw number ($60,
    // the cash tendered).
    const text = ["Subtotal   51.88", "Tax         4.28", "56.16", "Cash        60.00", "Change       3.84"].join("\n");
    expect(extractAmount(text)).toBe(56.16);
  });

  test("picks the real Total over a suggested-gratuity block's own per-option Totals — Breakfast Club receipt", () => {
    // A real diner/restaurant receipt shape: below the actual total, a
    // "Suggested Gratuity" block prints its OWN "Total" per tip option
    // for the customer to circle and sign. Those are later in the text
    // and bigger than the real total, so the old "last total line"/
    // "largest amount" logic picked $15.88 (the 20% option) instead of
    // the $13.32 actually charged.
    const text = [
      "SUBTOTAL:                    $12.77",
      "TAX:                          $0.55",
      "TOTAL:                       $13.32",
      "",
      "      SUGGESTED GRATUITY:",
      "[ ] 15% - $1.92 TOTAL: $15.24",
      "[ ] 18% - $2.30 TOTAL: $15.62",
      "[ ] 20% - $2.55 TOTAL: $15.88",
    ].join("\n");
    expect(extractAmount(text)).toBe(13.32);
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

  test("skips a short garbled-logo fragment and a self-checkout line — Home Depot receipt", () => {
    // Real failure: a Home Depot self-checkout receipt's stylized
    // logo+icon OCR'd down to a clean 3-letter fragment ("SEV") with no
    // digits/punctuation to trip the letter-ratio check, so it won as
    // "first line to pass every filter" ahead of the real vendor text.
    const text = [
      "SEV",
      "THE HOME DEPOT",
      "More saving. More doing.",
      "1234 BLUED GREEN ROAD",
      "READYING, MA 45678   (901)222-3333",
      "1234 56789 01234  12/30/22 04:01 PM",
      "SELF CHECK OUT",
    ].join("\n");
    expect(extractVendor(text)).toBe("THE HOME DEPOT");
  });

  test("returns null rather than a garbled fragment when OCR never actually read the vendor name — real Home Depot scan", () => {
    // The exact raw Tesseract output from a live scan: the logo/wordmark
    // wasn't recognized as "THE HOME DEPOT" at all, just short garbage
    // ("SEV", "NW") and the tagline split across two lines, each ending
    // its own sentence ("El Hore savin.", "Xl} More doing.\""), which
    // used to slip through since neither has the mid-line period+capital
    // shape the tagline filter looks for. There is no usable vendor text
    // anywhere in this scan — returning null (so the user types it
    // manually) is the correct outcome, not confidently guessing wrong.
    const text = [
      "SEV",
      "NW",
      "El Hore savin.",
      'Xl} More doing."',
      "1234 BLUED GREEN ROAD",
      "READYING. MA 45678 (90122-3333",
      "1234 E789 01234 12/30/22 04:01 PM",
      "SELF CHECK OUT",
    ].join("\n");
    expect(extractVendor(text)).toBeNull();
  });

  test("recovers the vendor from the known-vendor dictionary when it's absent near the top but named later on the receipt", () => {
    // The full real scan (not just the truncated top-of-receipt text
    // above): "THE HOME DEPOT" never OCR'd near the logo at all, but
    // "HOME DEPOT" prints cleanly further down in the survey blurb
    // ("$5,000 HOME DEPOT GIFT CARD"). No position/filter heuristic
    // over the top of the receipt can find a name that isn't there —
    // this is exactly what the dictionary fallback exists to recover.
    const text = [
      "SEV",
      "NW",
      "El Hore savin.",
      'Xl} More doing."',
      "1234 BLUED GREEN ROAD",
      "READYING. MA 45678 (90122-3333",
      "1234 E789 01234 12/30/22 04:01 PM",
      "SELF CHECK OUT",
      "SUBTOTAL 1.78",
      "SALES TAX 0.13",
      "TOTAL $1.91",
      "CASH 1.00",
      "CASH 1.00",
      "CHANGE DUE 0.09",
      "RETURN POLICY DEFINITIONS",
      "DID WE NAIL IT?",
      "Take 3 short survey for a chance T0 WIN",
      "A°$5.000 HOME DEPOT GIFT CARD",
      "www. homedepo't . con/ survey",
    ].join("\n");
    expect(extractVendor(text)).toBe("The Home Depot");
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

  test("reads $1.91, not the two Cash lines or Change Due, on a real Home Depot self-checkout scan", () => {
    const text = [
      "SUBTOTAL 1.78",
      "SALES TAX 0.13",
      "TOTAL $1.91",
      "CASH 1.00",
      "CASH 1.00",
      "CHANGE DUE 0.09",
    ].join("\n");
    expect(extractAmount(text)).toBe(1.91);
  });
});
