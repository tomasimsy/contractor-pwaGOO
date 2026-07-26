/**
 * Layer 0 — the pure-math core of FinancialService. Every financial
 * FORMULA in the application lives here and nowhere else: line item
 * totals, subtotals, markup/discount/tax, deposit rules, change-order
 * revenue, payment status, committed cost, outstanding balances. No
 * I/O, no Supabase, no knowledge of "estimates" vs "invoices" as
 * database tables — just the arithmetic, so it can be shared by every
 * layer that needs it without creating a dependency-direction problem.
 *
 * WHY THIS IS ITS OWN LAYER-0 FILE AND NOT INSIDE financialEngine.ts:
 * FinancialEngine is Layer 3 — Layer 2 services (EstimateService,
 * InvoiceService, PaymentService, ChangeOrderService) are not allowed
 * to depend on it (see SERVICE_LAYER_DESIGN.md's dependency rule, and
 * TaxService's own doc comment on why "one exception" was the wrong
 * fix last time this came up). But an estimate's total and an
 * invoice's total need the EXACT SAME subtotal/markup/discount/tax
 * formula, and "is this invoice paid/partial/overpaid" needs the exact
 * same status logic whether it's read from PaymentService or
 * FinancialEngine. Before this file existed, that formula was
 * implemented THREE separate times (financialEngine.ts's
 * derivePaymentStatus, the in-memory InvoiceService.refreshStatus, and
 * the in-memory PaymentService.getSummaryForInvoice) — this file is
 * what collapses those three into one. Putting the math at Layer 0
 * lets both Layer 2 services and FinancialEngine (Layer 3) import it
 * with no dependency-direction violation in either direction.
 *
 * `FinancialEngine.ts` (exported publicly as `FinancialService`) is
 * still THE single object pages/components call — see its own
 * `calculateDocumentTotal`/`derivePaymentStatus`/etc. passthrough
 * methods, added so "all pages must use FinancialService" has a
 * concrete method to call rather than needing to import this file
 * directly. Layer 2 services import this file directly (Layer 0 is
 * always an allowed dependency) rather than going through
 * FinancialEngine, which would create the exact upward-dependency
 * problem TaxService's reclassification to Layer 3 already fixed once.
 */
import type { PaymentStatus } from "./types";

// ============================================================
// Document totals — estimates, invoices: subtotal -> markup/discount -> tax
// ============================================================

export interface LineItemLike {
  quantity: number;
  unitPrice: number;
}

/** The ONE line-item total formula — quantity * unit price. Used by
 * EstimateService and InvoiceService alike; neither computes this
 * itself anymore. */
export function calculateLineItemTotal(item: LineItemLike): number {
  return item.quantity * item.unitPrice;
}

/** Sum of line item totals — the subtotal, before markup/discount/tax. */
export function calculateSubtotal(lineItems: Array<{ total: number }>): number {
  return lineItems.reduce((sum, item) => sum + item.total, 0);
}

export interface DocumentTotal {
  subtotal: number;
  taxedBase: number; // subtotal + markup - discount, before tax
  tax: number;
  total: number;
}

/** The ONE subtotal -> markup -> discount -> tax -> total formula.
 * Estimates use it directly; an invoice generated FROM an estimate
 * carries the estimate's markup/discount/taxRate through this same
 * function rather than re-deriving its own total from raw line items
 * (the bug the automated test suite caught: a $4,300 estimate — after
 * markup/discount — was converting to a $4,000 invoice because the
 * invoice recomputed from scratch instead of reusing this). A
 * standalone invoice (no source estimate) has no markup/discount
 * concept and calls this with markup=0, discount=0. */
export function calculateDocumentTotal(subtotal: number, markup: number, discount: number, taxRate: number): DocumentTotal {
  const taxedBase = subtotal + markup - discount;
  const tax = taxedBase * (taxRate / 100);
  return { subtotal, taxedBase, tax, total: taxedBase + tax };
}

/** The self-healing-read decision: does a stored subtotal/total need
 * to be rewritten to match what calculateSubtotal/calculateDocumentTotal
 * would produce right now, from the CURRENT source data? Extracted as
 * its own pure function so this comparison — the exact thing that
 * catches an estimate whose stored total went stale from an edit made
 * outside this app (e.g. contractor-pwa's original UI soft-deleting
 * line items without recalculating) — is unit-testable without a
 * database, real or mocked. Floating-point-safe: compares rounded to
 * the cent, since subtotal/total are always currency amounts and an
 * exact `!==` on floats would false-positive on harmless rounding
 * noise (e.g. 0.1 + 0.2 !== 0.3) and self-heal (write) on every read. */
export function needsTotalRecalculation(
  stored: { subtotal: number; total: number },
  computed: { subtotal: number; total: number }
): boolean {
  const round = (n: number) => Math.round(n * 100);
  return round(stored.subtotal) !== round(computed.subtotal) || round(stored.total) !== round(computed.total);
}

// ============================================================
// Deposits — a proposal term, not a payment-tracking field (see
// EstimateService's doc comment on depositAmount for the full
// reasoning: collecting one is a real invoice + a real payment, never
// a cached deposit_paid boolean). The math itself is still centralized
// here so a future rule (e.g. "deposit must be a % of total, not a
// flat dollar amount") has exactly one place to change.
// ============================================================

export interface DepositValidation {
  valid: boolean;
  message?: string;
}

/** A requested deposit must be positive and cannot exceed the
 * document's own total — the one rule guarding
 * EstimateService.create/update's depositAmount field. */
