/**
 * Shared domain types for the service layer. Every service imports from
 * here rather than declaring its own overlapping shape — the exact
 * failure mode that let contractor-pwa accumulate 3+ slightly different
 * "FinancialData" interfaces across financialCalculations.ts, types.ts,
 * and per-page local types.
 */

export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

/**
 * Branded numeric types so the two cost models FinancialEngine
 * deliberately keeps separate (committed vs. cash-basis) can't be
 * assigned to each other by accident — a plain `number` return type on
 * both would let a future caller add them together or pass one where
 * the other is expected, and TypeScript would never catch it. The
 * brand is compile-time only (erased at runtime); construct these ONLY
 * via `asCommittedCost`/`asRealizedCost` below. FinancialEngine's
 * implementation is the only code that should ever call them — a
 * Layer 2 service computing a raw number and casting it to one of
 * these itself would defeat the point of the brand.
 */
declare const CommittedBrand: unique symbol;
declare const RealizedBrand: unique symbol;
/** A cost incurred the moment it's committed to (assigned), regardless
 * of whether it's been paid yet — max(assigned, paid) per assignment.
 * Project-level only. Never subtract/add against a RealizedCost. */
export type CommittedCost = number & { readonly [CommittedBrand]: true };
/** Cash actually paid within a date range, by the transaction's own
 * date — period/company-level only. Never subtract/add against a
 * CommittedCost. */
export type RealizedCost = number & { readonly [RealizedBrand]: true };

/** The only sanctioned way to produce a CommittedCost — a thin,
 * intentionally trivial cast, not a validator. It exists purely so the
 * brand can be applied at exactly one spot (FinancialEngine's
 * implementation), grep-able if anyone else starts casting. */
export function asCommittedCost(amount: number): CommittedCost {
  return amount as CommittedCost;
}
/** The only sanctioned way to produce a RealizedCost — see asCommittedCost. */
export function asRealizedCost(amount: number): RealizedCost {
  return amount as RealizedCost;
}

/** Every domain object a service returns carries these — mirrors the
 * DB-level audit columns (created_by/updated_by/deleted_by via trigger)
 * so the UI never has to reach past the service to know provenance.
 * `deleteReason` is required, in practice, for every FINANCIAL record
 * (invoices, payments, expenses, subcontractor/agent payments,
 * estimates) — see ValidationService.validateDeleteReason and each
 * service's `softDelete` signature, which takes a reason as a required
 * argument, not optional metadata. */
export interface AuditedEntity {
  id: UUID;
  companyId: UUID;
  createdBy: UUID | null;
  createdAt: ISODateTime;
  updatedBy: UUID | null;
  updatedAt: ISODateTime;
  deletedBy: UUID | null;
  deletedAt: ISODateTime | null;
  deleteReason: string | null;
}

export interface DateRange {
  start: Date;
  end: Date;
}

/** The one payment-status vocabulary every service agrees on — replaces
 * estimates.payment_status / invoices.payment_status / invoices.status
 * all independently guessing at this in the old schema. Always derived,
 * never read from a stored string column. */
export type PaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

export type ProjectStatus =
  | "draft" | "active" | "in_progress" | "on_hold" | "completed" | "cancelled" | "archived";

export type EstimateStatus =
  | "draft" | "sent" | "viewed" | "approved" | "rejected" | "converted_to_invoice";

export type ChangeOrderStatus = "draft" | "pending" | "approved" | "rejected" | "invoiced";

/** Every reduce()-shaped question ("total X for this project/company")
 * gets asked through this one filter shape, so FilteringService has a
 * single signature to validate rather than each service inventing its
 * own date/company/status filter params. */
