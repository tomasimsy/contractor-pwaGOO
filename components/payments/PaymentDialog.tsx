"use client";

/**
 * Record / edit a customer payment.
 *
 * Display + input collection ONLY. Every figure it shows (remaining
 * balance, what's left after this payment) comes from the shared
 * financialCalculations functions; this component never sums payments
 * itself. The write goes through PaymentService.record/update, which
 * already runs ValidationService.validatePaymentAmount — this dialog
 * surfaces that result rather than re-implementing the rule.
 *
 * MODULARITY: an online payment (Stripe/ACH) lands through the same
 * PaymentService.record() with a gateway id in `referenceNumber`, so
 * adding one means adding a method to PAYMENT_METHODS and a callback —
 * not touching this form or any calculation.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { PAYMENT_METHODS } from "./paymentMethods";
import { calculateRemainingBalance } from "@/lib/services/financialCalculations";
import type { CustomerPayment } from "@/lib/services/paymentService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function PaymentDialog({
  invoiceTotal,
  totalPaid,
  payment,
  onClose,
  onSubmit,
}: {
  invoiceTotal: number;
  totalPaid: number;
  /** Present when editing an existing payment. */
  payment?: CustomerPayment | null;
  onClose: () => void;
  onSubmit: (input: {
    amount: number;
    method: string;
    paymentDate: string;
    referenceNumber?: string;
    notes?: string;
    allowOverpayment: boolean;
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const isEdit = !!payment;

  // When editing, this payment's own amount must be excluded from
  // "already paid" — otherwise the remaining balance double-counts it
  // and a legitimate edit looks like an overpayment.
  const paidExcludingThis = isEdit ? totalPaid - payment.amount : totalPaid;
  const remainingBefore = calculateRemainingBalance(invoiceTotal, paidExcludingThis);

  const [amount, setAmount] = useState(payment ? String(payment.amount) : remainingBefore > 0 ? String(remainingBefore) : "");
  const [method, setMethod] = useState(payment?.method || "check");
  const [paymentDate, setPaymentDate] = useState(() => payment?.paymentDate ?? new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState(payment?.referenceNumber ?? "");
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const [allowOverpayment, setAllowOverpayment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount) || 0;
  const remainingAfter = calculateRemainingBalance(invoiceTotal, paidExcludingThis + parsedAmount);
  const isOverpayment = parsedAmount > remainingBefore;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await onSubmit({
      amount: parsedAmount,
      method,
      paymentDate,
      referenceNumber: referenceNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      allowOverpayment,
    });
    setSaving(false);
    if (!result.ok) setError(result.message ?? "Could not save this payment.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-4 sm:rounded-2xl sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{isEdit ? "Edit Payment" : "Record Payment"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
            <div className="flex justify-between text-muted-foreground"><span>Invoice total</span><span>{money(invoiceTotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Already paid</span><span>{money(paidExcludingThis)}</span></div>
            <div className="flex justify-between font-semibold text-foreground"><span>Balance due</span><span>{money(remainingBefore)}</span></div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Amount *</label>
            <input
              type="number" step="0.01" min="0" required autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
            {parsedAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                Balance after this payment: <span className="font-medium text-foreground">{money(remainingAfter)}</span>
              </p>
            )}
          </div>

          {isOverpayment && (
            <div className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
              <p>
                This is {money(parsedAmount - remainingBefore)} more than the balance due. That may be intentional (a
                deposit ahead of extra work, or a rounded payment), so it isn&apos;t blocked — but it must be
                acknowledged.
              </p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={allowOverpayment} onChange={(e) => setAllowOverpayment(e.target.checked)} />
                <span>Record this overpayment anyway</span>
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              >
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Date *</label>
              <input
                type="date" required value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Reference</label>
            <input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Check no., transaction id…"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Notes</label>
            <textarea
              value={notes} rows={2}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-input px-3 text-sm font-medium text-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || parsedAmount <= 0 || (isOverpayment && !allowOverpayment)}
              className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Record payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
