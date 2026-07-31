/**
 * Supabase implementation of EstimatePhotoService.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstimatePhoto, EstimatePhotoService } from "../estimatePhotoService";
import type { UUID } from "../types";

interface EstimatePhotoRow {
  id: string;
  estimate_id: string;
  company_id: string;
  photo_type: "before" | "after";
  storage_path: string;
  display_order: number;
  created_at: string;
  deleted_at: string | null;
}

function mapPhotoRow(row: EstimatePhotoRow): EstimatePhoto {
  return {
    id: row.id as UUID,
    estimateId: row.estimate_id as UUID,
    companyId: row.company_id as UUID,
    photoType: row.photo_type,
    storagePath: row.storage_path,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export function createEstimatePhotoService(supabase: SupabaseClient): EstimatePhotoService {
  return {
    async getForEstimate(estimateId) {
      const { data: photos, error } = await supabase
        .from("estimate_photos")
        .select("*")
        .eq("estimate_id", estimateId)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });

      if (error) throw error;

      const mapped = (photos || []).map(mapPhotoRow);
      return {
        before: mapped.filter((p) => p.photoType === "before"),
        after: mapped.filter((p) => p.photoType === "after"),
      };
    },

    async create(input) {
      const { data: photo, error } = await supabase
        .from("estimate_photos")
        .insert({
          estimate_id: input.estimateId,
          company_id: input.companyId,
          photo_type: input.photoType,
          storage_path: input.storagePath,
          display_order: 0,
        })
        .select()
        .single();

      if (error) throw error;

      return mapPhotoRow(photo);
    },

    async softDelete(photoId) {
      const { error } = await supabase
        .from("estimate_photos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", photoId);

      if (error) throw error;
    },

    async restore(photoId) {
      const { error } = await supabase
        .from("estimate_photos")
        .update({ deleted_at: null })
        .eq("id", photoId);

      if (error) throw error;
    },
  };
}
