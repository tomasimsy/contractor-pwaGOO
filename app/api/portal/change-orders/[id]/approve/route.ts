import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createServerAppServices } from "@/lib/services/server";

/**
 * Customer-portal Change Order approval — follows the EXACT security
 * model and pattern as app/api/portal/sign/route.ts (see that file's
 * header). A second server-only route permitted to construct a
 * service-role client, not a copy of the first one's logic:
 *
 * 1. SUPABASE_SERVICE_ROLE_KEY read only here, server-only env.
 * 2. Authorization: change_orders has no `customer_token` of its own
 *    (by design — see the migration's comment) — a change order is
 *    looked up by id, then its PARENT estimate's `customer_token` is
 *    checked against the token the request supplies. A wrong or
 *    missing token, a deleted estimate, or a change order that
 *    doesn't belong to that estimate all reject with the same generic
 *    message — never enumerable.
 * 3. All business logic (status transition, ledger booking, estimate
 *    recalculation) happens inside changeOrderWorkflow.approveChangeOrder
 *    — the SAME function the staff Change Order Detail page calls
 *    (app/(app)/change-orders/[id]/page.tsx), just with a signature
 *    attached here where staff pass none.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: changeOrderId } = await params;
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";
    const signatureType = body.signatureType === "draw" || body.signatureType === "type" ? body.signatureType : null;
    const signatureValue = typeof body.signatureValue === "string" ? body.signatureValue : "";

    if (!token || !signatureType || !signatureValue) {
      return NextResponse.json({ ok: false, message: "Missing required fields." }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not set — portal change order approval cannot run.");
      return NextResponse.json(
        { ok: false, message: "This change order could not be approved right now. Please try again shortly or contact us." },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 2 of the security model above: change order -> its parent
    // estimate -> that estimate's customer_token, all in one check.
    const { data: changeOrderRow, error: lookupError } = await supabase
      .from("change_orders")
      .select("id, estimate_id, status, estimates!inner(customer_token, deleted_at)")
      .eq("id", changeOrderId)
      .is("deleted_at", null)
      .maybeSingle();

    if (lookupError) {
      console.error("Portal change order lookup failed:", lookupError.message);
      return NextResponse.json({ ok: false, message: "This change order could not be approved." }, { status: 500 });
    }

    const estimateRel = changeOrderRow?.estimates as unknown as { customer_token: string | null; deleted_at: string | null } | null;
    const tokenMatches = !!changeOrderRow && !!estimateRel && !estimateRel.deleted_at && estimateRel.customer_token === token;

    // Same non-enumerable-failure shape as /api/portal/sign: wrong
    // token, missing change order, and deleted estimate all look
    // identical to the caller.
    if (!tokenMatches) {
      return NextResponse.json({ ok: false, message: "This change order could not be approved." }, { status: 200 });
    }

    const services = createServerAppServices(supabase, async () => null);
    const result = await services.changeOrderWorkflow.approveChangeOrder(changeOrderId, {
      type: signatureType,
      value: signatureValue,
      date: new Date().toISOString(),
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message ?? "This change order could not be approved." }, { status: 200 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Portal change order approve error:", error);
    return NextResponse.json({ ok: false, message: "This change order could not be approved. Please try again." }, { status: 500 });
  }
}
