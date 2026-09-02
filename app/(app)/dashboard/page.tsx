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
import { DollarSign, Wallet, FileWarning, Receipt, TrendingUp, FolderKanban, Plus, ChevronRight }
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
import { isStaleDraft } from "@/components/estimates/estimateStatus";
import { isNeverInvoiced, isUnstaffedSoon } from "@/components/projects/projectStatus";
import type { ChangeOrder } from "@/lib/services/changeOrderService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function DashboardContent() {
const { profile } = useAuth();
const [preset, setPreset] = useState<DateRangePreset>("this_year");
  const [payables, setPayables] = useState<ActionablePayables | null>(null);
  /** Not exposed as a company-wide list anywhere (ChangeOrderService
   * only has listForProject, same per-project fan-out the Change
   * Orders list page itself already does) — fetched here once
   * `projects` is available, same pattern as `payables` above. */
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
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

    // Not period-scoped, same reasoning as payables above — a pending
    // change order doesn't stop needing approval because the date
    // filter moved.
    useEffect(() => {
    if (projects.length === 0) { setChangeOrders([]); return; }
    let active = true;
    Promise.all(projects.map((p) => services.changeOrderService.listForProject(p.id)))
      .then((perProject) => { if (active) setChangeOrders(perProject.flat()); })
      .catch(() => { /* the tile is informational; never break the page */ });
    return () => { active = false; };
    }, [services, projects]);

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

    const invoiceCountByProject = useMemo(() => {
      const counts: Record<string, number> = {};
      for (const inv of invoices) counts[inv.projectId] = (counts[inv.projectId] ?? 0) + 1;
      return counts;
    }, [invoices]);

    const pendingChangeOrdersCount = useMemo(
      () => changeOrders.filter((co) => co.status === "pending").length,
      [changeOrders]
    );
    // Same shape as isUnstaffedSoon/isNeverInvoiced/isStaleDraft — reused
    // verbatim from the list pages so a count here can never disagree
    // with what those pages badge.
    const staleEstimatesCount = useMemo(
      () => estimates.filter((e) => isStaleDraft(e.status, e.createdAt)).length,
      [estimates]
    );
    const unstaffedSoonCount = useMemo(
      () => projects.filter((p) => isUnstaffedSoon(p.startDate, p.assignedUserId)).length,
      [projects]
    );
    const neverInvoicedCount = useMemo(
      () => projects.filter((p) => isNeverInvoiced(p.status, invoiceCountByProject[p.id] ?? 0)).length,
      [projects, invoiceCountByProject]
    );

    // "Jobs by stage" strip's fourth bucket — the other three
    // (pending/signed estimates, active projects) already come from
    // useDashboardData; completed has no equivalent count yet.
    const completedProjectsCount = useMemo(
      () => projects.filter((p) => p.status === "completed").length,
      [projects]
    );

    // First name only — "Good morning, Tom Smith" reads odd next to a
    // one-line subtitle. Falls back to "there" for a profile with no
    // name set yet rather than rendering an empty greeting.
    const firstName = profile?.fullName?.trim().split(/\s+/)[0] || "there";

    const recentEstimates = useMemo(
      () => [...estimates].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
      [estimates]
    );

    return (
    <PageContainer>

  

      <PageHeader title={`Good morning, ${firstName}`} description={ <span className="hidden sm:inline">
        Here's what's happening with your business.
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
        // The page's one wash of color — a soft emerald gradient behind
        // every section, fading to transparent toward the bottom. This
        // is what makes the page read as one designed surface instead
        // of a stack of disconnected white cards on flat gray;
        // everything below stays quiet (white cards, neutral borders)
        // except the two spots that earn a color of their own — the
        // financial summary (emerald, the brand's own color) and Needs
        // Your Attention (rose, the app's existing alert color from
        // the badges built earlier this session).
        <div className="-mx-4 -mt-2 rounded-b-2xl bg-gradient-to-b from-emerald-50 via-emerald-50/40 to-transparent px-4 pb-8 pt-4 sm:-mx-6 sm:rounded-2xl sm:px-6 sm:pt-6 lg:-mx-8 lg:px-8">
        <div className="space-y-6">
          {/* Financial Summary — grouped in one bordered/tinted panel
              rather than 5 independently-colored cards, so the row
              reads as "one cluster of related numbers." Only genuine
              alert states (Outstanding > 0, Net Profit negative) break
              from the shared emerald identity into red — color marks
              meaning, not decoration. */}
          <div className="rounded-xl border border-emerald-200/70 bg-white/70 p-3 shadow-sm backdrop-blur-sm sm:p-4">
            <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              <DollarSign className="size-3.5" /> Financial Summary
            </h2>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 sm:gap-3">
              {loading || !financials ? (
              Array.from({ length: 5 }).map((_, i) => (
              <StatCardSkeleton key={i} />
              ))
              ) : (
              <>
                <StatCard label="Revenue" value={money(financials.totalRevenue)} icon={DollarSign} tone="success"
                  size="sm" />
                <StatCard label="Payments Received" value={money(financials.totalPaid)} icon={Wallet} tone="success" size="sm" />
                <StatCard label="Outstanding Invoices" value={money(financials.totalOutstanding)} icon={FileWarning}
                  tone={financials.totalOutstanding> 0 ? "danger" : "neutral"} size="sm" />
                <StatCard label="Expenses" value={money(financials.totalExpenses)} icon={Receipt} tone="neutral" size="sm" />
                <StatCard label="Net Profit" value={money(financials.netProfit)} icon={TrendingUp}
                  tone={financials.netProfit>= 0 ? "success" : "danger"}
                  hint={`${financials.profitMargin.toFixed(1)}% margin`}
                  size="sm" />
              </>
              )}
            </div>
          </div>

          {/* Chart + "Needs Your Attention" side by side on desktop,
              stacked on mobile — every red-badge reminder this app has
              (unpaid invoices, owed-to-people, pending change orders,
              stale drafts, unstaffed jobs, never-invoiced jobs) in one
              place, each row reading straight from the SAME source of
              truth its own list-page badge uses, so this panel can
              never disagree with what you'd see by clicking through. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="overflow-hidden rounded-xl border border-emerald-200/60 bg-white shadow-sm lg:col-span-2">
              {loading ? <RevenueExpenseChartSkeleton /> : <RevenueExpenseChart data={monthly} />}
            </div>

            <div className="overflow-hidden rounded-xl border border-rose-200/70 bg-white shadow-sm">
              <div className="border-b border-rose-100 bg-rose-50/60 px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-rose-700">
                  <FileWarning className="size-3.5" /> Needs Your Attention
                </h3>
              </div>
              {loading ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</div>
              ) : (
                <ul className="divide-y divide-border">
                  {[
                    {
                      href: "/invoices",
                      label: "Unpaid invoices",
                      count: invoices.filter((i) => isOutstandingInvoiceStatus(i.status)).length,
                      extra: (financials?.totalOutstanding ?? 0) > 0 ? money(financials?.totalOutstanding ?? 0) : null,
                    },
                    { href: "/payments", label: "Owed to people", count: null, extra: (payables?.total ?? 0) > 0 ? money(payables?.total ?? 0) : null, isPositive: (payables?.total ?? 0) === 0 },
                    { href: "/change-orders", label: "Change orders pending", count: pendingChangeOrdersCount },
                    { href: "/estimates", label: "Stale draft estimates", count: staleEstimatesCount },
                    { href: "/projects", label: "Unstaffed jobs", count: unstaffedSoonCount },
                    { href: "/projects", label: "Jobs never invoiced", count: neverInvoicedCount },
                  ].map((row) => {
                    const isZero = row.count === 0 || (row.count === null && row.isPositive);
                    return (
                      <li key={row.label}>
                        <Link href={row.href} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-muted/60">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                isZero ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                              }`}
                            >
                              {row.extra ? `${row.count !== null ? `${row.count} · ` : ""}${row.extra}` : row.count}
                            </span>
                            <ChevronRight className="size-3 text-muted-foreground/50" />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
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

          {/* Recent Estimates + Recent Activity side by side on
              desktop, stacked on mobile. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Recent Estimates</h2>
              {recentEstimates.length === 0 ? (
                <EmptyState title="No estimates yet" description="New estimates will appear here." />
              ) : (
                <ul className="divide-y divide-border">
                  {recentEstimates.map((estimate) => (
                    <li key={estimate.id}>
                      <Link href={`/estimates/${estimate.id}`} className="flex items-center justify-between gap-2.5 py-2 text-sm hover:text-primary">
                        <span className="min-w-0 flex-1 truncate">
                          {estimate.title?.trim() || projectsById[estimate.projectId]?.name || "Untitled"}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-foreground">{money(estimate.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!loading && (
            <RecentActivityFeed projects={projects} estimates={estimates} invoices={invoices} />
            )}
          </div>

          {/* Jobs by stage — the estimate/project lifecycle counts
              that used to live in the stat grid, now their own strip
              matching the pipeline framing rather than mixed in with
              cash figures. */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-foreground">
              <FolderKanban className="size-3.5 text-emerald-600" /> Jobs By Stage
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border-l-2 border-l-emerald-300 bg-muted/40 p-3 text-center">
                <div className="text-[11px] text-muted-foreground">Pending Estimates</div>
                <div className="text-lg font-bold text-foreground">{pendingEstimatesCount}</div>
              </div>
              <div className="rounded-lg border-l-2 border-l-emerald-400 bg-muted/40 p-3 text-center">
                <div className="text-[11px] text-muted-foreground">Signed Estimates</div>
                <div className="text-lg font-bold text-foreground">{signedEstimatesCount}</div>
              </div>
              <div className="rounded-lg border-l-2 border-l-emerald-500 bg-muted/40 p-3 text-center">
                <div className="text-[11px] text-muted-foreground">Active Projects</div>
                <div className="text-lg font-bold text-foreground">{activeProjectsCount}</div>
              </div>
              <div className="rounded-lg border-l-2 border-l-emerald-700 bg-muted/40 p-3 text-center">
                <div className="text-[11px] text-muted-foreground">Completed</div>
                <div className="text-lg font-bold text-foreground">{completedProjectsCount}</div>
              </div>
            </div>
          </div>
        </div>
        </div>

        )}

        {/* Mobile New Estimate FAB — always mounted */}
<Link
  href="/estimates/new"
  aria-label="New Estimate"
  className="fixed right-4 bottom-16 z-[999999] flex items-center gap-2 rounded-full bg-gradient-to-b from-emerald-600 to-emerald-800 px-5 py-3.5 text-sm font-semibold text-white shadow-xl"
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