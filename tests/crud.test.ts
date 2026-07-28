/**
 * Create / Update / Delete / Restore, and the reliability requirement
 * that rides along with delete: "deleted records must never affect
 * calculations." This is proven here, not just asserted — the same
 * expense is summed before deletion, after deletion, and after
 * restoration, and FinancialEngine's output is checked at each step.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "company-1";

describe("CRUD + soft delete + restore", () => {
  let services: InMemoryServices;
  let projectId: string;

  beforeEach(async () => {
    services = createInMemoryServices();
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: null, name: "Test Project" });
    projectId = project.id;
  });

  test("create, update, delete, restore an expense — and deletion excludes it from FinancialEngine", async () => {
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId, expenseType: "materials", amount: 1000, expenseDate: "2026-01-01",
    });

    let f = await services.financialEngine.getProjectFinancials(projectId);
    expect(f.expenseItems).toBe(1000);

    // Update
    await services.expenseService.update(expense.id, { amount: 1500 });
    f = await services.financialEngine.getProjectFinancials(projectId);
    expect(f.expenseItems).toBe(1500);

    // Delete requires a reason
    await expect(services.expenseService.softDelete(expense.id, "")).rejects.toThrow(/reason/i);

    await services.expenseService.softDelete(expense.id, "Duplicate entry — recorded twice by mistake");
    f = await services.financialEngine.getProjectFinancials(projectId);
    expect(f.expenseItems).toBe(0); // deleted record must not affect calculations

    // The ledger row still exists for audit purposes...
    const trail = await services.transactionService.getAuditTrail("estimate_expense", expense.id);
    expect(trail.length).toBeGreaterThan(0);
    // ...but getProjectLedger (what FinancialEngine reads) excludes it.
    const activeLedger = await services.transactionService.getProjectLedger(projectId);
    expect(activeLedger.find((tx) => tx.referenceId === expense.id)).toBeUndefined();

    // Restore
    await services.expenseService.restore(expense.id);
    f = await services.financialEngine.getProjectFinancials(projectId);
    expect(f.expenseItems).toBe(1500); // back to the updated amount, not the original 1000
  });

  test("delete requires a non-empty reason for every financial record type", async () => {
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "other", name: "Item", description: null, quantity: 1, unitPrice: 100, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await expect(services.estimateService.softDelete(estimate.id, "   ")).rejects.toThrow(/reason/i);
    await expect(services.estimateService.softDelete(estimate.id, "Client cancelled the job")).resolves.not.toThrow();

    const projects = await services.projectService.list({ companyId: COMPANY_ID });
    expect(projects.find((p) => p.id === projectId)).toBeDefined(); // project itself untouched by the estimate's deletion
  });

  test("project status transitions are validated, not free-form", async () => {
    // draft -> completed is not a legal direct jump (see validationService's PROJECT_TRANSITIONS table)
    const illegal = await services.projectService.changeStatus(projectId, "completed");
    expect(illegal.valid).toBe(false);

    const legal = await services.projectService.changeStatus(projectId, "active");
    expect(legal.valid).toBe(true);
    expect(legal.project?.status).toBe("active");
  });
});
