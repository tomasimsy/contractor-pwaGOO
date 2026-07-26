"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  ReceiptText,
  Wallet,
  Users,
  Percent,
  UserPlus,
  FolderOpen,
  Car,
  Activity,
  Settings,
  Trash2,
  LogOut,
  TrendingUp,
  Landmark,
} from "lucide-react";

// Every existing route in the app's nav surfaces (BottomNav's top-level
// items + Settings page's NAV_GROUPS), just reorganized into a desktop
// sidebar instead of a bottom bar + a separate "Manage" hub page — no
// route is dropped, nothing here is new functionality.
const MAIN_MENU = [
  { href: "/dashboard-v2", label: "Dashboard", icon: LayoutDashboard },
  { href: "/estimates", label: "Estimates", icon: ClipboardList },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/invoices/receivables", label: "Receivables", icon: Landmark },
  { href: "/expense", label: "Expenses", icon: ReceiptText },
  { href: "/pending-payouts", label: "Pending Payouts", icon: Wallet },
];

const FEATURES = [
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/settings/subcontractors", label: "Subcontractors", icon: UserPlus },
  { href: "/settings/agents", label: "Agents", icon: Percent },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/mileage", label: "Mileage", icon: Car },
];

const COMPLIANCE = [
  { href: "/tax", label: "Tax & Compliance", icon: TrendingUp },
];

const GENERAL = [
  { href: "/analytics", label: "Analytics", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/deleted", label: "Trash", icon: Trash2 },
];

function NavGroup({ title, items, pathname }: { title: string; items: typeof MAIN_MENU; pathname: string | null }) {
  return (
    <div>
      <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/dashboard-v2" && pathname?.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted"
              }`}
            >
              <Icon size={16} className={isActive ? "text-primary-foreground" : "text-muted-foreground"} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Sidebar({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-border bg-card">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-border shrink-0">
        <span className="rounded-lg bg-primary px-2 py-0.5 text-lg font-black tracking-tight text-primary-foreground">OSR</span>
        <span className="text-lg font-medium tracking-tight text-foreground">Pros</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        <NavGroup title="Main Menu" items={MAIN_MENU} pathname={pathname} />
        <NavGroup title="Features" items={FEATURES} pathname={pathname} />
        <NavGroup title="Compliance" items={COMPLIANCE} pathname={pathname} />
        <NavGroup title="General" items={GENERAL} pathname={pathname} />
      </div>

      <div className="p-3 border-t border-border shrink-0">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut size={16} className="text-muted-foreground" />
          Log out
        </button>
      </div>
    </aside>
  );
}
