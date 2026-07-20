"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { calculateCompanyFinancials } from "@/lib/queries/financialCalculations";

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

      // Use unified engine for company-wide financials
      const now = new Date();
      const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const financials = await calculateCompanyFinancials(companyId, yearAgo, now);

      // Get monthly breakdown for current month
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthlyFinancials = await calculateCompanyFinancials(companyId, currentMonthStart, currentMonthEnd);

      // Get estimate counts
      const { data: estimates } = await supabase
        .from("estimates")
        .select("id, signature")
        .eq("company_id", companyId)
        .eq("is_deleted", false);

      const signedCount = estimates?.filter(e => e.signature).length || 0;

      // Get invoice counts
      const [invoiceCountRes, paidInvoicesRes, pendingInvoicesRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_deleted", false),
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_deleted", false)
          .eq("status", "paid"),
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_deleted", false)
          .neq("status", "paid"),
      ]);

      const invoiceCount = invoiceCountRes.count || 0;
      const paidCount = paidInvoicesRes.count || 0;
      const pendingCount = pendingInvoicesRes.count || 0;

      setStats({
        estimates: estimates?.length || 0,
        invoices: invoiceCount,
        signed: signedCount,
        converted: financials.convertedProjects,
        paid: paidCount,
        pending: pendingCount,
        totalRevenue: financials.totalRevenue,
        monthlyRevenue: monthlyFinancials.totalRevenue,
        totalSubcontractorPaid: financials.subcontractorPaid,
        totalSubcontractorAssigned: 0, // would need separate query
        totalAgentPaid: financials.agentPaid,
        totalAgentAssigned: 0, // would need separate query
        totalExpenses: financials.totalExpenses,
        grossProfit: financials.netProfit, // using netProfit as gross for now
        netProfit: financials.netProfit,
        grossMargin: financials.profitMargin,
        netMargin: financials.profitMargin,
        pendingSubPayments: financials.outstandingSubcontractor,
        pendingAgentPayments: financials.outstandingAgent,
        overdueInvoices: 0, // would need separate query
        monthlyProfit: monthlyFinancials.netProfit,
      });
    } catch (err) {
      console.error("Failed to load financial stats:", err);
    } finally {
      setLoading(false);
    }
  }

  return { stats, loading };
}
