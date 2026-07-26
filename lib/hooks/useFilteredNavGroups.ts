"use client";

import { useMemo } from "react";
import { NAV_GROUPS, type NavGroup } from "@/lib/navigation";
import { useCurrentRole } from "./usePermission";
import { hasPermission } from "@/lib/services";

/** Filters NAV_GROUPS down to what the current role can actually see —
 * one implementation Sidebar and MobileNav both call, so a desktop and
 * mobile visitor with the same role never see a different set of nav
 * items by accident. Groups that end up with zero visible items are
 * dropped entirely rather than rendered as an empty heading. */
export function useFilteredNavGroups(): NavGroup[] {
  const role = useCurrentRole();

  return useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.permission) return true;
        if (!role) return false;
        return hasPermission(role, item.permission.resource, item.permission.action);
      }),
    })).filter((group) => group.items.length > 0);
  }, [role]);
}
