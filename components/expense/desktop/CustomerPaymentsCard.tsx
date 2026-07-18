"use client";

import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { FinancialSummaryData, InvoiceRow, PaymentSummary } from "@/lib/types";
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

export default function CustomerPaymentsCard({
  financials,
  payment,
  invoices,
}: {
  financials: FinancialSummaryData;
  payment: PaymentSummary;
  invoices: InvoiceRow[];
}) {
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
              ? `${formatCurrency(financials.estimateTotal)} + CO`
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

      {/* Payment History */}
      {invoices.length === 0 ? (
        <div className="text-[13px] text-gray-400 text-center py-4">No invoices on this project yet.</div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide mb-2">Payment History</div>
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
    </DashboardPanel>
  );
}
