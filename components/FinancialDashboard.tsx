"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { DollarSign, TrendingUp, Receipt, AlertCircle } from "lucide-react";

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
    estimates: 0, invoices: 0, signed: 0, converted: 0, paid: 0, pending: 0,
    netProfit: 0, monthlyProfit: 0, profitMargin: 0, totalExpenses: 0,
    totalSubcontractorPaid: 0, totalAgentPaid: 0, pendingSubPayments: 0,
    pendingAgentPayments: 0, totalRevenue: 0, monthlyRevenue: 0, overdueInvoices: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFinancialData();
  }, []);

  async function loadFinancialData() {
    setLoading(true);
    try {
      const { data: estimates } = await supabase
        .from("estimates")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!estimates) return;

      const [invoicesRes, subRes, expenseRes, agentRes, assignedSubsRes, assignedAgentsRes] = await Promise.all([
        supabase.from("invoices").select("estimate_id, status, due_date, invoice_payments(amount)").filter("invoice_payments.deleted_at", "is", null),
        supabase.from("subcontractor_payments").select("estimate_id, amount").is("deleted_at", null),
        supabase.from("estimate_expenses").select("estimate_id, amount").is("deleted_at", null),
        supabase.from("agent_payments").select("estimate_id, amount").is("deleted_at", null),
        supabase.from("estimate_subcontractors").select("estimate_id, amount").is("deleted_at", null),
        supabase.from("estimate_agents").select("estimate_id, amount").is("deleted_at", null),
      ]);

      const invoices = invoicesRes.data || [];
      const subPayments = subRes.data || [];
      const expenses = expenseRes.data || [];
      const agentPayments = agentRes.data || [];
      const assignedSubs = assignedSubsRes.data || [];
      const assignedAgents = assignedAgentsRes.data || [];

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

      let totalRevenue = 0, totalSubPaid = 0, totalExpenses = 0, totalAgentPaid = 0;
      let pendingSubPayments = 0, pendingAgentPayments = 0, overdueInvoices = 0;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      let monthlyRevenue = 0, monthlyProfit = 0;

      for (const est of estimates) {
        const estInvoices = invoicesByEst[est.id] || [];
        const estSubs = subByEst[est.id] || [];
        const estExpenses = expByEst[est.id] || [];
        const estAgents = agentByEst[est.id] || [];
        const estAssignedSubs = assignedSubsByEst[est.id] || [];
        const estAssignedAgents = assignedAgentsByEst[est.id] || [];

        const revenue = estInvoices.reduce((sum: number, inv: any) => {
          const payments = inv.invoice_payments?.reduce((s: number, p: any) => s + p.amount, 0) || 0;
          return sum + payments;
        }, 0) || 0;

        totalRevenue += revenue;
        const estDate = new Date(est.created_at);
        if (estDate.getMonth() === currentMonth && estDate.getFullYear() === currentYear) {
          monthlyRevenue += revenue;
        }

        const subPaid = estSubs.reduce((sum: number, s: any) => sum + s.amount, 0) || 0;
        const expenseTotal = estExpenses.reduce((sum: number, e: any) => sum + e.amount, 0) || 0;
        const agentPaid = estAgents.reduce((sum: number, a: any) => sum + a.amount, 0) || 0;

        totalSubPaid += subPaid;
        totalExpenses += expenseTotal;
        totalAgentPaid += agentPaid;

        const subAssigned = estAssignedSubs.reduce((sum: number, s: any) => sum + (s.amount || 0), 0) || 0;
        const agentAssigned = estAssignedAgents.reduce((sum: number, a: any) => sum + (a.amount || 0), 0) || 0;

        pendingSubPayments += Math.max(0, subAssigned - subPaid);
        pendingAgentPayments += Math.max(0, agentAssigned - agentPaid);

        const profit = revenue - subPaid - expenseTotal - agentPaid;
        if (estDate.getMonth() === currentMonth && estDate.getFullYear() === currentYear) {
          monthlyProfit += profit;
        }

        const hasOverdue = estInvoices.some(
          (inv: any) => inv.status !== "paid" && inv.due_date && new Date(inv.due_date) < new Date()
        );
        if (hasOverdue) overdueInvoices++;
      }

      const netProfit = totalRevenue - totalSubPaid - totalExpenses - totalAgentPaid;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      setStats({
        estimates: estimates.length, invoices: invoices.length, signed: 0, converted: 0, paid: 0, pending: 0,
        totalRevenue, monthlyRevenue, totalSubcontractorPaid: totalSubPaid, totalAgentPaid,
        totalExpenses, netProfit, profitMargin, pendingSubPayments, pendingAgentPayments,
        overdueInvoices, monthlyProfit,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

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

        {/* Net Profit Card — Complementary Soft Sage Teal Accent */}
        <div className="rounded-xl bg-teal-50/30 p-3 border border-teal-100/60">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Net Profit</span>
            <TrendingUp size={13} className="text-teal-600" />
          </div>
          <div className="text-sm font-semibold text-teal-950 mt-1">
            {formatCurrency(stats.netProfit)}
          </div>
          <div className="text-[9px] text-teal-600/80 mt-1.5 pt-1.5 border-t border-teal-100/40">
            Margin: <span className="font-bold">{stats.profitMargin.toFixed(1)}%</span>
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
            Subs: <span className="font-medium text-slate-600">{formatCurrency(stats.totalSubcontractorPaid)}</span>
          </div>
        </div>

        {/* Pending Payouts Card — Soft Warm Gold/Amber Accent */}
        <div className="rounded-xl bg-amber-50/40 p-3 border border-amber-100/70">
          <div className="flex items-center justify-between text-amber-700/80">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Pending</span>
            <AlertCircle size={13} className="text-amber-600" />
          </div>
          <div className="text-sm font-semibold text-amber-950 mt-1">
            {formatCurrency(stats.pendingSubPayments + stats.pendingAgentPayments)}
          </div>
          <div className="text-[9px] text-amber-600 mt-1.5 pt-1.5 border-t border-amber-100/50 truncate">
            Subs: <span className="font-medium">{formatCurrency(stats.pendingSubPayments)}</span>
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