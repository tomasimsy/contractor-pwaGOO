import type { EstimateStatus } from "@/lib/services";

/** A draft that's sat unsent this long is a lead going cold, not just
 * unfinished paperwork — flagged the same way an unpaid invoice is
 * (components/invoices/invoiceStatus.ts's isUnpaidInvoiceStatus), so
 * it's not silently forgotten. Estimates have no dedicated "sent at"
 * timestamp to anchor a draft's age on, so createdAt is the only
 * honest anchor: the moment it was created is also the moment it
 * started sitting in draft. Shared by the Estimates list (the badge)
 * and the Dashboard (the count) so they can never disagree. */
export const STALE_DRAFT_DAYS = 14;
export function isStaleDraft(status: EstimateStatus, createdAt: string): boolean {
  if (status !== "draft") return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs > STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000;
}
