/**
 * THE single source of truth for every Terms & Conditions template an
 * estimate can be created with.
 *
 * An estimate stores only the KEY it was created with
 * (`estimates.terms_template`) — never the template's text. This file
 * holds the DEFAULT text for each key, exactly once. A company may
 * additionally OVERRIDE a template's text from Settings
 * (company_settings.terms_roofing / terms_custom / terms_home_remodel
 * — see lib/company.ts), which is the actual, editable, dynamic
 * content — but the built-in text here is what every company starts
 * from and what a template falls back to until it's customized.
 *
 * Every surface that shows terms (EstimateDetail, the customer portal,
 * the generated PDF) resolves through `getEstimateTermsTemplate()`
 * rather than holding its own copy or its own fallback text. Editing a
 * template — either the built-in default here, or a company's own
 * override in Settings — changes what EVERY estimate on that key shows,
 * past and future, the same way editing a company's letterhead affects
 * every future PDF. That is deliberate: these are reusable legal
 * boilerplate, not a per-estimate snapshot.
 *
 * "custom"'s built-in body is deliberately the exact paragraph this
 * app's PDF route used to hard-code — reused verbatim so an existing,
 * never-customized estimate renders identically to before.
 */

export type EstimateTermsTemplateKey = "roofing" | "custom" | "home_remodel";

export interface EstimateTermsTemplate {
  key: EstimateTermsTemplateKey;
  /** Shown in the template picker and as a heading wherever the terms
   * are displayed. */
  label: string;
  /** Lightly-structured plain text — see parseTermsBody() for the
   * exact convention. Blank lines separate paragraphs/lists; a line
   * wrapped in `**double asterisks**` is a small bold sub-heading; a
   * line starting with `-` or `* ` is a bullet, and consecutive bullet
   * lines within one paragraph become one list. This is what a company
   * types into a plain <textarea> in Settings — no markdown editor, no
   * rich text, just three predictable rules. */
  body: string;
}

export const DEFAULT_ESTIMATE_TERMS_TEMPLATE: EstimateTermsTemplateKey = "custom";

export const ESTIMATE_TERMS_TEMPLATES: Record<EstimateTermsTemplateKey, EstimateTermsTemplate> = {
  custom: {
    key: "custom",
    label: "Custom / General",
    body: `The Contractor's standard Terms and Conditions are incorporated herein by reference and made a part of this Proposal/Agreement as if wholly re-written herein. The Terms and Conditions may be reviewed or a copy may be obtained by contacting our office. These Terms and Conditions are the only terms and conditions that apply to this Proposal/Agreement. The Contractor rejects any changes made by the Owner to this Proposal/Agreement unless the Contractor approves such changes in a writing signed by our authorized representative.

Contractor reserves the right to subcontract any or all of the work to one or more of its qualified affiliates.`,
  },
  roofing: {
    key: "roofing",
    label: "Roofing",
    body: `This Proposal/Agreement is for roofing work only, as described in the scope above. All work will be performed in accordance with manufacturer installation specifications and applicable local building codes. Contractor is not responsible for delays caused by weather conditions unsuitable for roofing work.

Any pre-existing roof deck damage, rot, or structural deficiency discovered after tear-off is not included in this price and will be addressed via a separate change order before work continues on the affected area.

Manufacturer material warranties are provided directly by the manufacturer per their published terms; Contractor separately warrants its own workmanship for one (1) year from substantial completion. Contractor is not responsible for existing interior damage from a roof leak that predates this Agreement.

Permits, dumpster/debris removal, and job-site cleanup are included unless noted otherwise in the scope above.

**Material Price Notice**
Pricing reflects current material costs. Supplier price changes before work begins may result in a corresponding adjustment to the contract price.

**Workmanship Warranty**
Covered: roof leaks and defects caused by installation errors in the roofing system installed by the Contractor.

Not covered:

* Storm, hail, wind, fallen trees, or other acts of nature.
* Damage caused by foot traffic, other contractors, or homeowner modifications.
* Structural movement, settling, pre-existing building defects, clogged gutters, lack of maintenance, improper ventilation, or manufacturer defects.

**Terms and Conditions**
The Contractor's standard Terms and Conditions are incorporated by reference and govern this Proposal/Agreement. Copies are available on request. No changes to this Proposal/Agreement are valid unless approved in writing by an authorized Contractor representative. The Contractor may subcontract any or all work to qualified affiliates.`,
  },
  home_remodel: {
    key: "home_remodel",
    label: "Home Remodel",
    body: `This Proposal/Agreement covers the remodeling scope described above. Work will be scheduled during normal business hours unless otherwise agreed in writing. Owner is responsible for removing or protecting personal property in the work area prior to the start of work.

Unforeseen conditions behind walls, floors, or ceilings (e.g., outdated wiring, plumbing, or structural issues not visible at the time of this Proposal) are not included in this price and will be addressed via a separate change order before affected work continues.

Selections not finalized at signing (fixtures, finishes, materials) may affect the schedule and price once chosen; any difference from allowances included in this Proposal will be billed or credited accordingly. Permits required for this scope are included unless noted otherwise above.

Contractor reserves the right to subcontract any or all of the work to one or more of its qualified affiliates.`,
  },
};

