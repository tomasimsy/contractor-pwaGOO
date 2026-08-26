import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatCurrency, formatDate, renderSignature, renderCompanyHeaderBlock, renderCompanyFooterBlock, renderCompanySignatureLine,
  labelValueBlock, statTile, beforeAfterPhotos,
} from "@/lib/pdf/pdfLayout";
import {
  getCompanySettingsByCompanyId, mergeCompanyDefaults, mergeProfileOverrides, getCompanyProfileById,
  type CompanySettings,
} from "@/lib/company";
import { sumApprovedChangeOrderRevenue } from "@/lib/services/financialCalculations";
import {
  getEstimateTermsTemplate, overrideForTemplateKey, renderTermsBodyHtml, DEFAULT_ESTIMATE_TERMS_TEMPLATE,
  type EstimateTermsTemplateKey,
} from "@/lib/estimateTerms";

/**
 * Estimate proposal HTML — the ONE template both the browser "Save as
 * PDF" route (app/api/estimates/[id]/pdf/route.ts) and the "Email
 * Customer" send flow (lib/email/sendEstimateEmail.ts) render through.
 * Extracted from what used to be the entire PDF route so a customer
 * can never receive an emailed PDF that looks different from what
 * staff see when they preview it — one data loader, one template, two
 * consumers.
 *
 * loadEstimateProposalData does every query/calculation exactly as the
 * original route did (nothing recomputed differently); renderProposalHtml
 * is a pure function over that data — no I/O, no Supabase.
 */

export interface EstimateProposalData {
  estimate: Record<string, any>;
  client: Record<string, any> | null;
  estimateItems: Array<Record<string, any>>;
  company: Awaited<ReturnType<typeof getCompanySettingsByCompanyId>>;
  roofingAreas: Array<Record<string, any>>;
  roofingAreaPhotos: Array<Record<string, any>>;
  estimatePhotosByType: { before: Array<Record<string, any>>; after: Array<Record<string, any>> };
  photoUrl: (storagePath: string) => string;
  subtotal: number;
  taxAmount: number;
  markupAmount: number;
  discountAmount: number;
  approvedChangeOrderTotal: number;
  total: number;
  depositAmount: number;
  totalMaterialCost: number;
  totalLaborCost: number;
  totalRoofTax: number;
}

/** `origin` is needed to build absolute photo URLs — the caller
 * supplies it (request.nextUrl.origin in a route, an explicit app URL
 * env var when there's no request, e.g. the email-send path). */
