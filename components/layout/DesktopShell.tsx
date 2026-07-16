"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Sidebar from "./Sidebar";

/**
 * Shared desktop/tablet chrome — the same sidebar used on /dashboard-v2,
 * plus a slim consistent page-title bar — wrapped around a page's
 * EXISTING content. At mobile widths this renders as an inert block
 * (sidebar and title bar are both `md:` gated to invisible/hidden), so
 * the page's own mobile layout is completely untouched; only `md:` and
 * up gets the sidebar + unified header treatment. No business logic
 * lives here — purely presentational, same pattern as DashboardV2.
 */
export default function DesktopShell({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="md:flex md:min-h-screen md:bg-gray-50/60">
      <Sidebar onLogout={handleLogout} />

      <div className="md:flex-1 md:min-w-0">
        {title && (
          <div className="hidden md:block sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 px-5 lg:px-8 h-16">
              <h1 className="text-[15px] font-semibold text-gray-900 truncate">{title}</h1>
              {actions}
            </div>
          </div>
        )}

        <div className="md:max-w-[1600px] md:mx-auto md:px-5 lg:px-8 md:py-6">{children}</div>
      </div>
    </div>
  );
}
