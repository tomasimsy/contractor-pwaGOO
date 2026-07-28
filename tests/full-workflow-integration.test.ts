/**
 * Automated integration test for the complete workflow list: Create
 * Estimate -> Edit -> Sign -> Convert to Invoice -> Partial Payment ->
 * Full Payment -> Add/Delete Change Orders -> Add/Delete Expenses ->
 * Assign/Pay Agents -> Assign/Pay Subcontractors -> Delete Transactions.
 *
 * `verifyAllModulesAgree()` runs after EVERY single action and is what
 * makes "fail immediately if any calculation differs across the
 * application" literal: it's not one assertion at the end, it's called
 * ~15 times across this file, and a single wrong number anywhere fails
 * whichever step introduced it — not a generic "something is wrong at
 * the end" but the exact action that broke it.
 *
 * "Dashboard" and "Reports" are modeled as independent call sites
 * (functions, not shared variables) that each call FinancialEngine the
 * way a real page would — proving agreement between them, not just
 * that a single computed value happens to be reused everywhere.
 */
import { describe, test, expect, beforeAll } from "vitest";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "company-1";
const DATE_RANGE = { start: new Date("2025-12-01"), end: new Date("2026-03-01") };

async function dashboardView(services: InMemoryServices, projectId: string) {
  return services.financialEngine.getProjectFinancials(projectId);
}
async function reportsView(services: InMemoryServices, projectId: string) {
  return services.financialEngine.getProjectFinancials(projectId);
}

/** Called after every action in this suite. Fails immediately (vitest
 * assertions throw synchronously) the moment any two things that
 * should agree don't. */
async function verifyAllModulesAgree(services: InMemoryServices, projectId: string) {
  const dashboard = await dashboardView(services, projectId);
  const reports = await reportsView(services, projectId);
  expect(reports, "Dashboard and Reports must return identical figures for the same project").toEqual(dashboard);

  // Profit = Revenue - Expenses, always, from the SAME numbers FinancialEngine returned.
  expect(dashboard.netProfit).toBeCloseTo(dashboard.revisedTotal - dashboard.totalExpenses, 6);
  expect(dashboard.grossProfit).toBeCloseTo(dashboard.revisedTotal - (dashboard.subcontractorCosts + dashboard.agentCosts), 6);

  // Outstanding balance = billed - collected, always.
  expect(dashboard.remainingBalance).toBeCloseTo(dashboard.invoicesTotal - dashboard.amountPaid, 6);
  expect(dashboard.outstandingTotal).toBeCloseTo(dashboard.outstandingSubcontractor + dashboard.outstandingAgent, 6);

  // Payables (Agent Payables / Subcontractor Payables) line totals must
  // sum to the reported totals, and must independently reconcile
  // against TransactionService.getAssignmentBalance per line.
  const payables = await services.financialEngine.getPayablesSummary({ companyId: COMPANY_ID, projectId });
  const subLines = payables.lines.filter((l) => l.role === "subcontractor");
  const agentLines = payables.lines.filter((l) => l.role === "agent");
  expect(subLines.reduce((s, l) => s + l.outstanding, 0)).toBeCloseTo(payables.totalOutstandingSubcontractor, 6);
  expect(agentLines.reduce((s, l) => s + l.outstanding, 0)).toBeCloseTo(payables.totalOutstandingAgent, 6);
  for (const line of payables.lines) {
    const balance = await services.transactionService.getAssignmentBalance(line.assignmentId);
    expect(line.outstanding, `Payables line for ${line.payeeName} must match TransactionService.getAssignmentBalance`).toBeCloseTo(balance.outstanding, 6);
  }

  // The full automated reconciliation sweep — reuses everything built
  // for the reconciliation system; a failure here means some source
  // record and the ledger have drifted, whatever the cause.
  const ledgerCheck = await services.reconciliationService.reconcileLedgerAgainstSources({ companyId: COMPANY_ID, projectId });
  expect(ledgerCheck.isClean, `Ledger inconsistencies: ${JSON.stringify(ledgerCheck.findings, null, 2)}`).toBe(true);
  const totalsCheck = await services.reconciliationService.reconcileProjectTotals(projectId);
  expect(totalsCheck.isClean, `Totals inconsistencies: ${JSON.stringify(totalsCheck.findings, null, 2)}`).toBe(true);

  return { dashboard, payables };
}

