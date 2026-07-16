"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type FinancialStats = {
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

const EMPTY_STATS: FinancialStats = {
  estimates: 0, invoices: 0, signed: 0, converted: 0, paid: 0, pending: 0,
  netProfit: 0, monthlyProfit: 0, profitMargin: 0, totalExpenses: 0,
  totalSubcontractorPaid: 0, totalAgentPaid: 0, pendingSubPayments: 0,
  pendingAgentPayments: 0, totalRevenue: 0, monthlyRevenue: 0, overdueInvoices: 0,
};

/**
 * Company-wide revenue/expense/profit rollup — extracted verbatim from
 * FinancialDashboard.tsx (which now just consumes this hook) so the new
 * desktop dashboard can show the same numbers without re-fetching or
 * re-deriving them a second way. Single source of truth for both.
 */
export function useFinancialStats() {
  const [stats, setStats] = useState<FinancialStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFinancialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return { stats, loading };
}