export function validateDepositAmount(depositAmount: number, documentTotal: number): DepositValidation {
  if (depositAmount < 0) return { valid: false, message: "Deposit amount cannot be negative." };
  // "No deposit requested" (0) must always be valid regardless of the
  // document's total, including a negative one (an over-discounted
  // estimate — see calculateDocumentTotal's own doc comment on that
  // being allowed). Found by the stress-test suite: with no floor
  // here, a $0 deposit against a negative total failed
  // `0 > documentTotal` and rejected EVERY over-discounted estimate
  // from being created at all, not just ones that actually requested a
  // deposit.
  if (depositAmount === 0) return { valid: true };
  if (depositAmount > documentTotal) return { valid: false, message: "Deposit amount cannot exceed the total." };
  return { valid: true };
}

/** How much to actually invoice when a deposit is requested — identity
 * today (a flat dollar amount), but centralized so a percentage-based
 * deposit rule is a one-function change, not a hunt through every
 * caller that currently assumes "invoice for exactly depositAmount." */
export function calculateDepositInvoiceAmount(depositAmount: number): number {
  return depositAmount;
}

// ============================================================
// Change orders — revenue booked at approval (see
// ChangeOrderService.approveChangeOrder's doc comment: this is an
// accrual event, the same moment InvoiceService books "invoice_issued").
// ============================================================

/** A change order's revenue contribution once approved — total + tax.
 * Was inlined separately in ChangeOrderService.approveChangeOrder AND
 * in ReconciliationService's cross-check of the same number; both now
 * call this one function so they can never independently drift. */
export function calculateChangeOrderRevenue(totalAmount: number, tax: number): number {
  return totalAmount + tax;
}

/** THE invoice total formula: subtotal + flat tax dollar amount. An
 * invoice — unlike an estimate — has no markup/discount/tax-RATE
 * concept, so calculateDocumentTotal doesn't apply here (it expects a
 * percentage rate, not a flat amount); this is its own, equally-one,
 * function rather than each invoice write path adding `subtotal + tax`
 * inline. Found duplicated in InvoiceService.updateLineItems (a bare
 * `subtotal + invoice.tax`) during the post-Estimate-audit pass over
 * Invoices. */
export function calculateInvoiceTotal(subtotal: number, tax: number): number {
  return subtotal + tax;
}

export interface ChangeOrderRevenueLike {
  status: string;
  totalAmount: number;
  tax: number;
}

/** THE "how much approved-change-order revenue applies here" formula —
 * filters to status === "approved" (draft/pending/rejected contribute
 * nothing) and sums calculateChangeOrderRevenue per item. Before this
 * function existed, this exact filter+reduce was written independently
 * in the Estimate Detail page, the Project Detail page, the Change
 * Order Detail page's "Estimate Impact" section, and the estimate PDF
 * route — four copies that could each silently drift from one another
 * (and from FinancialEngine's own equivalent). Every one of those now
 * calls this. Callers pass whatever change-order list they already
 * fetched (already excludes soft-deleted rows — every listForProject/
 * listForEstimate query filters deleted_at IS NULL at the source, so
 * this function doesn't need to filter that again).
 */
export function sumApprovedChangeOrderRevenue(changeOrders: ChangeOrderRevenueLike[]): number {
  return changeOrders
    .filter((co) => co.status === "approved")
    .reduce((sum, co) => sum + calculateChangeOrderRevenue(co.totalAmount, co.tax), 0);
}

/** THE "Revised Total" formula for an estimate: its own total plus
 * every approved change order's revenue. Deliberately never written
 * back onto estimates.total (see ChangeOrderService's doc comment) —
 * this is always a derived read, computed fresh from the estimate's
 * CURRENT total and the CURRENT set of approved change orders, so it
 * can never go stale the way a cached/cascaded column could. */
export function calculateRevisedEstimateTotal(estimateTotal: number, approvedChangeOrders: ChangeOrderRevenueLike[]): number {
  return estimateTotal + sumApprovedChangeOrderRevenue(approvedChangeOrders);
}

// ============================================================
// Payment status — invoices, and (by the same logic) any billed
// document with a total and an amount paid against it.
// ============================================================

/** THE payment-status formula. Before this file existed there were
 * THREE independent implementations of this exact ternary chain
 * (FinancialEngine's own derivePaymentStatus, InvoiceService.
 * refreshStatus, and PaymentService.getSummaryForInvoice) — found
 * during the FinancialService consolidation pass. All three now call
 * this. */
export function derivePaymentStatus(totalAmount: number, amountPaid: number): PaymentStatus {
  if (totalAmount > 0 && amountPaid > totalAmount) return "overpaid";
  if (amountPaid >= totalAmount && totalAmount > 0) return "paid";
  if (amountPaid > 0) return "partial";
  return "unpaid";
}

/** Total billed minus total paid, floored at... deliberately NOT
 * floored at 0 — a negative remaining balance IS the overpaid amount,
 * and callers that want "how much is still owed" (never negative)
 * should combine this with derivePaymentStatus rather than lose the
 * overpayment information here. */
export function calculateRemainingBalance(totalAmount: number, amountPaid: number): number {
  return totalAmount - amountPaid;
}

// ============================================================
// Committed cost / outstanding balances — subcontractor and agent
// assignments, and (by the same logic) agent reimbursement liabilities.
// ============================================================

export interface CommittedCostBalance {
  committed: number;
  outstanding: number;
}

/** The ONE assigned-vs-paid formula: committed cost is the greater of
 * what was assigned or what's actually been paid (an assignment is a
 * real cost the moment it's made, not when paid); outstanding is
 * assigned minus paid, floored at zero. Was duplicated between
 * TransactionService.getAssignmentBalance and (with slightly different
 * variable names) TransactionService.getReimbursementBalance before
 * this consolidation — both now call this. */
export function calculateCommittedCostBalance(assigned: number, paid: number): CommittedCostBalance {
  return {
    committed: Math.max(assigned, paid),
    outstanding: Math.max(0, assigned - paid),
  };
}
