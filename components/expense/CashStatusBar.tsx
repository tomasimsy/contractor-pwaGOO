"use client";

import type { FinancialSummaryData, PaymentSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/formatting";

export default function CashStatusBar({
  financials,
  payment,
  atRiskProjectCount = 0,
}: {
  financials: FinancialSummaryData;
  payment: PaymentSummary;
  atRiskProjectCount?: number;
}) {
  const totalExpenses =
    financials.materialCosts +
    financials.laborCosts +
    financials.subcontractorCosts +
    financials.agentCommissions +
    financials.otherExpenses +
    financials.mileageCosts;

  // Use profit from financials - single source of truth
  const profit = financials.profit;

  // Pending payouts = assigned but not yet fully paid
  const pendingPayouts = financials.subcontractorCosts - financials.subcontractorPaidToDate;

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 py-3 md:px-6 md:py-4">
        {/* Mobile: 2x2 Grid */}
        <div className="grid grid-cols-2 gap-4 md:hidden">
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Committed
            </div>
            <div className="text-lg font-bold text-gray-900 mt-1">
              {formatCurrency(pendingPayouts)}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">Payouts pending</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Pending
            </div>
            <div className="text-lg font-bold text-gray-900 mt-1">
              {formatCurrency(payment.remainingBalance)}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">From clients</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Profit
            </div>
            <div className={`text-lg font-bold mt-1 ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatCurrency(profit)}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {profit >= 0 ? "✓ Positive" : "⚠ Negative"}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              At Risk
            </div>
            <div className={`text-lg font-bold mt-1 ${atRiskProjectCount > 0 ? "text-amber-600" : "text-gray-900"}`}>
              {atRiskProjectCount}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {atRiskProjectCount === 1 ? "Project" : "Projects"}
            </div>
          </div>
        </div>

        {/* Tablet/Desktop: 4x1 Row */}
        <div className="hidden md:grid md:grid-cols-4 gap-6">
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Committed
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(pendingPayouts)}
            </div>
            <div className="text-[12px] text-gray-400 mt-1">Payouts pending</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Pending
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(payment.remainingBalance)}
            </div>
            <div className="text-[12px] text-gray-400 mt-1">From clients</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Profit
            </div>
            <div className={`text-2xl font-bold mt-1 ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatCurrency(profit)}
            </div>
            <div className="text-[12px] text-gray-400 mt-1">
              {profit >= 0 ? "✓ Positive" : "⚠ Negative"}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              At Risk
            </div>
            <div className={`text-2xl font-bold mt-1 ${atRiskProjectCount > 0 ? "text-amber-600" : "text-gray-900"}`}>
              {atRiskProjectCount} {atRiskProjectCount === 1 ? "Project" : "Projects"}
            </div>
            <div className="text-[12px] text-gray-400 mt-1">Low margin</div>
          </div>
        </div>
      </div>
    </div>
  );
}
