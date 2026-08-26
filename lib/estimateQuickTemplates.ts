/**
 * Quick-start presets for the "Scope — Line Items" editor on the
 * standard Estimate form. These are just starting values a user can
 * load with one click and then edit like any other line item — not a
 * new data model, not persisted anywhere of their own. Nothing here
 * changes how an estimate is saved or calculated.
 */
import type { DraftLineItem } from "@/components/estimates/LineItemEditor";
import type { RoofingAreaQuantityUnit } from "@/lib/services/roofingAreaService";

export interface EstimateQuickTemplate {
  key: string;
  label: string;
  /** Suggested title, only applied if the estimate title is still empty. */
  suggestedTitle: string;
  /** Suggested project overview, only applied if it's still empty. */
  suggestedDescription: string;
  items: DraftLineItem[];
}

export const EMERGENCY_ROOF_RESPONSE_TEMPLATE: EstimateQuickTemplate = {
  key: "emergency-roof-response",
  label: "Emergency Roof Response",
  suggestedTitle: "Temporary Roof Repair — Emergency Leak Stabilization",
  suggestedDescription:
    "Temporary repair / emergency stabilization only. This work is intended to reduce or stop active water intrusion until a permanent repair can be completed. The exact time and materials required depend on roof conditions, accessibility, weather, and the extent of the leak or damage. Permanent repairs, if needed, will be quoted separately. Customer approval will be obtained before proceeding with significant additional labor or materials beyond the initial service call.",
  items: [
    {
      category: "labor",
      name: "Emergency Service Call",
      description: "Includes 2 technicians, up to 1 hour on site",
      quantity: 1,
      unitPrice: 295,
      unit: "LS",
      taxable: true,
    },
    {
      category: "labor",
      name: "Additional Crew Time",
      description: "Beyond the first hour ($125/hr per technician)",
      quantity: 0,
      unitPrice: 250,
      unit: "HR",
      taxable: true,
    },
    {
      category: "material",
      name: "Materials",
      description: "Tarping and stabilization materials, billed based on actual use",
      quantity: 1,
      unitPrice: 0,
      unit: "LS",
      taxable: true,
    },
  ],
};

/** Same idea as EMERGENCY_ROOF_RESPONSE_TEMPLATE above, but for a
 * roofing estimate's AREA fields (RoofingAreasEditorV2) instead of
 * flat line items — one click prefills a new area's defect/corrective
 * action/scope/materials with emergency-leak boilerplate a technician
 * can then edit for the specific job, same "starting point, not a
 * saved/named template system" scope as the standard-estimate one. */
export interface RoofingAreaQuickTemplate {
  key: string;
  label: string;
  areaName: string;
  quantity: number;
  quantityUnit: RoofingAreaQuantityUnit;
  defect: string;
  location: string;
  correctiveAction: string;
  materialsIncluded: string;
  scopeItems: string;
  materialCost: number;
  laborCost: number;
  tax: number;
}

export const EMERGENCY_ROOF_AREA_TEMPLATE: RoofingAreaQuickTemplate = {
  key: "emergency-roof-area-response",
  label: "Emergency Roof Response",
  areaName: "Emergency Roof Leak",
  quantity: 1,
  quantityUnit: "EA",
  location: "",
  defect: "Active roof leak identified during emergency inspection. Exact cause and extent to be confirmed on site.",
  correctiveAction:
    "* Inspect the affected area and identify the source of the leak.\n* Apply temporary sealant/tarping to stop active water intrusion.\n* Document conditions found for the permanent repair scope.",
  materialsIncluded: "Roofing sealant, tarp, fasteners, and related materials as needed for temporary stabilization.",
  scopeItems:
    "Temporary repair / emergency stabilization only. Intended to reduce or stop active water intrusion until a permanent repair can be scheduled. Permanent repairs, if needed, will be quoted separately.",
  materialCost: 0,
  laborCost: 295,
  tax: 0,
};
