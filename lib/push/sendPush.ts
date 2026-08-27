/**
 * Web Push (VAPID) sending — server-only. First (and, as of writing,
 * only) caller is estimateWorkflow.ts's signEstimate(), notifying
 * every staff device at the company the moment a customer signs, but
 * this file is general-purpose: any future push just calls
 * sendPushToCompany with a different payload.
 *
 * Never throws for a per-device failure or even total misconfiguration
 * — a push notification is always a best-effort side effect, never
 * something that can block the real action that triggered it (e.g. a
 * customer's signature must be recorded regardless of whether push
 * is configured or Resend... er, web-push... succeeds).
 */
import webpush from "web-push";
import type { PushSubscription, PushSubscriptionService } from "@/lib/services/pushSubscriptionService";
import type { UUID } from "@/lib/services/types";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.error("Push notifications are not configured — missing NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT.");
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** App-relative path to open/focus when the notification is
   * clicked — see public/sw.js's notificationclick handler. */
  url?: string;
}

/** Sends to every subscription, one at a time per device — a single
 * expired/revoked subscription (404/410 from the push service) is
 * reported back for pruning, never thrown, and never blocks sending
 * to the other devices. */
async function sendToSubscriptions(subscriptions: PushSubscription[], payload: PushPayload): Promise<{ deadEndpoints: string[] }> {
  const deadEndpoints: string[] = [];
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          deadEndpoints.push(sub.endpoint);
        } else {
          console.error("Push send failed for one device:", err instanceof Error ? err.message : err);
        }
      }
    })
  );
  return { deadEndpoints };
}

/** The one function callers use. Loads every device subscribed for
 * `companyId`, sends, and prunes anything the push service reports as
 * gone. Swallows every error — see this file's header. */
export async function sendPushToCompany(pushSubscriptionService: PushSubscriptionService, companyId: UUID, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  try {
    const subscriptions = await pushSubscriptionService.listForCompany(companyId);
    if (subscriptions.length === 0) return;
    const { deadEndpoints } = await sendToSubscriptions(subscriptions, payload);
    await Promise.all(deadEndpoints.map((endpoint) => pushSubscriptionService.unsubscribe(endpoint).catch(() => {})));
  } catch (err) {
    console.error("sendPushToCompany failed:", err instanceof Error ? err.message : err);
  }
}
