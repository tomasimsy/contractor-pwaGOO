import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  formatCurrency,
  formatDate,
  renderSignature,
  pdfDocument,
  renderCompanyHeaderBlock,
  renderCompanyFooterBlock,
  renderCompanySignatureLine,
} from "@/lib/pdf/pdfLayout";
import { getCompanySettingsByCompanyId } from "@/lib/company";
import { sumApprovedChangeOrderRevenue } from "@/lib/services/financialCalculations";

/**
 * PDF route for estimates — clean, minimalist contractor proposal redesign.
 * Queries estimate_areas, estimate_area_photos, and estimate_photos tables.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const token = request.nextUrl.searchParams.get("token");
    const customerToken = request.nextUrl.searchParams.get("customerToken");

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token
        ? {
            global: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          }
        : undefined
    );

    let estimateQuery = supabase
      .from("estimates")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null);

    if (customerToken) {
      estimateQuery = estimateQuery.eq("customer_token", customerToken);
    }

    const { data: estimate } = await estimateQuery.maybeSingle();

    if (!estimate) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", estimate.client_id)
      .single();

    const { data: items } = await supabase
      .from("estimate_items")
      .select("*")
      .eq("estimate_id", id)
      .is("deleted_at", null);

    const estimateItems = items || [];

    const company = await getCompanySettingsByCompanyId(
      supabase,
      estimate.company_id
    );

    // Fetch roofing areas if this is a roofing estimate
    let roofingAreas: any[] = [];
    let roofingAreaPhotos: any[] = [];
    let roofingAreaLineItems: any[] = [];

    if (estimate.estimate_type === "roofing") {
      const { data: areas } = await supabase
        .from("estimate_areas")
        .select("*")
        .eq("estimate_id", id)
        .is("deleted_at", null)
        .order("sequence_number", { ascending: true });

      roofingAreas = areas || [];

      if (roofingAreas.length > 0) {
        const areaIds = roofingAreas.map((a) => a.id);

        const { data: photos } = await supabase
          .from("estimate_area_photos")
          .select("*")
          .in("estimate_area_id", areaIds)
          .is("deleted_at", null)
          .order("display_order", { ascending: true });

        roofingAreaPhotos = photos || [];

        const { data: lineItems } = await supabase
          .from("estimate_area_line_items")
          .select("*")
          .in("estimate_area_id", areaIds)
          .is("deleted_at", null)
          .order("sequence_number", { ascending: true });

        roofingAreaLineItems = lineItems || [];
      }
    }

    const photoUrl = (storagePath: string) =>
      `${request.nextUrl.origin}/api/estimate-photos/download?path=${encodeURIComponent(
        storagePath
      )}`;

    // Fetch estimate-level photos
    const { data: estimatePhotos } = await supabase
      .from("estimate_photos")
      .select("*")
      .eq("estimate_id", id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true });

    const estimatePhotosByType = {
      before: (estimatePhotos || []).filter(
        (p) => p.photo_type === "before"
      ),
      after: (estimatePhotos || []).filter(
        (p) => p.photo_type === "after"
      ),
    };

    const { data: changeOrders } = await supabase
      .from("change_orders")
      .select("total_amount, tax, status")
      .eq("estimate_id", id)
      .eq("company_id", estimate.company_id)
      .is("deleted_at", null);

    // ---------- Calculations ----------
    const subtotal = estimateItems.reduce(
      (sum: number, i: { total?: number }) => sum + (i.total || 0),
      0
    );

    const taxAmount =
      subtotal * ((estimate.tax_rate || 0) / 100);

    const markupAmount = estimate.markup || 0;
    const discountAmount = estimate.discount || 0;

    const approvedChangeOrderTotal = sumApprovedChangeOrderRevenue(
      (changeOrders || []).map(
        (co: {
          total_amount?: number;
          tax?: number;
          status?: string;
        }) => ({
          status: co.status ?? "",
          totalAmount: co.total_amount ?? 0,
          tax: co.tax ?? 0,
        })
      )
    );

    const total = estimate.total || 0;

    const depositPct =
      company.default_deposit_percentage / 100;

    const depositAmount =
      estimate.deposit_amount || total * depositPct;

    const balanceAmount = total - depositAmount;

    // Aggregate totals across all roofing areas
    const totalMaterialCost = roofingAreas.reduce(
      (sum, a) => sum + (Number(a.material_cost) || 0),
      0
    );

    const totalLaborCost = roofingAreas.reduce(
      (sum, a) => sum + (Number(a.labor_cost) || 0),
      0
    );

    const totalRoofTax = roofingAreas.reduce(
      (sum, a) => sum + (Number(a.tax) || 0),
      0
    );

    const totalRepairCost = roofingAreas.reduce(
      (sum, a) =>
        sum + (Number(a.estimated_repair_cost) || 0),
      0
    );

    const html = pdfDocument({
      docTitle: `Contractor Proposal ${
        estimate.estimate_number ||
        estimate.id.slice(0, 8)
      }`,

      bodyHtml: `
        <!-- Minimal Header -->
        <div
          class="header"
          style="
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 16px;
            margin-bottom: 24px;
          "
        >
          <div>
            ${renderCompanyHeaderBlock(company)}
          </div>

          <div style="text-align: right;">
            <div
              style="
                font-size: 15px;
                font-weight: 700;
                color: #111827;
                letter-spacing: 0.05em;
              "
            >
              PROPOSAL
            </div>

            <div
              style="
                font-size: 12px;
                font-weight: 600;
                color: #4b5563;
                margin-top: 2px;
              "
            >
              #${
                estimate.estimate_number ||
                estimate.id.slice(0, 8)
              }
            </div>

            ${
              estimate.title
                ? `
                  <div
                    style="
                      font-size: 11px;
                      color: #6b7280;
                      margin-top: 2px;
                    "
                  >
                    ${estimate.title}
                  </div>
                `
                : ""
            }

            <div
              style="
                font-size: 10px;
                color: #9ca3af;
                margin-top: 4px;
              "
            >
              Issued ${formatDate(estimate.created_at)}
            </div>
          </div>
        </div>

        <!-- Client & Project Details -->
        <div
          style="
            display: flex;
            gap: 24px;
            margin-bottom: 24px;
            font-size: 11.5px;
            color: #374151;
          "
        >
          <div style="flex: 1;">
            <div
              style="
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                color: #9ca3af;
                letter-spacing: 0.05em;
                margin-bottom: 4px;
              "
            >
              Prepared For
            </div>

            <div
              style="
                font-weight: 700;
                color: #111827;
                font-size: 12.5px;
                margin-bottom: 2px;
              "
            >
              ${client?.name || "No client"}
            </div>

            <div>${client?.phone || ""}</div>
            <div>${client?.email || ""}</div>
            <div>${client?.address || ""}</div>
          </div>

          <div style="flex: 1;">
            <div
              style="
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                color: #9ca3af;
                letter-spacing: 0.05em;
                margin-bottom: 4px;
              "
            >
              Project Scope
            </div>

            <div
              style="
                line-height: 1.5;
                color: #4b5563;
                white-space: pre-wrap;
              "
            >
              ${
                estimate.description ||
                "No project overview provided."
              }
            </div>
          </div>
        </div>

        <!-- Minimal Summary Bar -->
        <div
          style="
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 14px 18px;
            margin-bottom: 28px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
        >
          <div>
            <div
              style="
                font-size: 9.5px;
                font-weight: 700;
                text-transform: uppercase;
                color: #6b7280;
                letter-spacing: 0.05em;
              "
            >
              Contract Total
            </div>

            <div
              style="
                font-size: 18px;
                font-weight: 800;
                color: #111827;
                margin-top: 2px;
              "
            >
              ${formatCurrency(total)}
            </div>
          </div>

          ${
            estimate.estimate_type === "roofing" &&
            roofingAreas.length > 0
              ? `
                <div
                  style="
                    display: flex;
                    gap: 20px;
                    font-size: 11px;
                  "
                >
                  <div>
                    <span style="color:#6b7280;">Material:</span>
                    <strong style="color:#111827;">
                      ${formatCurrency(totalMaterialCost)}
                    </strong>
                  </div>

                  <div>
                    <span style="color:#6b7280;">Labor:</span>
                    <strong style="color:#111827;">
                      ${formatCurrency(totalLaborCost)}
                    </strong>
                  </div>

                  <div>
                    <span style="color:#6b7280;">Tax:</span>
                    <strong style="color:#111827;">
                      ${formatCurrency(totalRoofTax)}
                    </strong>
                  </div>
                </div>
              `
              : ""
          }

          <div style="text-align: right;">
            <div
              style="
                font-size: 9.5px;
                font-weight: 700;
                text-transform: uppercase;
                color: #6b7280;
                letter-spacing: 0.05em;
              "
            >
              Due Today (${company.default_deposit_percentage}%)
            </div>

            <div
              style="
                font-size: 15px;
                font-weight: 700;
                color: #059669;
                margin-top: 2px;
              "
            >
              ${formatCurrency(depositAmount)}
            </div>
          </div>
        </div>

        ${
          estimatePhotosByType.before.length > 0
            ? `
              <div class="section">
                <div class="section-title">
                  Initial Site Photos
                </div>

                <div
                  style="
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 6px;
                  "
                >
                  ${estimatePhotosByType.before
                    .map(
                      (photo) => `
                        <img
                          src="${photoUrl(photo.storage_path)}"
                          style="
                            width: 140px;
                            height: 100px;
                            object-fit: cover;
                            border-radius: 4px;
                            border: 1px solid #e5e7eb;
                          "
                          alt="Before photo"
                        />
                      `
                    )
                    .join("")}
                </div>
              </div>
            `
            : ""
        }

        <!-- Roofing Areas -->
        ${
          estimate.estimate_type === "roofing" &&
          roofingAreas.length > 0
            ? `
              <div
                class="section"
                style="page-break-inside: avoid;"
              >
                <div
                  style="
                    font-size: 14px;
                    font-weight: 800;
                    color: #111827;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 16px;
                    border-bottom: 2px solid #111827;
                    padding-bottom: 6px;
                  "
                >
                  Detailed Areas &amp; Scope of Work
                </div>

                ${roofingAreas
                  .map((area, idx) => {
                    const areaPhotos =
                      roofingAreaPhotos.filter(
                        (p) =>
                          p.estimate_area_id === area.id
                      );

                    const beforePhotos =
                      areaPhotos.filter(
                        (p) => p.photo_type === "before"
                      );

                    const afterPhotos =
                      areaPhotos.filter(
                        (p) => p.photo_type === "after"
                      );

                    const bgColors = [
                      "#fcfcfc",
                      "#f7f9fa",
                      "#f5f7f8",
                    ];

                    const cardBg =
                      bgColors[idx % bgColors.length];

                    return `
                      <div
                        style="
                          background-color:${cardBg};
                          border:1px solid #e5e7eb;
                          border-radius:8px;
                          padding:20px;
                          margin-bottom:28px;
                          page-break-inside:avoid;
                        "
                      >

                        <!-- Roof Area Header -->
                        <div
                          style="
                            display:flex;
                            justify-content:space-between;
                            align-items:center;
                            border-bottom:1px solid #e5e7eb;
                            padding-bottom:12px;
                            margin-bottom:16px;
                          "
                        >
                          <div
                            style="
                              font-size:13.5px;
                              font-weight:800;
                              color:#111827;
                              letter-spacing:0.02em;
                            "
                          >
                            Area ${idx + 1}
                            &mdash;
                            ${
                              area.area_name ||
                              "Untitled Area"
                            }
                          </div>

                          <div
                            style="
                              font-size:12px;
                              font-weight:700;
                              color:#1f2937;
                              background:#ffffff;
                              border:1px solid #d1d5db;
                              padding:4px 10px;
                              border-radius:4px;
                            "
                          >
                            ${formatCurrency(
                              area.estimated_repair_cost || 0
                            )}
                          </div>
                        </div>

                        <!-- Two Column Layout -->
                        <div
                          style="
                            display:flex;
                            gap:20px;
                            align-items:flex-start;
                            margin-bottom:16px;
                          "
                        >

                          <!-- Photos -->
                          <div
                            style="
                              width:46%;
                              flex-shrink:0;
                            "
                          >
                            ${
                              beforePhotos.length > 0
                                ? `
                                  <div
                                    style="
                                      margin-bottom:${
                                        afterPhotos.length > 0
                                          ? "12px"
                                          : "0"
                                      };
                                    "
                                  >
                                    <div
                                      style="
                                        font-size:9.5px;
                                        font-weight:700;
                                        text-transform:uppercase;
                                        color:#6b7280;
                                        letter-spacing:0.05em;
                                        margin-bottom:4px;
                                      "
                                    >
                                      Before Photos
                                    </div>

                                    <div
                                      style="
                                        display:flex;
                                        flex-wrap:wrap;
                                        gap:8px;
                                      "
                                    >
                                      ${beforePhotos
                                        .map(
                                          (photo) => `
                                            <img
                                              src="${photoUrl(
                                                photo.storage_path
                                              )}"
                                              style="
                                                width:132px;
                                                height:96px;
                                                object-fit:cover;
                                                border-radius:4px;
                                                border:1px solid #e5e7eb;
                                              "
                                              alt="Before Photo"
                                            />
                                          `
                                        )
                                        .join("")}
                                    </div>
                                  </div>
                                `
                                : ""
                            }

                            ${
                              afterPhotos.length > 0
                                ? `
                                  <div>
                                    <div
                                      style="
                                        font-size:9.5px;
                                        font-weight:700;
                                        text-transform:uppercase;
                                        color:#6b7280;
                                        letter-spacing:0.05em;
                                        margin-bottom:4px;
                                      "
                                    >
                                      After Photos
                                    </div>

                                    <div
                                      style="
                                        display:flex;
                                        flex-wrap:wrap;
                                        gap:8px;
                                      "
                                    >
                                      ${afterPhotos
                                        .map(
                                          (photo) => `
                                            <img
                                              src="${photoUrl(
                                                photo.storage_path
                                              )}"
                                              style="
                                                width:132px;
                                                height:96px;
                                                object-fit:cover;
                                                border-radius:4px;
                                                border:1px solid #e5e7eb;
                                              "
                                              alt="After Photo"
                                            />
                                          `
                                        )
                                        .join("")}
                                    </div>
                                  </div>
                                `
                                : ""
                            }

                            ${
                              beforePhotos.length === 0 &&
                              afterPhotos.length === 0
                                ? `
                                  <div
                                    style="
                                      width:100%;
                                      height:140px;
                                      background:#f3f4f6;
                                      border:1px dashed #d1d5db;
                                      border-radius:6px;
                                      display:flex;
                                      align-items:center;
                                      justify-content:center;
                                      color:#9ca3af;
                                      font-size:11px;
                                      font-weight:600;
                                    "
                                  >
                                    No Photo Available
                                  </div>
                                `
                                : ""
                            }
                          </div>

                          <!-- Details -->
                          <div
                            style="
                              width:54%;
                              flex-grow:1;
                              font-size:11.5px;
                              color:#374151;
                              line-height:1.5;
                            "
                          >

                            <div style="margin-bottom:8px;">
                              <span
                                style="
                                  font-weight:700;
                                  color:#111827;
                                  text-transform:uppercase;
                                  font-size:10px;
                                  letter-spacing:0.05em;
                                  display:block;
                                  margin-bottom:2px;
                                "
                              >
                                Title / Area Name
                              </span>

                              <div
                                style="
                                  font-weight:600;
                                  color:#1f2937;
                                  font-size:12px;
                                "
                              >
                                ${area.area_name || "-"}
                              </div>
                            </div>

                            ${
                              area.quantity
                                ? `
                                  <div style="margin-bottom:8px;">
                                    <span
                                      style="
                                        font-weight:700;
                                        color:#111827;
                                        text-transform:uppercase;
                                        font-size:10px;
                                        letter-spacing:0.05em;
                                        display:block;
                                        margin-bottom:2px;
                                      "
                                    >
                                      Quantity
                                    </span>

                                    <div style="color:#4b5563;">
                                      ${area.quantity}${
                                        area.quantity_unit
                                          ? ` ${area.quantity_unit}`
                                          : ""
                                      }
                                    </div>
                                  </div>
                                `
                                : ""
                            }

                            ${
                              area.defect
                                ? `
                                  <div style="margin-bottom:8px;">
                                    <span
                                      style="
                                        font-weight:700;
                                        color:#111827;
                                        text-transform:uppercase;
                                        font-size:10px;
                                        letter-spacing:0.05em;
                                        display:block;
                                        margin-bottom:2px;
                                      "
                                    >
                                      Defect Identified
                                    </span>

                                    <div style="color:#4b5563;">
                                      ${area.defect}
                                    </div>
                                  </div>
                                `
                                : ""
                            }

                            ${
                              area.location
                                ? `
                                  <div style="margin-bottom:8px;">
                                    <span
                                      style="
                                        font-weight:700;
                                        color:#111827;
                                        text-transform:uppercase;
                                        font-size:10px;
                                        letter-spacing:0.05em;
                                        display:block;
                                        margin-bottom:2px;
                                      "
                                    >
                                      Exact Location
                                    </span>

                                    <div style="color:#4b5563;">
                                      ${area.location}
                                    </div>
                                  </div>
                                `
                                : ""
                            }

                            ${
                              area.corrective_action
                                ? `
                                  <div style="margin-bottom:8px;">
                                    <span
                                      style="
                                        font-weight:700;
                                        color:#111827;
                                        text-transform:uppercase;
                                        font-size:10px;
                                        letter-spacing:0.05em;
                                        display:block;
                                        margin-bottom:2px;
                                      "
                                    >
                                      Corrective Action
                                    </span>

                                    <div style="color:#4b5563;">
                                      ${area.corrective_action}
                                    </div>
                                  </div>
                                `
                                : ""
                            }

                            ${
                              area.materials_included
                                ? `
                                  <div style="margin-bottom:4px;">
                                    <span
                                      style="
                                        font-weight:700;
                                        color:#111827;
                                        text-transform:uppercase;
                                        font-size:10px;
                                        letter-spacing:0.05em;
                                        display:block;
                                        margin-bottom:2px;
                                      "
                                    >
                                      Materials Included
                                    </span>

                                    <div style="color:#4b5563;">
                                      ${area.materials_included}
                                    </div>
                                  </div>
                                `
                                : ""
                            }

                          </div>
                        </div>

                        <!-- Area Summary -->
                        <div
                          style="
                            display:flex;
                            gap:10px;
                            border-top:1px solid #e5e7eb;
                            padding-top:12px;
                            margin-top:4px;
                          "
                        >

                          <div
                            style="
                              flex:1;
                              background:#ffffff;
                              border:1px solid #e5e7eb;
                              border-radius:6px;
                              padding:8px 10px;
                              text-align:center;
                            "
                          >
                            <div
                              style="
                                font-size:9px;
                                font-weight:700;
                                text-transform:uppercase;
                                color:#6b7280;
                                letter-spacing:0.05em;
                                margin-bottom:2px;
                              "
                            >
                              Material
                            </div>

                            <div
                              style="
                                font-size:11px;
                                font-weight:700;
                                color:#111827;
                              "
                            >
                              ${formatCurrency(
                                area.material_cost || 0
                              )}
                            </div>
                          </div>

                          <div
                            style="
                              flex:1;
                              background:#ffffff;
                              border:1px solid #e5e7eb;
                              border-radius:6px;
                              padding:8px 10px;
                              text-align:center;
                            "
                          >
                            <div
                              style="
                                font-size:9px;
                                font-weight:700;
                                text-transform:uppercase;
                                color:#6b7280;
                                letter-spacing:0.05em;
                                margin-bottom:2px;
                              "
                            >
                              Labor
                            </div>

                            <div
                              style="
                                font-size:11px;
                                font-weight:700;
                                color:#111827;
                              "
                            >
                              ${formatCurrency(
                                area.labor_cost || 0
                              )}
                            </div>
                          </div>

                          <div
                            style="
                              flex:1;
                              background:#ffffff;
                              border:1px solid #e5e7eb;
                              border-radius:6px;
                              padding:8px 10px;
                              text-align:center;
                            "
                          >
                            <div
                              style="
                                font-size:9px;
                                font-weight:700;
                                text-transform:uppercase;
                                color:#6b7280;
                                letter-spacing:0.05em;
                                margin-bottom:2px;
                              "
                            >
                              Tax
                            </div>

                            <div
                              style="
                                font-size:11px;
                                font-weight:700;
                                color:#111827;
                              "
                            >
                              ${formatCurrency(
                                area.tax || 0
                              )}
                            </div>
                          </div>

                          <div
                            style="
                              flex:1;
                              background:#111827;
                              border:1px solid #111827;
                              border-radius:6px;
                              padding:8px 10px;
                              text-align:center;
                            "
                          >
                            <div
                              style="
                                font-size:9px;
                                font-weight:700;
                                text-transform:uppercase;
                                color:#9ca3af;
                                letter-spacing:0.05em;
                                margin-bottom:2px;
                              "
                            >
                              Estimated Repair
                            </div>

                            <div
                              style="
                                font-size:11.5px;
                                font-weight:800;
                                color:#ffffff;
                              "
                            >
                              ${formatCurrency(
                                area.estimated_repair_cost || 0
                              )}
                            </div>
                          </div>

                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            `
            : ""
        }

        <!-- Standard Line Items -->
        ${
          estimateItems.length > 0
            ? `
              <div class="section">
                <div class="section-title">
                  Additional Items
                </div>

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
                    ${estimateItems
                      .map(
                        (item: {
                          name?: string;
                          description?: string;
                          quantity?: number;
                          unit?: string | null;
                          unit_price?: number;
                          total?: number;
                        }) => `
                          <tr>
                            <td>${item.name || "-"}</td>
                            <td>${item.description || "-"}</td>
                            <td>
                              ${item.quantity || 0}
                              ${item.unit || ""}
                            </td>
                            <td>
                              ${formatCurrency(
                                item.unit_price || 0
                              )}
                            </td>
                            <td>
                              <strong>
                                ${formatCurrency(
                                  item.total || 0
                                )}
                              </strong>
                            </td>
                          </tr>
                        `
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            `
            : ""
        }

        <!-- Financial Summary -->
        <div class="section">
          <div class="section-title">
            Summary
          </div>

          <div class="summary-box">
            <div class="summary-row muted">
              <span>Subtotal</span>
              <span>${formatCurrency(subtotal)}</span>
            </div>

            ${
              markupAmount
                ? `
                  <div class="summary-row muted">
                    <span>Markup</span>
                    <span>${formatCurrency(markupAmount)}</span>
                  </div>
                `
                : ""
            }

            ${
              discountAmount
                ? `
                  <div class="summary-row muted">
                    <span>Discount</span>
                    <span>
                      -${formatCurrency(discountAmount)}
                    </span>
                  </div>
                `
                : ""
            }

            ${
              taxAmount
                ? `
                  <div class="summary-row muted">
                    <span>
                      Tax (${estimate.tax_rate}%)
                    </span>
                    <span>
                      ${formatCurrency(taxAmount)}
                    </span>
                  </div>
                `
                : ""
            }

            ${
              approvedChangeOrderTotal
                ? `
                  <div class="summary-row muted">
                    <span>
                      Approved Change Orders
                    </span>
                    <span>
                      ${formatCurrency(
                        approvedChangeOrderTotal
                      )}
                    </span>
                  </div>
                `
                : ""
            }

            <div class="summary-row">
              <span>Due Today</span>
              <span>
                ${formatCurrency(depositAmount)}
              </span>
            </div>

            <div class="summary-row muted">
              <span>
                Deposit Required
                (${company.default_deposit_percentage}%)
              </span>
              <span>
                ${formatCurrency(depositAmount)}
              </span>
            </div>

            <div class="summary-row balance">
              <span>Total</span>
              <span>
                ${formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>

        <!-- Payment Options -->
        <div class="section">
          <div class="section-title">
            Payment Options
          </div>

          <div
            style="
              background: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              padding: 16px;
              font-size: 11px;
              line-height: 1.6;
              color: #374151;
            "
          >
            <!-- Zelle -->
            <div style="margin-bottom: 14px;">
              <div
                style="
                  font-weight: 700;
                  color: #111827;
                  margin-bottom: 4px;
                  font-size: 12px;
                "
              >
                📧 Zelle
              </div>

              <div
                style="
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  background: #ffffff;
                  border: 1px solid #e5e7eb;
                  border-radius: 4px;
                  padding: 8px 12px;
                "
              >
                <span
                  style="
                    font-weight: 600;
                    color: #6b7280;
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                  "
                >
                  Send to:
                </span>

                <span
                  style="
                    font-weight: 700;
                    color: #059669;
                    font-size: 13px;
                    letter-spacing: 0.02em;
                  "
                >
                  onesquareroof@gmail.com
                </span>
              </div>

              <div
                style="
                  margin-top: 4px;
                  font-size: 10px;
                  color: #6b7280;
                  font-style: italic;
                "
              >
                Please include your estimate number or project address in the memo.
              </div>
            </div>

            <!-- Cash or Check -->
            <div style="border-top: 1px solid #e5e7eb; padding-top: 14px;">
              <div
                style="
                  font-weight: 700;
                  color: #111827;
                  margin-bottom: 4px;
                  font-size: 12px;
                "
              >
                💵 Cash or Check
              </div>

              <div
                style="
                  color: #6b7280;
                  font-size: 10px;
                  line-height: 1.4;
                "
              >
                <div>
                  Make checks payable to:
                  <strong style="color: #111827;">
                    ${company.company_name}
                  </strong>
                </div>

                <div style="margin-top: 2px;">
                  Mailing address:
                  <span style="color: #111827;">
                    ${company.company_address}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Payment Instructions -->
        <div class="section">
          <div class="section-title">
            Payment Instructions
          </div>

          <div
            style="
              font-size:11px;
              line-height:1.6;
              color:#4b5563;
              white-space:pre-wrap;
            "
          >
            ${company.payment_instructions}
          </div>
        </div>

        <!-- Material Price Notice -->
        <div class="section">
          <div class="section-title">
            Material Price Notice
          </div>

          <div
            style="
              font-size:10.5px;
              line-height:1.6;
              color:#6b7280;
            "
          >
            Our price stated in this proposal is based on current
            material prices. Due to raw material price volatility,
            material suppliers may adjust pricing without notice.
            If material costs increase before work begins, the
            contract price may be adjusted accordingly.
          </div>
        </div>

        <!-- MANDATORY WORKMANSHIP WARRANTY -->
        <div
          class="section"
          style="
            page-break-inside:avoid;
            margin-top:20px;
          "
        >
          <div class="section-title">
            Workmanship Warranty
          </div>

          <div
            style="
              font-size:10.5px;
              line-height:1.65;
              color:#374151;
            "
          >
            <div
              style="
                font-weight:700;
                color:#111827;
                margin-bottom:5px;
              "
            >
              This workmanship warranty covers:
            </div>

            <ul
              style="
                margin:0 0 12px 18px;
                padding:0;
              "
            >
              <li style="margin-bottom:3px;">
                Roof leaks caused by installation errors.
              </li>

              <li style="margin-bottom:3px;">
                Defects in workmanship related to the roofing
                system installed by One Square Roofing, LLC.
              </li>
            </ul>

            <div
              style="
                font-weight:700;
                color:#111827;
                margin-bottom:5px;
              "
            >
              This warranty does not cover:
            </div>

            <ul
              style="
                margin:0 0 12px 18px;
                padding:0;
              "
            >
              <li style="margin-bottom:3px;">
                Storm, hail, wind, fallen trees, or other acts
                of nature.
              </li>

              <li style="margin-bottom:3px;">
                Damage caused by foot traffic, other contractors,
                or homeowner modifications.
              </li>

              <li style="margin-bottom:3px;">
                Structural movement, settling, pre-existing
                building defects, clogged gutters, lack of
                maintenance, improper ventilation, or
                manufacturer defects.
              </li>
            </ul>

            ${
              company.warranty_text
                ? `
                  <div
                    style="
                      border-top:1px solid #e5e7eb;
                      padding-top:9px;
                      margin-top:9px;
                      white-space:pre-wrap;
                    "
                  >
                     
                  </div>
                `
                : ""
            }
          </div>
        </div>

        <!-- Completed Photos -->
        ${
          estimatePhotosByType.after.length > 0
            ? `
              <div class="section">
                <div class="section-title">
                  Completed Photos
                </div>

                <div
                  style="
                    display:flex;
                    flex-wrap:wrap;
                    gap:8px;
                    margin-top:6px;
                  "
                >
                  ${estimatePhotosByType.after
                    .map(
                      (photo) => `
                        <img
                          src="${photoUrl(
                            photo.storage_path
                          )}"
                          style="
                            width:140px;
                            height:100px;
                            object-fit:cover;
                            border-radius:4px;
                            border:1px solid #e5e7eb;
                          "
                          alt="After photo"
                        />
                      `
                    )
                    .join("")}
                </div>
              </div>
            `
            : ""
        }

        <!-- Additional Terms & Conditions -->
        <div class="section">
         

          <div
            style="
              font-size:10.5px;
              line-height:1.6;
              color:#374151;
            "
          >
            <!-- Terms and Conditions -->
            <div style="margin-bottom: 16px;">
              <div
                style="
                  font-weight: 700;
                  color: #111827;
                  font-size: 11px;
                  margin-bottom: 6px;
                "
              >
                Terms and Conditions
              </div>

              <div style="color: #4b5563;">
                The Contractor's standard Terms and Conditions are incorporated herein by reference and made a part of this Proposal/Agreement as if wholly re-written herein. The Terms and Conditions may be reviewed or a copy may be obtained by contacting our office. These Terms and Conditions are the only terms and conditions that apply to this Proposal/Agreement. The Contractor rejects any changes made by the Owner to this Proposal/Agreement unless the Contractor approves such changes in a writing signed by our authorized representative.
              </div>

              <div style="margin-top: 6px; color: #4b5563;">
                Contractor reserves the right to subcontract any or all of the work to one or more of its qualified affiliates.
              </div>
            </div>

            <!-- Proposal Validity -->
           

            <!-- Total -->
            
          </div>
        </div>

        <!-- Signature -->
        <div
          class="section"
          style="margin-top:30px;"
        >
          <div class="section-title">
            Customer Acceptance &amp; Signature
          </div>

          <div class="signature-box">
            ${renderSignature(estimate.signature)}
          </div>

          ${renderCompanySignatureLine(company)}
        </div>

        ${renderCompanyFooterBlock(company)}
      `,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error("PDF error:", error);

    return new NextResponse(
      "Error generating PDF",
      { status: 500 }
    );
  }
}