"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
       <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8">
        {children}
      </main>

      <MobileBottomNav />
      </div>
    </div>
  );
}
