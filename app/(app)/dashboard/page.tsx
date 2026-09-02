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
import { DollarSign, Wallet, FileWarning, Receipt, TrendingUp, FolderKanban, Plus, ChevronRight, FileText }
from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useAuth } from "@/components/providers/AuthProvider";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { DateRangeFilter, resolveDateRangePreset, type DateRangePreset } from "@/components/dashboard/DateRangeFilter";
import { RevenueExpenseChart, RevenueExpenseChartSkeleton } from "@/components/dashboard/RevenueExpenseChart";
import { ExpenseBreakdownDonut } from "@/components/dashboard/ExpenseBreakdownDonut";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { useServices } from "@/components/providers/ServicesProvider";
import { getActionablePayables, type ActionablePayables } from "@/lib/services/payablesWorklist";
import { isOutstandingInvoiceStatus, formatMoney } from "@/components/invoices/invoiceStatus";
import { isStaleDraft } from "@/components/estimates/estimateStatus";
import { isNeverInvoiced, isUnstaffedSoon } from "@/components/projects/projectStatus";
import { calculateExpenseTotals } from "@/lib/services/financialCalculations";
import type { Expense } from "@/lib/services/expenseService";
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
  /** For the "Expense Breakdown" donut — company-wide expenses,
   * filtered client-side to the same resolved date range `financials`
   * itself uses, so the donut's "Total Expense" figure and the
   * Financial Summary's Expenses tile can never disagree. */
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
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

    // Company-wide read, period-filtered below (same shape as every
    // other extra fetch on this page) — ExpenseService has no
    // date-scoped list method, so the filter happens client-side
    // against the SAME resolveDateRangePreset(preset) window
    // getCompanyFinancials was given.
    useEffect(() => {
    const companyId = profile?.companyId;
    if (!companyId) return;
    let active = true;
    services.expenseService.listForCompany(companyId)
      .then((list) => { if (active) setAllExpenses(list); })
      .catch(() => { /* the donut is informational; never break the page */ });
    return () => { active = false; };
    }, [services, profile?.companyId]);

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

    // Real month-over-month % change, computed from the SAME 12-point
    // `monthly` series the chart plots — the last two entries are
    // "this month" and "the month before it," regardless of which
    // date-range preset is selected (the monthly chart is always a
    // trailing 12 months, per useDashboardData). A null percentChange
    // (no prior-month data, or the prior month was $0) renders no pill
    // at all rather than a fabricated/divide-by-zero number.
    function momChange(key: "revenue" | "expenses"): number | null {
      if (monthly.length < 2) return null;
      const prior = monthly[monthly.length - 2][key];
      const current = monthly[monthly.length - 1][key];
      if (prior <= 0) return null;
      return ((current - prior) / prior) * 100;
    }
    const revenueMoM = useMemo(() => momChange("revenue"), [monthly]);
    const expensesMoM = useMemo(() => momChange("expenses"), [monthly]);
    const netProfitMoM = useMemo(() => {
      if (monthly.length < 2) return null;
      const prior = monthly[monthly.length - 2].revenue - monthly[monthly.length - 2].expenses;
      const current = monthly[monthly.length - 1].revenue - monthly[monthly.length - 1].expenses;
      if (prior === 0) return null;
      return ((current - prior) / Math.abs(prior)) * 100;
    }, [monthly]);

    // Expense Breakdown donut — same resolved window
    // getCompanyFinancials was given, applied client-side since
    // ExpenseService has no date-scoped list method.
    const expenseBreakdown = useMemo(() => {
      const { start, end } = resolveDateRangePreset(preset);
      const periodExpenses = allExpenses.filter((e) => {
        const d = new Date(e.expenseDate);
        return d >= start && d <= end;
      });
      return calculateExpenseTotals(periodExpenses);
    }, [allExpenses, preset]);

    return (
    <PageContainer>
      {/* One dark forest-green canvas for the ENTIRE page — header
          included — not a light header sitting above a colored
          content area. Every child below reads its palette from this
          same system (emerald surfaces, warm off-white text, rose for
          alerts, amber as the one deliberate contrasting accent) so
          nothing on this page looks like a light component dropped
          onto a dark background. */}
      <div className="-mx-4 -my-6 rounded-b-2xl bg-gradient-to-b from-emerald-950 via-[#0a1f16] to-[#050d09] px-4 pb-24 pt-4 sm:-mx-6 sm:-my-6 sm:rounded-2xl sm:px-6 sm:py-6 lg:-mx-8 lg:px-8">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-emerald-50">
              Good morning, {firstName}
            </h1>
            <p className="mt-1 hidden text-sm text-emerald-300/60 sm:block">
              Here&apos;s what&apos;s happening with your business.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter value={preset} onChange={setPreset} dark />
          </div>
        </div>

        {error && (
        <div
          className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-rose-800/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={()=> refresh()} className="font-medium text-rose-200 underline">Retry</button>
        </div>
        )}

        {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-800/50 px-6 py-16 text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-400/15">
            <FolderKanban className="size-6 text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-emerald-50">Nothing to show yet</p>
          <p className="max-w-sm text-sm text-emerald-300/60">Once you have projects, estimates, or invoices, your business summary will appear here.</p>
        </div>
        ) : (
        <div className="space-y-6">
          {/* Financial Summary — grouped in one bordered/tinted panel
              rather than 5 independently-colored cards, so the row
              reads as "one cluster of related numbers." Only genuine
              alert states (Outstanding > 0, Net Profit negative) break
              from the shared emerald identity into red — color marks
              meaning, not decoration. */}
          <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/30 p-3 sm:p-4">
            <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <DollarSign className="size-3.5" /> Financial Summary
            </h2>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 sm:gap-3">
              {loading || !financials ? (
              Array.from({ length: 5 }).map((_, i) => (
              <StatCardSkeleton key={i} dark />
              ))
              ) : (
              <>
                <StatCard label="Revenue" value={money(financials.totalRevenue)} icon={DollarSign} tone="success"
                  hint="This month vs last" trendPercent={revenueMoM} size="sm" dark />
                <StatCard label="Payments Received" value={money(financials.totalPaid)} icon={Wallet} tone="success" size="sm" dark />
                <StatCard label="Outstanding Invoices" value={money(financials.totalOutstanding)} icon={FileWarning}
                  tone={financials.totalOutstanding> 0 ? "danger" : "neutral"} size="sm" dark />
                <StatCard label="Expenses" value={money(financials.totalExpenses)} icon={Receipt} tone="neutral"
                  hint="This month vs last" trendPercent={expensesMoM} size="sm" dark />
                <StatCard label="Net Profit" value={money(financials.netProfit)} icon={TrendingUp}
                  tone={financials.netProfit>= 0 ? "success" : "danger"}
                  hint={`${financials.profitMargin.toFixed(1)}% margin`}
                  trendPercent={netProfitMoM}
                  size="sm" dark />
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
            <div className="overflow-hidden rounded-xl border border-emerald-800/40 bg-emerald-950/40 lg:col-span-2">
              {loading ? <RevenueExpenseChartSkeleton /> : <RevenueExpenseChart data={monthly} />}
            </div>

            <div className="overflow-hidden rounded-xl border border-rose-800/40 bg-emerald-950/40">
              <div className="border-b border-rose-800/30 bg-rose-950/40 px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-rose-300">
                  <FileWarning className="size-3.5" /> Needs Your Attention
                </h3>
              </div>
              {loading ? (
                <div className="px-4 py-6 text-center text-xs text-emerald-300/50">Loading…</div>
              ) : (
                <ul className="divide-y divide-white/5">
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
                        <Link href={row.href} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-white/5">
                          <span className="text-emerald-200/70">{row.label}</span>
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                isZero ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"
                              }`}
                            >
                              {row.extra ? `${row.count !== null ? `${row.count} · ` : ""}${row.extra}` : row.count}
                            </span>
                            <ChevronRight className="size-3 text-emerald-300/40" />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Expense Breakdown (real category totals) + Profit Margin
              (a real gauge, not decoration — financials.profitMargin
              is the exact figure the Net Profit tile's hint already
              shows) side by side on desktop. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/40 p-4 lg:col-span-2">
              <h2 className="mb-4 text-sm font-semibold text-emerald-50">Expense Breakdown</h2>
              {loading ? (
                <div className="h-40 animate-pulse rounded-lg bg-white/5" />
              ) : (
                <ExpenseBreakdownDonut byType={expenseBreakdown.byType} total={expenseBreakdown.total} />
              )}
            </div>

            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/40 p-4">
              <h3 className="mb-1 text-sm font-semibold text-emerald-50">Profit Margin</h3>
              {loading || !financials ? (
                <div className="h-16 animate-pulse rounded-lg bg-white/5" />
              ) : (
                <>
                  <p className="text-[11px] text-emerald-300/50">Net profit as a share of revenue</p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${financials.profitMargin >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {financials.profitMargin.toFixed(1)}%
                    </span>
                    <span className="text-xs font-medium text-emerald-300/60">
                      {financials.profitMargin >= 20 ? "Excellent" : financials.profitMargin >= 10 ? "Good" : financials.profitMargin >= 0 ? "Fair" : "Needs attention"}
                    </span>
                  </div>
                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${financials.profitMargin >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                      style={{ width: `${Math.min(100, Math.max(4, Math.abs(financials.profitMargin)))}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {!loading && unpaidInvoices.length > 0 && (
          <div className="rounded-lg border border-rose-800/40 bg-emerald-950/40">
            <div className="flex items-center justify-between border-b border-rose-800/30 bg-rose-950/40 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-rose-300">
                <FileWarning className="size-4" /> Unpaid Invoices
              </h3>
              <Link href="/invoices" className="text-xs font-medium text-emerald-300 hover:underline">
                View all
              </Link>
            </div>
            <ul className="divide-y divide-white/5">
              {unpaidInvoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-white/5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-emerald-50">
                        {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                      </div>
                      <div className="truncate text-xs text-emerald-300/50">
                        {projectsById[invoice.projectId]?.name ?? "—"}
                        {invoice.dueDate ? ` · Due ${invoice.dueDate}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-bold text-emerald-50">{formatMoney(invoice.total)}</span>
                      <span className="inline-flex items-center rounded-full bg-rose-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-300">
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
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/40 p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-50">
                <FileText className="size-3.5 text-emerald-400" /> Recent Estimates
              </h2>
              {recentEstimates.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-800/50 px-6 py-10 text-center">
                  <p className="text-sm font-semibold text-emerald-100">No estimates yet</p>
                  <p className="max-w-sm text-xs text-emerald-300/60">New estimates will appear here.</p>
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {recentEstimates.map((estimate) => (
                    <li key={estimate.id}>
                      <Link href={`/estimates/${estimate.id}`} className="flex items-center gap-2.5 py-2 text-sm text-emerald-100 hover:text-emerald-300">
                        <span className="size-2 shrink-0 rounded-full bg-emerald-400" />
                        <span className="min-w-0 flex-1 truncate">
                          {estimate.title?.trim() || projectsById[estimate.projectId]?.name || "Untitled"}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-emerald-50">{money(estimate.total)}</span>
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
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/40 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-emerald-50">
              <FolderKanban className="size-3.5 text-emerald-400" /> Jobs By Stage
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border-l-2 border-l-emerald-600 bg-white/5 p-3 text-center">
                <div className="text-[11px] text-emerald-300/60">Pending Estimates</div>
                <div className="text-lg font-bold text-emerald-50">{pendingEstimatesCount}</div>
              </div>
              <div className="rounded-lg border-l-2 border-l-emerald-500 bg-white/5 p-3 text-center">
                <div className="text-[11px] text-emerald-300/60">Signed Estimates</div>
                <div className="text-lg font-bold text-emerald-50">{signedEstimatesCount}</div>
              </div>
              <div className="rounded-lg border-l-2 border-l-emerald-400 bg-white/5 p-3 text-center">
                <div className="text-[11px] text-emerald-300/60">Active Projects</div>
                <div className="text-lg font-bold text-emerald-50">{activeProjectsCount}</div>
              </div>
              <div className="rounded-lg border-l-2 border-l-emerald-300 bg-white/5 p-3 text-center">
                <div className="text-[11px] text-emerald-300/60">Completed</div>
                <div className="text-lg font-bold text-emerald-50">{completedProjectsCount}</div>
              </div>
            </div>
          </div>
        </div>

        )}
      </div>

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