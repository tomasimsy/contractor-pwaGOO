"use client";

/**
 * All dashboard data in one place, composed ENTIRELY from existing
 * services — no new calculations. The date-ranged stat tiles and the
 * monthly chart both call FinancialEngine.getCompanyFinancials, the
 * one function that already knows how to derive revenue/payments/
 * expenses/profit/outstanding for a range; this hook only decides
 * WHICH ranges to ask for and how to fan the results out to the UI.
 */
import { useCallback, useMemo, useState } from "react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useRefreshableResource } from "./useAsyncResource";
import { resolveDateRangePreset, type DateRangePreset } from "@/components/dashboard/DateRangeFilter";
import type { MonthlyPoint } from "@/components/dashboard/RevenueExpenseChart";
import type { CompanyFinancials } from "@/lib/services/types";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";
import type { Invoice } from "@/lib/services/invoiceService";

const MONTHS_IN_CHART = 12;

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function useDashboardData(companyId: string | undefined, preset: DateRangePreset) {
  const { financialEngine, projectService, estimateService, invoiceService } = useServices();
  const [financials, setFinancials] = useState<CompanyFinancials | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);

  const dateRange = useMemo(() => resolveDateRangePreset(preset), [preset]);

  const { loading, error, refresh } = useRefreshableResource(async () => {
    if (!companyId) return;

    const [companyFinancials, projectList, estimateList, invoiceList] = await Promise.all([
      financialEngine.getCompanyFinancials({ companyId, dateRange }),
      projectService.list({ companyId }),
      estimateService.list({ companyId }),
      invoiceService.listForCompany({ companyId }),
    ]);
    setFinancials(companyFinancials);
    setProjects(projectList);
    setEstimates(estimateList);
    setInvoices(invoiceList);

    // Monthly chart: same getCompanyFinancials call, one per of the
    // last 12 calendar months, run in parallel — no separate formula,
    // just a different dateRange per bucket (see the file header).
    const now = new Date();
    const months = Array.from({ length: MONTHS_IN_CHART }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS_IN_CHART - 1 - i), 1);
      return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0), label: monthLabel(d) };
    });
    const monthlyResults = await Promise.all(
      months.map((m) => financialEngine.getCompanyFinancials({ companyId, dateRange: { start: m.start, end: m.end } }))
    );
    setMonthly(monthlyResults.map((f, i) => ({ label: months[i].label, revenue: f.totalRevenue, expenses: f.totalExpenses })));
  }, [financialEngine, projectService, estimateService, invoiceService, companyId, dateRange]);

  const pendingEstimatesCount = estimates.filter((e) => e.status === "draft" || e.status === "sent" || e.status === "viewed").length;
  const signedEstimatesCount = estimates.filter((e) => e.status === "approved" || e.status === "converted_to_invoice").length;
  const activeProjectsCount = projects.filter((p) => p.status === "active" || p.status === "in_progress").length;

  return {
    loading,
    error,
    refresh,
    financials,
    projects,
    estimates,
    invoices,
    monthly,
    pendingEstimatesCount,
    signedEstimatesCount,
    activeProjectsCount,
  };
}
