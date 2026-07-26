/**
 * Multiple companies, multiple users. The architecture's entire tenant
 * isolation story rests on QueryScope.companyId being required
 * everywhere (FilteringService.resolveScope throws without one) — this
 * test proves company A's financials never include company B's data,
 * even when both exist in the same in-memory store simultaneously
 * (the closest a fake can get to "same database, different rows").
 */
import { describe, test, expect, beforeAll } from "vitest";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

describe("multi-company and multi-user isolation", () => {
  let services: InMemoryServices;
  let projectA: string;
  let projectB: string;

  beforeAll(async () => {
    services = createInMemoryServices();

    const pA = await services.projectService.create({ companyId: "company-A", clientId: null, name: "Company A Project" });
    projectA = pA.id;
    const estA = await services.estimateService.create({
      companyId: "company-A", projectId: projectA, clientId: null,
      lineItems: [{ category: "material", name: "Item", description: null, quantity: 1, unitPrice: 4000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invA = await services.invoiceService.createFromEstimate(estA.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    // recorded by "user-1"
    await services.paymentService.record({ companyId: "company-A", invoiceId: invA.id, amount: 1000, method: "cash", paymentDate: "2026-01-02" });

    const pB = await services.projectService.create({ companyId: "company-B", clientId: null, name: "Company B Project" });
    projectB = pB.id;
    const estB = await services.estimateService.create({
      companyId: "company-B", projectId: projectB, clientId: null,
      lineItems: [{ category: "material", name: "Item", description: null, quantity: 1, unitPrice: 9000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invB = await services.invoiceService.createFromEstimate(estB.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    // recorded by "user-2" — a different user, different company
    await services.paymentService.record({ companyId: "company-B", invoiceId: invB.id, amount: 7000, method: "check", paymentDate: "2026-01-03" });
  });

  test("company-level financials never mix companies", async () => {
    const range = { start: new Date("2025-12-01"), end: new Date("2026-02-01") };
    const financialsA = await services.financialEngine.getCompanyFinancials({ companyId: "company-A", dateRange: range });
    const financialsB = await services.financialEngine.getCompanyFinancials({ companyId: "company-B", dateRange: range });

    expect(financialsA.totalRevenue).toBe(1000);
    expect(financialsA.totalInvoiced).toBe(4000);
    expect(financialsB.totalRevenue).toBe(7000);
    expect(financialsB.totalInvoiced).toBe(9000);

    // Neither total leaks into the other.
    expect(financialsA.totalRevenue).not.toBe(financialsB.totalRevenue);
  });

  test("project listings are scoped per company", async () => {
    const projectsA = await services.projectService.list({ companyId: "company-A" });
    const projectsB = await services.projectService.list({ companyId: "company-B" });

    expect(projectsA.map((p) => p.id)).toContain(projectA);
    expect(projectsA.map((p) => p.id)).not.toContain(projectB);
    expect(projectsB.map((p) => p.id)).toContain(projectB);
    expect(projectsB.map((p) => p.id)).not.toContain(projectA);
  });

  test("resolveScope refuses to run without a companyId — isolation is not opt-in", () => {
    expect(() => services.filteringService.resolveScope({ companyId: "" })).toThrow(/companyId is required/i);
  });

  test("adjustments are attributed to the actor who made them, per user", async () => {
    const adjustmentByUser1 = await services.transactionService.recordAdjustment({
      companyId: "company-A", projectId: projectA, direction: -1, amount: 50, transactionDate: "2026-01-15", reason: "Bank fee", actorUserId: "user-1",
    });
    const adjustmentByUser2 = await services.transactionService.recordAdjustment({
      companyId: "company-A", projectId: projectA, direction: -1, amount: 75, transactionDate: "2026-01-16", reason: "Reconciling entry", actorUserId: "user-2",
    });

    expect(adjustmentByUser1.createdBy).toBe("user-1");
    expect(adjustmentByUser2.createdBy).toBe("user-2");
    expect(adjustmentByUser1.id).not.toBe(adjustmentByUser2.id);
  });
});
