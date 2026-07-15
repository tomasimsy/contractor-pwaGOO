import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatCurrency, formatDate, pdfDocument, renderCompanyHeaderBlock, renderCompanyFooterBlock } from "@/lib/pdf/pdfLayout";
import { getCompanySettingsByCompanyId } from "@/lib/company";

// Subcontractor payment statement/invoice — one-click from the Payouts
// section of the Expense page once at least one payment has been
// recorded against an assignment. Reuses the same PDF layout/auth
// pattern as the estimate/invoice PDF routes (staff-facing, localStorage
// session forwarded as a Bearer token — see those routes for why).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // estimate_subcontractors.id

    const token = request.nextUrl.searchParams.get("token");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : undefined
    );

    const { data: assignment } = await supabase
      .from("estimate_subcontractors")
      .select("id, amount, notes, company_id, estimate_id, subcontractors(name, trade, phone, email), estimates(title, estimate_number)")
      .eq("id", id)
      .single();

    if (!assignment) {
      return new NextResponse("Not found", { status: 404 });
    }

    const sub = assignment.subcontractors as any;
    const estimate = assignment.estimates as any;

    const { data: paymentsData } = await supabase
      .from("subcontractor_payments")
      .select("*")
      .eq("estimate_subcontractor_id", id)
      .is("deleted_at", null)
      .order("payment_date", { ascending: true });
    const payments = paymentsData || [];

    const company = await getCompanySettingsByCompanyId(supabase, assignment.company_id);

    const assignedAmount = assignment.amount || 0;
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const remainingBalance = Math.max(assignedAmount - totalPaid, 0);
    const isPaidInFull = assignedAmount > 0 && remainingBalance <= 0.004;

    const html = pdfDocument({
      docTitle: `Payment Statement — ${sub?.name || "Subcontractor"}`,
      bodyHtml: `
        <div class="header">
          <div>
            ${renderCompanyHeaderBlock(company)}
          </div>
          <div>
            <div class="doc-title">PAYMENT STATEMENT</div>
            <div class="doc-meta">Issued ${formatDate(new Date().toISOString())}</div>
            ${isPaidInFull ? `<div class="status-badge">Paid in Full</div>` : ""}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Subcontractor</div>
          <div class="info-grid">
            <div class="info-col">
              <div class="info-row"><div class="info-label">Name</div><div class="info-value">${sub?.name || "Subcontractor"}</div></div>
              ${sub?.trade ? `<div class="info-row"><div class="info-label">Trade</div><div class="info-value">${sub.trade}</div></div>` : ""}
            </div>
            <div class="info-col">
              <div class="info-row"><div class="info-label">Phone</div><div class="info-value">${sub?.phone || "Not provided"}</div></div>
              <div class="info-row"><div class="info-label">Email</div><div class="info-value">${sub?.email || "Not provided"}</div></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Project</div>
          <div class="info-row"><div class="info-label">Project</div><div class="info-value">${estimate?.title || "Untitled Project"}</div></div>
          ${estimate?.estimate_number ? `<div class="info-row"><div class="info-label">Estimate #</div><div class="info-value">${estimate.estimate_number}</div></div>` : ""}
        </div>

        <div class="section">
          <div class="section-title">Payment History</div>
          ${payments.length ? `
            <table>
              <thead>
                <tr>
                  <th style="width:30%">Date</th>
                  <th style="width:30%">Method</th>
                  <th style="width:40%">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${payments.map(p => `
                  <tr>
                    <td>${formatDate(p.payment_date || p.created_at)}</td>
                    <td>${(p.payment_method || "-").replace("_", " ")}</td>
                    <td><strong>${formatCurrency(p.amount || 0)}</strong></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `<div class="empty-note">No payments recorded yet.</div>`}
        </div>

        <div class="section">
          <div class="section-title">Summary</div>
          <div class="summary-box">
            <div class="summary-row"><span>Assigned Amount</span><span>${formatCurrency(assignedAmount)}</span></div>
            <div class="summary-row muted"><span>Amount Paid to Date</span><span>${formatCurrency(totalPaid)}</span></div>
            <div class="summary-row balance"><span>${isPaidInFull ? "Paid in Full" : "Remaining Balance"}</span><span>${formatCurrency(remainingBalance)}</span></div>
          </div>
        </div>

        ${assignment.notes ? `
          <div class="section">
            <div class="section-title">Notes</div>
            <div style="font-size:11px; line-height:1.6; white-space: pre-wrap;">${assignment.notes}</div>
          </div>
        ` : ""}

        ${renderCompanyFooterBlock(company)}
      `,
    });

    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  } catch (error) {
    console.error("Subcontractor payout PDF error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}
