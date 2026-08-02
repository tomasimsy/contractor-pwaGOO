/**
 * Layer 2 — owns the subcontractor roster (`subcontractors`), their
 * per-project assignments (`estimate_subcontractors` — an assignment
 * to a PROJECT despite the table's old name), and payments against
 * those assignments (`subcontractor_payments`). Per the earlier schema
 * review, this is NOT a new "subcontractor_assignments" table —
 * intentionally reusing/repointing the existing one rather than
 * forking a duplicate. All three tables already exist live (legacy
 * contractor-pwa schema), already company-scoped by RLS, and already
 * wired into the generic audit + soft-delete triggers — no schema
 * changes were needed to make this service real.
 */
import type { UUID, AuditedEntity, QueryScope } from "./types";

export interface Subcontractor extends AuditedEntity {
  name: string;
  trade: string | null;
  phone: string | null;
  contactPerson: string | null;
  isActive: boolean;
}

export interface SubcontractorAssignment extends AuditedEntity {
  projectId: UUID;
  subcontractorId: UUID;
  contractedAmount: number;
  notes: string | null;
  isFinal: boolean; // once true, ValidationService blocks further amount edits
}

export interface SubcontractorPayment extends AuditedEntity {
  assignmentId: UUID;
  amount: number;
  paymentMethod: string | null;
  paymentDate: string;
  paymentType: "payment" | "reimbursement";
  reimbursementFromAgentId: UUID | null;
  /** Optional link to the change order that authorized this payment —
   * mirrors change_orders' existing linkage on estimate_expenses/
   * agent_payments (see 20260718000000_change_order_expense_linking.sql). */
  changeOrderId: UUID | null;
}

export interface SubcontractorService {
  getRoster(companyId: UUID, includeInactive?: boolean): Promise<Subcontractor[]>;

  /** Adds a subcontractor to the company's roster. Not an assignment —
   * see assignToProject for putting a roster subcontractor onto a
   * project. */
  createSubcontractor(input: {
    companyId: UUID;
    name: string;
    trade?: string | null;
    phone?: string | null;
    contactPerson?: string | null;
    isActive?: boolean;
  }): Promise<Subcontractor>;

  updateSubcontractor(
    subcontractorId: UUID,
    changes: Partial<{ name: string; trade: string | null; phone: string | null; contactPerson: string | null; isActive: boolean }>
  ): Promise<Subcontractor>;

  /** Removing a subcontractor from the roster — distinct from
   * softDelete/restore below, which operate on PAYMENT rows. Does not
   * touch existing assignments/payments; a subcontractor removed from
   * the roster keeps their historical assignments and cost history
   * intact, they just can't be assigned to new work going forward
   * (enforced at the UI level via isActive/roster visibility, not by
   * this delete). */
  softDeleteSubcontractor(subcontractorId: UUID, reason: string): Promise<void>;
  restoreSubcontractor(subcontractorId: UUID): Promise<void>;

  /** Assignments in scope — scope.projectId narrows to one project
   * (FinancialEngine.getProjectFinancials); scope.projectId omitted
   * scans the whole company (FinancialEngine.getCompanyFinancials /
   * getPayablesSummary's lifetime outstanding totals). Subcontractor
   * name is already joined in so FinancialEngine never cross-references
   * the roster itself just to label a payables line. */
  listAssignments(scope: QueryScope): Promise<Array<SubcontractorAssignment & { subcontractorName: string; trade: string | null }>>;

  assignToProject(input: {
    companyId: UUID;
    projectId: UUID;
    subcontractorId: UUID;
    contractedAmount: number;
    notes?: string;
  }): Promise<SubcontractorAssignment>;

  /** Goes through ValidationService.validateAssignmentAmount — blocks
   * edits once isFinal is set, the rule that doesn't exist today
   * (contracted amount is freely editable indefinitely in
   * contractor-pwa, even after payments have been made against it). */
  updateAssignmentAmount(assignmentId: UUID, amount: number): Promise<SubcontractorAssignment>;
  markAssignmentFinal(assignmentId: UUID): Promise<SubcontractorAssignment>;

  /** Appends "subcontractor_payment" to the ledger, referencing this
   * payment row — a cost, booked when cash actually goes out (unlike
   * agent commissions, subcontractor work has no separate "owed"
   * liability stage in this model; the assignment's contracted amount
   * already represents the committed cost — see getBalance). */
  recordPayment(input: {
    companyId: UUID;
    assignmentId: UUID;
    amount: number;
    paymentMethod?: string;
    paymentDate: string;
    paymentType?: "payment" | "reimbursement";
    reimbursementFromAgentId?: UUID | null;
    changeOrderId?: UUID | null;
  }): Promise<SubcontractorPayment>;

  /** Company-wide active payments — the real, persisted source
   * FinancialEngine.getCompanyFinancials/getTaxSummary use for
   * cash-basis subcontractor cost (added 2026-08-01 alongside
   * PaymentService.listForCompany, replacing the in-memory
   * transactionService ledger — see DASHBOARD_AUDIT_REPORT.md).
   * `scope.projectId` is NOT applied at the query level (payments have
   * no project_id column of their own — only their assignment does);
   * FinancialEngine joins through `listAssignments` itself when a
   * project subset is needed, the same way it already resolves other
   * project-scoped filters. */
  listPayments(scope: QueryScope): Promise<SubcontractorPayment[]>;

  /** `reason` validated the same way as every other financial record's
   * softDelete (see ValidationService.validateDeleteReason). Excludes
   * the payment from getBalance the same way every other soft-deleted
   * financial record is excluded from active calculations. */
  softDelete(paymentId: UUID, reason: string): Promise<void>;
  restore(paymentId: UUID): Promise<void>;

  /** Assigned-vs-paid balance for one assignment, computed DIRECTLY
   * from `estimate_subcontractors.contracted_amount` and the live sum
   * of that assignment's non-deleted `subcontractor_payments` — not
   * from a ledger. FinancialEngine calls this (not
   * TransactionService.getAssignmentBalance) for exactly this reason:
   * a real subcontractor's committed cost must be correct and
   * persistent, not reset every time the in-memory transaction ledger
   * (which has no backing table) starts empty on a fresh session. Uses
   * the SAME calculateCommittedCostBalance formula
   * (financialCalculations.ts) TransactionService's version already
   * used — only where the assigned/paid inputs come from changes. */
  getBalance(assignmentId: UUID): Promise<{ assigned: number; paid: number; committed: number; outstanding: number }>;

  /** 1099 threshold check — sums this subcontractor's non-deleted
   * payments (across every assignment) dated within the given tax
   * year. */
  getTotalPaidForYear(subcontractorId: UUID, taxYear: number): Promise<number>;
}
