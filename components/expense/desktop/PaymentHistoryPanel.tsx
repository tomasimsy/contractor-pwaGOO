import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { InvoiceRow } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";
import { EmptyState } from "./DashboardPanel";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Not paid / partial / fully paid per-invoice, computed from amounts
 * — same reasoning as derivePaymentStatus, since `status` and
 * `payment_status` on invoices are free text with an unconfirmed
 * value domain. */
function invoiceTone(invoice: InvoiceRow) {
  if (invoice.amount_paid <= 0) return { label: "Unpaid", icon: Clock, text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" };
  if (invoice.amount_paid >= invoice.total) return { label: "Paid", icon: CheckCircle2, text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" };
  return { label: "Partial", icon: Clock, text: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" };
}

/** Real invoice history, now that `invoices` is confirmed as the
 * payment source of truth — one row per invoice, each showing what
 * was billed vs. paid vs. remaining. */
export default function PaymentHistoryPanel({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <DashboardPanel title="Payment History" accent="emerald">
      {invoices.length === 0 ? (
        <EmptyState message="No invoices on this project yet." />
      ) : (
        <div className="divide-y divide-gray-100">
          {invoices.map((invoice) => {
            const tone = invoiceTone(invoice);
            const Icon = invoice.overdue ? AlertCircle : tone.icon;
            return (
              <div key={invoice.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center gap-3">
                <Icon size={14} className={`shrink-0 ${invoice.overdue ? "text-rose-600" : tone.text}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] text-gray-900">
                      {invoice.invoice_number || "Invoice"}
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-gray-900">
                      {formatCurrency(invoice.amount_paid)} / {formatCurrency(invoice.total)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                    <span className={invoice.overdue ? "text-rose-600 font-medium" : ""}>
                      {invoice.overdue ? "Overdue" : tone.label}
                    </span>
                    {invoice.issue_date && <span>· Issued {formatDate(invoice.issue_date)}</span>}
                    {invoice.due_date && <span>· Due {formatDate(invoice.due_date)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardPanel>
  );
}
