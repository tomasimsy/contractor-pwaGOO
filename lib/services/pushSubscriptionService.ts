/**
 * PushSubscriptionService — owns `push_subscriptions`. Stores each
 * staff device's Web Push (VAPID) subscription so lib/push/sendPush.ts
 * can notify every device for a company. See that file for the actual
 * sending; this service is pure storage (subscribe/unsubscribe/list).
 */
import type { UUID } from "./types";

export interface PushSubscription {
  id: UUID;
  companyId: UUID;
  userId: UUID;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}

export interface PushSubscriptionInput {
  companyId: UUID;
  userId: UUID;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionService {
  /** Upsert by endpoint — re-subscribing the same device (permission
   * re-granted, key rotated) updates the existing row instead of
   * creating a duplicate. */
  subscribe(input: PushSubscriptionInput): Promise<PushSubscription>;
  /** Removes one device's subscription (e.g. the user toggles
   * notifications off, or the browser reports the endpoint gone). */
  unsubscribe(endpoint: string): Promise<void>;
  listForCompany(companyId: UUID): Promise<PushSubscription[]>;
}
