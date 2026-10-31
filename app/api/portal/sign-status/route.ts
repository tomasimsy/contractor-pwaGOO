import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Tells the customer portal whether an estimate is already signed, so a
 * signing request that failed or timed out on the network is checked against
 * the server before the customer is told it failed. Same token rule as
 * app/api/portal/sign/route.ts: the token is the only credential, and the
 * answer is the same one the portal page already shows to that token holder.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) {
      return NextResponse.json({ ok: false, message: "Missing token." }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not set — portal sign status cannot run.");
      return NextResponse.json({ ok: false, message: "Could not check the signature status." }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from("estimates")
      .select("signature")
      .eq("customer_token", token)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("Portal sign status lookup failed:", error.message);
      return NextResponse.json({ ok: false, message: "Could not check the signature status." }, { status: 500 });
    }

    // Unknown token and unsigned estimate both return signed:false, so the
    // response cannot be used to find out which tokens exist.
    return NextResponse.json({ ok: true, signed: Boolean(data?.signature) });
  } catch (error) {
    console.error("Portal sign status error:", error);
    return NextResponse.json({ ok: false, message: "Could not check the signature status." }, { status: 500 });
  }
}
