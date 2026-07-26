"use client";

import type { Resource, PermissionAction } from "@/lib/services";
import { usePermission } from "@/lib/hooks/usePermission";
import { AccessDeniedState } from "./AccessDeniedState";

/**
 * Page-level permission gate — wraps a placeholder (soon: real) page's
 * content and shows AccessDeniedState instead if the current role
 * can't perform `action` on `resource`. Same usePermission() every nav
 * item's visibility already uses (lib/hooks/usePermission.ts), so a
 * hidden nav item and a blocked page are never out of sync with each
 * other. UX-only, like usePermission itself — not the security
 * boundary (that's ValidationService.validatePermission at the
 * service layer, called before any real write once business logic
 * exists).
 */
export function RequirePermission({
  resource,
  action = "view",
  children,
}: {
  resource: Resource;
  action?: PermissionAction;
  children: React.ReactNode;
}) {
  const allowed = usePermission(resource, action);
  if (!allowed) return <AccessDeniedState resource={resource.replace("_", " ")} />;
  return <>{children}</>;
}
