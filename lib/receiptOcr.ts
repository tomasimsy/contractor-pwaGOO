/**
 * Best-effort receipt OCR — runs entirely client-side via Tesseract.js
 * (WASM, no API key, no per-request cost). Deliberately the free/local
 * alternative to a vision-AI API: lower accuracy on crumpled/glare/
 * thermal-paper receipts, acceptable because every result here is a
 * PREFILL a human reviews before saving, never an auto-submit.
 *
 * Must never throw in a way that blocks the expense form — scanning is
 * a convenience, not a requirement. Callers should treat every field
 * as optional and fall back to manual entry when it's null.
 *
 * PREPROCESSING — added after real-world phone testing showed both slow
 * scans and poor recognition:
 *   - A phone camera photo is routinely 3000-4000px on the long edge
 *     (12MP+). Tesseract gains nothing from that resolution — receipt
 *     text doesn't need more than ~1600px to read clearly — and feeding
 *     it the full-size image is most of why a scan felt slow. Downscale
 *     first (downscaleImage below).
 *   - Receipts are usually low-contrast (thermal print, shadows,
 *     folds). A simple grayscale + contrast stretch before OCR
 *     measurably helps Tesseract's accuracy on exactly this kind of
 *     image, for near-zero cost.
 * Both run on a canvas, client-side, before the file ever reaches
 * Tesseract — so this helps every image, not just receipts scanned on
 * a phone.
 */

export interface ReceiptScanResult {
  rawText: string;
  guessedAmount: number | null;
  guessedDate: string | null; // ISO yyyy-mm-dd, best-effort
  guessedVendor: string | null;
}

/** 0-1 while OCR is running (Tesseract's own "recognizing text" phase),
 * plus a short phase label for the two stages a caller can show
 * something for ("Preparing image…" / "Reading text…"). */
export type ReceiptScanProgress = (info: { phase: "preparing" | "recognizing"; progress: number }) => void;

const EMPTY_RESULT: ReceiptScanResult = {
  rawText: "",
  guessedAmount: null,
  guessedDate: null,
  guessedVendor: null,
};

const MAX_DIMENSION = 1400;

/** Downscale (if needed) + grayscale + contrast-stretch, entirely on a
 * canvas. Returns a JPEG Blob ready for Tesseract. Falls back to the
 * original file untouched if canvas/image decoding isn't available for
 * any reason — this must never be the thing that breaks scanning. */
async function preprocessImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    // Grayscale (luminance) + a mild contrast stretch around the
    // midpoint. Simple on purpose — this is not a real image-processing
    // pipeline, just enough to make faint thermal-print text stand out
    // more before Tesseract sees it.
    const contrastFactor = 1.35;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const contrasted = Math.min(255, Math.max(0, (gray - 128) * contrastFactor + 128));
      data[i] = data[i + 1] = data[i + 2] = contrasted;
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob ?? file;
  } catch (error) {
    console.error("Receipt image preprocessing failed (falling back to the original photo):", error);
    return file;
  }
}

/** Every `$X.XX`-shaped number in the text, largest first — a receipt's
 * TOTAL is virtually always its largest dollar amount (subtotal, tax,
 * and line items are all smaller than or equal to it). */
