"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/public",
  "/text",
];

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

      const isPublicRoute = PUBLIC_ROUTES.some(
        (route) =>
          pathname === route ||
          pathname.startsWith(`${route}/`)
      );

      console.log("Route check:", {
        pathname,
        isPublicRoute,
        hasUser: !!user,
      });

      // Protect everything except public routes
      if (!isPublicRoute && !user) {
        router.replace("/login");
        return;
      }

      // Redirect logged-in users away from login/signup
      if (
        user &&
        (pathname === "/login" || pathname === "/signup")
      ) {
        router.replace("/dashboard");
        return;
      }

      if (active) {
        setChecking(false);
      }
    }

    checkAuth();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
          <p className="text-sm text-gray-500 mt-2">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}