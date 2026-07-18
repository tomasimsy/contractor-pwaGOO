"use client";

import { useState, useEffect } from "react";
import { TrendingUp } from "lucide-react";
import DashboardPanel from "./desktop/DashboardPanel";
import { formatCurrency } from "@/lib/utils/formatting";
import { getCompanyExpenseAnalytics, type DateRange } from "@/lib/queries/expenses";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import type { ExpenseAnalytics } from "@/lib/types";

export default function ExpenseAnalyticsCard() {
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("all_time");

  useEffect(() => {
    const load = async () => {
      try {
        const companyId = await getCompanyId();
        const data = await getCompanyExpenseAnalytics(companyId, dateRange);
        setAnalytics(data);
      } catch (err) {
        console.error("Failed to load expense analytics:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateRange]);

  if (loading) {
    return (
      <DashboardPanel title="Expense Overview" accent="blue">
        <div className="text-[13px] text-gray-400 text-center py-6">Loading…</div>
      </DashboardPanel>
    );
  }

  if (!analytics) {
    return (
      <DashboardPanel title="Expense Overview" accent="blue">
        <div className="text-[13px] text-gray-400 text-center py-6">No data available</div>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel
      title="Expense Overview"
      accent="blue"
      action={
        <select
          value={dateRange}
          onChange={(e) => {
            setLoading(true);
            setDateRange(e.target.value as DateRange);
          }}
          className="h-8 rounded-lg border border-gray-200 bg-white text-[13px] px-2 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 transition-colors"
        >
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="all_time">All Time</option>
        </select>
      }
    >
      <div className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="min-w-0">
            <div className="text-[13px] text-gray-400">Total Expenses</div>
            <div className="text-lg lg:text-xl font-semibold text-gray-900 mt-1 truncate">
              {formatCurrency(analytics.totalExpenses)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] text-gray-400">Assigned</div>
            <div className="text-lg lg:text-xl font-semibold text-gray-900 mt-1 truncate">
              {formatCurrency(analytics.totalSubcontractorAssigned + analytics.totalAgentAssigned)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] text-gray-400">Pending Payouts</div>
            <div className="text-lg lg:text-xl font-semibold text-amber-600 mt-1 truncate">
              {formatCurrency(analytics.totalPendingPayouts)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] text-gray-400">Active Projects</div>
            <div className="text-lg lg:text-xl font-semibold text-gray-900 mt-1 truncate">
              {analytics.projectCount}
            </div>
          </div>
        </div>

        {/* Top vendors and categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
          {/* Top Vendors */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp size={14} className="text-gray-400" />
              <h4 className="text-[13px] font-semibold text-gray-700">Top Vendors</h4>
            </div>
            <div className="space-y-2">
              {analytics.topVendors.length > 0 ? (
                analytics.topVendors.map((vendor, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-[12px] text-gray-600 truncate">{vendor.name}</span>
                    <span className="text-[12px] font-semibold text-gray-900 shrink-0">
                      {formatCurrency(vendor.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-[12px] text-gray-400">No vendor data</div>
              )}
            </div>
          </div>

          {/* Top Categories */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp size={14} className="text-gray-400" />
              <h4 className="text-[13px] font-semibold text-gray-700">Top Categories</h4>
            </div>
            <div className="space-y-2">
              {analytics.topCategories.length > 0 ? (
                analytics.topCategories.map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-[12px] text-gray-600 capitalize">{cat.name}</span>
                    <span className="text-[12px] font-semibold text-gray-900">
                      {formatCurrency(cat.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-[12px] text-gray-400">No category data</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardPanel>
  );
}
