'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Header from '@/components/ui/Header';
import { supabase } from '@/lib/supabase/client'; // your Supabase client
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Download, RefreshCw, AlertCircle, CheckCircle, Info } from 'lucide-react';

// ----- Types -----
interface DashboardData {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    totalMiles: number;
    mileageDeduction: number;
    unsoldCost: number;
    openInvoicesCount: number;
    openInvoicesAmount: number;
  };
  monthly: any[];
  estimates: any[];
  expenseBreakdown: any[];
  topClients: any[];
  openInvoices: any[];
  alerts: any[];
}

// ----- Helpers -----
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6b7280'];

const SummaryCard = ({ label, value, color = 'blue' }: { label: string; value: number; color?: string }) => {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
  };
  const isCurrency = ['Income', 'Expenses', 'Profit', 'Invoices', 'Costs', 'Deduction'].some(w => label.includes(w));
  return (
    <div className="bg-white rounded-xl shadow-sm p-3 border border-slate-100">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${colorMap[color] || 'text-slate-800'}`}>
        {isCurrency ? formatCurrency(value) : value?.toFixed(0) || 0}
      </div>
    </div>
  );
};

// ----- Main Page -----
export default function AccountingPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

const loadData = async () => {
  setError(null);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in.');

    // Fetch all data from views
    const [
      { data: monthly },
      { data: estimates },
      { data: expenseBreakdown },
      { data: topClients },
      { data: openInvoices },
      { data: unsoldCosts },
      { data: mileage },
      { data: incomeTotals },
      { data: expenseTotals },
      { data: agentTotals },
      { data: subTotals }
    ] = await Promise.all([
      supabase.from('vw_monthly_pl').select('*').limit(12),
      supabase.from('vw_estimate_profit').select('*').order('gross_profit', { ascending: false }),
      supabase.from('vw_expense_breakdown').select('*'),
      supabase.from('vw_top_clients').select('*'),
      supabase.from('vw_open_invoices').select('*'),
      supabase.from('vw_unsold_costs').select('total_cost').maybeSingle(),
      supabase.from('vw_mileage_ytd').select('total_miles, deduction').maybeSingle(),
      supabase.from('estimates').select('total').eq('status', 'completed'),
      supabase.from('estimate_expenses').select('amount'),
      supabase.from('agent_payments').select('amount'),
      supabase.from('subcontractor_payments').select('amount')
    ]);

    // Compute totals
    const totalIncome = incomeTotals?.reduce((sum, r) => sum + (r.total || 0), 0) || 0;
    const directExpenses = expenseTotals?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
    const agentExpenses = agentTotals?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
    const subExpenses = subTotals?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
    const totalExpenses = directExpenses + agentExpenses + subExpenses;
    const netProfit = totalIncome - totalExpenses;

    // Build expense breakdown with agent and sub categories
    const breakdown = [...(expenseBreakdown || [])];
    if (agentExpenses > 0) {
      breakdown.push({ category: 'Agent Commissions', total: agentExpenses });
    }
    if (subExpenses > 0) {
      breakdown.push({ category: 'Subcontractors', total: subExpenses });
    }

    const openInvoicesAmount = openInvoices?.reduce((s, inv) => s + inv.total, 0) || 0;
    const totalMiles = mileage?.total_miles || 0;

    // Alerts
    const alerts = [];
    if (openInvoicesAmount > 5000) {
      alerts.push({ type: 'warning', message: 'High accounts receivable (> $5,000) – follow up on open invoices.' });
    }
    if (netProfit < 0) {
      alerts.push({ type: 'danger', message: 'Net loss – review spending and income.' });
    }
    if (totalMiles > 1000) {
      alerts.push({ type: 'success', message: `Great mileage tracking: ${totalMiles.toFixed(0)} miles logged this year.` });
    }

    setData({
      summary: {
        totalIncome,
        totalExpenses,
        netProfit,
        totalMiles,
        mileageDeduction: mileage?.deduction || 0,
        unsoldCost: unsoldCosts?.total_cost || 0,
        openInvoicesCount: openInvoices?.length || 0,
        openInvoicesAmount,
      },
      monthly: monthly || [],
      estimates: estimates || [],
      expenseBreakdown: breakdown,
      topClients: topClients || [],
      openInvoices: openInvoices || [],
      alerts,
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to load data');
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
};

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    loadData();
  };

  const exportCSV = () => {
    if (!data) return;
    const rows = [['Type', 'Date', 'Client', 'Amount', 'Category/Status']];
    data.monthly.forEach(m => {
      rows.push(['Income', m.month, '', String(m.income), '']);
      rows.push(['Expense', m.month, '', String(m.expense), '']);
    });
    data.estimates.forEach(e => {
      rows.push(['Estimate', '', e.client_name || 'N/A', String(e.revenue), e.status]);
    });
    data.expenseBreakdown.forEach(c => {
      rows.push(['Expense Category', '', '', String(c.total), c.category]);
    });
    const csv = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'financial_report.csv';
    link.click();
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-slate-50/70 pb-24">
          <Header title="Accounting" backLink="/" />
          <div className="mx-auto max-w-3xl p-4 text-center text-slate-500">Loading financial data...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-slate-50/70 pb-24">
          <Header title="Accounting" backLink="/" />
          <div className="mx-auto max-w-3xl p-4 text-center">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
              <p className="text-red-700 font-medium">Failed to load data</p>
              <p className="text-red-500 text-sm mt-1">{error}</p>
              <button
                onClick={handleRefresh}
                className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
              >
                <RefreshCw size={16} className="inline mr-2" /> Retry
              </button>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!data) return null;

  const { summary, monthly, estimates, expenseBreakdown, topClients, openInvoices, alerts } = data;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50/70 pb-24">
        <Header title="Accounting" backLink="/" />

        <div className="mx-auto max-w-3xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-800">Financial Summary</h1>
            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 rounded-full hover:bg-slate-200 transition"
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={exportCSV}
                className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-emerald-700 transition"
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="mb-4 space-y-2">
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg flex items-start gap-2 text-sm ${
                    alert.type === 'danger' ? 'bg-red-50 text-red-700 border border-red-200' :
                    alert.type === 'warning' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                    'bg-green-50 text-green-700 border border-green-200'
                  }`}
                >
                  {alert.type === 'danger' && <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />}
                  {alert.type === 'warning' && <Info size={18} className="flex-shrink-0 mt-0.5" />}
                  {alert.type === 'success' && <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />}
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Income (YTD)" value={summary.totalIncome} />
            <SummaryCard label="Expenses (YTD)" value={summary.totalExpenses} />
            <SummaryCard label="Net Profit" value={summary.netProfit} color={summary.netProfit >= 0 ? 'green' : 'red'} />
            <SummaryCard label="Open Invoices" value={summary.openInvoicesAmount} />
            <SummaryCard label="Mileage Deduction" value={summary.mileageDeduction} />
            <SummaryCard label="Unsold Costs" value={summary.unsoldCost} color="orange" />
          </div>

          {monthly.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Monthly Profit & Loss</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthly}>
                  <XAxis dataKey="month" tickFormatter={(v) => new Date(v).toLocaleDateString('en', { month: 'short' })} />
                  <YAxis tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => `$${v}`} />
                  <Legend />
                  <Bar dataKey="income" fill="#4ade80" name="Income" />
                  <Bar dataKey="expense" fill="#f87171" name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {expenseBreakdown.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Expense Categories</h2>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={expenseBreakdown}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {expenseBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `$${v}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {topClients.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Top Clients</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b">
                    <tr><th className="pb-2">Client</th><th className="pb-2 text-right">Revenue</th><th className="pb-2 text-right">Jobs</th></tr>
                  </thead>
                  <tbody>
                    {topClients.map((c, idx) => (
                      <tr key={idx} className="border-b border-slate-50 last:border-0">
                        <td className="py-2">{c.client_name}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(c.total_revenue)}</td>
                        <td className="py-2 text-right text-slate-500">{c.job_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {openInvoices.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Open Invoices</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b">
                    <tr><th className="pb-2">Invoice #</th><th className="pb-2">Client</th><th className="pb-2 text-right">Amount</th><th className="pb-2 text-right">Due Date</th></tr>
                  </thead>
                  <tbody>
                    {openInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2">{inv.invoice_number || 'N/A'}</td>
                        <td className="py-2">{inv.client_name}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(inv.total)}</td>
                        <td className="py-2 text-right text-slate-500">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {estimates.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Estimate Profitability</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b">
                    <tr><th className="pb-2">Client</th><th className="pb-2">Status</th><th className="pb-2 text-right">Revenue</th><th className="pb-2 text-right">Expenses</th><th className="pb-2 text-right">Gross Profit</th></tr>
                  </thead>
                  <tbody>
                    {estimates.slice(0, 20).map((e) => (
                      <tr key={e.estimate_id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2">{e.client_name || 'No client'}</td>
                        <td className="py-2 capitalize">{e.status || 'unknown'}</td>
                        <td className="py-2 text-right">{formatCurrency(e.revenue || 0)}</td>
                        <td className="py-2 text-right">{formatCurrency((e.direct_expenses || 0) + (e.agent_costs || 0) + (e.subcontractor_costs || 0) + (e.mileage_cost || 0))}</td>
                        <td className={`py-2 text-right font-medium ${e.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(e.gross_profit || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {estimates.length > 20 && <p className="text-xs text-slate-400 mt-2">Showing first 20 of {estimates.length} estimates</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}