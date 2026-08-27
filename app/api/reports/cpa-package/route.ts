import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServerAppServices } from "@/lib/services/server";
import { exportToCSV, type ExportColumn } from "@/lib/services/exportService";
import { getCompanySettingsByCompanyId } from "@/lib/company";
import {
  pdfDocument,
  renderCompanyHeaderBlock,
  renderCompanyFooterBlock,
  formatCurrency,
  formatDate,
} from "@/lib/pdf/pdfLayout";
import type {
  IncomeSummary,
  ExpenseSummary,
  PayeeReport,
  IncomeSummaryMonthRow,
  ExpenseCategoryRow,
  PayeeReportRow,
  MoneyReceivedRow,
  MoneyPaidRow,
} from "@/lib/services/cpaPackageService";

/**
 * CPA Year-End Package — download endpoint. Implements
 * docs/CPA_YEAR_END_PACKAGE.md exactly: staff-only, cookie-authenticated
 * (same pattern as app/api/company-documents/upload/route.ts), never the
 * anon+Bearer pattern the customer-facing estimate/invoice PDF routes
 * use, since there is no external party this endpoint is meant to serve.
 *
 * `?year=2026` (required) selects the tax year.
 * `?format=` one of:
 *   - "income" | "expenses" | "payees" | "transactions" -> CSV download
 *   - "print" -> printable HTML (Income Summary, Expense Summary, Payee
 *     Report, and the company cover page — the three PDF-bearing
 *     reports plus the cover, per the spec; the Detailed Transaction
 *     Report is CSV-only by design, see the spec's §"Recommended export
 *     format")
 *
 * All four reports and the cover page are built from ONE
 * CpaPackageService.getPackage() call plus one company-settings read —
 * no calculation happens in this route.
 */
export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");
    const format = request.nextUrl.searchParams.get("format") ?? "print";
    const taxYear = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    const companyId = profile?.company_id as string | undefined;
    if (!companyId) return NextResponse.json({ error: "User has no company" }, { status: 400 });

    const { cpaPackageService } = createServerAppServices(supabase, async () => user.id);
    const pkg = await cpaPackageService.getPackage(companyId, taxYear);

    if (format === "income") return csvResponse(incomeToCSV(pkg.income), `income-summary-${taxYear}.csv`);
    if (format === "expenses") return csvResponse(expensesToCSV(pkg.expenses), `expense-summary-${taxYear}.csv`);
    if (format === "payees") return csvResponse(payeesToCSV(pkg.payees), `payee-report-${taxYear}.csv`);
    if (format === "transactions")
      return csvResponse(transactionsToCSV(pkg.transactions.moneyReceived, pkg.transactions.moneyPaid), `detailed-transactions-${taxYear}.csv`);

    if (format === "print") {
      const company = await getCompanySettingsByCompanyId(supabase, companyId);
      const html = pdfDocument({
        docTitle: `${company.company_name} — Year-End Financial Package ${taxYear}`,
        bodyHtml: renderPackageHtml(company, pkg.income, pkg.expenses, pkg.payees, pkg.netProfitLoss, taxYear, request.nextUrl.origin),
      });
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Standalone Income / Expense / Profit & Loss summary — a subset of
    // the full package's print view (no payees, no transaction detail),
    // for when only the top-line P&L is wanted, not the whole package.
    if (format === "profit-loss") {
      const company = await getCompanySettingsByCompanyId(supabase, companyId);
      const html = pdfDocument({
        docTitle: `${company.company_name} — Profit & Loss ${taxYear}`,
        bodyHtml: renderProfitAndLossHtml(company, pkg.income, pkg.expenses, pkg.netProfitLoss, taxYear, request.nextUrl.origin),
      });
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (format === "profit-loss-csv") return csvResponse(profitAndLossToCSV(pkg.income, pkg.expenses, pkg.netProfitLoss), `profit-and-loss-${taxYear}.csv`);

    return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  } catch (error) {
    console.error("CPA package export failed:", error);
    return NextResponse.json({ error: "Failed to build CPA package" }, { status: 500 });
  }
}

function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ------------------------------------------------------------
// CSV column definitions — one row-set per report, per the data
// contract in docs/CPA_YEAR_END_PACKAGE.md. No calculation here, only
// column selection/formatting.
// ------------------------------------------------------------

