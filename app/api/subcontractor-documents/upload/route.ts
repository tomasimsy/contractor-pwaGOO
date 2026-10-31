import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseSubcontractorDocumentService } from "@/lib/services/supabase/subcontractorDocumentService";
import { createValidationService } from "@/lib/services/validationService";
import { SUB_DOCUMENT_TYPES, type SubDocumentType } from "@/lib/services/subcontractorDocumentService";
import { NextRequest, NextResponse } from "next/server";

/**
 * Uploads a subcontractor's document (W-9, insurance certificate,
 * license, agreement...) to the private `company-documents` bucket, then
 * writes its `subcontractor_documents` row. Same order as
 * app/api/company-documents/upload: file first, row second, so a row
 * never points at a file that failed to land.
 *
 * Path: documents/<company_id>/subcontractors/<subcontractor_id>/<ts>.<ext>
 * — element 2 is the company id, which is what the bucket's storage
 * policies check. Files are read back through
 * /api/company-documents/download, which serves this bucket.
 */

/** Certificates and W-9s arrive as PDFs or phone photos. */
const ALLOWED_EXT = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic", "doc", "docx"]);
const MAX_BYTES = 15 * 1024 * 1024;

const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const subcontractorId = text(formData.get("subcontractorId"));
    const docType = text(formData.get("docType"));

    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (!subcontractorId) return NextResponse.json({ error: "Missing subcontractor" }, { status: 400 });
    if (!docType || !SUB_DOCUMENT_TYPES.includes(docType as SubDocumentType)) {
      return NextResponse.json({ error: "Missing or invalid document type" }, { status: 400 });
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: "Upload a PDF, photo or Word document." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is larger than 15 MB." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) return NextResponse.json({ error: "User has no company" }, { status: 400 });

    // RLS limits this read to the caller's company, so a sub id from
    // another company comes back empty.
    const { data: sub } = await supabase
      .from("subcontractors")
      .select("id")
      .eq("id", subcontractorId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!sub) return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });

    const storagePath = `documents/${profile.company_id}/subcontractors/${subcontractorId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("company-documents")
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `Failed to upload file: ${uploadError.message}` }, { status: 500 });
    }

    const coverage = text(formData.get("coverageAmount"));
    const additionalInsured = text(formData.get("additionalInsured"));
    const service = createSupabaseSubcontractorDocumentService(supabase, createValidationService(), async () => user.id);
    const document = await service.create({
      companyId: profile.company_id,
      subcontractorId,
      docType: docType as SubDocumentType,
      name: text(formData.get("name")) ?? file.name,
      storagePath,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      issuedDate: text(formData.get("issuedDate")),
      expirationDate: text(formData.get("expirationDate")),
      carrier: text(formData.get("carrier")),
      policyNumber: text(formData.get("policyNumber")),
      coverageAmount: coverage == null ? null : Number(coverage) || null,
      additionalInsured: additionalInsured == null ? null : additionalInsured === "true",
      notes: text(formData.get("notes")),
    });

    return NextResponse.json({ success: true, document });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to upload document" }, { status: 500 });
  }
}
