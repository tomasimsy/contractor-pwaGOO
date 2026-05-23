"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { DollarSign, TrendingUp, TrendingDown, Calendar, Wallet, Users, Receipt, CheckCircle, AlertCircle } from "lucide-react";

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
pendingSubPayments: number;
pendingAgentPayments: number;
totalRevenue: number;
monthlyRevenue: number;
totalAgentPaid: number;
overdueInvoices: number;
};


type EstimateSummary = {
  id: string;
  estimate_number: string;
  total: number;
  sub_paid: number;
  expenses: number;
  agent_paid: number;
  profit: number;
  status: string;
  client_name: string;
};

export default function FinancialDashboard() {
  const [stats, setStats] = useState<FinancialStats>({
    totalRevenue: 0,
    totalSubcontractorPaid: 0,
    totalExpenses: 0,
    totalAgentPaid: 0,
    netProfit: 0,
    profitMargin: 0,
    pendingSubPayments: 0,
    pendingAgentPayments: 0,
    overdueInvoices: 0,
    monthlyRevenue: 0,
    monthlyProfit: 0,
     estimates: 0,
    invoices: 0,
    signed: 0,
    converted: 0,
    paid: 0,
    pending: 0,
  });
  
  const [topEstimates, setTopEstimates] = useState<EstimateSummary[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"all" | "month" | "quarter" | "year">("all");

  useEffect(() => {
    loadFinancialData();
  }, [timeRange]);

  async function loadFinancialData() {
    setLoading(true);
    try {
      // Get date filters
      const now = new Date();
      let startDate = null;
      
      if (timeRange === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else if (timeRange === "quarter") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
      } else if (timeRange === "year") {
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString();
      }
      
      // Build date filter for estimates
      let estimateQuery = supabase.from("estimates").select(`
        id,
        estimate_number,
        total,
        status,
        created_at,
        clients(name)
      `);
      
      if (startDate) {
        estimateQuery = estimateQuery.gte("created_at", startDate);
      }
      
      const { data: estimates } = await estimateQuery;
      
      if (!estimates) return;
      
      // For each estimate, calculate financials
      let totalRevenue = 0;
      let totalSubPaid = 0;
      let totalExpenses = 0;
      let totalAgentPaid = 0;
      let monthlyRevenue = 0;
      let monthlyProfit = 0;
      let pendingSubPayments = 0;
      let pendingAgentPayments = 0;
      let overdueInvoices = 0;
      
      const estimateSummaries: EstimateSummary[] = [];
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      for (const est of estimates) {
        // Get invoice payments (revenue)
        const { data: invoices } = await supabase
          .from("invoices")
          .select("*, invoice_payments(amount)")
          .eq("estimate_id", est.id);
        
const revenue =
  invoices?.reduce(
    (sum: number, inv: any) =>
      sum +
      (inv.invoice_payments?.reduce(
        (s: number, p: any) => s + p.amount,
        0
      ) || 0),
    0
  ) || 0;
          
        totalRevenue += revenue;
        
        // Check if this estimate is from current month
        const estDate = new Date(est.created_at);
        if (estDate.getMonth() === currentMonth && estDate.getFullYear() === currentYear) {
          monthlyRevenue += revenue;
        }
        
        // Get subcontractor payments
        const { data: subPayments } = await supabase
          .from("subcontractor_payments")
          .select("amount")
          .eq("estimate_id", est.id);
        
        const subPaid = subPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;
        totalSubPaid += subPaid;
        
        // Get assigned subcontractor amounts to calculate pending
        const { data: assignedSubs } = await supabase
          .from("estimate_subcontractors")
          .select("amount")
          .eq("estimate_id", est.id);
        
        const subAssigned = assignedSubs?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
        pendingSubPayments += Math.max(0, subAssigned - subPaid);
        
        // Get expenses
        const { data: expenses } = await supabase
          .from("estimate_expenses")
          .select("amount")
          .eq("estimate_id", est.id);
        
        const expenseTotal = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
        totalExpenses += expenseTotal;
        
        // Get agent payments
        const { data: agentPayments } = await supabase
          .from("agent_payments")
          .select("amount")
          .eq("estimate_id", est.id);
        
        const agentPaid = agentPayments?.reduce((sum, a) => sum + a.amount, 0) || 0;
        totalAgentPaid += agentPaid;
        
        // Get assigned agent amounts for pending
        const { data: assignedAgents } = await supabase
          .from("estimate_agents")
          .select("amount")
          .eq("estimate_id", est.id);
        
        const agentAssigned = assignedAgents?.reduce((sum, a) => sum + (a.amount || 0), 0) || 0;
        pendingAgentPayments += Math.max(0, agentAssigned - agentPaid);
        
        // Calculate profit for this estimate
        const afterSubAndExpenses = revenue - subPaid - expenseTotal;
        const companyAmount = afterSubAndExpenses * 0.3;
        const agentEarnings = afterSubAndExpenses - companyAmount;
        const actualAgentPaid = agentPaid;
        const profit = revenue - subPaid - expenseTotal - actualAgentPaid;
        
        if (estDate.getMonth() === currentMonth && estDate.getFullYear() === currentYear) {
          monthlyProfit += profit;
        }
        
        // Check for overdue invoices
        const hasUnpaidInvoices = invoices?.some(inv => 
          inv.status !== "paid" && inv.due_date && new Date(inv.due_date) < new Date()
        );
        if (hasUnpaidInvoices) overdueInvoices++;
        
        estimateSummaries.push({
          id: est.id,
          estimate_number: est.estimate_number,
          total: est.total,
          sub_paid: subPaid,
          expenses: expenseTotal,
          agent_paid: agentPaid,
          profit: profit,
          status: est.status,
          client_name: est.clients?.[0]?.name || "Unknown Client",
        });
      }
      
      const netProfit = totalRevenue - totalSubPaid - totalExpenses - totalAgentPaid;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
      
setStats({
  estimates: 0,
  invoices: 0,
  signed: 0,
  converted: 0,
  paid: 0,
  pending: 0,

  totalRevenue,
  monthlyRevenue,

  totalSubcontractorPaid: totalSubPaid,
  totalAgentPaid: totalAgentPaid,

  totalExpenses,
  netProfit,
  profitMargin,

  pendingSubPayments,
  pendingAgentPayments,

  overdueInvoices,
  monthlyProfit,
});
      
      // Sort by profit and get top 5
      const sortedEstimates = [...estimateSummaries].sort((a, b) => b.profit - a.profit);
      setTopEstimates(sortedEstimates.slice(0, 5));
      
      // Get recent activities (last 5 payments)
      const { data: recentPayments } = await supabase
        .from("subcontractor_payments")
        .select("*, estimate_id, estimates(estimate_number)")
        .order("payment_date", { ascending: false })
        .limit(5);
      
      if (recentPayments) {
        setRecentActivity(recentPayments.map(p => ({
          type: "subcontractor",
          amount: p.amount,
          date: p.payment_date,
          estimate: p.estimates?.estimate_number,
        })));
      }
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="text-center py-8 text-gray-400">Loading financial data...</div>
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