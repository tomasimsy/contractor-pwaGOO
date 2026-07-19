"use client";

import { formatCurrency } from "@/lib/utils/formatting";
import type { InvoicePaymentStatus } from "@/lib/queries/customerPayments";

interface PaymentStatusCardProps {
  invoiceTotal: number;
  totalPaid: number;
  remainingBalance: number;
  status: InvoicePaymentStatus;
  onReceivePaymentClick?: () => void;
}

const STATUS_COLORS: Record<InvoicePaymentStatus, { bg: string; text: string; label: string }> = {
  unpaid: { bg: "bg-rose-50", text: "text-rose-700", label: "Unpaid" },
  partial: { bg: "bg-amber-50", text: "text-amber-700", label: "Partial" },
  paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Paid" },
  overpaid: { bg: "bg-blue-50", text: "text-blue-700", label: "Overpaid" },
};

export default function PaymentStatusCard({
  invoiceTotal,
  totalPaid,
  remainingBalance,
  status,
  onReceivePaymentClick,
}: PaymentStatusCardProps) {
  const colors = STATUS_COLORS[status];
  const paidPercentage = invoiceTotal > 0 ? (totalPaid / invoiceTotal) * 100 : 0;

  return (
    <div className={`rounded-lg border p-5 ${colors.bg}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={`text-sm font-semibold ${colors.text}`}>Payment Status</h3>
          <p className={`text-xs ${colors.text} opacity-75 mt-0.5`}>{colors.label}</p>
        </div>
        {onReceivePaymentClick && (
          <button
            onClick={onReceivePaymentClick}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${
              status === "paid"
                ? "bg-gray-200 text-gray-600 cursor-default"
                : "bg-white text-emerald-600 hover:bg-emerald-50 transition-colors"
            }`}
            disabled={status === "paid"}
          >
            {status === "paid" ? "Paid" : "Receive Payment"}
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-end gap-2 mb-2">
          <div className="flex-1">
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  status === "overpaid"
                    ? "bg-blue-500"
                    : status === "paid"
                      ? "bg-emerald-500"
                      : status === "partial"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                }`}
                style={{ width: `${Math.min(paidPercentage, 100)}%` }}
              />
            </div>
          </div>
          <span className="text-[12px] font-semibold text-gray-600 w-10 text-right">
            {Math.min(Math.round(paidPercentage), 100)}%
          </span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <p className="text-gray-600 opacity-75">Invoice Total</p>
          <p className="font-semibold text-gray-900 mt-0.5">{formatCurrency(invoiceTotal)}</p>
        </div>
        <div>
          <p className="text-gray-600 opacity-75">Paid</p>
          <p className="font-semibold text-emerald-600 mt-0.5">{formatCurrency(totalPaid)}</p>
        </div>
        <div>
          <p className="text-gray-600 opacity-75">Remaining</p>
          <p
            className={`font-semibold mt-0.5 ${
              remainingBalance <= 0 ? "text-blue-600" : "text-rose-600"
            }`}
          >
            {formatCurrency(Math.max(remainingBalance, 0))}
          </p>
        </div>
      </div>

      {/* Status Message */}
      {status === "overpaid" && (
        <p className="text-[12px] text-blue-600 mt-3 bg-blue-100/50 rounded px-2 py-1">
          💙 Overpaid by {formatCurrency(Math.abs(remainingBalance))}
        </p>
      )}
      {status === "partial" && (
        <p className="text-[12px] text-amber-600 mt-3 bg-amber-100/50 rounded px-2 py-1">
          ⏱️ {formatCurrency(remainingBalance)} remaining to be paid
        </p>
      )}
      {status === "unpaid" && (
        <p className="text-[12px] text-rose-600 mt-3 bg-rose-100/50 rounded px-2 py-1">
          ⚠️ Payment not yet received
        </p>
      )}
    </div>
  );
}
