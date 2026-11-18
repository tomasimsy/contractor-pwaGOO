"use client";

import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";

// Roof-area before/after photos. Stored in the same bucket as the other
// estimate photos (see components/ui/EstimateCamera.tsx), under a
// roofing/ prefix, with one estimate_area_photos row per file.
const BUCKET = "estimate-images";

export type UploadedRoofingPhoto = {
  id: string;
  storage_path: string;
  url: string;
};

export async function uploadRoofingPhoto(
  estimateId: string,
  areaId: string,
  file: Blob,
  fileName: string,
  photoType: "before" | "after"
): Promise<UploadedRoofingPhoto> {
  const companyId = await getCompanyId();

  // The photo row references estimate_areas, so the area must already be
  // saved. Areas added since the last save only exist in the form.
  const { data: area, error: areaError } = await supabase
    .from("estimate_areas")
    .select("id")
    .eq("id", areaId)
    .eq("estimate_id", estimateId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (areaError) throw areaError;
  if (!area) throw new Error("Save the estimate first, then add photos to this area.");

  const ext = fileName.split(".").pop() || "jpg";
  const storagePath = `roofing/${estimateId}/${areaId}/${photoType}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { count } = await supabase
    .from("estimate_area_photos")
    .select("id", { count: "exact", head: true })
    .eq("estimate_area_id", areaId)
    .eq("photo_type", photoType)
    .is("deleted_at", null);

  const { data: row, error: insertError } = await supabase
    .from("estimate_area_photos")
    .insert({
      estimate_area_id: areaId,
      company_id: companyId,
      photo_type: photoType,
      storage_path: storagePath,
      display_order: count ?? 0,
    })
    .select("id")
    .single();
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw insertError;
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return { id: row.id, storage_path: storagePath, url: urlData.publicUrl };
}

/** Soft-deletes the photo row (the soft-delete trigger keeps the file for restore). */
export async function deleteRoofingPhoto(photoId: string): Promise<void> {
  const companyId = await getCompanyId();
  const { error } = await supabase
    .from("estimate_area_photos")
    .delete()
    .eq("id", photoId)
    .eq("company_id", companyId);
  if (error) throw error;
}
