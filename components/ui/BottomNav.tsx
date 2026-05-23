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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      setLoading(false);
      if (!session) {
        router.push("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    setIsLoggedIn(!!session);
    setLoading(false);
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
<div className="fixed bottom-0 left-0 right-0 border-t bg-white border-gray-200 z-2 shadow-md">
  <div className="w-full max-w-md mx-auto flex justify-around px-2 py-1.5">
    {navItems.map((item) => {
      const active = isActive(item.href);
      const IconComponent = active ? item.activeIcon : item.icon;

      return (
        <Link
          key={item.name}
          href={item.href}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md transition-all duration-150 ${
            active ? "bg-gray-100" : "hover:bg-gray-300"
          }`}
        >
          <IconComponent
            size={18}
            className={`transition-colors ${
              active ? "text-navy" : "text-gray-400 bg-gray-200 rounded-full p-1 text-[12px]"
            }`}
          />
          <span
            className={`text-[10px] font-medium ${
              active ? "text-navy" : "text-gray-500"
            }`}
          >
            {item.name}
          </span>
        </Link>
      );
    })}
  </div>
</div>

  );
}