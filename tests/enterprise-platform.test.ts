/**
 * Proves the remaining enterprise-platform features (items 1-5 of the
 * "Complete Remaining Enterprise Platform Features" brief) actually
 * work end-to-end: Financial Statements (P&L/Balance Sheet/Cash Flow),
 * Accounts Receivable/Payable, Bank Reconciliation, Payroll (including
 * its ledger integration), Multi-location filtering, and the
 * Reporting extensions (Executive Dashboard, Project Performance,
 * Sales/Expense Analytics), plus the generic CSV export. Every
 * assertion either checks a structural invariant (balance sheet
 * balances, debits==credits) or cross-checks against FinancialEngine/
 * TransactionService directly — proving "single source of truth,"
 * not just exercising the code path.
 */
import { describe, test, expect, beforeAll } from "vitest";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { exportToCSV } from "../lib/services/exportService";

const COMPANY_ID = "company-1";

describe("Enterprise platform: accounting, payroll, multi-location, reporting", () => {
  let services: InMemoryServices;
  let projectA: string;
  let projectB: string;
  let invoiceAId: string;

  beforeAll(async () => {
    services = createInMemoryServices();

    // Two locations, one project each — the multi-location fixture.
    const hq = await services.locationService.create({ companyId: COMPANY_ID, name: "HQ", isPrimary: true });
    const branch = await services.locationService.create({ companyId: COMPANY_ID, name: "Branch Office" });

    const pA = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Project A", locationId: hq.id });
    projectA = pA.id;
    const pB = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-2", name: "Project B", locationId: branch.id });
    projectB = pB.id;

    const estA = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: projectA, clientId: "client-1",
      lineItems: [{ category: "material", name: "Materials", description: null, quantity: 1, unitPrice: 20000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.estimateService.changeStatus(estA.id, "sent");
    await services.estimateService.changeStatus(estA.id, "approved");
    const invA = await services.invoiceService.createFromEstimate(estA.id, { issueDate: "2026-01-05", dueDate: "2026-02-04" });
    invoiceAId = invA.id;
    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invA.id, amount: 12000, method: "bank_transfer", paymentDate: "2026-01-10" });
    await services.expenseService.create({ companyId: COMPANY_ID, projectId: projectA, expenseType: "labor", amount: 3000, expenseDate: "2026-01-12" });

    const estB = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: projectB, clientId: "client-2",
      lineItems: [{ category: "material", name: "Materials", description: null, quantity: 1, unitPrice: 5000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.estimateService.changeStatus(estB.id, "sent");
    await services.estimateService.changeStatus(estB.id, "approved");
    await services.invoiceService.createFromEstimate(estB.id, { issueDate: "2026-01-06", dueDate: "2020-01-01" }); // already overdue, no payment
  });

  describe("Financial Statements", () => {
    test("Profit & Loss revenue matches the accrual ledger total exactly (invoice_issued + change_order_approved)", async () => {
      // Deliberately NOT compared against FinancialEngine.getCompanyFinancials'
      // totalRevenue — that figure is cash-basis (payments collected),
      // while P&L revenue is accrual-basis (billed) — see
      // ExecutiveDashboard's doc comment for why these two legitimately
      // differ. The correct cross-check for an accrual P&L is against
      // the accrual-effect ledger transactions directly.
      const scope = { companyId: COMPANY_ID };
      const pnl = await services.financialStatementsService.getProfitAndLoss(scope);
      const invoiceIssued = await services.transactionService.getTotalByType(scope, "invoice_issued");
      const changeOrderApproved = await services.transactionService.getTotalByType(scope, "change_order_approved");
      expect(pnl.totalRevenue).toBe(invoiceIssued + changeOrderApproved);
    });

    test("Balance Sheet balances: Assets = Liabilities + Equity + Retained Earnings", async () => {
      const balanceSheet = await services.financialStatementsService.getBalanceSheet({ companyId: COMPANY_ID });
      expect(balanceSheet.isBalanced).toBe(true);
      expect(balanceSheet.totalAssets).toBeCloseTo(balanceSheet.totalLiabilities + balanceSheet.totalEquity + balanceSheet.retainedEarnings, 6);
    });

    test("Cash Flow's net change matches the Cash account's trial-balance balance", async () => {
      const scope = { companyId: COMPANY_ID };
      const [cashFlow, trialBalance] = await Promise.all([
        services.financialStatementsService.getCashFlow(scope),
        services.generalLedgerService.getTrialBalance(scope),
      ]);
      const cashAccountBalance = trialBalance.lines.find((l) => l.account.code === "1000")!.balance;
      expect(cashFlow.netCashChange).toBe(cashAccountBalance);
    });
  });

  describe("Accounts Receivable / Payable", () => {
    test("AR aging report buckets project B's overdue invoice correctly", async () => {
      const report = await services.accountsReceivableService.getAgingReport({ companyId: COMPANY_ID }, "2026-01-15");
      const projectBLine = report.lines.find((l) => l.balance === 5000);
      expect(projectBLine).toBeDefined();
      expect(projectBLine!.bucket).toBe("90+"); // due 2020-01-01, "as of" 2026-01-15 — years overdue
      expect(report.totalReceivable).toBeGreaterThanOrEqual(5000);
    });

    test("AR aging excludes invoices with no remaining balance", async () => {
      // Fully pay off project A's invoice, then confirm it drops out of the report.
      await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoiceAId, amount: 8000, method: "check", paymentDate: "2026-01-20" });
      const report = await services.accountsReceivableService.getAgingReport({ companyId: COMPANY_ID }, "2026-01-25");
      expect(report.lines.find((l) => l.invoiceId === invoiceAId)).toBeUndefined();
    });

    test("AP report matches FinancialEngine.getPayablesSummary exactly", async () => {
      services.store.subcontractors.set("sub-1", {
        id: "sub-1", companyId: COMPANY_ID, name: "Ace Roofing", trade: "roofing", phone: null, contactPerson: null, isActive: true,
        createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
      });
      const assignment = await services.subcontractorService.assignToProject({ companyId: COMPANY_ID, projectId: projectA, subcontractorId: "sub-1", contractedAmount: 4000 });
      await services.subcontractorService.recordPayment({ companyId: COMPANY_ID, assignmentId: assignment.id, amount: 1000, paymentDate: "2026-01-15" });

      const [apReport, payablesSummary] = await Promise.all([
        services.accountsPayableService.getPayablesReport({ companyId: COMPANY_ID }),
        services.financialEngine.getPayablesSummary({ companyId: COMPANY_ID }),
      ]);
      expect(apReport.totalOutstanding).toBe(payablesSummary.totalOutstanding);
      const line = apReport.lines.find((l) => l.payeeId === "sub-1");
      expect(line?.outstanding).toBe(3000);
    });
  });

  describe("Bank Reconciliation", () => {
    test("matches bank lines to ledger cash-flow lines by amount and nearby date", async () => {
      const cashFlow = await services.financialStatementsService.getCashFlow({ companyId: COMPANY_ID });
      // Build a "bank statement" from the real cash flow lines, offset
      // by a day (bank posting lag) — a realistic reconciliation input.
      const bankLines = cashFlow.lines.map((l, i) => ({
        id: `bank-${i}`,
        date: new Date(new Date(l.date).getTime() + 86400000).toISOString().slice(0, 10),
        amount: l.amount,
        description: "bank feed",
      }));

      const report = await services.bankReconciliationService.reconcile({ companyId: COMPANY_ID }, bankLines, 3);
      expect(report.isFullyReconciled).toBe(true);
      expect(report.matched).toHaveLength(cashFlow.lines.length);
    });

    test("an unmatched bank line (wrong amount) is reported, not silently dropped", async () => {
      const report = await services.bankReconciliationService.reconcile(
        { companyId: COMPANY_ID },
        [{ id: "mystery-1", date: "2026-01-10", amount: 999999, description: "unexplained deposit" }],
        3
      );
      expect(report.isFullyReconciled).toBe(false);
      expect(report.unmatchedBankLines).toHaveLength(1);
      expect(report.unmatchedBankLines[0].id).toBe("mystery-1");
    });
  });

  describe("Payroll", () => {
    let payeeId: string;
    let payRunId: string;

    test("creates a payee and a draft pay run with computed net pay", async () => {
      const payee = await services.payrollService.createPayee({
        companyId: COMPANY_ID, name: "Alex Employee", type: "employee",
        payFrequency: "biweekly", baseRate: 25, rateType: "hourly",
      });
      payeeId = payee.id;

      const payRun = await services.payrollService.createPayRun({
        companyId: COMPANY_ID, payPeriodStart: "2026-01-01", payPeriodEnd: "2026-01-14", payDate: "2026-01-16",
        lines: [{ payeeId, hoursWorked: 80, grossPay: 2000, withholdings: 400 }],
      });
      payRunId = payRun.id;

      expect(payRun.status).toBe("draft");
      expect(payRun.lines[0].netPay).toBe(1600);
      expect(payRun.totalNet).toBe(1600);
    });

    test("cannot mark a draft run paid — must be approved first", async () => {
      await expect(services.payrollService.markPayRunPaid(payRunId)).rejects.toThrow(/must be "approved"/);
    });

    test("approving then marking paid appends a payroll_expense ledger transaction, visible to FinancialEngine", async () => {
      await services.payrollService.approvePayRun(payRunId);
      const paid = await services.payrollService.markPayRunPaid(payRunId);
      expect(paid.status).toBe("paid");

      // getTotalByType returns a SIGNED total (negative for cost-effect
      // types, per TRANSACTION_TYPE_META) — -1600 here is correct, not
      // a bug; see getExpenseAnalytics's Math.abs boundary for where
      // this gets flipped to a user-facing positive figure.
      const total = await services.transactionService.getTotalByType({ companyId: COMPANY_ID }, "payroll_expense");
      expect(total).toBe(-1600);

      // FinancialEngine's company financials must reflect it too —
      // same ledger, same read path, no separate payroll total.
      const companyFinancials = await services.financialEngine.getCompanyFinancials({
        companyId: COMPANY_ID, dateRange: { start: new Date("2026-01-01"), end: new Date("2026-03-01") },
      });
      expect(companyFinancials.totalExpenses).toBeGreaterThanOrEqual(1600);
    });

    test("getPayStub reshapes the run's own line, no new numbers", async () => {
      const stub = await services.payrollService.getPayStub(payRunId, payeeId);
      expect(stub).toMatchObject({ payeeName: "Alex Employee", grossPay: 2000, withholdings: 400, netPay: 1600 });
    });

    test("getPayrollReport totals across runs, broken out by payee", async () => {
      const report = await services.payrollService.getPayrollReport({ companyId: COMPANY_ID });
      expect(report.totalNet).toBe(1600);
      expect(report.byPayee).toEqual([{ payeeId, payeeName: "Alex Employee", totalGross: 2000, totalNet: 1600 }]);
    });
  });

  describe("Multi-location", () => {
    test("Project Performance report filters by locationId, isolating one branch's projects", async () => {
      const allProjects = await services.reportingService.getProjectPerformanceReport({ companyId: COMPANY_ID });
      const hqLocation = (await services.locationService.list({ companyId: COMPANY_ID })).find((l) => l.name === "HQ")!;

      const hqOnly = await services.reportingService.getProjectPerformanceReport({ companyId: COMPANY_ID, locationId: hqLocation.id });
      expect(hqOnly.length).toBeLessThan(allProjects.length);
      expect(hqOnly.every((row) => row.projectId === projectA)).toBe(true);
      expect(hqOnly.some((row) => row.projectId === projectB)).toBe(false);
    });
  });

  describe("Reporting: Executive Dashboard, Sales & Expense Analytics", () => {
    test("Executive Dashboard's KPI and AP figures agree with their own underlying services (not with P&L, which is intentionally a different accounting basis)", async () => {
      const scope = { companyId: COMPANY_ID, dateRange: { start: new Date("2026-01-01"), end: new Date("2026-03-01") } };
      const [dashboard, companyFinancials, payablesReport] = await Promise.all([
        services.reportingService.getExecutiveDashboard(scope),
        services.financialEngine.getCompanyFinancials(scope),
        services.accountsPayableService.getPayablesReport(scope),
      ]);
      expect(dashboard.kpi.revenue).toBe(companyFinancials.totalRevenue);
      expect(dashboard.kpi.outstandingPayables).toBe(dashboard.payables.totalOutstanding);
      expect(dashboard.payables.totalOutstanding).toBe(payablesReport.totalOutstanding);
    });

    test("Sales Analytics revenue-by-client totals reconcile against FinancialEngine.getClientFinancials", async () => {
      const analytics = await services.reportingService.getSalesAnalytics({ companyId: COMPANY_ID });
      const client1Row = analytics.revenueByClient.find((r) => r.clientId === "client-1")!;
      const client1Financials = await services.financialEngine.getClientFinancials("client-1", COMPANY_ID);
      expect(client1Row.totalInvoiced).toBe(client1Financials.totalInvoiced);
    });

    test("Expense Analytics reports positive spend magnitudes that sum to the ledger's own (sign-flipped) cost total", async () => {
      const scope = { companyId: COMPANY_ID, dateRange: { start: new Date("2026-01-01"), end: new Date("2026-03-01") } };
      const expenseAnalytics = await services.reportingService.getExpenseAnalytics(scope);

      // Every line must be a positive magnitude — not the ledger's raw
      // signed (negative) convention — since this is a user-facing
      // "how much did we spend" report.
      for (const line of expenseAnalytics.byType) expect(line.total).toBeGreaterThanOrEqual(0);
      expect(expenseAnalytics.total).toBeGreaterThan(0);

      // Cross-check against the ledger's own signed totals per type,
      // sign-flipped — must match exactly. Deliberately NOT
      // getTotalByEffect(scope, "cost"): that also includes
      // payroll_expense (same "cost" effect), which Expense Analytics
      // intentionally excludes — payroll has its own Payroll Reports
      // (getPayrollReport), so it isn't double-counted into this
      // project-expense-focused breakdown.
      const materialExpense = await services.transactionService.getTotalByType(scope, "material_expense");
      const laborExpense = await services.transactionService.getTotalByType(scope, "labor_expense");
      const otherExpense = await services.transactionService.getTotalByType(scope, "other_expense");
      const mileageExpense = await services.transactionService.getTotalByType(scope, "mileage_expense");
      const subcontractorPayment = await services.transactionService.getTotalByType(scope, "subcontractor_payment");
      const agentCommission = await services.transactionService.getTotalByType(scope, "agent_commission");
      const expectedSigned = materialExpense + laborExpense + otherExpense + mileageExpense + subcontractorPayment + agentCommission;
      expect(expenseAnalytics.total).toBe(-expectedSigned);
    });
  });

  describe("CSV export", () => {
    test("exportToCSV produces a correct header + escaped rows", () => {
      const csv = exportToCSV(
        [{ name: "Ace Roofing, LLC", amount: 1000 }, { name: 'Bob "The Builder"', amount: 2000 }],
        [{ header: "Name", value: (r) => r.name }, { header: "Amount", value: (r) => r.amount }]
      );
      const lines = csv.split("\n");
      expect(lines[0]).toBe("Name,Amount");
      expect(lines[1]).toBe('"Ace Roofing, LLC",1000');
      expect(lines[2]).toBe('"Bob ""The Builder""",2000');
    });

    test("exportToCSV on an empty row set still produces a valid header-only CSV", () => {
      const csv = exportToCSV([], [{ header: "Name", value: () => "" }]);
      expect(csv).toBe("Name");
    });
  });
});
