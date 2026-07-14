import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    // Signature + title from estimate
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

    // ---------- 2. Calculations ----------
    const originalSubtotal = estimateItems.reduce((sum, i) => sum + (i.total || 0), 0);
    const approvedChangeTotal = changeOrders.reduce((sum, co) => sum + (co.total_amount || 0), 0);
    const revisedTotal = originalSubtotal + approvedChangeTotal;
    const totalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const remainingBalance = revisedTotal - totalPaid;
    const depositAmount = revisedTotal * 0.5;
    const balanceAfterDeposit = revisedTotal - depositAmount;

    // Group estimate items by project for display (optional, matches page)
    const projectMap: Record<string, any[]> = {};
    estimateItems.forEach(item => {
      const projectName = item.project_name || "Main Project";
      if (!projectMap[projectName]) projectMap[projectName] = [];
      projectMap[projectName].push(item);
    });
    const projects = Object.entries(projectMap).map(([name, items]) => ({
      name,
      items,
      total: items.reduce((sum, i) => sum + (i.total || 0), 0)
    }));

    // ---------- 3. Helpers ----------
    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

    const formatDate = (date: string) => {
      if (!date) return "Not set";
      try {
        return new Date(date).toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        });
      } catch {
        return "Not set";
      }
    };

    const getSignatureHtml = () => {
      if (!signature) return `<div class="signature-not-signed"><div class="not-signed-icon">✍️</div><div>Not signed yet</div></div>`;
      if (signature.type === "type") return `<div class="signature-typed"><div class="signature-name">${signature.value}</div><div class="signature-date">Signed on ${formatDate(signature.date)}</div></div>`;
      if (signature.type === "draw") return `<div class="signature-draw"><img src="${signature.value}" class="signature-image" alt="Customer signature" /><div class="signature-date">Signed on ${formatDate(signature.date)}</div></div>`;
      return '';
    };

    // Generate project pages (detailed breakdown)
    const projectPagesHtml = projects.map((project, idx) => `
      <div class="page" style="page-break-after: always;">
        <div class="project-header">
          <div class="project-name">Project ${idx + 1}: ${project.name}</div>
          <div class="project-total-badge">Total: ${formatCurrency(project.total)}</div>
        </div>
        <table class="project-table">
          <thead>
            <tr>
              <th style="width:25%">Item</th>
              <th style="width:45%">Description</th>
              <th style="width:10%">Qty</th>
              <th style="width:10%">Price</th>
              <th style="width:10%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${project.items.map(item => `
              <tr>
                <td style="text-align:left">${item.name || "-"}</td>
                <td style="text-align:left">${item.description || "-"}</td>
                <td style="text-align:center">${item.quantity || 0}</td>
                <td style="text-align:right">${formatCurrency(item.unit_price || 0)}</td>
                <td style="text-align:right"><strong>${formatCurrency(item.total || 0)}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div class="project-total-box">
          <div class="project-total-label">Project Total</div>
          <div class="project-total-amount">${formatCurrency(project.total)}</div>
        </div>
        <div class="footer"><p>Page ${idx + 2} of ${projects.length + 2}</p></div>
      </div>
    `).join("");

    // ---------- 4. HTML ----------
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}</title>
        <style>
          @media print { body { margin: 0; padding: 0; background: white; } .no-print { display: none; } .page { page-break-after: always; } .page:last-child { page-break-after: auto; } }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica', Arial, sans-serif; background: #f5f7fa; padding: 20px; }
          .print-btn { position: fixed; top: 20px; right: 20px; background: #d4a048; color: #0b1630; border: none; padding: 10px 20px; border-radius: 40px; cursor: pointer; font-weight: 500; font-size: 13px; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .print-btn:hover { background: #c08d35; }
          .document { max-width: 1100px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.05); }
          .page { padding: 48px; background: white; page-break-after: always; }
          .page:last-child { page-break-after: auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #e8eef2; }
          .company-name { font-size: 22px; font-weight: 600; color: #1a2a3a; }
          .company-details { font-size: 10px; color: #8a9aaa; margin-top: 6px; }
          .invoice-title { font-size: 22px; font-weight: 600; color: #d4a048; text-align: right; }
          .invoice-number { font-size: 11px; color: #8a9aaa; text-align: right; margin-top: 4px; }
          .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #5a6e7e; margin: 24px 0 12px 0; }
          .client-card { background: #f8fafc; padding: 20px 24px; border-radius: 16px; margin-bottom: 20px; border: 1px solid #eef2f4; }
          .client-row { display: flex; margin-bottom: 8px; font-size: 11px; }
          .client-label { width: 100px; font-weight: 500; color: #5a6e7e; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th { background: #f8fafc; color: #3a4a5a; padding: 10px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; border-bottom: 1px solid #e8eef2; }
          td { padding: 10px; border-bottom: 1px solid #f0f2f4; font-size: 10px; color: #2a3a4a; }
          .summary-box { background: #f8fafc; padding: 20px 24px; border-radius: 16px; margin: 20px 0; border: 1px solid #eef2f4; }
          .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 11px; }
          .paid-row { color: #3b7c5e; }
          .balance-row { background: #fff8eb; margin-top: 12px; padding: 10px 16px; border-radius: 12px; border: 1px solid #f0e6d0; }
          .terms-section { margin-top: 24px; padding: 20px; background: #f8fafc; border-radius: 16px; border: 1px solid #eef2f4; }
          .terms-title { font-size: 12px; font-weight: 700; color: #1a2a3a; margin-bottom: 12px; }
          .terms-list { list-style: none; padding: 0; }
          .terms-list li { font-size: 9px; color: #5a6e7e; margin-bottom: 6px; padding-left: 14px; position: relative; line-height: 1.4; }
          .terms-list li:before { content: "✓"; position: absolute; left: 0; color: #d4a048; font-weight: bold; }
          .project-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #d4a048; }
          .project-name { font-size: 18px; font-weight: 700; color: #1a2a3a; }
          .project-total-badge { font-size: 12px; font-weight: 600; color: #d4a048; background: #f5f0e6; padding: 6px 12px; border-radius: 20px; }
          .project-table { margin: 20px 0; }
          .project-total-box { display: flex; justify-content: flex-end; align-items: center; gap: 20px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e8eef2; }
          .project-total-label { font-size: 12px; font-weight: 500; color: #5a6e7e; }
          .project-total-amount { font-size: 16px; font-weight: 700; color: #d4a048; }
          .customer-signature { margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 16px; border: 1px solid #eef2f4; text-align: center; }
          .customer-signature-title { font-size: 12px; font-weight: 700; color: #1a2a3a; margin-bottom: 15px; text-transform: uppercase; }
          .signature-typed .signature-name { font-size: 22px; font-weight: 600; color: #1a2a3a; font-family: 'Brush Script MT', cursive; border-bottom: 1px solid #d4a048; display: inline-block; padding-bottom: 5px; margin-bottom: 8px; }
          .signature-image { max-height: 80px; max-width: 100%; margin: 0 auto; display: block; object-fit: contain; }
          .signature-date { font-size: 10px; color: #8a9aaa; margin-top: 8px; }
          .signature-not-signed { text-align: center; color: #8a9aaa; font-style: italic; }
          .not-signed-icon { font-size: 32px; margin-bottom: 8px; }
          .deposit-section { background: #f8fafc; padding: 20px 24px; border-radius: 16px; margin: 20px 0; border: 1px solid #eef2f4; }
          .deposit-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 11px; }
          .footer { text-align: center; margin-top: 48px; padding-top: 24px; border-top: 1px solid #eef2f4; font-size: 9px; color: #a0b0bc; }
          .change-order-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #e0e8f0; }
          .change-order-title { font-size: 10px; font-weight: 500; color: #3a6ea5; }
          .change-order-amount { font-size: 10px; font-weight: 700; color: #2c7a4d; }
        </style>
      </head>
      <body>
        <button class="print-btn no-print" onclick="window.print()">🖨️ Save as PDF</button>
        <div class="document">
          <!-- PAGE 1 – Cover & Summary -->
          <div class="page">
            <div class="header">
              <div>
                <div class="company-name">OSR Pros</div>
                <div class="company-details">Charlotte, North Carolina</div>
                <div class="company-details">Phone: (704) 303-4112</div>
                <div class="company-details">Email: onesquareroof@gmail.com</div>
              </div>
              <div>
                <div class="invoice-title">INVOICE</div>
                <div class="invoice-number">#${invoice.invoice_number || invoice.id.slice(0, 8)}</div>
                ${estimateTitle ? `<div class="invoice-number">${estimateTitle}</div>` : ""}
                <div class="invoice-number">Date: ${formatDate(invoice.created_at)}</div>
                <div class="invoice-number">Due: ${formatDate(invoice.due_date)}</div>
              </div>
            </div>

            <div class="client-card">
              <div class="client-row"><div class="client-label">Bill To:</div><div>${client?.name || "No client"}</div></div>
              <div class="client-row"><div class="client-label">Phone:</div><div>${client?.phone || "Not provided"}</div></div>
              <div class="client-row"><div class="client-label">Email:</div><div>${client?.email || "Not provided"}</div></div>
              <div class="client-row"><div class="client-label">Address:</div><div>${client?.address || "Not provided"}</div></div>
            </div>

            ${invoice?.description ? `<div class="section-title">Description</div><div style="margin-bottom:20px;font-size:11px;">${invoice.description}</div>` : ""}

            <!-- All Original Estimate Items -->
            <div class="section-title">Original Estimate Items</div>
            ${estimateItems.length ? `
              <table>
                <thead>
                  <tr>
                    <th style="width:30%">Item</th>
                    <th style="width:40%">Project</th>
                    <th style="width:10%">Qty</th>
                    <th style="width:10%">Price</th>
                    <th style="width:10%">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${estimateItems.map(item => `
                    <tr>
                      <td style="text-align:left">${item.name || "Item"}</td>
                      <td style="text-align:left">${item.project_name || "Main Project"}</td>
                      <td style="text-align:center">${item.quantity || 0}</td>
                      <td style="text-align:right">${formatCurrency(item.unit_price || 0)}</td>
                      <td style="text-align:right"><strong>${formatCurrency(item.total || 0)}</strong></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
              <div style="text-align:right; margin:8px 0 16px;"><strong>Original Subtotal: ${formatCurrency(originalSubtotal)}</strong></div>
            ` : `<p style="font-size:11px; color:#888;">No original estimate items.</p>`}

            <!-- Approved Change Orders -->
            <div class="section-title">Approved Change Orders</div>
            ${changeOrders.length ? `
              <div style="margin: 12px 0;">
                ${changeOrders.map(co => `
                  <div class="change-order-item">
                    <span class="change-order-title">${co.title} (${co.change_order_number})</span>
                    <span class="change-order-amount">${co.total_amount >= 0 ? "+" : ""}${formatCurrency(co.total_amount)}</span>
                  </div>
                `).join("")}
                <div style="margin-top: 8px; text-align:right; border-top:1px solid #e0e8f0; padding-top:6px;">
                  <strong>Change Orders Total: ${formatCurrency(approvedChangeTotal)}</strong>
                </div>
              </div>
            ` : `<p style="font-size:11px; color:#888;">No approved change orders.</p>`}

            <!-- Financial Summary with Deposit -->
            <div class="summary-box">
              <div class="summary-row"><span>Original Estimate Subtotal</span><span>${formatCurrency(originalSubtotal)}</span></div>
              ${approvedChangeTotal !== 0 ? `<div class="summary-row"><span>Approved Change Orders</span><span>${formatCurrency(approvedChangeTotal)}</span></div>` : ""}
              <div class="summary-row"><span><strong>Revised Total</strong></span><span><strong>${formatCurrency(revisedTotal)}</strong></span></div>
              <div class="summary-row"><span>Deposit (50% of Revised Total)</span><span>${formatCurrency(depositAmount)}</span></div>
              ${totalPaid > 0 ? `<div class="summary-row paid-row"><span>Payments Received</span><span>-${formatCurrency(totalPaid)}</span></div>` : ""}
              <div class="balance-row"><span><strong>Balance Due</strong></span><span><strong>${formatCurrency(remainingBalance)}</strong></span></div>
            </div>

            ${payments && payments.length > 0 ? `
              <div class="section-title">Payment History</div>
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
                <tbody>${payments.map(p => `<tr><td>${formatDate(p.created_at)}</td><td>${formatCurrency(p.amount)}</td><td>${p.method}</td></tr>`).join("")}</tbody>
              </table>
            ` : ""}

            <div class="footer"><p>Page 1 of ${projects.length + 2}</p></div>
          </div>

          <!-- PROJECT PAGES (detailed per project, using estimate items) -->
          ${projectPagesHtml}

          <!-- FINAL PAGE – Terms & Signature -->
          <div class="page">
            <div class="section-title">Project Summary (Totals)</div>
            <table class="summary-table">
              <thead><tr><th>Project Name</th><th style="text-align:right">Total Amount</th></tr></thead>
              <tbody>
                ${projects.map(proj => `<tr><td style="text-align:left">${proj.name}</td><td style="text-align:right">${formatCurrency(proj.total)}</td></tr>`).join("")}
                <tr style="font-weight:700; background:#fafcfc;"><td><strong>Grand Total (from projects)</strong></td><td style="text-align:right"><strong>${formatCurrency(originalSubtotal)}</strong></td></tr>
                ${approvedChangeTotal !== 0 ? `<tr><td><em>Plus Approved Change Orders</em></td><td style="text-align:right"><em>+${formatCurrency(approvedChangeTotal)}</em></td></tr>` : ""}
                <tr style="background:#f5f0e6;"><td><strong>Revised Total</strong></td><td style="text-align:right"><strong>${formatCurrency(revisedTotal)}</strong></td></tr>
              </tbody>
            </table>

            <div class="deposit-section">
              <div class="deposit-row"><span>Deposit Required (50% of Revised Total)</span><span><strong>${formatCurrency(depositAmount)}</strong></span></div>
              <div class="deposit-row"><span>Balance Due After Deposit</span><span><strong>${formatCurrency(balanceAfterDeposit)}</strong></span></div>
            </div>

            <div class="terms-section">
              <div class="terms-title">Terms & Conditions</div>
              <ul class="terms-list">
                <li>This invoice reflects the final revised total including approved change orders.</li>
                <li>A 50% deposit of the revised total is required to begin work. Remaining balance due upon completion.</li>
                <li>Any further changes or additions to scope must be approved in writing and may incur additional charges.</li>
                <li>Client is responsible for providing safe access to work areas.</li>
                <li>Customer is responsible for marking or notifying contractor of any private underground lines, irrigation, drain lines, low-voltage wires, or hidden utilities.</li>
                <li>Contractor is not responsible for damage caused by hidden or unmarked underground items.</li>
                <li>Warranty does not cover damage caused by weather, tree roots, drainage issues, soil movement, customer neglect, or work performed by others.</li>
                <li>For applicable residential/home-solicitation jobs, customer cancellation rights will follow North Carolina and federal law.</li>
                <li>Weather delays, material delays, or hidden conditions may affect the schedule.</li>
                <li>Debris cleanup is only included for the approved scope of work.</li>
              </ul>
            </div>

            <div class="customer-signature">
              <div class="customer-signature-title">Customer Signature</div>
              <div class="signature-display">${getSignatureHtml()}</div>
            </div>

            <div class="footer">
              <p>Thank you for your business! • One Square Roofing DBA OSR Pros • (704) 303-4112</p>
              <p>Page ${projects.length + 2} of ${projects.length + 2}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  } catch (error) {
    console.error("PDF error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}