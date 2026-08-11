import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { applyResendEvent, type EstimateEmailStatus } from "@/lib/email/emailTracking";

/**
 * Resend delivery webhook — updates estimate_emails rows
 * (delivered/opened/bounced/complained) as events arrive. This is the
 * SECOND route in this app permitted to construct a service-role
 * Supabase client (the first is app/api/portal/sign/route.ts — read
 * that file's header for the shared security model this follows).
 *
 * SECURITY MODEL:
 * 1. SUPABASE_SERVICE_ROLE_KEY is read ONLY here (this file), from
 *    server-only env, and used ONLY to call applyResendEvent — never
 *    exposed, never used for anything else in this route.
 * 2. Every request is verified with Svix (the signing provider Resend
 *    uses for webhooks) BEFORE any database write happens. A request
 *    with a missing or invalid signature is rejected outright — this
 *    is the entire authorization boundary for a route with no user
 *    session to check, exactly as app/api/portal/sign/route.ts's
 *    token check is its boundary.
 * 3. Configure the same secret in two places: Resend's dashboard
 *    (Webhooks -> your endpoint -> signing secret) and this app's
 *    RESEND_WEBHOOK_SECRET env var. They must match.
 *
 * Resend event payload shape: { type: "email.sent" | "email.delivered"
 * | "email.delivery_delayed" | "email.opened" | "email.clicked" |
 * "email.bounced" | "email.complained" | "email.failed", created_at,
 * data: { email_id, ... } }. Only the types this app tracks a status
 * for are handled; anything else is acknowledged and ignored.
 */

const EVENT_TO_STATUS: Record<string, EstimateEmailStatus> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET is not set — rejecting webhook (cannot verify authenticity).");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
  }

  let event: { type: string; created_at: string; data: { email_id: string } };
  try {
    const webhook = new Webhook(secret);
    event = webhook.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch (error) {
    console.error("Resend webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const status = EVENT_TO_STATUS[event.type];
  if (!status) {
    // Acknowledged but not tracked (e.g. "email.sent" — we already
    // record that ourselves at send time — or "email.clicked", which
    // this table has no column for). Returning 200 tells Resend not
    // to retry; this is expected, not an error.
    return NextResponse.json({ ok: true, tracked: false });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set — cannot apply webhook event.");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const supabaseServiceRole = createClient(SUPABASE_URL, serviceRoleKey);

  await applyResendEvent(supabaseServiceRole, {
    resendEmailId: event.data.email_id,
    status,
    occurredAt: event.created_at || new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, tracked: true });
}
