/**
 * Layer 2 — owns `bill_schedules`: recurring bill TEMPLATES.
 *
 * ============================================================
 * A SCHEDULE IS NOT A COST
 * ============================================================
 * It is a rule ("$450 insurance, monthly, on the 10th"). It holds no
 * money any calculation reads, and nothing in FinancialEngine imports
 * this service. Creating a schedule moves no total anywhere.
 *
 * When an occurrence comes due, `generateDue` writes ONE ordinary
 * `estimate_expenses` row with a `due_date` — i.e. a Bill, through the
 * existing ExpenseService — and advances `nextDueDate`. That generated
 * expense is the only financial record. This is what keeps a recurring
 * bill from double-counting: the template is bookkeeping about WHEN to
 * create the next cost, never a cost itself.
 *
 * Generation is idempotent because `nextDueDate` is advanced in the same
 * pass: re-running it produces nothing until the next date arrives.
 */
import type { UUID, AuditedEntity } from "./types";
import type { ExpenseType } from "./expenseService";

export const BILL_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type BillFrequency = (typeof BILL_FREQUENCIES)[number];

export const BILL_FREQUENCY_LABEL: Record<BillFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export interface BillSchedule extends AuditedEntity {
  projectId: UUID | null;
  vendor: string | null;
  amount: number;
  expenseType: ExpenseType;
  notes: string | null;

  frequency: BillFrequency;
  /** Every N periods. 1 = every month / week / year. */
  intervalCount: number;
  startDate: string;
  /** The date the next occurrence is due. Advanced on generation. */
  nextDueDate: string;
  /** Null = never ends. */
  endDate: string | null;
  /** Null = unlimited. */
  maxOccurrences: number | null;
  occurrencesGenerated: number;
  isActive: boolean;
}

export interface BillScheduleCreateInput {
  companyId: UUID;
  projectId?: UUID | null;
  vendor?: string | null;
  amount: number;
  expenseType?: ExpenseType;
  notes?: string | null;
  frequency: BillFrequency;
  intervalCount?: number;
  startDate: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
}

export interface BillScheduleService {
  listForCompany(companyId: UUID): Promise<BillSchedule[]>;
  create(input: BillScheduleCreateInput): Promise<BillSchedule>;
  update(
    scheduleId: UUID,
    changes: Partial<{ amount: number; vendor: string | null; notes: string | null; isActive: boolean; endDate: string | null }>
  ): Promise<BillSchedule>;
  softDelete(scheduleId: UUID, reason: string): Promise<void>;

  /**
   * Materialise every occurrence that is due on or before `asOf` into
   * real bills, and advance each schedule.
   *
   * Returns how many expense rows were written. Called when the Bills
   * page loads — there is no scheduler in this app, and adding one would
   * be infrastructure this feature does not need: a bill that appears
   * the moment somebody looks at the Bills page is indistinguishable, to
   * the user, from one created by a nightly job.
   */
  generateDue(companyId: UUID, asOf?: string): Promise<number>;
}

/** Advance a yyyy-mm-dd date by N periods. Exported for the in-memory
 * double and tests so both implementations step identically.
 *
 * Month/year steps clamp to the end of a short month: a bill due on the
 * 31st recurs on Feb 28. Without clamping, `new Date(2026, 1, 31)` rolls
 * into March and the schedule silently drifts a day later every year. */
export function advanceBillDate(date: string, frequency: BillFrequency, intervalCount: number): string {
  const [y, m, d] = date.split("-").map(Number);
  if (frequency === "weekly") {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 7 * intervalCount);
    return dt.toISOString().slice(0, 10);
  }
  const months = frequency === "monthly" ? intervalCount : 12 * intervalCount;
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
