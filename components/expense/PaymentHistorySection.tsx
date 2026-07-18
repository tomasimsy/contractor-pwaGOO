"use client";

import { formatCurrency } from "@/lib/utils/formatting";
import DashboardPanel, { EmptyState } from "./desktop/DashboardPanel";
import type { PaymentSummary } from "@/lib/types";

export default function PaymentHistorySection({
  payment,
  onViewArchived,
}: {
  payment: PaymentSummary;
  onViewArchived?: () => void;
}) {
  return (
    <DashboardPanel
      title="Invoice & Payment History"
      accent="blue"
      action={
        onViewArchived ? (
          <button
            type="button"
            onClick={onViewArchived}
            className="text-[13px] text-gray-500 hover:text-gray-700"
          >
            View Archived
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* Invoice Summary */}
        <div className="space-y-3">
          <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">
            Invoice
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Total Contract Value</span>
              <span className="text-[13px] font-semibold text-gray-900">
                {formatCurrency(payment.totalContractAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Paid to Date</span>
              <span className={`text-[13px] font-semibold ${payment.status === 'fully_paid' ? 'text-emerald-600' : 'text-gray-900'}`}>
                {formatCurrency(payment.amountReceived)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Outstanding</span>
              <span className="text-[13px] font-semibold text-gray-900">
                {formatCurrency(payment.totalContractAmount - payment.amountReceived)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Status</span>
              <span className={`text-[12px] font-medium uppercase px-2 py-1 rounded ${
                payment.status === 'fully_paid'
                  ? 'bg-emerald-50 text-emerald-700'
                  : payment.status === 'partial'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-amber-50 text-amber-700'
              }`}>
                {payment.status === 'fully_paid' ? 'Paid' : payment.status === 'partial' ? 'Partial' : 'Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Progress */}
        <div className="border-t border-gray-200 pt-4">
          <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Payment Progress
          </div>
          <div className="space-y-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  payment.paymentPercentage >= 100
                    ? 'bg-emerald-600'
                    : payment.paymentPercentage >= 50
                      ? 'bg-blue-600'
                      : 'bg-amber-600'
                }`}
                style={{ width: `${Math.min(payment.paymentPercentage, 100)}%` }}
              />
            </div>
            <div className="text-[12px] text-gray-600 text-center">
              {payment.paymentPercentage.toFixed(0)}% Complete
            </div>
          </div>
        </div>

        {/* Empty State Fallback */}
        {payment.totalContractAmount === 0 && (
          <div className="text-center py-4">
            <div className="text-[13px] text-gray-400">No invoice data available yet.</div>
          </div>
        )}
      </div>
    </DashboardPanel>
  );
}
