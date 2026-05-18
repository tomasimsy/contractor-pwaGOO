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
      .eq("estimate_id", id);

    const subtotal = items?.reduce((sum, i) => sum + (i.total || 0), 0) || 0;
    const depositAmount = estimate.deposit_amount || subtotal * 0.5;
    const balanceAmount = subtotal - depositAmount;

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

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    };

    const formatDate = (date: string) => {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    // Generate project pages HTML (each project on its own page)
    const projectPagesHtml = projects.map((project, idx) => `
      <div class="page">
        <div class="project-header">
          <div class="project-name">📋 ${project.name}</div>
          <div class="project-badge">Project ${idx + 1}</div>
        </div>

        <table class="project-table">
          <thead>
            <tr>
              <th style="width: 25%">Item / Service</th>
              <th style="width: 45%">Description</th>
              <th style="width: 10%">Qty</th>
              <th style="width: 10%">Unit Price</th>
              <th style="width: 10%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${project.items.map(item => `
              <tr>
                <td><strong>${item.name || "-"}</strong></td>
                <td>${item.description || "-"}</td>
                <td style="text-align: center">${item.quantity || 0}</td>
                <td style="text-align: right">${formatCurrency(item.unit_price || 0)}</td>
                <td style="text-align: right"><strong>${formatCurrency(item.total || 0)}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="project-total-box">
          <span class="project-total">Project Total: ${formatCurrency(project.total)}</span>
        </div>

        <div class="footer">
          <p>Page ${idx + 2} of ${projects.length + 3}</p>
        </div>
      </div>
    `).join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Estimate ${estimate.estimate_number || estimate.id.slice(0, 8)}</title>
        <style>
          @media print {
            body {
              margin: 0;
              padding: 0;
            }
            .page-break {
              page-break-before: always;
            }
            .no-print {
              display: none;
            }
            .print-btn {
              display: none;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Helvetica', 'Arial', sans-serif;
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
            font-size: 14px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            transition: all 0.3s;
          }
          .print-btn:hover {
            background: #b8892d;
            transform: translateY(-2px);
          }
          .document {
            max-width: 1100px;
            margin: 0 auto;
            background: white;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          }
          .page {
            padding: 50px;
            page-break-after: always;
            background: white;
          }
          .page:last-child {
            page-break-after: auto;
          }
          /* Header Styles */
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #d4a048;
          }
          .company-section {
            flex: 1;
          }
          .company-name {
            font-size: 26px;
            font-weight: 800;
            color: #0b1630;
            letter-spacing: -0.5px;
          }
          .company-tagline {
            font-size: 11px;
            color: #d4a048;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-top: 5px;
          }
          .company-details {
            font-size: 10px;
            color: #666;
            margin-top: 8px;
            line-height: 1.5;
          }
          .estimate-section {
            text-align: right;
            background: #f8f6f0;
            padding: 15px 20px;
            border-radius: 8px;
          }
          .estimate-title {
            font-size: 24px;
            font-weight: 800;
            color: #d4a048;
            letter-spacing: 2px;
          }
          .estimate-number {
            font-size: 12px;
            color: #0b1630;
            font-weight: bold;
            margin-top: 5px;
          }
          .estimate-date {
            font-size: 11px;
            color: #666;
            margin-top: 3px;
          }
          /* Section Styles */
          .section {
            margin-bottom: 25px;
          }
          .section-title {
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #0b1630;
            background: #f5f0e6;
            padding: 8px 12px;
            margin-bottom: 15px;
            border-left: 4px solid #d4a048;
          }
          /* Client Info Cards */
          .client-card {
            background: #fafaf8;
            padding: 20px;
            border-radius: 12px;
            border: 1px solid #e8e2d4;
          }
          .client-row {
            display: flex;
            margin-bottom: 8px;
            font-size: 11px;
          }
          .client-label {
            width: 100px;
            font-weight: 700;
            color: #0b1630;
          }
          .client-value {
            color: #444;
          }
          /* Summary Box */
          .summary-box {
            background: #ffffffff;
            padding: 20px;
            border-radius: 12px;
            color: #0b1630;
            font-size: 11px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
          }
          .summary-row:last-child {
            border-bottom: none;
          }
          .summary-label {
            font-weight: 600;
          }
          .summary-amount {
            font-weight: 700;
            font-size: 11px;
          }
          .total-row {
            background: #ecdfc9ff;
            margin-top: 10px;
            padding: 12px;
            // border-radius: 8px;
            color: #0b1630;
          }
          /* Table Styles */
          .project-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          .project-table th {
            background: #0b1630;
            color: white;
            padding: 10px;
            text-align: left;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .project-table td {
            padding: 10px;
            border-bottom: 1px solid #e8e2d4;
            font-size: 10px;
          }
          .project-table tr:hover {
            background: #fafaf8;
          }
          .project-total-box {
            background: #f5f0e6;
            padding: 12px;
            text-align: right;
            border-radius: 8px;
            margin-top: 10px;
          }
          .project-total {
            font-weight: 800;
            font-size: 14px;
            color: #0b1630;
          }
          /* Signature Section */
          .signature-section {
            display: flex;
            justify-content: space-between;
            margin: 30px 0;
            gap: 30px;
          }
          .signature-box {
            flex: 1;
            text-align: center;
          }
          .signature-line {
            border-bottom: 1px solid #0b1630;
            margin-top: 30px;
            margin-bottom: 5px;
          }
          .signature-label {
            font-size: 10px;
            color: #666;
          }
          /* Acknowledgment Boxes */
          .acknowledgment-box {
            background: #fafaf8;
            border: 1px solid #e8e2d4;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
          }
          .acknowledgment-title {
            font-size: 14px;
            font-weight: 800;
            color: #d4a048;
            margin-bottom: 12px;
            text-transform: uppercase;
          }
          .acknowledgment-text {
            font-size: 11px;
            color: #555;
            line-height: 1.5;
            margin-bottom: 15px;
          }
          .signature-field {
            display: flex;
            align-items: center;
            margin-top: 15px;
          }
          .signature-field-label {
            width: 140px;
            font-size: 10px;
            font-weight: 600;
            color: #0b1630;
          }
          .signature-field-line {
            flex: 1;
            border-bottom: 1px solid #0b1630;
            margin-left: 10px;
          }
          /* Terms Box */
          .terms-box {
            background: #fafaf8;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
          }
          .terms-title {
            font-size: 13px;
            font-weight: 700;
            color: #0b1630;
            margin-bottom: 12px;
          }
          .terms-list {
            list-style: none;
            padding: 0;
          }
          .terms-list li {
            font-size: 9px;
            color: #666;
            margin-bottom: 6px;
            padding-left: 16px;
            position: relative;
          }
          .terms-list li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #d4a048;
            font-weight: bold;
          }
          /* Footer */
          .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e8e2d4;
            font-size: 9px;
            color: #999;
          }
          /* Project Header */
          .project-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
          }
          .project-name {
            font-size: 16px;
            font-weight: 800;
            color: #0b1630;
          }
          .project-badge {
            background: #d4a048;
            color: #0b1630;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <button class="print-btn no-print" onclick="window.print()">🖨️ Save as PDF</button>

        <div class="document">
          <!-- PAGE 1 - Cover Page (All Formal Information) -->
          <div class="page">
            <div class="header">
              <div class="company-section">
                <div class="company-name">One Square Roofing LLC</div>
                <div class="company-tagline"> Insured</div>
                <div class="company-details">
                  123 Business Street<br>
                  Charlotte, NC 28202<br>
                  Phone: (704) 303-4112<br>
                  Email: onesquareroof@gmail.com
                </div>
              </div>
              <div class="estimate-section">
                <div class="estimate-title">ESTIMATE</div>
                <div class="estimate-number">#${estimate.estimate_number || estimate.id.slice(0, 8)}</div>
                <div class="estimate-date">Issued: ${formatDate(estimate.created_at)}</div>
                <div class="estimate-date">Valid Until: ${formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Customer Information</div>
              <div class="client-card">
                <div class="client-row">
                  <div class="client-label">Client Name:</div>
                  <div class="client-value">${client?.name || "No client"}</div>
                </div>
                <div class="client-row">
                  <div class="client-label">Phone Number:</div>
                  <div class="client-value">${client?.phone || "Not provided"}</div>
                </div>
                <div class="client-row">
                  <div class="client-label">Email Address:</div>
                  <div class="client-value">${client?.email || "Not provided"}</div>
                </div>
                <div class="client-row">
                  <div class="client-label">Service Address:</div>
                  <div class="client-value">${client?.address || "Not provided"}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Project Overview</div>
              <div style="background: #fafaf8; padding: 15px; border-radius: 8px; line-height: 1.6; font-size: 11px;">
                ${estimate.description || "Detailed scope of work outlined in the following pages."}
              </div>
            </div>

            <div class="section">
              <div class="section-title">Estimate Summary</div>
              <div class="summary-box">
                <div class="summary-row">
                  <span class="summary-label">Total Estimate Amount</span>
                  <span class="summary-amount">${formatCurrency(subtotal)}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Deposit Required (50%)</span>
                  <span class="summary-amount">${formatCurrency(depositAmount)}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Balance Due Upon Completion</span>
                  <span class="summary-amount">${formatCurrency(balanceAmount)}</span>
                </div>
                <div class="total-row">
                  <div style="display: flex; justify-content: space-between;">
                    <span style="font-weight: 800;">DUE TODAY</span>
                    <span style="font-weight: 800;">${formatCurrency(depositAmount)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              <p>Page 1 of ${projects.length + 3}</p>
            </div>
          </div>

          <!-- PROJECT PAGES (Each project on its own page with its details and subtotal) -->
          ${projectPagesHtml}

          <!-- FINAL PAGE - Summary of each project, grand total, and acknowledgment information -->
          <div class="page">
            <div class="section">
              <div class="section-title">Estimate Summary</div>
              
              <table class="project-table">
                <thead>
                  <tr>
                    <th style="width: 70%">Project Name</th>
                    <th style="width: 30%">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${projects.map(project => `
                    <tr>
                      <td>${project.name}</td>
                      <td style="text-align: right"><strong>${formatCurrency(project.total)}</strong></td>
                    </tr>
                  `).join("")}
                  <tr style="background: #f5f0e6; font-weight: 800;">
                    <td>GRAND TOTAL</td>
                    <td style="text-align: right">${formatCurrency(subtotal)}</td>
                  </tr>
                  <tr>
                    <td>Deposit Amount (50% due at signing)</td>
                    <td style="text-align: right">${formatCurrency(depositAmount)}</td>
                  </tr>
                  <tr>
                    <td>Final Payment (due upon completion)</td>
                    <td style="text-align: right">${formatCurrency(balanceAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="acknowledgment-box">
              <div class="acknowledgment-title"> DEPOSIT PAID ACKNOWLEDGMENT</div>
              <div class="acknowledgment-text">
                We, the undersigned, confirm that the deposit amount of ${formatCurrency(depositAmount)} has been paid 
                and received by One Square Roofing LLC. This deposit secures the commencement of work as outlined in this estimate.
              </div>
              <div class="signature-field">
                <span class="signature-field-label">Client / Owner Signature:</span>
                <div class="signature-field-line"></div>
              </div>
              <div class="signature-field">
                <span class="signature-field-label">Contractor Signature:</span>
                <div class="signature-field-line"></div>
              </div>
              <div class="signature-field">
                <span class="signature-field-label">Date:</span>
                <div class="signature-field-line"></div>
              </div>
            </div>

            <div class="acknowledgment-box">
              <div class="acknowledgment-title"> FINAL PAYMENT RECEIVED ACKNOWLEDGMENT</div>
              <div class="acknowledgment-text">
                We, the undersigned, confirm that the final payment of ${formatCurrency(balanceAmount)} has been received in full 
                and that all work outlined in this agreement has been completed to satisfaction. Any additional work or 
                changes requested after this acknowledgment may be subject to additional charges and will require a new agreement.
              </div>
              <div class="signature-field">
                <span class="signature-field-label">Client / Owner Signature:</span>
                <div class="signature-field-line"></div>
              </div>
              <div class="signature-field">
                <span class="signature-field-label">Contractor Signature:</span>
                <div class="signature-field-line"></div>
              </div>
              <div class="signature-field">
                <span class="signature-field-label">Date:</span>
                <div class="signature-field-line"></div>
              </div>
            </div>

            <div class="terms-box">
              <div class="terms-title">Terms & Conditions</div>
              <ul class="terms-list">
                <li>This estimate is valid for 30 days from the date issued.</li>
                <li>A 50% deposit is required to begin work. Remaining balance due upon completion.</li>
                <li>Any changes or additions to scope must be approved in writing and may incur additional charges.</li>
                <li>Client is responsible for providing safe access to work areas.</li>
                <li>Materials and labor are guaranteed for 1 year from completion date.</li>
                <li>By signing below, you agree to all terms and conditions stated in this estimate.</li>
              </ul>
            </div>

            <div class="footer">
              <p>One Square Roof LLC • (704) 303-4112 • onesquareroof@gmail.com</p>
              <p>Thank you for your business!</p>
              <p>Page ${projects.length + 3} of ${projects.length + 3}</p>
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