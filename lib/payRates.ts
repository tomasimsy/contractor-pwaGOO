/**
 * Pay rate history: one rule.
 *
 *   Unpaid hours use the rate in effect on the day they were worked;
 *   paid hours never change.
 *
 * The database applies it to time entries (migration 20261029080000:
 * time_entries_apply_rate and resync_employee_rates). These helpers answer
 * the same questions on screen, so the form and the stored entries agree.
 */
import { periodContaining, shiftPeriodDays, type PeriodLength } from "./payPeriods";

export interface PayRate {
  id: string;
  employeeId: string;
  rate: number;
  payType: "hourly" | "daily";
  /** YYYY-MM-DD. '1900-01-01' means "from the start". */
  effectiveDate: string;
  note: string | null;
  createdAt: string;
}

/** The earliest possible effective date: the starting rate. */
export const FROM_THE_START = "1900-01-01";

/** The rate in effect on a day: the latest one that started on or before it. */
export function rateOn(history: PayRate[], day: string): PayRate | null {
  let best: PayRate | null = null;
  for (const r of history) {
    if (r.effectiveDate <= day && (!best || r.effectiveDate > best.effectiveDate)) best = r;
  }
  return best;
}

/** Newest first, each with the day it ended (the day before the next one started), or null if current/upcoming. */
export function rateTimeline(history: PayRate[]): Array<PayRate & { endsOn: string | null }> {
  const sorted = [...history].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return sorted.map((r, i) => ({ ...r, endsOn: i === 0 ? null : shiftPeriodDays(sorted[i - 1].effectiveDate, -1) }));
}

/** The first day of the next pay period: the default start for a raise, so
 * almost every check has a single rate. */
export function nextPayPeriodStart(payFrequency: "weekly" | "biweekly", today: Date = new Date()): string {
  const days: PeriodLength = payFrequency === "weekly" ? 7 : 14;
  return shiftPeriodDays(periodContaining(today, days).end, 1);
}
