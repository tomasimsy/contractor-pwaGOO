import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabasePushSubscriptionService } from "@/lib/services/supabase/pushSubscriptionService";

/**
 * Staff-only, cookie-authenticated — same shape as
 * app/api/estimates/[id]/send-email/route.ts. Saves/removes ONE
 * device's Web Push subscription for whichever staff member is
 * currently logged in; lib/push/sendPush.ts is what actually sends to
 * every subscription a company has once an estimate gets signed.
 *
 * Body (POST): the raw PushSubscriptionJSON from
 * registration.pushManager.subscribe() — { endpoint, keys: { p256dh, auth } }.
 * Body (DELETE): { endpoint }.
 */
async function getAuthedCompanyId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, companyId: null };
  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  return { userId: user.id, companyId: (profile?.company_id as string | undefined) ?? null };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, error: "Invalid push subscription." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { userId, companyId } = await getAuthedCompanyId(supabase);
    if (!userId || !companyId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const pushSubscriptionService = createSupabasePushSubscriptionService(supabase);
    await pushSubscriptionService.subscribe({ companyId, userId, endpoint, p256dh, auth });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Push subscribe failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to save push subscription." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) return NextResponse.json({ ok: false, error: "Missing endpoint." }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { userId } = await getAuthedCompanyId(supabase);
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const pushSubscriptionService = createSupabasePushSubscriptionService(supabase);
    await pushSubscriptionService.unsubscribe(endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Push unsubscribe failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to remove push subscription." }, { status: 500 });
  }
}
