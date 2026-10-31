import { applyJobPay, type JobPay } from "./jobPay";
import type { TimeEntry } from "./timeEntryService";

/** One line on a person's statement: earned on a job, with what has been paid against it. */
export interface PayLine {
  label: string;
  estimateId: string | null;
  earned: number;
  paid: number;
  owed: number;
  /** hourly = approved hours; jobPay = fixed job amount; team = fixed team amount;
   * adjustment = corrections added in Payroll (display only — see computePayees). */
  kind: "hourly" | "jobPay" | "team" | "reimbursement" | "adjustment";
  /** For a reimbursement line: the expenses it pays back. */
  expenseIds?: string[];
}

/** A pending reimbursement: an expense a person paid for the company, not yet paid back. */
export interface PendingReimbursement {
  expenseId: string;
  profileId: string;
  /** Who is owed: used for a team member with no pay of their own. */
  payeeName: string;
  amount: number;
  label: string;
}

/** One part of a payment: a job, money not tied to a job, or a reimbursement. */
export interface PaymentAllocation {
  kind: "job" | "unassigned" | "reimbursement";
  estimateId: string | null;
  /** Set for a subcontractor job recorded against a project with no estimate. */
  projectId?: string | null;
  amount: number;
  label: string;
  /** Expenses this part created (team job costs) or settled (reimbursements). */
  expenseIds: string[];
}

export interface PaymentRecord {
  id: string;
  /** The parts of one check. Null for a payment recorded against a single job. */
  allocations?: PaymentAllocation[] | null;
  payeeKind: "employee" | "team";
  employeeId: string | null;
  profileId: string | null;
  estimateId: string | null;
  /** The labor expense written for a team payment, if any. */
  expenseId?: string | null;
  amount: number;
  /** pay = wages; reimbursement = money back for an expense. */
  paymentKind: "pay" | "reimbursement" | "adjustment";
  /** The pay period this payment covers, when recorded against one. */
  periodStart: string | null;
  periodEnd: string | null;
  paidOn: string;
  method: string;
  reference: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  /** When it was recorded, to order payments made on the same day. */
  createdAt?: string | null;
  /** For an adjustment: its reason. */
  notes?: string | null;
}

export interface PayeeRow {
  key: string;
  name: string;
  kind: "employee" | "team";
  /** The employee's pay frequency. Team members are paid per job, so this is unset. */
  payFrequency?: "weekly" | "biweekly";
  lines: PayLine[];
  earned: number;
  paid: number;
  owed: number;
  /** Paid to this person with no job recorded against it. */
  unassignedPaid?: number;
  payments: PaymentRecord[];
}

export interface PayeeInput {
  /** Only entries on or before this date count (the pay period end). Omit for all. */
  throughDate?: string;
  reimbursements?: PendingReimbursement[];
  entries: TimeEntry[];
  employees: Array<{ id: string; name: string; profileId: string | null; isActive: boolean; payFrequency?: "weekly" | "biweekly" }>;
  jobPays: JobPay[];
  completedEstimateIds: Set<string>;
  /** Fixed team amounts per estimate and person (active assignments only). */
  teamAssignments: Array<{ profileId: string; estimateId: string; amount: number; name: string }>;
  estimateLabel: (estimateId: string) => string;
  payments: PaymentRecord[];
  /** Paid labor expense rows for team members (payee = the person, on a job).
   * ONE PAYMENT = ONE EXPENSE RECORD: a team member's job counts as paid by
   * these rows — Payroll's own payments write one per job, and a payment
   * recorded anywhere else (an older page, a manual expense) is one too, so
   * Payroll, the estimate and the expense list all agree. When omitted,
   * paid is read from the payments alone. */
  teamPaidExpenses?: Array<{ profileId: string; estimateId: string; amount: number }>;
}

const cents = (n: number) => Math.round(n * 100) / 100;
const live = (p: PaymentRecord) => p.reversedAt === null;
const isPay = (p: PaymentRecord) => p.paymentKind === "pay";

