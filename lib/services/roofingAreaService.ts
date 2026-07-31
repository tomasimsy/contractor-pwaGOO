/**
 * RoofingAreaService — owns `estimate_areas` + `estimate_area_photos`.
 *
 * Follows the same pattern as EstimateService: clean interface with
 * Supabase implementation. Manages roof areas (sections) within a roofing
 * estimate, plus their before/after photos.
 *
 * Photos are stored in Supabase storage at:
 *   estimate-photos/{estimateId}/{areaId}/{photoType}/{filename}
 *
 * This service handles:
 * - CRUD for roof areas (create, read, update, delete/soft-delete)
 * - Photo management (upload records, soft delete)
 * - Listing areas for an estimate
 * - NO calculation of area totals — those are set by the caller
 */
import type { UUID, AuditedEntity } from "./types";

export interface RoofingPhoto {
  id: UUID;
  areaId: UUID;
  photoType: "before" | "after";
  storagePath: string;
  displayOrder: number;
  createdAt: string;
  deletedAt: string | null;
}

/** Allowed units for a Roof Area's repair-item Quantity — deliberately
 * a different list from estimate_area_line_items.unit (EA/SF/SQFT/SQ/
 * LF/FT/HR/DAY/LS): this field describes a whole repair item (e.g.
 * "3 Bundle", "2 Sheet"), not a line-item unit of sale. See the
 * migration's comment for why these are two separate CHECK
 * constraints rather than one shared list. */
export const ROOFING_AREA_QUANTITY_UNITS = [
  "EA", "SF", "LF", "SQ", "Bundle", "Sheet", "Roll", "Piece", "Hour", "Day", "Other",
] as const;
export type RoofingAreaQuantityUnit = (typeof ROOFING_AREA_QUANTITY_UNITS)[number];

export interface RoofingArea extends AuditedEntity {
  estimateId: UUID;
  companyId: UUID;
  areaName: string;
  sequenceNumber: number;
  scopeItems: string | null;
  /** Area-specific cost. NOT derived—caller sets this. Used by the V1 Roofing tab. */
  areaTotal: number;
  /** Estimate Roof V2 only. Null for legacy/V1 rows. */
  measurements?: string | null;
  /** Estimate Roof V2 only. Null for legacy/V1 rows. */
  inspectionNotes?: string | null;
  /** Estimate Roof V2 only. Null for legacy/V1 rows. */
  notes?: string | null;
  /** Repair-item quantity. Defaults to 1. */
  quantity: number;
  /** Unit for `quantity` — see ROOFING_AREA_QUANTITY_UNITS. */
  quantityUnit: RoofingAreaQuantityUnit | null;
  /** Defect description (multi-line). */
  defect: string | null;
  /** Where on the roof/property this defect is located. */
  location: string | null;
  /** Planned corrective action (multi-line). */
  correctiveAction: string | null;
  /** Materials included in the repair (multi-line). */
  materialsIncluded: string | null;
  /** Material cost for this repair item. */
  materialCost: number;
  /** Labor cost for this repair item. */
  laborCost: number;
  /** Tax amount for this repair item. */
  tax: number;
  /** Auto-calculated: materialCost + laborCost + tax. Always written by
   * the service via calculateAreaRepairCost() — never accept this as a
   * caller-supplied value that could drift from its inputs. */
  estimatedRepairCost: number;
  /** Photos grouped by type, loaded on demand */
  beforePhotos?: RoofingPhoto[];
  afterPhotos?: RoofingPhoto[];
}

export interface RoofingAreaCreateInput {
  estimateId: UUID;
  companyId: UUID;
  areaName: string;
  sequenceNumber: number;
  scopeItems?: string | null;
  areaTotal: number;
  measurements?: string | null;
  inspectionNotes?: string | null;
  notes?: string | null;
  quantity?: number;
  quantityUnit?: RoofingAreaQuantityUnit | null;
  defect?: string | null;
  location?: string | null;
  correctiveAction?: string | null;
  materialsIncluded?: string | null;
  materialCost?: number;
  laborCost?: number;
  tax?: number;
}

export interface RoofingAreaUpdateInput {
  areaName?: string;
  sequenceNumber?: number;
  scopeItems?: string | null;
  areaTotal?: number;
  measurements?: string | null;
  inspectionNotes?: string | null;
  notes?: string | null;
  quantity?: number;
  quantityUnit?: RoofingAreaQuantityUnit | null;
  defect?: string | null;
  location?: string | null;
  correctiveAction?: string | null;
  materialsIncluded?: string | null;
  materialCost?: number;
  laborCost?: number;
  tax?: number;
}

export interface RoofingPhotoCreateInput {
  areaId: UUID;
  companyId: UUID;
  photoType: "before" | "after";
  storagePath: string;
}

export interface RoofingAreaService {
  /**
   * Fetch all non-deleted roof areas for an estimate, ordered by sequence.
   * Optionally load photos for each area.
   */
  listForEstimate(estimateId: UUID, withPhotos?: boolean): Promise<RoofingArea[]>;

  /**
   * Fetch a single roof area by ID.
   */
  getById(areaId: UUID): Promise<RoofingArea | null>;

  /**
   * Create a new roof area.
   */
  create(input: RoofingAreaCreateInput): Promise<RoofingArea>;

  /**
   * Update a roof area's properties (name, sequence, scope, total).
   */
  update(areaId: UUID, changes: RoofingAreaUpdateInput): Promise<RoofingArea>;

  /**
   * Soft-delete a roof area. Photos remain (could be cleaned up later).
   */
  softDelete(areaId: UUID, reason: string): Promise<void>;

  /**
   * Restore a soft-deleted roof area.
   */
  restore(areaId: UUID): Promise<void>;

  /**
   * Fetch all photos for an area, grouped by type.
   */
  getPhotosForArea(areaId: UUID): Promise<{ before: RoofingPhoto[]; after: RoofingPhoto[] }>;

  /**
   * Record a photo upload in the database.
   */
  createPhoto(input: RoofingPhotoCreateInput): Promise<RoofingPhoto>;

  /**
   * Soft-delete a photo record.
   */
  deletePhoto(photoId: UUID, reason: string): Promise<void>;
}