export async function loadEstimateProposalData(
  supabase: SupabaseClient,
  id: string,
  options: { customerToken?: string | null; origin: string }
): Promise<EstimateProposalData | null> {
  // customerToken -> anon client with NO session, so every plain table
  // select below (RLS is company-scoped, and an anon client has no
  // company context) would return nothing. get_portal_estimate_pdf_data
  // is a SECURITY DEFINER function — same precedent as
  // get_customer_portal/get_portal_estimate_photos — that does this
  // exact bundle of reads server-side, gated on the token matching the
  // estimate's own customer_token, and returns it as one JSON payload.
  let estimate: any;
  let client: any;
  let estimateItems: any[];
  let rawRoofingAreas: any[];
  let rawRoofingAreaPhotos: any[];
  let rawEstimatePhotos: any[];
  let changeOrders: any[];
  let company: CompanySettings;

  if (options.customerToken) {
    const { data: bundle } = await supabase.rpc("get_portal_estimate_pdf_data", { p_token: options.customerToken });
    if (!bundle) return null;
    estimate = bundle.estimate;
    client = bundle.client;
    estimateItems = bundle.items || [];
    rawRoofingAreas = bundle.roofing_areas || [];
    rawRoofingAreaPhotos = bundle.roofing_area_photos || [];
    rawEstimatePhotos = bundle.estimate_photos || [];
    changeOrders = bundle.change_orders || [];

    const baseSettings = mergeCompanyDefaults({
      ...(bundle.company_settings as Partial<CompanySettings> | null),
      company_name: bundle.company_name || (bundle.company_settings as { company_name?: string } | null)?.company_name,
    });
    const profile = estimate.profile_id ? await getCompanyProfileById(supabase, estimate.profile_id) : null;
    company = mergeProfileOverrides(baseSettings, profile);
  } else {
    const { data: estimateRow } = await supabase.from("estimates").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!estimateRow) return null;
    estimate = estimateRow;

    const { data: clientRow } = await supabase.from("clients").select("*").eq("id", estimate.client_id).single();
    client = clientRow;
    const { data: items } = await supabase.from("estimate_items").select("*").eq("estimate_id", id).is("deleted_at", null);
    estimateItems = items || [];

    // profile_id (null on most estimates) overlays that estimate's own
    // brand — see lib/company.ts's getCompanySettingsByCompanyId. This
    // is the ONE data loader both the PDF route and the "Email Customer"
    // send flow go through, so both stay in sync automatically.
    company = await getCompanySettingsByCompanyId(supabase, estimate.company_id, estimate.profile_id);

    rawRoofingAreas = [];
    rawRoofingAreaPhotos = [];
    if (estimate.estimate_type === "roofing") {
      const { data: areas } = await supabase
        .from("estimate_areas")
        .select("*")
        .eq("estimate_id", id)
        .is("deleted_at", null)
        .order("sequence_number", { ascending: true });
      rawRoofingAreas = areas || [];

      if (rawRoofingAreas.length > 0) {
        const areaIds = rawRoofingAreas.map((a) => a.id);
        const { data: photos } = await supabase
          .from("estimate_area_photos")
          .select("*")
          .in("estimate_area_id", areaIds)
          .is("deleted_at", null)
          .order("display_order", { ascending: true });
        rawRoofingAreaPhotos = photos || [];
        // Note: estimate_area_line_items are fetched by the original
        // route but never referenced in the template — preserved as
        // dead work there; not carried over here since nothing reads it.
      }
    }

    const { data: estimatePhotos } = await supabase
      .from("estimate_photos")
      .select("*")
      .eq("estimate_id", id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true });
    rawEstimatePhotos = estimatePhotos || [];

    const { data: cos } = await supabase
      .from("change_orders")
      .select("total_amount, tax, status")
      .eq("estimate_id", id)
      .eq("company_id", estimate.company_id)
      .is("deleted_at", null);
    changeOrders = cos || [];
  }

  const roofingAreas = rawRoofingAreas;
  const roofingAreaPhotos = rawRoofingAreaPhotos;

  const photoUrl = (storagePath: string) => `${options.origin}/api/estimate-photos/download?path=${encodeURIComponent(storagePath)}`;

  const estimatePhotosByType = {
    before: rawEstimatePhotos.filter((p) => p.photo_type === "before"),
    after: rawEstimatePhotos.filter((p) => p.photo_type === "after"),
  };

  const subtotal = estimateItems.reduce((sum: number, i: { total?: number }) => sum + (i.total || 0), 0);
  const taxAmount = subtotal * ((estimate.tax_rate || 0) / 100);
  const markupAmount = estimate.markup || 0;
  const discountAmount = estimate.discount || 0;
  const approvedChangeOrderTotal = sumApprovedChangeOrderRevenue(
    (changeOrders || []).map((co: { total_amount?: number; tax?: number; status?: string }) => ({
      status: co.status ?? "",
      totalAmount: co.total_amount ?? 0,
      tax: co.tax ?? 0,
    }))
  );
  const total = estimate.total || 0;
  const depositPct = company.default_deposit_percentage / 100;
  const depositAmount = estimate.deposit_amount || total * depositPct;

  const totalMaterialCost = roofingAreas.reduce((sum, a) => sum + (Number(a.material_cost) || 0), 0);
  const totalLaborCost = roofingAreas.reduce((sum, a) => sum + (Number(a.labor_cost) || 0), 0);
  const totalRoofTax = roofingAreas.reduce((sum, a) => sum + (Number(a.tax) || 0), 0);

  return {
    estimate,
    client,
    estimateItems,
    company,
    roofingAreas,
    roofingAreaPhotos,
    estimatePhotosByType,
    photoUrl,
    subtotal,
    taxAmount,
    markupAmount,
    discountAmount,
    approvedChangeOrderTotal,
    total,
    depositAmount,
    totalMaterialCost,
    totalLaborCost,
    totalRoofTax,
  };
}