/** What every employee and team member has earned, what has been paid, and what is owed.
 *
 * Employees: approved hourly time (job pay rules applied) plus job pay once its
 * project is complete, less everything paid to them.
 * Team members: their fixed amount on each completed job, less what was paid on that job.
 *
 * Reversed payments are ignored: they neither count as paid nor appear in totals. */
export function computePayees(input: PayeeInput): PayeeRow[] {
  const { employees, jobPays, completedEstimateIds, teamAssignments, estimateLabel, payments, reimbursements = [] } = input;
  const entries = input.throughDate ? input.entries.filter((e) => e.workDate <= (input.throughDate as string)) : input.entries;
  const applied = applyJobPay(entries, jobPays, completedEstimateIds);
  // A stored payment can cover several jobs and a reimbursement. For the math it is split into
  // parts; for display each stored payment is shown once.
  const byId = new Map(payments.map((p) => [p.id, p] as const));
  const partsOf = (p: PaymentRecord): PaymentRecord[] => {
    if (!p.allocations || p.allocations.length === 0) return [p];
    return p.allocations.map((a, i) => ({
      ...p,
      id: `${p.id}#${i}`,
      amount: cents(a.amount),
      estimateId: a.estimateId,
      // The labor expense this part wrote, if any (see teamPaidExpenses).
      expenseId: a.kind === "job" ? a.expenseIds[0] ?? null : null,
      paymentKind: a.kind === "reimbursement" ? "reimbursement" : "pay",
    }));
  };
  const shown = (list: PaymentRecord[]): PaymentRecord[] => {
    const seen = new Set<string>();
    return list
      .map((part) => byId.get(part.id.split("#")[0]) ?? part)
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  };
  const allParts = payments.flatMap(partsOf);
  // Pay totals count only wage payments; reimbursement payments settle expenses separately.
  const active = allParts.filter((p) => live(p) && isPay(p));
  const reimbursementPayments = allParts.filter((p) => live(p) && p.paymentKind === "reimbursement");
  const adjustmentRows = (match: (p: PaymentRecord) => boolean) => allParts.filter((p) => live(p) && p.paymentKind === "adjustment" && match(p));
  const adjustmentsFor = (match: (p: PaymentRecord) => boolean) =>
    cents(allParts.filter((p) => live(p) && p.paymentKind === "adjustment" && match(p)).reduce((t, p) => t + p.amount, 0));
  const pendingFor = (profileId: string | null) => (profileId ? reimbursements.filter((r) => r.profileId === profileId) : []);
  const reimbursementLine = (items: PendingReimbursement[]): PayLine | null => {
    const total = cents(items.reduce((s, r) => s + r.amount, 0));
    if (total <= 0) return null;
    return { label: `Reimbursement · ${items.length} expense${items.length === 1 ? "" : "s"}`, estimateId: null, earned: total, paid: 0, owed: total, kind: "reimbursement", expenseIds: items.map((r) => r.expenseId) };
  };
  const rows: PayeeRow[] = [];
  // A person who is both an employee and a team member gets one Payroll row.
  // Maps the login (profile id) to that employee's row.
  const employeeRowByProfile = new Map<string, number>();

  for (const emp of employees) {
    const hourlyByEstimate = new Map<string, number>();
    let companyTime = 0;
    for (const e of entries) {
      if (e.employeeId !== emp.id) continue;
      const cost = applied.entryCost.get(e.id);
      if (cost === undefined) continue;
      if (e.estimateId) hourlyByEstimate.set(e.estimateId, (hourlyByEstimate.get(e.estimateId) ?? 0) + cost);
      else companyTime += cost;
    }
    const lines: PayLine[] = [];
    for (const [estimateId, amount] of hourlyByEstimate) {
      lines.push({ label: `Hourly · ${estimateLabel(estimateId)}`, estimateId, earned: cents(amount), paid: 0, owed: 0, kind: "hourly" });
    }
    if (companyTime > 0) lines.push({ label: "Hourly · company time", estimateId: null, earned: cents(companyTime), paid: 0, owed: 0, kind: "hourly" });
    for (const pay of jobPays) {
      if (pay.employeeId !== emp.id) continue;
      const earned = completedEstimateIds.has(pay.estimateId) ? pay.amount : 0;
      if (earned > 0) lines.push({ label: `Job pay · ${estimateLabel(pay.estimateId)}`, estimateId: pay.estimateId, earned: cents(earned), paid: 0, owed: 0, kind: "jobPay" });
    }

    const payments = active.filter((p) => p.payeeKind === "employee" && p.employeeId === emp.id);
    // Each job line shows what has been paid against it. Payments with no job count only in the total.
    for (const line of lines) {
      if (line.estimateId === null) continue;
      line.paid = cents(payments.filter((p) => p.estimateId === line.estimateId).reduce((s, p) => s + p.amount, 0));
      line.owed = cents(Math.max(0, line.earned - line.paid));
    }
    // Payments with no job are applied to the job lines, oldest job first, so each
    // line's owed matches the total. The total itself does not change.
    let unallocated = cents(payments.filter((p) => !p.estimateId).reduce((t, p) => t + p.amount, 0));
    for (const line of [...lines].filter((l) => l.kind !== "reimbursement" && l.estimateId).sort((a, b) => a.label.localeCompare(b.label))) {
      if (unallocated <= 0) break;
      const take = Math.min(unallocated, line.owed);
      line.paid = cents(line.paid + take);
      line.owed = cents(line.owed - take);
      unallocated = cents(unallocated - take);
    }
    const reimb = reimbursementLine(pendingFor(emp.profileId));
    const reimbOwed = reimb ? reimb.owed : 0;
    if (reimb) lines.push(reimb);
    const earned = cents(lines.filter((l) => l.kind !== "reimbursement").reduce((s, l) => s + l.earned, 0));
    const paid = cents(payments.reduce((s, p) => s + p.amount, 0));
    const untagged = cents(payments.filter((p) => !p.estimateId).reduce((s, p) => s + p.amount, 0));
    // Kept while they have any payment on record — a reversed check too — so
    // its history and pay stub stay reachable.
    const anyPayment = allParts.some((p) => p.employeeId === emp.id && p.payeeKind === "employee");
    if (earned === 0 && paid === 0 && reimbOwed === 0 && !anyPayment) continue;
    const history = shown([
      ...payments,
      ...reimbursementPayments.filter((p) => p.profileId !== null && p.profileId === emp.profileId),
      ...adjustmentRows((p) => p.employeeId === emp.id),
      // Reversed checks stay in the history (marked reversed); they count toward nothing.
      ...allParts.filter((p) => !live(p) && p.payeeKind === "employee" && p.employeeId === emp.id),
    ]);
    // A correction shows as its own line: what is still owed from it (the part
    // of the total owed that no job line explains). Display only — the total
    // owed is computed below exactly as before.
    const adjustments = adjustmentRows((p) => p.employeeId === emp.id);
    if (adjustments.length > 0) {
      const owedTotal = cents(Math.max(0, earned - paid + adjustmentsFor((p) => p.employeeId === emp.id)) + reimbOwed);
      const explained = cents(lines.reduce((t, l) => t + l.owed, 0));
      const adjTotal = cents(adjustments.reduce((t, p) => t + p.amount, 0));
      const residual = cents(owedTotal - explained);
      if (Math.abs(adjTotal) > 0.005) {
        lines.push({
          label: `Correction · ${adjustments.map((p) => p.notes || "adjustment").join("; ")}`,
          estimateId: null,
          earned: adjTotal,
          paid: cents(Math.max(0, adjTotal - Math.max(0, residual))),
          owed: Math.max(0, residual),
          kind: "adjustment",
        });
      }
    }
    if (emp.profileId) employeeRowByProfile.set(emp.profileId, rows.length);
    rows.push({
      key: `employee:${emp.id}`,
      name: emp.name,
      kind: "employee",
      payFrequency: emp.payFrequency,
      lines,
      earned,
      paid,
      // Owed is the total: earned less everything paid, including payments with no job.
      owed: cents(Math.max(0, earned - paid + adjustmentsFor((p) => p.employeeId === emp.id)) + reimbOwed),
      unassignedPaid: untagged,
      payments: history.sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
    });
  }

  const byProfile = new Map<string, { name: string; lines: PayLine[] }>();
  for (const t of teamAssignments) {
    if (!completedEstimateIds.has(t.estimateId) || t.amount <= 0) continue;
    const row = byProfile.get(t.profileId) ?? { name: t.name, lines: [] };
    const teamPartsOnJob = active.filter((p) => p.payeeKind === "team" && p.profileId === t.profileId && p.estimateId === t.estimateId);
    const paidOnJob = input.teamPaidExpenses
      ? cents(
          input.teamPaidExpenses.filter((x) => x.profileId === t.profileId && x.estimateId === t.estimateId).reduce((s, x) => s + x.amount, 0) +
            // A payment part that wrote no expense of its own still counts.
            teamPartsOnJob.filter((p) => !p.expenseId).reduce((s, p) => s + p.amount, 0)
        )
      : cents(teamPartsOnJob.reduce((s, p) => s + p.amount, 0));
    row.lines.push({
      label: `Fixed · ${estimateLabel(t.estimateId)}`,
      estimateId: t.estimateId,
      earned: cents(t.amount),
      paid: paidOnJob,
      owed: cents(Math.max(0, t.amount - paidOnJob)),
      kind: "team",
    });
    byProfile.set(t.profileId, row);
  }
  const employeeProfiles = new Set(employees.map((e) => e.profileId).filter((x): x is string => !!x));
  for (const r of reimbursements) {
    if (employeeProfiles.has(r.profileId) || byProfile.has(r.profileId)) continue;
    byProfile.set(r.profileId, { name: r.payeeName, lines: [] });
  }
  for (const [profileId, row] of byProfile) {
    const employeeIndex = employeeRowByProfile.get(profileId);
    const merged = employeeIndex !== undefined;
    // An employee's reimbursements are already on their employee row, so they are not repeated here.
    if (!merged) {
      const reimb = reimbursementLine(pendingFor(profileId));
      if (reimb) row.lines.push(reimb);
    }
    const payments = [
      ...active.filter((p) => p.payeeKind === "team" && p.profileId === profileId),
      ...(merged ? [] : reimbursementPayments.filter((p) => p.profileId === profileId)),
      ...adjustmentRows((p) => p.profileId === profileId),
    ];
    const earned = cents(row.lines.filter((l) => l.kind !== "reimbursement").reduce((s, l) => s + l.earned, 0));
    const paid = cents(payments.filter((p) => p.paymentKind === "pay").reduce((s, p) => s + p.amount, 0));
    const owed = cents(Math.max(0, row.lines.reduce((s, l) => s + l.owed, 0) + adjustmentsFor((p) => p.profileId === profileId)));
    if (merged) {
      const person = rows[employeeIndex];
      person.lines.push(...row.lines);
      person.earned = cents(person.earned + earned);
      person.paid = cents(person.paid + paid);
      person.owed = cents(person.owed + owed);
      person.payments = [...person.payments, ...shown(payments)].sort((a, b) => b.paidOn.localeCompare(a.paidOn));
      continue;
    }
    if (row.lines.length === 0) continue;
    rows.push({
      key: `team:${profileId}`,
      name: row.name,
      kind: "team",
      lines: row.lines,
      earned,
      paid,
      owed,
      payments: shown(payments).sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
    });
  }

  return rows.sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
}