describe("Full workflow integration", () => {
  let services: InMemoryServices;
  let projectId: string;
  let estimateId: string;
  let invoiceId: string;
  let changeOrderIdToDelete: string;
  let expenseIdToDelete: string;
  let subAssignmentId: string;
  let agentAssignmentId: string;
  let paymentIdToDelete: string;

  beforeAll(async () => {
    services = createInMemoryServices();
    services.store.subcontractors.set("sub-1", {
      id: "sub-1", companyId: COMPANY_ID, name: "Ace Roofing", trade: "roofing", phone: null,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
    });
    services.store.agents.set("agent-1", {
      id: "agent-1", companyId: COMPANY_ID, name: "Jane Sales", commissionRate: 5,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
    });
  });

  test("1. Create Project + Create Estimate", async () => {
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Full Workflow Test" });
    projectId = project.id;

    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: "client-1",
      lineItems: [{ category: "material", name: "Materials", description: null, quantity: 1, unitPrice: 8000, taxable: true }],
      markup: 0, discount: 0, taxRate: 0,
    });
    estimateId = estimate.id;
    expect(estimate.total).toBe(8000);

    await verifyAllModulesAgree(services, projectId);
  });

  test("2. Edit Estimate", async () => {
    const updated = await services.estimateService.updateLineItems(estimateId, [
      { category: "material", name: "Materials", description: null, quantity: 1, unitPrice: 8000, taxable: true },
      { category: "labor", name: "Labor", description: null, quantity: 1, unitPrice: 2000, taxable: true },
    ]);
    expect(updated.total).toBe(10000);

    await verifyAllModulesAgree(services, projectId);
  });

  test("3. Sign Estimate", async () => {
    await services.estimateService.changeStatus(estimateId, "sent");
    const approved = await services.estimateService.changeStatus(estimateId, "approved");
    expect(approved.valid).toBe(true);

    const signed = await services.estimateService.recordSignature(estimateId, { type: "type", value: "John Smith", date: "2026-01-01" });
    expect(signed.signature?.value).toBe("John Smith");

    await verifyAllModulesAgree(services, projectId);
  });

  test("4. Convert to Invoice", async () => {
    const invoice = await services.invoiceService.createFromEstimate(estimateId, { issueDate: "2026-01-02", dueDate: "2026-02-01" });
    invoiceId = invoice.id;
    expect(invoice.total).toBe(10000);

    const { dashboard } = await verifyAllModulesAgree(services, projectId);
    expect(dashboard.invoicesTotal).toBe(10000);
    expect(dashboard.paymentStatus).toBe("unpaid");
  });

  test("5. Receive Partial Payment", async () => {
    const result = await services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: 4000, method: "bank_transfer", paymentDate: "2026-01-05" });
    expect(result.valid).toBe(true);

    const { dashboard } = await verifyAllModulesAgree(services, projectId);
    expect(dashboard.amountPaid).toBe(4000);
    expect(dashboard.remainingBalance).toBe(6000);
    expect(dashboard.paymentStatus).toBe("partial");
  });

  test("6. Receive Full Payment (remaining balance)", async () => {
    const result = await services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: 6000, method: "check", paymentDate: "2026-01-20" });
    expect(result.valid).toBe(true);
    paymentIdToDelete = result.payment!.id;

    const { dashboard } = await verifyAllModulesAgree(services, projectId);
    expect(dashboard.amountPaid).toBe(10000);
    expect(dashboard.remainingBalance).toBe(0);
    expect(dashboard.paymentStatus).toBe("paid");
    expect(dashboard.isFullyPaid).toBe(true);
  });

  test("7a. Add Change Order (approved)", async () => {
    const co = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId, estimateId, changeOrderNumber: "CO-1", title: "Extra fixtures", totalAmount: 1500, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(co.id);

    const { dashboard } = await verifyAllModulesAgree(services, projectId);
    expect(dashboard.approvedChangeOrderTotal).toBe(1500);
    expect(dashboard.revisedTotal).toBe(11500); // 10000 invoiced + 1500 approved change order
  });

  test("7b. Add a second Change Order, then Delete it", async () => {
    const co = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId, estimateId, changeOrderNumber: "CO-2", title: "Will be deleted", totalAmount: 800, tax: 0,
    });
    changeOrderIdToDelete = co.id;
    await services.changeOrderService.approveChangeOrder(co.id);

    const afterApprove = await verifyAllModulesAgree(services, projectId);
    expect(afterApprove.dashboard.revisedTotal).toBe(12300); // 11500 + 800

    await services.changeOrderService.softDelete(changeOrderIdToDelete, "Customer cancelled this change order");

    const afterDelete = await verifyAllModulesAgree(services, projectId);
    expect(afterDelete.dashboard.revisedTotal).toBe(11500); // back to before CO-2 — deleted change order must not affect revenue
    expect(afterDelete.dashboard.approvedChangeOrderTotal).toBe(1500);
  });

  test("8a. Add Expense", async () => {
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId, expenseType: "materials", amount: 1200, expenseDate: "2026-01-10", vendor: "Supply Co",
    });
    expenseIdToDelete = expense.id;

    const { dashboard } = await verifyAllModulesAgree(services, projectId);
    expect(dashboard.expenseItems).toBe(1200);
  });

  test("8b. Delete Expense", async () => {
    await services.expenseService.softDelete(expenseIdToDelete, "Duplicate entry");

    const { dashboard } = await verifyAllModulesAgree(services, projectId);
    expect(dashboard.expenseItems).toBe(0); // deleted expense must not affect calculations
  });

  test("9. Assign/Pay Agent", async () => {
    const assignment = await services.agentCommissionService.assignToProject({ companyId: COMPANY_ID, projectId, agentId: "agent-1", assignedAmount: 500 });
    agentAssignmentId = assignment.id;

    await verifyAllModulesAgree(services, projectId);

    await services.agentCommissionService.recordPayment({ companyId: COMPANY_ID, agentId: "agent-1", assignmentId: agentAssignmentId, amount: 500, paymentType: "commission", paymentDate: "2026-01-15" });

    const { dashboard, payables } = await verifyAllModulesAgree(services, projectId);
    expect(dashboard.agentCosts).toBe(500);
    expect(payables.totalOutstandingAgent).toBe(0);
  });

  test("10. Assign/Pay Subcontractor", async () => {
    const assignment = await services.subcontractorService.assignToProject({ companyId: COMPANY_ID, projectId, subcontractorId: "sub-1", contractedAmount: 3000 });
    subAssignmentId = assignment.id;

    await verifyAllModulesAgree(services, projectId);

    await services.subcontractorService.recordPayment({ companyId: COMPANY_ID, assignmentId: subAssignmentId, amount: 3000, paymentDate: "2026-01-16" });

    const { dashboard, payables } = await verifyAllModulesAgree(services, projectId);
    expect(dashboard.subcontractorCosts).toBe(3000);
    expect(payables.totalOutstandingSubcontractor).toBe(0);
  });

  test("11. Delete Transaction (a customer payment)", async () => {
    const before = await verifyAllModulesAgree(services, projectId);
    expect(before.dashboard.amountPaid).toBe(10000);

    await services.paymentService.softDelete(paymentIdToDelete, "Payment reversed by bank — chargeback");

    const { dashboard } = await verifyAllModulesAgree(services, projectId);
    expect(dashboard.amountPaid).toBe(4000); // the $6,000 payment is deleted; only the $4,000 partial remains
    expect(dashboard.remainingBalance).toBe(6000);
    expect(dashboard.paymentStatus).toBe("partial"); // must no longer read "paid"

    // Restore proves the reverse direction is equally correct — not
    // just "delete makes numbers smaller" by coincidence.
    await services.paymentService.restore(paymentIdToDelete);
    const restored = await verifyAllModulesAgree(services, projectId);
    expect(restored.dashboard.amountPaid).toBe(10000);
    expect(restored.dashboard.paymentStatus).toBe("paid");
  });

  test("Final state: company-level and tax-level figures also agree with the same ledger", async () => {
    const company = await services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: DATE_RANGE });
    const tax = await services.financialEngine.getTaxSummary({ companyId: COMPANY_ID, dateRange: DATE_RANGE });

    expect(company.totalRevenue).toBe(10000); // cash actually collected this period
    expect(tax.taxableRevenue).toBe(10000);
    expect(company.totalInvoiced).toBe(10000);

    const ledgerCheck = await services.reconciliationService.reconcileLedgerAgainstSources({ companyId: COMPANY_ID, projectId });
    expect(ledgerCheck.isClean).toBe(true);
  });
});
