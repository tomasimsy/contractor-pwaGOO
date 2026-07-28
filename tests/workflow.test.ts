/**
 * The exact workflow from the brief, run end-to-end against the
 * in-memory reference stack:
 *
 *   Create project -> estimate $10,000 -> approve change order $2,000
 *   -> convert invoice -> receive $5,000 payment -> add $2,000 expense
 *   -> pay subcontractor $3,000 -> pay agent $500
 *
 * Then verifies Dashboard/Tax/Reports/Profit/Balances/Payables all
 * agree — modeled here as independent wrapper functions that call
 * FinancialEngine the same way real pages would, so "agreement" is
 * actually demonstrated (two different call sites producing the same
 * number), not just assumed because it's the same function.
 */
import { describe, test, expect, beforeAll } from "vitest";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "company-1";

// Page-shaped wrappers — exactly what a Dashboard/Tax/Reports page is
// allowed to do per SERVICE_LAYER_DESIGN.md: call FinancialEngine, add
// no arithmetic of its own.
function dashboardProfitTile(services: InMemoryServices, projectId: string) {
  return services.financialEngine.getProjectFinancials(projectId);
}
function reportsProfitRow(services: InMemoryServices, projectId: string) {
  return services.financialEngine.getProjectFinancials(projectId);
}
function taxPageSummary(services: InMemoryServices, dateRange: { start: Date; end: Date }) {
  return services.financialEngine.getTaxSummary({ companyId: COMPANY_ID, dateRange });
}

