"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  AlertCircle,
} from "lucide-react";

type FinancialStats = {
  estimates: number;
  invoices: number;
  signed: number;
  converted: number;
  paid: number;
  pending: number;

  netProfit: number;
  monthlyProfit: number;
  profitMargin: number;

  totalExpenses: number;
  totalSubcontractorPaid: number;
  totalAgentPaid: number;

  pendingSubPayments: number;
  pendingAgentPayments: number;

  totalRevenue: number;
  monthlyRevenue: number;

  overdueInvoices: number;
};

export default function FinancialDashboard() {
  const [stats, setStats] = useState<FinancialStats>({
    estimates: 0,
    invoices: 0,
    signed: 0,
    converted: 0,
    paid: 0,
    pending: 0,

    netProfit: 0,
    monthlyProfit: 0,
    profitMargin: 0,

    totalExpenses: 0,
    totalSubcontractorPaid: 0,
    totalAgentPaid: 0,

    pendingSubPayments: 0,
    pendingAgentPayments: 0,

    totalRevenue: 0,
    monthlyRevenue: 0,

    overdueInvoices: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFinancialData();
  }, []);

  async function loadFinancialData() {
    setLoading(true);

    try {
      // -----------------------------
      // 1. FETCH ESTIMATES (LIMITED)
      // -----------------------------
      const { data: estimates } = await supabase
        .from("estimates")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!estimates) return;

      const estimateIds = estimates.map((e) => e.id);

      // -----------------------------
      // 2. BATCH ALL RELATED DATA
      // -----------------------------
      const [
        invoicesRes,
        subRes,
        expenseRes,
        agentRes,
        assignedSubsRes,
        assignedAgentsRes,
      ] = await Promise.all([
        supabase
          .from("invoices")
          .select("estimate_id, status, due_date, invoice_payments(amount)"),

        supabase
          .from("subcontractor_payments")
          .select("estimate_id, amount"),

        supabase
          .from("estimate_expenses")
          .select("estimate_id, amount"),

        supabase
          .from("agent_payments")
          .select("estimate_id, amount"),

        supabase
          .from("estimate_subcontractors")
          .select("estimate_id, amount"),

        supabase
          .from("estimate_agents")
          .select("estimate_id, amount"),
      ]);

      const invoices = invoicesRes.data || [];
      const subPayments = subRes.data || [];
      const expenses = expenseRes.data || [];
      const agentPayments = agentRes.data || [];
      const assignedSubs = assignedSubsRes.data || [];
      const assignedAgents = assignedAgentsRes.data || [];

      // -----------------------------
      // 3. GROUP BY ESTIMATE ID
      // -----------------------------
      const groupBy = (arr: any[]) =>
        arr.reduce((acc: any, item: any) => {
          const id = item.estimate_id;
          if (!acc[id]) acc[id] = [];
          acc[id].push(item);
          return acc;
        }, {});

      const invoicesByEst = groupBy(invoices);
      const subByEst = groupBy(subPayments);
      const expByEst = groupBy(expenses);
      const agentByEst = groupBy(agentPayments);
      const assignedSubsByEst = groupBy(assignedSubs);
      const assignedAgentsByEst = groupBy(assignedAgents);

      // -----------------------------
      // 4. CALCULATE STATS IN MEMORY
      // -----------------------------
      let totalRevenue = 0;
      let totalSubPaid = 0;
      let totalExpenses = 0;
      let totalAgentPaid = 0;
      let pendingSubPayments = 0;
      let pendingAgentPayments = 0;
      let overdueInvoices = 0;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let monthlyRevenue = 0;
      let monthlyProfit = 0;

      for (const est of estimates) {
        const estInvoices = invoicesByEst[est.id] || [];
        const estSubs = subByEst[est.id] || [];
        const estExpenses = expByEst[est.id] || [];
        const estAgents = agentByEst[est.id] || [];
        const estAssignedSubs = assignedSubsByEst[est.id] || [];
        const estAssignedAgents = assignedAgentsByEst[est.id] || [];

        const revenue =
          estInvoices.reduce((sum: number, inv: any) => {
            const payments =
              inv.invoice_payments?.reduce(
                (s: number, p: any) => s + p.amount,
                0
              ) || 0;
            return sum + payments;
          }, 0) || 0;

        totalRevenue += revenue;

        const estDate = new Date(est.created_at);

        if (
          estDate.getMonth() === currentMonth &&
          estDate.getFullYear() === currentYear
        ) {
          monthlyRevenue += revenue;
        }

        const subPaid =
          estSubs.reduce((sum: number, s: any) => sum + s.amount, 0) || 0;

        const expenseTotal =
          estExpenses.reduce((sum: number, e: any) => sum + e.amount, 0) || 0;

        const agentPaid =
          estAgents.reduce((sum: number, a: any) => sum + a.amount, 0) || 0;

        totalSubPaid += subPaid;
        totalExpenses += expenseTotal;
        totalAgentPaid += agentPaid;

        const subAssigned =
          estAssignedSubs.reduce(
            (sum: number, s: any) => sum + (s.amount || 0),
            0
          ) || 0;

        const agentAssigned =
          estAssignedAgents.reduce(
            (sum: number, a: any) => sum + (a.amount || 0),
            0
          ) || 0;

        pendingSubPayments += Math.max(0, subAssigned - subPaid);
        pendingAgentPayments += Math.max(0, agentAssigned - agentPaid);

        const profit = revenue - subPaid - expenseTotal - agentPaid;

        if (
          estDate.getMonth() === currentMonth &&
          estDate.getFullYear() === currentYear
        ) {
          monthlyProfit += profit;
        }

        const hasOverdue = estInvoices.some(
          (inv: any) =>
            inv.status !== "paid" &&
            inv.due_date &&
            new Date(inv.due_date) < new Date()
        );

        if (hasOverdue) overdueInvoices++;
      }

      const netProfit =
        totalRevenue - totalSubPaid - totalExpenses - totalAgentPaid;

      const profitMargin =
        totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      // -----------------------------
      // 5. SET STATE
      // -----------------------------
      setStats({
        estimates: estimates.length,
        invoices: invoices.length,
        signed: 0,
        converted: 0,
        paid: 0,
        pending: 0,

        totalRevenue,
        monthlyRevenue,

        totalSubcontractorPaid: totalSubPaid,
        totalAgentPaid,

        totalExpenses,
        netProfit,
        profitMargin,

        pendingSubPayments,
        pendingAgentPayments,

        overdueInvoices,
        monthlyProfit,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="text-center py-8 text-gray-400">
          Loading financial data...
        </div>
      </div>
    );
  }

  return (
 
    <div className="space-y-4">
      {/* Summary Cards */}
<div className="grid grid-cols-2 gap-2">
  {/* Revenue Card */}
  <div className="rounded-lg bg-gradient-to-br from-green-500 to-green-600 p-2.5 text-white shadow-sm">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] opacity-80">Revenue</div>
        <div className="text-sm font-bold mt-0.5">
          {formatCurrency(stats.totalRevenue)}
        </div>
      </div>
      <DollarSign size={18} className="opacity-70" />
    </div>
    <div className="text-[10px] opacity-70 mt-1">
      Month: {formatCurrency(stats.monthlyRevenue)}
    </div>
  </div>

  {/* Profit Card */}
  <div className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-2.5 text-white shadow-sm">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] opacity-80">Profit</div>
        <div className="text-sm font-bold mt-0.5">
          {formatCurrency(stats.netProfit)}
        </div>
      </div>
      <TrendingUp size={18} className="opacity-70" />
    </div>
    <div className="text-[10px] opacity-70 mt-1">
      Margin: {stats.profitMargin.toFixed(1)}%
    </div>
  </div>

  {/* Expenses Card */}
  <div className="rounded-lg bg-white p-2.5 shadow-sm border border-gray-100">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] text-gray-500">Expenses</div>
        <div className="text-sm font-bold text-gray-800 mt-0.5">
          {formatCurrency(stats.totalExpenses)}
        </div>
      </div>
      <Receipt size={16} className="text-gray-400" />
    </div>
    <div className="text-[10px] text-gray-400 mt-1">
      Subs: {formatCurrency(stats.totalSubcontractorPaid)}
    </div>
  </div>

  {/* Pending Card */}
  <div className="rounded-lg bg-white p-2.5 shadow-sm border border-gray-100">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] text-gray-500">Pending</div>
        <div className="text-sm font-bold text-amber-600 mt-0.5">
          {formatCurrency(stats.pendingSubPayments + stats.pendingAgentPayments)}
        </div>
      </div>
      <AlertCircle size={16} className="text-amber-500" />
    </div>
    <div className="text-[10px] text-gray-400 mt-1">
      Subs: {formatCurrency(stats.pendingSubPayments)} | Agents: {formatCurrency(stats.pendingAgentPayments)}
    </div>
  </div>
