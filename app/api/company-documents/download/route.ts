import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Serves files from the `company-documents` storage bucket — the
 * company logo AND every uploaded business document, both stored
 * there (see app/api/company-documents/upload/route.ts).
 *
 * ---------------------------------------------------------------
 * CONTENT TYPE IS DERIVED HERE, NEVER TAKEN FROM THE REQUEST
 * ---------------------------------------------------------------
 * This route used to honour a `contentType` query parameter:
 *
 *     const contentType = contentTypeParam || extToContentType[ext] || ...
 *
 * Nothing validates what a user actually uploads, so that let anyone
 * with an account store arbitrary bytes and then choose the
 * Content-Type they were served back with, from this app's own origin:
 *
 *     /api/company-documents/download?path=<uploaded>&contentType=text/html
 *
 * — stored XSS, running with the victim's session cookies on the same
 * origin as the whole app. The parameter is now ignored entirely and
 * the type is decided from the file extension against the fixed
 * allowlist below. The caller cannot influence it.
 *
 * Extensions NOT on the allowlist are served as application/octet-stream
 * and forced to download rather than render, so an unrecognised file can
 * never be interpreted as markup. `X-Content-Type-Options: nosniff`
 * stops the browser second-guessing that decision.
 *
 * SVG is deliberately absent from INLINE_TYPES: an SVG is a document
 * that can carry <script>, so rendering one inline on this origin is
 * the same hole by another name. An uploaded .svg downloads instead.
 *
 * AUTHORIZATION: storage RLS on the `company-documents` bucket is the
 * real boundary — those policies scope by the caller's company via the
 * object path (migration 20260805000100), and this client carries the
 * user's own session, not the service-role key. The explicit user check
 * below is defence in depth and returns a clean 401 rather than a
 * confusing 404: /api/* is exempt from proxy.ts's redirect (an API
 * caller must never receive login HTML), so this route is reachable
 * without a session and should say so plainly.
 */

/** Extension -> type. The ONLY source of Content-Type for this route. */
const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Safe to render in the browser; everything else downloads. Compared
 * against the bare type so the charset-bearing entries still match. */
const INLINE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
]);

export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get("path");
    if (!path) return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.storage.from("company-documents").download(path);
    if (error) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const arrayBuffer = await data.arrayBuffer();

    const ext = path.split(".").pop()?.toLowerCase() || "";
    const contentType = EXT_TO_CONTENT_TYPE[ext] ?? "application/octet-stream";
    const bareType = contentType.split(";")[0].trim();
    const inline = INLINE_TYPES.has(bareType);

    // Filename for the download case. Quotes, backslashes and CR/LF are
    // stripped so the value cannot break out of the header.
    const filename = (path.split("/").pop() || "document").replace(/["\\\r\n]/g, "");

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": inline ? "inline" : `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
