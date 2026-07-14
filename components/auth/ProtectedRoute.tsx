"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCompanyIdOrNull } from "@/lib/supabase/getCompanyId";

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

      // A logged-in user with no company yet gets sent to onboarding —
      // every other page assumes company_id exists (getCompanyId/
      // requireCompanyUser throw otherwise), so this check happens once
      // here instead of failing deep inside each individual page.
      if (user && pathname !== "/onboarding" && !isPublicRoute) {
        const companyId = await getCompanyIdOrNull();
        if (!active) return;
        if (!companyId) {
          router.replace("/onboarding");
          return;
        }
      }

      // A user who already has a company shouldn't land back on
      // onboarding (e.g. hitting the URL directly after finishing it).
      if (user && pathname === "/onboarding") {
        const companyId = await getCompanyIdOrNull();
        if (!active) return;
        if (companyId) {
          router.replace("/dashboard");
          return;
        }
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50/70">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-[11px] font-medium text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}