"use client";

/**
 * Reports — the CPA Year-End Package. Replaces the placeholder that
 * stood here.
 *
 * THIS PAGE COMPUTES NOTHING. It previews CpaPackageService.getPackage
 * (lib/services/cpaPackageService.ts) — itself pure composition over
 * ExpenseService/PaymentService/InvoiceService reads, cash-basis only,
 * never FinancialEngine's committed-cost model — and links to
 * /api/reports/cpa-package for the actual downloads (CSV per report,
 * one combined printable HTML page for the three summary reports plus
 * the company cover page). See docs/CPA_YEAR_END_PACKAGE.md for the
 * full, approved data contract this implements.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Printer, AlertTriangle, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { CpaYearEndPackage, PayeeReportRow } from "@/lib/services/cpaPackageService";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);
}

function currentYearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2, current - 3];
}

function SummaryCard({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <PageContainer>
      <CpaPackageContent />
    </PageContainer>
  );
}

function CpaPackageContent() {
  const { cpaPackageService } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;

  const [taxYear, setTaxYear] = useState<number>(new Date().getFullYear());
  const [pkg, setPkg] = useState<CpaYearEndPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      setPkg(await cpaPackageService.getPackage(companyId, taxYear));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build the CPA package.");
    } finally {
      setLoading(false);
    }
  }, [companyId, taxYear, cpaPackageService]);

  useEffect(() => {
    load();
  }, [load]);

  const yearOptions = useMemo(currentYearOptions, []);

  const downloadHref = (format: string) => `/api/reports/cpa-package?year=${taxYear}&format=${format}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Year-End CPA Package</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Cash-basis income, expenses, and payee totals for handing to your accountant. See{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">docs/CPA_YEAR_END_PACKAGE.md</code> for exactly what
            each report contains and why.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="tax-year" className="text-xs font-medium text-muted-foreground">
            Tax Year
          </label>
          <select
            id="tax-year"
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !pkg && <p className="text-sm text-muted-foreground">Loading…</p>}

      {pkg && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Cash Collected (taxable)" value={formatCurrency(pkg.income.totalCashCollected)} />
            <SummaryCard label="Paid Expenses" value={formatCurrency(pkg.expenses.grandTotal)} />
            <SummaryCard label="Total Paid to Payees" value={formatCurrency(pkg.payees.grandTotal)} muted />
            <SummaryCard label="Net Profit/Loss (cash basis)" value={formatCurrency(pkg.netProfitLoss)} />
          </div>
          <p className="-mt-3 text-[11px] text-muted-foreground">
            Net Profit/Loss = cash collected − paid expenses. Not the same as the app&apos;s project-level net profit, which
            also counts committed-but-unpaid subcontractor/agent/team-labor costs.
          </p>

          <CollapsibleReportCard
            title="1. Income Summary"
            description="Cash collected by month, plus informational invoiced/outstanding totals."
            csvHref={downloadHref("income")}
            defaultOpen
          >
            <div className="mb-3 flex flex-wrap gap-4 text-xs">
              <span className="text-muted-foreground">
                Total Invoiced (informational): <strong className="text-foreground">{formatCurrency(pkg.income.totalInvoiced)}</strong>
              </span>
              <span className="text-muted-foreground">
                Outstanding Receivables (informational): <strong className="text-foreground">{formatCurrency(pkg.income.outstandingReceivables)}</strong>
              </span>
            </div>
            {pkg.income.byMonth.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-3">Month</th>
                    <th className="py-1.5 pr-3 text-right">Cash Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.income.byMonth.map((r) => (
                    <tr key={r.month} className="border-b border-border/60 last:border-0">
                      <td className="py-1.5 pr-3 text-foreground">{r.month}</td>
                      <td className="py-1.5 pr-3 text-right font-medium text-foreground">{formatCurrency(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">No payments recorded for {taxYear}.</p>
            )}
          </CollapsibleReportCard>

          <CollapsibleReportCard
            title="2. Expense Summary by Category"
            description="Paid expenses grouped by category — materials, labor, subcontractor, and the rest."
            csvHref={downloadHref("expenses")}
            defaultOpen
          >
            {pkg.expenses.categories.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-3">Category</th>
                    <th className="py-1.5 pr-3 text-right">Total Paid</th>
                    <th className="py-1.5 pr-3 text-right">Count</th>
                    <th className="py-1.5 pl-3 text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.expenses.categories.map((c) => (
                    <tr key={c.category} className="border-b border-border/60 last:border-0">
                      <td className="py-1.5 pr-3 text-foreground">{c.category}</td>
                      <td className="py-1.5 pr-3 text-right font-medium text-foreground">{formatCurrency(c.totalPaid)}</td>
                      <td className="py-1.5 pr-3 text-right text-muted-foreground">{c.count}</td>
                      <td className="py-1.5 pl-3 text-right text-muted-foreground">{c.percentOfTotal.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">No paid expenses recorded for {taxYear}.</p>
            )}
          </CollapsibleReportCard>

          <PayeeReportSection rows={pkg.payees.rows} taxYear={taxYear} csvHref={downloadHref("payees")} />

          <CollapsibleReportCard
            title="4. Detailed Transaction Report"
            description="Every payment received and every expense paid or unpaid — the full ledger behind the totals above."
            csvHref={downloadHref("transactions")}
          >
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Section A — Money Received ({pkg.transactions.moneyReceived.length})
                </div>
                {pkg.transactions.moneyReceived.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pr-3">Date</th>
                          <th className="py-1.5 pr-3">Client</th>
                          <th className="py-1.5 pr-3">Invoice #</th>
                          <th className="py-1.5 pr-3">Project</th>
                          <th className="py-1.5 pr-3 text-right">Amount</th>
                          <th className="py-1.5 pl-3">Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pkg.transactions.moneyReceived.map((r, i) => (
                          <tr key={i} className="border-b border-border/60 last:border-0">
                            <td className="py-1.5 pr-3 text-foreground">{r.date}</td>
                            <td className="py-1.5 pr-3 text-foreground">{r.clientName}</td>
                            <td className="py-1.5 pr-3 text-muted-foreground">{r.invoiceNumber}</td>
                            <td className="py-1.5 pr-3 text-muted-foreground">{r.projectName ?? "—"}</td>
                            <td className="py-1.5 pr-3 text-right font-medium text-foreground">{formatCurrency(r.amount)}</td>
                            <td className="py-1.5 pl-3 text-muted-foreground">{r.method}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No payments received for {taxYear}.</p>
                )}
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Section B — Money Paid ({pkg.transactions.moneyPaid.length})
                </div>
                {pkg.transactions.moneyPaid.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pr-3">Date</th>
                          <th className="py-1.5 pr-3">Payee</th>
                          <th className="py-1.5 pr-3">Category</th>
                          <th className="py-1.5 pr-3">Project</th>
                          <th className="py-1.5 pr-3 text-right">Amount</th>
                          <th className="py-1.5 pl-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pkg.transactions.moneyPaid.map((r, i) => (
                          <tr key={i} className="border-b border-border/60 last:border-0">
                            <td className="py-1.5 pr-3 text-foreground">{r.date}</td>
                            <td className="py-1.5 pr-3 text-foreground">{r.payee}</td>
                            <td className="py-1.5 pr-3 text-muted-foreground">{r.category}</td>
                            <td className="py-1.5 pr-3 text-muted-foreground">{r.projectName ?? "—"}</td>
                            <td className="py-1.5 pr-3 text-right font-medium text-foreground">{formatCurrency(r.amount)}</td>
                            <td className="py-1.5 pl-3">
                              {r.isPaid ? (
                                <span className="text-muted-foreground">Paid</span>
                              ) : (
                                <span className="font-semibold text-amber-600">Unpaid</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No expenses recorded for {taxYear}.</p>
                )}
              </div>
            </div>
          </CollapsibleReportCard>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <a
              href={downloadHref("profit-loss-csv")}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <FileDown className="size-4" />
              Profit &amp; Loss (CSV)
            </a>
            <a
              href={downloadHref("profit-loss")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Printer className="size-4" />
              Profit &amp; Loss (Print / PDF)
            </a>
            <a
              href={downloadHref("print")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Printer className="size-4" />
              Open Full Package (Print / Save as PDF)
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The Payee Report row, plus a per-payee "Statement" link and a
 * "Generate All" action — see docs/PAYEE_PAYMENT_STATEMENT.md. Each
 * statement is its own printable page at
 * /api/reports/cpa-package/payee, keyed by the row's own groupKey
 * (opaque; never constructed here, only passed through).
 *
 * Rows with no groupKey (the "(Unspecified Payee)" bucket) get no
 * link — there's no one to send that statement to.
 */
