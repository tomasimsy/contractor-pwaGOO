'use client';

import { useEffect, useState, useMemo } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Header from '@/components/ui/Header';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/formatting';
import { MetricExplanationModal } from '@/components/accounting/MetricExplanationModal';

import {
  Download,
  RefreshCw,
  AlertCircle,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  HelpCircle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import Link from 'next/link';

// ---------- Types ----------
type EstimateFinancial = {
  estimate_id: string;
  estimate_number: string;
  client_id: string | null;
  client_name: string;
  status: string;
  created_at: string;
  original_total: number;
  change_order_total: number;
  revised_total: number;
  subcontractor_paid: number;
  subcontractors: { id: string; name: string }[] | null;
  agent_paid: number;
  agents: { id: string; name: string }[] | null;
  other_expenses: number;
  payments_received: number;
  remaining_balance: number;
  company_profit: number;
  profit_margin: number;
  invoice_count: number;
  last_payment_date: string | null;
};

type SortField = keyof Pick<
  EstimateFinancial,
  | 'estimate_number'
  | 'client_name'
  | 'status'
  | 'created_at'
  | 'revised_total'
  | 'subcontractor_paid'
  | 'agent_paid'
  | 'other_expenses'
  | 'payments_received'
  | 'remaining_balance'
  | 'company_profit'
  | 'profit_margin'
  | 'invoice_count'
  | 'last_payment_date'
>;

type SortDirection = 'asc' | 'desc';

// ---------- Helpers ----------
const statusColor = (status: string) => {
  switch (status) {
    case 'approved': return 'bg-green-100 text-green-800';
    case 'pending': return 'bg-yellow-100 text-yellow-800';
    case 'draft': return 'bg-gray-100 text-gray-600';
    case 'converted': return 'bg-blue-100 text-blue-800';
    case 'completed': return 'bg-purple-100 text-purple-800';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const getSortIcon = (field: SortField, sortField: SortField, sortDirection: SortDirection) => {
  if (field !== sortField) return <ArrowUpDown size={12} className="ml-1" />;
  return sortDirection === 'asc' ? <ArrowUp size={12} className="ml-1" /> : <ArrowDown size={12} className="ml-1" />;
};

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6b7280'];

// ---------- Summary Card ----------
const SummaryCard = ({ label, value, color = 'blue' }: { label: string; value: number; color?: string }) => {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    purple: 'text-purple-600',
    emerald: 'text-emerald-600',
    indigo: 'text-indigo-600',
  };
  const isCurrency = ['Revenue', 'Expenses', 'Profit', 'Payments', 'Balance', 'Costs', 'Deduction'].some(w => label.includes(w));
  return (
    <div className="bg-white rounded-xl shadow-sm p-3 border border-slate-100">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${colorMap[color] || 'text-slate-800'}`}>
        {isCurrency ? formatCurrency(value) : value?.toFixed(0) || 0}
      </div>
    </div>
  );
};

// ---------- Main Page ----------
export default function AccountingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EstimateFinancial[]>([]);

  // Additional metrics
  const [mileageDeduction, setMileageDeduction] = useState(0);
  const [unsoldCosts, setUnsoldCosts] = useState(0);
  const [openInvoices, setOpenInvoices] = useState<{ id: string; invoice_number: string; client_name: string; total: number; due_date: string }[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('estimate_number');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [showExplanation, setShowExplanation] = useState(false);

  // ---------- Fetch data ----------
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. Main financial view
        const { data: rows, error: queryError } = await supabase
          .from('vw_estimate_financials')
          .select('*');

        if (queryError) throw new Error(queryError.message);

        const typedData = (rows || []).map((row: any) => ({
          ...row,
          subcontractors: row.subcontractors || [],
          agents: row.agents || [],
        })) as EstimateFinancial[];
        setData(typedData);

        // 2. Mileage deduction (YTD)
        const { data: mileageRows } = await supabase
          .from('mileage_trips')
          .select('distance_miles')
          .gte('created_at', new Date(new Date().getFullYear(), 0, 1).toISOString());

        const totalMiles = mileageRows?.reduce((sum, r) => sum + (r.distance_miles || 0), 0) || 0;
        setMileageDeduction(totalMiles * 0.655);

        // 3. Unsold costs (estimates with status draft, sent, rejected)
        const { data: unsoldEstimates } = await supabase
          .from('estimates')
          .select('id')
          .in('status', ['draft', 'sent', 'rejected']);

        const unsoldIds = unsoldEstimates?.map(e => e.id) || [];
        let totalUnsold = 0;
        if (unsoldIds.length > 0) {
          const { data: unsoldExpenses } = await supabase
            .from('estimate_expenses')
            .select('amount')
            .in('estimate_id', unsoldIds);
          totalUnsold = unsoldExpenses?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
        }
        setUnsoldCosts(totalUnsold);

        // 4. Open invoices (not paid)
        const { data: openInvRows } = await supabase
          .from('invoices')
          .select(`
            id,
            invoice_number,
            client_id,
            total,
            due_date,
            clients (name)
          `)
          .is('paid_at', null)
          .neq('status', 'paid');

        const formatted = (openInvRows || []).map((inv: any) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          client_name: inv.clients?.name || 'Unassigned',
          total: inv.total || 0,
          due_date: inv.due_date,
        }));
        setOpenInvoices(formatted);
      } catch (err: any) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ---------- Filter, sort, paginate ----------
  const filteredData = useMemo(() => {
    return data.filter(row => {
      const matchesSearch =
        row.estimate_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.client_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data, searchTerm, statusFilter]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
    return sorted;
  }, [filteredData, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ---------- Totals ----------
  const totals = useMemo(() => {
    return sortedData.reduce(
      (acc, row) => {
        acc.revised_total += row.revised_total;
        acc.subcontractor_paid += row.subcontractor_paid;
        acc.agent_paid += row.agent_paid;
        acc.other_expenses += row.other_expenses;
        acc.payments_received += row.payments_received;
        acc.remaining_balance += row.remaining_balance;
        acc.company_profit += row.company_profit;
        return acc;
      },
      {
        revised_total: 0,
        subcontractor_paid: 0,
        agent_paid: 0,
        other_expenses: 0,
        payments_received: 0,
        remaining_balance: 0,
        company_profit: 0,
      }
    );
  }, [sortedData]);

  // ---------- Top 5 Clients ----------
  const topClients = useMemo(() => {
    const clientMap = new Map<string, { name: string; revenue: number; count: number }>();
    sortedData.forEach(row => {
      const key = row.client_id || 'unassigned';
      const existing = clientMap.get(key);
      if (existing) {
        existing.revenue += row.payments_received;
        existing.count += 1;
      } else {
        clientMap.set(key, { name: row.client_name, revenue: row.payments_received, count: 1 });
      }
    });
    return Array.from(clientMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [sortedData]);

  // ---------- Monthly P&L ----------
  const monthlyData = useMemo(() => {
    const months: Record<string, { income: number; expense: number }> = {};
    sortedData.forEach(row => {
      const month = new Date(row.created_at).toISOString().slice(0, 7);
      if (!months[month]) months[month] = { income: 0, expense: 0 };
      months[month].income += row.revised_total;
      months[month].expense += row.subcontractor_paid + row.agent_paid + row.other_expenses;
    });
    return Object.entries(months)
      .map(([month, values]) => ({ month, ...values }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [sortedData]);

  // ---------- Expense breakdown ----------
  const expenseBreakdown = useMemo(() => {
    const totalSub = totals.subcontractor_paid;
    const totalAgent = totals.agent_paid;
    const totalOther = totals.other_expenses;
    const total = totalSub + totalAgent + totalOther;
    if (total === 0) return [];
    return [
      { name: 'Subcontractor', value: totalSub },
      { name: 'Agent', value: totalAgent },
      { name: 'Other', value: totalOther },
    ].filter(item => item.value > 0);
  }, [totals]);

  // ---------- Handlers ----------
  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const exportCSV = () => {
    const headers = [
      'Estimate #', 'Client', 'Status', 'Created', 'Revised Total',
      'Subcontractor Paid', 'Agent Paid', 'Other Expenses',
      'Payments Received', 'Remaining Balance', 'Company Profit', 'Margin %', 'Invoices'
    ];
    const rows = sortedData.map(row => [
      row.estimate_number,
      row.client_name,
      row.status,
      new Date(row.created_at).toLocaleDateString(),
      row.revised_total,
      row.subcontractor_paid,
      row.agent_paid,
      row.other_expenses,
      row.payments_received,
      row.remaining_balance,
      row.company_profit,
      row.profit_margin.toFixed(1),
      row.invoice_count,
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'financial_report.csv';
    link.click();
  };

  // ---------- Render states ----------
  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-slate-50/70 pb-24">
          <Header title="Accounting" backLink="/" />
          <div className="mx-auto max-w-3xl p-4 text-center text-slate-500">Loading financial data…</div>
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
                onClick={() => window.location.reload()}
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

  if (data.length === 0) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-slate-50/70 pb-24">
          <Header title="Accounting" backLink="/" />
          <div className="mx-auto max-w-3xl p-4 text-center">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
              <p className="text-slate-500">No estimates with payments found.</p>
              <p className="text-xs text-slate-400 mt-2">
                Only estimates that have at least one paid or partial invoice are shown.
              </p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // ---------- Main render ----------
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50/70 pb-24">
        <Header title="Accounting" backLink="/" />

        <div className="mx-auto max-w-7xl p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-800">Financial Summary</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowExplanation(true)}
                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition"
                aria-label="Explain metrics"
              >
                <HelpCircle size={18} />
              </button>
              <button
                onClick={() => window.location.reload()}
                className="p-2 rounded-full hover:bg-slate-200 transition"
              >
                <RefreshCw size={18} />
              </button>
              <button
                onClick={exportCSV}
                className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-emerald-700 transition"
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Total Revenue" value={totals.revised_total} color="blue" />
            <SummaryCard label="Total Expenses" value={totals.subcontractor_paid + totals.agent_paid + totals.other_expenses} color="red" />
            <SummaryCard label="Company Profit" value={totals.company_profit} color={totals.company_profit >= 0 ? 'green' : 'red'} />
            <SummaryCard label="Remaining Balance" value={totals.remaining_balance} color="orange" />
            <SummaryCard label="Payments Received" value={totals.payments_received} color="emerald" />
            <SummaryCard label="Subcontractor Paid" value={totals.subcontractor_paid} color="purple" />
            <SummaryCard label="Agent Paid" value={totals.agent_paid} color="indigo" />
            <SummaryCard label="Other Expenses" value={totals.other_expenses} color="red" />
            <SummaryCard label="Mileage Deduction" value={mileageDeduction} color="purple" />
            <SummaryCard label="Unsold Costs" value={unsoldCosts} color="red" />
            <SummaryCard label="Open Invoices" value={openInvoices.reduce((s, i) => s + i.total, 0)} color="orange" />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {monthlyData.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700 mb-2">Monthly P&L</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="month" tickFormatter={(v) => new Date(v).toLocaleDateString('en', { month: 'short' })} />
                    <YAxis tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v) => `$${v}`} />
                    <Legend />
                    <Bar dataKey="income" fill="#4ade80" name="Revenue" />
                    <Bar dataKey="expense" fill="#f87171" name="Expenses" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {expenseBreakdown.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700 mb-2">Expense Breakdown</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={expenseBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
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
          </div>

          {/* Top Clients */}
          {topClients.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-100 mb-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Top 5 Clients</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topClients.map((client, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-slate-100 py-1">
                    <span className="text-sm">{client.name}</span>
                    <span className="text-sm font-medium">{formatCurrency(client.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open Invoices Section */}
          {openInvoices.length > 0 && (
            <div className="my-4 bg-white rounded-xl shadow-sm border border-slate-100 p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Open Invoices ({openInvoices.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b">
                    <tr>
                      <th className="pb-2">Invoice #</th>
                      <th className="pb-2">Client</th>
                      <th className="pb-2 text-right">Amount</th>
                      <th className="pb-2 text-right">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openInvoices.map(inv => (
                      <tr key={inv.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2">{inv.invoice_number}</td>
                        <td className="py-2">{inv.client_name}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(inv.total)}</td>
                        <td className="py-2 text-right text-slate-500">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {/* Filters & Search */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search estimate # or client…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="converted">Converted</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="text-xs text-slate-400 ml-auto">
              {sortedData.length} estimate{sortedData.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Main Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {[
                      { key: 'estimate_number', label: 'Estimate #' },
                      { key: 'client_name', label: 'Client' },
                      { key: 'status', label: 'Status' },
                      { key: 'created_at', label: 'Created' },
                      { key: 'revised_total', label: 'Revised Total', align: 'right' },
                      { key: 'subcontractor_paid', label: 'Subcontractor Paid', align: 'right' },
                      { key: 'agent_paid', label: 'Agent Paid', align: 'right' },
                      { key: 'other_expenses', label: 'Other Expenses', align: 'right' },
                      { key: 'payments_received', label: 'Payments Received', align: 'right' },
                      { key: 'remaining_balance', label: 'Remaining Balance', align: 'right' },
                      { key: 'company_profit', label: 'Company Profit', align: 'right' },
                      { key: 'profit_margin', label: 'Margin %', align: 'right' },
                      { key: 'invoice_count', label: 'Invoices', align: 'center' },
                      { key: 'last_payment_date', label: 'Last Payment' },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className={`px-4 py-3 text-${col.align || 'left'} font-semibold text-slate-600 cursor-pointer hover:text-slate-800`}
                        onClick={() => handleSort(col.key as SortField)}
                      >
                        <span className={`flex items-center gap-1 justify-${col.align === 'right' ? 'end' : col.align === 'center' ? 'center' : 'start'}`}>
                          {col.label}
                          {getSortIcon(col.key as SortField, sortField, sortDirection)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedData.map((row) => (
                    <tr key={row.estimate_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-700">
                        <Link href={`/reports/expenses/${row.estimate_id}`} className="hover:text-emerald-600 hover:underline">
                          {row.estimate_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {row.client_id ? (
                          <Link href={`/reports/client/${row.client_id}`} className="hover:text-emerald-600 hover:underline">
                            {row.client_name}
                          </Link>
                        ) : (
                          row.client_name
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrency(row.revised_total)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-rose-600">{formatCurrency(row.subcontractor_paid)}</span>
                          {row.subcontractor_paid > 0 && (row.subcontractors || []).length > 0 && (
                            <div className="text-[10px] text-slate-500 font-normal mt-0.5 space-x-1">
                              {(row.subcontractors || []).map((sub, idx) => (
                                <span key={sub.id}>
                                  <Link href={`/reports/subcontractor/${sub.id}`} className="text-emerald-600 hover:underline">
                                    {sub.name}
                                  </Link>
                                  {idx < (row.subcontractors || []).length - 1 && ' · '}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-amber-600">{formatCurrency(row.agent_paid)}</span>
                          {row.agent_paid > 0 && (row.agents || []).length > 0 && (
                            <div className="text-[10px] text-slate-500 font-normal mt-0.5 space-x-1">
                              {(row.agents || []).map((agent, idx) => (
                                <span key={agent.id}>
                                  <Link href={`/reports/agent/${agent.id}`} className="text-amber-600 hover:underline">
                                    {agent.name}
                                  </Link>
                                  {idx < (row.agents || []).length - 1 && ' · '}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400">{formatCurrency(row.other_expenses)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatCurrency(row.payments_received)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-blue-600">{formatCurrency(row.remaining_balance)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${row.company_profit >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                        {formatCurrency(row.company_profit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                        {row.profit_margin.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-slate-500">{row.invoice_count}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {row.last_payment_date ? new Date(row.last_payment_date).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/80 border-t border-slate-300 font-semibold">
                  <tr>
                    <td className="px-4 py-3" colSpan={4}>Totals</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(totals.revised_total)}</td>
                    <td className="px-4 py-3 text-right font-mono text-rose-600">{formatCurrency(totals.subcontractor_paid)}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600">{formatCurrency(totals.agent_paid)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{formatCurrency(totals.other_expenses)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatCurrency(totals.payments_received)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-blue-600">{formatCurrency(totals.remaining_balance)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">{formatCurrency(totals.company_profit)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                      {totals.revised_total > 0 ? ((totals.company_profit / totals.revised_total) * 100).toFixed(1) : '0.0'}%
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-500" colSpan={2}>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {currentPage} of {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>



          <div className="mt-4 text-xs text-slate-400 space-y-1">
            <p>* Only estimates with at least one invoice in <strong>paid</strong> or <strong>partial</strong> status are shown.</p>
            <p>* Click the estimate number to view details.</p>
            <p>* Revised Total = Estimate Total + Approved Change Orders</p>
            <p>* Company Profit = Revised Total − (Subcontractor Paid + Agent Paid + Other Expenses)</p>
            <p>* Mileage Deduction = total miles × $0.655 (YTD)</p>
            <p>* Unsold Costs = expenses on estimates with status Draft, Sent, or Rejected</p>
          </div>
        </div>
      </div>

      {/* // At bottom of component: */}
<MetricExplanationModal
  isOpen={showExplanation}
  onClose={() => setShowExplanation(false)}
/>
    </ProtectedRoute>
  );
}