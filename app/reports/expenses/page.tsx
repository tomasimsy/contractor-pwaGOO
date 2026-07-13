"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
} from "lucide-react";

// ---------- Types ----------
type EstimateSummary = {
  id: string;
  client_id: string | null;          // <-- added for linking
  client_name: string;
  estimate_number: string;
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
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. Fetch all estimates – include client ID and name
        const { data: estimates, error: estError } = await supabase
          .from("estimates")
          .select(`
            id,
            estimate_number,
            status,
            created_at,
            total,
            client:client_id (id, name)
          `)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (estError || !estimates) throw new Error("Failed to load estimates");

        const allEstimateIds = estimates.map((e) => e.id);

        // 2. Fetch invoices with status 'paid' or 'partial'
        const { data: invoices, error: invError } = await supabase
          .from("invoices")
          .select("estimate_id, amount_paid, status, created_at")
          .in("estimate_id", allEstimateIds)
          .in("status", ["paid", "partial"]);

        if (invError) throw new Error("Failed to load invoices");

        const paidEstimateIds = new Set<string>();
        invoices.forEach((inv) => paidEstimateIds.add(inv.estimate_id));

        if (paidEstimateIds.size === 0) {
          setData([]);
          setLoading(false);
          return;
        }

        const activeEstimates = estimates.filter((e) =>
          paidEstimateIds.has(e.id)
        );
        const activeIds = activeEstimates.map((e) => e.id);

        const safeFetch = async (table: string, query: any) => {
          try {
            const { data, error } = await query(supabase.from(table));
            if (error) throw error;
            return data || [];
          } catch (e) {
            console.warn(`Table "${table}" fetch failed:`, e);
            return [];
          }
        };

        // ---------- Subcontractor data ----------
        const estimateSubs = await safeFetch(
          "estimate_subcontractors",
          (q: any) =>
            q
              .select(`
                id,
                estimate_id,
                subcontractor_id,
                subcontractors (id, name)
              `)
              .in("estimate_id", activeIds)
        );

        const subMap: Record<string, { id: string; name: string }[]> = {};
        estimateSubs.forEach((es: any) => {
          const estId = es.estimate_id;
          if (!subMap[estId]) subMap[estId] = [];
          const sub = es.subcontractors;
          if (sub?.id && sub?.name) {
            if (!subMap[estId].find((s) => s.id === sub.id)) {
              subMap[estId].push({ id: sub.id, name: sub.name });
            }
          }
        });

        const subLinkIds = estimateSubs.map((es: any) => es.id);
        let subPayments: any[] = [];
        if (subLinkIds.length) {
          subPayments = await safeFetch(
            "subcontractor_payments",
            (q: any) =>
              q
                .select("amount, estimate_subcontractor_id")
                .in("estimate_subcontractor_id", subLinkIds)
                .is("deleted_at", null)
          );
        }

        const subTotals: Record<string, number> = {};
        subPayments.forEach((p: any) => {
          const found = estimateSubs.find(
            (es: any) => es.id === p.estimate_subcontractor_id
          );
          if (found) {
            const estId = found.estimate_id;
            subTotals[estId] = (subTotals[estId] || 0) + (p.amount || 0);
          }
        });

        // ---------- Agent data ----------
        const agentPaymentsData = await safeFetch(
          "agent_payments",
          (q: any) =>
            q
              .select(`
                estimate_id,
                agent_id,
                amount,
                agents (id, name)
              `)
              .in("estimate_id", activeIds)
              .is("deleted_at", null)
        );

        const agentMap: Record<string, { id: string; name: string }[]> = {};
        const agentTotals: Record<string, number> = {};
        agentPaymentsData.forEach((ap: any) => {
          const estId = ap.estimate_id;
          if (!agentMap[estId]) agentMap[estId] = [];
          const agent = ap.agents;
          if (agent?.id && agent?.name) {
            if (!agentMap[estId].find((a) => a.id === agent.id)) {
              agentMap[estId].push({ id: agent.id, name: agent.name });
            }
          }
          agentTotals[estId] = (agentTotals[estId] || 0) + (ap.amount || 0);
        });

        // ---------- Other expenses ----------
        const expensePayments = await safeFetch(
          "estimate_expenses",
          (q: any) =>
            q.select("estimate_id, amount").in("estimate_id", activeIds).is("deleted_at", null)
        );
        const expenseTotals: Record<string, number> = {};
        expensePayments.forEach((p: any) => {
          expenseTotals[p.estimate_id] =
            (expenseTotals[p.estimate_id] || 0) + (p.amount || 0);
        });

        // ---------- Payment totals from invoices ----------
        const payTotals: Record<string, number> = {};
        const invoiceCounts: Record<string, number> = {};
        const lastPaymentDates: Record<string, string> = {};
        invoices.forEach((inv: any) => {
          const eid = inv.estimate_id;
          payTotals[eid] = (payTotals[eid] || 0) + (inv.amount_paid || 0);
          invoiceCounts[eid] = (invoiceCounts[eid] || 0) + 1;
          if (!lastPaymentDates[eid] || inv.created_at > lastPaymentDates[eid]) {
            lastPaymentDates[eid] = inv.created_at;
          }
        });

        // ---------- Approved change orders ----------
        const changeOrders = await safeFetch(
          "change_orders",
          (q: any) =>
            q
              .select("estimate_id, total_amount")
              .in("estimate_id", activeIds)
              .eq("status", "approved")
        );
        const coTotals: Record<string, number> = {};
        changeOrders.forEach((co: any) => {
          coTotals[co.estimate_id] =
            (coTotals[co.estimate_id] || 0) + (co.total_amount || 0);
        });

        // ---------- Build summaries ----------
        const summaries: EstimateSummary[] = activeEstimates.map((est) => {
          const originalTotal = est.total || 0;
          const coTotal = coTotals[est.id] || 0;
          const revisedTotal = originalTotal + coTotal;
          const subPaid = subTotals[est.id] || 0;
          const agentPaid = agentTotals[est.id] || 0;
          const otherExpenses = expenseTotals[est.id] || 0;
          const totalExpenses = subPaid + agentPaid + otherExpenses;
          const paymentsReceived = payTotals[est.id] || 0;
          const remainingBalance = revisedTotal - paymentsReceived;
          const profit = revisedTotal - totalExpenses;
          const profitMargin =
            revisedTotal > 0 ? (profit / revisedTotal) * 100 : 0;

          const clientObj = est.client as any;
          return {
            id: est.id,
            client_id: clientObj?.id || null,
            client_name: clientObj?.name || "Unassigned",
            estimate_number: est.estimate_number || "N/A",
            status: est.status || "unknown",
            created_at: est.created_at || new Date().toISOString(),
            revised_total: revisedTotal,
            subcontractor_paid: subPaid,
            subcontractors: subMap[est.id] || [],
            agent_paid: agentPaid,
            agents: agentMap[est.id] || [],
            other_expenses: otherExpenses,
            payments_received: paymentsReceived,
            remaining_balance: remainingBalance,
            profit: profit,
            profit_margin: profitMargin,
            invoice_count: invoiceCounts[est.id] || 0,
            last_payment_date: lastPaymentDates[est.id] || null,
          };
        });

        setData(summaries);
      } catch (err: any) {
        setError(err.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ---------- Filtering, sorting, totals ----------
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      const matchesSearch =
        row.estimate_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.client_name.toLowerCase().includes(searchTerm.toLowerCase());
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
    <div className="min-h-screen bg-slate-50/70 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">
          💰 Financial Summary by Estimate
        </h1>

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
  );
}