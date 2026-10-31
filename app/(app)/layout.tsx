"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { hidesMobileBottomNav } from "@/lib/layout/mobileBottomNav";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/layout/AppHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

/**
 * Shell for every authenticated route: desktop Sidebar + AppHeader
 * (which owns the mobile nav drawer) + content. Redirects to /login
 * client-side once loading resolves and there's no user — proxy.ts is
 * the actual security boundary (this is UX only, same "layer 3 is not
 * the boundary" discipline the service layer's own permission docs
 * establish).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  // `authResolving` — NOT `loading`. Access is gated on the USER (is
  // there a session?), which resolves from supabase.auth.getUser().
  // The PROFILE (company/role) is a second, sequential round-trip and
  // used to be part of the same gate, so the entire app rendered a bare
  // spinner until both had returned — measured at ~800ms of blank
  // screen on every page, for data the shell itself doesn't need.
  //
  // Profile now streams in afterwards. Nothing downstream breaks:
  // usePermission already default-DENIES when `profile` is null (see
  // its doc comment — a missing role must never grant access), and
  // every page guards on `profile?.companyId` before fetching. The
  // security boundary is unchanged and still enforced at the service
  // and RLS layers regardless.
  const { user, authResolving } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const navHidden = hidesMobileBottomNav(pathname);
  // New-estimate and edit screens are focused tasks: no app sidebar, header or
  // bottom tab bar, and a tighter gutter. They have a "← Estimates" link back.
  // The estimate view page keeps the full shell so navigation stays available.
  const estimatePage = /^\/estimates(-roof)?\/(new$|[0-9a-f]{8}-[0-9a-f-]{27}\/edit$)/i.test(pathname);
  // These pages keep the sidebar and top bar but use the tighter gutter.
  const tightTopPage = pathname === "/estimates-roof" || pathname === "/accounting" || pathname === "/payroll" || /^\/(projects|subcontractors)\/[0-9a-f-]{36}$/i.test(pathname) || pathname === "/subcontractors" || pathname === "/bills" || pathname === "/payments";

  useEffect(() => {
    if (!authResolving && !user) router.replace("/login");
  }, [authResolving, user, router]);

  if (authResolving) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (!user) return null; // redirect effect above is already firing

  return (
    <div className="flex min-h-screen bg-muted/40">
      {!estimatePage && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        {!estimatePage && <AppHeader />}
       {/* `pb-24` reserves room for the fixed MobileBottomNav. When
           that nav isn't rendered (edit screens — see
           hidesMobileBottomNav) the reservation would just be 96px of
           dead space at the bottom of the page. */}
       <main className={`flex-1 ${estimatePage ? "px-3 py-3 sm:px-4 lg:px-4" : tightTopPage ? "px-3 py-3 sm:px-4 lg:px-4" : "px-4 py-6 sm:px-6 lg:px-8"} ${navHidden || estimatePage ? "pb-6" : "pb-24"}`}>
        {children}
      </main>

      {!estimatePage && <MobileBottomNav />}
      </div>
    </div>
  );
}
