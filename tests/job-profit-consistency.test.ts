/**
 * getProjectFinancials and getEstimateFinancials must share ONE
 * definition of total cost and net profit (financialCalculations.
 * calculateJobProfit).
 *
 * They diverged before: getProjectFinancials summed all four cost
 * sources, while getEstimateFinancials summed ONLY expense rows — so the
 * same job reported a higher net profit at the estimate level than at
 * the project level, and the Estimate page's "Project Total Cost" tile
 * showed a number that excluded the subcontractors and agents actually
 * working the job.
 *
 * These tests pin the shared rule so the two can't drift apart again.
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
  test("total cost is the sum of all four normalized sources", () => {
    const p = calculateJobProfit(10000, {
      expenseItems: 1000,
      mileageCosts: 100,
      subcontractorCosts: 2000,
      agentCosts: 500,
    });
    expect(p.totalExpenses).toBe(3600);
    expect(p.netProfit).toBe(6400); // 10000 − 3600
    // Gross deliberately subtracts only contracted labour.
    expect(p.grossProfit).toBe(7500); // 10000 − (2000 + 500)
    expect(p.profitMargin).toBeCloseTo(64, 6);
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
    await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 2000,
    });
    await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 500,
    });

    const projectFinancials = await services.financialEngine.getProjectFinancials(project.id);
    const estimateFinancials = await services.financialEngine.getEstimateFinancials(estimate.id);

    // Same revenue basis in this scenario…
    expect(estimateFinancials.revisedTotal).toBe(projectFinancials.revisedTotal);

    // …therefore identical cost and profit. This is the assertion that
    // used to fail: the estimate reported 1000, the project 3500.
    expect(estimateFinancials.totalExpenses).toBe(projectFinancials.totalExpenses);
    expect(estimateFinancials.totalExpenses).toBe(3500); // 1000 + 2000 + 500
    expect(estimateFinancials.netProfit).toBe(projectFinancials.netProfit);
    expect(estimateFinancials.grossProfit).toBe(projectFinancials.grossProfit);
    expect(estimateFinancials.profitMargin).toBeCloseTo(projectFinancials.profitMargin, 6);
  });

  test("both levels expose the same four-source breakdown, and it reconciles with the total", async () => {
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

    const ef = await services.financialEngine.getEstimateFinancials(estimate.id);
    const pf = await services.financialEngine.getProjectFinancials(project.id);

    // The estimate now exposes expenseItems/mileageCosts, mirroring the
    // project shape, so a caller that needs "expense rows only" still
    // has it instead of reaching past the engine.
    expect(ef.expenseItems).toBe(750);
    expect(ef.mileageCosts).toBe(0);
    expect(ef.subcontractorCosts).toBe(1250);

    for (const f of [ef, pf]) {
      const breakdownSum =
        f.expenseItems +
        f.mileageCosts +
        f.subcontractorCosts +
        ("agentCosts" in f ? f.agentCosts : f.agentCommissionCosts);
      expect(breakdownSum).toBe(f.totalExpenses);
      expect(f.netProfit).toBe(f.revisedTotal - f.totalExpenses);
    }
  });
});
