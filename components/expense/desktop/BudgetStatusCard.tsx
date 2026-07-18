import { AlertCircle, AlertTriangle } from "lucide-react";
import DashboardPanel from "./DashboardPanel";
import { formatCurrency } from "@/lib/utils/formatting";
import type { BudgetAlert } from "@/lib/types";

export default function BudgetStatusCard({ alerts }: { alerts: BudgetAlert[] }) {
  if (alerts.length === 0) {
    return (
      <DashboardPanel title="Budget Status" accent="emerald">
        <div className="flex items-center gap-3 py-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <span className="text-lg">✓</span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">All budgets on track</p>
            <p className="text-xs text-gray-500">No categories exceeding 75% of budget</p>
          </div>
        </div>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title="Budget Status" accent="amber">
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.category}
            className={`rounded-lg p-3 border-l-4 ${
              alert.isCritical
                ? "bg-red-50 border-red-400"
                : "bg-amber-50 border-amber-400"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {alert.isCritical ? (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  alert.isCritical ? "text-red-900" : "text-amber-900"
                }`}>
                  {alert.category.charAt(0).toUpperCase() + alert.category.slice(1)} Budget
                  {alert.isCritical ? " — CRITICAL" : " — Warning"}
                </p>
                <div className="mt-1 text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Budget:</span>
                    <span className="font-medium">{formatCurrency(alert.budget)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Spent:</span>
                    <span className="font-medium">{formatCurrency(alert.actual)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overage:</span>
                    <span className={`font-medium ${
                      alert.isCritical ? "text-red-600" : "text-amber-600"
                    }`}>
                      {formatCurrency(alert.overageAmount)} ({alert.overagePercent.toFixed(0)}%)
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      alert.isCritical ? "bg-red-500" : "bg-amber-500"
                    }`}
                    style={{
                      width: `${Math.min(alert.overagePercent, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}
