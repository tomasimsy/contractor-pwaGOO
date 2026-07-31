/**
 * EstimateAreaLineItemService — owns `estimate_area_line_items`.
 *
 * Estimate Roof V2 only. Mirrors the structure of estimate_items but
 * scoped to a single estimate_areas row, so each roofing area can carry
 * its own independent set of priced line items (with units) instead of
 * the single flat `RoofingArea.areaTotal` number the V1 Roofing tab uses.
 *
 * This service does NOT touch estimate_areas.area_total or estimates.total —
 * callers combine calculateSubtotal()/calculateLineItemTotal() (from
 * financialCalculations.ts) with these line items to derive an area
 * subtotal, exactly the same primitives EstimateService uses for the
 * top-level estimate.
 */
import type { UUID } from "./types";

export type EstimateLineItemUnit = "EA" | "SF" | "SQFT" | "SQ" | "LF" | "FT" | "HR" | "DAY" | "LS";

export interface EstimateAreaLineItem {
  id: UUID;
  areaId: UUID;
  companyId: UUID;
  category: "material" | "labor" | "other";
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  unit: EstimateLineItemUnit | null;
  total: number;
  taxable: boolean;
  sequenceNumber: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface EstimateAreaLineItemCreateInput {
  areaId: UUID;
  companyId: UUID;
  category: "material" | "labor" | "other";
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  unit?: EstimateLineItemUnit | null;
  taxable?: boolean;
  sequenceNumber?: number;
}

export interface EstimateAreaLineItemUpdateInput {
  category?: "material" | "labor" | "other";
  name?: string;
  description?: string | null;
  quantity?: number;
  unitPrice?: number;
  unit?: EstimateLineItemUnit | null;
  taxable?: boolean;
  sequenceNumber?: number;
}

export interface EstimateAreaLineItemService {
  /**
   * Fetch all non-deleted line items for a roofing area, ordered by sequence.
   */
  listForArea(areaId: UUID): Promise<EstimateAreaLineItem[]>;

  /**
   * Replace an area's entire line item set in one call (delete-all-then-
   * reinsert), mirroring EstimateService.updateLineItems' pattern so
   * saving an area's line items is a single atomic-feeling operation
   * scoped ONLY to that area — never touches another area's rows.
   */
  replaceForArea(areaId: UUID, companyId: UUID, items: EstimateAreaLineItemCreateInput[]): Promise<EstimateAreaLineItem[]>;

  create(input: EstimateAreaLineItemCreateInput): Promise<EstimateAreaLineItem>;

  update(id: UUID, changes: EstimateAreaLineItemUpdateInput): Promise<EstimateAreaLineItem>;

  softDelete(id: UUID): Promise<void>;
}
