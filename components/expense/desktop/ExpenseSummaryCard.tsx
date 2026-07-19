import { formatCurrency } from "@/lib/utils/formatting";
import type { BudgetComparison, FinancialSummaryData } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";

const BUDGET_KEY: Record<string, keyof BudgetComparison> = {
  Materials: "material",
  Labor: "labor",
  "Other Expenses": "other",
};

function profitTone(profitPercent: number) {
  if (profitPercent >= 20) return "text-emerald-600";
  if (profitPercent >= 10) return "text-amber-600";
  return "text-rose-600";
}

// What this project actually cost, and what's left over — separate from
// CustomerPaymentStatusCard, which answers "is the client paid up."
export default function ExpenseSummaryCard({
  financials,
  budget,
}: {
  financials: FinancialSummaryData;
  budget?: BudgetComparison;
}) {
  // Same math as before: includes mileageCosts, uses revisedTotal
  // (original + approved change orders) as the revenue baseline.
  const totalProjectCost =
    financials.materialCosts +
    financials.laborCosts +
    financials.subcontractorCosts +
    financials.agentCommissions +
    financials.otherExpenses +
    financials.mileageCosts;
  // Use profit from financials - single source of truth
  const profit = financials.profit;
  const profitPercent = financials.marginPercent;

  const costLines = [
    { label: "Materials", value: financials.materialCosts },
    { label: "Labor", value: financials.laborCosts },
    { label: "Subcontractors", value: financials.subcontractorCosts },
    { label: "Agent Commissions", value: financials.agentCommissions },
    { label: "Other Expenses", value: financials.otherExpenses },
    { label: "Mileage", value: financials.mileageCosts },
  ];

  return (
    <DashboardPanel title="Expense Summary" accent="gray">
      <div className="flex items-baseline justify-between gap-4 pb-4 mb-1 border-b border-gray-100">
        <div>
          <div className="text-[13px] text-gray-400">Total Project Cost</div>
          <div className="text-lg lg:text-xl xl:text-2xl font-semibold tracking-tight text-gray-900 mt-1.5 truncate">{formatCurrency(totalProjectCost)}</div>
        </div>
        <div className="text-right min-w-0">
          <div className="text-[13px] text-gray-400">Est. Profit</div>
          <div className={`text-lg lg:text-xl xl:text-2xl font-semibold tracking-tight mt-1.5 truncate ${profitTone(profitPercent)}`}>
            {formatCurrency(profit)}
          </div>
          <div className="text-[13px] text-gray-400 mt-1">{profitPercent.toFixed(0)}% margin</div>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {costLines.map((item) => {
          const budgetKey = BUDGET_KEY[item.label];
          const comparison = budgetKey ? budget?.[budgetKey] : undefined;
          const overBudget = comparison ? item.value - comparison.budget : 0;

          return (
            <div key={item.label} className="flex items-center justify-between py-2 gap-4">
              <div className="min-w-0">
                <div className="text-[13px] text-gray-700">{item.label}</div>
                {comparison && comparison.budget > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    Budget {formatCurrency(comparison.budget)} ·{" "}
                    <span className={overBudget > 0 ? "text-amber-600" : "text-emerald-600"}>
                      {overBudget > 0 ? "+" : ""}
                      {formatCurrency(overBudget)} {overBudget > 0 ? "over" : "under"}
                    </span>
                  </div>
                )}
              </div>
              <span className="text-[13px] tabular-nums text-gray-900 shrink-0">{formatCurrency(item.value)}</span>
            </div>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
