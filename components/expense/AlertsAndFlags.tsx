"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import DashboardPanel, { EmptyState } from "./desktop/DashboardPanel";
import type { FinancialSummaryData, PaymentSummary, ProjectBundle } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/formatting";

export default function AlertsAndFlags({
  bundle,
  financials,
  payment,
}: {
  bundle: ProjectBundle;
  financials: FinancialSummaryData;
  payment: PaymentSummary;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate margin
  const totalExpenses =
    financials.materialCosts +
    financials.laborCosts +
    financials.subcontractorCosts +
    financials.agentCommissions +
    financials.otherExpenses +
    financials.mileageCosts;
  const profit = financials.revisedTotal - totalExpenses;
  const marginPercent = financials.revisedTotal > 0 ? (profit / financials.revisedTotal) * 100 : 0;

  const alerts: Array<{
    type: "risk" | "overdue" | "expense";
    title: string;
    detail: string;
    severity: "warning" | "error" | "info";
  }> = [];

  // Alert 1: Low margin
  if (marginPercent < 20 && marginPercent >= 10) {
    alerts.push({
      type: "risk",
      title: "Fair Margin",
      detail: `Profit margin is ${marginPercent.toFixed(0)}% (target: 20%)`,
      severity: "warning",
    });
  } else if (marginPercent < 10) {
    alerts.push({
      type: "risk",
      title: "Low Margin Alert",
      detail: `Profit margin is only ${marginPercent.toFixed(0)}% (target: 20%)`,
      severity: "error",
    });
  }

  // Alert 2: Overdue invoice
  if (payment.status === "partial" || payment.status === "not_paid") {
    const daysOverdue = 45; // This would be calculated from invoice data
    if (daysOverdue > 30) {
      alerts.push({
        type: "overdue",
        title: "Invoice Overdue",
        detail: `Payment outstanding for ${daysOverdue} days · ${formatCurrency(payment.remainingBalance)} remaining`,
        severity: "warning",
      });
    }
  }

  // Alert 3: High expenses
  const avgExpense =
    financials.materialCosts > 0 ? financials.materialCosts / (bundle.expenses.length || 1) : 0;
  const highExpense = bundle.expenses.find((e) => e.amount > avgExpense * 2);
  if (highExpense) {
    alerts.push({
      type: "expense",
      title: "Unusual Expense",
      detail: `${highExpense.vendor || "Expense"} for ${formatCurrency(highExpense.amount)} (2x typical)`,
      severity: "info",
    });
  }

  if (alerts.length === 0) {
    return (
      <DashboardPanel title="Alerts & Flags" accent="amber">
        <EmptyState message="No alerts. Project is on track." />
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel
      title={`Alerts & Flags (${alerts.length})`}
      accent="amber"
      action={
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="md:hidden text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      }
    >
      {/* Mobile: Collapsed by default, show summary */}
      <div className="md:hidden">
        {!isExpanded && (
          <div className="text-[13px] text-gray-600">
            {alerts.length} issue{alerts.length !== 1 ? "s" : ""} · Tap to expand
          </div>
        )}

        {isExpanded && (
          <div className="space-y-3">
            {alerts.map((alert, idx) => (
              <AlertItem key={idx} alert={alert} />
            ))}
          </div>
        )}
      </div>

      {/* Tablet/Desktop: Always expanded */}
      <div className="hidden md:block space-y-3">
        {alerts.map((alert, idx) => (
          <AlertItem key={idx} alert={alert} />
        ))}
      </div>
    </DashboardPanel>
  );
}

function AlertItem({
  alert,
}: {
  alert: {
    type: string;
    title: string;
    detail: string;
    severity: "warning" | "error" | "info";
  };
}) {
  const iconColor =
    alert.severity === "error" ? "text-rose-600" : alert.severity === "warning" ? "text-amber-600" : "text-blue-600";
  const bgColor =
    alert.severity === "error" ? "bg-rose-50" : alert.severity === "warning" ? "bg-amber-50" : "bg-blue-50";

  return (
    <div className={`${bgColor} border border-gray-200 rounded-lg p-3`}>
      <div className="flex gap-3">
        <div className={`shrink-0 mt-0.5 ${iconColor}`}>
          <AlertCircle size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-semibold ${iconColor}`}>{alert.title}</div>
          <div className="text-[12px] text-gray-600 mt-0.5">{alert.detail}</div>
        </div>
      </div>
    </div>
  );
}
