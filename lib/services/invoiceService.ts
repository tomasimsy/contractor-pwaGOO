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

export type InvoiceStatus = "pending" | "signed" | "partial" | "paid";

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
}

export interface InvoiceService {
  getById(invoiceId: UUID): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null>;
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

  /** Derives status purely from amountPaid vs total via PaymentService
   * — never reads/writes a free-text status column directly, avoiding
   * the "status vs payment_status vs computed" three-way disagreement
   * documented on invoices in contractor-pwa. */
  refreshStatus(invoiceId: UUID): Promise<Invoice>;

  /** See EstimateService.softDelete's doc comment — same required-reason
   * enforcement via ValidationService.validateDeleteReason. */
  softDelete(invoiceId: UUID, reason: string): Promise<void>;
}
