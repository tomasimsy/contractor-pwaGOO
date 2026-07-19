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
  grossProfit: number;
  netProfit: number;
  monthlyProfit: number;
  grossMargin: number;
  netMargin: number;
  totalExpenses: number;
  totalSubcontractorPaid: number;
  totalAgentPaid: number;
  totalSubcontractorAssigned: number;
  totalAgentAssigned: number;
  pendingSubPayments: number;
  pendingAgentPayments: number;
  totalRevenue: number;
  monthlyRevenue: number;
  overdueInvoices: number;
};

const EMPTY_STATS: FinancialStats = {
  estimates: 0, invoices: 0, signed: 0, converted: 0, paid: 0, pending: 0,
  grossProfit: 0, netProfit: 0, monthlyProfit: 0, grossMargin: 0, netMargin: 0,
  totalExpenses: 0, totalSubcontractorPaid: 0, totalAgentPaid: 0,
  totalSubcontractorAssigned: 0, totalAgentAssigned: 0,
  pendingSubPayments: 0, pendingAgentPayments: 0, totalRevenue: 0, monthlyRevenue: 0, overdueInvoices: 0,
};

/**
 * Company-wide revenue/expense/profit rollup — NOW using same logic as Analytics page
 * to ensure Dashboard and Analytics show identical numbers.
 *
 * CRITICAL: Uses committed costs (max of assigned vs paid) for profit calculations,
 * not just paid costs, to match Expense page and Analytics calculations.
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
      // Get current company ID from profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;

      const companyId = profile.company_id;

      // Get ALL signed estimates, filtering by company
      const { data: estimates } = await supabase
        .from("estimates")
        .select("id, total, created_at, status, signature")
        .eq("company_id", companyId)
        .eq("is_deleted", false)
        .not("signature", "is", null)
        .order("created_at", { ascending: false });

      if (!estimates) return;

      // Fetch all cost data in parallel, filtered by company
      const [
        { data: invoices },
        { data: subPayments },
        { data: expenses },
        { data: agentPayments },
        { data: assignedSubs },
        { data: assignedAgents },
        { data: mileageTrips },
        { data: changeOrders },
      ] = await Promise.all([
        supabase.from("invoices").select("estimate_id, amount").eq("company_id", companyId).eq("is_deleted", false),
        supabase.from("subcontractor_payments").select("estimate_subcontractor_id, estimate_id, amount").eq("company_id", companyId).is("deleted_at", null),
        supabase.from("estimate_expenses").select("estimate_id, amount, tax").eq("company_id", companyId).is("deleted_at", null),
        supabase.from("agent_payments").select("estimate_id, amount, payment_type").eq("company_id", companyId).is("deleted_at", null),
        supabase.from("estimate_subcontractors").select("estimate_id, id, amount").eq("company_id", companyId).is("deleted_at", null),
        supabase.from("estimate_agents").select("estimate_id, id, agent_id, amount").eq("company_id", companyId).is("deleted_at", null),
        supabase.from("mileage_trips").select("estimate_id, reimbursement").eq("company_id", companyId).eq("status", "completed").is("deleted_at", null),
        supabase.from("change_orders").select("estimate_id, total_amount").eq("company_id", companyId).eq("status", "approved").is("deleted_at", null),
      ]);

      const groupBy = (arr: any[]) =>
        arr.reduce((acc: any, item: any) => {
          const id = item.estimate_id;
          if (!acc[id]) acc[id] = [];
          acc[id].push(item);
          return acc;
        }, {});

      const invoicesByEst = groupBy(invoices || []);
      const subPaymentsByEst = groupBy(subPayments || []);
      const expensesByEst = groupBy(expenses || []);
      const agentPaymentsByEst = groupBy(agentPayments || []);
      const assignedSubsByEst = groupBy(assignedSubs || []);
      const assignedAgentsByEst = groupBy(assignedAgents || []);
      const mileageByEst = groupBy(mileageTrips || []);
      const changeOrdersByEst = groupBy(changeOrders || []);

      let totalRevenue = 0, totalExpenses = 0, totalSubAssigned = 0, totalAgentAssigned = 0;
      let totalSubPaid = 0, totalAgentPaid = 0, pendingSubPayments = 0, pendingAgentPayments = 0;
      let overdueInvoices = 0, grossProfit = 0, netProfit = 0;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      let monthlyRevenue = 0, monthlyProfit = 0;

      for (const est of estimates) {
        // Revenue: include approved change orders (revised total)
        const estInvoices = invoicesByEst[est.id] || [];
        const invoiceTotal = estInvoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
        const changeOrderTotal = (changeOrdersByEst[est.id] || []).reduce((sum: number, co: any) => sum + (co.total_amount || 0), 0);
        const revenue = (est.total || 0) + changeOrderTotal;

        totalRevenue += revenue;
        const estDate = new Date(est.created_at);
        if (estDate.getMonth() === currentMonth && estDate.getFullYear() === currentYear) {
          monthlyRevenue += revenue;
        }

        // Expenses: material + labor + other (with tax) + subcontractor committed + agent + mileage
        const estExpenses = expensesByEst[est.id] || [];
        const expenseTotal = estExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0) + (e.tax || 0), 0);

        // Subcontractor: max(assigned, paid) PER SUBCONTRACTOR - committed cost
        const estSubPayments = subPaymentsByEst[est.id] || [];
        const paidBySubAssignmentId = new Map<string, number>();
        for (const p of estSubPayments) {
          const current = paidBySubAssignmentId.get(p.estimate_subcontractor_id) || 0;
          paidBySubAssignmentId.set(p.estimate_subcontractor_id, current + p.amount);
        }

        const estAssignedSubs = assignedSubsByEst[est.id] || [];
        let subCommitted = 0;
        let subAssigned = 0;
        let subPaid = 0;

        for (const sub of estAssignedSubs) {
          const assigned = sub.amount || 0;
          const paid = paidBySubAssignmentId.get(sub.id) || 0;
          subAssigned += assigned;
          subPaid += paid;
          subCommitted += Math.max(assigned, paid);
        }

        totalSubAssigned += subAssigned;
        totalSubPaid += subPaid;
        pendingSubPayments += Math.max(0, subAssigned - subPaid);

        // Agent: commissions and reimbursements
        const estAgentPayments = agentPaymentsByEst[est.id] || [];
        const agentCommissions = estAgentPayments
          .filter((a: any) => a.payment_type !== 'reimbursement')
          .reduce((sum: number, a: any) => sum + a.amount, 0);
        const agentReimbursements = estAgentPayments
          .filter((a: any) => a.payment_type === 'reimbursement')
          .reduce((sum: number, a: any) => sum + a.amount, 0);
        const agentPaid = agentCommissions + agentReimbursements;

        const estAssignedAgents = assignedAgentsByEst[est.id] || [];
        const agentAssigned = estAssignedAgents.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);

        totalAgentAssigned += agentAssigned;
        totalAgentPaid += agentPaid;
        pendingAgentPayments += Math.max(0, agentAssigned - agentPaid);

        // Mileage costs
        const mileageTotal = (mileageByEst[est.id] || []).reduce((sum: number, m: any) => sum + (m.reimbursement || 0), 0);

        const totalEstExpenses = expenseTotal + subCommitted + agentPaid + mileageTotal;
        totalExpenses += totalEstExpenses;

        // Gross profit = revenue - paid costs only (commissions only, not reimbursements)
        const estGrossProfit = revenue - (expenseTotal + subPaid + agentCommissions + mileageTotal);
        grossProfit += estGrossProfit;

        // Net profit = revenue - committed costs (all agent payments including reimbursements)
        const estNetProfit = revenue - totalEstExpenses;
        netProfit += estNetProfit;

        if (estDate.getMonth() === currentMonth && estDate.getFullYear() === currentYear) {
          monthlyProfit += estNetProfit;
        }

        // Count overdue invoices
        overdueInvoices += estInvoices.filter((inv: any) => inv.due_date && new Date(inv.due_date) < now).length;
      }

      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      setStats({
        estimates: estimates.length,
        invoices: (invoices || []).length,
        signed: 0,
        converted: 0,
        paid: 0,
        pending: 0,
        totalRevenue,
        monthlyRevenue,
        totalSubcontractorPaid: totalSubPaid,
        totalSubcontractorAssigned: totalSubAssigned,
        totalAgentPaid,
        totalAgentAssigned,
        totalExpenses,
        grossProfit,
        netProfit,
        grossMargin,
        netMargin,
        pendingSubPayments,
        pendingAgentPayments,
        overdueInvoices,
        monthlyProfit,
      });
    } catch (err) {
      console.error("Failed to load financial stats:", err);
    } finally {
      setLoading(false);
    }
  }

  return { stats, loading };
}
