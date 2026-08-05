/**
 * EstimateService.getScopeLines — the single answer to "what does this
 * estimate quote, and for how much", whatever type it is.
 *
 * THE BUG THIS EXISTS FOR
 * A roofing estimate's total comes from its roof AREAS; its
 * `estimate_items` rows contribute nothing. But the edit form gated its
 * line-item editor on the ROUTE (`!roofV2`) rather than on the estimate
 * type, so opening a roofing estimate via /estimates/[id]/edit offered
 * an editor whose rows fed no total. A user changed a line from $10 to
 * $9, it saved, and the total never moved. Meanwhile InvoiceService,
 * the customer portal and the detail page each independently forgot the
 * same branch — one produced $0 invoices, one showed a breakdown that
 * didn't sum to its own total.
 *
 * THE INVARIANT
 *   sum(getScopeLines(id).total) === estimate.subtotal
 * for BOTH estimate types. That is what makes the facade safe to build
 * consumers on, and it is asserted here directly.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { calculateSubtotal } from "../lib/services/financialCalculations";

const COMPANY_ID = "scope-co";

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

async function makeProject() {
  return services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Scope Job" });
}

async function makeStandardEstimate(unitPrices: number[]) {
  const project = await makeProject();
  const estimate = await services.estimateService.create({
    companyId: COMPANY_ID, projectId: project.id, clientId: "client-1", title: "Standard",
    lineItems: unitPrices.map((p, i) => ({
      category: "material" as const, name: `Item ${i + 1}`, description: null,
      quantity: 1, unitPrice: p, taxable: false,
    })),
    markup: 0, discount: 0, taxRate: 0,
  });
  return { project, estimate };
}

/** A roofing estimate, seeded directly into the store's roofing maps —
 * the in-memory stack models roof areas only as far as the money goes
 * (area identity + the two additive cost sources). */
async function makeRoofingEstimate(areas: Array<{ name: string; repairCost: number; lineItems?: Array<{ name: string; total: number }> }>) {
  const project = await makeProject();
  const estimate = await services.estimateService.create({
    companyId: COMPANY_ID, projectId: project.id, clientId: "client-1", title: "Roofing",
    lineItems: [], markup: 0, discount: 0, taxRate: 0, estimateType: "roofing",
  });

  areas.forEach((a, ai) => {
    const areaId = `area-${ai + 1}`;
    store.roofingAreas.set(areaId, {
      id: areaId, estimateId: estimate.id, areaName: a.name,
      sequenceNumber: ai, estimatedRepairCost: a.repairCost, deletedAt: null,
    });
    (a.lineItems ?? []).forEach((li, li_i) => {
      const id = `${areaId}-li-${li_i + 1}`;
      store.areaLineItems.set(id, {
        id, areaId, category: "material", name: li.name, description: null,
        quantity: 1, unitPrice: li.total, total: li.total, sequenceNumber: li_i, deletedAt: null,
      });
    });
  });

  return { project, estimate: await services.estimateService.recalculateTotal(estimate.id) };
}

describe("getScopeLines: standard estimates", () => {
  test("returns the estimate's own line items", async () => {
    const { estimate } = await makeStandardEstimate([100, 250]);

    const scope = await services.estimateService.getScopeLines(estimate.id);

    expect(scope).toHaveLength(2);
    expect(scope.every((l) => l.source === "estimate_item")).toBe(true);
    expect(scope.map((l) => l.total).sort((a, b) => a - b)).toEqual([100, 250]);
  });

  test("INVARIANT: scope sums to the stored subtotal", async () => {
    const { estimate } = await makeStandardEstimate([100, 250, 75]);
    const scope = await services.estimateService.getScopeLines(estimate.id);

    expect(calculateSubtotal(scope)).toBe(estimate.subtotal);
    expect(estimate.subtotal).toBe(425);
  });
});

describe("getScopeLines: roofing estimates", () => {
  test("combines area line items AND each area's estimated repair cost", async () => {
    // The composition rule that used to live in two files. An area may
    // carry either source, or both.
    const { estimate } = await makeRoofingEstimate([
      { name: "Front Slope", repairCost: 100, lineItems: [{ name: "Shingles", total: 200 }] },
      { name: "Back Slope", repairCost: 50 }, // repair cost only, no line items
    ]);

    const scope = await services.estimateService.getScopeLines(estimate.id);

    expect(calculateSubtotal(scope)).toBe(350); // 200 + 100 + 50
    expect(scope.filter((l) => l.source === "area_line_item")).toHaveLength(1);
    expect(scope.filter((l) => l.source === "area_repair_cost")).toHaveLength(2);
    // No estimate_items ever appear for a roofing estimate.
    expect(scope.some((l) => l.source === "estimate_item")).toBe(false);
  });

  test("INVARIANT: scope sums to the stored subtotal", async () => {
    const { estimate } = await makeRoofingEstimate([
      { name: "Front Slope", repairCost: 100, lineItems: [{ name: "Shingles", total: 200 }] },
    ]);

    const scope = await services.estimateService.getScopeLines(estimate.id);
    expect(calculateSubtotal(scope)).toBe(estimate.subtotal);
    expect(estimate.subtotal).toBe(300);
  });

  test("an area contributing nothing adds no phantom line", async () => {
    const { estimate } = await makeRoofingEstimate([
      { name: "Front Slope", repairCost: 100 },
      { name: "Empty Area", repairCost: 0 },
    ]);

    const scope = await services.estimateService.getScopeLines(estimate.id);
    expect(scope).toHaveLength(1);
    expect(calculateSubtotal(scope)).toBe(estimate.subtotal);
  });

  test("lines carry their area for grouping in the PDF", async () => {
    const { estimate } = await makeRoofingEstimate([
      { name: "Front Slope", repairCost: 0, lineItems: [{ name: "Shingles", total: 200 }] },
    ]);

    const [line] = await services.estimateService.getScopeLines(estimate.id);
    expect(line.areaName).toBe("Front Slope");
    expect(line.areaId).toBe("area-1");
  });
});

