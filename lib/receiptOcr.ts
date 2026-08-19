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
  // contains the substring "total". Explicitly excluding it here was
  // the bug: matching /total/i against "Subtotal: $45.00" returned the
  // PRE-TAX amount. Also take the LAST match, not the first — Total is
  // the final line of that group, appearing after Subtotal/Tax.
  const bareTotalRegex = /\btotal\b/i;
  const subtotalRegex = /sub[\s-]?total/i;
  let lastTotalValue: number | null = null;
  for (const line of lines) {
    if (bareTotalRegex.test(line) && !subtotalRegex.test(line)) {
      const value = moneyOnLine(line);
      if (value !== null) lastTotalValue = value;
    }
  }
  if (lastTotalValue !== null) return lastTotalValue;

  // Fall back to the largest dollar-shaped number anywhere in the text.
  const allMatches = [...text.matchAll(new RegExp(moneyRegex, "g"))];
  const values = allMatches
    .map((m) => parseFloat(m[1].replace(/,/g, "")))
    .filter((v) => !Number.isNaN(v) && v > 0);
  if (values.length === 0) return null;
  return Math.max(...values);
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
  const transactionLineRegex = /\b(sale|sales#|trans#|invoice|order|receipt|store|terminal|manager|cashier|welcome|thank you)\b/i;
  const dateRegex = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
  // Tagline/slogan shape: "Expect more. Pay less." / "Save money. Live
  // better." — a sentence-cased phrase with a period mid-line, not a
  // business name (those are ALL CAPS or a single brand word/phrase
  // with no internal sentence punctuation).
  const taglineRegex = /[a-zA-Z]\.\s+[A-Z]/;

  for (const line of candidateLines) {
    if (
      phoneRegex.test(line) ||
      addressRegex.test(line) ||
      transactionLineRegex.test(line) ||
      dateRegex.test(line) ||
      taglineRegex.test(line)
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
    if (letters.length < 3) continue;

    return line; // first line to pass every filter — take it and stop.
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