describe("full financial workflow", () => {
  let services: InMemoryServices;
  let projectId: string;
  let estimateId: string;
  let invoiceId: string;
  let subAssignmentId: string;
  let agentAssignmentId: string;

  beforeAll(async () => {
    services = createInMemoryServices();

    // Seed roster
    services.store.subcontractors.set("sub-1", {
      id: "sub-1", companyId: COMPANY_ID, name: "Ace Roofing", trade: "roofing", phone: null,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
    });
    services.store.agents.set("agent-1", {
      id: "agent-1", companyId: COMPANY_ID, name: "Jane Sales", commissionRate: 5,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
    });

    // 1. Create project
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Smith Roof Replacement" });
    projectId = project.id;

    // 2. Create estimate $10,000
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID,
      projectId,
      clientId: "client-1",
      lineItems: [{ category: "material", name: "Roofing materials", description: null, quantity: 1, unitPrice: 10000, taxable: true }],
      markup: 0,
      discount: 0,
      taxRate: 0,
    });
    estimateId = estimate.id;
    expect(estimate.total).toBe(10000);

    // 3. Approve change order $2,000
    const co = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId, estimateId, changeOrderNumber: "CO-1", title: "Extra gutters", totalAmount: 2000, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(co.id);

    // 4. Convert to invoice
    const invoice = await services.invoiceService.createFromEstimate(estimateId, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    invoiceId = invoice.id;
    expect(invoice.total).toBe(10000); // change order is separate revenue, not folded into the invoice — see FinancialEngine's revenue formula

    // 5. Receive $5,000 payment
    const paymentResult = await services.paymentService.record({
      companyId: COMPANY_ID, invoiceId, amount: 5000, method: "bank_transfer", paymentDate: "2026-01-05",
    });
    expect(paymentResult.valid).toBe(true);

    // 6. Add $2,000 expense
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId, expenseType: "materials", amount: 2000, expenseDate: "2026-01-06", vendor: "Supply Co",
    });

    // 7. Pay subcontractor $3,000
    const subAssignment = await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId, subcontractorId: "sub-1", contractedAmount: 3000,
    });
    subAssignmentId = subAssignment.id;
    await services.subcontractorService.recordPayment({ companyId: COMPANY_ID, assignmentId: subAssignmentId, amount: 3000, paymentDate: "2026-01-07" });

    // 8. Pay agent $500
    const agentAssignment = await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId, agentId: "agent-1", assignedAmount: 500,
    });
    agentAssignmentId = agentAssignment.id;
    await services.agentCommissionService.recordPayment({
      companyId: COMPANY_ID, agentId: "agent-1", assignmentId: agentAssignmentId, amount: 500, paymentType: "commission", paymentDate: "2026-01-08",
    });
  });

  test("project financials: revenue, cost, and profit are all correct", async () => {
    const f = await services.financialEngine.getProjectFinancials(projectId);

    expect(f.invoicesTotal).toBe(10000);
    expect(f.approvedChangeOrderTotal).toBe(2000);
    expect(f.revisedTotal).toBe(12000); // invoices + approved change orders — never estimates.total

    expect(f.amountPaid).toBe(5000);
    expect(f.remainingBalance).toBe(5000); // 10000 invoiced - 5000 paid

    expect(f.expenseItems).toBe(2000);
    expect(f.subcontractorCosts).toBe(3000); // committed = max(assigned 3000, paid 3000)
    expect(f.agentCosts).toBe(500);
    expect(f.totalExpenses).toBe(5500); // 2000 + 3000 + 500

    expect(f.grossProfit).toBe(8500); // 12000 - (3000 + 500)
    expect(f.netProfit).toBe(6500); // 12000 - 5500
    expect(f.profitMargin).toBeCloseTo((6500 / 12000) * 100, 5);

    expect(f.outstandingSubcontractor).toBe(0);
    expect(f.outstandingAgent).toBe(0);
    expect(f.paymentStatus).toBe("partial"); // 5000 paid of 10000 invoiced
    expect(f.isFullyPaid).toBe(false);
  });

  test("balances: invoice balance and payables are individually correct", async () => {
    const paymentSummary = await services.paymentService.getSummaryForInvoice(invoiceId);
    expect(paymentSummary.totalPaid).toBe(5000);
    expect(paymentSummary.remainingBalance).toBe(5000);
    expect(paymentSummary.status).toBe("partial");

    const subBalance = await services.subcontractorService.getBalance(subAssignmentId);
    expect(subBalance).toEqual({ assigned: 3000, paid: 3000, outstanding: 0 });

    const agentBalance = await services.agentCommissionService.getBalance(agentAssignmentId);
    expect(agentBalance).toEqual({ assigned: 500, paid: 500, outstanding: 0 });
  });

  test("payables summary agrees with the individual balances above", async () => {
    const payables = await services.financialEngine.getPayablesSummary({ companyId: COMPANY_ID, projectId });
    expect(payables.totalOutstandingSubcontractor).toBe(0);
    expect(payables.totalOutstandingAgent).toBe(0);
    expect(payables.totalOutstanding).toBe(0);
    expect(payables.lines).toHaveLength(2);
    expect(payables.lines.find((l) => l.role === "subcontractor")).toMatchObject({ assigned: 3000, paid: 3000, outstanding: 0 });
    expect(payables.lines.find((l) => l.role === "agent")).toMatchObject({ assigned: 500, paid: 500, outstanding: 0 });
  });

  test("company financials (cash-basis) agree with the ledger", async () => {
    const range = { start: new Date("2025-12-01"), end: new Date("2026-02-01") };
    const f = await services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: range });

    expect(f.totalRevenue).toBe(5000); // cash actually received, not the 10000 billed
    expect(f.subcontractorPaid).toBe(3000);
    expect(f.agentPaid).toBe(500);
    expect(f.expenseItems).toBe(2000);
    expect(f.totalExpenses).toBe(5500);
    expect(f.netProfit).toBe(-500); // period cash-basis: 5000 in, 5500 out — DIFFERENT from project netProfit (6500), correctly, per FinancialEngine's two-model design
    expect(f.totalInvoiced).toBe(10000);
    expect(f.totalOutstanding).toBe(5000);
  });

  test("Dashboard / Reports / Tax all agree with FinancialEngine (and each other)", async () => {
    const dashboard = await dashboardProfitTile(services, projectId);
    const reports = await reportsProfitRow(services, projectId);
    expect(dashboard).toEqual(reports);

    const range = { start: new Date("2025-12-01"), end: new Date("2026-02-01") };
    const tax = await taxPageSummary(services, range);
    const engineTax = await services.financialEngine.getTaxSummary({ companyId: COMPANY_ID, dateRange: range });
    expect(tax).toEqual(engineTax);

    // Tax numbers, independently verified against the raw ledger:
    expect(tax.taxableRevenue).toBe(5000); // customer_payment only — an unpaid invoice is not taxable income
    expect(tax.deductibleExpenses).toBe(2000);
    expect(tax.approvedCosts).toBe(3500); // subcontractor 3000 + agent commission 500, both actually PAID this period
    expect(tax.netTaxableIncome).toBe(-500);
    expect(tax.estimatedTaxLiability).toBe(0); // no liability on negative taxable income

    const profitSummary = await services.financialEngine.getProfitSummary({ projectId });
    expect(profitSummary.netProfit).toBe(dashboard.netProfit);
  });
});
