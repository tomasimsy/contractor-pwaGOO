"use client";

/**
 * Per-device Web Push enable/disable — not a company-wide setting (see
 * app/(app)/settings/notifications/page.tsx, which deliberately skips
 * RequirePermission for this reason): any staff member can turn
 * notifications on for THEIR OWN browser/device, independent of role.
 * The actual send (lib/push/sendPush.ts) fires to every device a
 * company has subscribed, triggered today only by
 * estimateWorkflow.ts's signEstimate().
 */
import { useCallback, useEffect, useState } from "react";

/** Web Push wants the VAPID key as a raw Uint8Array, not the
 * base64url string env vars carry it as. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushSupportState = "unsupported" | "loading" | "denied" | "enabled" | "disabled";

export function usePushNotifications() {
  const [state, setState] = useState<PushSupportState>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "enabled" : "disabled");
    } catch {
      setState("disabled");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setError(null);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Push notifications aren't configured for this deployment yet.");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "disabled");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to save this device.");
      }
      setState("enabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable notifications.");
      await refresh();
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      setState("disabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable notifications.");
      await refresh();
    }
  }, [refresh]);

  return { state, error, enable, disable };
}
