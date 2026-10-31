import { describe, it, expect } from "vitest";
import { renderEstimateProposalHtml, type EstimateProposalData } from "../lib/pdf/estimateProposal";

/**
 * The PDF should show the form's fields: the project, and for each roof area
 * its measurements and notes, next to the fields it already showed.
 */
function roofingData(overrides: Partial<EstimateProposalData> = {}): EstimateProposalData {
  const area = {
    id: "area-1",
    area_name: "Front slope",
    estimated_repair_cost: 500,
    material_cost: 300,
    labor_cost: 150,
    tax: 50,
    quantity: 2,
    quantity_unit: "SQ",
    location: "NE corner",
    defect: "Lifted shingles",
    corrective_action: "Replace shingles",
    materials_included: "Shingles",
    measurements: "24 SQ, 12/12 pitch",
    notes: "Customer prefers the lighter color",
    scope_items: null,
    sequence_number: 1,
  };
  return {
    estimate: {
      id: "est-1",
      estimate_number: "OSR-1",
      title: "Roof job",
      description: "Scope overview",
      created_at: "2026-10-01T00:00:00Z",
      estimate_type: "roofing",
      tax_rate: 0,
      markup: 0,
      discount: 0,
      deposit_amount: 0,
      terms_template: "custom",
    },
    client: { name: "Jane Client", phone: null, email: null, address: null },
    propertyAddress: "12 Main St",
    projectName: "Maple Street Job",
    estimateItems: [],
    company: { default_deposit_percentage: 50, name: "One Square Roofing" },
    roofingAreas: [area],
    roofingAreaPhotos: [],
    estimatePhotosByType: { before: [], after: [] },
    photoUrl: (p: string) => `/photo/${p}`,
    origin: "http://localhost:3000",
    subtotal: 500,
    taxAmount: 0,
    markupAmount: 0,
    discountAmount: 0,
    approvedChangeOrderTotal: 0,
    total: 500,
    depositAmount: 250,
    totalMaterialCost: 300,
    totalLaborCost: 150,
    totalRoofTax: 50,
    ...overrides,
  } as unknown as EstimateProposalData;
}

describe("estimate PDF shows the form's fields", () => {
  it("shows the project name under the client", () => {
    const { bodyHtml } = renderEstimateProposalHtml(roofingData());
    expect(bodyHtml).toContain("Project:");
    expect(bodyHtml).toContain("Maple Street Job");
  });

  it("shows each roof area's measurements and notes", () => {
    const { bodyHtml } = renderEstimateProposalHtml(roofingData());
    expect(bodyHtml).toContain("Measurements:");
    expect(bodyHtml).toContain("24 SQ, 12/12 pitch");
    expect(bodyHtml).toContain("Notes");
    expect(bodyHtml).toContain("Customer prefers the lighter color");
  });

  it("still shows the area fields it already showed", () => {
    const { bodyHtml } = renderEstimateProposalHtml(roofingData());
    expect(bodyHtml).toContain("Lifted shingles");
    expect(bodyHtml).toContain("NE corner");
    expect(bodyHtml).toContain("Replace shingles");
    expect(bodyHtml).toContain("Shingles");
  });
});
