/**
 * Layer 2 — the agent-side mirror of SubcontractorService: roster
 * (`agents`), per-project assignments (`estimate_agents`), and
 * payments (`agent_payments`), which already distinguishes commission
 * vs reimbursement via payment_type — this is why the earlier schema
 * review rejected creating a separate "agent_transactions" table; that
 * would have forked data this table already models correctly. All
 * three tables already exist live, already company-scoped by RLS,
 * already wired into the generic audit + soft-delete triggers.
 */
import type { UUID, AuditedEntity, QueryScope } from "./types";

export interface Agent extends AuditedEntity {
  name: string;
  /** Percent (e.g. 10 = 10%) — supports percentage commissions.
   * Fixed-amount commissions are supported by simply not relying on
   * this rate: recordPayment's `amount` is always caller-supplied
   * directly, so a fixed commission is just a payment whose amount was
   * computed by the caller (UI) instead of derived from this rate. */
  commissionRate: number | null;
}

export interface AgentAssignment extends AuditedEntity {
  projectId: UUID;
  agentId: UUID;
  assignedAmount: number;
  notes: string | null;
}

export interface AgentPayment extends AuditedEntity {
  assignmentId: UUID | null; // nullable: ad hoc commission payments with no assignment are allowed, matching contractor-pwa
  agentId: UUID;
  amount: number;
  paymentType: "commission" | "reimbursement";
  paymentDate: string;
  reimbursementFromAgentId: UUID | null; // one agent can be responsible for reimbursing another's commission/expense
  // Which expense this reimbursement pays back — required when
  // paymentType is "reimbursement", null otherwise. This is what lets
  // ExpenseService.markReimbursed(expenseId) be called right after
  // this payment is recorded, keeping "is this still owed?" answered
  // in exactly one place (the expense row), not a second ledger-side
  // balance that could disagree with it.
  reimbursesExpenseId: UUID | null;
  /** Optional link to the change order that authorized this payment —
   * mirrors change_orders' existing linkage on estimate_expenses/
   * subcontractor_payments. */
  changeOrderId: UUID | null;
}

export interface AgentCommissionService {
  getRoster(companyId: UUID): Promise<Agent[]>;

  /** Adds an agent to the company's roster. Not an assignment — see
   * assignToProject for putting a roster agent onto a project. */
  createAgent(input: { companyId: UUID; name: string; commissionRate?: number | null }): Promise<Agent>;

  updateAgent(agentId: UUID, changes: Partial<{ name: string; commissionRate: number | null }>): Promise<Agent>;

  /** Removing an agent from the roster — distinct from softDelete/
   * restore below, which operate on PAYMENT rows. Existing
   * assignments/payments are untouched, same as
   * SubcontractorService.softDeleteSubcontractor. */
  softDeleteAgent(agentId: UUID, reason: string): Promise<void>;
  restoreAgent(agentId: UUID): Promise<void>;

  /** The agent-side mirror of SubcontractorService.listAssignments —
   * same scope semantics (scope.projectId narrows to one project;
   * omitted scans the whole company). */
  listAssignments(scope: QueryScope): Promise<Array<AgentAssignment & { agentName: string }>>;

  assignToProject(input: {
    companyId: UUID;
    projectId: UUID;
    agentId: UUID;
    assignedAmount: number;
    notes?: string;
  }): Promise<AgentAssignment>;

  /** Appends "agent_commission" to the ledger for paymentType:
   * "commission", or "agent_reimbursement_paid" (referencing
   * reimbursesExpenseId, not this payment's own id) for paymentType:
   * "reimbursement" — same ledger bookkeeping the in-memory double
   * already did, kept for company-level cash-basis reporting
   * (getCompanyFinancials/getTaxSummary) consistency. A reimbursement
   * payment ALSO calls ExpenseService.markReimbursed(reimbursesExpenseId)
   * so the expense itself (the one place the rest of the app asks "is
   * this still owed?") reflects settlement immediately. ValidationService
   * requires reimbursesExpenseId whenever paymentType is "reimbursement". */
  recordPayment(input: {
    companyId: UUID;
    agentId: UUID;
    assignmentId?: UUID | null;
    amount: number;
    paymentType: "commission" | "reimbursement";
    paymentDate: string;
    reimbursementFromAgentId?: UUID | null;
    reimbursesExpenseId?: UUID | null;
    changeOrderId?: UUID | null;
  }): Promise<AgentPayment>;

  /** Same gap SubcontractorService.softDelete closes — see its doc
   * comment. Deleting a "reimbursement" payment does not un-mark the
   * expense as reimbursed automatically (matches the in-memory
   * double's documented behavior: settlement is a one-way event here,
   * same as a customer payment doesn't auto-revert an invoice's
   * lifecycle status on delete). */
  softDelete(paymentId: UUID, reason: string): Promise<void>;
  restore(paymentId: UUID): Promise<void>;

  /** Company-wide active payments (commission + reimbursement) — the
   * real, persisted source FinancialEngine.getCompanyFinancials/
   * getTaxSummary use for cash-basis agent cost (added 2026-08-01
   * alongside PaymentService.listForCompany/SubcontractorService.
   * listPayments, replacing the in-memory transactionService ledger —
   * see DASHBOARD_AUDIT_REPORT.md). `scope.projectId` is NOT applied
   * at the query level — a reimbursement payment may key off
   * `reimbursesExpenseId` instead of `assignmentId`, so FinancialEngine
   * joins through `listAssignments`/expenses itself when a project
   * subset is needed. */
  listPayments(scope: QueryScope): Promise<AgentPayment[]>;

  /** Assigned-vs-paid balance for one assignment, computed DIRECTLY
   * from `estimate_agents.assigned_amount` and the live sum of that
   * assignment's non-deleted, COMMISSION-type `agent_payments` (a
   * reimbursement payment settles a different liability — the
   * expense's own reimbursementStatus — and must never count toward an
   * assignment's committed/outstanding commission balance). Same
   * calculateCommittedCostBalance formula as SubcontractorService.getBalance. */
  getBalance(assignmentId: UUID): Promise<{ assigned: number; paid: number; committed: number; outstanding: number }>;

  /** Commissions + reimbursements broken out separately (contractor-pwa's
   * calculateAgentFinancials shape), plus YTD — the one place this
   * commission/reimbursement split is computed. */
  getCompensationSummary(agentId: UUID, taxYear: number): Promise<{
    totalCommissions: number;
    totalReimbursements: number;
    totalPaid: number;
    outstandingPayable: number;
    ytdEarnings: number;
  }>;
}
