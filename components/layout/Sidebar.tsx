"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useFilteredNavGroups } from "@/lib/hooks/useFilteredNavGroups";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "contractor-app-v2-sidebar-collapsed";

/** Desktop sidebar (hidden below `lg:`, MobileNav covers that range) —
 * collapsible, state persisted like ThemeProvider's own localStorage
 * pattern. Nav items are permission-filtered (useFilteredNavGroups),
 * so a role with fewer permissions genuinely sees a shorter sidebar,
 * not a full one with disabled-looking links. */
export function Sidebar() {
  const pathname = usePathname();
  const groups = useFilteredNavGroups();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Same SSR-hydration reasoning as ThemeProvider's identical
    // pattern: read the persisted preference after mount, not via a
    // lazy useState initializer, so the first client render matches
    // what the server rendered (collapsed: false) before correcting.
    const stored = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn("flex h-14 shrink-0 items-center border-b border-border px-3", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && <span className="truncate text-sm font-semibold text-foreground">OSR Pros</span>}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
        </button>
      </div>

      <nav aria-label="Main navigation" className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      collapsed && "justify-center",
                      isActive ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground")} aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
