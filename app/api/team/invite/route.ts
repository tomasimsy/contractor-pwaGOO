import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ROLES, hasPermission, type Role } from "@/lib/services/permissions";

/**
 * Admin-only — creates a new login for an EXISTING company (distinct
 * from app/api/auth/signup/route.ts, which creates a brand-new
 * company). Sets the account up with a password directly, chosen by
 * the caller, rather than Supabase's invite-by-email flow — per this
 * feature's explicit ask, the admin hands the password to the person
 * themselves (text, in person, whatever), no email is sent.
 *
 * Same two-step security shape as signup/route.ts: check the CALLER's
 * own session/role first (ordinary cookie client, RLS-safe), then
 * construct a service-role client only after that check passes, only
 * to do the one thing an ordinary session can never do — create
 * another company's user via auth.admin.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const role = typeof body?.role === "string" ? body.role : "";

    if (!email) return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
    if (!ROLES.includes(role as Role)) return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });

    // Caller check — ordinary session client, RLS applies normally.
    const callerSupabase = await createServerSupabaseClient();
    const {
      data: { user: caller },
    } = await callerSupabase.auth.getUser();
    if (!caller) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: callerProfile } = await callerSupabase.from("profiles").select("company_id, role").eq("id", caller.id).single();
    const companyId = callerProfile?.company_id as string | undefined;
    const callerRole = callerProfile?.role as Role | undefined;
    if (!companyId || !callerRole) return NextResponse.json({ ok: false, error: "User has no company." }, { status: 400 });
    if (!hasPermission(callerRole, "user_roles", "create")) {
      return NextResponse.json({ ok: false, error: "You don't have permission to add team members." }, { status: 403 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not set — team invite cannot run.");
      return NextResponse.json({ ok: false, error: "This isn't available right now. Please try again shortly." }, { status: 500 });
    }
    const adminSupabase = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: created, error: createUserError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createUserError || !created.user) {
      return NextResponse.json({ ok: false, error: createUserError?.message ?? "Failed to create this account." }, { status: 400 });
    }

    const { error: profileError } = await adminSupabase.from("profiles").insert({
      id: created.user.id,
      company_id: companyId,
      role,
    });
    if (profileError) {
      // Same rollback discipline as signup/route.ts — a failed profile
      // write must not leave a login-able account with no company/role.
      await adminSupabase.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId: created.user.id });
  } catch (error) {
    console.error("Team invite failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to add this team member." }, { status: 500 });
  }
}
