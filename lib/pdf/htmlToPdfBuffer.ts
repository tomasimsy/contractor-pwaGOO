import puppeteer from "puppeteer";

/**
 * Renders an HTML string (the same markup lib/pdf/pdfLayout.ts's
 * pdfDocument() produces for the browser's own "Save as PDF" button)
 * into a real PDF file, server-side, for use as an email attachment.
 *
 * Launches and closes a fresh browser per call rather than pooling one
 * — this route is invoked rarely (one staff click per email), so the
 * simplicity/reliability of "nothing to leak, nothing to get stuck in
 * a bad state across requests" outweighs the cold-start cost. Revisit
 * with a pooled singleton only if this becomes a real bottleneck.
 */
export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    // "load" — the document embeds photos as <img> tags fetched from
    // our own /api/estimate-photos/download route; the browser's load
    // event only fires once every referenced image has finished
    // loading (or failed), so printing after it fires avoids a
    // proposal with photos rendering blank. setContent's type doesn't
    // accept "networkidle0" (that's goto-only in this Puppeteer
    // version), and isn't needed here anyway — there's no further
    // async navigation after the initial content is set.
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "0.4in", bottom: "0.4in", left: "0.3in", right: "0.3in" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
