"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Home, FileText, CreditCard, Users, Settings } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    setIsLoggedIn(!!user);
    setLoading(false);
    // REMOVED THE REDIRECT - DO NOT redirect here
  }

  const hideNavPages = ["/login", "/signup", "/"];
  
  if (loading) return null;
  if (!isLoggedIn) return null;
  if (hideNavPages.includes(pathname)) return null;

  const navItems = [
    { name: "Home", href: "/dashboard", icon: Home, activeIcon: Home },
    { name: "Estimates", href: "/estimates", icon: FileText, activeIcon: FileText },
    { name: "Invoices", href: "/invoices", icon: CreditCard, activeIcon: CreditCard },
    { name: "Clients", href: "/clients", icon: Users, activeIcon: Users },
    { name: "Settings", href: "/settings", icon: Settings, activeIcon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    return pathname.startsWith(href);
  };

  return (
<div className="fixed bottom-0 left-0 right-0 border-t bg-primary border-gray-200 z-2   shadow-lg">
  <div className="w-full max-w-md mx-auto  bg-white flex justify-around px-4 ">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const IconComponent = active ? item.activeIcon : item.icon;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-all duration-200 ${
                active ? "bg-navy/5" : "hover:bg-gray-50"
              }`}
            >
              <IconComponent
                size={20}
                className={`transition-colors ${
                  active ? "text-gold" : "text-gray-400"
                }`}
              />
              <span className={`text-xs font-medium ${active ? "text-gold" : "text-gray-500"}`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}