"use client";

/**
 * "Convert to Invoice" is a single service call
 * (InvoiceService.createFromEstimate) — the estimate -> invoice
 * conversion formula (which line items, which approved change orders
 * get folded in) lives entirely inside that service. This button does
 * not decide what the invoice looks like; it only triggers the
 * conversion and hands the result to its caller (a page) to navigate
 * to the new invoice.
 */
import { useState } from "react";
import { useServices } from "../../lib/services-context";
import type { Estimate, Invoice } from "../../lib/services";

export function ConvertToInvoiceButton({ estimate, onConverted }: { estimate: Estimate; onConverted: (invoice: Invoice) => void }) {
  const { invoiceService } = useServices();
  const [converting, setConverting] = useState(false);

  if (estimate.status !== "approved") return null;

  return (
    <button
      type="button"
      disabled={converting}
      onClick={async () => {
        setConverting(true);
        try {
          const today = new Date().toISOString().slice(0, 10);
          const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const invoice = await invoiceService.createFromEstimate(estimate.id, { issueDate: today, dueDate });
          onConverted(invoice);
        } finally {
          setConverting(false);
        }
      }}
    >
      {converting ? "Converting..." : "Convert to Invoice"}
    </button>
  );
}
