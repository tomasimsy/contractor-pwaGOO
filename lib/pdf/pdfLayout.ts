// Shared layout/styling for the Estimate and Invoice "Save as PDF" pages.
// Both routes reuse this so the two documents stay visually consistent.

import type { CompanySettings } from "@/lib/company";

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);

export const formatDate = (date: string | null | undefined) => {
  if (!date) return "Not set";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "Not set";
  }
};

type Signature = { type: "type" | "draw"; value: string; date: string } | null | undefined;

// Renders whatever signature is already stored on the record (estimates.signature),
// rather than creating/collecting a new one — PDF is read-only.
export function renderSignature(signature: Signature) {
  if (!signature) {
    return `<div class="sig-empty">Not Signed</div>`;
  }
  if (signature.type === "draw") {
    return `
      <img src="${signature.value}" class="sig-image" alt="Customer signature" />
      <div class="sig-date">Signed ${formatDate(signature.date)}</div>
    `;
  }
  // "type" signature — a typed name
  return `
    <div class="sig-typed">${signature.value}</div>
    <div class="sig-date">Signed ${formatDate(signature.date)}</div>
  `;
}

export const PDF_STYLES = `
  @media print {
    body { margin: 0; padding: 0; background: #fff; }
    .no-print { display: none; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica', Arial, sans-serif;
    background: #eef0f2;
    padding: 24px;
    color: #1f2429;
  }
  .print-btn {
    position: fixed; top: 20px; right: 20px;
    background: #1f2429; color: #fff; border: none;
    padding: 10px 20px; border-radius: 8px; cursor: pointer;
    font-weight: 600; font-size: 13px; z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .print-btn:hover { background: #3a4149; }
  .document {
    max-width: 860px; margin: 0 auto; background: #fff;
    padding: 56px; border: 1px solid #e2e5e8;
  }
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 24px; margin-bottom: 28px; border-bottom: 2px solid #1f2429;
  }
  .company-name { font-size: 20px; font-weight: 700; color: #1f2429; letter-spacing: 0.3px; }
  .company-details { font-size: 10.5px; color: #6b7280; margin-top: 4px; line-height: 1.5; }
  .doc-title { font-size: 24px; font-weight: 700; color: #1f2429; text-align: right; letter-spacing: 1px; }
  .doc-meta { font-size: 10.5px; color: #6b7280; text-align: right; margin-top: 4px; line-height: 1.5; }
  .doc-meta strong { color: #1f2429; }
  .status-badge {
    display: inline-block; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.5px; padding: 3px 10px; border-radius: 20px;
    background: #f0f1f2; color: #4b5563; margin-top: 6px;
  }

  .section { margin-bottom: 26px; }
  .section-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
    color: #1f2429; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e5e8;
  }

  .info-grid { display: flex; gap: 32px; }
  .info-col { flex: 1; }
  .info-row { display: flex; font-size: 11px; margin-bottom: 6px; }
  .info-label { width: 90px; color: #6b7280; font-weight: 600; }
  .info-value { color: #1f2429; }

  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  th {
    background: #f7f8f9; color: #4b5563; padding: 8px 10px; text-align: left;
    font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;
    border-bottom: 1px solid #dfe2e5;
  }
  td { padding: 8px 10px; border-bottom: 1px solid #eef0f2; font-size: 10.5px; color: #2a2f35; }
  tr:last-child td { border-bottom: none; }

  .summary-box { background: #f7f8f9; border: 1px solid #e2e5e8; border-radius: 8px; padding: 16px 20px; margin-top: 6px; }
  .summary-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 11px; color: #2a2f35; }
  .summary-row.muted { color: #6b7280; }
  .summary-row.total {
    border-top: 1px solid #dfe2e5; margin-top: 6px; padding-top: 10px;
    font-size: 13px; font-weight: 700; color: #1f2429;
  }
  .summary-row.balance {
    background: #1f2429; color: #fff; margin: 10px -20px -16px; padding: 12px 20px;
    border-radius: 0 0 8px 8px; font-weight: 700; font-size: 13px;
  }

  .co-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 10.5px; border-bottom: 1px dashed #e2e5e8; }
  .co-row:last-child { border-bottom: none; }
  .co-title { color: #2a2f35; }
  .co-amount { font-weight: 700; color: #1f2429; }

  .empty-note { font-size: 10.5px; color: #9aa2ab; font-style: italic; }

  .terms-list { list-style: none; padding: 0; }
  .terms-list li { font-size: 9.5px; color: #6b7280; margin-bottom: 5px; padding-left: 14px; position: relative; line-height: 1.5; }
  .terms-list li:before { content: "–"; position: absolute; left: 0; color: #9aa2ab; }

  .signature-box {
    margin-top: 8px; padding: 20px; border: 1px solid #e2e5e8; border-radius: 8px;
    text-align: center; min-height: 70px;
  }
  .sig-image { max-height: 70px; max-width: 100%; object-fit: contain; margin: 0 auto 6px; display: block; }
  .sig-typed { font-size: 22px; font-weight: 600; color: #1f2429; font-family: 'Brush Script MT', cursive; border-bottom: 1px solid #1f2429; display: inline-block; padding-bottom: 4px; margin-bottom: 6px; }
  .sig-date { font-size: 9.5px; color: #9aa2ab; }
  .sig-empty { font-size: 11px; color: #9aa2ab; font-style: italic; }

  .footer { text-align: center; margin-top: 40px; padding-top: 18px; border-top: 1px solid #e2e5e8; font-size: 9px; color: #9aa2ab; }

  /* Estimate Roof V2 — one printed page per roofing area, plus a page
     break before the final totals/terms/signature page. Screen view is
     unaffected (page-break-* only takes effect when printing/saving as
     PDF); .roof-area-page:last-child suppresses the trailing blank page
     that would otherwise follow the last area. */
  .roof-area-page { page-break-after: always; break-after: page; }
  .roof-area-page:last-child { page-break-after: auto; break-after: auto; }
  .final-page-break { page-break-before: always; break-before: page; }
`;

