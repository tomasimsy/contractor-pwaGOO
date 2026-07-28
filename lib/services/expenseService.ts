/**
 * Layer 2 — owns `estimate_expenses` (every project cost) and
 * `mileage_trips`.
 *
 * ============================================================
 * THE SINGLE SOURCE OF TRUTH FOR COST
 * ============================================================
 * FinancialEngine reads project expense cost from THIS service and
 * nowhere else. That is the whole point of the module: before it,
 * "total expenses" was assembled from ledger rows, which are append-only
 * and therefore structurally unable to honour a soft delete — a deleted
 * expense kept costing money forever. Reading the source rows instead
 * means `deleted_at is null` is the only exclusion rule needed, applied
 * once, here.
 *
 * The ledger is still written (traceability — see TRANSACTION_LEDGER.md)
 * but is no longer the input to a cost calculation.
 *
 * ============================================================
 * TWO CLASSIFICATIONS, ONE ROW
 * ============================================================
 * `expenseType` is the real classification (eight values). `category`
 * (material/labor/other) is the coarse LEGACY projection the original
 * contractor-pwa app still reads; a database trigger derives it from
 * expenseType on every write, so the two cannot disagree and no caller
 * has to set both. Never write `category` directly.
 *
 * ============================================================
 * WHO PAID vs. WHO WAS PAID
 * ============================================================
 * These are independent and conflating them is a classic costing bug:
 *   payee*   — who received the money (a vendor, a subcontractor, an agent)
 *   paidBy*  — who FRONTED it (the company, or someone owed it back)
 * A subcontractor expense paid by an agent has payeeType="subcontractor"
 * and paidByType="agent"; it is one cost to the project and one debt to
 * the agent. `reimbursable`/`reimbursementStatus` track the debt half.
 */
import type { UUID, AuditedEntity } from "./types";

/** The eight real classifications. `subcontractor` and
 * `agent_commission` exist here so that when the Subcontractor and Agent
 * modules land they read these rows as their cost source rather than
 * introducing a parallel calculation. */
export const EXPENSE_TYPES = [
  "materials",
  "labor",
  "subcontractor",
  "agent_commission",
  "permit",
  "equipment",
  "reimbursement",
  "miscellaneous",
] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  materials: "Materials",
  labor: "Labor",
  subcontractor: "Subcontractor",
  agent_commission: "Agent Commission",
  permit: "Permit",
  equipment: "Equipment",
  reimbursement: "Reimbursement",
  miscellaneous: "Miscellaneous",
};

/** The coarse legacy projection. Derived by trigger, never set by hand. */
export type ExpenseCategory = "material" | "labor" | "other";

/** Who received the money. `vendor` and `other` carry no id — vendors are
 * deliberately free text (no vendors table), so a vendor payee is a name
 * in `vendor` and nothing more. */
export const PAYEE_TYPES = ["vendor", "subcontractor", "agent", "employee", "other"] as const;
export type PayeeType = (typeof PAYEE_TYPES)[number];

/** Who fronted the money. Drives reimbursement: anything other than
 * `company` means somebody is out of pocket. */
export const PAID_BY_TYPES = ["company", "agent", "subcontractor", "employee", "customer"] as const;
export type PaidByType = (typeof PAID_BY_TYPES)[number];

export const PAID_BY_LABEL: Record<PaidByType, string> = {
  company: "Company",
  agent: "Agent",
  subcontractor: "Subcontractor",
  employee: "Employee",
  customer: "Customer",
};

export type ReimbursementStatus = "not_applicable" | "pending" | "reimbursed";

export interface Expense extends AuditedEntity {
  /** Nullable on legacy rows: one live expense is attached to an
   * estimate with no project_id. Resolve through `estimateId` in that
   * case — listForProject already does. */
  projectId: UUID | null;
  estimateId: UUID | null;
  changeOrderId: UUID | null;

  expenseType: ExpenseType;
  /** Legacy projection, read-only to this app. */
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  expenseDate: string;
  notes: string | null;

  /** Free-text vendor/payee name. Always populated for display even when
   * a structured payee is selected, so a list never renders a bare uuid. */
  vendor: string | null;
  payeeType: PayeeType | null;
  payeeId: UUID | null;

  paidByType: PaidByType;
  paidById: UUID | null;
  /** Legacy mirror of paidById when paidByType === "agent". Maintained
   * for the original app; never read as authoritative here. */
  paidByAgentId: UUID | null;

