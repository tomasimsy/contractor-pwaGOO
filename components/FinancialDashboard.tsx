"use client";

import { formatCurrency } from "@/lib/utils/formatting";
import { DollarSign, TrendingUp, Receipt, AlertCircle } from "lucide-react";
import { useFinancialStats } from "@/lib/hooks/useFinancialStats";

export default function FinancialDashboard() {
  const { stats, loading } = useFinancialStats();

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 text-center text-xs text-slate-400">
        Loading analytics grid...
      </div>
    );
  }

  return (
    <div className="space-y-3.5 p-1">
      
      {/* 4-COLUMN PREMIUM LIGHT TINT METRIC GRID */}
      <div className="grid grid-cols-2 gap-2.5">

        {/* Revenue Card — Soft Minimal Mint/Forest Green Accent */}
        <div className="rounded-xl bg-emerald-50/40 p-3 border border-emerald-100/70">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Revenue</span>
            <DollarSign size={13} className="text-emerald-700" />
          </div>
          <div className="text-sm font-semibold text-emerald-950 mt-1">
            {formatCurrency(stats.totalRevenue)}
          </div>
          <div className="text-[9px] text-emerald-600/80 mt-1.5 pt-1.5 border-t border-emerald-100/50">
            Month: <span className="font-semibold">{formatCurrency(stats.monthlyRevenue)}</span>
          </div>
        </div>

        {/* Gross Profit Card — Soft Gold Accent (before subcontractor commitments) */}
        <div className="rounded-xl bg-amber-50/30 p-3 border border-amber-100/60">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Gross</span>
            <TrendingUp size={13} className="text-amber-600" />
          </div>
          <div className="text-sm font-semibold text-amber-950 mt-1">
            {formatCurrency(stats.grossProfit)}
          </div>
          <div className="text-[9px] text-amber-600/80 mt-1.5 pt-1.5 border-t border-amber-100/40">
            Margin: <span className="font-bold">{stats.grossMargin.toFixed(1)}%</span>
          </div>
        </div>

        {/* Net Profit Card — Complementary Soft Sage Teal Accent (after all commitments) */}
        <div className="rounded-xl bg-teal-50/30 p-3 border border-teal-100/60">
          <div className="flex items-center justify-between text-teal-700">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Net</span>
            <TrendingUp size={13} className="text-teal-600" />
          </div>
          <div className="text-sm font-semibold text-teal-950 mt-1">
            {formatCurrency(stats.netProfit)}
          </div>
          <div className="text-[9px] text-teal-600/80 mt-1.5 pt-1.5 border-t border-teal-100/40">
            Margin: <span className="font-bold">{stats.netMargin.toFixed(1)}%</span>
          </div>
        </div>

        {/* Expenses Card — Muted Earth Slate Accent */}
        <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/60">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Expenses</span>
            <Receipt size={13} className="text-slate-400" />
          </div>
          <div className="text-sm font-semibold text-slate-900 mt-1">
            {formatCurrency(stats.totalExpenses)}
          </div>
          <div className="text-[9px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-200/50 truncate">
            Assigned: <span className="font-medium text-slate-600">{formatCurrency(stats.totalSubcontractorAssigned + stats.totalAgentAssigned)}</span>
          </div>
        </div>
      </div>
      
      {/* SECONDARY FLOW OVERVIEW MESHED CARDS */}
      <div className="rounded-xl border border-slate-200/60 bg-slate-50/20 p-3">
        <div className="grid grid-cols-2 gap-4 divide-x divide-slate-200/50">
          {/* Estimate Tracking Blocks */}
          <div className="">
            <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Estimates</div>
            <div className="text-base font-semibold text-slate-800 mt-0.5">{stats.estimates}</div>
            <div className="mt-1 flex gap-2 text-[9px] text-emerald-700 font-medium">
              <span className="bg-emerald-50 px-1 py-0.5 rounded">Signed: {stats.signed}</span>
              <span className="bg-slate-100 text-slate-600 px-1 py-0.5 rounded">Conv: {stats.converted}</span>
            </div>
          </div>
          {/* Invoice Tracking Blocks */}
          <div className="pl-4">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Invoices</div>
            <div className="text-base font-semibold text-slate-800 mt-0.5">{stats.invoices}</div>
            <div className="mt-1 flex gap-2 text-[9px] text-teal-700 font-medium">
              <span className="bg-teal-50 px-1 py-0.5 rounded">Paid: {stats.paid}</span>
              <span className="bg-amber-50 text-amber-700 px-1 py-0.5 rounded">Pending: {stats.pending}</span>
            </div>
          </div>
        </div>

        {/* SLIM MINIMAL PROGRESS LINE */}
        <div className="mt-3.5 pt-2.5 border-t border-slate-200/40">
          <div className="mb-1.5 flex justify-between text-[9px] text-emerald-700">
            <span>Net Growth Tracking</span>
            <span className="font-medium text-emerald-800">Month: {formatCurrency(stats.monthlyProfit)}</span>
            <span className="font-medium text-emerald-800">Net: {formatCurrency(stats.netProfit)}</span>
          </div>
          <div className="h-1 w-full rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-700 transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  stats.totalRevenue > 0 ? (stats.netProfit / stats.totalRevenue) * 100 : 0
                )}%`,
              }}
            />
          </div>
        </div>
      </div>

    </div>
  );
}