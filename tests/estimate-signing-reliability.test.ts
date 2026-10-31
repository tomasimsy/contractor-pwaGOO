import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { signEstimate } from "../lib/services/estimateWorkflow";

/**
 * The signature is the one step that must succeed. A failure in approval or
 * invoicing after it must not report the signature as failed.
 */

const COMPANY_ID = "co-sign-rel";
const SIGNATURE = { type: "type" as const, value: "Jane Customer", date: "2026-01-02" };

let services: InMemoryServices;

beforeEach(() => {
  services = createInMemoryServices(createInMemoryStore());
});

async function sentEstimate() {
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Signing Job" });
  const estimate = await services.estimateService.create({
    companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
    title: "Scope",
    lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 500, taxable: false }],
    markup: 0, discount: 0, taxRate: 0,
  });
  await services.estimateService.changeStatus(estimate.id, "sent");
  return { project, estimate };
}

function depsWith(overrides: Partial<Pick<InMemoryServices, "estimateService" | "invoiceService">>) {
  return {
    estimateService: overrides.estimateService ?? services.estimateService,
    invoiceService: overrides.invoiceService ?? services.invoiceService,
    paymentService: services.paymentService,
    projectService: services.projectService,
  };
}

describe("signEstimate reliability", () => {
  it("signs normally with no follow-up message", async () => {
    const { estimate, project } = await sentEstimate();
    const result = await signEstimate(depsWith({}), estimate.id, SIGNATURE);
    expect(result.ok).toBe(true);
    expect(result.message).toBeUndefined();
    expect((await services.estimateService.getById(estimate.id))?.signature?.value).toBe("Jane Customer");
    expect(await services.invoiceService.listForProject(project.id)).toHaveLength(1);
  });

  it("keeps the signature and reports success when approval is rejected", async () => {
    const { estimate } = await sentEstimate();
    const estimateService = {
      ...services.estimateService,
      changeStatus: async (id: string, status: string) =>
        status === "approved"
          ? { valid: false, issues: [{ field: "status", code: "blocked", message: "Approval blocked for test" }] }
          : services.estimateService.changeStatus(id, status as never),
    } as typeof services.estimateService;

    const result = await signEstimate(depsWith({ estimateService }), estimate.id, SIGNATURE);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("could not be marked approved");
    expect((await services.estimateService.getById(estimate.id))?.signature?.value).toBe("Jane Customer");
  });

  it("keeps the signature and reports success when approval throws", async () => {
    const { estimate } = await sentEstimate();
    const estimateService = {
      ...services.estimateService,
      changeStatus: async (id: string, status: string) => {
        if (status === "approved") throw new Error("database timeout");
        return services.estimateService.changeStatus(id, status as never);
      },
    } as typeof services.estimateService;

    const result = await signEstimate(depsWith({ estimateService }), estimate.id, SIGNATURE);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("database timeout");
    expect((await services.estimateService.getById(estimate.id))?.signature?.value).toBe("Jane Customer");
  });

  it("keeps the signature and reports success when invoice creation fails", async () => {
    const { estimate, project } = await sentEstimate();
    const invoiceService = {
      ...services.invoiceService,
      createFromEstimate: async () => {
        throw new Error("invoice build failed");
      },
    } as typeof services.invoiceService;

    const result = await signEstimate(depsWith({ invoiceService }), estimate.id, SIGNATURE);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("invoice build failed");
    expect((await services.estimateService.getById(estimate.id))?.signature?.value).toBe("Jane Customer");
    expect(await services.invoiceService.listForProject(project.id)).toHaveLength(0);
  });
});
