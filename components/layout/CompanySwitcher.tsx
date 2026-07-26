"use client";

import { useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

/**
 * A real dropdown, honestly scoped: this app's data model is one
 * profile -> one companyId (see AuthProvider's Profile type) — there
 * is no "user belongs to multiple companies" membership concept
 * anywhere in the service layer yet, so there is nothing to actually
 * switch between today. Rather than fabricate multiple companies,
 * this shows the user's real current company as the only option —
 * the UI slot future multi-company-membership work fills in, not a
 * placeholder that pretends to do something it doesn't.
 */
export function CompanySwitcher() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);

  if (!profile) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
      >
        <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="max-w-[8rem] truncate">{profile.companyId}</span>
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute left-0 z-50 mt-1.5 w-56 rounded-xl border border-border bg-popover p-1 shadow-lg">
            <div role="option" aria-selected="true" className="rounded-lg px-3 py-2 text-xs font-medium text-popover-foreground bg-muted">
              {profile.companyId}
            </div>
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              Multi-company switching isn&apos;t available yet — a profile belongs to one company today.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
