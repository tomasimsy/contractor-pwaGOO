"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, CreditCard, Users, Trash2 , Settings} from "lucide-react";
 

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { name: "Home", href: "/", icon: Home },
    { name: "Estimates", href: "/estimates", icon: FileText },
    { name: "Invoices", href: "/invoices", icon: CreditCard },
    { name: "Clients", href: "/clients", icon: Users },
    { name: "Settings", href: "/settings", icon: Settings },

];    

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
<div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 px-4 py-2 z-50 shadow-lg">
  <div className="w-full max-w-md mx-auto  bg-white flex justify-around px-4">

        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1 w-full py-1"
            >
              <Icon
                size={20}
                className={`transition-colors ${
                  active ? "text-gold" : "text-gray-400"
                }`}
              />

              <span
                className={`text-[10px] font-medium transition-colors ${
                  active ? "text-gold" : "text-gray-400"
                }`}
              >
                {item.name}
              </span>

              {/* active dot */}
              {active && (
                <div className="w-1 h-1 bg-gold rounded-full mt-0.5" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}