function incomeToCSV(income: IncomeSummary): string {
  const columns: ExportColumn<IncomeSummaryMonthRow>[] = [
    { header: "Month", value: (r) => r.month },
    { header: "Cash Collected", value: (r) => r.amount },
  ];
  const monthly = exportToCSV(income.byMonth, columns);
  const summary = [
    "",
    "Summary",
    `Total Cash Collected (taxable),${income.totalCashCollected}`,
    `Total Invoiced (accrual, informational),${income.totalInvoiced}`,
    `Outstanding Receivables at year-end (informational),${income.outstandingReceivables}`,
  ].join("\n");
  return `${monthly}\n${summary}`;
}

function expensesToCSV(expenses: ExpenseSummary): string {
  const columns: ExportColumn<ExpenseCategoryRow>[] = [
    { header: "Category", value: (r) => r.category },
    { header: "Total Paid", value: (r) => r.totalPaid },
    { header: "Count", value: (r) => r.count },
    { header: "% of Total", value: (r) => r.percentOfTotal.toFixed(1) },
  ];
  const csv = exportToCSV(expenses.categories, columns);
  return `${csv}\n\nGrand Total,${expenses.grandTotal}`;
}

function payeesToCSV(payees: PayeeReport): string {
  const columns: ExportColumn<PayeeReportRow>[] = [
    { header: "Payee Name", value: (r) => r.payeeName },
    { header: "Payee Type", value: (r) => (r.isInternalLabor ? "employee (internal labor — not a 1099 candidate)" : r.payeeType) },
    { header: "Total Paid", value: (r) => r.totalPaid },
    { header: "Payment Count", value: (r) => r.paymentCount },
  ];
  const csv = exportToCSV(payees.rows, columns);
  return `${csv}\n\nGrand Total,${payees.grandTotal}`;
}

function transactionsToCSV(received: MoneyReceivedRow[], paid: MoneyPaidRow[]): string {
  const receivedColumns: ExportColumn<MoneyReceivedRow>[] = [
    { header: "Date", value: (r) => r.date },
    { header: "Client", value: (r) => r.clientName },
    { header: "Invoice #", value: (r) => r.invoiceNumber },
    { header: "Project", value: (r) => r.projectName },
    { header: "Amount", value: (r) => r.amount },
    { header: "Method", value: (r) => r.method },
    { header: "Reference #", value: (r) => r.referenceNumber },
  ];
  const paidColumns: ExportColumn<MoneyPaidRow>[] = [
    { header: "Date", value: (r) => r.date },
    { header: "Payee", value: (r) => r.payee },
    { header: "Payee Type", value: (r) => r.payeeType },
    { header: "Category", value: (r) => r.category },
    { header: "Amount", value: (r) => r.amount },
    { header: "Method", value: (r) => r.method },
    { header: "Project", value: (r) => r.projectName },
    { header: "Paid?", value: (r) => (r.isPaid ? "Yes" : "No — unpaid, excluded from totals") },
    { header: "Reimbursement Status", value: (r) => r.reimbursementStatus },
  ];
  return [
    "SECTION A — MONEY RECEIVED (from customers)",
    exportToCSV(received, receivedColumns),
    "",
    "SECTION B — MONEY PAID (by the company)",
    exportToCSV(paid, paidColumns),
  ].join("\n");
}

function profitAndLossToCSV(income: IncomeSummary, expenses: ExpenseSummary, netProfitLoss: number): string {
  const incomeColumns: ExportColumn<IncomeSummaryMonthRow>[] = [
    { header: "Month", value: (r) => r.month },
    { header: "Cash Collected", value: (r) => r.amount },
  ];
  const expenseColumns: ExportColumn<ExpenseCategoryRow>[] = [
    { header: "Category", value: (r) => r.category },
    { header: "Total Paid", value: (r) => r.totalPaid },
  ];
  return [
    "INCOME (cash basis)",
    exportToCSV(income.byMonth, incomeColumns),
    `Total Cash Collected,${income.totalCashCollected}`,
    "",
    "EXPENSES (paid, cash basis)",
    exportToCSV(expenses.categories, expenseColumns),
    `Total Paid Expenses,${expenses.grandTotal}`,
    "",
    "PROFIT & LOSS",
    `Net Profit/Loss,${netProfitLoss}`,
  ].join("\n");
}

