"use client";

import { useState } from "react";
import { CheckCircle2, Clock, AlertCircle, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/utils/formatting";
import { deleteCustomerPayment } from "@/lib/queries/customerPayments";
import type { FinancialSummaryData, InvoiceRow, PaymentSummary, InvoicePaymentRow } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";

const PAYMENT_LABEL: Record<PaymentSummary["status"], string> = {
  not_paid: "Not paid",
  partial: "Partial payment",
  fully_paid: "Fully paid",
};

const PAYMENT_TONE: Record<PaymentSummary["status"], string> = {
  not_paid: "text-amber-600",
  partial: "text-blue-600",
  fully_paid: "text-emerald-600",
};

const PAYMENT_BAR: Record<PaymentSummary["status"], string> = {
  not_paid: "bg-amber-500",
  partial: "bg-blue-500",
  fully_paid: "bg-emerald-500",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function invoiceStatus(invoice: InvoiceRow) {
  if (invoice.amount_paid <= 0) return { label: "Unpaid", icon: Clock, text: "text-amber-600" };
  if (invoice.amount_paid >= invoice.total) return { label: "Paid", icon: CheckCircle2, text: "text-emerald-600" };
  return { label: "Partial", icon: Clock, text: "text-blue-600" };
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  check: "Check",
  credit_card: "Credit Card",
  cash: "Cash",
  zelle: "Zelle",
  wire: "Wire Transfer",
  ach: "ACH",
  other: "Other",
};

export default function CustomerPaymentsCard({
  financials,
  payment,
  invoices,
  payments = [],
  onPaymentDeleted,
}: {
  financials: FinancialSummaryData;
  payment: PaymentSummary;
  invoices: InvoiceRow[];
  payments?: InvoicePaymentRow[];
  onPaymentDeleted?: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeletePayment(paymentId: string, amount: number) {
    if (!window.confirm(`Delete payment of ${formatCurrency(amount)}?`)) {
      return;
    }

    setDeletingId(paymentId);
    try {
      await deleteCustomerPayment(paymentId);
      toast.success("Payment deleted");
      onPaymentDeleted?.();
    } catch (err: any) {
      console.error("Failed to delete payment:", err);
      toast.error(err.message || "Failed to delete payment");
    } finally {
      setDeletingId(null);
    }
  }
  return (
    <DashboardPanel title="Customer Payments" accent="emerald">
      {/* Summary Section */}
      <div className="grid grid-cols-3 gap-4 pb-4 mb-4 border-b border-gray-100">
        <div className="min-w-0">
          <div className="text-[12px] text-gray-400 uppercase tracking-wide">Total</div>
          <div className="text-lg font-semibold text-gray-900 mt-1 truncate">
            {formatCurrency(financials.revisedTotal)}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {financials.approvedChangeOrderTotal !== 0
              ? `${formatCurrency(financials.estimateTotal - financials.approvedChangeOrderTotal)} + CO`
              : "Original estimate"}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[12px] text-gray-400 uppercase tracking-wide">Paid</div>
          <div className={`text-lg font-semibold mt-1 truncate ${PAYMENT_TONE[payment.status]}`}>
            {formatCurrency(payment.amountReceived)}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {payment.paymentPercentage.toFixed(0)}% · {PAYMENT_LABEL[payment.status]}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[12px] text-gray-400 uppercase tracking-wide">Remaining</div>
          <div className={`text-lg font-semibold mt-1 truncate ${payment.remainingBalance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {formatCurrency(payment.remainingBalance)}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {payment.remainingBalance > 0 ? "Outstanding" : "Complete"}
          </div>
        </div>
      </div>

      {/* Payment Progress Bar */}
      <div className="pb-4 mb-4 border-b border-gray-100">
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${PAYMENT_BAR[payment.status]}`} style={{ width: `${payment.paymentPercentage}%` }} />
        </div>
        <div className="text-[12px] text-gray-500 mt-2">
          {formatCurrency(payment.amountReceived)} of {formatCurrency(payment.totalContractAmount)} received
        </div>
      </div>

      {/* Invoices Summary */}
      {invoices.length === 0 ? (
        <div className="text-[13px] text-gray-400 text-center py-4">No invoices on this project yet.</div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto pb-4 mb-4 border-b border-gray-100">
          <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide mb-2">Invoices</div>
          {invoices.map((invoice) => {
            const status = invoiceStatus(invoice);
            const Icon = invoice.overdue ? AlertCircle : status.icon;

            return (
              <div key={invoice.id} className="flex items-start gap-2 p-2 rounded hover:bg-gray-50">
                <Icon size={14} className={`shrink-0 mt-0.5 ${invoice.overdue ? "text-rose-600" : status.text}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[12px] font-medium text-gray-900">
                      {invoice.invoice_number || "Invoice"}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-gray-900">
                      {formatCurrency(invoice.amount_paid)} / {formatCurrency(invoice.total)}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1">
                    <span className={invoice.overdue ? "text-rose-600 font-medium" : "text-gray-600"}>
                      {invoice.overdue ? "Overdue" : status.label}
                    </span>
                    {invoice.issue_date && <span>• Issued {formatDate(invoice.issue_date)}</span>}
                    {invoice.due_date && <span>• Due {formatDate(invoice.due_date)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment History with Delete */}
      <div>
        <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide mb-2">Payment Records</div>
        {payments.length === 0 ? (
          <div className="text-[13px] text-gray-400 text-center py-4">No payments recorded yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left px-2 py-1.5 font-medium text-gray-700">Date</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-700">Method</th>
                  <th className="text-right px-2 py-1.5 font-medium text-gray-700">Amount</th>
                  <th className="text-center px-2 py-1.5 font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-1.5 text-gray-900">
                      {p.payment_date ? new Date(p.payment_date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-"}
                    </td>
                    <td className="px-2 py-1.5 text-gray-600">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {PAYMENT_METHOD_LABELS[p.method] || p.method}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-gray-900">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => handleDeletePayment(p.id, p.amount)}
                        disabled={deletingId === p.id}
                        className="inline-flex items-center gap-1 px-2 py-1 text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[10px]"
                        title="Delete payment"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardPanel>
  );
}
