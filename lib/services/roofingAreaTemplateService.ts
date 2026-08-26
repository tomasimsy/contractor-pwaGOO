/**
 * RoofingAreaTemplateService — owns `roofing_area_templates`.
 *
 * A technician-saved, reusable set of Roof Area field values (defect,
 * corrective action, scope, materials, default costs) — the "Load
 * Template" dropdown in RoofingAreasEditorV2 applies one of these to a
 * brand-new area's local draft state. Purely a starting point: loading
 * a template just prefills fields the same way typing does, never a
 * live link back to the template afterward, and never touches
 * estimate_areas/estimate_items or any calculation.
 */
import type { UUID, AuditedEntity } from "./types";
import type { RoofingAreaQuantityUnit } from "./roofingAreaService";

export interface RoofingAreaTemplate extends AuditedEntity {
  companyId: UUID;
  name: string;
  areaName: string;
  quantity: number;
  quantityUnit: RoofingAreaQuantityUnit | null;
  defect: string | null;
  location: string | null;
  correctiveAction: string | null;
  materialsIncluded: string | null;
  scopeItems: string | null;
  materialCost: number;
  laborCost: number;
  tax: number;
}

export interface RoofingAreaTemplateInput {
  companyId: UUID;
  name: string;
  areaName: string;
  quantity: number;
  quantityUnit: RoofingAreaQuantityUnit | null;
  defect: string | null;
  location: string | null;
  correctiveAction: string | null;
  materialsIncluded: string | null;
  scopeItems: string | null;
  materialCost: number;
  laborCost: number;
  tax: number;
}

export interface RoofingAreaTemplateService {
  listForCompany(companyId: UUID): Promise<RoofingAreaTemplate[]>;
  create(input: RoofingAreaTemplateInput): Promise<RoofingAreaTemplate>;
  softDelete(templateId: UUID, reason: string): Promise<void>;
}
