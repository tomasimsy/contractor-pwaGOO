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

const MAX_DIMENSION = 1600;

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

export async function scanReceipt(file: File, onProgress?: ReceiptScanProgress): Promise<ReceiptScanResult> {
  try {
    onProgress?.({ phase: "preparing", progress: 0 });
    const prepared = await preprocessImage(file);
    onProgress?.({ phase: "preparing", progress: 1 });

    // Dynamic import — Tesseract.js is Web Worker/WASM-based and must
    // never be pulled into a server bundle or run during SSR.
    const { default: Tesseract } = await import("tesseract.js");
    const { data } = await Tesseract.recognize(prepared, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          onProgress?.({ phase: "recognizing", progress: m.progress });
        }
      },
    });
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
