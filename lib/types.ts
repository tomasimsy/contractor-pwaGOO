// Types for the Project Expense feature, matched to your real tables
// where you've given me the columns, and clearly flagged where I'm
// still guessing.

// ---------------------------------------------------------------------
// CONFIRMED — from information_schema you pasted.
// ---------------------------------------------------------------------

/** Material / labor / other line items. Subcontractor payments and
 * agent commissions live in their own tables (below), NOT here. */
export type EstimateExpenseRow = {
  id: string;
  estimate_id: string | null;
  category: string; // free text, default 'other' — see EXPENSE_CATEGORIES below
  description: string | null;
  amount: number;
  expense_date: string | null; // date, defaults to CURRENT_DATE
  notes: string | null;
  created_at: string | null;
  company_id: string;
  vendor: string | null;
  tax: number; // not null, default 0
  payment_method: string | null;
  paid_by: string | null;
  receipt_url: string | null;
  receipt_storage_path: string | null;
  receipt_file_name: string | null;
  deleted_at: string | null;
  change_order_id: string | null;
  paid_by_agent_id: string | null; // agent who paid for this expense (creates reimbursement)
};

/** The category values the Add Expense form writes. estimate_expenses
 * has no CHECK constraint on `category`, so if your existing rows use
 * different strings, update this list to match — everything else
 * reads through it. */
export const EXPENSE_CATEGORIES = ["material", "labor", "other"] as const;
export type EstimateExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABEL: Record<EstimateExpenseCategory, string> = {
  material: "Material",
  labor: "Labor",
  other: "Other",
};

/** A payment to an agent. agent_id points straight at your agents
 * table (whatever it's actually called — see SalesAgentRow below).
 * Confirmed: used to determine agent payment status, filtered by
 * `estimate_id`. */
export type AgentPaymentRow = {
  id: string;
  estimate_id: string | null;
  agent_id: string | null;
  amount: number;
  payment_date: string | null; // timestamp, defaults to now()
  payment_method: string | null; // default 'bank_transfer'
  notes: string | null;
  created_at: string | null;
  company_id: string;
  deleted_at: string | null;
  change_order_id: string | null;
  // Links this payment to a specific estimate_agents assignment row —
  // same pattern as subcontractor_payments.estimate_subcontractor_id —
  // so "assigned vs. paid" can be computed per assignment. Nullable
  // since payments made before this column existed have no assignment.
  estimate_agent_id: string | null;
  // Type of payment: 'commission' (earned) or 'reimbursement' (expenses paid on behalf of project)
  payment_type: 'commission' | 'reimbursement';
  // For reimbursements: links back to the original estimate_expenses row
  expense_id: string | null;
};

/** Assigns an agent to a project with an expected commission/payout
 * amount — the agent-side mirror of EstimateSubcontractorRow, on the
 * pre-existing (legacy) estimate_agents table, now wired into the
 * payout workflow instead of just the old standalone components. */
export type EstimateAgentRow = {
  id: string;
  estimate_id: string | null;
  agent_id: string | null;
  amount: number | null; // assigned/expected payout, default 0
  notes: string | null;
  created_at: string | null;
  company_id: string;
  deleted_at: string | null;
};

/** The authoritative source for client payment status — confirmed.
 * One or more invoices can reference the same estimate (`estimate_id`
 * is nullable, no uniqueness implied), so payment figures are always
 * SUMMED across every non-deleted invoice for an estimate rather than
 * assuming exactly one row. `amount_paid` / `remaining_balance` already
 * reflect cumulative payment (deposit + final combined on one row,
 * per the deposit_paid_at + final_payment_paid_at fields living
 * alongside them) — no need to add deposit fields back in separately.
 * `status` and `payment_status` are both free text (defaults
 * 'unpaid' / 'pending') with unconfirmed value domains, so — same
 * reasoning as `estimates.payment_status` — payment status is
 * computed from amounts (see derivePaymentStatus) rather than read
 * from either of these columns directly.
 *
 * Note: this table used to also carry a `balance_due` column that
 * nothing in the app ever read or wrote — `remaining_balance` is the
 * one every real code path uses. See
 * supabase/migrations/20260713000200_drop_duplicate_payment_tracking.sql. */
