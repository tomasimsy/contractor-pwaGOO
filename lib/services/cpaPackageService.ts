/**
 * Layer 3 — the CPA Year-End Package. Pure composition over
 * ExpenseService/PaymentService/InvoiceService/ProjectService/
 * ClientService reads; computes nothing FinancialEngine or
 * financialCalculations.ts doesn't already own, and does not call
 * FinancialEngine at all.
 *
 * That last point is deliberate, not an oversight: FinancialEngine's
 * project/estimate figures are COMMITTED-cost (an unpaid subcontractor
 * contract counts the moment it's assigned — see calculateJobProfit).
 * This package is strictly CASH-BASIS (only money that has actually
 * moved) per docs/CPA_YEAR_END_PACKAGE.md — a fundamentally different
 * inclusion rule, not a stricter or looser version of the same one.
 * Reusing FinancialEngine here would silently blend two incompatible
 * models into one report.
 *
 * See docs/CPA_YEAR_END_PACKAGE.md for the full, approved data
 * contract this file implements column-for-column. Do not change the
 * rules here without updating that document first.
 */
import type { UUID } from "./types";
import type { ExpenseService, Expense, ExpenseType } from "./expenseService";
import type { PaymentService, CustomerPayment } from "./paymentService";
import type { InvoiceService, Invoice } from "./invoiceService";
import type { ProjectService } from "./projectService";
import type { ClientService } from "./clientService";
import { isRevenueInvoice } from "./financialEngine";

export interface CpaPackageDeps {
  expenseService: ExpenseService;
  paymentService: PaymentService;
  invoiceService: InvoiceService;
  projectService: ProjectService;
  clientService: ClientService;
}

/** Inclusive `[YYYY-01-01, YYYY-12-31]` string comparison — same
 * lexicographic technique financialEngine.ts's own `withinRange` uses,
 * intentionally reimplemented here (not imported) since that function
 * isn't exported and this file must not reach into FinancialEngine's
 * internals. Dates are stored as `YYYY-MM-DD`, so this is exact with
 * no timezone conversion. */
function inTaxYear(date: string | null, taxYear: number): boolean {
  if (!date) return false;
  const day = date.slice(0, 10);
  return day >= `${taxYear}-01-01` && day <= `${taxYear}-12-31`;
}

const money = (n: number) => Math.round(n * 100) / 100;

// ============================================================
// Report 1 — Income Summary
// ============================================================

export interface IncomeSummaryMonthRow {
  month: string; // YYYY-MM
  amount: number;
}

export interface IncomeSummary {
  taxYear: number;
  /** Informational only — accrual, billed amount. Never the taxable
   * figure. Void/cancelled invoices excluded via isRevenueInvoice. */
  totalInvoiced: number;
  /** THE taxable figure — cash actually collected, dated by
   * CustomerPayment.paymentDate, regardless of the invoice's status
   * (a payment against a later-voided invoice still counts: the cash
   * moved — see docs/CPA_YEAR_END_PACKAGE.md §5, v1 decision 2). */
  totalCashCollected: number;
  /** Snapshot as of Dec 31 of the tax year — informational, not part
   * of taxable income. */
  outstandingReceivables: number;
  byMonth: IncomeSummaryMonthRow[];
}

async function getIncomeSummary(deps: CpaPackageDeps, companyId: UUID, taxYear: number): Promise<IncomeSummary> {
  const [invoices, payments] = await Promise.all([
    deps.invoiceService.listForCompany({ companyId }),
    deps.paymentService.listForCompany({ companyId }),
  ]);

  const revenueInvoices = invoices.filter(isRevenueInvoice);
  const totalInvoiced = money(
    revenueInvoices
      .filter((inv) => inTaxYear(inv.issueDate ?? inv.createdAt, taxYear))
      .reduce((sum, inv) => sum + inv.total, 0)
  );

  // paymentService.listForCompany already excludes deleted rows — same
  // contract as every other listForCompany in this codebase.
  const yearPayments = payments.filter((p) => inTaxYear(p.paymentDate, taxYear));
  const totalCashCollected = money(yearPayments.reduce((sum, p) => sum + p.amount, 0));

  const paidByInvoice = new Map<UUID, number>();
  for (const p of payments) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);
  const outstandingReceivables = money(
    revenueInvoices.reduce((sum, inv) => sum + Math.max(0, inv.total - (paidByInvoice.get(inv.id) ?? 0)), 0)
  );

  const byMonthMap = new Map<string, number>();
  for (const p of yearPayments) {
    const month = p.paymentDate.slice(0, 7);
    byMonthMap.set(month, (byMonthMap.get(month) ?? 0) + p.amount);
  }
  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount: money(amount) }));

  return { taxYear, totalInvoiced, totalCashCollected, outstandingReceivables, byMonth };
}

