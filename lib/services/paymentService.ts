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
import type { UUID, AuditedEntity, PaymentStatus, ValidationResult } from "./types";

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
   * invoice_payments independently. */
  getSummaryForInvoice(invoiceId: UUID): Promise<{
    totalPaid: number;
    remainingBalance: number;
    status: PaymentStatus;
  }>;
}