export type InvoiceRow = {
  id: string;
  estimate_id: string | null;
  client_id: string | null;
  status: string | null; // default 'unpaid'
  invoice_number: string | null;
  subtotal: number;
  tax: number;
  markup: number;
  discount: number;
  deposit: number;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_paid_at: string | null;
  total: number;
  amount_paid: number;
  remaining_balance: number;
  payment_status: string | null; // default 'pending'
  final_payment_paid_at: string | null;
  paid_at: string | null;
  issue_date: string | null;
  due_date: string | null;
  overdue: boolean;
  change_order_id: string | null;
  is_deleted: boolean;
  notes: string | null;
  created_at: string | null;
  company_id: string;
};

/** A payment against an assignment row in estimate_subcontractors —
 * NOT directly against a subcontractor. To know who was paid you have
 * to join through estimate_subcontractor_id. */
export type SubcontractorPaymentRow = {
  id: string;
  estimate_subcontractor_id: string | null;
  amount: number;
  payment_method: string | null; // default 'cash'
  payment_date: string | null; // timestamp, defaults to now()
  notes: string | null;
  created_at: string | null;
  estimate_id: string | null;
  company_id: string;
  deleted_at: string | null;
  change_order_id: string | null;
};

/** Assigns a subcontractor to a project, with the contracted amount
 * for that assignment. subcontractor_payments references THIS row,
 * not the subcontractor directly — so a sub has to be assigned here
 * before a payment can be logged against them. */
export type EstimateSubcontractorRow = {
  id: string;
  estimate_id: string | null;
  subcontractor_id: string | null;
  amount: number | null; // contracted amount, default 0 — not payments-to-date
  notes: string | null;
  created_at: string | null;
  company_id: string;
  deleted_at: string | null;
};

