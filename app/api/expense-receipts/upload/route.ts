import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Uploads a receipt photo to the `expense-receipts` storage bucket —
 * same shape as app/api/company-documents/upload/route.ts and
 * app/api/estimate-photos/upload/route.ts (server-side client, resolve
 * the actor's company, build a company-scoped path, upload).
 *
 * This route ONLY stores the photo bytes and returns its public URL —
 * it does not write the `expense_receipts` metadata row. That happens
 * client-side afterward via ExpenseReceiptService.create(), once the
 * caller also has the real expense id (the expense itself is created
 * first — see app/(app)/expense-v2/page.tsx's handleSubmit) and
 * whatever OCR-derived vendor/amount/date the user has confirmed.
 * Keeping this route single-purpose (upload bytes, return URL) matches
 * every other upload route in this codebase.
 *
 * Bucket is PUBLIC (confirmed live) — getPublicUrl works with no signed
 * URL/expiry, unlike the private company-documents bucket's own
 * download route.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const expenseId = formData.get("expenseId") as string | null;

    if (!file || !expenseId) {
      return NextResponse.json({ error: "Missing file or expenseId" }, { status: 400 });
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
    const ext = file.name.split(".").pop() || "jpg";
    // Element 2 of storage.foldername(name) must be the company id —
    // that's what 20260818153300_expense_receipts_rls.sql's object
    // policies key off.
    const storagePath = `receipts/${profile.company_id}/${expenseId}/${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("expense-receipts")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `Failed to upload receipt: ${uploadError.message}` }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from("expense-receipts").getPublicUrl(storagePath);

    return NextResponse.json({ success: true, url: publicUrlData.publicUrl, storagePath });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to upload receipt" }, { status: 500 });
  }
}
