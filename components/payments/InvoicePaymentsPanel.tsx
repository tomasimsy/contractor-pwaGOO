"use client";

/**
 * Payment history + record/edit/delete for one invoice.
 *
 * Owns no arithmetic. Every total comes back from
 * PaymentService.getSummaryForInvoice (which itself uses the shared
 * calculateRemainingBalance/derivePaymentStatus), and the parent page
 * re-reads after any mutation so the invoice's derived status updates
 * everywhere at once. There is deliberately no local "add this amount
 * to the running total" — that incremental pattern is what this
 * codebase has been removing throughout.
 */
import { forwardRef, useImperativeHandle, useState } from "react";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PaymentDialog } from "./PaymentDialog";
import { formatPaymentMethod } from "./paymentMethods";
import { useServices } from "@/components/providers/ServicesProvider";
import type { CustomerPayment } from "@/lib/services/paymentService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Lets a caller (e.g. a "Record Payment" button in a page header, above
 * where this panel actually renders) open the same record-payment
 * dialog this panel already owns, instead of duplicating it — mirrors
 * ProjectExpensesPanelRef's openNewExpense() pattern. */
export interface InvoicePaymentsPanelRef {
  openNewPayment: () => void;
}

export const InvoicePaymentsPanel = forwardRef<InvoicePaymentsPanelRef, {
  invoiceId: string;
  companyId: string;
  invoiceTotal: number;
  totalPaid: number;
  payments: CustomerPayment[];
  canEdit: boolean;
  /** Parent reloads everything — invoice status, balances, activity —
   * so no figure on the page can be left stale by a payment change. */
  onChanged: () => Promise<void> | void;
  /** Drops the outer border/heading — used when a parent (e.g.
   * EstimateDetail's Invoice & Payments card) already provides both,
   * so they aren't doubled. Same convention as SubcontractorAssignmentPanel's `compact` prop. */
  compact?: boolean;
}>(function InvoicePaymentsPanel({
  invoiceId,
  companyId,
  invoiceTotal,
  totalPaid,
  payments,
  canEdit,
  onChanged,
  compact = false,
}, ref) {
  const { paymentService } = useServices();
  const [dialogFor, setDialogFor] = useState<CustomerPayment | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Delete confirmation — replaces window.prompt, which some browsers
   * (embedded/PWA webviews in particular) refuse to render at all
   * ("prompt() is not supported"), silently breaking the button. */
  const [deleteTarget, setDeleteTarget] = useState<CustomerPayment | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useImperativeHandle(ref, () => ({
    openNewPayment() {
      setDialogFor("new");
    },
  }));

  async function handleSubmit(input: {
    amount: number; method: string; paymentDate: string;
    referenceNumber?: string; notes?: string; allowOverpayment: boolean;
  }): Promise<{ ok: boolean; message?: string }> {
    try {
      if (dialogFor && dialogFor !== "new") {
        await paymentService.update(dialogFor.id, {
          amount: input.amount,
          method: input.method,
          paymentDate: input.paymentDate,
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
        });
      } else {
        const result = await paymentService.record({
          companyId,
          invoiceId,
          amount: input.amount,
          method: input.method,
          paymentDate: input.paymentDate,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          allowOverpayment: input.allowOverpayment,
        });
        // record() returns a ValidationResult — an overpayment without
        // acknowledgement comes back invalid rather than throwing.
        if (!result.valid) {
          return { ok: false, message: result.issues.map((i) => i.message).join("; ") };
        }
      }
      setDialogFor(null);
      await onChanged();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Could not save this payment." };
    }
  }

  function requestDelete(payment: CustomerPayment) {
    setError(null);
    setDeleteReason("");
    setDeleteTarget(payment);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    // Money leaving the record needs a reason — the same discipline
    // every other financial delete in this codebase enforces, and
    // PaymentService.softDelete rejects an empty one regardless.
    if (!deleteReason.trim()) {
      setError("A reason is required.");
      return;
    }
    setDeleteBusy(true);
    setError(null);
    try {
      await paymentService.softDelete(deleteTarget.id, deleteReason.trim());
      await onChanged();
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this payment.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className={compact ? "" : "rounded-lg border border-border/60 bg-card p-3.5"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        {!compact && (
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Wallet className="size-3.5 text-primary" /> Payments
          </h3>
        )}
        {compact && <span />}
        {canEdit && (
          <button
            type="button"
            onClick={() => setDialogFor("new")}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-3" /> Record
          </button>
        )}
      </div>

      {error && <div className="mb-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs text-danger">{error}</div>}

      {payments.length === 0 ? (
        <EmptyState title="No payments recorded" description="Payments received against this invoice will appear here." />
      ) : (
        <ul className="max-h-48 divide-y divide-border overflow-y-auto pr-1">
          {payments.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2 py-1.5 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-foreground">{money(p.amount)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {p.paymentDate} · {formatPaymentMethod(p.method)}
                  {p.referenceNumber ? ` · ${p.referenceNumber}` : ""}
                </div>
                {p.notes && <div className="mt-0.5 text-[11px] text-muted-foreground">{p.notes}</div>}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-0.5">
                  <button type="button" onClick={() => setDialogFor(p)} aria-label="Edit payment"
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => requestDelete(p)} aria-label="Delete payment"
                    className="rounded-md p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialogFor && (
        <PaymentDialog
          invoiceTotal={invoiceTotal}
          totalPaid={totalPaid}
          payment={dialogFor === "new" ? null : dialogFor}
          onClose={() => setDialogFor(null)}
          onSubmit={handleSubmit}
        />
      )}

      <Modal open={!!deleteTarget} onClose={() => { if (!deleteBusy) setDeleteTarget(null); }} title="Delete this payment?">
        {deleteTarget && (
          <div className="space-y-3 text-sm">
            <p className="text-foreground">
              Delete this {money(deleteTarget.amount)} payment? This can be restored later.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reason (required)
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={2}
                autoFocus
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-normal normal-case text-foreground focus:border-primary focus:outline-none"
                placeholder="e.g. recorded in error…"
              />
            </label>
            {error && <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteBusy}
                className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteBusy || !deleteReason.trim()}
                className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-danger-foreground hover:bg-danger/90 disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
});
