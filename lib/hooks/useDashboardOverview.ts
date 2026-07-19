"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyPendingPayoutsSummary } from "@/lib/queries/expenses";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { filterActive } from "@/lib/queries/softDeleteFilter";

export interface DashboardOverviewStats {
  estimates: number;
  signed: number;
  converted: number;
  invoices: number;
  paid: number;
  pending: number;
}

/**
 * Recent-activity + alerts data shown on the Dashboard — extracted
 * verbatim from app/dashboard/page.tsx's own loadDashboard()/pending-payouts
 * effect so both the existing mobile dashboard and the new desktop
 * dashboard read the exact same queries/source of truth instead of one
 * of them re-deriving it. `reload` lets a page re-fetch after a
 * create/update/delete action elsewhere (same pattern as the Expense
 * page's refreshBundle).
 */
export function useDashboardOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardOverviewStats>({
    estimates: 0,
    signed: 0,
    converted: 0,
    invoices: 0,
    paid: 0,
    pending: 0,
  });
  const [recentEstimates, setRecentEstimates] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<{ count: number; totalRemaining: number } | null>(null);

  useEffect(() => {
    getCompanyId()
      .then((companyId) => getCompanyPendingPayoutsSummary(companyId))
      .then(setPendingPayouts)
      .catch(() => {});
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const todayString = new Date().toISOString().split("T")[0];

      const [estimatesRes, invoicesRes, recentEstRes, recentInvRes, overdueRes] = await Promise.all([
        filterActive(supabase.from("estimates").select("signature, status"), "estimates"),
        filterActive(supabase.from("invoices").select("status, remaining_balance"), "invoices"),
        filterActive(
          supabase
            .from("estimates")
            .select("id, created_at, total, estimate_number, title, clients(name), signature")
            .order("created_at", { ascending: false })
            .eq("is_completed", false)
            .limit(10),
          "estimates"
        ),
        filterActive(
          supabase
            .from("invoices")
            .select("id, created_at, total, invoice_number, clients(name), status")
            .order("created_at", { ascending: false })
            .limit(5),
          "invoices"
        ),
        filterActive(
          supabase
            .from("invoices")
            .select("id, invoice_number, total, remaining_balance, due_date, clients(name)")
            .lt("due_date", todayString)
            .neq("status", "paid"),
          "invoices"
        ),
      ]);

      const nextStats: DashboardOverviewStats = {
        estimates: estimatesRes.data?.length || 0,
        signed: 0,
        converted: 0,
        invoices: invoicesRes.data?.length || 0,
        paid: 0,
        pending: 0,
      };

      estimatesRes.data?.forEach((e) => {
        if (e.signature) nextStats.signed++;
        if (e.status === "converted") nextStats.converted++;
      });

      invoicesRes.data?.forEach((i) => {
        if (i.status === "paid") nextStats.paid++;
        else if ((i.remaining_balance || 0) > 0) nextStats.pending++;
      });

      setStats(nextStats);

      // Sort recent estimates: signed first, then by created_at descending
      let sortedRecentEstimates = recentEstRes.data || [];
      sortedRecentEstimates.sort((a, b) => {
        const aSigned = a.signature ? 1 : 0;
        const bSigned = b.signature ? 1 : 0;
        if (aSigned !== bSigned) return bSigned - aSigned; // signed first
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setRecentEstimates(sortedRecentEstimates.slice(0, 5)); // take top 5

      if (recentInvRes.data) setRecentInvoices(recentInvRes.data);
      if (overdueRes.data) setOverdueInvoices(overdueRes.data);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return { loading, stats, recentEstimates, recentInvoices, overdueInvoices, pendingPayouts, reload: loadDashboard };
}
