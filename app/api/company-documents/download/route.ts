import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Serves files from the `company-documents` storage bucket — the
 * company logo AND every uploaded business document, both stored
 * there (see app/api/company-documents/upload/route.ts). Same shape as
 * app/api/estimate-photos/download/route.ts.
 */
export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get("path");
    const contentTypeParam = request.nextUrl.searchParams.get("contentType");
    if (!path) return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.storage.from("company-documents").download(path);
    if (error) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const arrayBuffer = await data.arrayBuffer();
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const extToContentType: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
      pdf: "application/pdf",
      doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const contentType = contentTypeParam || extToContentType[ext] || "application/octet-stream";

    return new NextResponse(arrayBuffer, {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
