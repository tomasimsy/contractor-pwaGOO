/**
 * Layer 2 — owns `invoices` + `invoice_items`. A project can have
 * several invoices (deposit, progress billing, final) once project_id
 * (not estimate_id) is the real parent — this service's whole job is
 * making that N-per-project shape normal instead of the old 0..1
 * assumption everywhere. Payment recording itself belongs to
 * PaymentService, not here — this service only owns what's BILLED,
 * not what's been RECEIVED.
 */
import type { UUID, AuditedEntity, QueryScope, ValidationResult } from "./types";

/**
 * The full invoice lifecycle. Split deliberately into two kinds of
 * state, because conflating them is what produced the live data
 * corruption this module was built to fix (audited 2026-07-24: five of
 * eight production invoices had `status='paid'` while
 * `payment_status='pending'`, and every single one said "paid"
 * regardless of having zero payments — a stored status nobody
 * recomputed).
 *
 * LIFECYCLE statuses are explicit, human-driven decisions and ARE
 * stored: draft -> sent -> viewed, plus the terminal cancelled/void.
 *
 * PAYMENT-DERIVED statuses are never stored: `partially_paid`, `paid`,
 * and `overdue` are computed from active payments + total + due date
 * every time they're read (see deriveInvoiceStatus in
 * financialCalculations.ts). An invoice cannot "be" paid in the
 * database and un-paid in its payment rows, because there is no
 * database field that can disagree.
 */
export type InvoiceLifecycleStatus = "draft" | "sent" | "viewed" | "cancelled" | "void";

export type InvoiceStatus = InvoiceLifecycleStatus | "partially_paid" | "paid" | "overdue";

export interface InvoiceLineItem {
  id: UUID;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice extends AuditedEntity {
  projectId: UUID;
  estimateId: UUID | null; // which estimate this invoice was generated from, if any
  clientId: UUID | null;
  invoiceNumber: string;
  /** The STORED half — the only status a human sets directly, and the
   * only one persisted. Changed exclusively via changeStatus(), which
   * runs ValidationService.validateInvoiceStatusTransition first. */
  lifecycleStatus: InvoiceLifecycleStatus;
  /** DERIVED — never stored, never settable. Computed on every read by
   * financialCalculations.deriveInvoiceStatus from lifecycleStatus +
   * active payments + total + due date. This is what every UI shows.
   * See InvoiceStatus's doc comment for the live data corruption
   * (status='paid' vs payment_status='pending' on 5 of 8 production
   * invoices) that made deriving this mandatory. */
  status: InvoiceStatus;
  /** DERIVED — never set directly. Sum of active line items
   * (calculateSubtotal), or — when generated from an estimate — the
   * estimate's own taxedBase (calculateDocumentTotal's output), never
   * a value a caller supplies. There is no generic update() on this
   * interface that accepts subtotal/tax/total as input; the only
   * writers are createFromEstimate/createStandalone (initial value)
   * and updateLineItems (full recompute) — see this file's header. */
  subtotal: number;
  tax: number;
  /** DERIVED — never set directly. Always
   * calculateInvoiceTotal(subtotal, tax) = subtotal + tax (an invoice
   * has no markup/discount/tax-RATE concept, unlike an estimate, so
   * this is its own formula, not calculateDocumentTotal). Change
   * orders NEVER contribute to this field, approved or otherwise —
   * their project-level revenue effect is entirely separate (see
   * FinancialEngine.getProjectFinancials' revisedTotal, which sums
   * invoices + approved change orders as two independent inputs,
   * never folding one into the other's stored total). */
  total: number;
  issueDate: string | null;
  dueDate: string | null;
  isLocked: boolean; // locked once signed — no further line-item edits
  /** Opaque per-invoice capability token backing the public customer
   * page. Safe to expose to STAFF (they need it to build the share
   * link); never returned by the public RPC itself, which would let a
   * holder of one link mint others. Null on invoices predating the
   * token backfill. */
  customerToken: string | null;
}

export interface InvoiceService {
  /** `hasTotalDrift` flags an ISSUED invoice whose stored total no
   * longer matches its own line items — almost always a legacy row
   * whose billed amount included work (e.g. approved change orders)
   * that was never written as a line item. It is reported, never
   * auto-corrected: rewriting an issued invoice's total would falsify
   * what the customer was actually billed and agreed to. The remedy is
   * to void and reissue. Drafts self-heal instead, so this is always
   * false for them. */
  getById(invoiceId: UUID): Promise<(Invoice & { lineItems: InvoiceLineItem[]; hasTotalDrift?: boolean }) | null>;
  listForProject(projectId: UUID): Promise<Invoice[]>;

