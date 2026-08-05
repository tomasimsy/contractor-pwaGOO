"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useServices } from "@/components/providers/ServicesProvider";

/**
 * A real dropdown, honestly scoped: this app's data model is one
 * profile -> one companyId (see AuthProvider's Profile type) — there
 * is no "user belongs to multiple companies" membership concept
 * anywhere in the service layer yet, so there is nothing to actually
 * switch between today. Rather than fabricate multiple companies,
 * this shows the user's real current company as the only option —
 * the UI slot future multi-company-membership work fills in, not a
 * placeholder that pretends to do something it doesn't.
 *
 * WHY THIS READS company_name AND NOT profile.fullName
 * It used to render `profile.fullName`, which was wrong twice over.
 * That is the signed-in USER's name, not the company's — so even when
 * populated, a company switcher labelled with a person's name is
 * misleading. And `profiles.full_name` is nullable and in practice
 * null, so the control rendered as a bare icon and chevron with no
 * text at all.
 *
 * The company's name comes from CompanyService, which resolves it via
 * lib/company.ts's getCompanySettingsByCompanyId — the same merge every
 * PDF route, the customer portal and the public invoice page already
 * use, where `companies.name` is authoritative and beats any stale
 * `company_settings.company_name`. Reusing that keeps one definition of
 * "what is this company called" rather than introducing a second.
 */
export function CompanySwitcher() {
  const { profile } = useAuth();
  const { companyService } = useServices();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const companyId = profile?.companyId;
    if (!companyId) return;

    // Guards both against setting state after unmount and against a
    // slow response for a previous company overwriting the current one.
    let active = true;
    companyService
      .getByCompanyId(companyId)
      .then((settings) => {
        if (active) setCompanyName(settings.company_name || null);
      })
      .catch(() => {
        // Non-fatal: the header must not break because a name lookup
        // failed. The control just stays hidden.
      });

    return () => {
      active = false;
    };
  }, [profile?.companyId, companyService]);

  if (!profile) return null;
  // Render nothing rather than an empty button while the name loads —
  // an icon with no label is precisely the bug this replaced.
  if (!companyName) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Current company: ${companyName}`}
        title={companyName}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
      >
        <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="max-w-[8rem] truncate">{companyName}</span>
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute left-0 z-50 mt-1.5 w-56 rounded-xl border border-border bg-popover p-1 shadow-lg">
            <div role="option" aria-selected="true" className="rounded-lg px-3 py-2 text-xs font-medium text-popover-foreground bg-muted">
              {companyName} (current company)
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
