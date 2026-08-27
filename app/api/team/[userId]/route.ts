import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ROLES, hasPermission, type Role } from "@/lib/services/permissions";

/**
 * Admin-only — changes an existing team member's role and/or
 * disabled_at, both in one route since they're both a single-field
 * update to the same profiles row. Goes through a service-role client
 * (after checking the CALLER's own role) rather than opening up
 * `profiles` RLS for cross-user writes — same reasoning as
 * app/api/team/invite/route.ts.
 *
 * Body: { role?: Role; disabled?: boolean }
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const body = await request.json().catch(() => null);
    const role = typeof body?.role === "string" ? body.role : undefined;
    const disabled = typeof body?.disabled === "boolean" ? body.disabled : undefined;

    if (role === undefined && disabled === undefined) {
      return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
    }
    if (role !== undefined && !ROLES.includes(role as Role)) {
      return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });
    }

    const callerSupabase = await createServerSupabaseClient();
    const {
      data: { user: caller },
    } = await callerSupabase.auth.getUser();
    if (!caller) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: callerProfile } = await callerSupabase.from("profiles").select("company_id, role").eq("id", caller.id).single();
    const companyId = callerProfile?.company_id as string | undefined;
    const callerRole = callerProfile?.role as Role | undefined;
    if (!companyId || !callerRole) return NextResponse.json({ ok: false, error: "User has no company." }, { status: 400 });
    if (!hasPermission(callerRole, "user_roles", "update")) {
      return NextResponse.json({ ok: false, error: "You don't have permission to manage team members." }, { status: 403 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not set — team management cannot run.");
      return NextResponse.json({ ok: false, error: "This isn't available right now. Please try again shortly." }, { status: 500 });
    }
    const adminSupabase = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Ownership check — the target must belong to the caller's own
    // company, same "explicit 403, not a confusing not-found" reasoning
    // app/api/estimates/[id]/send-email/route.ts already uses.
    const { data: targetProfile } = await adminSupabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!targetProfile) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    if (targetProfile.company_id !== companyId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const payload: Record<string, unknown> = {};
    if (role !== undefined) payload.role = role;
    if (disabled !== undefined) payload.disabled_at = disabled ? new Date().toISOString() : null;

    const { error } = await adminSupabase.from("profiles").update(payload).eq("id", userId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Team member update failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to update this team member." }, { status: 500 });
  }
}
