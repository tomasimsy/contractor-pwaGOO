"use client";

/**
 * Real Dashboard content — every figure here is read from
 * FinancialEngine.getCompanyFinancials (revenue, payments, expenses,
 * net profit, outstanding invoices) or from EstimateService/
 * ProjectService's own status fields (pending/signed estimates, active
 * projects). Nothing on this page recomputes a financial number
 * itself — see lib/hooks/useDashboardData.ts's header for the full
 * composition.
 *
 * Company scoping: profile.companyId (this app's data model is one
 * profile -> one company today — see CompanySwitcher.tsx's own doc
 * comment). Date range: a preset picker resolving to the exact
 * DateRange shape getCompanyFinancials already accepts.
 */
import { useState } from "react";
import { DollarSign, Wallet, FileWarning, Receipt, TrendingUp, FileText, CheckCircle2, FolderKanban } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/components/providers/AuthProvider";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { DateRangeFilter, type DateRangePreset } from "@/components/dashboard/DateRangeFilter";
import { RevenueExpenseChart, RevenueExpenseChartSkeleton } from "@/components/dashboard/RevenueExpenseChart";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function DashboardPage() {
  const { profile } = useAuth();
  const [preset, setPreset] = useState<DateRangePreset>("this_month");
  const {
    loading, error, refresh, financials, projects, estimates, invoices, monthly,
    pendingEstimatesCount, signedEstimatesCount, activeProjectsCount,
  } = useDashboardData(profile?.companyId, preset);

  const isEmpty = !loading && !error && projects.length === 0 && estimates.length === 0 && invoices.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Your business at a glance."
        actions={<DateRangeFilter value={preset} onChange={setPreset} />}
      />

      {error && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => refresh()} className="font-medium underline">Retry</button>
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          icon={FolderKanban}
          title="Nothing to show yet"
          description="Once you have projects, estimates, or invoices, your business summary will appear here."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {loading || !financials ? (
              Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard label="Revenue" value={money(financials.totalRevenue)} icon={DollarSign} tone="success" />
                <StatCard label="Payments Received" value={money(financials.totalPaid)} icon={Wallet} />
                <StatCard
                  label="Outstanding Invoices"
                  value={money(financials.totalOutstanding)}
                  icon={FileWarning}
                  tone={financials.totalOutstanding > 0 ? "warning" : "neutral"}
                />
                <StatCard label="Expenses" value={money(financials.totalExpenses)} icon={Receipt} />
                <StatCard
                  label="Net Profit"
                  value={money(financials.netProfit)}
                  icon={TrendingUp}
                  tone={financials.netProfit >= 0 ? "success" : "danger"}
                  hint={`${financials.profitMargin.toFixed(1)}% margin`}
                />
                {/* All time, not scoped to the date-range picker above —
                    a "pending estimate" or "active project" count is a
                    present-tense fact, not a period figure, unlike the
                    cash tiles. Labeled explicitly so that stays a
                    deliberate distinction, not something that reads as
                    a stuck/non-updating card when the date range changes. */}
                <StatCard label="Pending Estimates" value={String(pendingEstimatesCount)} icon={FileText} hint="All time" />
                <StatCard label="Signed Estimates" value={String(signedEstimatesCount)} icon={CheckCircle2} tone="success" hint="All time" />
                <StatCard label="Active Projects" value={String(activeProjectsCount)} icon={FolderKanban} hint="All time" />
              </>
            )}
          </div>

          {loading ? <RevenueExpenseChartSkeleton /> : <RevenueExpenseChart data={monthly} />}

          {!loading && <RecentActivityFeed projects={projects} estimates={estimates} invoices={invoices} />}
        </div>
      )}
    </PageContainer>
  );
}
