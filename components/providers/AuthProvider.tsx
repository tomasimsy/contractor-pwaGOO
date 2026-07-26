"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Role } from "@/lib/services";

/**
 * The authenticated user's profile — company/role, the scoping
 * dimensions the service layer's QueryScope and PERMISSION_MATRIX
 * depend on (see lib/services/types.ts and lib/services/permissions.ts).
 * Read from the REAL `profiles` table contractor-pwa's
 * getCompanyId()/current_user_role() already use (same Supabase
 * project — see .env.local).
 *
 * locationId: `profiles.location_id` DOES exist live (confirmed via a
 * direct information_schema.columns dump — uuid, nullable), so this
 * is now read for real instead of hardcoded null.
 */
export interface Profile {
  userId: string;
  companyId: string;
  locationId: string | null;
  role: Role;
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * The live `profiles.role` column is constrained by a real CHECK
 * (confirmed via pg_constraint: `role = ANY (ARRAY['owner','member'])`)
 * to ONLY "owner" or "member" — not the old 5-role set this comment
 * previously claimed. permissions.ts's 7-role model
 * (admin/office/sales/project_manager/accountant/subcontractor/agent)
 * was only ever applied as a DRAFT migration
 * (contractor-pwa/supabase/migrations/20260731000000_expand_roles_seven_role_model.sql),
 * per this repo's "review before running" convention — it has not
 * actually been run against this database.
 *
 * Without this alias, hasPermission("owner", ...) returns false for
 * EVERY gated resource (PERMISSION_MATRIX has no "owner" key), so the
 * real, live owner account would see almost no navigation — not a
 * missing-config bug, but a genuine functional gap this pass is
 * explicitly scoped to close ("Permission-based navigation works").
 * Remove this alias once the migration above is actually applied and
 * every profiles.role value has been rewritten to the new set.
 */
const LEGACY_ROLE_ALIASES: Record<string, Role> = {
  owner: "admin",
  member: "sales", // the original pre-role-model default, per 20260717000000_profiles_role_and_rls.sql
  // manager/estimator/accountant/agent are NOT live values (the CHECK
  // constraint only permits owner/member) but are kept here in case
  // the constraint is loosened before the real migration lands.
  manager: "office",
  estimator: "sales",
};

function resolveRole(rawRole: string): Role | null {
  const ROLES: Role[] = ["admin", "office", "sales", "project_manager", "accountant", "subcontractor", "agent"];
  if ((ROLES as string[]).includes(rawRole)) return rawRole as Role;
  return LEGACY_ROLE_ALIASES[rawRole] ?? null;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("company_id, role, location_id").eq("id", userId).single();

  if (error) {
    // PGRST116 = "no rows returned" — a real, expected case (an
    // authenticated user with no profile row yet, e.g. mid-onboarding).
    // Anything else (missing table, missing column, RLS denial,
    // network failure) is a genuine misconfiguration and must be
    // visible, not silently treated the same as "no profile."
    if (error.code !== "PGRST116") {
      console.error("Failed to load profile — check Supabase schema/RLS, not just auth:", error);
    }
    return null;
  }
  if (!data) return null;

  const role = resolveRole(data.role);
  if (!role) {
    console.error(`Unknown profiles.role value "${data.role}" — no current or legacy Role matches it. Denying all permissions.`);
    return null;
  }

  return { userId, companyId: data.company_id, locationId: data.location_id, role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadUser(nextUser: User | null) {
      if (!active) return;
      setUser(nextUser);
      setProfile(nextUser ? await fetchProfile(nextUser.id) : null);
      if (active) setLoading(false);
    }

    supabase.auth
      .getUser()
      .then(({ data }) => loadUser(data.user))
      .catch((err) => {
        // A missing/invalid session is NOT an error here — supabase-js
        // resolves that case via `data.user: null` above, it doesn't
        // reject. A rejection here means something actually broke
        // (network failure, misconfigured project) — surfacing it,
        // not silently treating it as "logged out," is the whole
        // point of this auth-completion pass.
        console.error("supabase.auth.getUser() failed:", err);
        loadUser(null);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      loadUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  return <AuthContext.Provider value={{ user, profile, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider.");
  return ctx;
}
