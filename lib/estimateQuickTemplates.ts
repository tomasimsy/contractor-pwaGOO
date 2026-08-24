/**
 * Quick-start presets for the "Scope — Line Items" editor on the
 * standard Estimate form. These are just starting values a user can
 * load with one click and then edit like any other line item — not a
 * new data model, not persisted anywhere of their own. Nothing here
 * changes how an estimate is saved or calculated.
 */
import type { DraftLineItem } from "@/components/estimates/LineItemEditor";

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