export interface QueryScope {
  companyId: UUID;
  projectId?: UUID;
  /** Narrows to one branch/location — the multi-location axis, which
   * is orthogonal to companyId (one company can have many locations;
   * see LocationService). Optional and unused by any Layer 2 service
   * yet — a project has no locationId column today — so this is the
   * scope shape ready for that FK once locations are actually assigned
   * to projects/employees, not a promise that filtering by it works
   * everywhere already. */
  locationId?: UUID;
  dateRange?: DateRange;
  includeDeleted?: boolean; // default false everywhere; explicit opt-in only for /deleted-style views
}

/**
 * The full financial picture for one project — the return type of
 * FinancialEngine.getProjectFinancials, and the ONLY place these
 * numbers are allowed to be assembled. Field-for-field successor to
 * contractor-pwa's ProjectFinancials, kept intentionally close so the
 * migration can be verified number-for-number against the old engine.
 */
export interface ProjectFinancials {
  projectId: UUID;
  originalEstimateTotal: number;
  approvedChangeOrderTotal: number;
  revisedTotal: number;
  subcontractorCosts: CommittedCost; // max(assigned, paid) per assignment
  agentCosts: CommittedCost; // max(assigned, paid) per assignment
  expenseItems: number;
  mileageCosts: number;
  totalExpenses: number;
  grossProfit: number; // revisedTotal - (subcontractorCosts + agentCosts)
  netProfit: number; // revisedTotal - totalExpenses
  profitMargin: number; // percent
  invoicesTotal: number;
  amountPaid: number;
  remainingBalance: number;
  outstandingSubcontractor: CommittedCost; // assigned - paid per assignment, floored at 0
  outstandingAgent: CommittedCost;
  outstandingTotal: CommittedCost;
  paymentStatus: PaymentStatus;
  isFullyPaid: boolean;
}

/**
 * Return type of FinancialEngine.getEstimateFinancials — the same job-
 * costing formulas as ProjectFinancials, scoped to ONE estimate instead
 * of the whole project. Exists because ProjectFinancials aggregates
 * every estimate/invoice/expense under a project, which is the wrong
 * number to show on a single Estimate's detail page whenever a project
 * carries more than one estimate.
 *
 * Cost sourcing note: subcontractorCosts/agentCommissionCosts here come
 * from Expense rows (expenseType "subcontractor"/"agent_commission")
 * via calculateExpenseTotals — the only REAL, persisted, estimate-
 * scoped source for those costs today. SubcontractorService/
 * AgentCommissionService's formal "assignment" objects are project-
 * scoped only (no estimateId on that schema) AND still in-memory-only
 * (no Supabase-backed implementation exists yet — see
 * ServicesProvider.tsx's own doc comment) — so they are deliberately
 * NOT folded in here; doing so would mix real persisted numbers with
 * non-functional placeholder data.
 */
export interface EstimateFinancials {
  estimateId: UUID;
  projectId: UUID;
  estimateTotal: number;
  approvedChangeOrderTotal: number;
  revisedTotal: number;
  invoicesTotal: number;
  amountPaid: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  isFullyPaid: boolean;
  /** Sum of expenseType === "subcontractor" rows recorded against this estimate. */
  subcontractorCosts: number;
  /** Sum of expenseType === "agent_commission" rows recorded against this estimate. */
  agentCommissionCosts: number;
  totalExpenses: number;
  grossProfit: number; // revisedTotal - (subcontractorCosts + agentCommissionCosts)
  netProfit: number; // revisedTotal - totalExpenses
  profitMargin: number; // percent
}

/** Return type of FinancialEngine.getCompanyFinancials — a period,
 * cash-basis rollup. Deliberately a DIFFERENT cost model than
 * ProjectFinancials (realized cash paid in the period, not committed
 * assigned-vs-paid) — see FinancialEngine's own doc comment for why
 * collapsing these into one model would itself be a bug. */
