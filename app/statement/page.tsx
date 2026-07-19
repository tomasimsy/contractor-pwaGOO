"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Receipt, 
  Calendar, 
  ChevronDown, 
  ChevronUp,
  Download,
  RefreshCw,
  PieChart,
  Briefcase,
  Home,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import DesktopShell from "@/components/layout/DesktopShell";

type FinancialSummary = {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  subcontractorPaid: number;
  agentPaid: number;
  outstandingSubcontractor: number;
  outstandingAgent: number;
  pendingInvoices: number;
  completedProjects: number;
};

type ExpenseCategory = {
  category: string;
  total: number;
  count: number;
  icon: string;
};

type RecentTransaction = {
  id: string;
  type: "subcontractor" | "agent" | "expense";
  amount: number;
  description: string;
  date: string;
  estimateNumber?: string;
  projectName?: string;
};

type MonthlyTrend = {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
};

export default function FinancialDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<FinancialSummary>({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    profitMargin: 0,
    subcontractorPaid: 0,
    agentPaid: 0,
    outstandingSubcontractor: 0,
    outstandingAgent: 0,
    pendingInvoices: 0,
    completedProjects: 0,
  });
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    breakdown: true,
    transactions: true,
    trends: false,
  });
  const [timeRange, setTimeRange] = useState<"month" | "quarter" | "year">("month");

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      let startDate = new Date();
      if (timeRange === "month") {
        startDate.setMonth(now.getMonth() - 1);
      } else if (timeRange === "quarter") {
        startDate.setMonth(now.getMonth() - 3);
      } else {
        startDate.setFullYear(now.getFullYear() - 1);
      }
      const startDateStr = startDate.toISOString();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Please log in to view financial data.");
        setLoading(false);
        return;
      }

      // Get company_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) {
        setError("Company not found. Please complete your profile setup.");
        setLoading(false);
        return;
      }

      const companyId = profile.company_id;

      const [
        estimatesRes,
        subPaymentsRes,
        estSubsRes,
        agentPaymentsRes,
        estAgentsRes,
        expensesRes,
        mileageRes
      ] = await Promise.all([
        supabase.from("estimates").select("id, total, status, created_at, estimate_number").eq("company_id", companyId).is("deleted_at", null).in("status", ["completed", "converted"]).gte("created_at", startDateStr),
        supabase.from("subcontractor_payments").select(`amount, created_at, estimate_subcontractors(subcontractors(name))`).eq("company_id", companyId).is("deleted_at", null).gte("created_at", startDateStr),
        supabase.from("estimate_subcontractors").select("amount, paid_amount").eq("company_id", companyId).is("deleted_at", null),
        supabase.from("agent_payments").select(`amount, payment_date, agents(name), estimates(estimate_number)`).eq("company_id", companyId).is("deleted_at", null).gte("payment_date", startDateStr),
        supabase.from("estimate_agents").select("amount, paid_amount").eq("company_id", companyId).is("deleted_at", null),
        supabase.from("estimate_expenses").select("amount, category, description, expense_date").eq("company_id", companyId).is("deleted_at", null).gte("expense_date", startDateStr),
        supabase.from("mileage_trips").select("reimbursement, trip_date").eq("company_id", companyId).is("deleted_at", null).gte("trip_date", startDateStr)
      ]);

      if (estimatesRes.error) throw new Error(`Estimates error: ${estimatesRes.error.message}`);

      const estimates = estimatesRes.data || [];
      const totalRevenue = estimates.reduce((sum, e) => sum + (e.total || 0), 0);
      const completedProjects = estimates.length;
      const pendingInvoices = estimates.filter(e => e.status === "converted").length;

      const subPayments = subPaymentsRes.data || [];
      const subcontractorPaid = subPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      
      const estSubs = estSubsRes.data || [];
      const outstandingSubcontractor = estSubs.reduce((sum, s) => sum + ((s.amount || 0) - (s.paid_amount || 0)), 0);

      const agentPayments = agentPaymentsRes.data || [];
      const agentPaid = agentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      const estAgents = estAgentsRes.data || [];
      const outstandingAgent = estAgents.reduce((sum, a) => sum + ((a.amount || 0) - (a.paid_amount || 0)), 0);

      const expenses = expensesRes.data || [];
      const expensesCost = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

      const mileage = mileageRes.data || [];
      const mileageCost = mileage.reduce((sum, m) => sum + (m.reimbursement || 0), 0);

      const totalExpenses = expensesCost + mileageCost;
      const totalCosts = totalExpenses + subcontractorPaid + agentPaid;

      const netProfit = totalRevenue - totalCosts;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      setSummary({
        totalRevenue,
        totalExpenses,
        netProfit,
        profitMargin,
        subcontractorPaid,
        agentPaid,
        outstandingSubcontractor,
        outstandingAgent,
        pendingInvoices,
        completedProjects,
      });

      // Expense categories
      const categoryMap = new Map<string, { total: number; count: number; icon: string }>();
      expenses.forEach(exp => {
        const existing = categoryMap.get(exp.category);
        if (existing) {
          existing.total += exp.amount;
          existing.count++;
        } else {
          categoryMap.set(exp.category, { 
            total: exp.amount, 
            count: 1, 
            icon: getCategoryIcon(exp.category) 
          });
        }
      });

      setExpenseCategories(
        Array.from(categoryMap.entries())
          .map(([category, data]) => ({
            category,
            total: data.total,
            count: data.count,
            icon: data.icon,
          }))
          .sort((a, b) => b.total - a.total)
      );

      // ==================== FIX: Show ALL recent transactions (no arbitrary per‑type limits) ====================
      const transactions: RecentTransaction[] = [];

      // Add all subcontractor payments
      subPayments.forEach((p, idx) => {
        const subName = (p.estimate_subcontractors as any)?.subcontractors?.name || "Subcontractor";
        transactions.push({
          id: `sub-${p.created_at}-${idx}`,
          type: "subcontractor",
          amount: p.amount,
          description: `Payment to ${subName}`,
          date: p.created_at,
        });
      });

      // Add all agent payments
      agentPayments.forEach((p, idx) => {
        const agentName = (p.agents as any)?.name || "Agent";
        const estNum = (p.estimates as any)?.estimate_number;
        transactions.push({
          id: `agent-${p.payment_date}-${idx}`,
          type: "agent",
          amount: p.amount,
          description: `Commission to ${agentName}`,
          date: p.payment_date,
          estimateNumber: estNum,
        });
      });

      // Add all expenses
      expenses.forEach((e, idx) => {
        transactions.push({
          id: `exp-${e.expense_date}-${idx}`,
          type: "expense",
          amount: e.amount,
          description: e.description,
          date: e.expense_date,
        });
      });

      // Sort by date (newest first) and limit to the latest 30 for performance
      transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentTransactions(transactions.slice(0, 30));

      // Monthly trends (unchanged)
      const monthlyData = new Map<string, { revenue: number; expenses: number }>();
      const formatOptions: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };

      estimates.forEach(est => {
        if (est.created_at) {
          const month = new Date(est.created_at).toLocaleDateString('en-US', formatOptions);
          const existing = monthlyData.get(month) || { revenue: 0, expenses: 0 };
          existing.revenue += est.total || 0;
          monthlyData.set(month, existing);
        }
      });

      expenses.forEach(exp => {
        const month = new Date(exp.expense_date).toLocaleDateString('en-US', formatOptions);
        const existing = monthlyData.get(month) || { revenue: 0, expenses: 0 };
        existing.expenses += exp.amount;
        monthlyData.set(month, existing);
      });

      const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const trends = Array.from(monthlyData.entries())
        .map(([month, data]) => ({
          month,
          revenue: data.revenue,
          expenses: data.expenses,
          profit: data.revenue - data.expenses,
        }))
        .sort((a, b) => {
          const [aMonth, aYear] = a.month.split(' ');
          const [bMonth, bYear] = b.month.split(' ');
          return aYear !== bYear ? Number(aYear) - Number(bYear) : monthsOrder.indexOf(aMonth) - monthsOrder.indexOf(bMonth);
        })
        .slice(-6);

      setMonthlyTrends(trends);

    } catch (err: any) {
      console.error("Error loading dashboard data:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  function getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      materials: "🔨", equipment: "🔧", permits: "📋", travel: "🚗", labor: "👷", rental: "🏗️", other: "📦",
    };
    return icons[category] || "📦";
  }

  function getTransactionIcon(type: string) {
    switch (type) {
      case "subcontractor": return "👷";
      case "agent": return "🤝";
      case "expense": return "📄";
      default: return "💰";
    }
  }

  function getTransactionColor(type: string) {
    switch (type) {
      case "subcontractor": return "text-orange-600 bg-orange-50";
      case "agent": return "text-blue-600 bg-blue-50";
      case "expense": return "text-red-600 bg-red-50";
      default: return "text-gray-600 bg-gray-50";
    }
  }

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw size={32} className="animate-spin text-green-600 mx-auto mb-3" />
          <p className="text-gray-500">Loading financial data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white rounded-xl p-6 shadow-sm">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <p className="text-gray-800 font-medium mb-2">Unable to load data</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button 
            onClick={loadDashboardData}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <DesktopShell title="Statements">
    <div className="min-h-screen md:min-h-0 bg-gray-50 md:bg-transparent pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 md:static z-10 bg-white md:bg-transparent border-b border-gray-100 md:border-0 px-4 md:px-0 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-gray-800">Financial Dashboard</h1>
            <p className="text-xs text-gray-400">Real-time financial overview</p>
          </div>
          <div className="flex gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="text-xs border rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="month">Last 30 days</option>
              <option value="quarter">Last 90 days</option>
              <option value="year">Last 12 months</option>
            </select>
            <button onClick={loadDashboardData} className="p-1.5 text-gray-400 hover:text-gray-600">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-3 space-y-3">
        {/* KPI Cards Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Revenue</span>
              <DollarSign size={16} className="text-green-600" />
            </div>
            <div className="text-xl font-bold text-gray-800">{formatCurrency(summary.totalRevenue)}</div>
            <div className="text-[10px] text-gray-400 mt-1">{summary.completedProjects} projects</div>
          </div>

          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Expenses</span>
              <TrendingDown size={16} className="text-red-600" />
            </div>
            <div className="text-xl font-bold text-red-600">{formatCurrency(summary.totalExpenses)}</div>
            <div className="text-[10px] text-gray-400 mt-1">
              {summary.totalExpenses > 0 ? `${Math.round((summary.totalExpenses / summary.totalRevenue) * 100)}% of revenue` : 'No expenses'}
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 shadow-sm border border-green-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-700">Net Profit</span>
              <TrendingUp size={16} className="text-green-700" />
            </div>
            <div className={`text-xl font-bold ${summary.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatCurrency(summary.netProfit)}
            </div>
            <div className="text-[10px] text-green-600 mt-1">Margin: {summary.profitMargin.toFixed(1)}%</div>
          </div>

          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Profit Margin</span>
              <PieChart size={16} className="text-blue-600" />
            </div>
            <div className={`text-xl font-bold ${
              summary.profitMargin >= 20 ? 'text-green-600' : 
              summary.profitMargin >= 10 ? 'text-yellow-600' : 
              summary.profitMargin >= 0 ? 'text-orange-600' : 'text-red-600'
            }`}>
              {summary.profitMargin.toFixed(1)}%
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{summary.netProfit >= 0 ? 'Profitable' : 'Loss'}</div>
          </div>
        </div>

        {/* Payments Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-orange-700">Subcontractors</span>
              <Users size={14} className="text-orange-600" />
            </div>
            <div className="text-lg font-bold text-orange-700">{formatCurrency(summary.subcontractorPaid)}</div>
            <div className="text-[10px] text-orange-600 mt-1">
              Paid • {summary.outstandingSubcontractor > 0 && `${formatCurrency(summary.outstandingSubcontractor)} owed`}
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-blue-700">Agents</span>
              <Briefcase size={14} className="text-blue-600" />
            </div>
            <div className="text-lg font-bold text-blue-700">{formatCurrency(summary.agentPaid)}</div>
            <div className="text-[10px] text-blue-600 mt-1">
              Paid • {summary.outstandingAgent > 0 && `${formatCurrency(summary.outstandingAgent)} owed`}
            </div>
          </div>
        </div>

        {/* Expense Categories */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => toggleSection("breakdown")}
            className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition"
          >
            <div className="flex items-center gap-2">
              <Receipt size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Expense Breakdown</span>
              <span className="text-xs text-gray-400">({expenseCategories.length} categories)</span>
            </div>
            {expandedSections.breakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {expandedSections.breakdown && (
            <div className="p-3 space-y-2">
              {expenseCategories.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">No expenses recorded</div>
              ) : (
                expenseCategories.map((cat) => (
                  <div key={cat.category} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cat.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-700 capitalize">{cat.category}</div>
                        <div className="text-[10px] text-gray-400">{cat.count} transaction{cat.count !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-800">{formatCurrency(cat.total)}</div>
                      <div className="text-[10px] text-gray-400">
                        {summary.totalExpenses > 0 ? Math.round((cat.total / summary.totalExpenses) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold text-sm">
                <span>Total Expenses</span>
                <span className="text-red-600">{formatCurrency(summary.totalExpenses)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => toggleSection("transactions")}
            className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition"
          >
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Recent Transactions</span>
              <span className="text-xs text-gray-400">({recentTransactions.length})</span>
            </div>
            {expandedSections.transactions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {expandedSections.transactions && (
            <div className="divide-y divide-gray-100">
              {recentTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No recent transactions</div>
              ) : (
                recentTransactions.map((tx) => (
                  <div key={tx.id} className="p-3 flex justify-between items-start hover:bg-gray-50 transition">
                    <div className="flex items-start gap-2 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${getTransactionColor(tx.type)}`}>
                        <span className="text-sm">{getTransactionIcon(tx.type)}</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800">{tx.description}</div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(tx.date).toLocaleDateString()}
                        </div>
                        {tx.type === "agent" && tx.estimateNumber && (
                          <div className="text-[10px] font-mono text-blue-500 mt-0.5">
                            📄 Estimate #{tx.estimateNumber}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold shrink-0 ml-3 ${tx.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                      {tx.type === 'expense' ? '-' : ''}{formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Monthly Trends */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => toggleSection("trends")}
            className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition"
          >
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Monthly Trends</span>
              <span className="text-xs text-gray-400">Last {monthlyTrends.length} months</span>
            </div>
            {expandedSections.trends ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {expandedSections.trends && (
            <div className="p-3 space-y-3">
              {monthlyTrends.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">No trend data available</div>
              ) : (
                monthlyTrends.map((trend) => (
                  <div key={trend.month} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-700">{trend.month}</span>
                      <span className={`text-sm font-bold ${trend.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(trend.profit)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Revenue: {formatCurrency(trend.revenue)}</span>
                      <span>Expenses: {formatCurrency(trend.expenses)}</span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 rounded-full transition-all duration-500" 
                        style={{ width: `${trend.revenue > 0 ? Math.min(100, (trend.profit / trend.revenue) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button 
            onClick={() => {
              alert("Export feature coming soon!");
            }}
            className="w-full py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition"
          >
            <Download size={14} /> Export Report
          </button>
          <Link href="/dashboard" className="block">
            <button className="w-full py-2.5 rounded-xl bg-green-700 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-800 transition">
              <Home size={14} /> Full Dashboard
            </button>
          </Link>
        </div>

        <div className="text-center pt-2">
          <p className="text-[10px] text-gray-400">
            Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
    </DesktopShell>
  );
}