function PayeeReportSection({ rows, taxYear, csvHref }: { rows: PayeeReportRow[]; taxYear: number; csvHref: string }) {
  const statementHref = (groupKey: string) => `/api/reports/cpa-package/payee?year=${taxYear}&key=${encodeURIComponent(groupKey)}`;
  const statementRows = rows.filter((r) => r.groupKey);

  function generateAll() {
    // One tab per payee — acceptable for a year-end, once-a-year action;
    // no email-sending in v1 (see the spec's §5). Browsers may block
    // some of these as popups if triggered outside a direct click, but
    // this runs from a click handler, which every major browser allows.
    for (const row of statementRows) {
      if (row.groupKey) window.open(statementHref(row.groupKey), "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">3. Payee Report</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Every subcontractor, agent, employee, and vendor actually paid this tax year, and how much.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statementRows.length > 0 && (
            <button
              type="button"
              onClick={generateAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <FileText className="size-3.5" />
              Generate All Statements ({statementRows.length})
            </button>
          )}
          <a
            href={csvHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <FileDown className="size-3.5" />
            Download CSV
          </a>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3">Payee</th>
                <th className="py-1.5 pr-3">Type</th>
                <th className="py-1.5 pr-3 text-right">Total Paid</th>
                <th className="py-1.5 pl-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.groupKey ?? row.payeeName} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-3 text-foreground">{row.payeeName}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {row.isInternalLabor ? "Internal labor — not a 1099 candidate" : row.payeeType}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium text-foreground">{formatCurrency(row.totalPaid)}</td>
                  <td className="py-1.5 pl-3 text-right">
                    {row.groupKey ? (
                      <a
                        href={statementHref(row.groupKey)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Statement
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * A report card that shows its data inline, right in the browser — no
 * download required to see it. The CSV link stays as an EXPORT option
 * for handing to a CPA, not the only way to view the report.
 */
function CollapsibleReportCard({
  title,
  description,
  csvHref,
  defaultOpen,
  children,
}: {
  title: string;
  description: string;
  csvHref: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {open ? "Hide" : "View"}
          </button>
          <a
            href={csvHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <FileDown className="size-3.5" />
            Download CSV
          </a>
        </div>
      </div>
      {open && <div className="mt-3 overflow-x-auto">{children}</div>}
    </div>
  );
}
