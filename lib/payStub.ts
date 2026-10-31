/**
 * Builds an employee pay stub (earnings statement) for ONE payment, from
 * records the app already keeps: the Payroll payment (payee_payments), the
 * employee's approved hours, and their earlier payments for year-to-date.
 *
 * Nothing is invented. The app does not calculate tax withholding, so a
 * stub has no tax lines: gross pay equals net pay plus nothing withheld,
 * and the stub says so. Reimbursements are paid back expenses, not
 * earnings — they are listed separately and are not part of gross pay.
 */
import type { PaymentRecord } from "./services/payeeOwed";
import { entryLaborCosts, type TimeEntry } from "./services/timeEntryService";

export interface PayStubEarning {
  /** "Regular hours", "Day rate", "Job pay", or "Pay". */
  kind: string;
  /** The job, or "Company time". */
  description: string;
  /** Approved hours behind this line in the pay period; null when not hour-based. */
  hours: number | null;
  /** Hourly (or day) rate; null when there is no single rate. */
  rate: number | null;
  current: number;
}

export interface PayStubData {
  paymentId: string;
  payDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  method: string;
  reference: string | null;
  reversed: boolean;
  reversalReason: string | null;
  earnings: PayStubEarning[];
  reimbursements: Array<{ description: string; amount: number }>;
  current: { hours: number; gross: number; deductions: number; reimbursements: number; net: number };
  /** Year to date through this pay date (this payment included). */
  ytd: { gross: number; deductions: number; reimbursements: number; net: number; byKind: Record<string, number> };
}

const cents = (n: number) => Math.round(n * 100) / 100;
const live = (p: PaymentRecord) => p.reversedAt === null && p.paymentKind === "pay";

/** Splits a payment into its parts: one per allocation, or the whole payment. */
function parts(p: PaymentRecord, labelFor: (estimateId: string | null) => string) {
  if (p.allocations && p.allocations.length > 0) {
    return p.allocations.map((a) => ({ kind: a.kind, estimateId: a.estimateId, amount: cents(a.amount), label: a.label }));
  }
  return [{ kind: "job" as const, estimateId: p.estimateId, amount: cents(p.amount), label: labelFor(p.estimateId) }];
}

/** "Hourly · OSR20260047 · Kitchen" -> kind "Regular hours", job "OSR20260047 · Kitchen". */
function classify(label: string, payType: "hourly" | "daily"): { kind: string; description: string } {
  const [head, ...rest] = label.split(" · ");
  const tail = rest.join(" · ");
  if (head === "Hourly") return { kind: payType === "daily" ? "Day rate" : "Regular hours", description: !tail || tail === "company time" ? "Company time" : tail };
  if (head === "Job pay") return { kind: "Job pay", description: tail || "Job" };
  // Money paid without a job: corrections added in Payroll, or pay not tied to any job.
  if (label === "Not tied to a job") return { kind: "Adjustment", description: "Correction or other pay" };
  return { kind: "Pay", description: label };
}

