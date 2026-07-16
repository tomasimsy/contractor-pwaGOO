"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import NotificationBell from "@/components/NotificationBell";
import Sidebar from "@/components/layout/Sidebar";
import { useDashboardOverview } from "@/lib/hooks/useDashboardOverview";
import { useFinancialStats } from "@/lib/hooks/useFinancialStats";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  AlertCircle,
  FilePlus,
  FileText,
  ArrowUpRight,
} from "lucide-react";

// Desktop/tablet dashboard — same data sources as the mobile dashboard
// (useDashboardOverview / useFinancialStats / getCompanyPendingPayoutsSummary,
// all shared with app/dashboard/page.tsx and the Expense page) restyled
// into a sidebar + wide-grid layout instead of a single mobile column.
// The existing mobile dashboard at /dashboard is untouched.
export default function DashboardV2() {
  const router = useRouter();
  const { loading, stats, recentEstimates, recentInvoices, overdueInvoices, pendingPayouts } = useDashboardOverview();
  const { stats: financials, loading: financialsLoading } = useFinancialStats();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50/60 flex">
        <Sidebar onLogout={handleLogout} />

        <div className="flex-1 min-w-0">
          {/* Top bar */}
          <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 px-5 md:px-8 h-16">
              <div className="min-w-0">
                <h1 className="text-[15px] font-semibold text-gray-900 truncate">Dashboard</h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/estimates/create"
                  className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 text-white text-[13px] font-medium hover:bg-gray-800 transition-colors"
                >
                  <FilePlus size={14} /> New Estimate
                </Link>
                <NotificationBell />
              </div>
            </div>
          </div>

          <div className="max-w-[1600px] mx-auto px-5 md:px-8 py-6 space-y-6">
            <div>
              <h2 className="text-[20px] font-semibold text-gray-900 tracking-tight">Welcome back</h2>
              <p className="text-[13px] text-gray-500 mt-0.5">{today} · Monitor and control what happens with your business today.</p>
            </div>

            {/* Financial stat cards — same 4 numbers as the mobile
                FinancialDashboard widget, same useFinancialStats() hook. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="Revenue"
                icon={DollarSign}
                tone="emerald"
                value={formatCurrency(financials.totalRevenue)}
                sublabel={`Month: ${formatCurrency(financials.monthlyRevenue)}`}
                loading={financialsLoading}
              />
              <StatCard
                label="Net Profit"
                icon={TrendingUp}
                tone="teal"
                value={formatCurrency(financials.netProfit)}
                sublabel={`Margin: ${financials.profitMargin.toFixed(1)}%`}
                loading={financialsLoading}
              />
              <StatCard
                label="Expenses"
                icon={Receipt}
                tone="slate"
                value={formatCurrency(financials.totalExpenses)}
                sublabel={`Subs paid: ${formatCurrency(financials.totalSubcontractorPaid)}`}
                loading={financialsLoading}
              />
              <StatCard
                label="Pending Payouts"
                icon={AlertCircle}
                tone="amber"
                value={formatCurrency(financials.pendingSubPayments + financials.pendingAgentPayments)}
                sublabel={`Subs owed: ${formatCurrency(financials.pendingSubPayments)}`}
                loading={financialsLoading}
                href="/pending-payouts"
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
              {/* Left/main column */}
              <div className="xl:col-span-2 space-y-5">
                {/* Estimates / Invoices summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Panel title="Estimates" action={<Link href="/estimates" className="text-xs font-medium text-gray-400 hover:text-gray-700">View all →</Link>}>
                    <div className="text-2xl font-semibold text-gray-900 tracking-tight">{loading ? "—" : stats.estimates}</div>
                    <div className="flex gap-2 mt-2 text-[11px] font-medium">
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">Signed {stats.signed}</span>
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Converted {stats.converted}</span>
                    </div>
                  </Panel>
                  <Panel title="Invoices" action={<Link href="/invoices" className="text-xs font-medium text-gray-400 hover:text-gray-700">View all →</Link>}>
                    <div className="text-2xl font-semibold text-gray-900 tracking-tight">{loading ? "—" : stats.invoices}</div>
                    <div className="flex gap-2 mt-2 text-[11px] font-medium">
                      <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded">Paid {stats.paid}</span>
                      <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded">Pending {stats.pending}</span>
                    </div>
                  </Panel>
                </div>

                {/* Recent Estimates */}
                <Panel title="Recent Estimates" action={<Link href="/estimates" className="text-xs font-medium text-gray-400 hover:text-gray-700">View all →</Link>}>
                  {recentEstimates.length === 0 ? (
                    <EmptyRow label="No estimates yet" />
                  ) : (
                    <div className="divide-y divide-gray-100 -mx-1">
                      {recentEstimates.map((est) => (
                        <Link key={est.id} href={`/estimates/${est.id}`} className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-gray-50 rounded-lg transition-colors">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-gray-800 truncate">{est.clients?.name || "No client"}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              #{est.estimate_number || est.id.slice(0, 8)} · {formatShortDate(est.created_at)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[13px] font-semibold text-gray-900">{formatCurrency(est.total)}</div>
                            <StatusBadge good={!!est.signature} goodLabel="Signed" badLabel="Draft" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Panel>

                {/* Recent Invoices */}
                <Panel title="Recent Invoices" action={<Link href="/invoices" className="text-xs font-medium text-gray-400 hover:text-gray-700">View all →</Link>}>
                  {recentInvoices.length === 0 ? (
                    <EmptyRow label="No invoices yet" />
                  ) : (
                    <div className="divide-y divide-gray-100 -mx-1">
                      {recentInvoices.map((inv) => (
                        <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-gray-50 rounded-lg transition-colors">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-gray-800 truncate">{inv.clients?.name || "No client"}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              #{inv.invoice_number} · {formatShortDate(inv.created_at)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[13px] font-semibold text-gray-900">{formatCurrency(inv.total)}</div>
                            <StatusBadge good={inv.status === "paid"} goodLabel="Paid" badLabel="Open" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>

              {/* Right/alerts column */}
              <div className="space-y-5">
                {pendingPayouts && pendingPayouts.count > 0 && (
                  <Link href="/pending-payouts">
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-bold text-amber-900">
                            {pendingPayouts.count} pending payout{pendingPayouts.count === 1 ? "" : "s"}
                          </div>
                          <div className="text-xs text-amber-700/80 mt-0.5">Subcontractors &amp; agents still owed money</div>
                        </div>
                        <ArrowUpRight size={14} className="text-amber-700 shrink-0" />
                      </div>
                      <div className="text-lg font-black text-amber-900 mt-2">{formatCurrency(pendingPayouts.totalRemaining)}</div>
                    </div>
                  </Link>
                )}

                <Panel
                  title="Overdue Invoices"
                  accentDot="rose"
                  action={overdueInvoices.length > 0 ? <span className="text-xs font-medium text-rose-600">{overdueInvoices.length}</span> : undefined}
                >
                  {overdueInvoices.length === 0 ? (
                    <EmptyRow label="Nothing overdue" />
                  ) : (
                    <div className="divide-y divide-gray-100 -mx-1">
                      {overdueInvoices.map((inv) => (
                        <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-gray-50 rounded-lg transition-colors">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-gray-800 truncate">{inv.clients?.name || "Client"}</div>
                            <div className="text-xs text-gray-400 mt-0.5">Inv. {inv.invoice_number} · Due {formatShortDate(inv.due_date)}</div>
                          </div>
                          <div className="text-[13px] font-semibold text-rose-600 shrink-0">
                            {formatCurrency(inv.remaining_balance || inv.total)}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="Quick Actions">
                  <div className="grid grid-cols-1 gap-2">
                    <Link href="/estimates/create" className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      <FilePlus size={14} className="text-gray-400" /> New Estimate
                    </Link>
                    <Link href="/invoices" className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      <FileText size={14} className="text-gray-400" /> View Invoices
                    </Link>
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

const TONE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-50/40 border-emerald-100/70 text-emerald-700",
  teal: "bg-teal-50/30 border-teal-100/60 text-teal-700",
  slate: "bg-gray-50 border-gray-200/60 text-gray-500",
  amber: "bg-amber-50/40 border-amber-100/70 text-amber-700",
};

function StatCard({
  label,
  icon: Icon,
  tone,
  value,
  sublabel,
  loading,
  href,
}: {
  label: string;
  icon: any;
  tone: keyof typeof TONE_CLASSES;
  value: string;
  sublabel: string;
  loading?: boolean;
  href?: string;
}) {
  const content = (
    <div className={`rounded-xl border p-4 ${TONE_CLASSES[tone]} h-full`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        <Icon size={15} />
      </div>
      <div className="text-xl font-semibold text-gray-900 mt-2">{loading ? "—" : value}</div>
      <div className="text-[11px] mt-1.5 pt-1.5 border-t border-current/10 truncate">{sublabel}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function Panel({
  title,
  action,
  accentDot,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  accentDot?: "rose";
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
          {accentDot && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ good, goodLabel, badLabel }: { good: boolean; goodLabel: string; badLabel: string }) {
  return (
    <span
      className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase border ${
        good ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
      }`}
    >
      {good ? goodLabel : badLabel}
    </span>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="text-[13px] text-gray-400 text-center py-6">{label}</div>;
}
