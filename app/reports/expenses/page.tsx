"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import DesktopShell from "@/components/layout/DesktopShell";
import { formatCurrency } from "@/lib/utils/formatting";
import { calculateProjectFinancials } from "@/lib/queries/financialCalculations";
import { getProjectBundle } from "@/lib/queries/projects";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
  RefreshCw,
} from "lucide-react";

// ---------- Types ----------
type EstimateSummary = {
  id: string;
  client_id: string | null;          // <-- added for linking
  client_name: string;
  estimate_number: string;
  title: string | null;
  status: string;
  created_at: string;
  revised_total: number;
  subcontractor_paid: number;
  subcontractors: { id: string; name: string }[];
  agent_paid: number;
  agents: { id: string; name: string }[];
  other_expenses: number;
  payments_received: number;
  remaining_balance: number;
  profit: number;
  profit_margin: number;
  invoice_count: number;
  last_payment_date: string | null;
};

type SortField =
  | "estimate_number"
  | "client_name"
  | "status"
  | "created_at"
  | "revised_total"
  | "subcontractor_paid"
  | "agent_paid"
  | "other_expenses"
  | "payments_received"
  | "remaining_balance"
  | "profit"
  | "profit_margin"
  | "invoice_count"
  | "last_payment_date";

type SortDirection = "asc" | "desc";

// ---------- Helper to get status badge colour ----------
const statusColor = (status: string) => {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "draft":
      return "bg-gray-100 text-gray-600";
    case "converted":
      return "bg-blue-100 text-blue-800";
    case "completed":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-600";
  }
};

