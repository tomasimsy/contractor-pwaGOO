import { describe, expect, it } from "vitest";
import { createInMemoryServices } from "@/lib/services/testing/inMemoryServices";
import { createFinancialEngine } from "@/lib/services/financialEngine";
import { createCpaPackageService } from "@/lib/services/cpaPackageService";
import type { EmployeeWagePayment } from "@/lib/services/payeePaymentService";

const COMPANY = "company-wages";

/** Employee wages are paid through Payroll and are not expense rows. These
 * prove they still reach company-wide profit and the year-end package. */
describe("employee wages paid through Payroll", () => {
  const wages: EmployeeWagePayment[] = [
    { employeeId: "emp-1", employeeName: "Hien", amount: 800, paidOn: "2026-03-15", estimateId: null },
    { employeeId: "emp-1", employeeName: "Hien", amount: 400, paidOn: "2026-05-01", estimateId: null },
  ];
  const listEmployeeWages = async () => wages;

  async function setup() {
    const s = createInMemoryServices();
    await s.expenseService.create({ companyId: COMPANY, projectId: null, expenseType: "materials", amount: 100, expenseDate: "2026-03-10", isPaid: true });
    return s;
  }

  it("count in company profit when paid, in the period they were paid", async () => {
    const s = await setup();
    const engine = createFinancialEngine({
      projectService: s.projectService, estimateService: s.estimateService, changeOrderService: s.changeOrderService,
      invoiceService: s.invoiceService, paymentService: s.paymentService, subcontractorService: s.subcontractorService,
      agentCommissionService: s.agentCommissionService, transactionService: s.transactionService,
      expenseService: s.expenseService, filteringService: s.filteringService, listEmployeeWages,
    });
    const march = await engine.getCompanyFinancials({ companyId: COMPANY, dateRange: { start: new Date("2026-03-01"), end: new Date("2026-03-31") } });
    expect(march.laborCost).toBe(800);
    expect(march.totalExpenses).toBe(900);
    const tax = await engine.getTaxSummary({ companyId: COMPANY, dateRange: { start: new Date("2026-03-01"), end: new Date("2026-03-31") } });
    expect(tax.deductibleExpenses).toBe(900);
  });

  it("appear in the year-end package as labor paid to the employee, and the reports still reconcile", async () => {
    const s = await setup();
    const cpa = createCpaPackageService({
      expenseService: s.expenseService, paymentService: s.paymentService, invoiceService: s.invoiceService,
      projectService: s.projectService, clientService: s.clientService, listEmployeeWages,
    });
    const pkg = await cpa.getPackage(COMPANY, 2026);
    expect(pkg.expenses.grandTotal).toBe(1300);
    expect(pkg.expenses.categories.find((c) => c.category === "labor")?.totalPaid).toBe(1200);
    const hien = pkg.payees.rows.find((r) => r.payeeName === "Hien");
    expect(hien).toMatchObject({ totalPaid: 1200, payeeType: "employee", isInternalLabor: true });
    // The package's own reconciliation: expenses = payees = ledger paid total.
    expect(pkg.payees.grandTotal).toBe(1300);
    expect(pkg.transactions.moneyPaidTotalPaid).toBe(1300);
    expect(pkg.netProfitLoss).toBe(-1300);
  });
});
