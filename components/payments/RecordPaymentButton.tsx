"use client";

/**
 * "Receive Payment" entry point for one invoice row on the invoices
 * list. Opens the same PaymentDialog the invoice detail page uses and
 * writes through the same recordInvoicePayment helper.
 *
 * The balance is re-read from PaymentService.getSummaryForInvoice when
 * the dialog opens (not taken from the list's cached figures), so the
 * dialog can't show a balance that another user or tab has already
 * paid down.
 */
import { useState } from "react";
import { Wallet } from "lucide-react";
import { PaymentDialog } from "./PaymentDialog";
import { recordInvoicePayment } from "./recordInvoicePayment";
import { useServices } from "@/components/providers/ServicesProvider";

export function RecordPaymentButton({
  invoiceId,
  companyId,
  invoiceTotal,
  onRecorded,
  variant = "solid",
  className = "",
}: {
  invoiceId: string;
  companyId: string;
  invoiceTotal: number;
  /** Parent reloads its list so status, balance and the Paid/Unpaid badge stay in sync. */
  onRecorded: () => Promise<void> | void;
  /** "solid" is the button; "link" is a text action for dense tables. */
  variant?: "solid" | "link";
  className?: string;
}) {
  const { paymentService } = useServices();
  const [opening, setOpening] = useState(false);
  const [open, setOpen] = useState(false);
  const [totalPaid, setTotalPaid] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen(e: React.MouseEvent) {
    // The button sits inside clickable rows/cards — don't let the click navigate.
    e.preventDefault();
    e.stopPropagation();
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      const summary = await paymentService.getSummaryForInvoice(invoiceId);
      setTotalPaid(summary.totalPaid);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this invoice's balance.");
    } finally {
      setOpening(false);
    }
  }

  async function handleSubmit(input: {
    amount: number; method: string; paymentDate: string;
    referenceNumber?: string; notes?: string; allowOverpayment: boolean;
  }): Promise<{ ok: boolean; message?: string }> {
    try {
      const result = await recordInvoicePayment(paymentService, {
        companyId,
        invoiceId,
        ...input,
      });
      if (!result.ok) return result;
      setOpen(false);
      await onRecorded();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Could not save this payment." };
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={opening}
        title={error ?? undefined}
        className={
          variant === "link"
            ? `whitespace-nowrap text-[13px] font-semibold text-primary hover:underline disabled:opacity-50 ${className}`
            : `inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 ${className}`
        }
      >
        {variant === "solid" && <Wallet className="size-3" />}
        {opening ? "Loading…" : "Receive Payment"}
      </button>

      {/* The dialog is a child of a clickable row/card in the React tree,
          so its clicks and key presses would bubble up and navigate to the
          invoice. Stop them here; the dialog itself is position:fixed, so
          this wrapper adds no layout. */}
      {open && (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <PaymentDialog
            invoiceTotal={invoiceTotal}
            totalPaid={totalPaid}
            payment={null}
            onClose={() => setOpen(false)}
            onSubmit={handleSubmit}
          />
        </div>
      )}
    </>
  );
}
