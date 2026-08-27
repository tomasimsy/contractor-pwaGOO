"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, BellRing, BellOff } from "lucide-react";
import { usePushNotifications } from "@/lib/hooks/usePushNotifications";

/** No in-app notification feed exists yet (still true — this dropdown
 * has no unread list, on purpose, rather than fake items). What it DOES
 * do now: double as the quick-access control for the one real
 * notification source this app has — Web Push for "a customer signed
 * an estimate" (lib/push/sendPush.ts). Same enable/disable logic as
 * Settings > Notifications (usePushNotifications), just reachable from
 * the header without navigating away. */
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const { state, error, enable, disable } = usePushNotifications();

  const badge =
    state === "enabled" ? { Icon: BellRing, label: "On" } : state === "denied" ? { Icon: BellOff, label: "Blocked" } : null;

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
        {badge && (
          <span
            className={`absolute right-1 top-1 size-1.5 rounded-full ${state === "enabled" ? "bg-primary" : "bg-destructive"}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-72 rounded-xl border border-border bg-popover shadow-lg">
            <div className="border-b border-border px-4 py-3 text-xs font-semibold text-popover-foreground">Notifications</div>

            <div className="px-4 py-3">
              <p className="text-xs font-medium text-popover-foreground">Estimate signed alerts</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Get notified on this device the moment a customer signs an estimate.</p>

              <div className="mt-2.5">
                {state === "loading" && <p className="text-[11px] text-muted-foreground">Checking this device…</p>}
                {state === "unsupported" && (
                  <p className="text-[11px] text-muted-foreground">This browser doesn&apos;t support push notifications.</p>
                )}
                {state === "denied" && (
                  <p className="text-[11px] text-destructive">
                    Blocked in your browser settings. Enable notifications for this site there, then reload.
                  </p>
                )}
                {state === "disabled" && (
                  <button
                    type="button"
                    onClick={enable}
                    className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Enable on this device
                  </button>
                )}
                {state === "enabled" && (
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                      Enabled on this device
                    </span>
                    <button type="button" onClick={disable} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">
                      Turn off
                    </button>
                  </div>
                )}
                {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
              </div>
            </div>

            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-4 py-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Notification settings
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
