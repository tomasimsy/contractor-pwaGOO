import puppeteerCore, { type Browser } from "puppeteer-core";

/**
 * Renders an HTML string (the same markup lib/pdf/pdfLayout.ts's
 * pdfDocument() produces for the browser's own "Save as PDF" button)
 * into a real PDF file, server-side, for use as an email attachment.
 *
 * TWO LAUNCH PATHS, because "works locally" and "works on Vercel" turn
 * out to need different Chromium builds:
 *
 *   Local dev    full `puppeteer` (downloads its own Chromium at
 *                `npm install` time, cached in ~/.cache/puppeteer,
 *                outside node_modules — never bundled into a Vercel
 *                deployment even though the package stays installed).
 *
 *   Vercel       `puppeteer-core` + `@sparticuz/chromium` — a Chromium
 *                build specifically compiled for AWS
 *                Lambda/Vercel's serverless runtime (statically
 *                linked, no missing system libraries, small enough to
 *                fit the deployment size limit). Full Puppeteer's
 *                Chromium download either isn't present at runtime in
 *                that environment or is missing shared libraries the
 *                serverless container doesn't have — this is exactly
 *                the "works locally, 'Failed to generate the PDF
 *                attachment' in production" failure this file exists
 *                to fix.
 *
 * `process.env.VERCEL` is set by Vercel's own build/runtime in every
 * environment it controls (production, preview, and `vercel dev`) and
 * is never set on a plain local `next dev` — the exact signal needed
 * to pick the right path with no extra configuration.
 *
 * Launches and closes a fresh browser per call rather than pooling one
 * — this route is invoked rarely (one staff click per email), so the
 * simplicity/reliability of "nothing to leak, nothing to get stuck in
 * a bad state across requests" outweighs the cold-start cost. Revisit
 * with a pooled singleton only if this becomes a real bottleneck.
 */
async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Full `puppeteer`, dynamically imported so it's never pulled into
  // the Vercel serverless bundle's static import graph — only reached
  // when VERCEL is unset, i.e. local development.
  const puppeteer = (await import("puppeteer")).default;
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  }) as unknown as Promise<Browser>;
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // "load" — the document embeds photos as <img> tags fetched from
    // our own /api/estimate-photos/download route; the browser's load
    // event only fires once every referenced image has finished
    // loading (or failed), so printing after it fires avoids a
    // proposal with photos rendering blank. setContent's type doesn't
    // accept "networkidle0" (that's goto-only), and isn't needed here
    // anyway — there's no further async navigation after the initial
    // content is set.
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
