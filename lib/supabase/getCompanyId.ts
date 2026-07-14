import { supabase } from "@/lib/supabase/client";

export async function getCompanyId() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (error || !profile?.company_id) {
    throw new Error("Company not assigned");
  }

  return profile.company_id;
}

/**
 * Same lookup as getCompanyId, but resolves to null instead of
 * throwing on "not authenticated" or "no company" — for callers like
 * ProtectedRoute that need to branch on the state rather than catch
 * an exception.
 */
export async function getCompanyIdOrNull(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  return profile?.company_id ?? null;
}