export interface CompanyFinancials {
  companyId: UUID;
  range: DateRange;
  totalRevenue: RealizedCost;
  subcontractorPaid: RealizedCost;
  /** ALL cash paid to agents in the period — commission plus settled
   * reimbursements. Correct for "how much did agents receive," but
   * NOT a cost input: the reimbursement half repays a purchase
   * already counted in `expenseItems`. Use `agentCommissionPaid` for
   * any cost/profit math (see FinancialEngine's comment on the
   * double-count this prevents). */
  agentPaid: RealizedCost;
  /** The COST-bearing half of `agentPaid` — commission only. This is
   * what enters totalExpenses/profit; reimbursement settlements do
   * not, because the underlying expense is already a cost. */
  agentCommissionPaid: RealizedCost;
  expenseItems: number;
  mileageCosts: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  // Lifetime, not period-scoped (see FinancialEngine doc) — still
  // CommittedCost, not RealizedCost: "outstanding" is an assigned-minus-
  // paid balance regardless of which level computes it.
  outstandingSubcontractor: CommittedCost;
  outstandingAgent: CommittedCost;
  outstandingTotal: CommittedCost;
  completedProjects: number;
  activeProjects: number;
}

/**
 * Every kind of financial event the ledger records. One row per event,
 * one type per row — this is the exhaustive list of "financial actions"
 * the brief requires to be traceable. Adding a new financial concept to
 * the app means adding a type here (and a row to TRANSACTION_TYPE_META
 * below) before it can touch money at all.
 */
export type TransactionType =
  // Revenue (+) — booked when the underlying document is created/
  // approved, i.e. accrual, NOT when cash arrives. This is what makes
  // "Invoice created: + Revenue" and "Payments: + Cash received" two
  // DIFFERENT ledger rows instead of the same event under two names.
  | "invoice_issued"
  | "change_order_approved"
  // Cash in (+)
  | "customer_payment"
  // Cost (-)
  | "material_expense"
  | "labor_expense"
  | "other_expense"
  | "mileage_expense"
  | "subcontractor_payment"
  | "agent_commission"
  // Cost (-) — a paid PayrollService pay run's cash-out. Separate from
  // subcontractor_payment/agent_commission because a payroll run pays
  // employees (PayrollService), not contractors/agents (Subcontractor/
  // AgentCommissionService) — same "different service, different
  // ledger type" split as those two.
  | "payroll_expense"
  // Liability (-) — booked the moment the company becomes obligated to
  // pay an agent back (an expense the agent covered on the project's
  // behalf), separate from the later cash event that settles it. This
  // is "Agent reimbursement: - Liability" from the brief: booking the
  // liability is not the same financial fact as paying it off.
  | "agent_reimbursement_owed"
  // Cash out (-) — settles an agent_reimbursement_owed liability. Two
  // rows, not one, because "we owe it" and "we paid it" are different
  // moments and a reconciliation/audit view needs to see both.
  | "agent_reimbursement_paid"
  // The one type with no natural document behind it — see
  // TransactionService.recordAdjustment for why this is the single
  // deliberate, narrow exception to "the ledger is mirror-write-only."
  | "adjustment";

export type TransactionEffect = "revenue" | "cash_in" | "cost" | "liability" | "cash_out";

/** Every TransactionType's accounting effect and sign, in one place —
 * so "is this a cost or a liability" is a table lookup, not a
 * judgment call scattered across every caller that sums the ledger.
 * amount is ALWAYS stored positive; sign for arithmetic comes from
 * here, never from the row itself. */
export const TRANSACTION_TYPE_META: Record<TransactionType, { effect: TransactionEffect; sign: 1 | -1 }> = {
  invoice_issued: { effect: "revenue", sign: 1 },
  change_order_approved: { effect: "revenue", sign: 1 },
  customer_payment: { effect: "cash_in", sign: 1 },
  material_expense: { effect: "cost", sign: -1 },
  labor_expense: { effect: "cost", sign: -1 },
  other_expense: { effect: "cost", sign: -1 },
  mileage_expense: { effect: "cost", sign: -1 },
  subcontractor_payment: { effect: "cost", sign: -1 },
  agent_commission: { effect: "cost", sign: -1 },
  payroll_expense: { effect: "cost", sign: -1 },
  agent_reimbursement_owed: { effect: "liability", sign: -1 },
  agent_reimbursement_paid: { effect: "cash_out", sign: -1 },
  adjustment: { effect: "cost", sign: -1 }, // sign is overridden per-call by TransactionAdjustmentInput.direction
};

