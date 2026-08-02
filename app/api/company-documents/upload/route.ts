import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseCompanyDocumentService } from "@/lib/services/supabase/companyDocumentService";
import { createValidationService } from "@/lib/services/validationService";
import { COMPANY_DOCUMENT_CATEGORIES, type CompanyDocumentCategory } from "@/lib/services/companyDocumentService";
import { NextRequest, NextResponse } from "next/server";

/**
 * Uploads a company document (or the company logo — see the `kind`
 * field) to the `company-documents` storage bucket, then writes its
 * CompanyDocumentService metadata row — same order/pattern as
 * app/api/estimate-photos/upload/route.ts (upload to Storage first,
 * DB row second, so a row never points at a file that failed to land).
 *
 * `kind: "logo"` skips the metadata row entirely — the company logo is
 * referenced directly by `company_settings.logo_url`, not listed
 * alongside categorized business documents.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const kind = (formData.get("kind") as string | null) ?? "document";
    const category = formData.get("category") as string | null;
    const name = (formData.get("name") as string | null) ?? file?.name ?? "Untitled";
    const expirationDate = (formData.get("expirationDate") as string | null) || null;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (kind === "document" && (!category || !COMPANY_DOCUMENT_CATEGORIES.includes(category as CompanyDocumentCategory))) {
      return NextResponse.json({ error: "Missing or invalid category" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) return NextResponse.json({ error: "User has no company" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || "bin";
    const storagePath =
      kind === "logo"
        ? `logos/${profile.company_id}/${timestamp}.${ext}`
        : `documents/${profile.company_id}/${category}/${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("company-documents")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `Failed to upload file: ${uploadError.message}` }, { status: 500 });
    }

    if (kind === "logo") {
      return NextResponse.json({ success: true, storagePath });
    }

    const validationService = createValidationService();
    const companyDocumentService = createSupabaseCompanyDocumentService(supabase, validationService, async () => user.id);
    const document = await companyDocumentService.create({
      companyId: profile.company_id,
      category: category as CompanyDocumentCategory,
      name,
      storagePath,
      fileType: file.type,
      fileSize: file.size,
      expirationDate,
    });

    return NextResponse.json({ success: true, document });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to upload document" }, { status: 500 });
  }
}
