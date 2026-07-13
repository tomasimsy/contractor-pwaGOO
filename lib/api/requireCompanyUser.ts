import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verifies the request has a logged-in user with a company, for API
 * routes that used to trust the caller entirely. Returns the caller's
 * company_id on success, or a ready-to-return 401/403 NextResponse on
 * failure so the route can `if (!auth.ok) return auth.response`.
 */
export async function requireCompanyUser(
  supabase: SupabaseClient
): Promise<{ ok: true; companyId: string } | { ok: false; response: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();

  if (!profile?.company_id) {
    return { ok: false, response: NextResponse.json({ error: "Company not found" }, { status: 403 }) };
  }

  return { ok: true, companyId: profile.company_id };
}
