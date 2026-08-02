import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";

/**
 * New-company signup — creates the auth user, a `companies` row, and
 * the linking `profiles` row (role "owner", falling back to "admin" —
 * see the comment at that insert) in one atomic-ish server action.
 * Requires a service-role client for the same reason
 * app/api/portal/sign/route.ts does: an unauthenticated visitor has no
 * `current_company_id()` yet (they don't have a profile), so RLS on
 * `companies`/`profiles` cannot allow this insert as a normal
 * anon/session request — this route's own validation is what stands
 * in for that. See portal/sign/route.ts's header for the full
 * security-model writeup this follows.
 *
 * Deliberately simple (per the ask): company name + email + password
 * only. No email verification step — auth.admin.createUser is called
 * with `email_confirm: true` so the user can sign in immediately.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!companyName) return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not set — signup cannot run.");
      return NextResponse.json({ error: "Signup is not available right now. Please try again shortly." }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createUserError || !created.user) {
      return NextResponse.json({ error: createUserError?.message ?? "Failed to create account." }, { status: 400 });
    }
    const userId = created.user.id;

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({ name: companyName })
      .select("id")
      .single();
    if (companyError || !company) {
      // Roll back the auth user so a failed signup doesn't leave a
      // login-able account with no company/profile behind it.
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: companyError?.message ?? "Failed to create company." }, { status: 500 });
    }

    // `profiles.role` is guarded by a live `profiles_role_check`
    // constraint whose actual allowed values this codebase has no
    // reliable record of: the "owner"/"member" model
    // (lib/services/permissions.ts's 7-role model maps "owner" to
    // "admin" via AuthProvider.tsx's LEGACY_ROLE_ALIASES) comes from a
    // migration explicitly marked "DRAFT — review before running" in
    // the sibling contractor-pwa repo, so it may never have been
    // applied — the constraint could still be whatever predates it.
    // "admin" is the one value documented as already live on every
    // existing row (same migration's own comment), so it's tried
    // second rather than assumed first: this route must keep working
    // regardless of which of the two is actually enforced today.
    let profileError = (await supabase.from("profiles").insert({ id: userId, company_id: company.id, role: "owner" })).error;
    if (profileError?.code === "23514") {
      profileError = (await supabase.from("profiles").insert({ id: userId, company_id: company.id, role: "admin" })).error;
    }
    if (profileError) {
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to sign up." }, { status: 500 });
  }
}
