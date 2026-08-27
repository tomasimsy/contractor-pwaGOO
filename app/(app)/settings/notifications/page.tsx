"use client";

/**
 * Per-device push notification toggle. Deliberately NOT wrapped in
 * RequirePermission — this is "does THIS browser/device get notified,"
 * not a company-wide setting, so any authenticated staff member can
 * turn it on for themselves regardless of role.
 */
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePushNotifications } from "@/lib/hooks/usePushNotifications";
import { BellRing } from "lucide-react";

export default function NotificationSettingsPage() {
  const { state, error, enable, disable } = usePushNotifications();

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Get a push notification on this device the moment a customer signs an estimate."
      />

      <div className="max-w-md rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground">Estimate signed alerts</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Notifies every staff member on their own device when a customer signs an estimate — no need to keep checking back.
            </p>

            <div className="mt-3">
              {state === "loading" && <p className="text-sm text-muted-foreground">Checking this device…</p>}
              {state === "unsupported" && (
                <p className="text-sm text-muted-foreground">
                  This browser doesn't support push notifications. Try Chrome, Edge, or Safari (installed to your home screen on iOS).
                </p>
              )}
              {state === "denied" && (
                <p className="text-sm text-destructive">
                  Notifications are blocked for this site in your browser settings. Enable them there, then reload this page.
                </p>
              )}
              {state === "disabled" && (
                <button
                  type="button"
                  onClick={enable}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Enable on this device
                </button>
              )}
              {state === "enabled" && (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    Enabled on this device
                  </span>
                  <button type="button" onClick={disable} className="text-sm font-medium text-muted-foreground hover:text-foreground">
                    Turn off
                  </button>
                </div>
              )}
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