  paymentMethod: string | null;
  /** Settled with the PAYEE. Distinct from reimbursementStatus. */
  isPaid: boolean;
  reimbursable: boolean;
  reimbursementStatus: ReimbursementStatus;

  receiptUrl: string | null;
}

export interface MileageTrip {
  id: UUID;
  projectId: UUID | null;
  distanceMiles: number;
  reimbursement: number;
}

export interface ExpenseCreateInput {
  companyId: UUID;
  projectId: UUID | null;
  estimateId?: UUID | null;
  changeOrderId?: UUID | null;
  expenseType: ExpenseType;
  amount: number;
  expenseDate: string;
  description?: string | null;
  notes?: string | null;
  vendor?: string | null;
  payeeType?: PayeeType | null;
  payeeId?: UUID | null;
  paidByType?: PaidByType;
  paidById?: UUID | null;
  paymentMethod?: string | null;
  isPaid?: boolean;
  reimbursable?: boolean;
  receiptUrl?: string | null;
}

export type ExpenseUpdateInput = Partial<Omit<ExpenseCreateInput, "companyId">>;

/** What a project's costs add up to, broken out the way the Project and
 * Estimate pages display them. Returned by ONE service call so no page
 * ever reduces an expense array itself. */
export interface ExpenseTotals {
  /** Every active expense, regardless of who paid or type. */
  total: number;
  byType: Record<ExpenseType, number>;
  /** Cost the company itself fronted. */
  companyPaid: number;
  /** Fronted by someone else and not yet settled — a liability, and the
   * figure the future payouts view needs. */
  outstandingReimbursements: number;
  /** Owed to the PAYEE (bills entered but not yet paid). */
  unpaid: number;
}

export interface ExpenseService {
  /** Every ACTIVE expense for a project. Resolves BOTH `project_id` and
   * expenses attached only to one of the project's estimates — legacy
   * rows exist with a null project_id, and dropping them would silently
   * understate cost. */
  listForProject(projectId: UUID): Promise<Expense[]>;
  listForEstimate(estimateId: UUID): Promise<Expense[]>;
  listForCompany(companyId: UUID): Promise<Expense[]>;
  getById(expenseId: UUID): Promise<Expense | null>;

  /** THE cost totals for a project. FinancialEngine calls this; so does
   * every page that shows a cost figure. Deleted rows are excluded here,
   * once, rather than by each caller remembering to filter. */
  getTotalsForProject(projectId: UUID): Promise<ExpenseTotals>;

  create(input: ExpenseCreateInput): Promise<Expense>;
  update(expenseId: UUID, changes: ExpenseUpdateInput): Promise<Expense>;

  /** Soft delete only — see EstimateService.softDelete for the shared
   * required-reason enforcement. A deleted expense is excluded from
   * every calculation in the app by virtue of listForProject/
   * getTotalsForProject filtering it, not by any caller's own check. */
  softDelete(expenseId: UUID, reason: string): Promise<void>;
  restore(expenseId: UUID): Promise<void>;

  /** Settle the debt to whoever fronted an expense. The Agent and
   * Subcontractor modules call THIS when recording a payout instead of
   * tracking reimbursement themselves. */
  markReimbursed(expenseId: UUID): Promise<Expense>;

  /** Everything still owed to people who fronted company money —
   * agents, subcontractors, employees. The future payouts view is a
   * render of this plus commissions; no new schema, no new arithmetic. */
  listPendingReimbursements(companyId: UUID, payeeId?: UUID): Promise<Expense[]>;

  /** Distinct vendor names already used by this company — powers the
   * vendor Create-or-Select picker. Vendors are free text by design;
   * this is what stands in for a vendors table without creating one. */
  listKnownVendors(companyId: UUID): Promise<string[]>;

  listMileageForProject(projectId: UUID): Promise<MileageTrip[]>;
  recordMileageTrip(input: { companyId: UUID; projectId: UUID | null; distanceMiles: number; reimbursement: number }): Promise<MileageTrip>;

  /** Budget (estimate line items) vs. actual (expenses) per legacy
   * category — kept on the coarse three so the comparison stays
   * meaningful against estimate line items, which have no finer
   * classification to compare to. */
  getBudgetComparison(projectId: UUID): Promise<Record<ExpenseCategory, { budget: number; actual: number }>>;
}