export const ESTIMATE_TERMS_TEMPLATE_OPTIONS: EstimateTermsTemplate[] = [
  ESTIMATE_TERMS_TEMPLATES.custom,
  ESTIMATE_TERMS_TEMPLATES.roofing,
  ESTIMATE_TERMS_TEMPLATES.home_remodel,
];

/** Resolves a stored (possibly stale, null, or pre-migration) key to
 * its template, applying a company's own override text when it has
 * one — never throws, always returns something renderable.
 *
 * `override` is the company's raw text for this specific key (see
 * overrideForTemplateKey below) — pass it whenever the caller has
 * company settings available (the PDF route and EstimateDetail both
 * already load them; the portal gets it from get_estimate_terms_template).
 * A blank/whitespace-only override is treated as "not customized," the
 * same rule mergeCompanyDefaults uses for every other company text
 * field, so clearing a textarea in Settings reverts to the built-in
 * default rather than saving an empty document. */
export function getEstimateTermsTemplate(
  key: string | null | undefined,
  override?: string | null
): EstimateTermsTemplate {
  const base =
    ESTIMATE_TERMS_TEMPLATES[key as EstimateTermsTemplateKey] ??
    ESTIMATE_TERMS_TEMPLATES[DEFAULT_ESTIMATE_TERMS_TEMPLATE];
  return override && override.trim() ? { ...base, body: override } : base;
}

/** Which company_settings column backs a given template key — the one
 * place that mapping is written, so the PDF route and EstimateDetail
 * can't each spell it differently. */
export function overrideForTemplateKey(
  company: { terms_roofing: string | null; terms_custom: string | null; terms_home_remodel: string | null },
  key: EstimateTermsTemplateKey
): string | null {
  if (key === "roofing") return company.terms_roofing;
  if (key === "home_remodel") return company.terms_home_remodel;
  return company.terms_custom;
}

// ---------------------------------------------------------------------
// Structured rendering — ONE parser, consumed by both the PDF route
// (plain HTML string) and the React display (EstimateDetail, portal),
// so "how do we interpret a company's typed text" has exactly one
// implementation instead of two renderers quietly disagreeing.
// ---------------------------------------------------------------------

export type TermsBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

/** The three rules a company needs to know, typing into a plain
 * <textarea>:
 *   - a blank line starts a new paragraph/list
 *   - a line wrapped in `**like this**` is a small bold sub-heading
 *   - a line starting with `-` or `* ` is a bullet; consecutive bullet
 *     lines become one list
 * Anything else is a plain paragraph line. No markdown library, no
 * rich-text editor — deliberately just these three, so the box on
 * Settings and the result in a PDF never surprise anyone. */
export function parseTermsBody(body: string): TermsBlock[] {
  const blocks: TermsBlock[] = [];
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const lines = paragraph
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    let pendingList: string[] = [];
    const flushList = () => {
      if (pendingList.length > 0) {
        blocks.push({ type: "list", items: pendingList });
        pendingList = [];
      }
    };

    for (const line of lines) {
      const heading = /^\*\*(.+)\*\*$/.exec(line);
      const bullet = /^[-*]\s+(.*)$/.exec(line);
      if (heading) {
        flushList();
        blocks.push({ type: "heading", text: heading[1].trim() });
      } else if (bullet) {
        pendingList.push(bullet[1].trim());
      } else {
        flushList();
        blocks.push({ type: "paragraph", text: line });
      }
    }
    flushList();
  }

  return blocks;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Plain-HTML rendering of parseTermsBody's output, for the PDF route
 * (a hand-built HTML string, not React). Reuses the `.terms-list`
 * class already defined in lib/pdf/pdfLayout.ts's shared stylesheet.
 * Text is HTML-escaped — this is now company-EDITED free text (typed
 * into Settings), not a hard-coded string. */
export function renderTermsBodyHtml(body: string): string {
  return parseTermsBody(body)
    .map((block) => {
      if (block.type === "heading") {
        return `<div style="margin-top: 10px; margin-bottom: 4px; font-weight: 700; color: #111827;">${escapeHtml(block.text)}</div>`;
      }
      if (block.type === "list") {
        return `<ul class="terms-list">${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      }
      return `<div style="margin-top: 6px; color: #4b5563;">${escapeHtml(block.text)}</div>`;
    })
    .join("");
}
