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

    // Staff-facing "Save as PDF" button, not the public invoice-signing
    // link — needs the logged-in user's session so RLS
    // (company_id = current_company_id()) can resolve. The app's client
    // (lib/supabase/client.ts) stores the session in localStorage, not
    // cookies, so no cookie-based server client can ever see it here.
    // Instead the page passes the current access token as a query param,
    // forwarded as a Bearer header so PostgREST/RLS resolves auth.uid().
    const token = request.nextUrl.searchParams.get("token");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : undefined
    );

    // ---------- 1. Fetch all data ----------
    const { data: invoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (!invoice) return new NextResponse("Invoice not found", { status: 404 });

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", invoice.client_id)
      .single();

    // Original estimate items (source of truth)
    let estimateItems: any[] = [];
    if (invoice.estimate_id) {
      const { data: estItems } = await supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", invoice.estimate_id)
        .is("deleted_at", null);
      estimateItems = estItems || [];
    }

    // Approved change orders
    let changeOrders: any[] = [];
    if (invoice.estimate_id) {
      const { data: cos } = await supabase
        .from("change_orders")
        .select("*")
        .eq("estimate_id", invoice.estimate_id)
        .eq("status", "approved")
        .is("deleted_at", null);
      changeOrders = cos || [];
    }

    // Payments
    const { data: payments } = await supabase
      .from("invoice_payments")
      .select("*")
      .eq("invoice_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    // Signature + title from linked estimate (the stored signature record —
    // not a new one collected here, since this PDF is read-only)
    let signature = null;
    let estimateTitle: string | null = null;
    if (invoice.estimate_id) {
      const { data: estimate } = await supabase
        .from("estimates")
        .select("signature, title")
        .eq("id", invoice.estimate_id)
        .single();
      if (estimate?.signature) signature = estimate.signature;
      estimateTitle = estimate?.title || null;
    }

    const company = await getCompanySettingsByCompanyId(supabase, invoice.company_id);

    // ---------- 2. Calculations (unchanged from prior implementation) ----------
    const originalSubtotal = estimateItems.reduce((sum, i) => sum + (i.total || 0), 0);
    const approvedChangeTotal = changeOrders.reduce((sum, co) => sum + (co.total_amount || 0), 0);
    const revisedTotal = originalSubtotal + approvedChangeTotal;
    const totalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const remainingBalance = revisedTotal - totalPaid;
    const depositPct = company.default_deposit_percentage / 100;
    const depositAmount = revisedTotal * depositPct;

    const html = pdfDocument({
      docTitle: `Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}`,
      bodyHtml: `
        <div class="header">
          <div>
            ${renderCompanyHeaderBlock(company)}
          </div>
          <div>
            <div class="doc-title">INVOICE</div>
            <div class="doc-meta"><strong>#${invoice.invoice_number || invoice.id.slice(0, 8)}</strong></div>
            ${estimateTitle ? `<div class="doc-meta">${estimateTitle}</div>` : ""}
            <div class="doc-meta">Date ${formatDate(invoice.created_at)}</div>
            <div class="doc-meta">Due ${formatDate(invoice.due_date)}</div>
            <div class="status-badge">${invoice.status || "pending"}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Bill To</div>
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

        ${invoice.description ? `
          <div class="section">
            <div class="section-title">Description</div>
            <div style="font-size:11px; line-height:1.6; white-space: pre-wrap;">${invoice.description}</div>
          </div>
        ` : ""}

        <div class="section">
          <div class="section-title">Original Estimate Items</div>
          ${estimateItems.length ? `
            <table>
              <thead>
                <tr>
                  <th style="width:30%">Item</th>
                  <th style="width:35%">Project</th>
                  <th style="width:10%">Qty</th>
                  <th style="width:12.5%">Unit Price</th>
                  <th style="width:12.5%">Total</th>
                </tr>
              </thead>
              <tbody>
                ${estimateItems.map(item => `
                  <tr>
                    <td>${item.name || "Item"}</td>
                    <td>${item.project_name || "Main Project"}</td>
                    <td>${item.quantity || 0}</td>
                    <td>${formatCurrency(item.unit_price || 0)}</td>
                    <td><strong>${formatCurrency(item.total || 0)}</strong></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `<div class="empty-note">No original estimate items.</div>`}
        </div>

        <div class="section">
          <div class="section-title">Approved Change Orders</div>
          ${changeOrders.length ? `
            <div>
              ${changeOrders.map(co => `
                <div class="co-row">
                  <span class="co-title">${co.title} (${co.change_order_number})</span>
                  <span class="co-amount">${co.total_amount >= 0 ? "+" : ""}${formatCurrency(co.total_amount)}</span>
                </div>
              `).join("")}
            </div>
          ` : `<div class="empty-note">No approved change orders.</div>`}
        </div>

        ${payments && payments.length > 0 ? `
          <div class="section">
            <div class="section-title">Payment History</div>
            <table>
              <thead><tr><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
              <tbody>
                ${payments.map(p => `<tr><td>${formatDate(p.created_at)}</td><td>${formatCurrency(p.amount)}</td><td>${p.method || "-"}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        ` : ""}

        <div class="section">
          <div class="section-title">Financial Summary</div>
          <div class="summary-box">
            <div class="summary-row"><span>Original Estimate Subtotal</span><span>${formatCurrency(originalSubtotal)}</span></div>
            ${approvedChangeTotal !== 0 ? `<div class="summary-row"><span>Approved Change Orders</span><span>${formatCurrency(approvedChangeTotal)}</span></div>` : ""}
            <div class="summary-row total"><span>Revised Total</span><span>${formatCurrency(revisedTotal)}</span></div>
            <div class="summary-row muted"><span>Deposit (${company.default_deposit_percentage}% of Revised Total)</span><span>${formatCurrency(depositAmount)}</span></div>
            ${totalPaid > 0 ? `<div class="summary-row muted"><span>Payments Received</span><span>-${formatCurrency(totalPaid)}</span></div>` : ""}
            <div class="summary-row balance"><span>Balance Due</span><span>${formatCurrency(remainingBalance)}</span></div>
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
          <div class="signature-box">${renderSignature(signature)}</div>
          ${renderCompanySignatureLine(company)}
        </div>

        ${renderCompanyFooterBlock(company)}
      `,
    });

    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  } catch (error) {
    console.error("PDF error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}
