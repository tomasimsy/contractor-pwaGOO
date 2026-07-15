import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatCurrency, formatDate, renderSignature, pdfDocument, renderCompanyHeaderBlock, renderCompanyFooterBlock, renderCompanySignatureLine } from "@/lib/pdf/pdfLayout";
import { getCompanySettingsByCompanyId } from "@/lib/company";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // This is a staff-facing "Save as PDF" button, not the separate
    // public estimate-signing link — it needs the logged-in user's
    // session so RLS (company_id = current_company_id()) can resolve.
    // The app's client (lib/supabase/client.ts) stores the session in
    // localStorage, not cookies, so no cookie-based server client
    // (auth-helpers-nextjs, @supabase/ssr) can ever see it here. Instead
    // the page passes the current access token as a query param, which
    // we forward as a Bearer header so PostgREST/RLS resolves auth.uid().
    const token = request.nextUrl.searchParams.get("token");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : undefined
    );

    const { data: estimate } = await supabase
      .from("estimates")
      .select("*")
      .eq("id", id)
      .single();

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
    const company = await getCompanySettingsByCompanyId(supabase, estimate.company_id);

    // ---------- Calculations (unchanged from prior implementation) ----------
    const subtotal = estimateItems.reduce((sum, i) => sum + (i.total || 0), 0);
    const depositPct = company.default_deposit_percentage / 100;
    const depositAmount = estimate.deposit_amount || subtotal * depositPct;
    const balanceAmount = subtotal - depositAmount;

    const html = pdfDocument({
      docTitle: `Estimate ${estimate.estimate_number || estimate.id.slice(0, 8)}`,
      bodyHtml: `
        <div class="header">
          <div>
            ${renderCompanyHeaderBlock(company)}
          </div>
          <div>
            <div class="doc-title">ESTIMATE</div>
            <div class="doc-meta"><strong>#${estimate.estimate_number || estimate.id.slice(0, 8)}</strong></div>
            ${estimate.title ? `<div class="doc-meta">${estimate.title}</div>` : ""}
            <div class="doc-meta">Issued ${formatDate(estimate.created_at)}</div>
            <div class="status-badge">${estimate.status || "pending"}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Customer</div>
          <div class="info-grid">
            <div class="info-col">
              <div class="info-row"><div class="info-label">Name</div><div class="info-value">${client?.name || "No client"}</div></div>
              <div class="info-row"><div class="info-label">Phone</div><div class="info-value">${client?.phone || "Not provided"}</div></div>
            </div>
            <div class="info-col">
              <div class="info-row"><div class="info-label">Email</div><div class="info-value">${client?.email || "Not provided"}</div></div>
              <div class="info-row"><div class="info-label">Address</div><div class="info-value">${client?.address || "Not provided"}</div></div>
            </div>
          </div>
        </div>

        ${estimate.description ? `
          <div class="section">
            <div class="section-title">Project Overview</div>
            <div style="font-size:11px; line-height:1.6; white-space: pre-wrap;">${estimate.description}</div>
          </div>
        ` : ""}

        <div class="section">
          <div class="section-title">Items</div>
          ${estimateItems.length ? `
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
                ${estimateItems.map(item => `
                  <tr>
                    <td>${item.name || "-"}</td>
                    <td>${item.description || "-"}</td>
                    <td>${item.quantity || 0}</td>
                    <td>${formatCurrency(item.unit_price || 0)}</td>
                    <td><strong>${formatCurrency(item.total || 0)}</strong></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `<div class="empty-note">No items on this estimate.</div>`}
        </div>

        <div class="section">
          <div class="section-title">Financial Summary</div>
          <div class="summary-box">
            <div class="summary-row"><span>Total Estimate Amount</span><span>${formatCurrency(subtotal)}</span></div>
            <div class="summary-row muted"><span>Deposit Required (${company.default_deposit_percentage}%)</span><span>${formatCurrency(depositAmount)}</span></div>
            <div class="summary-row muted"><span>Balance Due Upon Completion</span><span>${formatCurrency(balanceAmount)}</span></div>
            <div class="summary-row balance"><span>Due Today</span><span>${formatCurrency(depositAmount)}</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Payment Instructions</div>
          <div style="font-size:11px; line-height:1.6; white-space: pre-wrap;">${company.payment_instructions}</div>
        </div>

        <div class="section">
          <div class="section-title">Terms &amp; Conditions</div>
          <div style="font-size:10.5px; line-height:1.6; color:#6b7280; white-space: pre-wrap;">${company.terms_conditions}</div>
        </div>

        <div class="section">
          <div class="section-title">Warranty</div>
          <div style="font-size:10.5px; line-height:1.6; color:#6b7280; white-space: pre-wrap;">${company.warranty_text}</div>
        </div>

        <div class="section">
          <div class="section-title">Customer Signature</div>
          <div class="signature-box">${renderSignature(estimate.signature)}</div>
          ${renderCompanySignatureLine(company)}
        </div>

        ${renderCompanyFooterBlock(company)}
      `,
    });

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("PDF error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}
