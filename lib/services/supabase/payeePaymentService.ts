/**
 * Real Supabase-backed PayeePaymentService. Reads come from the existing
 * services; the only table written here is payee_payments. A team payment also
 * writes a labor expense on its job through ExpenseService, and a reimbursement
 * marks its expenses reimbursed through ExpenseService, so job cost stays correct.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmployeeWagePayment, ListEmployeeWages, PayeePaymentService, RecordPaymentInput } from "../payeePaymentService";
import { computePayees, type PayeeRow, type PaymentAllocation, type PaymentRecord, type PendingReimbursement } from "../payeeOwed";
import type { EmployeeService } from "../employeeService";
import type { TimeEntryService } from "../timeEntryService";
import type { EstimateService } from "../estimateService";
import type { ProjectService } from "../projectService";
import type { ExpenseService } from "../expenseService";
import type { UUID } from "../types";

const cents = (n: number) => Math.round(n * 100) / 100;

interface PaymentRow {
  id: string;
  payee_kind: "employee" | "team";
  employee_id: string | null;
  profile_id: string | null;
  estimate_id: string | null;
  expense_id: string | null;
  amount: number | string;
  paid_on: string;
  method: string;
  reference: string | null;
  notes: string | null;
  payment_kind: "pay" | "reimbursement";
  period_start: string | null;
  period_end: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  allocations: PaymentAllocation[] | null;
  created_at?: string | null;
}

export function createSupabasePayeePaymentService(
  supabase: SupabaseClient,
  services: {
    employeeService: EmployeeService;
    timeEntryService: TimeEntryService;
    estimateService: EstimateService;
    projectService: ProjectService;
    expenseService: ExpenseService;
  },
  companyId: UUID
): PayeePaymentService {
  async function gather(throughDate?: string) {
    const [people, entries, jobPays, estimates, projects, teamRes, payRes, membersRes, expenses] = await Promise.all([
      services.employeeService.list({ companyId }),
      services.timeEntryService.listForCompany({ companyId }),
      services.employeeService.listJobPays(companyId),
      services.estimateService.list({ companyId }),
      services.projectService.list({ companyId }),
      supabase.from("estimate_team_members").select("user_id, estimate_id, amount").eq("company_id", companyId).is("deleted_at", null),
      supabase.from("payee_payments").select("*").eq("company_id", companyId).order("paid_on", { ascending: false }),
      supabase.rpc("list_company_members"),
      services.expenseService.listForCompany(companyId),
    ]);
    if (teamRes.error) throw new Error(`Failed to load team assignments: ${teamRes.error.message}`);
    if (payRes.error) throw new Error(`Failed to load payments: ${payRes.error.message}`);

    const projectStatus = new Map(projects.map((p) => [p.id, p.status]));
    const estimateById = new Map(
      estimates.map((e) => [e.id, { projectId: e.projectId, label: [e.estimateNumber, e.title].filter(Boolean).join(" · ") || "Untitled job" }])
    );
    const completed = new Set(estimates.filter((e) => projectStatus.get(e.projectId) === "completed").map((e) => e.id));
    const nameByProfile = new Map(
      ((membersRes.data ?? []) as Array<{ id: string; email: string | null; full_name?: string | null }>).map((m) => [m.id, m.full_name?.trim() || m.email || "Team member"])
    );
    const payments: PaymentRecord[] = ((payRes.data ?? []) as PaymentRow[]).map((r) => ({
      id: r.id,
      payeeKind: r.payee_kind,
      employeeId: r.employee_id,
      profileId: r.profile_id,
      estimateId: r.estimate_id,
      expenseId: r.expense_id,
      amount: Number(r.amount),
      paymentKind: r.payment_kind,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      paidOn: r.paid_on,
      method: r.method,
      reference: r.reference,
      reversedAt: r.reversed_at,
      reversalReason: r.reversal_reason,
      notes: r.notes ?? null,
      allocations: r.allocations,
      createdAt: r.created_at ?? null,
    }));
    // Expenses a person paid for the company and has not been paid back for.
    const reimbursements: PendingReimbursement[] = expenses
      .filter((x) => x.reimbursable && x.reimbursementStatus === "pending" && x.paidByType === "employee" && x.paidById && !x.deletedAt)
      .map((x) => ({
        expenseId: x.id,
        profileId: x.paidById as string,
        payeeName: nameByProfile.get(x.paidById as string) ?? "Team member",
        amount: x.amount,
        label: x.description || "Expense",
      }));

    const rows = computePayees({
      throughDate,
      entries,
      employees: people.map((p) => ({ id: p.id, name: p.name, profileId: p.profileId, isActive: p.isActive, payFrequency: p.payFrequency })),
      jobPays: jobPays.map((p) => ({ estimateId: p.estimateId, employeeId: p.employeeId, amount: p.amount, mode: p.mode })),
      completedEstimateIds: completed,
      teamAssignments: ((teamRes.data ?? []) as Array<{ user_id: string; estimate_id: string; amount: number | string }>).map((t) => ({
        profileId: t.user_id,
        estimateId: t.estimate_id,
        amount: Number(t.amount),
        name: nameByProfile.get(t.user_id) ?? "Team member",
      })),
      estimateLabel: (id) => estimateById.get(id)?.label ?? "Job",
      payments,
      reimbursements,
      teamPaidExpenses: expenses
        .filter((x) => x.expenseType === "labor" && x.payeeType === "employee" && x.payeeId && x.estimateId && x.isPaid && !x.deletedAt)
        .map((x) => ({ profileId: x.payeeId as string, estimateId: x.estimateId as string, amount: x.amount })),
    });
    return { rows, estimateById, people, reimbursements };
  }

  async function load(throughDate?: string): Promise<PayeeRow[]> {
    return (await gather(throughDate)).rows;
  }

  async function recordPayment(input: RecordPaymentInput): Promise<void> {
    if (!(input.amount > 0)) throw new Error("Amount must be more than 0.");
    const { rows, estimateById } = await gather();
    const row = rows.find((r) => r.key === input.payeeKey);
    if (!row) throw new Error("This person has nothing to pay.");

    if (row.kind === "employee") {
      // Pay is capped at wages owed; reimbursements are paid with their own button.
      const payOwed = Math.round((row.owed - row.lines.filter((l) => l.kind === "reimbursement").reduce((t, l) => t + l.owed, 0)) * 100) / 100;
      if (input.amount > payOwed + 0.001) throw new Error(`The most owed in pay is $${payOwed.toFixed(2)}.`);
      const jobId = input.estimateId || null;
      if (jobId) {
        const line = row.lines.find((l) => l.estimateId === jobId);
        if (!line) throw new Error("That job has nothing earned for this person.");
        if (input.amount > line.owed + 0.001) throw new Error(`The most owed on this job is $${line.owed.toFixed(2)}.`);
      }
      const emp = input.payeeKey.replace("employee:", "");
      const { error } = await supabase.from("payee_payments").insert({
        company_id: companyId,
        payee_kind: "employee",
        employee_id: emp,
        estimate_id: jobId,
        amount: input.amount,
        paid_on: input.paidOn,
        method: input.method,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        payment_kind: "pay",
        period_start: input.periodStart ?? null,
        period_end: input.periodEnd ?? null,
      });
      if (error) throw new Error(`Failed to record payment: ${error.message}`);
      return;
    }

    // Team member: pay one job. The payment becomes a labor expense on that job.
    const line = row.lines.find((l) => l.estimateId === (input.estimateId ?? null) && l.kind === "team");
    if (!line) throw new Error("Choose the job this payment is for.");
    if (input.amount > line.owed + 0.001) throw new Error(`The most owed on this job is $${line.owed.toFixed(2)}.`);
    const estimateId = input.estimateId as UUID;
    const job = estimateById.get(estimateId);
    const profileId = input.payeeKey.replace("team:", "");
    const expense = await services.expenseService.create({
      companyId,
      projectId: job?.projectId ?? null,
      estimateId,
      expenseType: "labor",
      amount: input.amount,
      expenseDate: input.paidOn,
      description: `Team payment · ${row.name}`,
      payeeType: "employee",
      payeeId: profileId as UUID,
      paidByType: "company",
      isPaid: true,
      paymentMethod: input.method,
    });
    const { error } = await supabase.from("payee_payments").insert({
      company_id: companyId,
      payee_kind: "team",
      profile_id: profileId,
      estimate_id: estimateId,
      expense_id: expense.id,
      amount: input.amount,
      paid_on: input.paidOn,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      payment_kind: "pay",
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
    });
    if (error) {
      // The expense was written first; without its payment it is a cost
      // nobody paid. Remove it, as the multi-job path does.
      await services.expenseService.softDelete(expense.id, "Payment not recorded");
      throw new Error(`Failed to record payment: ${error.message}`);
    }
  }

  async function recordReimbursement(input: { payeeKey: string; paidOn: string; method: string; reference?: string | null }): Promise<void> {
    const { rows, reimbursements, people } = await gather();
    const row = rows.find((r) => r.key === input.payeeKey);
    if (!row) throw new Error("This person has nothing to pay.");
    const profileId = input.payeeKey.startsWith("employee:")
      ? people.find((p) => p.id === input.payeeKey.replace("employee:", ""))?.profileId ?? null
      : input.payeeKey.replace("team:", "");
    if (!profileId) throw new Error("This person has no login, so reimbursements can't be paid to them yet.");
    const items = reimbursements.filter((r) => r.profileId === profileId);
    if (items.length === 0) throw new Error("No pending reimbursements for this person.");
    const amount = Math.round(items.reduce((s, r) => s + r.amount, 0) * 100) / 100;

    const { error } = await supabase.from("payee_payments").insert({
      company_id: companyId,
      payee_kind: "team",
      profile_id: profileId,
      employee_id: input.payeeKey.startsWith("employee:") ? input.payeeKey.replace("employee:", "") : null,
      amount,
      paid_on: input.paidOn,
      method: input.method,
      reference: input.reference ?? null,
      covers: items.map((r) => r.label).join(", "),
      allocations: [{ kind: "reimbursement", estimateId: null, amount, label: items.map((r) => r.label).join(", "), expenseIds: items.map((r) => r.expenseId as string) }],
      payment_kind: "reimbursement",
    });
    if (error) throw new Error(`Failed to record reimbursement: ${error.message}`);
    for (const item of items) await services.expenseService.markReimbursed(item.expenseId as UUID);
  }

  async function recordAdjustment(input: { payeeKey: string; amount: number; reason: string; paidOn: string }): Promise<void> {
    if (!input.amount || !Number.isFinite(input.amount)) throw new Error("Enter an amount to add or take away.");
    if (!input.reason.trim()) throw new Error("A reason is needed for an adjustment.");
    const amount = Math.round(input.amount * 100) / 100;
    const isEmployee = input.payeeKey.startsWith("employee:");
    const id = input.payeeKey.replace(/^(employee|team):/, "");
    let profileId: string | null = isEmployee ? null : id;
    let employeeId: string | null = isEmployee ? id : null;
    if (isEmployee) {
      const { people } = await gather();
      profileId = people.find((p) => p.id === id)?.profileId ?? null;
    }
    const { error } = await supabase.from("payee_payments").insert({
      company_id: companyId,
      payee_kind: isEmployee ? "employee" : "team",
      employee_id: employeeId,
      profile_id: profileId,
      amount,
      paid_on: input.paidOn,
      method: "Adjustment",
      notes: input.reason.trim(),
      payment_kind: "adjustment",
    });
    if (error) throw new Error(`Failed to record adjustment: ${error.message}`);
  }

  async function reversePayment(paymentId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error("A reason is needed to reverse a payment.");
    const { data, error: readError } = await supabase
      .from("payee_payments")
      .select("expense_id, reversed_at, allocations")
      .eq("id", paymentId)
      .maybeSingle();
    if (readError) throw new Error(`Failed to load payment: ${readError.message}`);
    if (!data) throw new Error("Payment not found.");
    if (data.reversed_at) throw new Error("This payment is already reversed.");
    const { error } = await supabase
      .from("payee_payments")
      .update({ reversed_at: new Date().toISOString(), reversal_reason: reason.trim() })
      .eq("id", paymentId);
    if (error) throw new Error(`Failed to reverse payment: ${error.message}`);
    if (data.expense_id) await services.expenseService.softDelete(data.expense_id, `Payment reversed: ${reason.trim()}`);
    // Every part of the check is undone: job costs are removed, and reimbursed expenses are owed again.
    const parts = ((data.allocations ?? []) as PaymentAllocation[]);
    for (const part of parts) {
      for (const expenseId of part.expenseIds) {
        if (part.kind === "reimbursement") {
          // Owed again, and the payment details it was paid with are cleared.
          try {
            await services.expenseService.unmarkReimbursed(expenseId as UUID);
          } catch (reopenError) {
            throw new Error(`Payment reversed, but an expense could not be reopened: ${reopenError instanceof Error ? reopenError.message : "unknown error"}`);
          }
        } else {
          await services.expenseService.softDelete(expenseId, `Payment reversed: ${reason.trim()}`);
        }
      }
    }
  }

  /** One check per person. With no amount (or the full balance) it covers every job, any money not
   * tied to a job, and any reimbursement. A smaller amount pays wages only, job by job in order:
   * part of a reimbursement can't be settled, since it marks whole expenses as paid back. */
  async function recordFullPayment(input: {
    payeeKey: string;
    paidOn: string;
    method: string;
    reference?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    amount?: number | null;
  }): Promise<void> {
    const { rows, reimbursements, people, estimateById } = await gather();
    const row = rows.find((r) => r.key === input.payeeKey);
    if (!row) throw new Error("This person has nothing to pay.");
    const isEmployee = row.kind === "employee";
    const profileId = isEmployee
      ? people.find((p) => p.id === input.payeeKey.replace("employee:", ""))?.profileId ?? null
      : input.payeeKey.replace("team:", "");
    const reimbursementItems = profileId ? reimbursements.filter((r) => r.profileId === profileId) : [];
    const reimbursementTotal = cents(reimbursementItems.reduce((s, r) => s + r.amount, 0));

    const jobLines = row.lines
      .filter((l) => l.kind !== "reimbursement" && l.owed > 0 && l.estimateId)
      .sort((a, b) => a.label.localeCompare(b.label));
    const jobTotal = cents(jobLines.reduce((s, l) => s + l.owed, 0));
    const wagesOwed = cents(row.owed - row.lines.filter((l) => l.kind === "reimbursement").reduce((s, l) => s + l.owed, 0));
    const unassigned = isEmployee ? cents(wagesOwed - jobTotal) : 0;

    // What the full balance is made of, before any money moves.
    const wageParts: PaymentAllocation[] = jobLines.map((line) => ({ kind: "job", estimateId: line.estimateId, amount: line.owed, label: line.label, expenseIds: [] }));
    if (unassigned > 0.005) wageParts.push({ kind: "unassigned", estimateId: null, amount: unassigned, label: "Not tied to a job", expenseIds: [] });
    const wagesTotal = cents(wageParts.reduce((s, a) => s + a.amount, 0));
    const fullTotal = cents(wagesTotal + reimbursementTotal);

    let parts: PaymentAllocation[];
    let includeReimbursement: boolean;
    if (input.amount === undefined || input.amount === null || Math.abs(input.amount - fullTotal) < 0.005) {
      parts = wageParts;
      includeReimbursement = reimbursementTotal > 0.005;
    } else {
      const amount = cents(input.amount);
      if (!(amount > 0)) throw new Error("Enter an amount more than $0.00.");
      if (amount > wagesTotal + 0.005) {
        throw new Error(
          reimbursementTotal > 0
            ? `${row.name}: pay the full $${fullTotal.toFixed(2)} to include the reimbursement, or $${wagesTotal.toFixed(2)} or less for pay only.`
            : `${row.name}: the most owed is $${wagesTotal.toFixed(2)}.`
        );
      }
      parts = [];
      let left = amount;
      for (const part of wageParts) {
        if (left <= 0.005) break;
        const take = cents(Math.min(left, part.amount));
        parts.push({ ...part, amount: take });
        left = cents(left - take);
      }
      includeReimbursement = false;
    }

    const allocations: PaymentAllocation[] = [];
    const createdExpenseIds: string[] = [];
    try {
      for (const part of parts) {
        let expenseIds: string[] = [];
        if (!isEmployee && part.kind === "job" && part.estimateId) {
          // A team member's job pay is a labor cost on that job, so it gets its own expense.
          const job = estimateById.get(part.estimateId);
          const expense = await services.expenseService.create({
            companyId,
            projectId: job?.projectId ?? null,
            estimateId: part.estimateId as UUID,
            expenseType: "labor",
            amount: part.amount,
            expenseDate: input.paidOn,
            description: `Team payment · ${row.name}`,
            payeeType: "employee",
            payeeId: profileId as UUID,
            paidByType: "company",
            isPaid: true,
            paymentMethod: input.method,
          });
          expenseIds = [expense.id];
          createdExpenseIds.push(expense.id);
        }
        allocations.push({ ...part, expenseIds });
      }
      if (includeReimbursement) {
        allocations.push({
          kind: "reimbursement",
          estimateId: null,
          amount: reimbursementTotal,
          label: `Reimbursement · ${reimbursementItems.length} expense${reimbursementItems.length === 1 ? "" : "s"}`,
          expenseIds: reimbursementItems.map((r) => r.expenseId as string),
        });
      }
    } catch (err) {
      for (const id of createdExpenseIds) await services.expenseService.softDelete(id as UUID, "Payment not recorded");
      throw err;
    }

    const total = cents(allocations.reduce((s, a) => s + a.amount, 0));
    if (total <= 0) throw new Error(`${row.name}: nothing is owed to pay.`);

    const { error } = await supabase.from("payee_payments").insert({
      company_id: companyId,
      payee_kind: row.kind,
      employee_id: isEmployee ? input.payeeKey.replace("employee:", "") : null,
      profile_id: profileId,
      estimate_id: null,
      expense_id: null,
      amount: total,
      paid_on: input.paidOn,
      method: input.method,
      reference: input.reference ?? null,
      payment_kind: "pay",
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      allocations,
    });
    if (error) {
      for (const id of createdExpenseIds) await services.expenseService.softDelete(id as UUID, "Payment not recorded");
      throw new Error(`Failed to record payment: ${error.message}`);
    }
    // The reimbursed expenses are marked paid only after the check is saved.
    if (includeReimbursement) for (const item of reimbursementItems) await services.expenseService.markReimbursed(item.expenseId as UUID);
  }

  return { load, recordPayment, recordReimbursement, recordFullPayment, recordAdjustment, reversePayment };
}

