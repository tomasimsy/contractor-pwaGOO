/**
 * Regression test for the 2026-08-01 Dashboard audit's root-cause fix
 * (see DASHBOARD_AUDIT_REPORT.md): FinancialEngine.getCompanyFinancials/
 * getProjectFinancials/getTaxSummary used to read Revenue, Payments
 * Received, subcontractor/agent paid, and mileage costs from
 * `transactionService`'s ledger — which no real Supabase-backed
 * PaymentService write ever reached in production, and which reset on
 * every ServicesProvider mount even for the few things that did write
 * to it.
 *
 * This test proves the fix by constructing a FinancialEngine with a
 * `transactionService` that throws on every call. If any of the
 * figures below still depended on the ledger, this test would fail
 * with a thrown error, not a wrong number — that's a stronger
 * guarantee than asserting the ledger happens to be empty.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { createFinancialEngine } from "../lib/services/financialEngine";
import type { TransactionService } from "../lib/services/transactionService";

const COMPANY_ID = "ledger-independence-co";

let store: InMemoryStore;
let services: InMemoryServices;

const poisonedTransactionService: TransactionService = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error("transactionService must not be called by any production financial calculation.");
      };
    },
  }
) as TransactionService;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

async function seedProjectWithRevenueAndCosts() {
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Ledger Independence Job" });
  const estimate = await services.estimateService.create({
    companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
    lineItems: [{ category: "material", name: "Scope", description: "", quantity: 1, unitPrice: 10000, taxable: false }],
    markup: 0, discount: 0, taxRate: 0,
  });
  await services.estimateService.changeStatus(estimate.id, "sent");
  await services.estimateService.changeStatus(estimate.id, "approved");
  const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
  await services.invoiceService.changeStatus(invoice.id, "sent");
  await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 4000, method: "check", paymentDate: "2026-01-10" });

  const subAssignment = await services.subcontractorService.assignToProject({ companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 1000 });
  await services.subcontractorService.recordPayment({ companyId: COMPANY_ID, assignmentId: subAssignment.id, amount: 1000, paymentDate: "2026-01-11" });

  const agentAssignment = await services.agentCommissionService.assignToProject({ companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 500 });
  await services.agentCommissionService.recordPayment({ companyId: COMPANY_ID, agentId: "agent-1", assignmentId: agentAssignment.id, amount: 500, paymentType: "commission", paymentDate: "2026-01-12" });

  await services.expenseService.create({ companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 300, expenseDate: "2026-01-05", isPaid: true });

  return { project, invoice };
}

describe("FinancialEngine no longer depends on transactionService for real money", () => {
  test("getCompanyFinancials returns correct Revenue/Payments Received/costs even when transactionService throws on every call", async () => {
    await seedProjectWithRevenueAndCosts();

    const poisonedEngine = createFinancialEngine({
      projectService: services.projectService,
      estimateService: services.estimateService,
      changeOrderService: services.changeOrderService,
      invoiceService: services.invoiceService,
      paymentService: services.paymentService,
      subcontractorService: services.subcontractorService,
      agentCommissionService: services.agentCommissionService,
      expenseService: services.expenseService,
      transactionService: poisonedTransactionService,
      filteringService: services.filteringService,
    });

    const wideRange = { start: new Date("2000-01-01"), end: new Date("2100-01-01") };
    const company = await poisonedEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: wideRange });

    expect(company.totalRevenue).toBe(4000);
    expect(company.totalPaid).toBe(4000);
    expect(company.subcontractorPaid).toBe(1000);
    expect(company.agentCommissionPaid).toBe(500);
    expect(company.totalInvoiced).toBe(10000);
    expect(company.totalOutstanding).toBe(6000);
    expect(company.expenseItems).toBe(300);
    expect(company.netProfit).toBe(company.totalRevenue - company.totalExpenses);
  });

  test("getProjectFinancials returns correct amountPaid even when transactionService throws on every call", async () => {
    const { project } = await seedProjectWithRevenueAndCosts();

    const poisonedEngine = createFinancialEngine({
      projectService: services.projectService,
      estimateService: services.estimateService,
      changeOrderService: services.changeOrderService,
      invoiceService: services.invoiceService,
      paymentService: services.paymentService,
      subcontractorService: services.subcontractorService,
      agentCommissionService: services.agentCommissionService,
      expenseService: services.expenseService,
      transactionService: poisonedTransactionService,
      filteringService: services.filteringService,
    });

    const pf = await poisonedEngine.getProjectFinancials(project.id);
    expect(pf.amountPaid).toBe(4000);
    expect(pf.invoicesTotal).toBe(10000);
    expect(pf.remainingBalance).toBe(6000);
    expect(pf.subcontractorCosts).toBe(1000);
    expect(pf.agentCosts).toBe(500);
    expect(pf.mileageCosts).toBe(0); // real mileage tracking has no live table yet — see ExpenseService.listMileageForProject
  });

  test("getTaxSummary returns correct taxable revenue/costs even when transactionService throws on every call", async () => {
    await seedProjectWithRevenueAndCosts();

    const poisonedEngine = createFinancialEngine({
      projectService: services.projectService,
      estimateService: services.estimateService,
      changeOrderService: services.changeOrderService,
      invoiceService: services.invoiceService,
      paymentService: services.paymentService,
      subcontractorService: services.subcontractorService,
      agentCommissionService: services.agentCommissionService,
      expenseService: services.expenseService,
      transactionService: poisonedTransactionService,
      filteringService: services.filteringService,
    });

    const wideRange = { start: new Date("2000-01-01"), end: new Date("2100-01-01") };
    const tax = await poisonedEngine.getTaxSummary({ companyId: COMPANY_ID, dateRange: wideRange });
    expect(tax.taxableRevenue).toBe(4000);
    // approvedCosts = subcontractor payment (1000) + agent commission payment (500)
    expect(tax.approvedCosts).toBe(1500);
    expect(tax.deductibleExpenses).toBe(300);
  });
});
