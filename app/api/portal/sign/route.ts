import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createServerAppServices } from "@/lib/services/server";
import { sendPushToCompany } from "@/lib/push/sendPush";

/**
 * One of two routes in this app permitted to construct a service-role
 * Supabase client (the other is app/api/cron/daily-automations, which
 * has no user session to run RLS-scoped queries under either — see
 * its own header for that route's version of this same trust shape).
 * Replaces the old `sign_estimate_via_token` RPC as
 * the customer-portal's signing entry point — same job (token in,
 * signature written), but now reaches the SAME canonical workflow
 * (lib/services/estimateWorkflow.ts) staff use from EstimateDetail,
 * instead of a second, SQL-only implementation of "what does signing
 * mean." See estimateWorkflow.ts's header for the full architecture
 * and the pattern to follow for any future portal action.
 *
 * SECURITY MODEL — read before touching this file:
 * 1. SUPABASE_SERVICE_ROLE_KEY is read ONLY here, from server-only env
 *    (never NEXT_PUBLIC_*, never sent to any client). It bypasses RLS
 *    entirely, so this route's own authorization check below is the
 *    ONLY thing standing between an anonymous request and every
 *    company's data — the exact same trust shape the old
 *    SECURITY DEFINER Postgres RPC already had (a piece of privileged
 *    code that must get its own check right before doing anything).
 * 2. That check, in order, mirrors what the RPC did: look up the
 *    estimate by `customer_token` (never by id — the id in the URL is
 *    cosmetic), reject if not found/deleted, reject if it already has
 *    a signature (signing is one-shot; this is not an "update
 *    signature" endpoint).
 * 3. Nothing past that point is privileged-code-specific — it's a
 *    normal call into estimateWorkflow.signEstimate(), the identical
 *    function the staff path calls.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";
    const signatureType = body.signatureType === "draw" || body.signatureType === "type" ? body.signatureType : null;
    const signatureValue = typeof body.signatureValue === "string" ? body.signatureValue : "";

    if (!token || !signatureType || !signatureValue) {
      return NextResponse.json({ ok: false, message: "Missing required fields." }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      // Fail loudly rather than silently falling back to a client that
      // can't actually perform this write — matches lib/supabase/env.ts's
      // existing "missing config must be visible immediately" discipline.
      console.error("SUPABASE_SERVICE_ROLE_KEY is not set — portal signing cannot run.");
      return NextResponse.json(
        { ok: false, message: "This estimate could not be signed right now. Please try again shortly or contact us." },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 1 of the security model above: the same lookup+guards the
    // old RPC performed, now in this route instead of SQL.
    const { data: estimateRow, error: lookupError } = await supabase
      .from("estimates")
      .select("id, signature")
      .eq("customer_token", token)
      .is("deleted_at", null)
      .maybeSingle();

    if (lookupError) {
      console.error("Portal sign lookup failed:", lookupError.message);
      return NextResponse.json({ ok: false, message: "This estimate could not be signed." }, { status: 500 });
    }

    // Deliberately the same generic response for "no such token" and
    // "already signed" — same non-enumerable-failure behavior the RPC
    // had, so a forwarded/guessed link can't be used to probe which
    // estimates exist or their signing state.
    if (!estimateRow || estimateRow.signature) {
      return NextResponse.json({ ok: false, message: "This estimate could not be signed. It may already be signed or no longer be open." }, { status: 200 });
    }

    const services = createServerAppServices(supabase, async () => null);
    const result = await services.estimateWorkflow.signEstimate(estimateRow.id, {
      type: signatureType,
      value: signatureValue,
      date: new Date().toISOString(),
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message ?? "This estimate could not be signed." }, { status: 200 });
    }

    // Best-effort staff notification — deliberately done HERE, not inside
    // estimateWorkflow.ts. That file is shared with the browser (staff
    // manually signing from EstimateDetail runs the identical function
    // client-side via ServicesProvider.tsx), and web-push depends on
    // Node's net/http internals — importing it from anything reachable
    // by the client bundle breaks the build (confirmed: it did). This
    // route is real server-only code, so it's the right place for the
    // one thing that's specific to a CUSTOMER signing (not staff
    // signing on their behalf) anyway.
    //
    // Scheduled via after(), NOT awaited — a customer waiting on the
    // signature to save must never be stuck behind however long it
    // takes push services (fcm.googleapis.com, web.push.apple.com) to
    // respond. Awaiting this here was the actual cause of a real,
    // reported "signing feels slow" bug: on a serverless platform, the
    // function can also be frozen/killed once a response is sent, so a
    // bare fire-and-forget (no await, but no after() either) risks the
    // push silently never completing — after() is the supported way to
    // keep the function alive for exactly this after the response has
    // already gone out. sendPushToCompany never throws either way.
    if (result.estimate) {
      const estimate = result.estimate;
      after(() =>
        sendPushToCompany(services.pushSubscriptionService, estimate.companyId, {
          title: "Estimate signed",
          body: `${estimate.title || "An estimate"} (#${estimate.estimateNumber ?? estimate.id.slice(0, 8)}) was just signed by the customer.`,
          url: `/estimates/${estimate.id}`,
        })
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Portal sign error:", error);
    return NextResponse.json({ ok: false, message: "This estimate could not be signed. Please try again." }, { status: 500 });
  }
}
