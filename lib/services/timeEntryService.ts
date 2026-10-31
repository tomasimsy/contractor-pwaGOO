/**
 * Layer 2 — owns `time_entries`: hours an employee worked, optionally on an
 * estimate. Clock in / clock out are a timer that writes one entry; a manual
 * entry is an hours number on a date.
 *
 * Money: an entry's labor cost is hours × rate, counted only once the entry is
 * approved. This service stores the rate on the entry, so a later raise never
 * changes past cost. It writes no expense rows.
 */
import type { UUID, AuditedEntity, QueryScope, ISODate, ISODateTime } from "./types";

export type TimeEntryStatus = "submitted" | "approved";

export interface TimeEntry extends AuditedEntity {
  employeeId: UUID;
  /** Null = company time (shop work, training, overhead). */
  estimateId: UUID | null;
  workDate: ISODate;
  /** Both null for a manual hours entry. */
  startedAt: ISODateTime | null;
  endedAt: ISODateTime | null;
  hours: number | null;
  rate: number;
  /** Copied from the employee when the entry is made, like the rate. */
  payType: PayType;
  notes: string | null;
  status: TimeEntryStatus;
  enteredBy: UUID | null;
  approvedBy: UUID | null;
  approvedAt: ISODateTime | null;
}

/** Hours between two instants, rounded to 0.01. Throws when the times are
 * out of order or the shift is longer than a day, which is almost always a
 * forgotten clock-out. */
export function calculateShiftHours(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new Error("Clock times are not valid.");
  if (end <= start) throw new Error("Clock-out must be after clock-in.");
  const hours = Math.round(((end - start) / 3_600_000) * 100) / 100;
  if (hours > 24) throw new Error("A single shift cannot be longer than 24 hours. Check the clock-out time.");
  return hours;
}

export type PayType = "hourly" | "daily";

/** Labor cost of each APPROVED entry, in dollars, keyed by entry id.
 *
 * hourly: hours × rate.
 * daily:  the day rate, shared across the entries for the same person and
 *         date by hours. One day split between two jobs at 6h and 2h costs
 *         the day rate × 0.75 and × 0.25, so the day is paid once in total.
 *
 * Pass the entries you need costed together with any others on the same
 * days, so a split day is shared correctly. Unapproved entries are ignored. */
export function entryLaborCosts(entries: TimeEntry[]): Map<string, number> {
  const approved = entries.filter((e) => e.status === "approved" && e.hours !== null);
  const dayHours = new Map<string, number>();
  for (const e of approved) {
    if (e.payType !== "daily") continue;
    const key = `${e.employeeId}|${e.workDate}`;
    dayHours.set(key, (dayHours.get(key) ?? 0) + (e.hours ?? 0));
  }
  const costs = new Map<string, number>();
  for (const e of approved) {
    let cents: number;
    if (e.payType === "daily") {
      const total = dayHours.get(`${e.employeeId}|${e.workDate}`) ?? 0;
      const share = total > 0 ? (e.hours ?? 0) / total : 0;
      cents = Math.round(e.rate * 100 * share);
    } else {
      cents = Math.round((e.hours ?? 0) * e.rate * 100);
    }
    costs.set(e.id, cents / 100);
  }
  return costs;
}

/** Labor cost of a set of entries, in dollars. Approved entries only. */
export function calculateLaborCost(entries: TimeEntry[]): number {
  const costs = entryLaborCosts(entries);
  let total = 0;
  for (const amount of costs.values()) total += amount;
  return Math.round(total * 100) / 100;
}

export interface ClockInInput {
  companyId: UUID;
  employeeId: UUID;
  /** Null = clock in without a job (company time). */
  estimateId: UUID | null;
  /** Local calendar date of the shift, YYYY-MM-DD. */
  workDate: ISODate;
  /** The clock-in instant. Defaults to now on the server. */
  startedAt?: ISODateTime;
  /** Rate to copy onto the entry: the hourly rate, or the day rate. */
  rate: number;
  payType: PayType;
  enteredBy: UUID;
}

export interface ManualEntryInput {
  companyId: UUID;
  employeeId: UUID;
  estimateId: UUID | null;
  workDate: ISODate;
  hours: number;
  rate: number;
  payType: PayType;
  notes?: string | null;
  enteredBy: UUID;
}

export interface TimeEntryService {
  /** The one open shift for an employee, or null. */
  getOpenShift(employeeId: UUID): Promise<TimeEntry | null>;
  /** Refuses when the employee already has an open shift. */
  clockIn(input: ClockInInput): Promise<TimeEntry>;
  /** Closes the open shift and calculates its hours. */
  clockOut(entryId: UUID, endedAt?: ISODateTime): Promise<TimeEntry>;
  addManualEntry(input: ManualEntryInput): Promise<TimeEntry>;

  /** Entries for one employee within an optional date range (YYYY-MM-DD). */
  listForEmployee(employeeId: UUID, range?: { from?: ISODate; to?: ISODate }): Promise<TimeEntry[]>;
  /** Entries for the whole company, with the same optional range. */
  listForCompany(scope: QueryScope, range?: { from?: ISODate; to?: ISODate }): Promise<TimeEntry[]>;

  /** Edit: change the job, date, notes, or clock times. Hours are recalculated
   * when both clock times are present. Editing an APPROVED entry sends it back
   * to `submitted`, so it needs approval again before it counts toward cost. */
  updateEntry(entryId: UUID, changes: Partial<Pick<TimeEntry, "estimateId" | "workDate" | "notes" | "hours" | "startedAt" | "endedAt">>): Promise<TimeEntry>;
  approve(entryIds: UUID[], approverId: UUID): Promise<void>;
  /** Requires a reason, same as the other soft deletes. */
  softDelete(entryId: UUID, reason: string): Promise<void>;
}