// ------------------------------------------------------------
// Print/PDF view — reuses lib/pdf/pdfLayout.ts wholesale, same as the
// estimate/invoice PDF routes, so this stays visually consistent with
// the rest of the app's documents.
// ------------------------------------------------------------

function renderPackageHtml(
  company: Awaited<ReturnType<typeof getCompanySettingsByCompanyId>>,
  income: IncomeSummary,
  expenses: ExpenseSummary,
  payees: PayeeReport,
  netProfitLoss: number,
  taxYear: number,
  origin: string
): string {
  return `
    <div class="header">
      <div>${renderCompanyHeaderBlock(company, origin)}</div>
      <div>
        <div class="doc-title">YEAR-END PACKAGE</div>
        <div class="doc-meta"><strong>Tax Year:</strong> ${taxYear}<br>Prepared ${formatDate(new Date().toISOString())}</div>
      </div>
    </div>

    <div class="section">
      <div class="summary-box">
        <div class="summary-row balance">
          <span>Net Profit/Loss (cash basis: cash collected − paid expenses)</span>
          <span>${formatCurrency(netProfitLoss)}</span>
        </div>
      </div>
      <p class="empty-note">
        Cash-basis only — not the same figure as the app's project-level "net profit," which also counts committed-but-unpaid
        subcontractor/agent/team-labor costs. See docs/CPA_YEAR_END_PACKAGE.md.
      </p>
    </div>

    <div class="section">
      <div class="section-title">Company Information</div>
      <div class="info-grid">
        <div class="info-col">
          <div class="info-row"><span class="info-label">Legal Name</span><span class="info-value">${company.company_name}${company.dba ? ` (DBA ${company.dba})` : ""}</span></div>
          <div class="info-row"><span class="info-label">Business Type</span><span class="info-value">${company.business_type || "Not set"}</span></div>
          <div class="info-row"><span class="info-label">EIN / Tax ID</span><span class="info-value">${company.tax_id || "Not set"}</span></div>
        </div>
        <div class="info-col">
          <div class="info-row"><span class="info-label">Address</span><span class="info-value">${company.company_address}</span></div>
          <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${company.company_phone}</span></div>
          <div class="info-row"><span class="info-label">Email</span><span class="info-value">${company.company_email}</span></div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Income Summary (cash basis)</div>
      <div class="summary-box">
        <div class="summary-row total"><span>Total Cash Collected (taxable)</span><span>${formatCurrency(income.totalCashCollected)}</span></div>
        <div class="summary-row muted"><span>Total Invoiced (accrual, informational)</span><span>${formatCurrency(income.totalInvoiced)}</span></div>
        <div class="summary-row muted"><span>Outstanding Receivables at year-end (informational)</span><span>${formatCurrency(income.outstandingReceivables)}</span></div>
      </div>
      ${
        income.byMonth.length > 0
          ? `<table><thead><tr><th>Month</th><th>Cash Collected</th></tr></thead><tbody>${income.byMonth
              .map((r) => `<tr><td>${r.month}</td><td>${formatCurrency(r.amount)}</td></tr>`)
              .join("")}</tbody></table>`
          : `<p class="empty-note">No payments recorded for ${taxYear}.</p>`
      }
    </div>

    <div class="section">
      <div class="section-title">Expense Summary by Category (paid, cash basis)</div>
      ${
        expenses.categories.length > 0
          ? `<table><thead><tr><th>Category</th><th>Total Paid</th><th>Count</th><th>% of Total</th></tr></thead><tbody>${expenses.categories
              .map((c) => `<tr><td>${c.category}</td><td>${formatCurrency(c.totalPaid)}</td><td>${c.count}</td><td>${c.percentOfTotal.toFixed(1)}%</td></tr>`)
              .join("")}</tbody></table>`
          : `<p class="empty-note">No paid expenses recorded for ${taxYear}.</p>`
      }
      <div class="summary-box"><div class="summary-row total"><span>Grand Total</span><span>${formatCurrency(expenses.grandTotal)}</span></div></div>
    </div>

    <div class="section">
      <div class="section-title">Payee Report (paid, cash basis)</div>
      ${
        payees.rows.length > 0
          ? `<table><thead><tr><th>Payee</th><th>Type</th><th>Total Paid</th><th># Payments</th></tr></thead><tbody>${payees.rows
              .map(
                (r) =>
                  `<tr><td>${r.payeeName}</td><td>${r.isInternalLabor ? "Internal labor — not a 1099 candidate" : r.payeeType}</td><td>${formatCurrency(r.totalPaid)}</td><td>${r.paymentCount}</td></tr>`
              )
              .join("")}</tbody></table>`
          : `<p class="empty-note">No paid payees recorded for ${taxYear}.</p>`
      }
      <div class="summary-box"><div class="summary-row total"><span>Grand Total</span><span>${formatCurrency(payees.grandTotal)}</span></div></div>
      <p class="empty-note">Full transaction-level detail (including unpaid bills) is available in the separate Detailed Transaction Report CSV export.</p>
    </div>

    ${renderCompanyFooterBlock(company)}
  `;
}

