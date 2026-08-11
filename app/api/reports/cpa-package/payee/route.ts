import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServerAppServices } from "@/lib/services/server";
import { getCompanySettingsByCompanyId } from "@/lib/company";
import { pdfDocument, renderCompanyHeaderBlock, renderCompanyFooterBlock, formatCurrency, formatDate } from "@/lib/pdf/pdfLayout";
import type { PayeeStatement } from "@/lib/services/cpaPackageService";

/**
 * Per-payee Payment Statement — see docs/PAYEE_PAYMENT_STATEMENT.md.
 *
 * EXPLICITLY NOT AN IRS FORM 1099-NEC — see that doc's §1. An informal
 * "here's what we paid you this year" summary, built from the exact
 * same grouping/filter rules as the Payee Report
 * (CpaPackageService.getPayeeReport), for one payee at a time.
 *
 * Same staff-only, cookie-authenticated pattern as the parent CPA
 * package route — no external party this endpoint is meant to serve.
 *
 * `?year=2026` (required) `?key=` (required — a PayeeReportRow.groupKey,
 * opaque, treat as an id, never construct one by hand).
 *
 * PDF/print only, per the spec — no CSV. This is a document handed to
 * one person, not a spreadsheet.
 */
export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");
    const groupKey = request.nextUrl.searchParams.get("key");
    const taxYear = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }
    if (!groupKey) return NextResponse.json({ error: "Missing key" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    const companyId = profile?.company_id as string | undefined;
    if (!companyId) return NextResponse.json({ error: "User has no company" }, { status: 400 });

    const { cpaPackageService } = createServerAppServices(supabase, async () => user.id);
    const statement = await cpaPackageService.getPayeeStatement(companyId, taxYear, groupKey);
    if (!statement) return new NextResponse("No payments found for this payee in this tax year.", { status: 404 });

    const company = await getCompanySettingsByCompanyId(supabase, companyId);
    const html = pdfDocument({
      docTitle: `${statement.payeeName} — ${statement.isInternalLabor ? "Internal Labor Summary" : "Payment Summary"} ${taxYear}`,
      bodyHtml: renderStatementHtml(company, statement, taxYear),
    });
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    console.error("Payee statement export failed:", error);
    return NextResponse.json({ error: "Failed to build payee statement" }, { status: 500 });
  }
}

function renderStatementHtml(
  company: Awaited<ReturnType<typeof getCompanySettingsByCompanyId>>,
  statement: PayeeStatement,
  taxYear: number
): string {
  const docTitle = statement.isInternalLabor ? "INTERNAL LABOR SUMMARY" : "PAYMENT SUMMARY";
  return `
    <div class="header">
      <div>${renderCompanyHeaderBlock(company)}</div>
      <div>
        <div class="doc-title">${docTitle}</div>
        <div class="doc-meta"><strong>Tax Year:</strong> ${taxYear}<br>Prepared ${formatDate(new Date().toISOString())}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Paid To</div>
      <div class="info-row"><span class="info-label">Name</span><span class="info-value">${statement.payeeName}</span></div>
      <div class="info-row"><span class="info-label">Type</span><span class="info-value">${statement.isInternalLabor ? "Internal team labor" : statement.payeeType}</span></div>
    </div>

    <div class="section">
      <div class="section-title">Payments — ${taxYear}</div>
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Project</th><th>Amount</th></tr></thead>
        <tbody>
          ${statement.lineItems
            .map((li) => `<tr><td>${formatDate(li.date)}</td><td>${li.category}</td><td>${li.projectName ?? "—"}</td><td>${formatCurrency(li.amount)}</td></tr>`)
            .join("")}
        </tbody>
      </table>
      <div class="summary-box"><div class="summary-row total"><span>Total Paid, ${taxYear}</span><span>${formatCurrency(statement.totalPaid)}</span></div></div>
    </div>

    <p class="empty-note">
      This is a summary of payments for your records${statement.isInternalLabor ? "" : " and to assist with your own tax preparation"}.
      It is not an IRS Form 1099${statement.isInternalLabor ? " or W-2" : "-NEC"}.
    </p>

    ${renderCompanyFooterBlock(company)}
  `;
}