export function pdfDocument(opts: {
  docTitle: string; // <title> tag
  bodyHtml: string;
}) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${opts.docTitle}</title>
      <style>${PDF_STYLES}</style>
    </head>
    <body>
      <button class="print-btn no-print" onclick="window.print()">Save as PDF</button>
      <div class="document">
        ${opts.bodyHtml}
      </div>
    </body>
    </html>
  `;
}

// Renders the company identity block used in the document header — shared
// so estimate/invoice PDFs (and anything else) show the same company info.
export function renderCompanyHeaderBlock(company: CompanySettings) {
  return `
    <div class="company-name">${company.company_name}</div>
    ${company.dba ? `<div class="company-dba" style="font-size:12px;font-weight:400;color:#4b5563;">DBA ${company.dba}</div>` : ""}
    <div class="company-details">
      ${company.company_address}<br>
      ${company.company_phone} &middot; ${company.company_email}
      ${[company.company_website, company.company_website_2].filter(Boolean).join(" &middot; ") ? `<br>${[company.company_website, company.company_website_2].filter(Boolean).join(" &middot; ")}` : ""}
      ${company.license_number ? `<br>License #${company.license_number}` : ""}
    </div>
  `;
}

// Renders the contractor's own "signed by" line, if configured — shown
// alongside the customer's signature on estimates/invoices.
export function renderCompanySignatureLine(company: CompanySettings) {
  if (!company.signature_name) return "";
  return `
    <div class="sig-date" style="margin-top:10px;">
      ${company.signature_name}${company.signature_title ? `, ${company.signature_title}` : ""} — ${company.company_name}
    </div>
  `;
}

// Renders the document footer — company's own message, not a hardcoded one.
export function renderCompanyFooterBlock(company: CompanySettings) {
  return `
    <div class="footer">
      <p>${company.company_name} &middot; ${company.company_phone}</p>
      ${company.dba ? `<p>DBA ${company.dba}</p>` : ""}
      <p>${company.footer_message}</p>
    </div>
  `;
}

/**
 * The three small building blocks below exist because the estimate
 * proposal template used to repeat the same hand-written inline-style
 * div for every "uppercase label + value" field (5x in the roofing
 * area card alone), every cost tile (4x per area), and every photo
 * grid (3x — before/after/completed) — each copy free to drift from
 * its siblings. One implementation each, reused everywhere, so a
 * spacing/color tweak happens once instead of N times and all
 * instances of a kind stay visually identical by construction.
 */

// A single "LABEL \n value" field — the roofing-area detail rows
// (Quantity, Defect, Location, Corrective Action, Materials, etc).
export function labelValueBlock(label: string, value: string, opts?: { compact?: boolean }) {
  return `
    <div style="margin-bottom:${opts?.compact ? "4px" : "8px"};">
      <span style="font-weight:700; color:#111827; text-transform:uppercase; font-size:10px; letter-spacing:0.05em; display:block; margin-bottom:2px;">${label}</span>
      <div style="color:#4b5563;">${value}</div>
    </div>
  `;
}

// A small boxed number tile — Material/Labor/Tax/Estimated Repair per
// roofing area. `dark` is the one visually distinct tile (the total).
export function statTile(label: string, value: string, dark = false) {
  return dark
    ? `
      <div style="flex:1; background:#111827; border:1px solid #111827; border-radius:6px; padding:8px 10px; text-align:center;">
        <div style="font-size:9px; font-weight:700; text-transform:uppercase; color:#9ca3af; letter-spacing:0.05em; margin-bottom:2px;">${label}</div>
        <div style="font-size:11.5px; font-weight:800; color:#ffffff;">${value}</div>
      </div>
    `
    : `
      <div style="flex:1; background:#ffffff; border:1px solid #e5e7eb; border-radius:6px; padding:8px 10px; text-align:center;">
        <div style="font-size:9px; font-weight:700; text-transform:uppercase; color:#6b7280; letter-spacing:0.05em; margin-bottom:2px;">${label}</div>
        <div style="font-size:11px; font-weight:700; color:#111827;">${value}</div>
      </div>
    `;
}

// A flex-wrap grid of photos — before/after/completed all use this
// exact same 140x100 tile, so they now share one implementation
// instead of three copies of the same img/style string.
export function photoGrid(photos: Array<Record<string, any>>, photoUrl: (path: string) => string, altLabel: string, tileWidth = 140, tileHeight = 100) {
  if (photos.length === 0) return "";
  return `
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
      ${photos
        .map(
          (photo) =>
            `<img src="${photoUrl(photo.storage_path)}" style="width:${tileWidth}px; height:${tileHeight}px; object-fit:cover; border-radius:4px; border:1px solid #e5e7eb;" alt="${altLabel}" />`
        )
        .join("")}
    </div>
  `;
}

// Before/After, side by side in ONE block — replaces two separate
// photoGrid calls (estimate-level "Initial Site Photos" and "Completed
// Photos" used to render as two sections, pages apart, with no shared
// label styling tying a before photo to its after counterpart). Each
// side gets a solid, high-contrast pill label (never relying on
// position alone), and a single hairline divider between them is the
// only "chrome" — no boxed card, no extra borders, so this stays
// visually light even next to the rest of the document.
//
// `stacked` is for the roofing-area card, whose photo column is only
// ~46% of the page width: side by side there would squeeze both sides
// to the point the photos stop being useful, so it falls back to
// BEFORE above AFTER instead — still one block, still clearly labeled,
// just not side by side when the space genuinely isn't there.
export function beforeAfterPhotos(
  before: Array<Record<string, any>>,
  after: Array<Record<string, any>>,
  photoUrl: (path: string) => string,
  opts?: { tileWidth?: number; tileHeight?: number; stacked?: boolean }
) {
  if (before.length === 0 && after.length === 0) return "";
  const tileWidth = opts?.tileWidth ?? 150;
  const tileHeight = opts?.tileHeight ?? 112;
  const stacked = opts?.stacked ?? false;

  const column = (label: "BEFORE" | "AFTER", photos: Array<Record<string, any>>) => {
    const color = label === "BEFORE" ? "#6b7280" : "#059669";
    return `
      <div style="flex:1; min-width:0;">
        <span style="display:inline-block; font-size:9px; font-weight:800; letter-spacing:0.08em; color:#ffffff; background:${color}; padding:2px 8px; border-radius:3px; margin-bottom:6px;">${label}</span>
        ${
          photos.length > 0
            ? `<div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${photos
                  .map(
                    (photo) =>
                      `<img src="${photoUrl(photo.storage_path)}" style="width:${tileWidth}px; height:${tileHeight}px; object-fit:cover; border-radius:4px; border:1px solid #e5e7eb;" alt="${label === "BEFORE" ? "Before photo" : "After photo"}" />`
                  )
                  .join("")}
              </div>`
            : `<div style="font-size:10px; color:#9ca3af; padding-top:2px;">No photo</div>`
        }
      </div>
    `;
  };

  return `
    <div style="display:flex; ${stacked ? "flex-direction:column; gap:14px;" : "align-items:flex-start; gap:16px;"}">
      ${column("BEFORE", before)}
      ${!stacked ? `<div style="width:1px; align-self:stretch; background:#e5e7eb;"></div>` : ""}
      ${column("AFTER", after)}
    </div>
  `;
}
