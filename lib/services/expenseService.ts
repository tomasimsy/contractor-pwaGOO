/**
 * Layer 2 — owns `estimate_expenses` (materials/labor/other project
 * costs) and `mileage_trips`. Renamed conceptually to "project
 * expenses" per the earlier schema review — the table itself keeps its
 * existing name during migration, but this service is where the
 * eventual rename's boundary lives, so calling code never has to know
 * the underlying table name changed.
 */
import type { UUID, AuditedEntity, QueryScope } from "./types";

export type ExpenseCategory = "material" | "labor" | "other";

export interface Expense extends AuditedEntity {
  projectId: UUID;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  expenseDate: string;
  vendor: string | null;
  paymentMethod: string | null;
  paidByAgentId: UUID | null; // creates an agent reimbursement — see AgentCommissionService
  changeOrderId: UUID | null;
  receiptUrl: string | null;
}

export interface MileageTrip {
  id: UUID;
  projectId: UUID | null;
  distanceMiles: number;
  reimbursement: number;
}

export interface ExpenseService {
  listForProject(projectId: UUID): Promise<Expense[]>;

  /** Always appends one cost row to the ledger — "material_expense" /
   * "labor_expense" / "other_expense" depending on `category`. If
   * `paidByAgentId` is set, ALSO appends "agent_reimbursement_owed"
   * (the liability booked the instant the company becomes obligated to
   * pay that agent back), referencing this expense — so a single
   * create() call can produce two ledger rows, one cost + one
   * liability, exactly matching the two distinct financial facts the
   * brief calls out ("Expense: - Cost" and "Agent reimbursement: -
   * Liability" are not the same event just because they happen at the
   * same moment). */
  create(input: {
    companyId: UUID;
    projectId: UUID;
    category: ExpenseCategory;
    amount: number;
    expenseDate: string;
    vendor?: string;
    paymentMethod?: string;
    paidByAgentId?: UUID | null;
    changeOrderId?: UUID | null;
    receiptUrl?: string;
  }): Promise<Expense>;

  update(expenseId: UUID, changes: Partial<Omit<Expense, keyof AuditedEntity | "projectId">>): Promise<Expense>;
  /** See EstimateService.softDelete's doc comment — same required-reason
   * enforcement via ValidationService.validateDeleteReason. */
  softDelete(expenseId: UUID, reason: string): Promise<void>;
  restore(expenseId: UUID): Promise<void>;

  /** If paidByAgentId is set, this expense creates a reimbursement
   * owed to that agent — the same relationship contractor-pwa modeled
   * via reimbursement_from_agent_id, but surfaced as an explicit query
   * here instead of callers having to know to join across tables. */
  getPendingAgentReimbursements(agentId: UUID): Promise<Expense[]>;

  listMileageForProject(projectId: UUID): Promise<MileageTrip[]>;

  /** Appends "mileage_expense" to the ledger — its own type, not
   * folded into "other_expense", because mileage has its own tax
   * treatment (TaxService reads it separately) and its own source
   * table (mileage_trips, not estimate_expenses). */
  recordMileageTrip(input: { companyId: UUID; projectId: UUID | null; distanceMiles: number; reimbursement: number }): Promise<MileageTrip>;

  /** Budget (from EstimateService's line items) vs. actual (from this
   * service) per category — contractor-pwa's getBudgetComparison,
   * relocated here since it's fundamentally "what did we plan to
   * spend vs. what have we spent," an expense-service question that
   * happens to need one number from EstimateService. */
  getBudgetComparison(projectId: UUID): Promise<Record<ExpenseCategory, { budget: number; actual: number }>>;
}