// Exported for unit testing (see tests/receipt-ocr-extraction.test.ts)
// — these are pure text-parsing functions with no Tesseract/canvas
// dependency, so they're testable in plain Node without a browser env.
export function extractAmount(text: string): number | null {
  const lines = text.split("\n");
  const moneyRegex = /\$?\s?(\d{1,6}(?:,\d{3})*\.\d{2})/;
  const moneyOnLine = (line: string): number | null => {
    const match = line.match(moneyRegex);
    if (!match) return null;
    const value = parseFloat(match[1].replace(/,/g, ""));
    return !Number.isNaN(value) && value > 0 ? value : null;
  };

  // Lines that name a DIFFERENT figure than the final total — subtotal,
  // tax, a discount, or how the total was PAID (cash tendered, change
  // given, a tip, a card brand). A dollar amount on one of these lines
  // must never be picked as the total, even by the "largest amount"
  // fallback below: "Cash Tendered $60.00" / "Change $3.84" are
  // routinely larger than the $56.16 total they're change for, and used
  // to win the old largest-number fallback for exactly that reason.
  const excludeContextRegex =
    /\b(sub[\s-]?total|tax|discount|savings|cash|tender(?:ed)?|change|tip|gratuity|payment|visa|mastercard|amex|american express|credit|debit)\b/i;

  // A "suggested gratuity" block prints its OWN "Total" per tip option
  // ("15% - $1.92 TOTAL: $15.24") below the real total, for the
  // customer to optionally circle and sign — none of those are what was
  // actually charged, and being later in the text they'd otherwise win
  // the "last total line" pass below. A percent sign is the tell: the
  // real total line never carries one, every suggested-tip line does.
  const percentRegex = /%/;

  // Highest confidence: an unambiguous "this is the final amount" label.
  // Checked BEFORE the generic "total" pass below because "grand total"/
  // "total due" would also match a bare /total/ regex — no need to fall
  // through to the ambiguous case when the receipt already said exactly
  // what this number is.
  const definiteTotalRegex = /(grand total|total due|amount due|balance due)/i;
  for (const line of lines) {
    if (definiteTotalRegex.test(line)) {
      const value = moneyOnLine(line);
      if (value !== null) return value;
    }
  }

  // Generic "total" — but a receipt lists Subtotal (pre-tax), Tax, then
  // Total (final, what we actually want) in that order, and "subtotal"
  // contains the substring "total". Excluding every "different figure"
  // line above (not just subtotal) covers the same OCR shape where a
  // total-ish line also carries a payment-method word ("Total (Visa)").
  // Also take the LAST match, not the first — Total is the final line
  // of that group, appearing after Subtotal/Tax.
  const bareTotalRegex = /\btotal\b/i;
  let lastTotalValue: number | null = null;
  for (const line of lines) {
    if (bareTotalRegex.test(line) && !excludeContextRegex.test(line) && !percentRegex.test(line)) {
      const value = moneyOnLine(line);
      if (value !== null) lastTotalValue = value;
    }
  }
  if (lastTotalValue !== null) return lastTotalValue;

  // No total-shaped line at all (bad crop, unusual layout, OCR dropped
  // the word). Arithmetic as a validation signal: subtotal + tax -
  // discount is what the total would have said, if those lines are
  // legible even though "total" itself isn't. Only trusted when some
  // OTHER (non-excluded) line on the receipt actually carries that
  // exact number — this confirms a real printed total we failed to
  // label, rather than manufacturing an amount no line agrees with.
  let subtotalValue: number | null = null;
  let taxValue = 0;
  let discountValue = 0;
  for (const line of lines) {
    if (/sub[\s-]?total/i.test(line)) {
      const v = moneyOnLine(line);
      if (v !== null) subtotalValue = v;
    } else if (/\btax\b/i.test(line)) {
      const v = moneyOnLine(line);
      if (v !== null) taxValue += v;
    } else if (/\b(discount|savings)\b/i.test(line)) {
      const v = moneyOnLine(line);
      if (v !== null) discountValue += v;
    }
  }

  // Fall back to the largest dollar-shaped number among lines that
  // aren't already spoken for by subtotal/tax/discount/cash/tip/card —
  // never the largest number on the WHOLE receipt, which is routinely
  // the cash tendered or a pre-discount price, not the total.
  const candidateValues = lines
    .filter((line) => !excludeContextRegex.test(line) && !percentRegex.test(line))
    .map(moneyOnLine)
    .filter((v): v is number => v !== null);

  if (subtotalValue !== null) {
    const expected = Math.round((subtotalValue + taxValue - discountValue) * 100) / 100;
    const arithmeticMatch = candidateValues.find((v) => Math.abs(v - expected) < 0.005);
    if (arithmeticMatch !== undefined) return arithmeticMatch;
  }

  if (candidateValues.length === 0) return null;
  return Math.max(...candidateValues);
}

