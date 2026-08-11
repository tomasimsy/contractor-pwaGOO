import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendEstimateEmail } from "@/lib/email/sendEstimateEmail";

/**
 * "Email Customer" — staff-only, cookie-authenticated (same pattern as
 * app/api/reports/cpa-package/route.ts). Not for customer use; there's
 * no customerToken mode here at all.
 *
 * Body: { to?: string; subject: string; message: string }
 * `to` overrides the client's stored email; `subject`/`message` are
 * staff-edited in the "Email Customer" modal before this is called —
 * nothing is ever sent without a human seeing and approving the text.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.subject !== "string" || typeof body.message !== "string" || !body.subject.trim() || !body.message.trim()) {
      return NextResponse.json({ ok: false, error: "Subject and message are required." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    const companyId = profile?.company_id as string | undefined;
    if (!companyId) return NextResponse.json({ ok: false, error: "User has no company" }, { status: 400 });

    // Ownership check — a staff session must not be able to email
    // another company's estimate just by guessing an id. The cookie
    // client's own RLS would likely block the underlying read anyway,
    // but this makes the boundary explicit and gives a clear 403
    // instead of a confusing "not found" from deep inside the send path.
    const { data: estimateRow } = await supabase.from("estimates").select("company_id").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!estimateRow) return NextResponse.json({ ok: false, error: "Estimate not found." }, { status: 404 });
    if (estimateRow.company_id !== companyId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const result = await sendEstimateEmail({
      supabase,
      estimateId: id,
      origin: request.nextUrl.origin,
      to: typeof body.to === "string" && body.to.trim() ? body.to.trim() : undefined,
      subject: body.subject.trim(),
      message: body.message,
      actorUserId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }
    return NextResponse.json({ ok: true, emailId: result.emailId });
  } catch (error) {
    console.error("send-email route failed:", error);
    return NextResponse.json({ ok: false, error: "Unexpected server error while sending the email." }, { status: 500 });
  }
}
