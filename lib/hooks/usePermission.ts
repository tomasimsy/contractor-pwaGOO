"use client";

/**
 * Application-level permission check — layer 3 of 3 (see
 * lib/services/permissions.ts's file header). Components use this to
 * disable/hide actions the current user's role can't perform, purely
 * for UX (don't show a "Delete" button that will just fail) — it is
 * NOT the security boundary. The service-level check
 * (ValidationService.validatePermission, called inside every Layer 2
 * write method) and the DB-level RLS policies
 * (supabase/migrations/20260729000200_role_permissions.sql) are what
 * actually enforce this; a bug in this hook must never be the only
 * thing standing between a role and an action it shouldn't take.
 */
import { hasPermission, type Resource, type PermissionAction, type Role } from "../services/permissions";
import { useAuth } from "@/components/providers/AuthProvider";

/** Reads the current user's role from AuthProvider's profile —
 * previously a hardcoded `null` TODO stub; now wired to real
 * session/profile state. Still returns `null` whenever there's no
 * signed-in user or no profile row (unconfigured Supabase project,
 * missing `profiles` table, or a user with no company/role assigned
 * yet) — a missing role must deny by permission's own default-deny
 * fallback, never silently grant one. */
export function useCurrentRole(): Role | null {
  const { profile } = useAuth();
  return profile?.role ?? null;
}

export function usePermission(resource: Resource, action: PermissionAction): boolean {
  const role = useCurrentRole();
  if (!role) return false;
  return hasPermission(role, resource, action);
}