/** Common receipt date shapes: MM/DD/YYYY, MM-DD-YYYY, and "Mon DD, YYYY". */
export function extractDate(text: string): string | null {
  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    let [, month, day, year] = numeric;
    if (year.length === 2) year = `20${year}`;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return iso;
  }

  const named = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (named) {
    const parsed = new Date(`${named[1]} ${named[2]}, ${named[3]}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return null;
}

/** Weakest guess of the three — a receipt's vendor name is near the top,
 * but "just take the first line with a letter in it" (the old
 * approach) grabbed whatever OCR made of the LOGO — a stylized
 * wordmark/icon that reads as garbage far more often than the plain
 * printed business-name line just below it (e.g. Lowe's: the house-
 * icon logo OCRs unreliably, but "LOWE'S HOME CENTERS, LLC" right
 * under it reads cleanly).
 *
 * An earlier version of this function SCORED all candidate lines and
 * weighted word count heavily, on the theory that a fuller business
 * name beats a single stray word. That backfired hard on single-word
 * brands: "TARGET" (1 word) lost to the tagline right below it,
 * "EXPECT MORE. PAY LESS." (4 words) — same for "Walmart" losing to
 * "Save money. Live better." Word count is not a proxy for "is this
 * the vendor name"; position is. This now takes the FIRST line that
 * passes the filters below, in top-to-bottom order, rather than the
 * best-scoring line anywhere in the first several — a receipt's
 * business name is essentially always the first legitimate text on
 * it, once logos/taglines/boilerplate are filtered out. */
export function extractVendor(text: string): string | null {
  const candidateLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 8); // the vendor name is always near the top, never buried mid-receipt

  const phoneRegex = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  // Street address: a leading number followed by a word (street/ave/etc).
  const addressRegex = /^\d+\s+\S/;
  const transactionLineRegex = /\b(sale|sales#|trans#|invoice|order|receipt|store|terminal|manager|cashier|welcome|thank you|self[\s-]?check[\s-]?out|register|lane)\b/i;
  const dateRegex = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
  // Tagline/slogan shape: "Expect more. Pay less." / "Save money. Live
  // better." — a sentence-cased phrase with a period mid-line, not a
  // business name (those are ALL CAPS or a single brand word/phrase
  // with no internal sentence punctuation).
  const taglineRegex = /[a-zA-Z]\.\s+[A-Z]/;
  // Catches the same kind of tagline text when OCR garbles it too badly
  // for the mid-line period+capital shape above to still be there — a
  // real receipt logo("More saving. More doing.") OCR'd as two SEPARATE
  // lines, each ending its own sentence ("El Hore savin.", "Xl} More
  // doing.\""), so neither has an internal period-then-capital to match.
  // A trailing period (after stripping stray closing quotes/brackets
  // OCR tacks on) is still a strong "this is a sentence fragment, not a
  // business name" signal on its own — real vendor names don't end with
  // a full stop.
  const trailingSentencePunctuationRegex = /[”"'’)\]}]+$/;

  for (const line of candidateLines) {
    if (
      phoneRegex.test(line) ||
      addressRegex.test(line) ||
      transactionLineRegex.test(line) ||
      dateRegex.test(line) ||
      taglineRegex.test(line) ||
      line.replace(trailingSentencePunctuationRegex, "").trimEnd().endsWith(".")
    ) {
      continue;
    }

    const letters = line.replace(/[^a-zA-Z]/g, "");
    const nonSpaceLength = line.replace(/\s/g, "").length;
    if (nonSpaceLength === 0) continue;
    const letterRatio = letters.length / nonSpaceLength;
    // Mostly-punctuation/garbled OCR noise (e.g. a mangled logo) fails
    // this outright — real business names are overwhelmingly letters.
    if (letterRatio < 0.7) continue;
    // A stylized logo (Home Depot's icon+wordmark, etc.) can garble down
    // to a short run of otherwise-clean letters with no digits or
    // punctuation to trip the ratio check above — e.g. "SEV" scanned
    // off a Home Depot receipt, which then won as "first line to pass
    // every filter" ahead of the real "THE HOME DEPOT" text beneath it.
    // 3 was too permissive to catch that; every real vendor name this
    // extractor is tested against is 4+ letters (TARGET, IKEA, ACME…).
    if (letters.length < 4) continue;

    return line; // first line to pass every filter — take it and stop.
  }

  // Nothing near the top passed — the vendor's name genuinely isn't in
  // the OCR text there (a stylized logo that failed to OCR at all, not
  // just an OCR'd-badly one — see the Home Depot case this fallback was
  // built for: "THE HOME DEPOT" never appears anywhere in the top of
  // the receipt, only mangled fragments of its logo and tagline do).
  // Regex/position heuristics over an ABSENT name can't recover it; a
  // small dictionary of common vendors can, because the SAME name often
  // still appears in plain print further down the receipt (a survey
  // blurb, a loyalty-program footer) even when the logo didn't OCR.
  return matchKnownVendor(text);
}

/** Curated fallback list — common chains a contractor's expenses are
 * likely to include (hardware/home-improvement/fuel/office-supply).
 * NOT consulted unless the position heuristic above found nothing, so
 * it can never override or change any of that heuristic's own tests;
 * it only recovers cases that would otherwise be a flat null. */
const KNOWN_VENDORS: string[] = [
  "The Home Depot", "Lowe's", "Walmart", "Target", "Costco", "Sam's Club",
  "Menards", "Ace Hardware", "True Value", "Harbor Freight", "Tractor Supply",
  "CVS", "Walgreens", "Rite Aid", "Starbucks", "Shell", "Chevron", "ExxonMobil",
  "7-Eleven", "Circle K", "Office Depot", "Staples", "Best Buy", "Amazon",
  "Grainger", "Fastenal", "Ferguson", "Sherwin-Williams", "Behr",
  "ABC Supply", "SRS Distribution", "Beacon Roofing Supply", "GAF",
  "Owens Corning", "McDonald's", "Subway", "Chick-fil-A", "Wendy's",
  "Dunkin", "U-Haul", "Enterprise Rent-A-Car", "Sunbelt Rentals",
  "United Rentals",
];

const VENDOR_STOPWORDS = new Set(["THE", "OF", "AND", "FOR", "INC", "LLC", "CO"]);

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prevRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      currRow[j] =
        a[i - 1] === b[j - 1] ? prevRow[j - 1] : 1 + Math.min(prevRow[j - 1], prevRow[j], currRow[j - 1]);
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

/** Word-by-word, not whole-name-at-once — a vendor's name doesn't need
 * to survive intact on one line; "HOME" and "DEPOT" each turning up
 * SEPARATELY anywhere in the receipt is enough, which is exactly how
 * they showed up (in a "$5,000 HOME DEPOT gift card" survey blurb, not
 * near the logo) on the real receipt that motivated this. Multi-word
 * vendors require every significant word (stopwords like "The"
 * excluded) to be found with a small edit-distance allowance for OCR
 * noise; single-word vendors (Target, Walmart, Costco…) require an
 * EXACT match — a fuzzy match on one short word alone is too easy to
 * hit by coincidence to trust. */
function matchKnownVendor(text: string): string | null {
  const ocrWords = text.toUpperCase().split(/[^A-Z]+/).filter((w) => w.length >= 3);
  if (ocrWords.length === 0) return null;

  for (const vendor of KNOWN_VENDORS) {
    const vendorWords = vendor
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter((w) => w.length >= 3 && !VENDOR_STOPWORDS.has(w));
    if (vendorWords.length === 0) continue;

    const allWordsFound = vendorWords.every((vw) => {
      const maxDistance = vendorWords.length === 1 ? 0 : Math.max(1, Math.floor(vw.length * 0.3));
      return ocrWords.some((ow) => levenshtein(vw, ow) <= maxDistance);
    });
    if (allWordsFound) return vendor;
  }

  return null;
}

export async function scanReceipt(file: File, onProgress?: ReceiptScanProgress): Promise<ReceiptScanResult> {
  let worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | null = null;
  try {
    onProgress?.({ phase: "preparing", progress: 0 });
    const prepared = await preprocessImage(file);
    onProgress?.({ phase: "preparing", progress: 1 });

    // Dynamic import — Tesseract.js is Web Worker/WASM-based and must
    // never be pulled into a server bundle or run during SSR.
    const { createWorker, PSM } = await import("tesseract.js");
    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          onProgress?.({ phase: "recognizing", progress: m.progress });
        }
      },
    });
    // SINGLE_BLOCK skips Tesseract's default full-page layout analysis
    // (column/orientation/table detection) — real overhead a receipt's
    // one column of text doesn't need, and the main speed win here
    // beyond the image downscale above.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const { data } = await worker.recognize(prepared);
    const rawText = data.text || "";
    if (!rawText.trim()) return EMPTY_RESULT;

    return {
      rawText,
      guessedAmount: extractAmount(rawText),
      guessedDate: extractDate(rawText),
      guessedVendor: extractVendor(rawText),
    };
  } catch (error) {
    console.error("Receipt scan failed (non-fatal — falling back to manual entry):", error);
    return EMPTY_RESULT;
  } finally {
    await worker?.terminate();
  }
}