</div>
      
      {/* Overview & Profit vs Revenue Bar */}
<div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
  <div className="mb-2 flex items-center justify-between">
    <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
      Overview
    </div>

    <div className="text-[10px] text-gray-400">
      Revenue vs Profit
    </div>
  </div>

  <div className="grid grid-cols-2 gap-2">
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2">
      <div className="text-[10px] text-emerald-600">Estimates</div>

      <div className="text-lg font-semibold text-emerald-900 leading-tight">
        {stats.estimates}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-emerald-700">
        <span>Signed: {stats.signed}</span>
        <span>Converted: {stats.converted}</span>
      </div>
    </div>

    <div className="rounded-lg border border-blue-100 bg-blue-50 p-2">
      <div className="text-[10px] text-blue-600">Invoices</div>

      <div className="text-lg font-semibold text-blue-900 leading-tight">
        {stats.invoices}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-blue-700">
        <span>Paid: {stats.paid}</span>
        <span>Pending: {stats.pending}</span>
      </div>
    </div>
  </div>

  <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
    <div className="mb-1 flex justify-between text-[10px] text-gray-600">
      <span>Net: {formatCurrency(stats.netProfit)}</span>
      <span>Month: {formatCurrency(stats.monthlyProfit)}</span>
    </div>

    <div className="relative h-2 overflow-hidden rounded-full bg-gray-200">
      <div
        className="absolute left-0 top-0 h-full rounded-full bg-gray-800"
        style={{
          width: `${Math.min(
            100,
            (stats.netProfit / stats.totalRevenue) * 100
          )}%`,
        }}
      />

      <div
        className="absolute left-0 top-0 h-full rounded-full bg-gray-500 opacity-60"
        style={{
          width: `${Math.min(
            100,
            (stats.monthlyProfit / stats.monthlyRevenue) * 100
          )}%`,
        }}
      />
    </div>
  </div>
