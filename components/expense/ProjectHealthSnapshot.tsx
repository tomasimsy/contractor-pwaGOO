"use client";

import { formatCurrency } from "@/lib/utils/formatting";
import type { FinancialSummaryData, PaymentSummary } from "@/lib/types";

export default function ProjectHealthSnapshot({
  projectTitle,
  estimateNumber,
  financials,
  payment,
  projectStatus,
  changeOrderTotal,
}: {
  projectTitle: string;
  estimateNumber: string | null;
  financials: FinancialSummaryData;
  payment: PaymentSummary;
  projectStatus: string | null;
  changeOrderTotal: number;
}) {
  const totalCost =
    financials.materialCosts +
    financials.laborCosts +
    financials.subcontractorCosts +
    financials.agentCommissions +
    financials.otherExpenses +
    financials.mileageCosts;

  const profit = financials.revisedTotal - totalCost;
  const marginPercent = financials.revisedTotal > 0 ? (profit / financials.revisedTotal) * 100 : 0;

  const marginColor =
    marginPercent >= 20 ? "text-emerald-600" : marginPercent >= 10 ? "text-amber-600" : "text-rose-600";

  const statusColor =
    payment.status === "fully_paid"
      ? "text-emerald-600"
      : payment.status === "partial"
        ? "text-blue-600"
        : "text-amber-600";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[13px] text-gray-400">
              {estimateNumber}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 truncate mt-0.5">
              {projectTitle}
            </h2>
          </div>
          {projectStatus && (
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-500 border border-gray-200 rounded px-2 py-1">
              {projectStatus}
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: 5 Columns */}
      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
        {/* Revenue */}
        <div className="min-w-0">
          <div className="text-[12px] text-gray-500 uppercase tracking-wide">Revenue</div>
          <div className="text-lg lg:text-xl font-semibold text-gray-900 mt-1 truncate">
            {formatCurrency(financials.revisedTotal)}
          </div>
          <div className="text-[12px] text-gray-400 mt-1">
            {formatCurrency(payment.amountReceived)} received
          </div>
        </div>

        {/* Expenses */}
        <div className="min-w-0">
          <div className="text-[12px] text-gray-500 uppercase tracking-wide">Expenses</div>
          <div className="text-lg lg:text-xl font-semibold text-gray-900 mt-1 truncate">
            {formatCurrency(totalCost)}
          </div>
          <div className="text-[12px] text-gray-400 mt-1">
            {financials.revisedTotal > 0 ? ((totalCost / financials.revisedTotal) * 100).toFixed(0) : 0}% of revenue
          </div>
        </div>

        {/* Profit */}
        <div className="min-w-0">
          <div className="text-[12px] text-gray-500 uppercase tracking-wide">Profit</div>
          <div className={`text-lg lg:text-xl font-semibold mt-1 truncate ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {formatCurrency(profit)}
          </div>
          <div className="text-[12px] text-gray-400 mt-1">
            {profit >= 0 ? "✓ Positive" : "⚠ Negative"}
          </div>
        </div>

        {/* Payment Status */}
        <div className="min-w-0">
          <div className="text-[12px] text-gray-500 uppercase tracking-wide">Payment</div>
          <div className={`text-lg lg:text-xl font-semibold mt-1 truncate ${statusColor}`}>
            {payment.paymentPercentage.toFixed(0)}%
          </div>
          <div className="text-[12px] text-gray-400 mt-1">
            {payment.status === "fully_paid" ? "Paid" : payment.status === "partial" ? "Partial" : "Pending"}
          </div>
        </div>

        {/* Margin */}
        <div className="min-w-0">
          <div className="text-[12px] text-gray-500 uppercase tracking-wide">Margin</div>
          <div className={`text-lg lg:text-xl font-semibold mt-1 truncate ${marginColor}`}>
            {marginPercent.toFixed(0)}%
          </div>
          <div className="text-[12px] text-gray-400 mt-1">
            {marginPercent >= 20 ? "Strong" : marginPercent >= 10 ? "Fair" : "Weak"}
          </div>
        </div>
      </div>

      {/* Footer: Invoice + Change Orders Summary */}
      <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 space-y-2 text-[12px]">
        <div className="flex items-center justify-between gap-4">
          <div className="text-gray-600">
            Invoice: <span className="font-semibold text-gray-900">{formatCurrency(payment.totalContractAmount)}</span> / {formatCurrency(payment.amountReceived)} received
            {payment.status === "fully_paid" && <span className="ml-2 text-emerald-600">✓ Paid</span>}
          </div>
        </div>
        {changeOrderTotal > 0 && (
          <div className="text-gray-600">
            Scope Changes: <span className="font-semibold text-amber-600">+{formatCurrency(changeOrderTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
