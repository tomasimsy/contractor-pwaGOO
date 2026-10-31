import type { PaymentService } from "@/lib/services/paymentService";

/**
 * The single "record a new payment against an invoice" write path.
 * Shared by InvoicePaymentsPanel (detail page) and RecordPaymentButton
 * (invoice list) so both enforce the same validation, the same receipt
 * trigger, and the same error surface.
 */
export async function recordInvoicePayment(
  paymentService: PaymentService,
  input: {
    companyId: string;
    invoiceId: string;
    amount: number;
    method: string;
    paymentDate: string;
    referenceNumber?: string;
    notes?: string;
    allowOverpayment: boolean;
  }
): Promise<{ ok: boolean; message?: string }> {
  // record() returns a ValidationResult — an overpayment without
  // acknowledgement comes back invalid rather than throwing.
  const result = await paymentService.record(input);
  if (!result.valid) {
    return { ok: false, message: result.issues.map((i) => i.message).join("; ") };
  }
  // Best-effort, fire-and-forget — the route itself recomputes the
  // balance and only actually sends once it's fully zero. Never blocks
  // the success path or surfaces its own errors; the payment already
  // succeeded.
  fetch("/api/payments/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId: input.invoiceId }),
  }).catch(() => {});
  return { ok: true };
}
