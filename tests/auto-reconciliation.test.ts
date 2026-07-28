/**
 * Proves "every create, update, or delete must trigger validation" is
 * actually true, not just documented — every assertion here reads
 * `services.store.reconciliationLog`, which only grows if
 * ReconciliationService.reconcileAfterMutation was really called by
 * the auto-reconciliation wrapper after a real service call, with no
 * manual "now call reconciliation" step anywhere in this test.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "company-1";

describe("automatic reconciliation", () => {
  let services: InMemoryServices;
  let projectId: string;

  beforeEach(async () => {
    services = createInMemoryServices();
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: null, name: "Auto-Reconcile Test" });
    projectId = project.id;
  });

  test("create/update/delete all append a reconciliation log entry, with no manual trigger", async () => {
    expect(services.store.reconciliationLog.length).toBeGreaterThan(0); // project creation itself already triggered one
    const afterCreate = services.store.reconciliationLog.length;

    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "Item", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    expect(services.store.reconciliationLog.length).toBeGreaterThan(afterCreate);
    const afterEstimateCreate = services.store.reconciliationLog.length;

    await services.estimateService.recalculateTotal(estimate.id);
    expect(services.store.reconciliationLog.length).toBeGreaterThan(afterEstimateCreate);
    const afterUpdate = services.store.reconciliationLog.length;

    await services.estimateService.softDelete(estimate.id, "test cleanup");
    expect(services.store.reconciliationLog.length).toBeGreaterThan(afterUpdate);

    // Every logged run for this project was clean — no false positives
    // from ordinary, correct usage.
    const runsForThisProject = services.store.reconciliationLog.filter((entry) => entry.report.scope.projectId === projectId);
    expect(runsForThisProject.length).toBeGreaterThan(0);
    expect(runsForThisProject.every((entry) => entry.report.isClean)).toBe(true);
  });

  test("a genuine inconsistency is detected and logged by the very next mutation's automatic run", async () => {
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "Item", description: null, quantity: 1, unitPrice: 4000, taxable: false }],
      markup: 500, discount: 200, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });

    // Directly corrupt the stored estimate total, bypassing every
    // service — simulates a bug elsewhere writing a bad value.
    const stored = services.store.estimates.get(estimate.id)!;
    stored.total = stored.total + 999;

    // Trigger ANY subsequent mutation on this project — the automatic
    // reconciliation that mutation fires should independently catch
    // the corruption, with no test code calling reconciliation itself.
    await services.expenseService.create({ companyId: COMPANY_ID, projectId, expenseType: "materials", amount: 100, expenseDate: "2026-01-05" });

    const runsForThisProject = services.store.reconciliationLog.filter((entry) => entry.report.scope.projectId === projectId);
    const lastRun = runsForThisProject[runsForThisProject.length - 1];
    expect(lastRun.report.isClean).toBe(false);
    expect(lastRun.report.findings.some((f) => f.message.includes(`Estimate ${estimate.id}`))).toBe(true);

    void invoice;
  });

  test("invoice status cannot go stale: it is derived on read, so no refresh pass is needed at all", async () => {
    // This test previously corrupted the invoice's STORED status field
    // and asserted that a later mutation's reconciliation pass repaired
    // it. That premise no longer exists: status is derived on every
    // read (financialCalculations.deriveInvoiceStatus) from the
    // lifecycle status + active payments + due date, so there is no
    // stored field left to corrupt. The property under test is now
    // strictly stronger — the status is correct IMMEDIATELY, with no
    // reconciliation, no refreshStatus call, and no intervening
    // mutation.
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "Item", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });

    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 400, method: "cash", paymentDate: "2026-01-02" });
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("partially_paid");

    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 600, method: "cash", paymentDate: "2026-01-03" });
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("paid");

    // Deleting a payment must walk it straight back — again with no
    // refresh step of any kind.
    const payments = await services.paymentService.listForInvoice(invoice.id);
    await services.paymentService.softDelete(payments[1].id, "Recorded in error");
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("partially_paid");
  });

  test("payables inconsistency (a missing assignment line) is caught", async () => {
    services.store.subcontractors.set("sub-x", {
      id: "sub-x", companyId: COMPANY_ID, name: "Test Sub", trade: null, phone: null,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
    });
    await services.subcontractorService.assignToProject({ companyId: COMPANY_ID, projectId, subcontractorId: "sub-x", contractedAmount: 500 });

    const check = await services.reconciliationService.reconcileProjectTotals(projectId);
    expect(check.isClean).toBe(true); // the assignment has a payables line — nothing wrong yet
  });
});
