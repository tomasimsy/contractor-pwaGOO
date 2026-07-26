"use client";

/**
 * Balance card + payment history + record-payment form, all reading
 * exclusively from useInvoicePayments (which reads from
 * PaymentService). No dollar figure in this file is computed by this
 * file — "remaining balance," "status," and every payment row are
 * exactly what the service returned.
 */
import { useState } from "react";
import { useInvoicePayments } from "../../lib/hooks/useInvoicePayments";
import { LoadingState } from "../shared/AsyncStates";

const QUICK_PERCENTAGES = [1, 0.5, 0.25];

export function InvoicePaymentsPanel({ companyId, invoiceId }: { companyId: string; invoiceId: string }) {
  const { payments, summary, loading, error, recordPayment, deletePayment, restorePayment } = useInvoicePayments(invoiceId);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("bank_transfer");
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  // Loading only gates the initial fetch — a later mutation error
  // still renders inline below via `error`, same as before this pass;
  // `loading` and `error` share one source (useRefreshableResource) so
  // a failed refresh is now visible too, not just a failed submit.
  if (loading) return <LoadingState label="Loading payment history..." />;

  return (
    <div className="space-y-4 max-w-xl">
      {summary && (
        <section className="border rounded p-3 text-sm">
          <div>Paid: ${summary.totalPaid.toFixed(2)}</div>
          <div className="font-semibold">Remaining balance: ${summary.remainingBalance.toFixed(2)}</div>
          <div>Status: {summary.status}</div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="font-semibold">Record a payment</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {summary &&
            QUICK_PERCENTAGES.map((pct) => (
              <button key={pct} type="button" onClick={() => setAmount(Number((summary.remainingBalance * pct).toFixed(2)))}>
                {pct === 1 ? "Full" : `${pct * 100}%`}
              </button>
            ))}
        </div>
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} placeholder="Amount" />
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="check">Check</option>
          <option value="credit_card">Credit Card</option>
          <option value="cash">Cash</option>
          <option value="zelle">Zelle</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allowOverpayment} onChange={(e) => setAllowOverpayment(e.target.checked)} />
          Allow overpayment
        </label>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="button"
          disabled={submitting || amount <= 0}
          onClick={async () => {
            setSubmitting(true);
            try {
              const ok = await recordPayment({
                companyId,
                amount,
                method,
                paymentDate: new Date().toISOString().slice(0, 10),
                allowOverpayment,
              });
              if (ok) setAmount(0);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "Recording..." : "Record Payment"}
        </button>
      </section>

      <section>
        <h3 className="font-semibold">Payment history</h3>
        <ul className="divide-y">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                ${p.amount.toFixed(2)} — {p.method} — {p.paymentDate}
                {p.deletedAt && ` (deleted: ${p.deleteReason ?? "no reason recorded"})`}
              </span>
              {p.deletedAt ? (
                <button type="button" onClick={() => restorePayment(p.id)}>Restore</button>
              ) : deletingId === p.id ? (
                <span className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input placeholder="Reason (required)" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
                  <button
                    type="button"
                    className="text-red-600"
                    disabled={!deleteReason.trim()}
                    onClick={async () => {
                      await deletePayment(p.id, deleteReason);
                      setDeletingId(null);
                      setDeleteReason("");
                    }}
                  >
                    Confirm
                  </button>
                </span>
              ) : (
                <button type="button" className="text-red-600" onClick={() => setDeletingId(p.id)}>Delete</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
