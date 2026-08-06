/**
 * Layer 2 — owns `estimate_team_members`: which company users are
 * assigned to an estimate, and the labor amount committed to each.
 *
 * ============================================================
 * WHAT THIS DOES NOT OWN
 * ============================================================
 * It owns ASSIGNMENTS. It does not own money.
 *
 * A team member's personally-paid expenses, what they have been
 * reimbursed, and what they are still owed all come from
 * `estimate_expenses` rows where `paid_by = 'employee'` and
 * `paid_by_id` is that member — the exact rows ExpenseService already
 * returns and calculateExpenseTotals already breaks down. This service
 * deliberately stores none of those figures, because a second copy of a
 * number the expense rows already answer is the duplication this
 * codebase's whole service layer exists to prevent.
 *
 * Consequently NOTHING in FinancialEngine reads this service, and
 * adding an assignment moves no total anywhere in the app. An assigned
 * labor amount is a commitment (like `estimate_agents.amount`), not a
 * cost. Cost appears only when a real expense row is written.
 *
 * ============================================================
 * FUTURE: LABOR PAYMENTS
 * ============================================================
 * Paying a team member is ONE EXPENSE RECORD, exactly like paying a
 * subcontractor: an `estimate_expenses` row typed `labor`, tagged with
 * the payee. No schema change and no new method here — which is the
 * point of keeping balances out of this table.
 */
import type { UUID, AuditedEntity, QueryScope } from "./types";

export interface TeamAssignment extends AuditedEntity {
  estimateId: UUID;
  projectId: UUID | null;
  /** profiles.id — which IS the auth user id, and IS what
   * `estimate_expenses.paid_by_id` holds for an employee-paid cost.
   * Same key on both sides, so no mapping is needed to connect an
   * assignment to what that person is owed. */
  userId: UUID;
  /** Assigned labor. A commitment, not a cost. */
  amount: number;
  notes: string | null;
}

/** An assignment plus the display name of the member, resolved from
 * `list_company_members` so a list never renders a bare uuid — same
 * reason AgentCommissionService.listAssignments returns `agentName`. */
export type TeamAssignmentWithName = TeamAssignment & {
  memberName: string;
};

export interface TeamAssignmentService {
  /** Active assignments for one estimate, newest first. */
  listForEstimate(estimateId: UUID): Promise<TeamAssignmentWithName[]>;

  /** Active assignments across a scope — for future cross-project views.
   * Present now so callers never reach past this service to the table. */
  listAssignments(scope: QueryScope): Promise<TeamAssignmentWithName[]>;

  assign(input: {
    companyId: UUID;
    estimateId: UUID;
    projectId: UUID | null;
    userId: UUID;
    amount: number;
    notes?: string | null;
  }): Promise<TeamAssignment>;

  update(
    assignmentId: UUID,
    changes: Partial<{ amount: number; notes: string | null }>
  ): Promise<TeamAssignment>;

  /** Soft delete with a required reason — the same discipline every
   * other record in this app follows. */
  softDelete(assignmentId: UUID, reason: string): Promise<void>;
  restore(assignmentId: UUID): Promise<void>;
}