export const PAYMENT_METHODS = ["cash", "check", "card", "bank_transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A completed mileage trip optionally linked to a project via
 * estimate_id (nullable — association happens after the fact through
 * MileageCard's per-trip picker, not required at trip creation). Only
 * the fields the Expense page's cost rollup needs. */
export type MileageTripRow = {
  id: string;
  estimate_id: string | null;
  distance_miles: number | null;
  reimbursement: number | null;
  created_at: string | null;
};

/** A budgeted line item from the original estimate — only the fields
 * needed to compare budget vs. actual spend per category. */
export type EstimateItemRow = {
  id: string;
  category: string;
  total: number;
};

/** A change order against a project — the table already exists (created/
 * approved from the Estimate detail page); this is only the subset of
 * columns the Expense page needs. Status transitions: draft -> pending
 * -> approved|rejected, plus a terminal 'invoiced' reached only via the
 * (separately maintained) convert-to-invoice flow. */
export type ChangeOrderRow = {
  id: string;
  estimate_id: string;
  company_id: string;
  change_order_number: string;
  title: string;
  description: string | null;
  status: "draft" | "pending" | "approved" | "rejected" | "invoiced";
  total_amount: number;
  tax: number;
  notes: string | null;
  created_at: string | null;
  approved_at: string | null;
};

// ---------------------------------------------------------------------
// ASSUMED — you haven't confirmed these columns yet. The FK columns
// above (estimate_id, subcontractor_id, agent_id, company_id) all
// point here; fix names below if they're off, everything downstream
// reads through these types.
// ---------------------------------------------------------------------

export type CompanyRow = {
  id: string;
  name: string;
};

export type ClientRow = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type SubcontractorRow = {
  id: string;
  company_id: string;
  name: string;
  trade: string | null;
  phone: string | null;
};

export type SalesAgentRow = {
  id: string;
  company_id: string;
  name: string;
  commission_rate: number | null;
};

/** Confirmed from information_schema. Notable differences from the
 * earlier guess: no `project_name` (using `title` instead), no
 * `address` (confirmed not to exist anywhere — dropped from
 * search/display), and no single `estimate_total` (using `total`,
 * the post-markup/discount/tax figure). Soft-delete is tracked via
 * `is_deleted` / `deleted_at` — queries filter these out. */
export type EstimateRow = {
  id: string;
  company_id: string;
  client_id: string | null;
  estimate_number: string | null;
  title: string | null;
  description: string | null;
  status: string | null; // default 'pending'
  total: number;
  deposit: number;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_paid_date: string | null;
  payment_status: string | null; // default 'pending' — only deposit_paid/deposit_amount are read today, see summarizeFinancials
  is_deleted: boolean;
  created_at: string;
};

export type ProjectSummary = {
  id: string;
  estimateNumber: string;
  projectName: string;
  clientName: string;
  status: string | null;
};

/** A subcontractor assignment enriched with the subcontractor's name,
 * for the "who am I paying" picker. */
export type AssignedSubcontractor = {
  estimateSubcontractorId: string;
  subcontractorId: string;
  name: string;
  trade: string | null;
  contractedAmount: number;
  notes: string | null;
};

/** The agent-side mirror of AssignedSubcontractor. */
export type AssignedAgent = {
  estimateAgentId: string;
  agentId: string;
  name: string;
  assignedAmount: number;
  notes: string | null;
};

// ---------------------------------------------------------------------
// Payout workflow — one normalized shape for "who's owed money on this
// project," covering both subcontractors and agents, so the pending-
// payout queue/UI doesn't need to special-case the two roles.
// ---------------------------------------------------------------------

export const PAYOUT_STATUS_VALUES = ["pending", "partial", "paid"] as const;
export type PayoutStatusValue = (typeof PAYOUT_STATUS_VALUES)[number];

export type PendingPayout = {
  role: "subcontractor" | "agent";
  assignmentId: string; // estimateSubcontractorId or estimateAgentId
  personId: string; // subcontractorId or agentId
  name: string;
  roleDetail: string | null; // trade, for subcontractors
  assignedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: PayoutStatusValue;
  notes: string | null;
  // For agents: breakdown of commission vs reimbursement (optional, only set for agents)
  commissionAmount?: number;
  reimbursementAmount?: number;
  paidCommission?: number;
  paidReimbursement?: number;
};

export type ProjectBundle = {
  project: EstimateRow;
  client: ClientRow;
  company: CompanyRow;
  expenses: EstimateExpenseRow[];
  subcontractorPayments: SubcontractorPaymentRow[];
  agentPayments: AgentPaymentRow[];
  invoices: InvoiceRow[];
  assignedSubcontractors: AssignedSubcontractor[];
  assignedAgents: AssignedAgent[];
  allSubcontractors: Pick<SubcontractorRow, "id" | "name" | "trade">[];
  salesAgents: Pick<SalesAgentRow, "id" | "name" | "commission_rate">[];
  mileageTrips: MileageTripRow[];
  estimateItems: EstimateItemRow[];
  changeOrders: ChangeOrderRow[];
};

// ---------------------------------------------------------------------
// Client payment status — derived, not stored. See lib/queries/expenses.ts
// (derivePaymentStatus) for the calculation.
// ---------------------------------------------------------------------

export const PAYMENT_STATUS_VALUES = ["not_paid", "partial", "fully_paid"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUS_VALUES)[number];

export type PaymentSummary = {
  status: PaymentStatusValue;
  totalContractAmount: number;
  amountReceived: number;
  remainingBalance: number;
  paymentPercentage: number; // 0–100, clamped
};

// ---------------------------------------------------------------------
// Unified ledger row — the three payment/expense tables have different
// shapes, so the UI works against this normalized type instead.
// ---------------------------------------------------------------------

export type LedgerSource = "expense" | "subcontractor_payment" | "agent_payment";

export type LedgerEntry = {
  id: string;
  source: LedgerSource;
  categoryLabel: string;
  amount: number;
  date: string;
  payeeLabel: string;
  paymentMethod: string | null;
  notes: string | null;
  hasReceiptFields: boolean; // only true for `expense` rows
  changeOrderId: string | null;
  changeOrderLabel: string | null; // e.g. "CO-3", null when it belongs to the original estimate
};

// ---------------------------------------------------------------------
// Add-expense form input — one shape, routed to the right table by
// `category` in lib/queries/expenses.ts.
// ---------------------------------------------------------------------

export type FinancialSummaryData = {
  estimateTotal: number;
  materialCosts: number;
  laborCosts: number;
  // Committed (assigned) subcontractor cost — affects profit as soon as
  // a subcontractor is assigned, regardless of how much has actually
  // been paid out yet. See subcontractorPaidToDate for cash paid so far.
  subcontractorCosts: number;
  subcontractorPaidToDate: number;
  agentCommissions: number;
  // Agent reimbursements — expenses paid by agents on behalf of project
  // Tracked separately from commissions but included in total agent payout
  agentReimbursements: number;
  otherExpenses: number;
  mileageCosts: number;
  totalPaid: number;
  approvedChangeOrderTotal: number;
  revisedTotal: number;
};

/** Budgeted (from estimate_items) vs. actual (from estimate_expenses)
 * spend per category — see getBudgetComparison in lib/queries/expenses.ts. */
export type BudgetComparison = {
  material: { budget: number; actual: number };
  labor: { budget: number; actual: number };
  other: { budget: number; actual: number };
};

/** Budget alert for categories that exceed their allocated budget. */
export type BudgetAlert = {
  category: 'material' | 'labor' | 'other';
  budget: number;
  actual: number;
  overageAmount: number;
  overagePercent: number;
  isCritical: boolean; // true if over 100%, false if 75-100%
};

export type NewEntryInput =
  | {
      kind: "expense";
      estimateId: string;
      companyId: string;
      category: EstimateExpenseCategory;
      amount: number;
      tax: number;
      expenseDate: string;
      paymentMethod: string | null;
      vendor: string | null;
      paidBy: string | null;
      notes: string | null;
      changeOrderId: string | null;
      paidByAgentId?: string | null; // agent who paid for this expense (creates reimbursement)
    }
  | {
      kind: "subcontractor_payment";
      estimateId: string;
      companyId: string;
      estimateSubcontractorId: string;
      amount: number;
      paymentDate: string;
      paymentMethod: string | null;
      notes: string | null;
      changeOrderId: string | null;
    }
  | {
      kind: "agent_payment";
      estimateId: string;
      companyId: string;
      agentId: string;
      // Links to a specific estimate_agents assignment so payout status
      // (assigned/paid/remaining) can be computed per assignment —
      // optional since ad-hoc commission payments with no assignment
      // are still allowed (same as before this feature).
      estimateAgentId?: string | null;
      amount: number;
      paymentDate: string;
      paymentMethod: string | null;
      notes: string | null;
      changeOrderId: string | null;
      paymentType?: 'commission' | 'reimbursement'; // default 'commission'
      expenseId?: string | null; // for reimbursements: link to the original expense
    };

// Analytics and reporting types
export type ExpenseAnalyticsSource = {
  name: string;
  amount: number;
  count: number;
};

export type ExpenseAnalytics = {
  topVendors: ExpenseAnalyticsSource[];
  topCategories: ExpenseAnalyticsSource[];
  totalExpenses: number;
  totalSubcontractorAssigned: number;
  totalAgentAssigned: number;
  totalPendingPayouts: number;
  projectCount: number;
};