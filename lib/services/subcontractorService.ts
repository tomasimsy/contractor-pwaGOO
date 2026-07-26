/**
 * Layer 2 — owns the subcontractor roster (`subcontractors`), their
 * per-project assignments (`estimate_subcontractors` — an assignment
 * to a PROJECT despite the table's old name), and payments against
 * those assignments (`subcontractor_payments`). Per the earlier schema
 * review, this is NOT a new "subcontractor_assignments" table —
 * intentionally reusing/repointing the existing one rather than
 * forking a duplicate.
 */
import type { UUID, AuditedEntity, QueryScope } from "./types";

export interface Subcontractor extends AuditedEntity {
  name: string;
  trade: string | null;
  phone: string | null;
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
}

export interface SubcontractorService {
  getRoster(companyId: UUID): Promise<Subcontractor[]>;

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
   * already represents the committed cost — see TransactionService.
   * getAssignmentBalance). */
  recordPayment(input: {
    companyId: UUID;
    assignmentId: UUID;
    amount: number;
    paymentMethod?: string;
    paymentDate: string;
    paymentType?: "payment" | "reimbursement";
    reimbursementFromAgentId?: UUID | null;
  }): Promise<SubcontractorPayment>;

  /** `reason` validated the same way as every other financial record's
   * softDelete (see ValidationService.validateDeleteReason). Found
   * missing entirely during the end-to-end financial audit ("Delete
   * subcontractor payments" couldn't be exercised because no such
   * method existed) — excludes the payment from
   * TransactionService.getAssignmentBalance the same way every other
   * soft-deleted financial record is excluded from active calculations. */
  softDelete(paymentId: UUID, reason: string): Promise<void>;
  restore(paymentId: UUID): Promise<void>;

  /** Delegates the actual assigned/paid/committed/outstanding math to
   * TransactionService.getAssignmentBalance — this service never
   * re-derives that arithmetic itself. */
  getBalance(assignmentId: UUID): Promise<{ assigned: number; paid: number; outstanding: number }>;

  /** 1099 threshold check, delegating amount data to
   * TransactionService and tax-year config to TaxService — this
   * service only knows "who got paid how much," not tax rules. */
  getTotalPaidForYear(subcontractorId: UUID, taxYear: number): Promise<number>;
}
