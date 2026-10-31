import type { SubcontractorService } from "./subcontractorService";
import type { AgentCommissionService } from "./agentCommissionService";
import type { ExpenseCreateInput, ExpenseService } from "./expenseService";
import type { FinancialEngine } from "./financialEngine";
import type { UUID } from "./types";

/**
 * Subcontractors and agents on Payroll.
 *
 * ONE PAYMENT = ONE EXPENSE RECORD, the same rule the estimate, project and
 * profit figures follow: what is owed comes from FinancialEngine.getPayablesSummary
 * (assigned on the estimate, less expense rows paid to that payee on that job),
 * and paying writes an expense row typed `subcontractor` or `agent_commission`.
 * The legacy subcontractor_payments / agent_payments tables are not read here.
 */

export interface SubJobLine {
  assignmentId: UUID;
  estimateId: UUID | null;
  projectId: UUID;
  label: string;
  contracted: number;
  paid: number;
  outstanding: number;
}

/** One payment: an expense row paid to this payee, or an expense they paid
 * for that was paid back to them (a reimbursement). */
export interface ContractPayment {
  /** The expense id; for a reimbursement, "reimb:<expense id>". */
  id: UUID;
  kind: "job" | "reimbursement";
  /** Which payment this part belongs to. A Payroll payment that covers several jobs
   * writes one row per job, all carrying the same check id. Older rows have none, so
   * parts with the same date and method, each saved within two minutes of the last,
   * count as one payment. */
  checkKey: string;
  estimateId: UUID | null;
  projectId: UUID | null;
  /** The job it was for, as Payroll labels jobs. */
  label: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string | null;
  /** When it was recorded, to order payments made on the same day. */
  savedAt: string;
}

/** A subcontractor or an agent: paid per job, against the amount assigned on the estimate. */
export interface SubRow {
  /** "sub:<id>" or "agent:<id>", the key Payroll and the estimate links use. */
  key: string;
  payeeType: "subcontractor" | "agent";
  /** The subcontractor id or the agent id. */
  payeeId: UUID;
  name: string;
  trade: string | null;
  lines: SubJobLine[];
  /** Expenses this payee paid for, not yet paid back. Included in `owed`. */
  reimbursements: Array<{ expenseId: UUID; estimateId: UUID | null; projectId: UUID | null; label: string; amount: number }>;
  owed: number;
  paid: number;
  payments: ContractPayment[];
}

/** Marks an expense row as part of one Payroll payment: `payroll-check:<id>` in its notes. */
const CHECK_NOTE = "payroll-check:";

type LabelFor = (estimateId: UUID | null, projectId: UUID | null) => string;

const cents = (n: number) => Math.round(n * 100) / 100;

