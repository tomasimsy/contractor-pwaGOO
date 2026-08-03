/**
 * getProjectFinancials and getEstimateFinancials must share ONE
 * definition of total cost and net profit (financialCalculations.
 * calculateJobProfit).
 *
 * ONE PAYMENT = ONE EXPENSE RECORD. Every cost — materials, labor, a
 * subcontractor payment, an agent commission — is a row in
 * estimate_expenses. `subcontractorCosts` and `agentCosts` are
 * BREAKDOWNS of `expenseItems` (the byType buckets), never additions
 * to it; adding them to the total is the double-count this model
 * exists to prevent. Assignments carry the CONTRACTED amount only and
 * contribute nothing to cost until a payment expense is recorded.
 *
 * These tests pin the shared rule so the two levels can't drift apart
 * again, and so nobody re-introduces assignment-based costing.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { calculateJobProfit } from "../lib/services/financialCalculations";

const COMPANY_ID = "job-profit-co";

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

describe("calculateJobProfit — the single definition", () => {
  test("total cost is expenses + mileage; sub/agent are buckets inside expenses", () => {
    const p = calculateJobProfit(10000, {
      // 1000 materials + 2000 paid to a subcontractor + 500 agent
      // commission — all three are expense ROWS, so expenseItems is
      // their sum, not just the materials.
      expenseItems: 3500,
      mileageCosts: 100,
      subcontractorCosts: 2000,
      agentCosts: 500,
    });
    // 3500 + 100 — the sub/agent buckets are NOT added again.
    expect(p.totalExpenses).toBe(3600);
    expect(p.netProfit).toBe(6400);
    // Gross deliberately subtracts only the paid-labour buckets.
    expect(p.grossProfit).toBe(7500); // 10000 − (2000 + 500)
    expect(p.profitMargin).toBeCloseTo(64, 6);
  });

  test("re-labelling cost as subcontractor/agent never changes the total", () => {
    const base = calculateJobProfit(10000, {
      expenseItems: 3500, mileageCosts: 0, subcontractorCosts: 0, agentCosts: 0,
    });
    const bucketed = calculateJobProfit(10000, {
      expenseItems: 3500, mileageCosts: 0, subcontractorCosts: 2000, agentCosts: 500,
    });
    expect(bucketed.totalExpenses).toBe(base.totalExpenses);
    expect(bucketed.netProfit).toBe(base.netProfit);
  });

  test("margin is zero rather than Infinity/NaN when there is no revenue", () => {
    const p = calculateJobProfit(0, { expenseItems: 500, mileageCosts: 0, subcontractorCosts: 0, agentCosts: 0 });
    expect(p.netProfit).toBe(-500);
    expect(p.profitMargin).toBe(0);
  });
});

describe("Project and estimate financials agree on cost and profit", () => {
  test("a single-estimate project reports the same totalExpenses and netProfit at both levels", async () => {
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Consistency Job" });
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
      lineItems: [{ category: "material", name: "Scope", description: "", quantity: 1, unitPrice: 10000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.estimateService.changeStatus(estimate.id, "sent");
    await services.estimateService.changeStatus(estimate.id, "approved");

    // Invoice the full estimate so BILLED revenue (project) and QUOTED
    // revenue (estimate) coincide — the two revenue bases are different
    // by design, so this is the case where the cost/profit definitions
    // are directly comparable.
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    await services.invoiceService.changeStatus(invoice.id, "sent");

    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "materials", amount: 1000, expenseDate: "2026-01-05",
    });
    // The subcontractor and the agent are CONTRACTED via assignments —
    // that alone is not cost. The cash actually paid is what lands as
    // an expense row, and that is what the engine counts.
    await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 2000,
    });
    await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 500,
    });
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "subcontractor", amount: 2000, expenseDate: "2026-01-06",
      payeeType: "subcontractor", payeeId: "sub-1",
    });
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "agent_commission", amount: 500, expenseDate: "2026-01-07",
      payeeType: "agent", payeeId: "agent-1",
    });

    const projectFinancials = await services.financialEngine.getProjectFinancials(project.id);
    const estimateFinancials = await services.financialEngine.getEstimateFinancials(estimate.id);

    // Same revenue basis in this scenario…
    expect(estimateFinancials.revisedTotal).toBe(projectFinancials.revisedTotal);

    // …therefore identical cost and profit. 3500 = the three expense
    // rows, counted once each.
    expect(estimateFinancials.totalExpenses).toBe(projectFinancials.totalExpenses);
    expect(estimateFinancials.totalExpenses).toBe(3500);
    expect(estimateFinancials.expenseItems).toBe(3500);
    expect(estimateFinancials.subcontractorCosts).toBe(2000);
    expect(estimateFinancials.netProfit).toBe(projectFinancials.netProfit);
    expect(estimateFinancials.grossProfit).toBe(projectFinancials.grossProfit);
    expect(estimateFinancials.profitMargin).toBeCloseTo(projectFinancials.profitMargin, 6);
  });

  test("both levels expose the same breakdown, and it reconciles with the total", async () => {
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Breakdown Job" });
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
      lineItems: [{ category: "material", name: "Scope", description: "", quantity: 1, unitPrice: 8000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.estimateService.changeStatus(estimate.id, "sent");
    await services.estimateService.changeStatus(estimate.id, "approved");

    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "labor", amount: 750, expenseDate: "2026-02-01",
    });
    await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 1250,
    });
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      expenseType: "subcontractor", amount: 1250, expenseDate: "2026-02-02",
      payeeType: "subcontractor", payeeId: "sub-1",
    });

    const ef = await services.financialEngine.getEstimateFinancials(estimate.id);
    const pf = await services.financialEngine.getProjectFinancials(project.id);

    // The estimate now exposes expenseItems/mileageCosts, mirroring the
    // project shape, so a caller that needs "expense rows only" still
    // has it instead of reaching past the engine.
    // 750 labor + 1250 subcontractor — expenseItems is EVERY row.
    expect(ef.expenseItems).toBe(2000);
    expect(ef.mileageCosts).toBe(0);
    // …of which 1250 is the subcontractor bucket.
    expect(ef.subcontractorCosts).toBe(1250);

    for (const f of [ef, pf]) {
      // Total is expenses + mileage. The sub/agent figures are subsets
      // of expenseItems, so they must NOT appear in this sum.
      expect(f.expenseItems + f.mileageCosts).toBe(f.totalExpenses);
      const buckets = f.subcontractorCosts + ("agentCosts" in f ? f.agentCosts : f.agentCommissionCosts);
      expect(buckets).toBeLessThanOrEqual(f.expenseItems);
      expect(f.netProfit).toBe(f.revisedTotal - f.totalExpenses);
    }
  });
});