// ---------- Main Component ----------
export default function ExpensesReportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EstimateSummary[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("estimate_number");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // ---------- Data fetching ----------
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Get user and company_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Please log in to view financial data.");
        setLoading(false);
        return;
      }

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

      // Fetch all estimates with client info
      const { data: estimates, error: estError } = await supabase
        .from("estimates")
        .select("id, estimate_number, title, status, created_at, client:client_id (id, name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (estError || !estimates) throw new Error("Failed to load estimates");

      // Fetch invoices to find which estimates have payments
      const { data: invoices, error: invError } = await supabase
        .from("invoices")
        .select("estimate_id, amount_paid, status, created_at")
        .eq("company_id", companyId)
        .in("estimate_id", estimates.map(e => e.id))
        .in("status", ["paid", "partial"]);

      if (invError) throw new Error("Failed to load invoices");

      // Find estimates with payments
      const paidEstimateIds = new Set(invoices.map(inv => inv.estimate_id));
      if (paidEstimateIds.size === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const activeEstimates = estimates.filter(e => paidEstimateIds.has(e.id));

      // Build invoice lookup
      const invoicesByEstimate: Record<string, any[]> = {};
      const invoiceCounts: Record<string, number> = {};
      const lastPaymentDates: Record<string, string> = {};
      invoices.forEach(inv => {
        if (!invoicesByEstimate[inv.estimate_id]) invoicesByEstimate[inv.estimate_id] = [];
        invoicesByEstimate[inv.estimate_id].push(inv);
        invoiceCounts[inv.estimate_id] = (invoiceCounts[inv.estimate_id] || 0) + 1;
        if (!lastPaymentDates[inv.estimate_id] || inv.created_at > lastPaymentDates[inv.estimate_id]) {
          lastPaymentDates[inv.estimate_id] = inv.created_at;
        }
      });

      // Calculate financials using unified engine
      const summaries: EstimateSummary[] = [];
      for (const est of activeEstimates) {
        try {
          const bundle = await getProjectBundle(est.id);
          const financials = calculateProjectFinancials(bundle);

          const clientObj = est.client as any;
          summaries.push({
            id: est.id,
            client_id: clientObj?.id || null,
            client_name: clientObj?.name || "Unassigned",
            estimate_number: est.estimate_number || "N/A",
            title: est.title || null,
            status: est.status || "unknown",
            created_at: est.created_at || new Date().toISOString(),
            revised_total: financials.revisedTotal,
            subcontractor_paid: financials.subcontractorCosts,
            subcontractors: [],
            agent_paid: financials.agentCosts,
            agents: [],
            other_expenses: financials.expenseItems + financials.mileageCosts,
            payments_received: financials.amountPaid,
            remaining_balance: financials.remainingBalance,
            profit: financials.netProfit,
            profit_margin: financials.profitMargin,
            invoice_count: invoiceCounts[est.id] || 0,
            last_payment_date: lastPaymentDates[est.id] || null,
          });
        } catch (err) {
          console.warn(`Failed to calculate for estimate ${est.id}:`, err);
        }
      }

      setData(summaries);
      } catch (err: any) {
        setError(err.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh when page comes into focus
  useEffect(() => {
    const handleFocus = () => {
      fetchData();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchData]);

  // ---------- Filtering, sorting, totals ----------
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      const matchesSearch =
        row.estimate_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (row.title || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || row.status === statusFilter;
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
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
    return sorted;
  }, [filteredData, sortField, sortDirection]);

  const totals = useMemo(() => {
    return sortedData.reduce(
      (acc, row) => {
        acc.revised_total += row.revised_total;
        acc.subcontractor_paid += row.subcontractor_paid;
        acc.agent_paid += row.agent_paid;
        acc.other_expenses += row.other_expenses;
        acc.payments_received += row.payments_received;
        acc.remaining_balance += row.remaining_balance;
        acc.profit += row.profit;
        return acc;
      },
      {
        revised_total: 0,
        subcontractor_paid: 0,
        agent_paid: 0,
        other_expenses: 0,
        payments_received: 0,
        remaining_balance: 0,
        profit: 0,
      }
    );
  }, [sortedData]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (field !== sortField) return <ArrowUpDown size={12} className="ml-1" />;
    return sortDirection === "asc" ? (
      <ArrowUp size={12} className="ml-1" />
    ) : (
      <ArrowDown size={12} className="ml-1" />
    );
  };

  // ---------- Render ----------
  if (loading)
    return (
      <div className="min-h-screen bg-slate-50/70 p-8 flex items-center justify-center">
        <div className="text-slate-400">Loading financial data…</div>
      </div>
    );
  if (error)
    return (
      <div className="min-h-screen bg-slate-50/70 p-8 flex items-center justify-center">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  if (data.length === 0)
    return (
      <div className="min-h-screen bg-slate-50/70 p-8 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center max-w-md">
          <p className="text-slate-500">No estimates with payments found.</p>
          <p className="text-xs text-slate-400 mt-2">
            Only estimates that have at least one paid or partial invoice are shown.
          </p>
        </div>
      </div>
    );

  return (
    <DesktopShell title="Reports">
    <div className="min-h-screen md:min-h-0 bg-slate-50/70 md:bg-transparent p-6 md:p-0">
      <div className="max-w-7xl mx-auto md:mx-0 md:max-w-none">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">
            💰 Financial Summary by Estimate
          </h1>
          <button
            onClick={fetchData}
            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={20} />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Total Revised Revenue
            </div>
            <div className="text-xl font-bold text-slate-800">
              {formatCurrency(totals.revised_total)}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Payments Received
            </div>
            <div className="text-xl font-bold text-emerald-600">
              {formatCurrency(totals.payments_received)}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Remaining Balance
            </div>
            <div className="text-xl font-bold text-blue-600">
              {formatCurrency(totals.remaining_balance)}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Company Profit
            </div>
            <div className="text-xl font-bold text-indigo-600">
              {formatCurrency(totals.profit)}
            </div>
          </div>
        </div>

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
            {sortedData.length} estimate{sortedData.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("estimate_number")}>
                    <span className="flex items-center">Estimate # {getSortIcon("estimate_number")}</span>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("client_name")}>
                    <span className="flex items-center">Client {getSortIcon("client_name")}</span>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("status")}>
                    <span className="flex items-center">Status {getSortIcon("status")}</span>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("created_at")}>
                    <span className="flex items-center">Created {getSortIcon("created_at")}</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("revised_total")}>
                    <span className="flex items-center justify-end">Revised Total {getSortIcon("revised_total")}</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("subcontractor_paid")}>
                    <span className="flex items-center justify-end">Subcontractor (Paid) {getSortIcon("subcontractor_paid")}</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("agent_paid")}>
                    <span className="flex items-center justify-end">Agent (Paid) {getSortIcon("agent_paid")}</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("other_expenses")}>
                    <span className="flex items-center justify-end">Other Expenses {getSortIcon("other_expenses")}</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("payments_received")}>
                    <span className="flex items-center justify-end">Payments Received {getSortIcon("payments_received")}</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("remaining_balance")}>
                    <span className="flex items-center justify-end">Remaining Balance {getSortIcon("remaining_balance")}</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("profit")}>
                    <span className="flex items-center justify-end">Company Profit {getSortIcon("profit")}</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("profit_margin")}>
                    <span className="flex items-center justify-end">Margin % {getSortIcon("profit_margin")}</span>
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("invoice_count")}>
                    <span className="flex items-center justify-center">Invoices {getSortIcon("invoice_count")}</span>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort("last_payment_date")}>
                    <span className="flex items-center">Last Payment {getSortIcon("last_payment_date")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedData.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-700">
                      <Link href={`/reports/expenses/${row.id}`} className="hover:text-emerald-600 hover:underline transition-colors">
                        {row.estimate_number}
                      </Link>
                      {row.title && <div className="font-sans text-[10px] text-slate-400 truncate max-w-[140px]">{row.title}</div>}
                    </td>
                    {/* Client name with link */}
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
                    {/* Subcontractor cell */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-rose-600">{formatCurrency(row.subcontractor_paid)}</span>
                        {row.subcontractors.length > 0 && (
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5 space-x-1">
                            {row.subcontractors.map((sub, idx) => (
                              <span key={sub.id}>
                                <Link href={`/reports/subcontractor/${sub.id}`} className="text-emerald-600 hover:underline">
                                  {sub.name}
                                </Link>
                                {idx < row.subcontractors.length - 1 && " · "}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Agent cell */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-amber-600">{formatCurrency(row.agent_paid)}</span>
                        {row.agents.length > 0 && (
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5 space-x-1">
                            {row.agents.map((agent, idx) => (
                              <span key={agent.id}>
                                <Link href={`/reports/agent/${agent.id}`} className="text-amber-600 hover:underline">
                                  {agent.name}
                                </Link>
                                {idx < row.agents.length - 1 && " · "}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{formatCurrency(row.other_expenses)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatCurrency(row.payments_received)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-blue-600">{formatCurrency(row.remaining_balance)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">{formatCurrency(row.profit)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                      {row.profit_margin.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-500">{row.invoice_count}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {row.last_payment_date ? new Date(row.last_payment_date).toLocaleDateString() : "—"}
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
                  <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">{formatCurrency(totals.profit)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                    {totals.revised_total > 0 ? ((totals.profit / totals.revised_total) * 100).toFixed(1) : "0.0"}%
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-slate-500" colSpan={2}>—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-400 space-y-1">
          <p>* Only estimates with at least one invoice in <strong>paid</strong> or <strong>partial</strong> status are shown.</p>
          <p>* Click the estimate number to view the full estimate details.</p>
          <p>* Click a client, subcontractor, or agent name to see their project history.</p>
          <p>* Revised Total = Estimate Total + Approved Change Orders</p>
          <p>* Payments Received = sum of <code>amount_paid</code> from those invoices.</p>
          <p>* Profit Margin = (Company Profit / Revised Total) × 100%</p>
        </div>
      </div>
    </div>
    </DesktopShell>
  );
}