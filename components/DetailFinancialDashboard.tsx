"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { DollarSign, TrendingUp, TrendingDown, Calendar, Wallet, Users, Receipt, CheckCircle, AlertCircle } from "lucide-react";

type FinancialStats = {
  totalRevenue: number;
  totalSubcontractorPaid: number;
  totalExpenses: number;
  totalAgentPaid: number;
  netProfit: number;
  profitMargin: number;
  pendingSubPayments: number;
  pendingAgentPayments: number;
  overdueInvoices: number;
  monthlyRevenue: number;
  monthlyProfit: number;
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
          .eq("estimate_id", est.id)
          .filter("invoice_payments.deleted_at", "is", null);
        
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
          .eq("estimate_id", est.id)
          .is("deleted_at", null);

        const subPaid = subPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;
        totalSubPaid += subPaid;

        // Get assigned subcontractor amounts to calculate pending
        const { data: assignedSubs } = await supabase
          .from("estimate_subcontractors")
          .select("amount")
          .eq("estimate_id", est.id)
          .is("deleted_at", null);

        const subAssigned = assignedSubs?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
        pendingSubPayments += Math.max(0, subAssigned - subPaid);

        // Get expenses
        const { data: expenses } = await supabase
          .from("estimate_expenses")
          .select("amount")
          .eq("estimate_id", est.id)
          .is("deleted_at", null);

        const expenseTotal = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
        totalExpenses += expenseTotal;

        // Get agent payments
        const { data: agentPayments } = await supabase
          .from("agent_payments")
          .select("amount")
          .eq("estimate_id", est.id)
          .is("deleted_at", null);

        const agentPaid = agentPayments?.reduce((sum, a) => sum + a.amount, 0) || 0;
        totalAgentPaid += agentPaid;

        // Get assigned agent amounts for pending
        const { data: assignedAgents } = await supabase
          .from("estimate_agents")
          .select("amount")
          .eq("estimate_id", est.id)
          .is("deleted_at", null);
        
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
        totalRevenue,
        totalSubcontractorPaid: totalSubPaid,
        totalExpenses,
        totalAgentPaid,
        netProfit,
        profitMargin,
        pendingSubPayments,
        pendingAgentPayments,
        overdueInvoices,
        monthlyRevenue,
        monthlyProfit,
      });
      
      // Sort by profit and get top 5
      const sortedEstimates = [...estimateSummaries].sort((a, b) => b.profit - a.profit);
      setTopEstimates(sortedEstimates.slice(0, 5));
      
      // Get recent activities (last 5 payments)
      const { data: recentPayments } = await supabase
        .from("subcontractor_payments")
        .select("*, estimate_id, estimates(estimate_number)")
        .is("deleted_at", null)
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
      <div className="grid grid-cols-2 gap-3">
        {/* Revenue Card */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs opacity-80">Total Revenue</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(stats.totalRevenue)}</div>
            </div>
            <DollarSign size={24} className="opacity-80" />
          </div>
          <div className="text-xs opacity-80 mt-2">
            This month: {formatCurrency(stats.monthlyRevenue)}
          </div>
        </div>
        
        {/* Profit Card */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs opacity-80">Net Profit</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(stats.netProfit)}</div>
            </div>
            <TrendingUp size={24} className="opacity-80" />
          </div>
          <div className="text-xs opacity-80 mt-2">
            Margin: {stats.profitMargin.toFixed(1)}%
          </div>
        </div>
        
        {/* Expenses Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500">Expenses</div>
              <div className="text-xl font-bold text-gray-800">{formatCurrency(stats.totalExpenses)}</div>
            </div>
            <Receipt size={20} className="text-gray-400" />
          </div>
          <div className="text-xs text-gray-400 mt-2">
            Subcontractors: {formatCurrency(stats.totalSubcontractorPaid)}
          </div>
        </div>
        
        {/* Pending Payments Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500">Pending Payments</div>
              <div className="text-xl font-bold text-amber-600">{formatCurrency(stats.pendingSubPayments + stats.pendingAgentPayments)}</div>
            </div>
            <AlertCircle size={20} className="text-amber-500" />
          </div>
          <div className="text-xs text-gray-400 mt-2">
            Subs: {formatCurrency(stats.pendingSubPayments)} | Agents: {formatCurrency(stats.pendingAgentPayments)}
          </div>
        </div>
      </div>
      
      {/* Profit vs Revenue Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="text-xs text-gray-500 mb-2">Profit vs Revenue</div>
        <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="absolute left-0 top-0 h-full bg-green-500 rounded-full"
            style={{ width: `${Math.min(100, (stats.netProfit / stats.totalRevenue) * 100)}%` }}
          />
          <div 
            className="absolute left-0 top-0 h-full bg-blue-500 rounded-full opacity-50"
            style={{ width: `${Math.min(100, (stats.monthlyProfit / stats.monthlyRevenue) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>Net Profit: {formatCurrency(stats.netProfit)}</span>
          <span>Monthly: {formatCurrency(stats.monthlyProfit)}</span>
        </div>
      </div>
      
      {/* Top Profitable Estimates */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
      </div>
      
      {/* Overdue Alert */}
      {stats.overdueInvoices > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle size={18} className="text-red-500" />
          <div className="flex-1">
            <div className="text-sm font-medium text-red-700">{stats.overdueInvoices} Overdue Invoice{stats.overdueInvoices !== 1 ? 's' : ''}</div>
            <div className="text-xs text-red-600">Client payments are past due</div>
          </div>
          <button className="text-xs text-red-600 font-medium">View →</button>
        </div>
      )}
      
      {/* Time Range Selector */}
      <div className="flex gap-2 justify-end">
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
      </div>
    </div>
  );
}