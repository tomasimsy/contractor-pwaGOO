/**
 * FinancialEngine.getEstimateCostEntries / getProjectCostEntries — the
 * unified cost view behind the Estimate Details "Costs" list.
 *
 * ONE PAYMENT = ONE EXPENSE RECORD, so this list is a projection over a
 * SINGLE model: expense rows. A subcontractor payment and an agent
 * commission are expense rows too, distinguished by `expenseType` and
 * labeled through `source`. That is what makes the list safe to sum:
 * summing every row now equals the engine's own expense total, because
 * no cost lives anywhere else.
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

    // Paying a subcontractor / an agent writes an EXPENSE, same as any
    // other cost — that is the whole point of the model.
    await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 2000,
    });
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "subcontractor", amount: 800, expenseDate: "2026-01-10",
      vendor: "Sub One", payeeType: "subcontractor", payeeId: "sub-1",
    });

    await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 500,
    });
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "agent_commission", amount: 500, expenseDate: "2026-01-20",
      vendor: "Agent One", payeeType: "agent", payeeId: "agent-1",
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
    expect(subRow.category).toBe("Subcontractor");
    // Real cash out the door — a cost like any other.
    expect(subRow.treatment).toBe("cost");

    const agentRow = entries.find((e) => e.source === "agent")!;
    expect(agentRow.amount).toBe(500);
    expect(agentRow.category).toBe("Agent Commission");
    expect(agentRow.treatment).toBe("cost");
  });

  test("does not double-count: summing every row equals FinancialEngine's expense total", async () => {
    const { project, estimate } = await seedJob();

    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "materials", amount: 300, expenseDate: "2026-01-05",
    });
    // Contracted for 2000, paid 800 so far. The CONTRACT is not cost;
    // the 800 paid is.
    await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 2000,
    });
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "subcontractor", amount: 800, expenseDate: "2026-01-10",
      payeeType: "subcontractor", payeeId: "sub-1",
    });

    const entries = await services.financialEngine.getEstimateCostEntries(estimate.id);
    const financials = await services.financialEngine.getEstimateFinancials(estimate.id);

    // Every row is a cost row, and every row is an expense row.
    expect(entries.every((e) => e.treatment === "cost")).toBe(true);
    expect(financials.expenseItems).toBe(1100); // 300 materials + 800 sub

    // The 800 paid is the subcontractor BUCKET of those 1100 — a
    // breakdown, not an addition. The unpaid 1200 of the contract is
    // outstanding, not cost.
    expect(financials.subcontractorCosts).toBe(800);
    expect(financials.totalExpenses).toBe(1100);

    // Summing the list is now the cost total — nothing lives elsewhere.
    const naiveTotal = entries.reduce((s, e) => s + e.amount, 0);
    expect(naiveTotal).toBe(financials.totalExpenses);
  });

  test("reimbursing an agent settles a debt and writes no second cost row", async () => {
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

    // Paying the agent back SETTLES that debt on the existing row. It
    // writes no record of its own, so it cannot become a second $300.
    await services.expenseService.markReimbursed(expense.id);

    const entries = await services.financialEngine.getEstimateCostEntries(estimate.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(300);
    expect(entries[0].treatment).toBe("cost");

    // The purchase is counted exactly once. The $500 commission is not
    // cost yet — nobody has been paid it.
    const financials = await services.financialEngine.getEstimateFinancials(estimate.id);
    expect(financials.expenseItems).toBe(300);
    expect(financials.agentCommissionCosts).toBe(0);
    expect(financials.totalExpenses).toBe(300);
  });

  test("payments belonging to another project never leak into this one's list", async () => {
    const { estimate } = await seedJob();

    // A second project with its own subcontractor payment.
    const otherProject = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-2", name: "Other Job" });
    await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: otherProject.id, subcontractorId: "sub-9", contractedAmount: 999,
    });
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: otherProject.id, estimateId: null,
      expenseType: "subcontractor", amount: 999, expenseDate: "2026-01-15",
      payeeType: "subcontractor", payeeId: "sub-9",
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
