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
import { useState, useMemo } from "react";
import Link from "next/link";
import { useEffect } from "react";
import { DollarSign, Wallet, FileWarning, Receipt, TrendingUp, FileText, CheckCircle2, FolderKanban, Plus, HandCoins }
from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useAuth } from "@/components/providers/AuthProvider";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { DateRangeFilter, type DateRangePreset } from "@/components/dashboard/DateRangeFilter";
import { RevenueExpenseChart, RevenueExpenseChartSkeleton } from "@/components/dashboard/RevenueExpenseChart";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { useServices } from "@/components/providers/ServicesProvider";
import { getActionablePayables, type ActionablePayables } from "@/lib/services/payablesWorklist";
import { isOutstandingInvoiceStatus, formatMoney } from "@/components/invoices/invoiceStatus";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function DashboardContent() {
const { profile } = useAuth();
const [preset, setPreset] = useState<DateRangePreset>("this_year");
  const [payables, setPayables] = useState<ActionablePayables | null>(null);
    const services = useServices();

    // Not period-scoped, on purpose: a debt does not stop existing
    // because the date filter above moved. getPayablesSummary is called
    // without a dateRange for the same reason.
    useEffect(() => {
    const companyId = profile?.companyId;
    if (!companyId) return;
    let active = true;
    getActionablePayables(services, companyId)
    .then((p) => { if (active) setPayables(p); })
    .catch(() => { /* the tile is informational; never break the page */ });
    return () => { active = false; };
    }, [services, profile?.companyId]);

    const {
    loading, error, refresh, financials, projects, estimates, invoices, monthly,
    pendingEstimatesCount, signedEstimatesCount, activeProjectsCount,
    } = useDashboardData(profile?.companyId, preset);

    const isEmpty = !loading && !error && projects.length === 0 && estimates.length === 0 && invoices.length === 0;

    // Same population as the Outstanding Invoices tile above and the
    // red "Unpaid" pill on the Invoices list itself (isOutstandingInvoiceStatus) —
    // shown here as an actual list, not just a count, so an unpaid
    // invoice is visible without leaving the dashboard. Worst-first,
    // biggest dollar amount on top.
    const projectsById = useMemo(
      () => Object.fromEntries(projects.map((p) => [p.id, p])),
      [projects]
    );
    const unpaidInvoices = useMemo(
      () =>
        invoices
          .filter((i) => isOutstandingInvoiceStatus(i.status))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5),
      [invoices]
    );

    return (
    <PageContainer>

  

      <PageHeader title="Dashboard" description={ <span className="hidden sm:inline">
        Your business at a glance.
        </span>
        }
        actions={
        <div className="flex items-center gap-2">
          {/* Entry point for the expense flow that asks who fronted the
          money before opening the form (/expense-v2). */}
          {/* <Link href="/expense-v2"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 sm:text-sm">
          <Plus className="size-4" /> Expense
          </Link> */}
          <DateRangeFilter value={preset} onChange={setPreset} />
        </div>
        }
        />

        {error && (
        <div
          className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={()=> refresh()} className="font-medium underline">Retry</button>
        </div>
        )}

        {isEmpty ? (
        <EmptyState icon={FolderKanban} title="Nothing to show yet"
          description="Once you have projects, estimates, or invoices, your business summary will appear here." />
        ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
            {loading || !financials ? (
            Array.from({ length: 8 }).map((_, i) => (
            <StatCardSkeleton key={i} />
            ))
            ) : (
            <>
              <StatCard label="Revenue" value={money(financials.totalRevenue)} icon={DollarSign} tone="success"
                size="sm" />
              <StatCard label="Payments Received" value={money(financials.totalPaid)} icon={Wallet} size="sm" />
              {/* Same "not yet collected" fact the Invoices list badges
              in red per-row (isUnpaidInvoiceStatus) — counted here from
              the same invoices array so the two surfaces can never
              disagree. */}
              <Link href="/invoices" className="contents">
              <StatCard label="Outstanding Invoices" value={money(financials.totalOutstanding)} icon={FileWarning}
                tone={financials.totalOutstanding> 0 ? "danger" : "neutral"}
                hint={(() => {
                  const outstandingCount = invoices.filter((i) => isOutstandingInvoiceStatus(i.status)).length;
                  return outstandingCount > 0
                    ? `${outstandingCount} invoice${outstandingCount === 1 ? "" : "s"} outstanding`
                    : "All caught up";
                })()}
                size="sm"
                />
                </Link>
                <StatCard label="Expenses" value={money(financials.totalExpenses)} icon={Receipt} size="sm" />
                <StatCard label="Net Profit" value={money(financials.netProfit)} icon={TrendingUp}
                  tone={financials.netProfit>= 0 ? "success" : "danger"}
                  hint={`${financials.profitMargin.toFixed(1)}% margin`}
                  size="sm"
                  />
                  {/* All time, not scoped to the date-range picker above —
                  a "pending estimate" or "active project" count is a
                  present-tense fact, not a period figure, unlike the
                  cash tiles. Labeled explicitly so that stays a
                  deliberate distinction, not something that reads as
                  a stuck/non-updating card when the date range changes. */}
                  <StatCard label="Pending Estimates" value={String(pendingEstimatesCount)} icon={FileText}
                    hint="All time" size="sm" />
                  <StatCard label="Signed Estimates" value={String(signedEstimatesCount)} icon={CheckCircle2}
                    tone="success" hint="All time" size="sm" />
                  <StatCard label="Active Projects" value={String(activeProjectsCount)} icon={FolderKanban}
                    hint="All time" size="sm" />
                  {/* Money OUT. Deliberately reads getActionablePayables —
                  the SAME function /payments Needs Payment uses — so a
                  tile can never quote a figure the page it links to
                  disagrees with. Not A/P: that is lifetime and
                  subcontractor+agent only, which answers a different
                  question (see payablesWorklist's header). */}
                  <Link href="/payments" className="contents">
                  <StatCard label="Owed To People" value={money(payables?.total ?? 0)} icon={HandCoins}
                    tone={(payables?.total ?? 0)> 0 ? "warning" : "neutral"}
                    hint={
                    (payables?.needsAmount ?? 0) > 0
                    ? `${payables?.needsAmount} need${payables?.needsAmount === 1 ? "s" : ""} an amount`
                    : "Subs, agents, team, bills"
                    }
                    size="sm"
                    />
                    </Link>
            </>
            )}
          </div>

          {!loading && unpaidInvoices.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-rose-100 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-rose-700">
                <FileWarning className="size-4" /> Unpaid Invoices
              </h3>
              <Link href="/invoices" className="text-xs font-medium text-emerald-700 hover:underline">
                View all
              </Link>
            </div>
            <ul className="divide-y divide-rose-50">
              {unpaidInvoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-rose-50/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-emerald-900">
                        {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                      </div>
                      <div className="truncate text-xs text-emerald-600/60">
                        {projectsById[invoice.projectId]?.name ?? "—"}
                        {invoice.dueDate ? ` · Due ${invoice.dueDate}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-bold text-emerald-900">{formatMoney(invoice.total)}</span>
                      <span className="inline-flex items-center rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        Unpaid
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          )}

          {loading ? (
          <RevenueExpenseChartSkeleton />
          ) : (
          <RevenueExpenseChart data={monthly} />
          )}

          {!loading && (
          <RecentActivityFeed projects={projects} estimates={estimates} invoices={invoices} />
          )}
          
        </div>
        
        )}

        {/* Mobile New Estimate FAB — always mounted */}
<Link
  href="/estimates/new"
  aria-label="New Estimate"
  className="fixed right-4 bottom-16 z-[999999] flex items-center gap-2 rounded-full bg-emerald-800 px-5 py-3.5 text-sm font-semibold text-white shadow-xl"
>
  <Plus className="h-5 w-5 shrink-0" />
  <span>New Estimate</span>
</Link>

    </PageContainer>

    );
    }

export default function DashboardPage() {
  return (
    <RequirePermission resource="dashboard" action="view">
      <DashboardContent />
    </RequirePermission>
  );
}