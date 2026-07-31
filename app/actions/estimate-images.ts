"use server";

export async function uploadRoofingPhoto(
  estimateId: string,
  areaId: string,
  photoType: "before" | "after",
  file: File
) {
  // Photo upload handled via route handler in app/api/estimate-photos/upload/route.ts
  throw new Error("Not implemented in this version");
}

export async function deleteRoofingPhoto(photoId: string) {
  // Photo deletion handled via service layer
  throw new Error("Not implemented in this version");
}
