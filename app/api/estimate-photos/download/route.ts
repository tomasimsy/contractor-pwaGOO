import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Serves photo files from Supabase storage.
 * Used by EstimatePhotosEditor and RoofingAreasEditor to display uploaded photos.
 *
 * Query parameters:
 * - path: The storage path of the photo (e.g., estimate-photos/{id}/before/{filename})
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { error: "Missing path parameter" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Get the file from storage
    const { data, error } = await supabase.storage
      .from("estimate-photos")
      .download(path);

    if (error) {
      console.error("Download error:", error);
      return NextResponse.json(
        { error: "Photo not found" },
        { status: 404 }
      );
    }

    // Convert blob to ArrayBuffer
    const arrayBuffer = await data.arrayBuffer();

    // Determine content type based on file extension
    const ext = path.split(".").pop()?.toLowerCase() || "jpg";
    const contentTypeMap: { [key: string]: string } = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    const contentType = contentTypeMap[ext] || "image/jpeg";

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000", // Cache for 1 year
      },
    });
  } catch (error) {
    console.error("Photo download error:", error);
    return NextResponse.json(
      { error: "Failed to download photo" },
      { status: 500 }
    );
  }
}
