/**
 * Layer 2 — the agent-side mirror of SubcontractorService: roster
 * (`agents`), per-project assignments (`estimate_agents`), and
 * payments (`agent_payments`), which already distinguishes commission
 * vs reimbursement via payment_type — this is why the earlier schema
 * review rejected creating a separate "agent_transactions" table; that
 * would have forked data this table already models correctly.
 */
import type { UUID, AuditedEntity, QueryScope } from "./types";

export interface Agent extends AuditedEntity {
  name: string;
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
  // TransactionService.getReimbursementBalance(expenseId) net this
  // payment's ledger row ("agent_reimbursement_paid") against the
  // liability ExpenseService booked ("agent_reimbursement_owed") when
  // the expense was first recorded — without it, "owed" and "paid"
  // would be two ledger rows with no way to connect them.
  reimbursesExpenseId: UUID | null;
}

export interface AgentCommissionService {
  getRoster(companyId: UUID): Promise<Agent[]>;

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
   * reimbursesExpenseId, not this payment's own id — see AgentPayment's
   * doc comment) for paymentType: "reimbursement". ValidationService
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
  }): Promise<AgentPayment>;

  /** Same gap SubcontractorService.softDelete closes — see its doc
   * comment. Deleting a "reimbursement" payment un-excludes the
   * expense's liability from TransactionService.getReimbursementBalance
   * (it goes back to "outstanding"), same as deleting a customer
   * payment restores an invoice's remaining balance. */
  softDelete(paymentId: UUID, reason: string): Promise<void>;
  restore(paymentId: UUID): Promise<void>;

  /** Same delegation pattern as SubcontractorService.getBalance —
   * arithmetic lives in TransactionService, this service only knows
   * the domain shape. */
  getBalance(assignmentId: UUID): Promise<{ assigned: number; paid: number; outstanding: number }>;

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
