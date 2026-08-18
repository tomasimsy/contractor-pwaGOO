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
 */

export interface ReceiptScanResult {
  rawText: string;
  guessedAmount: number | null;
  guessedDate: string | null; // ISO yyyy-mm-dd, best-effort
  guessedVendor: string | null;
}

const EMPTY_RESULT: ReceiptScanResult = {
  rawText: "",
  guessedAmount: null,
  guessedDate: null,
  guessedVendor: null,
};

/** Every `$X.XX`-shaped number in the text, largest first — a receipt's
 * TOTAL is virtually always its largest dollar amount (subtotal, tax,
 * and line items are all smaller than or equal to it). */
function extractAmount(text: string): number | null {
  const lines = text.split("\n");

  // Prefer a line that looks like a total line — much more reliable
  // than "largest number on the page" alone (a $50 line item next to a
  // $12 discount can otherwise out-rank a genuinely smaller total).
  const totalLineRegex = /(total|amount due|balance due|grand total)/i;
  const moneyRegex = /\$?\s?(\d{1,6}(?:,\d{3})*\.\d{2})/;

  for (const line of lines) {
    if (totalLineRegex.test(line)) {
      const match = line.match(moneyRegex);
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ""));
        if (!Number.isNaN(value) && value > 0) return value;
      }
    }
  }

  // Fall back to the largest dollar-shaped number anywhere in the text.
  const allMatches = [...text.matchAll(new RegExp(moneyRegex, "g"))];
  const values = allMatches
    .map((m) => parseFloat(m[1].replace(/,/g, "")))
    .filter((v) => !Number.isNaN(v) && v > 0);
  if (values.length === 0) return null;
  return Math.max(...values);
}

/** Common receipt date shapes: MM/DD/YYYY, MM-DD-YYYY, and "Mon DD, YYYY". */
function extractDate(text: string): string | null {
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

/** Weakest guess of the three — a receipt's vendor name is usually its
 * first non-empty printed line (store name/logo text), but OCR noise
 * (garbled header text, a stray barcode line) means this is genuinely
 * just a starting point, not a confident read. */
function extractVendor(text: string): string | null {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length >= 3 && /[a-zA-Z]/.test(l));
  return line || null;
}

export async function scanReceipt(file: File): Promise<ReceiptScanResult> {
  try {
    // Dynamic import — Tesseract.js is Web Worker/WASM-based and must
    // never be pulled into a server bundle or run during SSR.
    const { default: Tesseract } = await import("tesseract.js");
    const { data } = await Tesseract.recognize(file, "eng");
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
  }
}
