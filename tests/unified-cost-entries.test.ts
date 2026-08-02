/**
 * FinancialEngine.getEstimateCostEntries / getProjectCostEntries — the
 * unified cost view behind the Estimate Details "Costs" list.
 *
 * The point of these tests is the invariant that makes the unified view
 * SAFE: it is a read-side projection over three separate domain models,
 * so it must show every record exactly once AND must never be summable
 * into a cost total that contradicts getProjectFinancials' committed-cost
 * model. `treatment` is what encodes that, and it's pinned here.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "unified-costs-co";

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

async function seedJob() {
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Unified Costs Job" });
  const estimate = await services.estimateService.create({
    companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
    lineItems: [{ category: "material", name: "Scope", description: "", quantity: 1, unitPrice: 10000, taxable: false }],
    markup: 0, discount: 0, taxRate: 0,
  });
  await services.estimateService.changeStatus(estimate.id, "sent");
  await services.estimateService.changeStatus(estimate.id, "approved");
  return { project, estimate };
}

describe("Unified cost entries", () => {
  test("shows expenses, subcontractor payments and agent payments in one chronological list, each labeled by source", async () => {
    const { project, estimate } = await seedJob();

    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "materials", amount: 300, expenseDate: "2026-01-05", vendor: "Supply Co",
    });

    const subAssignment = await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 2000,
    });
    await services.subcontractorService.recordPayment({
      companyId: COMPANY_ID, assignmentId: subAssignment.id, amount: 800, paymentDate: "2026-01-10",
    });

    const agentAssignment = await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 500,
    });
    await services.agentCommissionService.recordPayment({
      companyId: COMPANY_ID, agentId: "agent-1", assignmentId: agentAssignment.id,
      amount: 500, paymentType: "commission", paymentDate: "2026-01-20",
    });

    const entries = await services.financialEngine.getEstimateCostEntries(estimate.id);

    // All three sources present, exactly once each.
    expect(entries.filter((e) => e.source === "expense")).toHaveLength(1);
    expect(entries.filter((e) => e.source === "subcontractor")).toHaveLength(1);
    expect(entries.filter((e) => e.source === "agent")).toHaveLength(1);

    // Newest first.
    expect(entries.map((e) => e.date)).toEqual(["2026-01-20", "2026-01-10", "2026-01-05"]);

    const expenseRow = entries.find((e) => e.source === "expense")!;
    expect(expenseRow.amount).toBe(300);
    expect(expenseRow.label).toBe("Supply Co");
    expect(expenseRow.category).toBe("Materials");
    expect(expenseRow.treatment).toBe("cost");

    const subRow = entries.find((e) => e.source === "subcontractor")!;
    expect(subRow.amount).toBe(800);
    // A payment against a commitment already counted at assignment time.
    expect(subRow.treatment).toBe("payment");

    const agentRow = entries.find((e) => e.source === "agent")!;
    expect(agentRow.amount).toBe(500);
    expect(agentRow.category).toBe("Commission");
    expect(agentRow.treatment).toBe("payment");
  });

  test("does not double-count: only cost-treated rows reconcile with FinancialEngine's expense total", async () => {
    const { project, estimate } = await seedJob();

    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "materials", amount: 300, expenseDate: "2026-01-05",
    });
    const subAssignment = await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 2000,
    });
    await services.subcontractorService.recordPayment({
      companyId: COMPANY_ID, assignmentId: subAssignment.id, amount: 800, paymentDate: "2026-01-10",
    });

    const entries = await services.financialEngine.getEstimateCostEntries(estimate.id);
    const financials = await services.financialEngine.getEstimateFinancials(estimate.id);

    // Cost-treated rows are exactly the EXPENSE ROWS — `expenseItems`,
    // one of the four sources that make up totalExpenses.
    const costRowsTotal = entries.filter((e) => e.treatment === "cost").reduce((s, e) => s + e.amount, 0);
    expect(costRowsTotal).toBe(financials.expenseItems);
    expect(financials.expenseItems).toBe(300);

    // The $800 payment sits INSIDE the $2,000 committed subcontractor
    // cost — it is not $800 of extra cost. Total cost is the four-source
    // sum, so the payment never lands twice.
    expect(financials.subcontractorCosts).toBe(2000);
    expect(financials.totalExpenses).toBe(2300); // 300 expenses + 2000 committed sub
    const naiveTotal = entries.reduce((s, e) => s + e.amount, 0);
    expect(naiveTotal).toBe(1100); // 300 + 800 — summing rows is NOT the cost total
    expect(naiveTotal).not.toBe(financials.totalExpenses);
  });

  test("an agent reimbursement is treated as a settlement, never as new cost", async () => {
    const { project, estimate } = await seedJob();

    // Agent fronts a purchase — one cost, plus a debt to the agent.
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "materials", amount: 300, expenseDate: "2026-02-01",
      paidByType: "agent", paidById: "agent-1", reimbursable: true,
    });
    await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 500,
    });
    // Paying the agent back settles that debt — it is NOT a second $300.
    await services.agentCommissionService.recordPayment({
      companyId: COMPANY_ID, agentId: "agent-1", amount: 300,
      paymentType: "reimbursement", paymentDate: "2026-02-10", reimbursesExpenseId: expense.id,
    });

    const entries = await services.financialEngine.getEstimateCostEntries(estimate.id);
    const reimbursementRow = entries.find((e) => e.source === "agent" && e.category === "Reimbursement")!;
    expect(reimbursementRow).toBeDefined();
    expect(reimbursementRow.treatment).toBe("settlement");

    // The purchase is still counted exactly once — the $300 repayment
    // adds nothing. (totalExpenses also carries the $500 committed agent
    // commission, which is a separate cost from the reimbursed purchase.)
    const financials = await services.financialEngine.getEstimateFinancials(estimate.id);
    expect(financials.expenseItems).toBe(300);
    expect(financials.agentCommissionCosts).toBe(500);
    expect(financials.totalExpenses).toBe(800); // 300 + 500, NOT 300 + 500 + 300
    expect(entries.filter((e) => e.treatment === "cost").reduce((s, e) => s + e.amount, 0)).toBe(300);
  });

  test("payments belonging to another project never leak into this one's list", async () => {
    const { estimate } = await seedJob();

    // A second project with its own subcontractor payment.
    const otherProject = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-2", name: "Other Job" });
    const otherAssignment = await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: otherProject.id, subcontractorId: "sub-9", contractedAmount: 999,
    });
    await services.subcontractorService.recordPayment({
      companyId: COMPANY_ID, assignmentId: otherAssignment.id, amount: 999, paymentDate: "2026-01-15",
    });

    const entries = await services.financialEngine.getEstimateCostEntries(estimate.id);
    expect(entries.some((e) => e.amount === 999)).toBe(false);
  });

  test("getProjectCostEntries covers every estimate on the project", async () => {
    const { project, estimate } = await seedJob();

    // A second estimate on the SAME project, with its own expense.
    const estimateTwo = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
      lineItems: [{ category: "material", name: "Phase 2", description: "", quantity: 1, unitPrice: 5000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "materials", amount: 100, expenseDate: "2026-03-01",
    });
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimateTwo.id,
      expenseType: "labor", amount: 200, expenseDate: "2026-03-02",
    });

    // Estimate-scoped sees only its own expense…
    const estimateEntries = await services.financialEngine.getEstimateCostEntries(estimate.id);
    expect(estimateEntries.filter((e) => e.source === "expense").map((e) => e.amount)).toEqual([100]);

    // …while project-scoped sees both.
    const projectEntries = await services.financialEngine.getProjectCostEntries(project.id);
    expect(projectEntries.filter((e) => e.source === "expense").map((e) => e.amount).sort()).toEqual([100, 200]);
  });
});
