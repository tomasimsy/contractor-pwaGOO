import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Handles photo uploads for both:
 * 1. Estimate-level photos (Before/After for entire estimate) - estimateId only
 * 2. Roofing area photos (Before/After per area) - estimateId + areaId
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const estimateId = formData.get("estimateId") as string;
    const areaId = formData.get("areaId") as string | null;
    const photoType = formData.get("photoType") as "before" | "after";

    if (!file || !estimateId || !photoType) {
      return NextResponse.json(
        { error: "Missing required fields: file, estimateId, photoType" },
        { status: 400 }
      );
    }

    if (!["before", "after"].includes(photoType)) {
      return NextResponse.json(
        { error: "Invalid photo type. Must be 'before' or 'after'" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Get current user for company_id
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json(
        { error: "User has no company" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${timestamp}.${ext}`;

    // Determine storage path based on photo type (estimate vs area)
    let storagePath: string;
    if (areaId) {
      // Roofing area photo
      storagePath = `estimate-area-photos/${estimateId}/${areaId}/${photoType}/${filename}`;
    } else {
      // Estimate-level photo
      storagePath = `estimate-photos/${estimateId}/${photoType}/${filename}`;
    }

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("estimate-photos")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload photo to storage" },
        { status: 500 }
      );
    }

    // Create a database record (estimate-level or area-level)
    let photo = null;

    if (!areaId) {
      // Estimate-level photo
      const { data: insertedPhoto, error: dbError } = await supabase
        .from("estimate_photos")
        .insert({
          estimate_id: estimateId,
          company_id: profile.company_id,
          photo_type: photoType,
          storage_path: storagePath,
          display_order: 0,
        })
        .select()
        .single();

      if (dbError) {
        console.error("Database error (estimate photo):", JSON.stringify(dbError, null, 2));
        return NextResponse.json(
          { error: `Failed to save estimate photo: ${dbError.message}` },
          { status: 500 }
        );
      }

      photo = insertedPhoto;
    } else {
      // Roofing area photo
      const { data: insertedPhoto, error: dbError } = await supabase
        .from("estimate_area_photos")
        .insert({
          estimate_area_id: areaId,
          company_id: profile.company_id,
          photo_type: photoType,
          storage_path: storagePath,
          display_order: 0,
        })
        .select()
        .single();

      if (dbError) {
        console.error("Database error (area photo):", JSON.stringify(dbError, null, 2));
        return NextResponse.json(
          { error: `Failed to save roofing area photo: ${dbError.message}` },
          { status: 500 }
        );
      }

      photo = insertedPhoto;
    }

    return NextResponse.json({
      success: true,
      storagePath,
      filename,
      photo: photo ? {
        id: photo.id,
        estimateId: areaId ? undefined : photo.estimate_id,
        areaId: areaId ? photo.estimate_area_id : undefined,
        companyId: photo.company_id,
        photoType: photo.photo_type,
        storagePath: photo.storage_path,
        displayOrder: photo.display_order,
        createdAt: photo.created_at,
        deletedAt: photo.deleted_at,
      } : null,
    });
  } catch (error) {
    console.error("Photo upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}
