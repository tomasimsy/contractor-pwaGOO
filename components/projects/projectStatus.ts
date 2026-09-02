import type { ProjectStatus } from "@/lib/services";

/** A job that's actively being worked (or already finished) with zero
 * invoices ever created is money that was never asked for — flagged
 * the same way an unpaid invoice is. Draft/active/cancelled/archived
 * are excluded: work hasn't started yet, or the job is dead/already
 * filed away, neither of which is "forgot to bill." Shared by the
 * Projects list (the badge) and the Dashboard (the count) so they
 * can never disagree. */
export function isNeverInvoiced(status: ProjectStatus, invoiceCount: number): boolean {
  return (status === "in_progress" || status === "completed") && invoiceCount === 0;
}

/** Same "starts soon, still nobody assigned" window the daily
 * automations cron already pushes about (app/api/cron/daily-
 * automations/route.ts's sendUnstaffedJobAlerts) — this is the
 * always-visible dashboard counterpart to that one-shot push, so the
 * gap is visible whether or not push is configured/enabled. A live
 * date-range check (today..+3 days), not the cron's exact-day match —
 * that one-shot design exists there to avoid repeat pushes, which
 * doesn't apply to a badge that's just reading current state. */
export const UNSTAFFED_ALERT_WINDOW_DAYS = 3;
export function isUnstaffedSoon(startDate: string | null, assignedUserId: string | null): boolean {
  if (!startDate || assignedUserId) return false;
  const start = new Date(startDate).getTime();
  const now = Date.now();
  const windowEnd = now + UNSTAFFED_ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return start >= now && start <= windowEnd;
}
