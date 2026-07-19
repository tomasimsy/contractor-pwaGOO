"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { BudgetComparison, FinancialSummaryData, LedgerEntry } from "@/lib/types";
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

const CATEGORY_MAPPING: Record<string, string[]> = {
  Materials: ["material"],
  Labor: ["labor"],
  Subcontractors: ["subcontractor_payment"],
  "Agent Commissions": ["agent_payment"],
  "Other Expenses": ["other"],
  Mileage: [],
};

export default function ExpandableExpenseSummaryCard({
  financials,
  ledger,
  budget,
}: {
  financials: FinancialSummaryData;
  ledger: LedgerEntry[];
  budget?: BudgetComparison;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

  function toggleExpanded(categoryLabel: string) {
    const next = new Set(expandedCategories);
    if (next.has(categoryLabel)) {
      next.delete(categoryLabel);
    } else {
      next.add(categoryLabel);
    }
    setExpandedCategories(next);
  }

  function getCategoryDetails(categoryLabel: string): LedgerEntry[] {
    const sources = CATEGORY_MAPPING[categoryLabel] || [];
    if (sources.length === 0) return [];
    return ledger.filter((entry) => sources.includes(entry.source));
  }

  return (
    <DashboardPanel title="Expense Summary" accent="gray">
      <div className="flex items-baseline justify-between gap-4 pb-4 mb-4 border-b border-gray-100">
        <div>
          <div className="text-[13px] text-gray-400">Total Project Cost</div>
          <div className="text-lg lg:text-xl xl:text-2xl font-semibold tracking-tight text-gray-900 mt-1.5 truncate">
            {formatCurrency(totalProjectCost)}
          </div>
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
          const isExpanded = expandedCategories.has(item.label);
          const details = getCategoryDetails(item.label);
          const budgetKey = BUDGET_KEY[item.label];
          const comparison = budgetKey ? budget?.[budgetKey] : undefined;
          const overBudget = comparison ? item.value - comparison.budget : 0;
          const hasDetails = details.length > 0;

          return (
            <div key={item.label}>
              {/* Category Header */}
              <button
                type="button"
                onClick={() => toggleExpanded(item.label)}
                disabled={!hasDetails}
                className={`w-full flex items-center justify-between py-2 gap-4 ${
                  hasDetails ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
                }`}
              >
                <div className="min-w-0 text-left flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-[13px] text-gray-700">{item.label}</div>
                    {hasDetails && (
                      <span className="text-[11px] text-gray-400">({details.length})</span>
                    )}
                  </div>
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
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[13px] tabular-nums text-gray-900">{formatCurrency(item.value)}</span>
                  {hasDetails && (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && hasDetails && (
                <div className="bg-gray-50 border-t border-gray-100 divide-y divide-gray-100">
                  {details.map((entry, idx) => (
                    <div key={`${entry.id}-${idx}`} className="px-4 py-2 flex items-center justify-between gap-2 text-[12px]">
                      <div className="min-w-0 flex-1 truncate text-gray-600">
                        {entry.payeeLabel || entry.categoryLabel}
                      </div>
                      <span className="shrink-0 tabular-nums text-gray-900 font-medium">
                        {formatCurrency(entry.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