/** Pure — no I/O. Same template every existing estimate PDF has
 * rendered; only moved here so it has a second caller (the emailed
 * PDF) without a second copy of ~1500 lines of markup. */
export function renderEstimateProposalHtml(data: EstimateProposalData): { docTitle: string; bodyHtml: string } {
  const {
    estimate, client, estimateItems, company, roofingAreas, roofingAreaPhotos, estimatePhotosByType, photoUrl,
    subtotal, taxAmount, markupAmount, discountAmount, approvedChangeOrderTotal, total, depositAmount,
    totalMaterialCost, totalLaborCost, totalRoofTax,
  } = data;

  const docTitle = `Contractor Proposal ${estimate.estimate_number || estimate.id.slice(0, 8)}`;

  // Same template EstimateDetail and the customer portal resolve
  // through — the built-in default for this estimate's terms_template
  // key, or the company's own override (Settings → Company →
  // Terms & Conditions). See getEstimateTermsTemplate's doc comment.
  const termsKey = (estimate.terms_template as EstimateTermsTemplateKey) ?? DEFAULT_ESTIMATE_TERMS_TEMPLATE;
  const termsTemplate = getEstimateTermsTemplate(termsKey, overrideForTemplateKey(company, termsKey));

  const bodyHtml = `
    <!-- Minimal Header -->
    <div class="header" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
      <div>${renderCompanyHeaderBlock(company)}</div>
      <div style="text-align: right;">
        <div style="font-size: 15px; font-weight: 700; color: #111827; letter-spacing: 0.05em;">PROPOSAL</div>
        <div style="font-size: 12px; font-weight: 600; color: #4b5563; margin-top: 2px;">
          #${estimate.estimate_number || estimate.id.slice(0, 8)}
        </div>
        ${estimate.title ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${estimate.title}</div>` : ""}
        <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">Issued ${formatDate(estimate.created_at)}</div>
      </div>
    </div>

    <!-- Client & Project Details -->
    <div style="display: flex; gap: 24px; margin-bottom: 24px; font-size: 11.5px; color: #374151;">
      <div style="flex: 1;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #9ca3af; letter-spacing: 0.05em; margin-bottom: 4px;">Prepared For</div>
        <div style="font-weight: 700; color: #111827; font-size: 12.5px; margin-bottom: 2px;">${client?.name || "No client"}</div>
        <div>${client?.phone || ""}</div>
        <div>${client?.email || ""}</div>
        <div>${client?.address || ""}</div>
      </div>
      <div style="flex: 1;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #9ca3af; letter-spacing: 0.05em; margin-bottom: 4px;">Project Scope</div>
        <div style="line-height: 1.5; color: #4b5563; white-space: pre-wrap;">${estimate.description || "No project overview provided."}</div>
      </div>
    </div>

    <!-- Minimal Summary Bar -->
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px 18px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;">Contract Total</div>
        <div style="font-size: 18px; font-weight: 800; color: #111827; margin-top: 2px;">${formatCurrency(total)}</div>
      </div>
      ${
        estimate.estimate_type === "roofing" && roofingAreas.length > 0
          ? `
            <div style="display: flex; gap: 20px; font-size: 11px;">
              <div><span style="color:#6b7280;">Material:</span> <strong style="color:#111827;">${formatCurrency(totalMaterialCost)}</strong></div>
              <div><span style="color:#6b7280;">Labor:</span> <strong style="color:#111827;">${formatCurrency(totalLaborCost)}</strong></div>
              <div><span style="color:#6b7280;">Tax:</span> <strong style="color:#111827;">${formatCurrency(totalRoofTax)}</strong></div>
            </div>
          `
          : ""
      }
      <div style="text-align: right;">
        ${
          estimate.estimate_type === "roofing"
            ? `
              <div style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;">Payment Terms</div>
              <div style="font-size: 11px; font-weight: 700; color: #111827; margin-top: 2px;">Due within 30 days</div>
            `
            : `
              <div style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;">Due Today (${company.default_deposit_percentage}%)</div>
              <div style="font-size: 15px; font-weight: 700; color: #059669; margin-top: 2px;">${formatCurrency(depositAmount)}</div>
            `
        }
      </div>
    </div>

    ${
      estimatePhotosByType.before.length > 0 || estimatePhotosByType.after.length > 0
        ? `
          <div class="section">
            <div class="section-title">Before &amp; After</div>
            ${beforeAfterPhotos(estimatePhotosByType.before, estimatePhotosByType.after, photoUrl)}
          </div>
        `
        : ""
    }

    <!-- Roofing Areas -->
    ${
      estimate.estimate_type === "roofing" && roofingAreas.length > 0
        ? `
          <div class="section" style="page-break-inside: avoid;">
            <div style="font-size: 14px; font-weight: 800; color: #111827; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; border-bottom: 2px solid #111827; padding-bottom: 6px;">
              Detailed Areas &amp; Scope of Work
            </div>
            ${roofingAreas
              .map((area, idx) => {
                const areaPhotos = roofingAreaPhotos.filter((p) => p.estimate_area_id === area.id);
                const beforePhotos = areaPhotos.filter((p) => p.photo_type === "before");
                const afterPhotos = areaPhotos.filter((p) => p.photo_type === "after");
                const bgColors = ["#fcfcfc", "#f7f9fa", "#f5f7f8"];
                const cardBg = bgColors[idx % bgColors.length];
                return `
                  <div style="background-color:${cardBg}; border:1px solid #e5e7eb; border-radius:8px; padding:20px; margin-bottom:28px; page-break-inside:avoid;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e5e7eb; padding-bottom:12px; margin-bottom:16px;">
                      <div style="font-size:13.5px; font-weight:800; color:#111827; letter-spacing:0.02em;">
                        Area ${idx + 1} &mdash; ${area.area_name || "Untitled Area"}
                      </div>
                      <div style="font-size:12px; font-weight:700; color:#1f2937; background:#ffffff; border:1px solid #d1d5db; padding:4px 10px; border-radius:4px;">
                        ${formatCurrency(area.estimated_repair_cost || 0)}
                      </div>
                    </div>
                    <div style="display:flex; gap:20px; align-items:flex-start; margin-bottom:16px;">
                      <div style="width:46%; flex-shrink:0;">
                        ${
                          beforePhotos.length > 0 || afterPhotos.length > 0
                            ? beforeAfterPhotos(beforePhotos, afterPhotos, photoUrl, { tileWidth: 132, tileHeight: 96, stacked: true })
                            : `<div style="width:100%; height:140px; background:#f3f4f6; border:1px dashed #d1d5db; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#9ca3af; font-size:11px; font-weight:600;">No Photo Available</div>`
                        }
                      </div>
                      <div style="width:54%; flex-grow:1; font-size:11.5px; color:#374151; line-height:1.5;">
                        ${labelValueBlock("Title / Area Name", `<span style="font-weight:600; color:#1f2937; font-size:12px;">${area.area_name || "-"}</span>`)}
                        ${area.quantity ? labelValueBlock("Quantity", `${area.quantity}${area.quantity_unit ? ` ${area.quantity_unit}` : ""}`) : ""}
                        ${area.defect ? labelValueBlock("Defect Identified", area.defect) : ""}
                        ${area.location ? labelValueBlock("Exact Location", area.location) : ""}
                        ${area.corrective_action ? labelValueBlock("Corrective Action", area.corrective_action) : ""}
                        ${area.materials_included ? labelValueBlock("Materials Included", area.materials_included, { compact: true }) : ""}
                      </div>
                    </div>
                    <div style="display:flex; gap:10px; border-top:1px solid #e5e7eb; padding-top:12px; margin-top:4px;">
                      ${statTile("Material", formatCurrency(area.material_cost || 0))}
                      ${statTile("Labor", formatCurrency(area.labor_cost || 0))}
                      ${statTile("Tax", formatCurrency(area.tax || 0))}
                      ${statTile("Estimated Repair", formatCurrency(area.estimated_repair_cost || 0), true)}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `
        : ""
    }

    <!-- Standard Line Items — grouped into projects when the estimate
         uses them (item.group_name), otherwise one flat table exactly
         as every estimate rendered before grouping existed. Every
         pre-existing estimate_items row has no group_name, so it falls
         straight into the ungrouped branch below with no visual change.
         A project's total is the sum of just that group's own items'
         total field — the same field the overall subtotal already
         sums, never a separately computed number. -->
    ${
      estimateItems.length > 0
        ? `
          <div class="section">
            <div class="section-title">Additional Items</div>
            ${(() => {
              type Item = { name?: string; description?: string; quantity?: number; unit?: string | null; unit_price?: number; total?: number; group_name?: string | null };
              const itemRow = (item: Item) => `
                <tr>
                  <td>${item.name || "-"}</td>
                  <td>${item.description || "-"}</td>
                  <td>${item.quantity || 0} ${item.unit || ""}</td>
                  <td>${formatCurrency(item.unit_price || 0)}</td>
                  <td><strong>${formatCurrency(item.total || 0)}</strong></td>
                </tr>
              `;
              const tableOpen = `
                <table>
                  <thead>
                    <tr>
                      <th style="width:25%">Item</th>
                      <th style="width:35%">Description</th>
                      <th style="width:10%">Qty</th>
                      <th style="width:15%">Unit Price</th>
                      <th style="width:15%">Total</th>
                    </tr>
                  </thead>
                  <tbody>
              `;
              const tableClose = `</tbody></table>`;

              const ungrouped = (estimateItems as Item[]).filter((i) => !i.group_name);
              const groupOrder: string[] = [];
              for (const i of estimateItems as Item[]) {
                if (i.group_name && !groupOrder.includes(i.group_name)) groupOrder.push(i.group_name);
              }

              const ungroupedHtml = ungrouped.length > 0 ? `${tableOpen}${ungrouped.map(itemRow).join("")}${tableClose}` : "";

              const groupsHtml = groupOrder
                .map((groupName) => {
                  const groupItems = (estimateItems as Item[]).filter((i) => i.group_name === groupName);
                  const groupTotal = groupItems.reduce((sum, i) => sum + (i.total || 0), 0);
                  return `
                    <div style="margin-top:${ungroupedHtml || groupName !== groupOrder[0] ? "14px" : "0"};">
                      <div style="font-size:11.5px; font-weight:700; color:#111827; margin-bottom:4px;">${groupName}</div>
                      ${tableOpen}${groupItems.map(itemRow).join("")}${tableClose}
                      <div style="display:flex; justify-content:flex-end; gap:8px; padding:5px 3px 0; font-size:10.5px; font-weight:700; color:#111827;">
                        <span style="color:#6b7280; font-weight:600;">Project Total</span>
                        <span>${formatCurrency(groupTotal)}</span>
                      </div>
                    </div>
                  `;
                })
                .join("");

              return `${ungroupedHtml}${groupsHtml}`;
            })()}
          </div>
        `
        : ""
    }

    <!-- Financial Summary -->
    <div class="section">
      <div class="section-title">Summary</div>
      <div class="summary-box">
        <div class="summary-row muted"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
        ${markupAmount ? `<div class="summary-row muted"><span>Markup</span><span>${formatCurrency(markupAmount)}</span></div>` : ""}
        ${discountAmount ? `<div class="summary-row muted"><span>Discount</span><span>-${formatCurrency(discountAmount)}</span></div>` : ""}
        ${taxAmount ? `<div class="summary-row muted"><span>Tax (${estimate.tax_rate}%)</span><span>${formatCurrency(taxAmount)}</span></div>` : ""}
        ${approvedChangeOrderTotal ? `<div class="summary-row muted"><span>Approved Change Orders</span><span>${formatCurrency(approvedChangeOrderTotal)}</span></div>` : ""}
        ${
          estimate.estimate_type === "roofing"
            ? `<div class="summary-row muted"><span>Payment Terms</span><span>Due within 30 days</span></div>`
            : `
              <div class="summary-row"><span>Due Today</span><span>${formatCurrency(depositAmount)}</span></div>
              <div class="summary-row muted"><span>Deposit Required (${company.default_deposit_percentage}%)</span><span>${formatCurrency(depositAmount)}</span></div>
            `
        }
        <div class="summary-row balance"><span>Total</span><span>${formatCurrency(total)}</span></div>
      </div>
    </div>

    <!-- Payment — company.payment_instructions is the ONE editable
         source for this (Settings -> Company -> Payment Instructions).
         Previously this was two sections: a hardcoded "Payment
         Options" block with one specific company's real Zelle email
         baked into the shared template (so every company's PDF showed
         SOMEONE ELSE's payment email), plus a separate "Payment
         Instructions" box reading the real per-company field. Merged
         into one section; the check-payable-to line below uses this
         company's own name/address, which was already correct data,
         not the hardcoded part. -->
    <div class="section">
      <div class="section-title">Payment</div>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; font-size: 11px; line-height: 1.6; color: #374151;">
        ${
          company.payment_instructions
            ? `<div style="white-space:pre-wrap;">${company.payment_instructions}</div>`
            : `<div style="color:#6b7280; font-style:italic;">No payment instructions configured — add them in Settings &rarr; Company.</div>`
        }
        <div style="border-top: 1px solid #e5e7eb; margin-top: 12px; padding-top: 12px; font-size: 10px; color: #6b7280;">
          Make checks payable to: <strong style="color: #111827;">${company.company_name}</strong><br>
          Mailing address: <span style="color: #111827;">${company.company_address}</span>
        </div>
      </div>
    </div>

    <!-- Terms & Conditions — the SAME template (built-in default or the
         company's own override) EstimateDetail and the customer portal
         show, resolved via getEstimateTermsTemplate/overrideForTemplateKey
         and rendered with the one shared parser (renderTermsBodyHtml).
         This used to be a hardcoded copy of the old default text
         (Material Price Notice / Workmanship Warranty / Terms and
         Conditions) that never read the template system at all — a
         company's own customization, or a template edit, showed
         everywhere BUT this PDF. -->

    <div class="section" style="page-break-inside:avoid;">
      <div class="section-title">${termsTemplate.label}</div>
      <div style="font-size:10.5px; line-height:1.65; color:#374151;">
        ${renderTermsBodyHtml(termsTemplate.body)}
      </div>
    </div>

    <!-- Signature -->
    <div class="section" style="margin-top:30px;">
      <div class="section-title">Customer Acceptance &amp; Signature</div>
      <div class="signature-box">${renderSignature(estimate.signature)}</div>
      ${renderCompanySignatureLine(company)}
    </div>

    ${renderCompanyFooterBlock(company)}
  `;

  return { docTitle, bodyHtml };
}