describe("Roofing estimates refuse line-item writes", () => {
  test("updateLineItems is rejected, so no invisible rows can be created", async () => {
    const { estimate } = await makeRoofingEstimate([{ name: "Front Slope", repairCost: 100 }]);

    await expect(
      services.estimateService.updateLineItems(estimate.id, [
        { category: "material", name: "d", description: null, quantity: 1, unitPrice: 9, taxable: false },
      ])
    ).rejects.toThrow(/roofing estimate/i);

    // The total is untouched, and no orphan was created.
    const after = await services.estimateService.getById(estimate.id);
    expect(after!.total).toBe(100);
    expect(await services.estimateService.getScopeLines(estimate.id)).toHaveLength(1);
  });

  test("a standard estimate still accepts them", async () => {
    const { estimate } = await makeStandardEstimate([100]);

    const updated = await services.estimateService.updateLineItems(estimate.id, [
      { category: "material", name: "Replacement", description: null, quantity: 1, unitPrice: 175, taxable: false },
    ]);

    expect(updated.subtotal).toBe(175);
    expect(calculateSubtotal(await services.estimateService.getScopeLines(estimate.id))).toBe(175);
  });
});

describe("Totals stay derived from scope", () => {
  test("editing roofing scope moves the total; the estimate_items path cannot", async () => {
    const { estimate } = await makeRoofingEstimate([{ name: "Front Slope", repairCost: 100 }]);
    expect(estimate.total).toBe(100);

    // Real roofing scope change — the area's repair cost.
    store.roofingAreas.set("area-1", { ...store.roofingAreas.get("area-1")!, estimatedRepairCost: 250 });
    const after = await services.estimateService.recalculateTotal(estimate.id);

    expect(after.subtotal).toBe(250);
    expect(after.total).toBe(250);
    expect(calculateSubtotal(await services.estimateService.getScopeLines(estimate.id))).toBe(250);
  });

  test("markup, discount and tax apply on top of scope for both types", async () => {
    const { estimate: std } = await makeStandardEstimate([1000]);
    await services.estimateService.update(std.id, { markup: 100, discount: 50, taxRate: 10 });
    const stdAfter = await services.estimateService.recalculateTotal(std.id);
    expect(stdAfter.subtotal).toBe(1000); // scope is unchanged by adjustments
    expect(stdAfter.total).toBeGreaterThan(1000);

    const { estimate: roof } = await makeRoofingEstimate([{ name: "A", repairCost: 1000 }]);
    await services.estimateService.update(roof.id, { markup: 100, discount: 50, taxRate: 10 });
    const roofAfter = await services.estimateService.recalculateTotal(roof.id);
    expect(roofAfter.subtotal).toBe(1000);
    expect(roofAfter.total).toBe(stdAfter.total); // identical rules, different source
  });
});

describe("estimate_type is locked once scope exists", () => {
  test("a standard estimate with line items cannot become roofing", async () => {
    const { estimate } = await makeStandardEstimate([10_000]);

    await expect(
      services.estimateService.update(estimate.id, { estimateType: "roofing" })
    ).rejects.toThrow(/cannot be changed/i);

    // Still worth what it was — the failure mode this prevents is the
    // total silently dropping to $0 as its scope source switches.
    const after = await services.estimateService.getById(estimate.id);
    expect(after!.total).toBe(10_000);
  });

  test("a roofing estimate with areas cannot become standard", async () => {
    const { estimate } = await makeRoofingEstimate([{ name: "Front Slope", repairCost: 500 }]);

    await expect(
      services.estimateService.update(estimate.id, { estimateType: "standard" })
    ).rejects.toThrow(/cannot be changed/i);
  });

  test("an EMPTY estimate may still change type — nothing to strand", async () => {
    const project = await makeProject();
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: "client-1", title: "Empty",
      lineItems: [], markup: 0, discount: 0, taxRate: 0,
    });

    const updated = await services.estimateService.update(estimate.id, { estimateType: "roofing" });
    expect(updated.estimateType).toBe("roofing");
  });

  test("setting the type to its CURRENT value is always allowed", async () => {
    // Every form submit sends estimateType, including when unchanged —
    // this must not become an error on save.
    const { estimate } = await makeStandardEstimate([100]);
    const updated = await services.estimateService.update(estimate.id, { estimateType: "standard", title: "Renamed" });
    expect(updated.title).toBe("Renamed");
  });
});