/** What kind of record a ledger entry is about — the table/entity
 * `referenceId` points into. Kept as a closed union (not a bare
 * string) so a typo in a reference type is a compile error, not a
 * silent orphaned ledger row nothing can ever join back to its source. */
export type ReferenceType =
  | "invoice" | "invoice_payment" | "change_order"
  | "estimate_expense" | "subcontractor_payment" | "agent_payment"
  | "adjustment"
  // A paid PayrollService pay run — see payrollService.ts. Pay runs
  // have no softDelete/restore concept in this foundation (once paid,
  // there's no "un-pay" action modeled), so this reference type's
  // ledger row is always active, same as "adjustment".
  | "payroll_run";

/**
 * financial_transactions — the ledger. One immutable row per financial
 * event. Deliberately has NO updated_by/updated_at/deleted_by/deleted_at:
 * a ledger entry is a historical fact, not a mutable record — correcting
 * one means appending an offsetting "adjustment" row that references it,
 * never editing or deleting the original (that's what makes "every
 * financial action must be traceable" true even after a mistake is
 * fixed — the mistake and its correction are both still there).
 *
 * Matches the requested schema exactly (id, company_id, project_id,
 * type, amount, reference_id, reference_type, created_by, created_at),
 * with one addition: `notes`, needed only because `recordAdjustment`
 * has no source document to explain itself the way every other type
 * does — see TransactionAdjustmentInput.
 */
export interface Transaction {
  id: UUID;
  companyId: UUID;
  projectId: UUID | null; // null only for company-level adjustments with no single project
  type: TransactionType;
  amount: number; // always positive — see TRANSACTION_TYPE_META for sign/effect
  referenceId: UUID;
  referenceType: ReferenceType;
  createdBy: UUID | null;
  createdAt: ISODateTime; // when the ROW was written
  // When the financial event actually occurred (a payment's own
  // payment_date, an expense's own expense_date, an invoice's own
  // issue_date) — NOT when the row was inserted. Found missing while
  // running the automated test suite: without this, every date-ranged
  // query (getCompanyLedger's dateRange, getTaxSummary) filtered on
  // createdAt, meaning a payment correctly dated 2026-01-05 but
  // inserted at whatever moment the test/app actually ran was
  // invisible to any period query for January 2026 — the exact
  // "invoice_payments.created_at vs payment_date" bug
  // calculateCompanyFinancials's own comments in contractor-pwa
  // already warned about, reintroduced here by dropping the field
  // during the schema-simplification pass. Always required, always a
  // real business date, never defaulted to "now" unless the caller has
  // no more specific date to give.
  transactionDate: ISODate;
  notes: string | null; // required in practice only for type: "adjustment"
  // Only meaningful (and only ever set) for type: "adjustment" — every
  // other type's sign is fixed by TRANSACTION_TYPE_META and this stays
  // null. Found missing while writing the automated test suite: an
  // adjustment's caller-supplied direction was being accepted by
  // recordAdjustment() but never persisted anywhere on the row, so it
  // was silently lost the moment it was written — any later sum over
  // adjustments had no way to recover whether one was a + or -
  // correction. This field is what TRANSACTION_TYPE_META.adjustment's
  // "sign is overridden per-call" comment was describing; without
  // storing it, that override had nowhere to land.
  adjustmentDirection: 1 | -1 | null;
}