/** Employee wage payments, for company-wide profit and the year-end package.
 * Live (not reversed) `pay` payments to employees; a reimbursement part of a
 * full payment is left out — that expense is already counted where it was
 * spent. */
export function createSupabaseEmployeeWageReader(supabase: SupabaseClient): ListEmployeeWages {
  return async (companyId: string): Promise<EmployeeWagePayment[]> => {
    const [payRes, peopleRes] = await Promise.all([
      supabase
        .from("payee_payments")
        .select("employee_id, amount, paid_on, estimate_id, allocations")
        .eq("company_id", companyId)
        .eq("payee_kind", "employee")
        .eq("payment_kind", "pay")
        .is("reversed_at", null),
      supabase.from("employees").select("id, name").eq("company_id", companyId),
    ]);
    if (payRes.error) throw new Error(`Failed to load wage payments: ${payRes.error.message}`);
    const names = new Map(((peopleRes.data ?? []) as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]));
    type Row = { employee_id: string | null; amount: number | string; paid_on: string; estimate_id: string | null; allocations: PaymentAllocation[] | null };
    return ((payRes.data ?? []) as Row[])
      .filter((r) => r.employee_id)
      .map((r) => {
        const reimbursed = (r.allocations ?? []).filter((a) => a.kind === "reimbursement").reduce((t, a) => t + Number(a.amount), 0);
        return {
          employeeId: r.employee_id as string,
          employeeName: names.get(r.employee_id as string) ?? "Employee",
          amount: Math.round((Number(r.amount) - reimbursed) * 100) / 100,
          paidOn: r.paid_on,
          estimateId: r.estimate_id,
        };
      })
      .filter((w) => w.amount > 0.005);
  };
}

