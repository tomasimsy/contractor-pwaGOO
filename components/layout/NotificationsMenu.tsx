"use client";

import { useState } from "react";
import { Bell } from "lucide-react";

/** UI placeholder, per this prompt's explicit scope — no notification
 * source exists yet. Real, keyboard-accessible dropdown; the content
 * inside is honestly empty rather than fake unread items. */
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Notifications"
        className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-4" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-72 rounded-xl border border-border bg-popover shadow-lg">
            <div className="border-b border-border px-4 py-3 text-xs font-semibold text-popover-foreground">Notifications</div>
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              Notifications aren&apos;t wired up yet — this is a placeholder for a future module.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
