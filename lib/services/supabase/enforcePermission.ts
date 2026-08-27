/**
 * Server/DB-adjacent permission enforcement — the "Service" layer
 * permissions.ts's own header describes (layer 2 of 3: Database RLS,
 * Service, Application) but that, until now, had zero real callers
 * anywhere (ValidationService.validatePermission was defined and
 * exported, never invoked). This is the wiring that was missing.
 *
 * Deliberately self-contained (fetches the acting user's role directly
 * from `profiles` via whatever SupabaseClient the calling service
 * already has) rather than threading a new `currentUserRole` resolver
 * through every service constructor/call site across
 * ServicesProvider.tsx and server.ts — same shape, far smaller blast
 * radius, and every real production profile today is role "admin"
 * (checked live), which already has unrestricted access to every
 * resource in PERMISSION_MATRIX — so wiring this in cannot regress any
 * actual current user.
 *
 * IMPORTANT — this is NOT a replacement for Layer 1 (DB RLS keyed on
 * profiles.role): a user calling Supabase directly with a valid
 * session token, bypassing this TypeScript service layer entirely,
 * is not stopped by this check — only by an actual RLS policy. That
 * layer still needs to be added (see permissions.ts's own header) once
 * the exact live profiles.role constraint values and the subcontractor/
 * agent "own rows" row-scoping mapping are confirmed — deliberately
 * not attempted here blind. This function closes the gap for every
 * legitimate caller going through the app's own services (the
 * documented Layer 2), which is a real, additive improvement even
 * though it isn't the full three-layer picture on its own.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPermission, type Resource, type PermissionAction, type Role, ROLES } from "../permissions";

/** Returns null (not a thrown error) when the role can't be resolved —
 * unauthenticated, no profiles row, or a role value ROLES doesn't
 * recognize (e.g. a stale "owner"/"member" row predating the 7-role
 * model — see the signup route's own comment on this exact
 * uncertainty). Callers treat null as "can't confirm, don't block" —
 * RLS is still the backstop for anything actually unauthorized; this
 * check should tighten access for a resolvable role, never silently
 * lock out a legitimate user because of an unrelated lookup hiccup. */
async function resolveCurrentRole(supabase: SupabaseClient): Promise<Role | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = data?.role as string | undefined;
  return role && (ROLES as string[]).includes(role) ? (role as Role) : null;
}

/** Call at the top of a Layer 2 service's write method, before any
 * mutation. Throws the same "Permission denied" shape assertPermission
 * already uses elsewhere, so a denial looks identical regardless of
 * which layer caught it. */
export async function enforcePermission(supabase: SupabaseClient, resource: Resource, action: PermissionAction): Promise<void> {
  const role = await resolveCurrentRole(supabase);
  if (role && !hasPermission(role, resource, action)) {
    throw new Error(`Permission denied: role "${role}" cannot "${action}" on "${resource}".`);
  }
}
