import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "co-list-summaries";

let services: InMemoryServices;

beforeEach(() => {
  services = createInMemoryServices(createInMemoryStore());
});

describe("estimateService.listSummaries", () => {
  it("returns list rows with project and client names and no signature or line items", async () => {
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Maple Roof Job" });
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID,
      projectId: project.id,
      clientId: "client-1",
      title: "Front slope",
      lineItems: [{ category: "material", name: "Shingles", description: null, quantity: 1, unitPrice: 300, taxable: false }],
      markup: 0,
      discount: 0,
      taxRate: 0,
      estimateType: "roofing",
    });

    const { rows, total } = await services.estimateService.listSummaries({ companyId: COMPANY_ID });

    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe(estimate.id);
    expect(row.title).toBe("Front slope");
    expect(row.estimateType).toBe("roofing");
    expect(row.total).toBe(estimate.total);
    expect(row.projectName).toBe("Maple Roof Job");
    expect(row.clientName).not.toBeUndefined();
    expect(row).not.toHaveProperty("signature");
    expect(row).not.toHaveProperty("lineItems");
  });

  it("counts estimates by status and filters by several statuses", async () => {
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Counts Job" });
    const make = (title: string) =>
      services.estimateService.create({
        companyId: COMPANY_ID, projectId: project.id, clientId: "client-1", title,
        lineItems: [{ category: "material", name: "Shingles", description: null, quantity: 1, unitPrice: 100, taxable: false }],
        markup: 0, discount: 0, taxRate: 0, estimateType: "roofing",
      });
    const a = await make("A");
    await make("B");
    await services.estimateService.changeStatus(a.id, "sent");

    const counts = await services.estimateService.countsByStatus({ companyId: COMPANY_ID }, "roofing");
    expect(counts.draft).toBe(1);
    expect(counts.sent).toBe(1);

    const sentOnly = await services.estimateService.listSummaries({ companyId: COMPANY_ID }, { statuses: ["sent", "viewed"] });
    expect(sentOnly.total).toBe(1);
    expect(sentOnly.rows[0].id).toBe(a.id);
  });

  it("filters by type and pages the results", async () => {
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Paging Job" });
    for (let i = 0; i < 3; i++) {
      await services.estimateService.create({
        companyId: COMPANY_ID, projectId: project.id, clientId: "client-1", title: `Roof ${i}`,
        lineItems: [{ category: "material", name: "Shingles", description: null, quantity: 1, unitPrice: 100 + i, taxable: false }],
        markup: 0, discount: 0, taxRate: 0, estimateType: "roofing",
      });
    }
    await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: "client-1", title: "Standard job",
      lineItems: [{ category: "material", name: "Paint", description: null, quantity: 1, unitPrice: 50, taxable: false }],
      markup: 0, discount: 0, taxRate: 0, estimateType: "standard",
    });

    const roofing = await services.estimateService.listSummaries({ companyId: COMPANY_ID }, { estimateType: "roofing", pageSize: 2, page: 1 });
    expect(roofing.total).toBe(3);
    expect(roofing.rows).toHaveLength(2);

    const second = await services.estimateService.listSummaries({ companyId: COMPANY_ID }, { estimateType: "roofing", pageSize: 2, page: 2 });
    expect(second.rows).toHaveLength(1);
    expect(second.rows.every((r) => r.estimateType === "roofing")).toBe(true);

    const byProject = await services.estimateService.listSummaries({ companyId: COMPANY_ID }, { projectName: "no such project" });
    expect(byProject).toEqual({ rows: [], total: 0 });
  });
});