/**
 * Standalone Income / Expense / Profit & Loss summary — a focused
 * one-page document for when only the top-line P&L is wanted, not the
 * full four-report package. Same data, same cash-basis rules, just
 * income + expenses + the net figure and nothing else (no payees, no
 * transaction-level detail).
 */
function renderProfitAndLossHtml(
  company: Awaited<ReturnType<typeof getCompanySettingsByCompanyId>>,
  income: IncomeSummary,
  expenses: ExpenseSummary,
  netProfitLoss: number,
  taxYear: number,
  origin: string
): string {
  return `
    <div class="header">
      <div>${renderCompanyHeaderBlock(company, origin)}</div>
      <div>
        <div class="doc-title">PROFIT &amp; LOSS</div>
        <div class="doc-meta"><strong>Tax Year:</strong> ${taxYear}<br>Prepared ${formatDate(new Date().toISOString())}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Income (cash basis)</div>
      <div class="summary-box">
        <div class="summary-row total"><span>Total Cash Collected (taxable)</span><span>${formatCurrency(income.totalCashCollected)}</span></div>
        <div class="summary-row muted"><span>Total Invoiced (accrual, informational)</span><span>${formatCurrency(income.totalInvoiced)}</span></div>
        <div class="summary-row muted"><span>Outstanding Receivables at year-end (informational)</span><span>${formatCurrency(income.outstandingReceivables)}</span></div>
      </div>
      ${
        income.byMonth.length > 0
          ? `<table><thead><tr><th>Month</th><th>Cash Collected</th></tr></thead><tbody>${income.byMonth
              .map((r) => `<tr><td>${r.month}</td><td>${formatCurrency(r.amount)}</td></tr>`)
              .join("")}</tbody></table>`
          : `<p class="empty-note">No payments recorded for ${taxYear}.</p>`
      }
    </div>

    <div class="section">
      <div class="section-title">Expenses (paid, cash basis)</div>
      ${
        expenses.categories.length > 0
          ? `<table><thead><tr><th>Category</th><th>Total Paid</th><th>Count</th><th>% of Total</th></tr></thead><tbody>${expenses.categories
              .map((c) => `<tr><td>${c.category}</td><td>${formatCurrency(c.totalPaid)}</td><td>${c.count}</td><td>${c.percentOfTotal.toFixed(1)}%</td></tr>`)
              .join("")}</tbody></table>`
          : `<p class="empty-note">No paid expenses recorded for ${taxYear}.</p>`
      }
      <div class="summary-box"><div class="summary-row total"><span>Total Paid Expenses</span><span>${formatCurrency(expenses.grandTotal)}</span></div></div>
    </div>

    <div class="section">
      <div class="section-title">Profit &amp; Loss</div>
      <div class="summary-box">
        <div class="summary-row balance">
          <span>Net Profit/Loss (cash collected − paid expenses)</span>
          <span>${formatCurrency(netProfitLoss)}</span>
        </div>
      </div>
      <p class="empty-note">
        Cash-basis only — not the same figure as the app's project-level "net profit," which also counts committed-but-unpaid
        subcontractor/agent/team-labor costs. See docs/CPA_YEAR_END_PACKAGE.md.
      </p>
    </div>

    ${renderCompanyFooterBlock(company)}
  `;
}
