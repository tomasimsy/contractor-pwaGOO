"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/public",'/text'];
// Make sure to include the root path and public
const PROTECTED_ROUTES = ["/dashboard", "/estimates", "/invoices", "/projects", "/clients", "/settings"];

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      setChecking(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Check if current route is public
      const isPublicRoute = PUBLIC_ROUTES.some(route => pathname === route || pathname?.startsWith('/public/'));
      const isProtectedRoute = PROTECTED_ROUTES.some(
  route =>
    pathname === route ||
    pathname.startsWith(`${route}/`)
);
      console.log("Route check:", { pathname, isPublicRoute, isProtectedRoute, hasUser: !!user });

      // Allow public routes without authentication
      if (isPublicRoute) {
        if (active) setChecking(false);
        return;
      }

      // For protected routes, require authentication
      if (isProtectedRoute && !user) {
        router.replace("/login");
        return;
      }

      // If logged in and on login page, redirect to dashboard
      if (user && pathname === "/login") {
        router.replace("/dashboard");
        return;
      }

      if (active) setChecking(false);
    }

    checkAuth();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
          <p className="text-sm text-gray-500 mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}