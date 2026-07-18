"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { FinancialSummaryData, LedgerEntry, BudgetComparison } from "@/lib/types";
import DashboardPanel from "./desktop/DashboardPanel";
import ExpenseLedger from "./ExpenseLedger";

const EXPENSE_CATEGORIES = ["material", "labor", "other"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  material: "Materials",
  labor: "Labor",
  other: "Other Expenses",
};

export default function ProjectExpensesSection({
  financials,
  ledger,
  budget,
  onAddExpense,
}: {
  financials: FinancialSummaryData;
  ledger: LedgerEntry[];
  budget?: BudgetComparison;
  onAddExpense: () => void;
}) {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterVendor, setFilterVendor] = useState<string>("all");

  const totalCost =
    financials.materialCosts +
    financials.laborCosts +
    financials.subcontractorCosts +
    financials.agentCommissions +
    financials.otherExpenses +
    financials.mileageCosts;

  // Get unique vendors for filter
  const vendors = Array.from(
    new Set(
      ledger
        .filter((e) => e.source === "expense")
        .map((e) => e.payeeLabel)
        .filter(Boolean)
    )
  ).sort();

  // Filter ledger
  const filteredLedger = ledger.filter((entry) => {
    if (filterCategory !== "all" && entry.source === "expense") {
      const category = entry.categoryLabel.toLowerCase();
      if (!category.includes(filterCategory)) return false;
    }
    if (filterVendor !== "all" && entry.payeeLabel !== filterVendor) return false;
    return true;
  });

  return (
    <DashboardPanel title="Project Expenses" accent="blue">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Summary */}
        <div className="space-y-3">
          <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Expense Summary
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Materials</span>
              <span className="text-[13px] font-semibold text-gray-900">
                {formatCurrency(financials.materialCosts)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Labor</span>
              <span className="text-[13px] font-semibold text-gray-900">
                {formatCurrency(financials.laborCosts)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Other</span>
              <span className="text-[13px] font-semibold text-gray-900">
                {formatCurrency(financials.otherExpenses)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Subcontractors</span>
              <span className="text-[13px] font-semibold text-gray-900">
                {formatCurrency(financials.subcontractorCosts)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Agents</span>
              <span className="text-[13px] font-semibold text-gray-900">
                {formatCurrency(financials.agentCommissions)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-gray-600">Mileage</span>
              <span className="text-[13px] font-semibold text-gray-900">
                {formatCurrency(financials.mileageCosts)}
              </span>
            </div>

            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-gray-900">Total</span>
                <span className="text-[13px] font-bold text-gray-900">
                  {formatCurrency(totalCost)}
                </span>
              </div>
            </div>
          </div>

          {budget && (
            <div className="border-t border-gray-200 pt-3 mt-3">
              <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Budget
              </div>
              <div className="text-[12px] text-gray-600">
                Estimate: <span className="font-semibold text-gray-900">{formatCurrency(financials.estimateTotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Filterable Ledger */}
        <div className="lg:col-span-2">
          <div className="space-y-3">
            <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">
              Transactions
            </div>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 bg-white text-[12px] px-2 focus:outline-none focus:ring-2 focus:ring-gray-900/5"
              >
                <option value="all">All categories</option>
                <option value="material">Materials</option>
                <option value="labor">Labor</option>
                <option value="other">Other</option>
              </select>

              {vendors.length > 0 && (
                <select
                  value={filterVendor}
                  onChange={(e) => setFilterVendor(e.target.value)}
                  className="h-8 rounded-lg border border-gray-200 bg-white text-[12px] px-2 focus:outline-none focus:ring-2 focus:ring-gray-900/5"
                >
                  <option value="all">All vendors</option>
                  {vendors.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={onAddExpense}
                className="h-8 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors px-3"
              >
                + Add Expense
              </button>
            </div>

            {/* Ledger */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <ExpenseLedger
                entries={filteredLedger}
                emptyLabel="No expenses match filters"
                emptyHint="Try adjusting your filters."
                maxHeight="320px"
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardPanel>
  );
}
