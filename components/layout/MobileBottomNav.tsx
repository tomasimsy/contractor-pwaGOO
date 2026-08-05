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

const items = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Estimates",
    href: "/estimates",
    icon: FileText,
  },
  {
    label: "Invoices",
    href: "/invoices",
    icon: Receipt,
  },
  {
    label: "Expenses",
    href: "/expenses",
    icon: Wallet,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

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
      <div className="grid h-16 grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;

          const isActive =
            pathname === item.href ||
            pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                isActive
                  ? "text-white"
                  : "text-emerald-200 hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "size-5",
                  isActive
                    ? "text-white stroke-[2.5]"
                    : "text-emerald-200"
                )}
                aria-hidden="true"
              />

              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}