// ============================================================
// Report 2 — Expense Summary by Category
// ============================================================

export interface ExpenseCategoryRow {
  category: ExpenseType;
  totalPaid: number;
  count: number;
  percentOfTotal: number;
}

export interface ExpenseSummary {
  taxYear: number;
  grandTotal: number;
  categories: ExpenseCategoryRow[];
}

/** Paid, active, in-year expense rows — the one filter every report in
 * this package that touches expense cost applies identically, so
 * Reports 2, 3, and 4-Section-B can never quietly diverge on which
 * rows they're looking at. */
function paidExpensesInYear(expenses: Expense[], taxYear: number): Expense[] {
  return expenses.filter((e) => e.isPaid && inTaxYear(e.expenseDate, taxYear));
}

async function getExpenseSummary(deps: CpaPackageDeps, companyId: UUID, taxYear: number): Promise<ExpenseSummary> {
  const expenses = await deps.expenseService.listForCompany(companyId);
  const paid = paidExpensesInYear(expenses, taxYear);

  const byType = new Map<ExpenseType, { total: number; count: number }>();
  for (const e of paid) {
    const row = byType.get(e.expenseType) ?? { total: 0, count: 0 };
    row.total += e.amount;
    row.count += 1;
    byType.set(e.expenseType, row);
  }

  const grandTotal = money(Array.from(byType.values()).reduce((sum, r) => sum + r.total, 0));
  const categories = Array.from(byType.entries())
    .map(([category, r]) => ({
      category,
      totalPaid: money(r.total),
      count: r.count,
      percentOfTotal: grandTotal > 0 ? money((r.total / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid);

  return { taxYear, grandTotal, categories };
}

// ============================================================
// Report 3 — Payee Report
// ============================================================

export type PayeeReportGroup = "subcontractor" | "agent" | "employee" | "vendor" | "other" | "unspecified";

export interface PayeeReportRow {
  payeeName: string;
  payeeType: PayeeReportGroup;
  /** Null for the vendor/unspecified buckets, which group by name
   * rather than a structured id — see docs/CPA_YEAR_END_PACKAGE.md §3,
   * Report 3's grouping rule. */
  payeeId: UUID | null;
  totalPaid: number;
  paymentCount: number;
  /** True for payeeType === "employee" rows — the UI/export MUST label
   * these as internal labor cost, never let them read as an ordinary
   * 1099 candidate alongside subcontractors/agents/vendors. */
  isInternalLabor: boolean;
  /** Opaque, URL-safe identifier for this exact group — pass straight
   * through to getPayeeStatement. Never parse this string for meaning;
   * treat it as an id. Absent for the "(Unspecified Payee)" bucket,
   * which has no statement (see docs/PAYEE_PAYMENT_STATEMENT.md §2 —
   * there's no one to send it to). */
  groupKey: string | null;
}

export interface PayeeReport {
  taxYear: number;
  grandTotal: number;
  rows: PayeeReportRow[];
}

const UNSPECIFIED_PAYEE_LABEL = "(Unspecified Payee)";

/** payeeType on an Expense is nullable and includes "other" as its own
 * value — v1 decision 3 (docs/CPA_YEAR_END_PACKAGE.md §5) collapses
 * null into "other" for display; it is never its own bucket. */
function normalizePayeeType(payeeType: Expense["payeeType"]): PayeeReportGroup {
  if (payeeType === "subcontractor" || payeeType === "agent" || payeeType === "employee" || payeeType === "vendor") return payeeType;
  return "other";
}

interface PayeeGroupIdentity {
  key: string;
  name: string;
  type: PayeeReportGroup;
  payeeId: UUID | null;
}

/** THE one grouping rule every payee-facing report/statement uses —
 * getPayeeReport and getPayeeStatement both call this so a row can
 * never end up grouped one way in the report and a different way in
 * its own statement. Grouping key exactly mirrors
 * FinancialEngine.sumPaidToPayee's join key (payeeType + payeeId) —
 * see this file's header — so totals are provably consistent with the
 * rest of the app for every payee that has a structured id. A payee
 * with no id (a free-text vendor, or truly nothing recorded) falls
 * back to exact-string, case-SENSITIVE grouping by vendor name — v1
 * decision (docs/CPA_YEAR_END_PACKAGE.md §5 #4): "Home Depot" and
 * "home depot" are deliberately different rows, disclosed as a
 * footnote, not silently merged by a normalization this file doesn't
 * own. */
function payeeGroupIdentityFor(e: Expense): PayeeGroupIdentity {
  const type = normalizePayeeType(e.payeeType);
  const hasName = !!(e.vendor && e.vendor.trim());
  if (e.payeeId) {
    return { key: `id:${type}:${e.payeeId}`, name: hasName ? e.vendor! : type, type, payeeId: e.payeeId };
  }
  if (hasName) {
    const name = e.vendor!.trim();
    return { key: `name:${type}:${name}`, name, type, payeeId: null };
  }
  return { key: "unspecified", name: UNSPECIFIED_PAYEE_LABEL, type: "unspecified", payeeId: null };
}

async function getPayeeReport(deps: CpaPackageDeps, companyId: UUID, taxYear: number): Promise<PayeeReport> {
  const expenses = await deps.expenseService.listForCompany(companyId);
  const paid = paidExpensesInYear(expenses, taxYear);

  const groups = new Map<string, { name: string; type: PayeeReportGroup; payeeId: UUID | null; total: number; count: number }>();
  for (const e of paid) {
    const identity = payeeGroupIdentityFor(e);
    const row = groups.get(identity.key) ?? { name: identity.name, type: identity.type, payeeId: identity.payeeId, total: 0, count: 0 };
    row.total += e.amount;
    row.count += 1;
    groups.set(identity.key, row);
  }

  const grandTotal = money(Array.from(groups.values()).reduce((sum, g) => sum + g.total, 0));
  const rows = Array.from(groups.entries())
    .map(([key, g]) => ({
      payeeName: g.name,
      payeeType: g.type,
      payeeId: g.payeeId,
      totalPaid: money(g.total),
      paymentCount: g.count,
      isInternalLabor: g.type === "employee",
      // No statement for the unspecified bucket — there's no one to
      // send it to (docs/PAYEE_PAYMENT_STATEMENT.md §2).
      groupKey: key === "unspecified" ? null : key,
    }))
    // Unspecified sorts last regardless of amount — visible, never lost
    // in the middle of a real-payee list. Everything else, largest first.
    .sort((a, b) => {
      if (a.payeeName === UNSPECIFIED_PAYEE_LABEL) return 1;
      if (b.payeeName === UNSPECIFIED_PAYEE_LABEL) return -1;
      return b.totalPaid - a.totalPaid;
    });

  return { taxYear, grandTotal, rows };
}

// ============================================================
// Per-payee payment statement — see docs/PAYEE_PAYMENT_STATEMENT.md.
// Explicitly NOT an IRS Form 1099-NEC (see that doc's §1) — an
// informal "here's what we paid you" summary built from the exact
// same grouping/filter rules as the Payee Report, plus the itemized
// rows that rolled into that payee's total.
// ============================================================

export interface PayeeStatementLineItem {
  date: string;
  category: ExpenseType;
  amount: number;
  projectName: string | null;
}

export interface PayeeStatement {
  taxYear: number;
  payeeName: string;
  payeeType: PayeeReportGroup;
  isInternalLabor: boolean;
  totalPaid: number;
  lineItems: PayeeStatementLineItem[];
}

async function getPayeeStatement(
  deps: CpaPackageDeps,
  companyId: UUID,
  taxYear: number,
  groupKey: string
): Promise<PayeeStatement | null> {
  if (groupKey === "unspecified") return null; // see groupKey's own doc comment
  const [expenses, projects] = await Promise.all([
    deps.expenseService.listForCompany(companyId),
    deps.projectService.list({ companyId }),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p.name]));

  const matches = paidExpensesInYear(expenses, taxYear).filter((e) => payeeGroupIdentityFor(e).key === groupKey);
  if (matches.length === 0) return null;

  const identity = payeeGroupIdentityFor(matches[0]);
  const lineItems: PayeeStatementLineItem[] = matches
    .map((e) => ({
      date: e.expenseDate,
      category: e.expenseType,
      amount: money(e.amount),
      projectName: (e.projectId && projectById.get(e.projectId)) ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    taxYear,
    payeeName: identity.name,
    payeeType: identity.type,
    isInternalLabor: identity.type === "employee",
    totalPaid: money(lineItems.reduce((sum, li) => sum + li.amount, 0)),
    lineItems,
  };
}

// ============================================================
// Report 4 — Detailed Transaction Report
// ============================================================

export interface MoneyReceivedRow {
  date: string;
  clientName: string;
  invoiceNumber: string;
  projectName: string | null;
  amount: number;
  method: string;
  referenceNumber: string | null;
}

export interface MoneyPaidRow {
  date: string;
  payee: string;
  payeeType: string | null;
  category: ExpenseType;
  amount: number;
  method: string | null;
  projectName: string | null;
  estimateId: UUID | null;
  isPaid: boolean;
  reimbursementStatus: Expense["reimbursementStatus"];
}

export interface DetailedTransactionReport {
  taxYear: number;
  /** Money received — must equal IncomeSummary.totalCashCollected
   * exactly (same source rows, same filter). */
  moneyReceived: MoneyReceivedRow[];
  moneyReceivedTotal: number;
  /** Money paid — INCLUDES unpaid rows (isPaid: false), visible and
   * flagged, but excluded from moneyPaidTotalPaid. moneyPaidTotalPaid
   * must equal ExpenseSummary.grandTotal and PayeeReport.grandTotal
   * exactly — the package's built-in triple-equality reconciliation
   * check (docs/CPA_YEAR_END_PACKAGE.md §3, Report 4). */
  moneyPaid: MoneyPaidRow[];
  moneyPaidTotalPaid: number;
}

async function getDetailedTransactionReport(deps: CpaPackageDeps, companyId: UUID, taxYear: number): Promise<DetailedTransactionReport> {
  const [invoices, payments, expenses, projects, clients] = await Promise.all([
    deps.invoiceService.listForCompany({ companyId }),
    deps.paymentService.listForCompany({ companyId }),
    deps.expenseService.listForCompany(companyId),
    deps.projectService.list({ companyId }),
    deps.clientService.list({ companyId }),
  ]);

  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));
  const projectById = new Map(projects.map((p) => [p.id, p.name]));
  const clientById = new Map(clients.map((c) => [c.id, c.name]));

  const yearPayments = payments.filter((p) => inTaxYear(p.paymentDate, taxYear));
  const moneyReceived: MoneyReceivedRow[] = yearPayments.map((p) => {
    const inv = invoiceById.get(p.invoiceId);
    return {
      date: p.paymentDate,
      clientName: (inv?.clientId && clientById.get(inv.clientId)) || "Unknown Client",
      invoiceNumber: inv?.invoiceNumber ?? "Unknown Invoice",
      projectName: (inv && projectById.get(inv.projectId)) ?? null,
      amount: money(p.amount),
      method: p.method,
      referenceNumber: p.referenceNumber,
    };
  });
  const moneyReceivedTotal = money(moneyReceived.reduce((sum, r) => sum + r.amount, 0));

  // Full ledger for the year — paid AND unpaid, unlike every other
  // report in this package, which is paid-only. Unpaid rows are
  // deliberately visible here rather than hidden, but never counted in
  // moneyPaidTotalPaid.
  const yearExpenses = expenses.filter((e) => inTaxYear(e.expenseDate, taxYear));
  const moneyPaid: MoneyPaidRow[] = yearExpenses.map((e) => ({
    date: e.expenseDate,
    payee: e.vendor || UNSPECIFIED_PAYEE_LABEL,
    payeeType: e.payeeType,
    category: e.expenseType,
    amount: money(e.amount),
    method: e.paymentMethod,
    projectName: (e.projectId && projectById.get(e.projectId)) ?? null,
    estimateId: e.estimateId,
    isPaid: e.isPaid,
    reimbursementStatus: e.reimbursementStatus,
  }));
  const moneyPaidTotalPaid = money(moneyPaid.filter((r) => r.isPaid).reduce((sum, r) => sum + r.amount, 0));

  return { taxYear, moneyReceived, moneyReceivedTotal, moneyPaid, moneyPaidTotalPaid };
}

// ============================================================
// The whole package
// ============================================================

export interface CpaYearEndPackage {
  companyId: UUID;
  taxYear: number;
  income: IncomeSummary;
  expenses: ExpenseSummary;
  payees: PayeeReport;
  transactions: DetailedTransactionReport;
  /** Simple cash-basis Net Profit/Loss — income.totalCashCollected minus
   * expenses.grandTotal. Not a new calculation: both operands are
   * already-computed totals from the two reports above, straight
   * subtraction, no separate report/data source. Deliberately NOT the
   * same figure FinancialEngine's netProfit produces (that's
   * committed-cost, project-scoped, and can include unpaid
   * commitments) — see this file's header for why the two must never
   * be conflated. */
  netProfitLoss: number;
}

export interface CpaPackageService {
  getIncomeSummary(companyId: UUID, taxYear: number): Promise<IncomeSummary>;
  getExpenseSummary(companyId: UUID, taxYear: number): Promise<ExpenseSummary>;
  getPayeeReport(companyId: UUID, taxYear: number): Promise<PayeeReport>;
  getDetailedTransactionReport(companyId: UUID, taxYear: number): Promise<DetailedTransactionReport>;
  /** All four, assembled together — also the natural place a future
   * caller can assert the triple-equality reconciliation rule holds
   * before handing the package to a user. */
  getPackage(companyId: UUID, taxYear: number): Promise<CpaYearEndPackage>;
  /** One payee's own statement — see docs/PAYEE_PAYMENT_STATEMENT.md.
   * `groupKey` comes from a PayeeReportRow.groupKey; null when that
   * payee has no groupKey (the unspecified bucket) or when nothing
   * matches it for this tax year. */
  getPayeeStatement(companyId: UUID, taxYear: number, groupKey: string): Promise<PayeeStatement | null>;
}

export function createCpaPackageService(deps: CpaPackageDeps): CpaPackageService {
  async function getPackage(companyId: UUID, taxYear: number): Promise<CpaYearEndPackage> {
    const [income, expenses, payees, transactions] = await Promise.all([
      getIncomeSummary(deps, companyId, taxYear),
      getExpenseSummary(deps, companyId, taxYear),
      getPayeeReport(deps, companyId, taxYear),
      getDetailedTransactionReport(deps, companyId, taxYear),
    ]);
    const netProfitLoss = money(income.totalCashCollected - expenses.grandTotal);
    return { companyId, taxYear, income, expenses, payees, transactions, netProfitLoss };
  }

  return {
    getIncomeSummary: (companyId, taxYear) => getIncomeSummary(deps, companyId, taxYear),
    getExpenseSummary: (companyId, taxYear) => getExpenseSummary(deps, companyId, taxYear),
    getPayeeReport: (companyId, taxYear) => getPayeeReport(deps, companyId, taxYear),
    getDetailedTransactionReport: (companyId, taxYear) => getDetailedTransactionReport(deps, companyId, taxYear),
    getPackage,
    getPayeeStatement: (companyId, taxYear, groupKey) => getPayeeStatement(deps, companyId, taxYear, groupKey),
  };
}