</div>
      
      {/* Top Profitable Estimates */}
      {/* <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">📊 Top Profitable Estimates</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {topEstimates.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">No estimates yet</div>
          ) : (
            topEstimates.map((est, idx) => (
              <div key={est.id} className="px-4 py-3 flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium text-gray-800">{est.client_name || "No client"}</div>
                  <div className="text-xs text-gray-400">#{est.estimate_number?.slice(0, 8)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-green-600">{formatCurrency(est.profit)}</div>
                  <div className="text-xs text-gray-400">Revenue: {formatCurrency(est.total)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div> */}
      
      {/* Overdue Alert */}
      {/* {stats.overdueInvoices > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle size={18} className="text-red-500" />
          <div className="flex-1">
            <div className="text-sm font-medium text-red-700">{stats.overdueInvoices} Overdue Invoice{stats.overdueInvoices !== 1 ? 's' : ''}</div>
            <div className="text-xs text-red-600">Client payments are past due</div>
          </div>
          <button className="text-xs text-red-600 font-medium">View →</button>
        </div>
      )}
       */}
      {/* Time Range Selector */}
      {/* <div className="flex gap-2 justify-end">
        <button
          onClick={() => setTimeRange("all")}
          className={`px-3 py-1 rounded-lg text-xs transition ${timeRange === "all" ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          All Time
        </button>
        <button
          onClick={() => setTimeRange("month")}
          className={`px-3 py-1 rounded-lg text-xs transition ${timeRange === "month" ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          This Month
        </button>
        <button
          onClick={() => setTimeRange("quarter")}
          className={`px-3 py-1 rounded-lg text-xs transition ${timeRange === "quarter" ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          This Quarter
        </button>
        <button
          onClick={() => setTimeRange("year")}
          className={`px-3 py-1 rounded-lg text-xs transition ${timeRange === "year" ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          This Year
        </button>
      </div> */}
    </div>
  );
}