export function buildPayStub(input: {
  payment: PaymentRecord;
  /** Every payment to this employee (any year); used for year-to-date. */
  allPayments: PaymentRecord[];
  /** The employee's approved time entries (at least those in the pay period). */
  entries: TimeEntry[];
  payType: "hourly" | "daily";
  /** Job label for a payment recorded against one job without parts. */
  labelFor: (estimateId: string | null) => string;
}): PayStubData {
  const { payment, allPayments, entries, payType, labelFor } = input;

  // Approved hours in the pay period, per job (null = company time).
  const inPeriod = entries.filter(
    (e) =>
      e.status === "approved" &&
      e.hours !== null &&
      (!payment.periodStart || e.workDate >= payment.periodStart) &&
      (!payment.periodEnd || e.workDate <= payment.periodEnd)
  );
  // What each approved entry earned (hours × rate, or its share of a day rate).
  const costs = entryLaborCosts(inPeriod);
  /** The hours on a job in the period, one group per rate (a raise inside the
   * period gives two groups: days at the old rate, days at the new). */
  const byRate = (estimateId: string | null) => {
    const rows = inPeriod.filter((e) => (e.estimateId ?? null) === (estimateId ?? null));
    const groups = new Map<number, { hours: number; earned: number }>();
    for (const e of rows) {
      const g = groups.get(e.rate) ?? { hours: 0, earned: 0 };
      g.hours += e.hours ?? 0;
      g.earned += costs.get(e.id) ?? 0;
      groups.set(e.rate, g);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rate, g]) => ({ rate, hours: cents(g.hours), earned: cents(g.earned) }));
  };

  const earnings: PayStubEarning[] = [];
  const reimbursements: Array<{ description: string; amount: number }> = [];
  for (const part of parts(payment, labelFor)) {
    if (part.kind === "reimbursement") {
      reimbursements.push({ description: part.label, amount: part.amount });
      continue;
    }
    const { kind, description } = classify(part.label, payType);
    const timed = kind === "Regular hours" || kind === "Day rate";
    const groups = timed && payment.periodStart ? byRate(part.estimateId) : [];
    const earned = cents(groups.reduce((t, g) => t + g.earned, 0));
    if (groups.length > 0 && Math.abs(earned - part.amount) < 0.005) {
      // Paid in full for these hours: one line per rate, each hours × rate.
      for (const g of groups) earnings.push({ kind, description, hours: g.hours, rate: g.rate, current: g.earned });
    } else if (groups.length > 0) {
      // Part of what these hours earned (another check paid the rest): the
      // amount paid, with what it is part of — never hours × rate that don't add up.
      const basis = groups.map((g) => `${g.hours.toFixed(2)} h × $${g.rate.toFixed(2)}`).join(" + ");
      earnings.push({ kind, description: `${description} · part of $${earned.toFixed(2)} (${basis})`, hours: null, rate: null, current: part.amount });
    } else {
      // No approved hours found for this part: the amount paid only.
      earnings.push({ kind, description, hours: null, rate: null, current: part.amount });
    }
  }

  const gross = cents(earnings.reduce((t, e) => t + e.current, 0));
  const reimb = cents(reimbursements.reduce((t, r) => t + r.amount, 0));
  const hours = cents(earnings.reduce((t, e) => t + (e.hours ?? 0), 0));

  // Year to date: this year's live pay payments up to and including this one.
  const year = payment.paidOn.slice(0, 4);
  const upTo = (p: PaymentRecord) =>
    p.paidOn < payment.paidOn || (p.paidOn === payment.paidOn && (p.createdAt ?? "") <= (payment.createdAt ?? "")) || p.id === payment.id;
  const yearPayments = allPayments.filter((p) => live(p) && p.paidOn.slice(0, 4) === year && upTo(p));
  const byKind: Record<string, number> = {};
  let ytdGross = 0;
  let ytdReimb = 0;
  for (const p of yearPayments) {
    for (const part of parts(p, labelFor)) {
      if (part.kind === "reimbursement") {
        ytdReimb += part.amount;
        continue;
      }
      const { kind } = classify(part.label, payType);
      byKind[kind] = cents((byKind[kind] ?? 0) + part.amount);
      ytdGross += part.amount;
    }
  }

  return {
    paymentId: payment.id,
    payDate: payment.paidOn,
    periodStart: payment.periodStart,
    periodEnd: payment.periodEnd,
    method: payment.method,
    reference: payment.reference,
    reversed: payment.reversedAt !== null,
    reversalReason: payment.reversalReason,
    earnings,
    reimbursements,
    current: { hours, gross, deductions: 0, reimbursements: reimb, net: cents(gross + reimb) },
    ytd: { gross: cents(ytdGross), deductions: 0, reimbursements: cents(ytdReimb), net: cents(ytdGross + ytdReimb), byKind },
  };
}
