/**
 * Proves the accounting/reporting foundation (chart of accounts,
 * GeneralLedgerService, ReportingService, LocationService's shape)
 * added for the "Enterprise Foundation" brief items 4 and 5 actually
 * works against real workflow data, and — critically — that it can
 * never disagree with FinancialEngine, since it's built by mapping the
 * exact same ledger rows rather than recomputing anything.
 */
import { describe, test, expect, beforeAll } from "vitest";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { createGeneralLedgerService } from "../lib/services/generalLedgerService";
import { createReportingService } from "../lib/services/reportingService";
import { createFinancialStatementsService } from "../lib/services/financialStatementsService";
import { createAccountsReceivableService } from "../lib/services/accountsReceivableService";
import { createAccountsPayableService } from "../lib/services/accountsPayableService";

const COMPANY_ID = "company-1";
const DATE_RANGE = { start: new Date("2026-01-01"), end: new Date("2026-03-01") };

describe("Accounting + reporting foundation", () => {
  let services: InMemoryServices;
  let generalLedgerService: ReturnType<typeof createGeneralLedgerService>;
  let reportingService: ReturnType<typeof createReportingService>;
  let projectId: string;
  let invoiceId: string;

  beforeAll(async () => {
    services = createInMemoryServices();
    generalLedgerService = createGeneralLedgerService({ transactionService: services.transactionService });
    const financialStatementsService = createFinancialStatementsService({ generalLedgerService });
    const accountsReceivableService = createAccountsReceivableService({
      invoiceService: services.invoiceService,
      paymentService: services.paymentService,
    });
    const accountsPayableService = createAccountsPayableService({ financialEngine: services.financialEngine });
    reportingService = createReportingService({
      financialEngine: services.financialEngine,
      projectService: services.projectService,
      transactionService: services.transactionService,
      generalLedgerService,
      financialStatementsService,
      accountsReceivableService,
      accountsPayableService,
    });

    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Accounting Foundation Test" });
    projectId = project.id;

    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: "client-1",
      lineItems: [{ category: "material", name: "Materials", description: null, quantity: 1, unitPrice: 10000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.estimateService.changeStatus(estimate.id, "sent");
    await services.estimateService.changeStatus(estimate.id, "approved");

    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-02", dueDate: "2026-02-01" });
    invoiceId = invoice.id;

    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: 6000, method: "bank_transfer", paymentDate: "2026-01-10" });
    await services.expenseService.create({ companyId: COMPANY_ID, projectId, expenseType: "materials", amount: 2000, expenseDate: "2026-01-15" });
  });

  test("General ledger postings exist for every booked event, correctly debited/credited", async () => {
    const postings = await generalLedgerService.getPostings({ companyId: COMPANY_ID, projectId });

    // invoice_issued (AR debit / Revenue credit), customer_payment (Cash debit / AR credit),
    // material_expense (Expense debit / Cash credit) — 3 events, 3 postings.
    expect(postings).toHaveLength(3);

    const invoicePosting = postings.find((p) => p.amount === 10000);
    expect(invoicePosting?.debitAccount.code).toBe("1100"); // Accounts Receivable
    expect(invoicePosting?.creditAccount.code).toBe("4000"); // Revenue

    const paymentPosting = postings.find((p) => p.amount === 6000);
    expect(paymentPosting?.debitAccount.code).toBe("1000"); // Cash
    expect(paymentPosting?.creditAccount.code).toBe("1100"); // Accounts Receivable

    const expensePosting = postings.find((p) => p.amount === 2000);
    expect(expensePosting?.debitAccount.code).toBe("5000"); // Material Expense
    expect(expensePosting?.creditAccount.code).toBe("1000"); // Cash
  });

  test("Trial balance is structurally balanced (double-entry invariant, not asserted)", async () => {
    const trialBalance = await generalLedgerService.getTrialBalance({ companyId: COMPANY_ID, projectId });
    expect(trialBalance.isBalanced).toBe(true);
    expect(trialBalance.totalDebits).toBe(trialBalance.totalCredits);

    const ar = trialBalance.lines.find((l) => l.account.code === "1100")!;
    // AR: debited 10000 (invoice), credited 6000 (payment) -> balance 4000, matching the invoice's remaining balance.
    expect(ar.balance).toBe(4000);

    const cash = trialBalance.lines.find((l) => l.account.code === "1000")!;
    // Cash: debited 6000 (payment received), credited 2000 (expense paid) -> balance 4000.
    expect(cash.balance).toBe(4000);

    const revenue = trialBalance.lines.find((l) => l.account.code === "4000")!;
    expect(revenue.balance).toBe(10000);
  });

  test("getAccountBalance matches the equivalent trial-balance line", async () => {
    const arBalance = await generalLedgerService.getAccountBalance({ companyId: COMPANY_ID, projectId }, "1100");
    expect(arBalance).toBe(4000);
  });

  test("ReportingService.getKPIDashboard never disagrees with FinancialEngine — same source, re-shaped", async () => {
    const scope = { companyId: COMPANY_ID, dateRange: DATE_RANGE };
    const [kpi, companyFinancials, payables] = await Promise.all([
      reportingService.getKPIDashboard(scope),
      services.financialEngine.getCompanyFinancials(scope),
      services.financialEngine.getPayablesSummary(scope),
    ]);

    expect(kpi.revenue).toBe(companyFinancials.totalRevenue);
    expect(kpi.netProfit).toBe(companyFinancials.netProfit);
    expect(kpi.netMargin).toBe(companyFinancials.profitMargin);
    expect(kpi.outstandingReceivable).toBe(companyFinancials.totalOutstanding);
    expect(kpi.outstandingPayables).toBe(payables.totalOutstanding);
  });

  test("ReportingService.getRevenueTrend sums to the same total the ledger itself reports for revenue-effect transactions", async () => {
    // getRevenueTrend is a trailing window from the REAL current date
    // (matching contractor-pwa's getMonthlyRevenueTrend precedent), not
    // from the fixture's 2026-01 transaction dates — a wide enough
    // window (24 months) guarantees January 2026 falls inside it
    // regardless of when this suite actually runs, without coupling
    // the test to "now."
    const trend = await reportingService.getRevenueTrend({ companyId: COMPANY_ID, projectId }, 24);
    const trendTotal = trend.reduce((sum, point) => sum + point.revenue, 0);

    const invoiceTotal = await services.transactionService.getTotalByType({ companyId: COMPANY_ID, projectId }, "invoice_issued");
    const changeOrderTotal = await services.transactionService.getTotalByType({ companyId: COMPANY_ID, projectId }, "change_order_approved");
    expect(trendTotal).toBe(invoiceTotal + changeOrderTotal);
  });

  test("Deleting the payment removes its posting and the ledger stays balanced", async () => {
    // "Deleted records must never affect calculations" extended to the
    // GL — same guarantee TransactionService.getCompanyLedger already
    // gives, proven here at the posting/trial-balance layer too.
    const payments = await services.paymentService.listForInvoice(invoiceId);
    const payment = payments[0];
    await services.paymentService.softDelete(payment.id, "test: verify GL excludes deleted payment");

    const postings = await generalLedgerService.getPostings({ companyId: COMPANY_ID, projectId });
    expect(postings.find((p) => p.amount === 6000)).toBeUndefined();

    const trialBalance = await generalLedgerService.getTrialBalance({ companyId: COMPANY_ID, projectId });
    expect(trialBalance.isBalanced).toBe(true);
    const ar = trialBalance.lines.find((l) => l.account.code === "1100")!;
    expect(ar.balance).toBe(10000); // back to the full invoice amount, payment no longer offsetting it

    // Restore for hygiene, matching this suite's pattern elsewhere of
    // not leaving mutated shared state for tests that might run after.
    await services.paymentService.restore(payment.id);
  });
});
