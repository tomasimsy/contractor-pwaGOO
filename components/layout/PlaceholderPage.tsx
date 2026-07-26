import type { LucideIcon } from "lucide-react";
import type { Resource, PermissionAction } from "@/lib/services";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";

/**
 * One shared shape for every module's not-yet-built page: title +
 * description + an EmptyState explaining what's coming, optionally
 * gated behind a permission check. Future prompts replace the
 * EmptyState with real content per page — the PageHeader/PageContainer
 * wrapping and permission gate stay the same, so swapping placeholder
 * for real content never means restructuring the page.
 */
export function PlaceholderPage({
  title,
  description,
  icon,
  permission,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  permission?: { resource: Resource; action?: PermissionAction };
}) {
  const content = (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={icon} title={`${title} module coming soon`} description="This page's layout, navigation, and permissions are wired up — real functionality lands in a future update." />
    </>
  );

  if (!permission) return content;

  return (
    <RequirePermission resource={permission.resource} action={permission.action}>
      {content}
    </RequirePermission>
  );
}