export async function loadContractRows(
  services: {
    financialEngine: FinancialEngine;
    subcontractorService: SubcontractorService;
    agentCommissionService: AgentCommissionService;
    expenseService: ExpenseService;
  },
  companyId: UUID,
  labelFor: LabelFor
): Promise<SubRow[]> {
  const [payables, subAssignments, agentAssignments, expenses, subRoster, agentRoster] = await Promise.all([
    services.financialEngine.getPayablesSummary({ companyId }),
    services.subcontractorService.listAssignments({ companyId }),
    services.agentCommissionService.listAssignments({ companyId }),
    services.expenseService.listForCompany(companyId),
    services.subcontractorService.getRoster(companyId, true),
    services.agentCommissionService.getRoster(companyId),
  ]);
  const job = new Map<string, { estimateId: UUID | null; projectId: UUID; trade: string | null }>();
  for (const a of subAssignments) job.set(a.id, { estimateId: a.estimateId, projectId: a.projectId, trade: a.trade });
  for (const a of agentAssignments) job.set(a.id, { estimateId: a.estimateId, projectId: a.projectId, trade: null });

  const rows = new Map<string, SubRow>();
  const rowFor = (payeeType: SubRow["payeeType"], payeeId: UUID, name: string) => {
    const key = `${payeeType === "agent" ? "agent" : "sub"}:${payeeId}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, payeeType, payeeId, name, trade: null, lines: [], reimbursements: [], owed: 0, paid: 0, payments: [] };
      rows.set(key, row);
    }
    return row;
  };

  for (const line of payables.lines) {
    if (line.role !== "subcontractor" && line.role !== "agent") continue;
    const info = job.get(line.assignmentId);
    if (!info) continue;
    const row = rowFor(line.role, line.payeeId, line.payeeName);
    row.trade = row.trade ?? info.trade;
    const outstanding = Math.max(0, line.outstanding);
    row.lines.push({
      assignmentId: line.assignmentId,
      estimateId: info.estimateId,
      projectId: info.projectId,
      label: labelFor(info.estimateId, info.projectId),
      contracted: line.assigned,
      paid: line.paid,
      outstanding,
    });
    row.owed += outstanding;
    row.paid += line.paid;
  }

  const untagged: Array<{ row: SubRow; payment: ContractPayment; savedAt: number }> = [];
  for (const e of expenses) {
    const payeeType =
      e.payeeType === "subcontractor" && e.expenseType === "subcontractor" ? "subcontractor"
      : e.payeeType === "agent" && e.expenseType === "agent_commission" ? "agent"
      : null;
    if (!payeeType || !e.payeeId || !e.isPaid) continue;
    const checkId = e.notes?.startsWith(CHECK_NOTE) ? e.notes.slice(CHECK_NOTE.length) : null;
    const payment: ContractPayment = {
      id: e.id,
      kind: "job",
      checkKey: checkId ? `check:${checkId}` : "",
      estimateId: e.estimateId,
      projectId: e.projectId,
      label: labelFor(e.estimateId, e.projectId),
      amount: e.amount,
      paymentDate: e.expenseDate,
      paymentMethod: e.paymentMethod,
      savedAt: e.createdAt,
    };
    const row = rowFor(payeeType, e.payeeId, e.vendor ?? (payeeType === "agent" ? "Agent" : "Subcontractor"));
    row.payments.push(payment);
    if (!checkId) untagged.push({ row, payment, savedAt: Date.parse(e.createdAt) });
  }

  // Older parts: a new payment starts when the date or method changes, or when more than
  // two minutes passed since the payee's previous part was saved.
  untagged.sort((a, b) => a.savedAt - b.savedAt);
  const last = new Map<SubRow, { key: string; date: string; method: string; savedAt: number }>();
  for (const u of untagged) {
    const prev = last.get(u.row);
    const method = u.payment.paymentMethod ?? "";
    const same = prev && prev.date === u.payment.paymentDate && prev.method === method && u.savedAt - prev.savedAt <= 120_000;
    const key = same ? prev.key : `saved:${u.payment.id}`;
    u.payment.checkKey = key;
    last.set(u.row, { key, date: u.payment.paymentDate, method, savedAt: u.savedAt });
  }

  // Reimbursements: expenses a sub or agent paid for. Owed until paid back,
  // then listed as a payment (paid back in Payroll, with its date and check).
  const names = new Map<string, string>([
    ...subRoster.map((x) => [`subcontractor:${x.id}`, x.name] as const),
    ...agentRoster.map((x) => [`agent:${x.id}`, x.name] as const),
  ]);
  for (const e of expenses) {
    const payeeType = e.paidByType === "agent" ? "agent" : e.paidByType === "subcontractor" ? "subcontractor" : null;
    const payeeId = payeeType === "agent" ? e.paidById ?? e.paidByAgentId : e.paidById;
    if (!payeeType || !payeeId || !e.reimbursable || e.deletedAt) continue;
    const row = rowFor(payeeType, payeeId, names.get(`${payeeType}:${payeeId}`) ?? (payeeType === "agent" ? "Agent" : "Subcontractor"));
    const what = e.description || e.vendor || "Expense";
    const label = `Reimbursement · ${what} · ${labelFor(e.estimateId, e.projectId)}`;
    if (e.reimbursementStatus === "pending") {
      row.reimbursements.push({ expenseId: e.id, estimateId: e.estimateId, projectId: e.projectId, label, amount: cents(e.amount) });
      row.owed += e.amount;
    } else if (e.reimbursementStatus === "reimbursed") {
      row.payments.push({
        id: `reimb:${e.id}`,
        kind: "reimbursement",
        // Paid with a commission check: the same check id groups them as one payment.
        checkKey: e.reimbursedCheck ? `check:${e.reimbursedCheck}` : `reimb:${e.id}`,
        estimateId: e.estimateId,
        projectId: e.projectId,
        label,
        amount: cents(e.amount),
        paymentDate: e.reimbursedOn ?? e.updatedAt.slice(0, 10),
        paymentMethod: e.reimbursedMethod ?? null,
        savedAt: e.updatedAt,
      });
    }
  }

  for (const row of rows.values()) {
    row.owed = cents(row.owed);
    row.paid = cents(row.paid);
    row.payments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }
  return [...rows.values()].sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
}

/** The expense row that pays one job: the same record the estimate's Pay button used to write. */
export function contractPaymentExpense(
  row: SubRow,
  line: SubJobLine,
  input: { companyId: UUID; amount: number; paidOn: string; paymentMethod: string; checkId: string }
): ExpenseCreateInput {
  const agent = row.payeeType === "agent";
  return {
    companyId: input.companyId,
    projectId: line.projectId,
    estimateId: line.estimateId,
    expenseType: agent ? "agent_commission" : "subcontractor",
    amount: input.amount,
    expenseDate: input.paidOn,
    description: agent ? "Agent commission" : "Subcontractor payment",
    vendor: row.name,
    payeeType: agent ? "agent" : "subcontractor",
    payeeId: row.payeeId,
    paidByType: "company",
    paymentMethod: input.paymentMethod,
    notes: `${CHECK_NOTE}${input.checkId}`,
    isPaid: true,
    reimbursable: false,
  };
}
