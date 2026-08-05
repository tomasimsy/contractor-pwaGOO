/**
 * Layer 2 — owns `invoice_payments` (money RECEIVED from customers).
 * record() appends "customer_payment" to the ledger (via
 * TransactionService.append) in the same write as the invoice_payments
 * row — a completely separate financial fact from the "invoice_issued"
 * revenue row InvoiceService already booked at invoice creation. Two
 * ledger rows, two different moments: billed (accrual) vs. collected
 * (cash) — this is what "Invoice created: + Revenue" and "Customer
 * payment: + Cash received" being two separate examples in the brief
 * actually means at the ledger level.
 */
import type { UUID, AuditedEntity, PaymentStatus, ValidationResult, QueryScope } from "./types";

export interface CustomerPayment extends AuditedEntity {
  invoiceId: UUID;
  amount: number;
  method: string;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
}

export interface PaymentService {
  listForInvoice(invoiceId: UUID): Promise<CustomerPayment[]>;

  /**
   * The BATCHED form of listForInvoice — every payment for a SET of
   * invoices in one query, keyed by invoice id.
   *
   * Same reason getSummariesForInvoices exists: with hosted Supabase
   * the measured round-trip floor is ~130ms, and callers that render a
   * payments list per invoice were issuing one query per invoice in a
   * loop. Identical filter to listForInvoice (`deleted_at is null`,
   * newest payment first) so a batched read and a single read can
   * never disagree about which payments count.
   *
   * Every requested id appears in the result, mapping to [] when that
   * invoice has no payments — so callers never need a `?? []` guard.
   */
  listForInvoices(invoiceIds: UUID[]): Promise<Record<UUID, CustomerPayment[]>>;

  /** Company-wide active payments — the real, persisted source
   * FinancialEngine.getCompanyFinancials/getTaxSummary use for
   * cash-basis revenue (added 2026-08-01 to remove those two methods'
   * dependency on the in-memory transactionService ledger, which no
   * real payment ever wrote to in production — see
   * DASHBOARD_AUDIT_REPORT.md). Same `includeDeleted` contract as
   * every other listForCompany on this codebase. */
  listForCompany(scope: QueryScope): Promise<CustomerPayment[]>;

  /** Runs ValidationService.validatePaymentAmount first — this is
   * where the overpayment warning contractor-pwa only implemented in
   * one modal (ReceivedPaymentModal) becomes a rule enforced for every
   * caller, not just whichever page happened to add the check. */
  record(input: {
    companyId: UUID;
    invoiceId: UUID;
    amount: number;
    method: string;
    paymentDate: string;
    referenceNumber?: string;
    notes?: string;
    allowOverpayment?: boolean;
  }): Promise<ValidationResult & { payment?: CustomerPayment }>;

  update(paymentId: UUID, changes: Partial<Pick<CustomerPayment, "amount" | "method" | "paymentDate" | "referenceNumber" | "notes">>): Promise<CustomerPayment>;

  /** See EstimateService.softDelete's doc comment — same required-reason
   * enforcement via ValidationService.validateDeleteReason. */
  softDelete(paymentId: UUID, reason: string): Promise<void>;
  restore(paymentId: UUID): Promise<void>;

  /** Sum of active payments + derived status for one invoice — the
   * single implementation InvoiceService.refreshStatus and
   * FinancialEngine both call, instead of each summing
   * invoice_payments independently.
   *
   * ONE UNAVOIDABLE EXCEPTION, found during the 2026-08-01 financial
   * audit: the public/anonymous customer invoice page
   * (app/invoice/[id]/page.tsx) cannot reach this service at all — it
   * is server-rendered outside auth, and reads payments through a
   * `get_public_invoice` Postgres RPC instead. Whenever that RPC is
   * implemented (it is not yet applied in this project — see that
   * page's own header), its payment-filtering SQL (`deleted_at is
   * null`, presumably) must be hand-verified against this method's
   * own filter, since there is no shared code path to enforce the
   * match automatically. */
  getSummaryForInvoice(invoiceId: UUID): Promise<{
    totalPaid: number;
    remainingBalance: number;
    status: PaymentStatus;
  }>;

  /**
   * The BATCHED form of getSummaryForInvoice — same figures, same
   * formulas, one round-trip for the whole set instead of two per
   * invoice.
   *
   * Why it exists: getSummaryForInvoice issues TWO queries (the
   * invoice's `total`, then its payments), and FinancialEngine calls it
   * inside `.map()` over every invoice on a project. With hosted
   * Supabase the measured round-trip floor is ~130ms, so a 3-invoice
   * project spent ~800ms on six calls whose data could arrive in one —
   * and one of those calls re-fetched `invoices.total`, which the
   * caller already had in hand.
   *
   * Callers pass the invoice id AND its total (which they already
   * hold), so this only needs the payments. Results are keyed by
   * invoice id. Uses the identical derivePaymentStatus/
   * calculateRemainingBalance formulas, so a batched summary can never
   * disagree with a single one.
   */
  getSummariesForInvoices(
    invoices: Array<{ id: UUID; total: number }>
  ): Promise<Record<UUID, { totalPaid: number; remainingBalance: number; status: PaymentStatus }>>;
}
