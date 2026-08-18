/**
 * Color-preserving resize for a photo BEFORE it's actually uploaded and
 * stored — distinct from lib/receiptOcr.ts's own preprocessing, which
 * downscales+grayscales a SEPARATE copy purely for Tesseract's benefit
 * and was never applied to the file that gets uploaded to Storage.
 *
 * That gap is why a full-resolution phone photo (often 8-12MB, 4000px+)
 * was still being sent straight to app/api/expense-receipts/upload —
 * large enough to trip a request-body-size limit (Vercel's serverless
 * function cap is 4.5MB) and come back as a plain-text/HTML error
 * instead of JSON, which surfaced as a confusing "Unexpected token 'R'"
 * JSON.parse crash rather than a real error message. This function is
 * what the actual uploaded/stored receipt photo should go through
 * first — kept in COLOR (unlike the OCR copy) since this one is the
 * proof photo a person will actually look at later.
 */
const DEFAULT_MAX_DIMENSION = 2000;
const DEFAULT_QUALITY = 0.85;

/** Resizes (if needed) and re-encodes as JPEG. Returns the ORIGINAL
 * file untouched if canvas/image decoding isn't available, or if the
 * result would somehow be no smaller — this must never be the reason
 * an upload fails; worst case it's just larger than ideal. */
export async function compressImageForUpload(
  file: File,
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = DEFAULT_QUALITY
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (error) {
    console.error("Receipt image compression failed (uploading the original photo instead):", error);
    return file;
  }
}
