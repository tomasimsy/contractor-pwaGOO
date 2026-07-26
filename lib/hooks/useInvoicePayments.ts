"use client";

/**
 * Orchestration only. Balance/remaining/status are never computed
 * here — they come back from PaymentService.getSummaryForInvoice
 * (itself backed by the same ledger FinancialEngine reads), so this
 * hook and FinancialEngine can never disagree about what an invoice's
 * balance is; there is exactly one implementation of that arithmetic.
 */
import { useCallback, useState } from "react";
import { useServices } from "../services-context";
import { useRefreshableResource } from "./useAsyncResource";
import type { CustomerPayment, PaymentStatus } from "../services";

export function useInvoicePayments(invoiceId: string) {
  const { paymentService } = useServices();
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [summary, setSummary] = useState<{ totalPaid: number; remainingBalance: number; status: PaymentStatus } | null>(null);

  const { loading, error, setError, refresh } = useRefreshableResource(async () => {
    const [paymentList, invoiceSummary] = await Promise.all([
      paymentService.listForInvoice(invoiceId),
      paymentService.getSummaryForInvoice(invoiceId),
    ]);
    setPayments(paymentList);
    setSummary(invoiceSummary);
  }, [paymentService, invoiceId]);

  /** Partial payments are just `record()` with an amount less than the
   * remaining balance — there is no separate "partial payment" code
   * path anywhere in the stack. ValidationService.validatePaymentAmount
   * (called inside PaymentService.record) is what actually decides
   * whether an amount is acceptable, including the overpayment warning. */
  const recordPayment = useCallback(
    async (input: { companyId: string; amount: number; method: string; paymentDate: string; referenceNumber?: string; notes?: string; allowOverpayment?: boolean }) => {
      setError(null);
      const result = await paymentService.record({ ...input, invoiceId });
      if (!result.valid) {
        setError(result.issues.map((i) => i.message).join("; "));
        return false;
      }
      await refresh();
      return true;
    },
    [paymentService, invoiceId, refresh, setError]
  );

  /** `reason` is required — ValidationService.validateDeleteReason
   * rejects an empty one inside PaymentService.softDelete itself, but
   * the form should never let a user get that far; see
   * InvoicePaymentsPanel's confirm step. */
  const deletePayment = useCallback(
    async (paymentId: string, reason: string) => {
      await paymentService.softDelete(paymentId, reason);
      await refresh();
    },
    [paymentService, refresh]
  );

  const restorePayment = useCallback(
    async (paymentId: string) => {
      await paymentService.restore(paymentId);
      await refresh();
    },
    [paymentService, refresh]
  );

  return { payments, summary, loading, error, recordPayment, deletePayment, restorePayment, refresh };
}
