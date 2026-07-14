import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, DollarSign, Users, Receipt, FileText, TrendingUp } from "lucide-react";

type Params = Promise<{ id: string }>;

export default async function EstimateReportPage({ params }: { params: Params }) {
  const { id } = await params;

  // ---- Helper: safe fetch (same as main report) ----
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

  // ---- 1. Estimate & client ----
  const { data: estimate, error: estError } = await supabase
    .from("estimates")
    .select(`
      id,
      estimate_number,
      title,
      status,
      created_at,
      total,
      description,
      notes,
      client:client_id (id, name, email, phone, address)
    `)
    .eq("id", id)
    .single();

  if (estError || !estimate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-md text-center">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Estimate Not Found</h2>
          <p className="text-sm text-slate-500">ID: {id}</p>
          {estError && <p className="text-xs text-red-500 mt-2">{estError.message}</p>}
          <Link href="/reports/expenses" className="mt-4 inline-block text-sm text-emerald-600 hover:underline">
            ← Back to Reports
          </Link>
        </div>
      </div>
    );
  }

  // ---- 2. Estimate items (subtotal) ----
  const items = await safeFetch(
    "estimate_items",
    (q: any) => q.select("total, project_name").eq("estimate_id", id)
  );
  const originalSubtotal = items.reduce((sum: number, i: any) => sum + (i.total || 0), 0);

  // ---- 3. Subcontractor payments ----
  const subContractors = await safeFetch(
    "estimate_subcontractors",
    (q: any) => q.select("id, subcontractor_id, subcontractor:subcontractor_id (name)").eq("estimate_id", id)
  );

  const subNameMap: Record<string, string> = {};
  subContractors.forEach((sc: any) => {
    subNameMap[sc.id] = sc.subcontractor?.name || "Unknown Subcontractor";
  });
  const subEstIds = Object.keys(subNameMap);

  let subPayments: any[] = [];
  if (subEstIds.length > 0) {
    subPayments = await safeFetch(
      "subcontractor_payments",
      (q: any) => q.select("id, amount, payment_date, notes, estimate_subcontractor_id, change_order_id")
          .in("estimate_subcontractor_id", subEstIds)
          .is("deleted_at", null)
    );
  }

  const subPaymentDetails = subPayments.map((p: any) => ({
    id: p.id,
    amount: p.amount || 0,
    paid_at: p.payment_date,
    notes: p.notes,
    subcontractor_name: subNameMap[p.estimate_subcontractor_id] || "Unknown",
    change_order_id: p.change_order_id ?? null,
  }));
  const totalSubPaid = subPaymentDetails.reduce((sum: number, p: any) => sum + p.amount, 0);

  // ---- 4. Agent payments ----
  const agentPayments = await safeFetch(
    "agent_payments",
    (q: any) => q.select("id, amount, payment_date, notes, agent:agent_id (name), change_order_id").eq("estimate_id", id).is("deleted_at", null)
  );
  const agentPaymentDetails = agentPayments.map((p: any) => ({
    id: p.id,
    amount: p.amount || 0,
    paid_at: p.payment_date,
    notes: p.notes,
    agent_name: p.agent?.name || "Unknown Agent",
    change_order_id: p.change_order_id ?? null,
  }));
  const totalAgentPaid = agentPaymentDetails.reduce((sum: number, p: any) => sum + p.amount, 0);

  // ---- 5. Other expenses ----
  const expenses = await safeFetch(
    "estimate_expenses",
    (q: any) => q.select("id, amount, expense_date, description, category, change_order_id").eq("estimate_id", id).is("deleted_at", null)
  );
  const expenseDetails = expenses.map((e: any) => ({
    id: e.id,
    amount: e.amount || 0,
    date: e.expense_date,
    description: e.description,
    category: e.category || "General",
    change_order_id: e.change_order_id ?? null,
  }));
  const totalOtherExpenses = expenseDetails.reduce((sum: number, e: any) => sum + e.amount, 0);

  // ---- 6. Invoices (payments received) ----
  const invoices = await safeFetch(
    "invoices",
    (q: any) => q.select("id, invoice_number, amount_paid, status, created_at")
        .eq("estimate_id", id)
        .in("status", ["paid", "partial"])
  );
  const invoicePayments = invoices.map((inv: any) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    amount_paid: inv.amount_paid || 0,
    status: inv.status,
    paid_at: inv.created_at,
  }));
  const totalPayments = invoicePayments.reduce((sum: number, p: any) => sum + p.amount_paid, 0);

  // ---- 7. Change orders ----
  const changeOrders = await safeFetch(
    "change_orders",
    (q: any) => q.select("*").eq("estimate_id", id).neq("status", "draft").order("created_at", { ascending: false })
  );
  const changeOrderDetails = changeOrders.map((co: any) => ({
    id: co.id,
    change_order_number: co.change_order_number,
    title: co.title,
    description: co.description,
    status: co.status,
    total_amount: co.total_amount || 0,
    created_at: co.created_at,
  }));
  const approvedTotal = changeOrderDetails
    .filter((co: any) => co.status === "approved")
    .reduce((sum: number, co: any) => sum + co.total_amount, 0);
  const pendingTotal = changeOrderDetails
    .filter((co: any) => co.status === "pending")
    .reduce((sum: number, co: any) => sum + co.total_amount, 0);

  // ---- 8. Financial calculations ----
  const revisedTotal = originalSubtotal + approvedTotal;
  const totalExpenses = totalSubPaid + totalAgentPaid + totalOtherExpenses;
  const profit = revisedTotal - totalExpenses;
  const profitMargin = revisedTotal > 0 ? (profit / revisedTotal) * 100 : 0;

  // ---- 9. Subtotals by Change Order — distinguishes original-estimate
  // spend from spend tied to a specific change order, across all three
  // expense/payment tables now that each carries an optional change_order_id.
  const changeOrderNumberById: Record<string, string> = {};
  changeOrderDetails.forEach((co: any) => {
    changeOrderNumberById[co.id] = co.change_order_number;
  });
  const allEntries = [
    ...subPaymentDetails.map((p: any) => ({ change_order_id: p.change_order_id, amount: p.amount })),
    ...agentPaymentDetails.map((p: any) => ({ change_order_id: p.change_order_id, amount: p.amount })),
    ...expenseDetails.map((e: any) => ({ change_order_id: e.change_order_id, amount: e.amount })),
  ];
  const subtotalsByGroup: { label: string; total: number }[] = [];
  const originalEstimateSpend = allEntries
    .filter((e) => !e.change_order_id)
    .reduce((sum, e) => sum + e.amount, 0);
  subtotalsByGroup.push({ label: "Original Estimate", total: originalEstimateSpend });
  for (const co of changeOrderDetails) {
    const total = allEntries
      .filter((e) => e.change_order_id === co.id)
      .reduce((sum, e) => sum + e.amount, 0);
    if (total !== 0) subtotalsByGroup.push({ label: `${co.change_order_number} — ${co.title}`, total });
  }

  // ---- 9. Render ----
  return (
    <div className="min-h-screen bg-slate-50/70 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/reports/expenses" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Financial Report – #{estimate.estimate_number}</h1>
            {estimate.title && <p className="text-sm text-slate-500">{estimate.title}</p>}
          </div>
          <span className={`ml-auto text-[10px] font-bold uppercase px-2 py-1 rounded-md ${
            estimate.status === "approved" ? "bg-green-100 text-green-800" :
            estimate.status === "converted" ? "bg-blue-100 text-blue-800" :
            estimate.status === "completed" ? "bg-purple-100 text-purple-800" :
            "bg-gray-100 text-gray-600"
          }`}>
            {estimate.status}
          </span>
        </div>

        {/* Client & Estimate Info */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Client</div>
            {/* <div className="text-sm font-bold text-slate-800 capitalize">{estimate.client?.name || "Unassigned"}</div>
            {estimate.client?.email && <div className="text-xs text-slate-500">{estimate.client.email}</div>}
            {estimate.client?.phone && <div className="text-xs text-slate-500">{estimate.client.phone}</div>}
            {estimate.client?.address && <div className="text-xs text-slate-400 mt-1">{estimate.client.address}</div>} */}
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Estimate Details</div>
            <div className="text-sm font-bold text-slate-800">#{estimate.estimate_number}</div>
            <div className="text-xs text-slate-500">Issued: {formatDate(estimate.created_at)}</div>
            {estimate.description && <div className="text-xs text-slate-600 italic mt-1 max-w-xs ml-auto">{estimate.description}</div>}
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-emerald-600" />
            Financial Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[10px] uppercase text-slate-400 tracking-wider">Original Subtotal</div>
              <div className="font-bold text-slate-800">{formatCurrency(originalSubtotal)}</div>
            </div>
            {approvedTotal !== 0 && (
              <div>
                <div className="text-[10px] uppercase text-slate-400 tracking-wider">Approved COs</div>
                <div className="font-bold text-emerald-600">+{formatCurrency(approvedTotal)}</div>
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase text-slate-400 tracking-wider">Revised Total</div>
              <div className="font-bold text-lg text-slate-900">{formatCurrency(revisedTotal)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400 tracking-wider">Payments Received</div>
              <div className="font-bold text-emerald-600">{formatCurrency(totalPayments)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400 tracking-wider">Remaining Balance</div>
              <div className="font-bold text-blue-600">{formatCurrency(revisedTotal - totalPayments)}</div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <div className="text-[10px] uppercase text-slate-400 tracking-wider">Total Expenses</div>
              <div className="font-bold text-rose-600">{formatCurrency(totalExpenses)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400 tracking-wider">Company Profit</div>
              <div className="font-bold text-indigo-600">{formatCurrency(profit)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400 tracking-wider">Profit Margin</div>
              <div className="font-bold text-indigo-700">{profitMargin.toFixed(1)}%</div>
            </div>
          </div>
          {pendingTotal !== 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex justify-between items-center">
              <span className="text-sm font-bold text-yellow-800">Pending Change Orders</span>
              <span className="text-sm font-bold text-yellow-900">+{formatCurrency(pendingTotal)}</span>
            </div>
          )}
        </div>

        {/* Breakdown Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Subcontractor Payments */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Users size={16} className="text-rose-500" />
              Subcontractor Payments
              <span className="ml-auto text-xs font-normal text-slate-400">{subPaymentDetails.length}</span>
            </h3>
            {subPaymentDetails.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No subcontractor payments recorded.</p>
            ) : (
              <div className="space-y-2">
                {subPaymentDetails.map((p: any) => (
                  <div key={p.id} className="flex justify-between items-start border-b border-slate-100 py-1.5">
                    <div>
                      <div className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                        {p.subcontractor_name}
                        {p.change_order_id && (
                          <span className="text-[9px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">
                            {changeOrderNumberById[p.change_order_id] || "CO"}
                          </span>
                        )}
                      </div>
                      {p.notes && <div className="text-[10px] text-slate-400 italic">{p.notes}</div>}
                      <div className="text-[10px] text-slate-400">{formatDate(p.paid_at)}</div>
                    </div>
                    <div className="text-xs font-mono font-bold text-rose-600">{formatCurrency(p.amount)}</div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm">
                  <span>Total</span>
                  <span className="text-rose-600">{formatCurrency(totalSubPaid)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Agent Payments */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Users size={16} className="text-amber-500" />
              Agent Payments
              <span className="ml-auto text-xs font-normal text-slate-400">{agentPaymentDetails.length}</span>
            </h3>
            {agentPaymentDetails.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No agent payments recorded.</p>
            ) : (
              <div className="space-y-2">
                {agentPaymentDetails.map((p: any) => (
                  <div key={p.id} className="flex justify-between items-start border-b border-slate-100 py-1.5">
                    <div>
                      <div className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                        {p.agent_name}
                        {p.change_order_id && (
                          <span className="text-[9px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">
                            {changeOrderNumberById[p.change_order_id] || "CO"}
                          </span>
                        )}
                      </div>
                      {p.notes && <div className="text-[10px] text-slate-400 italic">{p.notes}</div>}
                      <div className="text-[10px] text-slate-400">{formatDate(p.paid_at)}</div>
                    </div>
                    <div className="text-xs font-mono font-bold text-amber-600">{formatCurrency(p.amount)}</div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm">
                  <span>Total</span>
                  <span className="text-amber-600">{formatCurrency(totalAgentPaid)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Other Expenses */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 md:col-span-2">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Receipt size={16} className="text-slate-500" />
              Other Expenses
              <span className="ml-auto text-xs font-normal text-slate-400">{expenseDetails.length}</span>
            </h3>
            {expenseDetails.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No other expenses recorded.</p>
            ) : (
              <div className="space-y-2">
                {expenseDetails.map((e: any) => (
                  <div key={e.id} className="flex justify-between items-start border-b border-slate-100 py-1.5">
                    <div>
                      <div className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                        {e.description || e.category}
                        {e.change_order_id && (
                          <span className="text-[9px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">
                            {changeOrderNumberById[e.change_order_id] || "CO"}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">{e.category} • {formatDate(e.date)}</div>
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-600">{formatCurrency(e.amount)}</div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm">
                  <span>Total</span>
                  <span className="text-slate-600">{formatCurrency(totalOtherExpenses)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Invoice Payments */}
        {invoicePayments.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <FileText size={16} className="text-emerald-500" />
              Client Payments (Invoices)
              <span className="ml-auto text-xs font-normal text-slate-400">{invoicePayments.length}</span>
            </h3>
            <div className="space-y-2">
              {invoicePayments.map((p: any) => (
                <div key={p.id} className="flex justify-between items-start border-b border-slate-100 py-1.5">
                  <div>
                    <div className="text-xs font-medium text-slate-800">Invoice #{p.invoice_number}</div>
                    <div className="text-[10px] text-slate-400 capitalize">Status: {p.status} • {formatDate(p.paid_at)}</div>
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-600">{formatCurrency(p.amount_paid)}</div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm">
                <span>Total Payments</span>
                <span className="text-emerald-600">{formatCurrency(totalPayments)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Subtotals by Change Order — clearly distinguishes spend tied
            to the original estimate from spend tied to a specific
            change order, across subcontractor payments, agent
            payments, and other expenses combined. */}
        {subtotalsByGroup.length > 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Receipt size={16} className="text-indigo-500" />
              Expense Subtotals by Change Order
            </h3>
            <div className="space-y-2">
              {subtotalsByGroup.map((g) => (
                <div key={g.label} className="flex justify-between items-center border-b border-slate-100 py-1.5 last:border-0">
                  <span className="text-xs font-medium text-slate-700">{g.label}</span>
                  <span className="text-xs font-mono font-bold text-slate-800">{formatCurrency(g.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Change Orders */}
        {changeOrderDetails.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-blue-500" />
              Change Orders
              <span className="ml-auto text-xs font-normal text-slate-400">{changeOrderDetails.length}</span>
            </h3>
            <div className="space-y-3">
              {changeOrderDetails.map((co: any) => (
                <div key={co.id} className={`p-3 rounded-lg border ${
                  co.status === "approved" ? "border-emerald-100 bg-emerald-50/30" :
                  "border-amber-100 bg-amber-50/30"
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-500">{co.change_order_number}</span>
                        <span className="text-xs font-bold text-slate-800">{co.title}</span>
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          co.status === "approved" ? "bg-emerald-200 text-emerald-800" : "bg-amber-200 text-amber-800"
                        }`}>
                          {co.status}
                        </span>
                      </div>
                      {co.description && <div className="text-xs text-slate-500 italic mt-1">{co.description}</div>}
                    </div>
                    <div className={`text-xs font-mono font-bold ${
                      co.total_amount >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {co.total_amount >= 0 ? "+" : "-"}{formatCurrency(Math.abs(co.total_amount))}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm">
                <span>Total Approved</span>
                <span className="text-emerald-600">{formatCurrency(approvedTotal)}</span>
              </div>
              {pendingTotal !== 0 && (
                <div className="flex justify-between text-amber-700 bg-amber-50 p-2 rounded-lg -mx-2">
                  <span>Pending Total</span>
                  <span>{formatCurrency(pendingTotal)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-center text-xs text-slate-400 mt-8">
          Report generated on {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  );
}