/** Input for the one legitimate manual write to the ledger — a
 * correction with no underlying source row (a bank fee, a write-off, a
 * reconciling entry a bookkeeper enters directly). Distinct from every
 * other Transaction in that it MUST carry a reason and an actor, since
 * there's no source table for AuditService to attribute it to. */
export interface TransactionAdjustmentInput {
  companyId: UUID;
  projectId: UUID | null;
  direction: 1 | -1; // adjustment is the one type without a fixed sign in TRANSACTION_TYPE_META
  amount: number;
  transactionDate: ISODate; // the date this correction applies to — see Transaction.transactionDate
  reason: string; // required — not optional notes; this is the only provenance an adjustment has
  actorUserId: UUID;
}

export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * One row of the audit log — tracks exactly the six things reliability
 * requires: user (actorUserId), company (companyId — audit logs are
 * company-scoped like everything else; an owner must never see another
 * company's history), action, record changed (entityTable + entityId),
 * old/new value, timestamp. `changedFields` is derived by diffing
 * `oldValues`/`newValues` (only the keys that actually differ) — the
 * full snapshots are kept too because "what did the WHOLE row look
 * like before/after" is sometimes the actual question during a
 * reconciliation, not just "what changed."
 */
export interface AuditLogEntry {
  id: UUID;
  companyId: UUID;
  actorUserId: UUID | null;
  action: "create" | "update" | "delete" | "restore" | "status_change";
  entityTable: string;
  entityId: UUID;
  oldValues: Record<string, unknown> | null; // null for "create" — nothing existed before
  newValues: Record<string, unknown> | null; // null for "delete" — nothing exists after
  changedFields: Record<string, { before: unknown; after: unknown }> | null;
  occurredAt: ISODateTime;
}

/**
 * A single payable line — one subcontractor or agent assignment and
 * its committed/paid/outstanding balance. PayablesSummary is a list of
 * these, not just a total, because "who do we owe" needs the
 * breakdown, not only the sum — the same shape contractor-pwa's
 * pending-payouts queue used, now sourced from
 * TransactionService.getAssignmentBalance instead of a page-level
 * reduce().
 */
export interface PayableLine {
  role: "subcontractor" | "agent";
  assignmentId: UUID;
  payeeId: UUID; // subcontractorId or agentId
  payeeName: string;
  assigned: CommittedCost;
  paid: CommittedCost;
  outstanding: CommittedCost;
}

/** Return type of FinancialEngine.getPayablesSummary — everyone the
 * company (or one project) currently owes money to, broken out by
 * role, plus the totals. */
export interface PayablesSummary {
  scope: QueryScope;
  lines: PayableLine[];
  totalOutstandingSubcontractor: CommittedCost;
  totalOutstandingAgent: CommittedCost;
  totalOutstanding: CommittedCost;
}

/** Return type of FinancialEngine.getProfitSummary — the narrow
 * profit-only view Dashboard/Analytics cards need, so they don't have
 * to pull (and discard) the full ProjectFinancials/CompanyFinancials
 * shape just to render three numbers. Always derived from the same
 * getProjectFinancials/getCompanyFinancials call underneath — never a
 * separate calculation path. */
export interface ProfitSummary {
  scope: QueryScope;
  revenue: number;
  totalCosts: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
}

/**
 * Return type of FinancialEngine.getTaxSummary. Per the brief: taxable
 * revenue comes from payments actually RECEIVED (cash-basis, matching
 * company_tax_settings.accounting_method default), not from invoiced/
 * contracted value — an unpaid invoice is not taxable income yet.
 * Deductible expenses and approved costs are both drawn from the same
 * normalized cost sources FinancialEngine uses everywhere else
 * (expenses, subcontractor payments, agent commissions/reimbursements)
 * — TaxService adds categorization/1099 rules on top of this, it does
 * not recompute the underlying numbers.
 */
export interface TaxSummary {
  scope: QueryScope;
  taxableRevenue: RealizedCost; // payments received in range
  deductibleExpenses: number; // materials/labor/other + mileage
  approvedCosts: CommittedCost; // subcontractor + agent commission/reimbursement, committed
  netTaxableIncome: number; // taxableRevenue - deductibleExpenses - approvedCosts
  estimatedTaxLiability: number; // netTaxableIncome * rate
}

// ============================================================
// GLOBAL FILTER GRAMMAR — one shape for every entity's filters,
// resolved against SchemaRegistry (schemaRegistry.ts), not hand-coded
// per page. See FilterService (filteringService.ts) for how these are
// validated, canonicalized, and executed.
// ============================================================

export type FilterOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "in" | "notIn" | "between"
  | "contains" | "startsWith"
  | "isNull" | "isNotNull";

/**
 * One condition against one field. `path` is a dot path resolved by
 * SchemaRegistry — "status" (a direct column) or "customer.name" /
 * "project.customer.name" (across relationships), so a filter can
 * reach any registered entity/column/relationship without this type
 * ever needing to change. `value`'s shape depends on `operator`: a
 * single value for eq/gt/contains/etc., an array for in/notIn, a
 * 2-tuple for between, omitted for isNull/isNotNull.
 *
 * DETERMINISM: `value` must be a concrete, already-resolved value —
 * never a relative expression like "last 30 days." A caller wanting
 * "the last 30 days" resolves that to concrete ISO dates ONCE, before
 * building the FilterCondition. This is what makes "the same filter
 * must always produce the same results" true: two identical
 * FilterGroups, built at different times, are byte-identical and
 * therefore guaranteed to select the same rows (modulo new data
 * arriving, which is a data change, not a filter behaving differently).
 */
export interface FilterCondition {
  path: string;
  operator: FilterOperator;
  value?: unknown;
}

/** Composable AND/OR tree of conditions — nesting groups lets a filter
 * express "(status = active OR status = in_progress) AND amount
 * between [1000, 5000]" without a bespoke type for every combination. */
export interface FilterGroup {
  op: "and" | "or";
  conditions: Array<FilterCondition | FilterGroup>;
}

/** The type callers build and pass around. An absent/undefined Filter
 * means "no additional filtering beyond the QueryScope" — company/
 * project/date-range scoping still always applies (see FilterService.
 * resolveScope), a Filter narrows further, it never widens past scope. */
export type Filter = FilterGroup;

/** Output of FilterService.canonicalize() — same tree, guaranteed
 * schema-valid, with conditions recursively sorted into one stable
 * order and a `cacheKey` that is identical for any two Filters that are
 * semantically the same (same conditions, different construction
 * order). Two different ResolvedFilters can never have the same
 * cacheKey unless they select the same rows. */
export interface ResolvedFilter extends FilterGroup {
  conditions: Array<FilterCondition | ResolvedFilter>;
  cacheKey: string;
}

/**
 * The seam between FilterService and each Layer 2 service's actual
 * data access. A Layer 2 service registers one of these per entity it
 * owns; FilterService never queries Supabase itself — it resolves a
 * Filter into a ResolvedFilter and hands it to the matching executor.
 * This is what keeps schema knowledge in ONE place (SchemaRegistry +
 * FilterService) while data access stays in the Layer 2 service that
 * already owns that table's RLS/company-scoping concerns.
 */
export interface QueryExecutor<T> {
  entity: string; // must match a SchemaRegistry entity name
  query(scope: QueryScope, filter: ResolvedFilter | null): Promise<T[]>;
}

export interface ReconciliationFinding {
  severity: "info" | "warning" | "error";
  scope: "project" | "company";
  scopeId: UUID;
  message: string;
  expected: number;
  actual: number;
  difference: number;
}

export interface ReconciliationReport {
  runAt: ISODateTime;
  scope: QueryScope;
  findings: ReconciliationFinding[];
  isClean: boolean;
}
