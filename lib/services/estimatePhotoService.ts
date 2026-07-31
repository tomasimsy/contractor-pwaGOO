/**
 * Estimate photo service — manages Before/After photos for estimates.
 * Distinct from estimate_area_photos (which are per-area in roofing estimates).
 */
import type { UUID } from "./types";

export interface EstimatePhoto {
  id: UUID;
  estimateId: UUID;
  companyId: UUID;
  photoType: "before" | "after";
  storagePath: string;
  displayOrder: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface EstimatePhotoService {
  /** Get all photos for an estimate, grouped by type */
  getForEstimate(estimateId: UUID): Promise<{
    before: EstimatePhoto[];
    after: EstimatePhoto[];
  }>;

  /** Create a photo record (storage upload handled separately) */
  create(input: {
    estimateId: UUID;
    companyId: UUID;
    photoType: "before" | "after";
    storagePath: string;
  }): Promise<EstimatePhoto>;

  /** Delete a photo (soft delete) */
  softDelete(photoId: UUID): Promise<void>;

  /** Restore a deleted photo */
  restore(photoId: UUID): Promise<void>;
}