  /** Company-wide, date-ranged — the read path
   * FinancialEngine.getCompanyFinancials needs for totalInvoiced and
   * for the same billed-vs-collected comparison it does per-project,
   * just scoped to every project in the company for a period instead
   * of one project's whole history. */
  listForCompany(scope: QueryScope): Promise<Invoice[]>;

  /** Generates a new invoice from an estimate's current line items
   * (+ any approved change orders) — the one implementation of the
   * estimate -> invoice conversion, replacing whatever ad hoc "convert
   * to invoice" logic existed per page in contractor-pwa. Always
   * appends "invoice_issued" to the ledger for the invoice's total —
   * revenue is booked here, at creation (accrual), not later when a
   * payment arrives against it (that's "customer_payment", a
   * completely separate ledger row — see PaymentService). */
  createFromEstimate(estimateId: UUID, input: { issueDate: string; dueDate: string }): Promise<Invoice>;

  /** A standalone invoice not generated from a specific estimate
   * (progress billing against approved change-order work, e.g.) —
   * still requires a projectId, never estimateId-only. Also appends
   * "invoice_issued" to the ledger, same as createFromEstimate. */
  createStandalone(input: {
    companyId: UUID;
    projectId: UUID;
    clientId: UUID | null;
    lineItems: Omit<InvoiceLineItem, "id" | "total">[];
    issueDate: string;
    dueDate: string;
  }): Promise<Invoice>;

  /** Edit — only legal while `isLocked` is false (i.e. before a
   * customer signature exists). ValidationService rejects the call
   * once locked rather than this method silently no-op'ing; a locked
   * invoice must be corrected via a new invoice or a credit, not a
   * silent rewrite of a document a customer already signed. Recomputes
   * subtotal/tax/total from the new line items — same "one formula"
   * discipline as EstimateService.recalculateTotal. */
  updateLineItems(invoiceId: UUID, lineItems: Omit<InvoiceLineItem, "id" | "total">[]): Promise<ValidationResult & { invoice?: Invoice }>;

  lock(invoiceId: UUID): Promise<Invoice>;

  recordSignature(invoiceId: UUID, signature: { type: "draw" | "type"; value: string; date: string }): Promise<Invoice>;

  /** The ONE way an invoice's stored lifecycle status changes. Runs
   * ValidationService.validateInvoiceStatusTransition first, so an
   * illegal move (e.g. void -> sent) is rejected rather than silently
   * written. Issuing (sent/viewed) also locks financials. Note there
   * is deliberately no way to "set paid" — that is derived from
   * payments (see Invoice.status). */
  changeStatus(invoiceId: UUID, toStatus: InvoiceLifecycleStatus): Promise<ValidationResult & { invoice?: Invoice }>;

  /** Derives status purely from amountPaid vs total via PaymentService
   * — never reads/writes a free-text status column directly, avoiding
   * the "status vs payment_status vs computed" three-way disagreement
   * documented on invoices in contractor-pwa. */
  refreshStatus(invoiceId: UUID): Promise<Invoice>;

  /** See EstimateService.softDelete's doc comment — same required-reason
   * enforcement via ValidationService.validateDeleteReason. */
  softDelete(invoiceId: UUID, reason: string): Promise<void>;

  /** Was missing entirely — every other soft-deletable entity already
   * has a matching restore(); invoice never got one. Same contract as
   * ProjectService.restore: clears deleted_at/deleted_by/delete_reason,
   * nothing else. */
  restore(invoiceId: UUID): Promise<void>;
}
