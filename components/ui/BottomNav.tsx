"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, ClipboardList, Settings } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Estimates",
      href: "/estimates",
      icon: ClipboardList,
    },
    {
      label: "Invoices",
      href: "/invoices",
      icon: FileText,
    },
    {
      label: "Settings",
      href: "/settings",
      icon: Settings,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/60 bg-white/90 backdrop-blur-md pb-safe">
      <div className="mx-auto flex h-16 max-w-xl items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center w-20 h-full transition-all relative group"
            >
              <div
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? "text-[#05291e] bg-[#05291e]/[0.06] font-semibold"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 font-medium"
                }`}
              >
                <Icon 
                  size={18} 
                  className={`transition-transform duration-200 group-active:scale-95 ${
                    isActive ? "stroke-[2.25px]" : "stroke-[1.75px]"
                  }`} 
                />
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}