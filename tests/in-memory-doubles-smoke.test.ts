/**
 * Smoke test for the four in-memory doubles added for the System
 * Integrity Audit (teamAssignmentService, clientService, companyService,
 * billScheduleService). Verifies each behaves correctly BEFORE the
 * audit is built on top of them — a bug here would otherwise surface
 * confusingly deep inside a much larger test.
 */
import { describe, test, expect } from "vitest";
import { createInMemoryServices } from "../lib/services/testing/inMemoryServices";

describe("in-memory doubles — teamAssignmentService", () => {
  test("assign, list, duplicate rejection, paid-guard, soft delete/restore", async () => {
    const services = createInMemoryServices();
    const companyId = crypto.randomUUID();
    const project = await services.projectService.create({ companyId, clientId: null, name: "P1" });
    const client = await services.clientService.create({ companyId, name: "C1" });
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id, lineItems: [],
      markup: 0, discount: 0, taxRate: 0,
    });
    const userId = crypto.randomUUID();

    const a = await services.teamAssignmentService.assign({
      companyId, estimateId: estimate.id, projectId: project.id, userId, amount: 500,
    });
    expect(a.amount).toBe(500);

    const forEstimate = await services.teamAssignmentService.listForEstimate(estimate.id);
    expect(forEstimate.map((x) => x.id)).toEqual([a.id]);

    const scoped = await services.teamAssignmentService.listAssignments({ companyId, projectId: project.id });
    expect(scoped.length).toBe(1);

    await expect(
      services.teamAssignmentService.assign({ companyId, estimateId: estimate.id, projectId: project.id, userId, amount: 100 })
    ).rejects.toThrow(/already assigned/i);

    // Pay $200 of it — the assignment must now be undeletable.
    await services.expenseService.create({
      companyId, projectId: project.id, estimateId: estimate.id,
      expenseType: "labor", amount: 200, expenseDate: "2026-01-01",
      payeeType: "employee", payeeId: userId, paidByType: "company", isPaid: true,
    });
    await expect(services.teamAssignmentService.softDelete(a.id, "test")).rejects.toThrow(/already been paid/i);

    // An assignment with nothing paid CAN be removed.
    const b = await services.teamAssignmentService.assign({
      companyId, estimateId: estimate.id, projectId: project.id, userId: crypto.randomUUID(), amount: 50,
    });
    await services.teamAssignmentService.softDelete(b.id, "test cleanup");
    expect((await services.teamAssignmentService.listForEstimate(estimate.id)).map((x) => x.id)).toEqual([a.id]);
    await services.teamAssignmentService.restore(b.id);
    expect((await services.teamAssignmentService.listForEstimate(estimate.id)).length).toBe(2);
  });
});

describe("in-memory doubles — clientService", () => {
  test("create, update, list excludes soft-deleted, includeDeleted override, restore", async () => {
    const services = createInMemoryServices();
    const companyId = crypto.randomUUID();
    const client = await services.clientService.create({ companyId, name: "Acme", email: "a@acme.com" });
    expect((await services.clientService.list({ companyId })).length).toBe(1);

    const updated = await services.clientService.update(client.id, { phone: "555-1234" });
    expect(updated.phone).toBe("555-1234");

    await services.clientService.softDelete(client.id, "duplicate record");
    expect(await services.clientService.getById(client.id)).toBeNull();
    expect(await services.clientService.getById(client.id, true)).not.toBeNull();
    expect((await services.clientService.list({ companyId })).length).toBe(0);

    await services.clientService.restore(client.id);
    expect(await services.clientService.getById(client.id)).not.toBeNull();
  });
});

describe("in-memory doubles — companyService", () => {
  test("getByCompanyId returns merged defaults for an unconfigured company, update persists", async () => {
    const services = createInMemoryServices();
    const companyId = crypto.randomUUID();

    const defaults = await services.companyService.getByCompanyId(companyId);
    expect(defaults.default_deposit_percentage).toBe(50); // DEFAULT_COMPANY_SETTINGS

    await services.companyService.update(companyId, { company_name: "Acme Roofing", default_deposit_percentage: 30 });
    const after = await services.companyService.getByCompanyId(companyId);
    expect(after.company_name).toBe("Acme Roofing");
    expect(after.default_deposit_percentage).toBe(30);
  });
});

describe("in-memory doubles — billScheduleService", () => {
  test("generateDue writes ONE real expense row through ExpenseService and advances the schedule", async () => {
    const services = createInMemoryServices();
    const companyId = crypto.randomUUID();
    const project = await services.projectService.create({ companyId, clientId: null, name: "P1" });

    const schedule = await services.billScheduleService.create({
      companyId, projectId: project.id, vendor: "Insurance Co", amount: 450,
      expenseType: "miscellaneous", frequency: "monthly", startDate: "2026-01-10",
    });

    const before = await services.expenseService.listForProject(project.id);
    expect(before.length).toBe(0);

    const written = await services.billScheduleService.generateDue(companyId, "2026-01-10");
    expect(written).toBe(1);

    const after = await services.expenseService.listForProject(project.id);
    expect(after.length).toBe(1);
    expect(after[0].amount).toBe(450);
    expect(after[0].vendor).toBe("Insurance Co");
    expect(after[0].isPaid).toBe(false);

    const [refreshed] = await services.billScheduleService.listForCompany(companyId);
    expect(refreshed.nextDueDate).toBe("2026-02-10");
    expect(refreshed.occurrencesGenerated).toBe(1);

    // Idempotent: re-running as-of the SAME date generates nothing more.
    const again = await services.billScheduleService.generateDue(companyId, "2026-01-10");
    expect(again).toBe(0);
    void schedule;
  });
});
