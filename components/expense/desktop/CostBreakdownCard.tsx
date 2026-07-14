import { formatCurrency } from "@/lib/utils/formatting";
import type { BudgetComparison, FinancialSummaryData } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";

const BUDGET_KEY: Record<string, keyof BudgetComparison> = {
  Materials: "material",
  Labor: "labor",
  "Other Expenses": "other",
};

export default function CostBreakdownCard({
  data,
  budget,
}: {
  data: FinancialSummaryData;
  /** Budget vs. actual per category, from getBudgetComparison — optional
   * since a project with no estimate_items has nothing to compare against. */
  budget?: BudgetComparison;
}) {
  const lineItems = [
    { label: "Materials", value: data.materialCosts },
    { label: "Labor", value: data.laborCosts },
    { label: "Subcontractors", value: data.subcontractorCosts },
    { label: "Agent Commissions", value: data.agentCommissions },
    { label: "Other Expenses", value: data.otherExpenses },
    { label: "Mileage", value: data.mileageCosts },
  ];
  const total = lineItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <DashboardPanel title="Project Cost">
      <div className="space-y-2">
        {lineItems.map((item) => {
          const budgetKey = BUDGET_KEY[item.label];
          const comparison = budgetKey ? budget?.[budgetKey] : undefined;
          const overBudget = comparison ? item.value - comparison.budget : 0;

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{item.label}</span>
                <span className="font-mono font-semibold text-slate-700">{formatCurrency(item.value)}</span>
              </div>
              {comparison && comparison.budget > 0 && (
                <div className="flex items-center justify-between text-[11px] mt-0.5">
                  <span className="text-slate-400">Budget: {formatCurrency(comparison.budget)}</span>
                  <span className={overBudget > 0 ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold"}>
                    {overBudget > 0 ? "+" : ""}
                    {formatCurrency(overBudget)} {overBudget > 0 ? "over" : "under"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 font-bold">
          <span className="text-slate-700">Total Project Cost</span>
          <span className="font-mono text-slate-900">{formatCurrency(total)}</span>
        </div>
      </div>
    </DashboardPanel>
  );
}
