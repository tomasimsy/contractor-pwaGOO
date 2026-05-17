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
    const isPaid = remainingBalance === 0;

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

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            .no-print { display: none; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Helvetica', Arial, sans-serif;
            background: #e8eef2;
            padding: 20px;
          }
          .print-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #d4a048;
            color: #0b1630;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            z-index: 1000;
          }
          .document {
            max-width: 1100px;
            margin: 0 auto;
            background: white;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          }
          .page {
            padding: 50px;
            background: white;
          }
          .header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #d4a048;
          }
          .company-name {
            font-size: 26px;
            font-weight: 800;
            color: #0b1630;
          }
          .company-details {
            font-size: 10px;
            color: #666;
            margin-top: 8px;
          }
          .invoice-title {
            font-size: 24px;
            font-weight: 800;
            color: #d4a048;
            text-align: right;
          }
          .invoice-number {
            font-size: 12px;
            color: #0b1630;
            text-align: right;
            margin-top: 5px;
          }
          .section-title {
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            color: #0b1630;
            background: #f5f0e6;
            padding: 8px 12px;
            margin: 20px 0 15px 0;
            border-left: 4px solid #d4a048;
          }
          .client-card {
            background: #fafaf8;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 20px;
          }
          .client-row {
            display: flex;
            margin-bottom: 8px;
            font-size: 11px;
          }
          .client-label {
            width: 100px;
            font-weight: 700;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          th {
            background: #0b1630;
            color: white;
            padding: 10px;
            text-align: left;
            font-size: 10px;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #e8e2d4;
            font-size: 10px;
          }
          .summary-box {
            background: #0b1630;
            padding: 20px;
            border-radius: 12px;
            color: white;
            margin: 20px 0;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
          }
          .paid-row {
            color: #4caf50;
          }
          .balance-row {
            background: #d4a048;
            margin-top: 10px;
            padding: 12px;
            border-radius: 8px;
            color: #0b1630;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e8e2d4;
            font-size: 9px;
            color: #999;
          }
        </style>
      </head>
      <body>
        <button class="print-btn no-print" onclick="window.print()">🖨️ Save as PDF</button>

        <div class="document">
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

            <div class="section-title">Invoice Items</div>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${items?.map(item => `
                  <tr>
                    <td>${item.name || "-"}</td>
                    <td>${item.description || "-"}</td>
                    <td>${item.quantity || 0}</td>
                    <td>${formatCurrency(item.unit_price || 0)}</td>
                    <td>${formatCurrency(item.total || 0)}</td>
                  </tr>
                `).join("")}
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
                      <td class="capitalize">${p.method}</td>
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
              <p>Thank you for your business! • One Square Roof LLC • (704) 303-4112</p>
              <p>Payment is due upon receipt unless otherwise specified</p>
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