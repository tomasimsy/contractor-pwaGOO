"use client";

import { useCallback, useEffect, useState } from "react";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getCompanyPaymentsByDateRange, getOverdueInvoices } from "@/lib/queries/customerPayments";
import { getCompanyPendingPayoutsDetailed, type DetailedPendingPayout } from "@/lib/queries/expenses";
import { getProjectAnalytics, type ProjectAnalytics } from "@/lib/queries/analytics";

export interface PriorityItem {
  kind: "overdue_invoice" | "losing_job" | "payout_due";
  label: string;
  detail: string;
  amount: number;
  href: string;
}

export interface ActionableDashboardData {
  loading: boolean;
  moneyInToday: number;
  paymentsTodayCount: number;
  payouts: DetailedPendingPayout[]; // "Who needs to be paid?" — sorted, largest first
  losingJobs: ProjectAnalytics[]; // "Which jobs are losing money?" — negative profit, worst first
  overdueInvoices: Awaited<ReturnType<typeof getOverdueInvoices>>; // "What invoices are overdue?"
  priorities: PriorityItem[]; // "What's today's priority?" — top 3 most urgent items across all of the above
  reload: () => void;
}

/**
 * The data behind the redesigned dashboard's five questions (revenue in
 * today / who's owed money / which jobs are bleeding / what's overdue /
 * what to do first) — every number here comes from an existing query or
 * calculation function (getCompanyPaymentsByDateRange, getProjectAnalytics,
 * getCompanyPendingPayoutsDetailed, getOverdueInvoices) rather than a new
 * calculation, so this hook is purely assembly + a priority ranking on top.
 */
export function useActionableDashboard(): ActionableDashboardData {
  const [loading, setLoading] = useState(true);
  const [moneyInToday, setMoneyInToday] = useState(0);
  const [paymentsTodayCount, setPaymentsTodayCount] = useState(0);
  const [payouts, setPayouts] = useState<DetailedPendingPayout[]>([]);
  const [losingJobs, setLosingJobs] = useState<ProjectAnalytics[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<Awaited<ReturnType<typeof getOverdueInvoices>>>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const companyId = await getCompanyId();
      const today = new Date().toISOString().split("T")[0];

      const [payments, allPayouts, projects, overdue] = await Promise.all([
        getCompanyPaymentsByDateRange(companyId, today, today),
        getCompanyPendingPayoutsDetailed(companyId),
        getProjectAnalytics(companyId),
        getOverdueInvoices(companyId),
      ]);

      setMoneyInToday(payments.reduce((sum, p) => sum + p.amount, 0));
      setPaymentsTodayCount(payments.length);
      setPayouts(
        allPayouts
          .filter((p) => p.remainingAmount > 0)
          .sort((a, b) => b.remainingAmount - a.remainingAmount)
      );
      setLosingJobs(projects.filter((p) => p.profit < 0)); // already sorted worst-first by getProjectAnalytics
      setOverdueInvoices(overdue);
    } catch (error) {
      console.error("Error loading actionable dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // "What's today's priority?" — the single most urgent item from each
  // category, ranked by dollar amount so the biggest problem surfaces
  // first regardless of which category it came from.
  const priorities: PriorityItem[] = [
    ...overdueInvoices.slice(0, 1).map((inv): PriorityItem => ({
      kind: "overdue_invoice",
      label: `Overdue invoice #${inv.invoice_number}`,
      detail: `${(inv as any).clients?.name || "Client"} · due ${new Date(inv.due_date).toLocaleDateString()}`,
      amount: inv.remaining_balance,
      href: `/invoices/${inv.id}`,
    })),
    ...losingJobs.slice(0, 1).map((job): PriorityItem => ({
      kind: "losing_job",
      label: `${job.title || job.estimateNumber || "Job"} is losing money`,
      detail: `${job.clientName || "Client"} · ${job.profitMargin.toFixed(1)}% margin`,
      amount: Math.abs(job.profit),
      href: `/estimates/${job.estimateId}`,
    })),
    ...payouts.slice(0, 1).map((p): PriorityItem => ({
      kind: "payout_due",
      label: `Pay ${p.name}`,
      detail: `${p.roleDetail || (p.role === "agent" ? "Agent" : "Subcontractor")} · ${p.projectTitle}`,
      amount: p.remainingAmount,
      href: `/expense?project=${p.estimateId}`,
    })),
  ].sort((a, b) => b.amount - a.amount);

  return {
    loading,
    moneyInToday,
    paymentsTodayCount,
    payouts,
    losingJobs,
    overdueInvoices,
    priorities,
    reload: load,
  };
}
