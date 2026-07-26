"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ClipboardList, FileText, ReceiptText, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Only /estimates/create is a real standalone "new record" route today —
// invoices are created by converting an approved estimate (no standalone
// route), and expenses/clients are created via a modal on their own list
// page (no standalone route either). Those three link to their list page
// rather than a dead /new route; "New Estimate" is the one true deep link.
const ACTIONS = [
  { label: "New Estimate", href: "/estimates/create", icon: ClipboardList },
  { label: "New Invoice", href: "/invoices", icon: FileText },
  { label: "New Expense", href: "/expense", icon: ReceiptText },
  { label: "New Client", href: "/clients", icon: Users },
];

/**
 * One global "create something" entry point, available from every
 * shell-wrapped page's topbar (desktop/tablet) and as a mobile FAB —
 * instead of each page inventing its own "New X" button placement.
 * A page can still keep a page-specific create button in its own
 * content (e.g. an Estimates list's own "New Estimate" button) — this
 * is the cross-page one that's always reachable regardless of which
 * page you're on.
 */
export default function QuickActions({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick actions"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
      >
        <Plus className="size-4" />
        New
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-popover-foreground transition-colors hover:bg-muted"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {action.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
