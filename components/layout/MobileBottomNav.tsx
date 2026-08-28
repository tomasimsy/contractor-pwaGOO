"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Wallet,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hidesMobileBottomNav } from "@/lib/layout/mobileBottomNav";
import { useCurrentRole } from "@/lib/hooks/usePermission";
import { hasPermission, type Resource, type PermissionAction } from "@/lib/services/permissions";

const items: { label: string; href: string; icon: typeof LayoutDashboard; permission?: { resource: Resource; action: PermissionAction } }[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    permission: { resource: "dashboard", action: "view" },
  },
  {
    label: "Estimates",
    href: "/estimates",
    icon: FileText,
    permission: { resource: "estimate", action: "view" },
  },
  {
    label: "Invoices",
    href: "/invoices",
    icon: Receipt,
    permission: { resource: "invoice", action: "view" },
  },
  {
    label: "Expenses-v2",
    href: "/expense-v2",
    icon: Wallet,
    permission: { resource: "expense", action: "view" },
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    permission: { resource: "company_settings", action: "view" },
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  // Same permission model the desktop sidebar/drawer already filters
  // with (useFilteredNavGroups) — this bar was hardcoded and ignored
  // role entirely, so a restricted role (e.g. field_lead) got tabs
  // that always landed on "Access Denied." One hook call for the role,
  // then the pure hasPermission() function per item — not a hook
  // itself, so calling it inside .filter() is fine.
  const role = useCurrentRole();
  const visibleItems = items.filter((item) => !item.permission || (role && hasPermission(role, item.permission.resource, item.permission.action)));

  // Edit screens run full-bleed with their own sticky action bar.
  // Returning null (rather than hiding with a class) also drops the
  // fixed element entirely, so nothing can overlay the form.
  if (hidesMobileBottomNav(pathname)) return null;

  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0 z-40
        border-t border-emerald-700
        bg-emerald-800
        lg:hidden
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <div className="grid h-12" style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}>
        {visibleItems.map((item) => {
          const Icon = item.icon;

          const isActive =
            pathname === item.href ||
            pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-white"
                  : "text-emerald-200 hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "size-4",
                  isActive
                    ? "text-white stroke-[2.5]"
                    : "text-emerald-200"
                )}
                aria-hidden="true"
              />

              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}