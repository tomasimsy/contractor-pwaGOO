import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: invoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (!invoice) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", invoice.client_id)
      .single();

    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id);

    const { data: payments } = await supabase
      .from("invoice_payments")
      .select("*")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false });

    const totalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const remainingBalance = (invoice?.total || 0) - totalPaid;

    // Group items by project
    const projectMap: Record<string, any[]> = {};
    items?.forEach(item => {
      const projectName = item.project_name || "Main Project";
      if (!projectMap[projectName]) {
        projectMap[projectName] = [];
      }
      projectMap[projectName].push(item);
    });

    const projects = Object.entries(projectMap).map(([name, items]) => ({
      name,
      items,
      total: items.reduce((sum, i) => sum + (i.total || 0), 0)
    }));

    const subtotal = items?.reduce((sum, i) => sum + (i.total || 0), 0) || 0;
    const grandTotal = projects.reduce((sum, p) => sum + p.total, 0);
    const depositAmount = grandTotal * 0.5;
    const balanceDue = grandTotal - depositAmount;

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    };

    const formatDate = (date: string) => {
      if (!date) return "Not set";
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    // Generate project pages HTML
    const projectPagesHtml = projects.map((project, index) => `
      <div class="page" style="page-break-after: always;">
        <div class="project-header">
          <div class="project-name">Project ${index + 1}: ${project.name}</div>
          <div class="project-total-badge">Total: ${formatCurrency(project.total)}</div>
        </div>

        <table class="project-table">
          <thead>
            <tr>
              <th style="width: 25%">Item</th>
              <th style="width: 45%">Description</th>
              <th style="width: 10%">Qty</th>
              <th style="width: 10%">Price</th>
              <th style="width: 10%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${project.items.map(item => `
              <tr>
                <td>${item.name || "-"}</td>
                <td>${item.description || "-"}</td>
                <td style="text-align: center">${item.quantity || 0}</td>
                <td style="text-align: right">${formatCurrency(item.unit_price || 0)}</td>
                <td style="text-align: right"><strong>${formatCurrency(item.total || 0)}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="project-total-box">
          <div class="project-total-label">Project Total</div>
          <div class="project-total-amount">${formatCurrency(project.total)}</div>
        </div>

        <div class="signature-section">
          <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-label">Client Approval (Initials)</div>
          </div>
          <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-label">Contractor Approval (Initials)</div>
          </div>
        </div>

        <div class="footer">
          <p>Page ${index + 2} of ${projects.length + 2}</p>
        </div>
      </div>
    `).join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; background: white; }
            .no-print { display: none; }
            .page { page-break-after: always; }
            .page:last-child { page-break-after: auto; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Helvetica', Arial, sans-serif;
            background: #f5f7fa;
            padding: 20px;
          }
          .print-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #d4a048;
            color: #0b1630;
            border: none;
            padding: 10px 20px;
            border-radius: 40px;
            cursor: pointer;
            font-weight: 500;
            font-size: 13px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .print-btn:hover {
            background: #c08d35;
          }
          .document {
            max-width: 1100px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 8px 30px rgba(0,0,0,0.05);
          }
          .page {
            padding: 48px;
            background: white;
            page-break-after: always;
          }
          .page:last-child {
            page-break-after: auto;
          }
          /* Header */
          .header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 32px;
            padding-bottom: 24px;
            border-bottom: 2px solid #e8eef2;
          }
          .company-name {
            font-size: 22px;
            font-weight: 600;
            color: #1a2a3a;
            letter-spacing: -0.3px;
          }
          .company-details {
            font-size: 10px;
            color: #8a9aaa;
            margin-top: 6px;
          }
          .invoice-title {
            font-size: 22px;
            font-weight: 600;
            color: #d4a048;
            text-align: right;
          }
          .invoice-number {
            font-size: 11px;
            color: #8a9aaa;
            text-align: right;
            margin-top: 4px;
          }
          /* Section Titles */
          .section-title {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #5a6e7e;
            margin: 24px 0 12px 0;
            background: none;
            border-left: none;
            padding-left: 0;
          }
          /* Client Card */
          .client-card {
            background: #f8fafc;
            padding: 20px 24px;
            border-radius: 16px;
            margin-bottom: 20px;
            border: 1px solid #eef2f4;
          }
          .client-row {
            display: flex;
            margin-bottom: 8px;
            font-size: 11px;
          }
          .client-label {
            width: 100px;
            font-weight: 500;
            color: #5a6e7e;
          }
          /* Tables */
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
          }
          th {
            background: #f8fafc;
            color: #3a4a5a;
            padding: 10px;
            text-align: left;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            border-bottom: 1px solid #e8eef2;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #f0f2f4;
            font-size: 10px;
            color: #2a3a4a;
          }
          /* Summary Box */
          .summary-box {
            background: #f8fafc;
            padding: 20px 24px;
            border-radius: 16px;
            margin: 20px 0;
            border: 1px solid #eef2f4;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 11px;
          }
          .paid-row {
            color: #3b7c5e;
          }
          .balance-row {
            background: #fff8eb;
            margin-top: 12px;
            padding: 10px 16px;
            border-radius: 12px;
            border: 1px solid #f0e6d0;
          }
          /* Project Page Styles */
          .project-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #d4a048;
          }
          .project-name {
            font-size: 18px;
            font-weight: 700;
            color: #1a2a3a;
          }
          .project-total-badge {
            font-size: 12px;
            font-weight: 600;
            color: #d4a048;
            background: #f5f0e6;
            padding: 6px 12px;
            border-radius: 20px;
          }
          .project-table {
            margin: 20px 0;
          }
          .project-total-box {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 20px;
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid #e8eef2;
          }
          .project-total-label {
            font-size: 12px;
            font-weight: 500;
            color: #5a6e7e;
          }
          .project-total-amount {
            font-size: 16px;
            font-weight: 700;
            color: #d4a048;
          }
          /* Signature Section */
          .signature-section {
            display: flex;
            justify-content: space-between;
            margin: 40px 0 20px;
            gap: 40px;
          }
          .signature-block {
            flex: 1;
          }
          .signature-line {
            border-bottom: 1px solid #1a2a3a;
            margin-top: 40px;
            margin-bottom: 6px;
          }
          .signature-label {
            font-size: 9px;
            color: #8a9aaa;
            text-align: center;
          }
          /* Summary Table */
          .summary-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .summary-table th {
            background: #f8fafc;
            color: #3a4a5a;
            padding: 12px;
            text-align: left;
            font-size: 11px;
          }
          .summary-table td {
            padding: 10px;
            border-bottom: 1px solid #eef2f4;
            font-size: 11px;
          }
          .grand-total-row {
            background: #fafcfc;
            font-weight: 700;
          }
          .deposit-section {
            background: #f8fafc;
            padding: 20px 24px;
            border-radius: 16px;
            margin: 20px 0;
            border: 1px solid #eef2f4;
          }
          .deposit-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 11px;
          }
          .footer {
            text-align: center;
            margin-top: 48px;
            padding-top: 24px;
            border-top: 1px solid #eef2f4;
            font-size: 9px;
            color: #a0b0bc;
          }
        </style>
      </head>
      <body>
        <button class="print-btn no-print" onclick="window.print()">🖨️ Save as PDF</button>

        <div class="document">
          <!-- PAGE 1 - Cover / Invoice Info -->
          <div class="page">
            <div class="header">
              <div>
                <div class="company-name">One Square Roof LLC</div>
                <div class="company-details">Charlotte, North Carolina</div>
                <div class="company-details">Phone: (704) 303-4112</div>
                <div class="company-details">Email: onesquareroof@gmail.com</div>
              </div>
              <div>
                <div class="invoice-title">INVOICE</div>
                <div class="invoice-number">#${invoice.invoice_number || invoice.id.slice(0, 8)}</div>
                <div class="invoice-number">Date: ${formatDate(invoice.created_at)}</div>
                <div class="invoice-number">Due: ${formatDate(invoice.due_date)}</div>
              </div>
            </div>

            <div class="client-card">
              <div class="client-row">
                <div class="client-label">Bill To:</div>
                <div>${client?.name || "No client"}</div>
              </div>
              <div class="client-row">
                <div class="client-label">Phone:</div>
                <div>${client?.phone || "Not provided"}</div>
              </div>
              <div class="client-row">
                <div class="client-label">Email:</div>
                <div>${client?.email || "Not provided"}</div>
              </div>
              <div class="client-row">
                <div class="client-label">Address:</div>
                <div>${client?.address || "Not provided"}</div>
              </div>
            </div>

            ${invoice?.description ? `
              <div class="section-title">Description</div>
              <div style="margin-bottom: 20px; font-size: 11px; color: #555;">${invoice.description}</div>
            ` : ""}

            <div class="section-title">Projects Overview</div>
            <table class="summary-table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th style="text-align: right">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                ${projects.map(project => `
                  <tr>
                    <td>${project.name}</td>
                    <td style="text-align: right">${formatCurrency(project.total)}</td>
                  </tr>
                `).join("")}
                <tr class="grand-total-row">
                  <td><strong>GRAND TOTAL</strong></td>
                  <td style="text-align: right"><strong>${formatCurrency(grandTotal)}</strong></td>
                </tr>
              </tbody>
            </table>

            <div class="summary-box">
              <div class="summary-row">
                <span>Subtotal</span>
                <span>${formatCurrency(subtotal)}</span>
              </div>
              ${invoice?.discount > 0 ? `
                <div class="summary-row">
                  <span>Discount</span>
                  <span>-${formatCurrency(invoice.discount)}</span>
                </div>
              ` : ""}
              ${invoice?.tax > 0 ? `
                <div class="summary-row">
                  <span>Tax</span>
                  <span>${formatCurrency(invoice.tax)}</span>
                </div>
              ` : ""}
              <div class="summary-row">
                <span><strong>Total</strong></span>
                <span><strong>${formatCurrency(invoice?.total || 0)}</strong></span>
              </div>
              ${totalPaid > 0 ? `
                <div class="summary-row paid-row">
                  <span>Amount Paid</span>
                  <span>-${formatCurrency(totalPaid)}</span>
                </div>
                <div class="balance-row">
                  <span><strong>Balance Due</strong></span>
                  <span><strong>${formatCurrency(remainingBalance)}</strong></span>
                </div>
              ` : ""}
            </div>

            ${payments && payments.length > 0 ? `
              <div class="section-title">Payment History</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                  </tr>
                </thead>
                <tbody>
                  ${payments.map(p => `
                    <tr>
                      <td>${formatDate(p.created_at)}</td>
                      <td>${formatCurrency(p.amount)}</td>
                      <td>${p.method}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            ` : ""}

            ${invoice?.signature ? `
              <div class="section-title">Customer Signature</div>
              <div style="margin-top: 10px;">
                <div>${invoice.signature.type === "type" ? `Signed by: ${invoice.signature.value}` : "Electronic signature on file"}</div>
                <div style="font-size: 10px; color: #666;">Signed on: ${formatDate(invoice.signature.date)}</div>
              </div>
            ` : ""}

            <div class="footer">
              <p>Page 1 of ${projects.length + 2}</p>
            </div>
          </div>

          <!-- PROJECT PAGES -->
          ${projectPagesHtml}

          <!-- FINAL SUMMARY PAGE -->
          <div class="page">
            <div class="section-title">Estimate Summary</div>
            
            <table class="summary-table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th style="text-align: right">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                ${projects.map(project => `
                  <tr>
                    <td>${project.name}</td>
                    <td style="text-align: right">${formatCurrency(project.total)}</td>
                  </tr>
                `).join("")}
                <tr class="grand-total-row">
                  <td><strong>GRAND TOTAL</strong></td>
                  <td style="text-align: right"><strong>${formatCurrency(grandTotal)}</strong></td>
                </tr>
              </tbody>
            </table>

            <div class="deposit-section">
              <div class="deposit-row">
                <span>Deposit Required (50%)</span>
                <span><strong>${formatCurrency(depositAmount)}</strong></span>
              </div>
              <div class="deposit-row">
                <span>Balance Due Upon Completion</span>
                <span><strong>${formatCurrency(balanceDue)}</strong></span>
              </div>
            </div>

            <div class="footer">
              <p>Thank you for your business! • One Square Roof LLC • (704) 303-4112</p>
              <p>Page ${projects.length + 2} of ${projects.length + 2}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error("PDF error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}