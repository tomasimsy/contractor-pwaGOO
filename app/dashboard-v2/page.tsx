"use client";

import Link from "next/link";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import PaymentStatusDisplay from "@/components/dashboard/PaymentStatusDisplay";
import { useDashboardOverview } from "@/lib/hooks/useDashboardOverview";
import { useActionableDashboard } from "@/lib/hooks/useActionableDashboard";
import {
  Flame,
  DollarSign,
  Users,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";

// Desktop/tablet dashboard — redesigned around 5 concrete questions
// ("how much came in today / who needs paying / which jobs are losing
// money / what's overdue / what's today's priority") instead of a wall
// of KPI tiles, per the "not just prettier — more actionable" brief.
// Data comes from useActionableDashboard (new) + useDashboardOverview
// (existing, still used for the Recent Estimates/Invoices reference
// lists kept below the fold). Shell (sidebar + topbar + breadcrumbs +
// search + quick actions + notifications) comes from DesktopShell.
export default function DashboardV2() {
  const { loading, recentEstimates } = useDashboardOverview();
  const {
    loading: actionableLoading,
    moneyInToday,
    paymentsTodayCount,
    payouts,
    losingJobs,
    overdueInvoices,
    priorities,
  } = useActionableDashboard();

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <ProtectedRoute>
      <DesktopShell title="Dashboard">
          <div className="space-y-6 px-4 py-4 md:px-0 md:py-0">
            <div>
              <h2 className="text-[20px] font-semibold text-gray-900 tracking-tight">Welcome back</h2>
              <p className="text-[13px] text-gray-500 mt-0.5">{today}</p>
            </div>

            {/* Today's priority — the single most useful thing this page can
                say: given everything below, what should you actually do
                first. Ranked by dollar amount across overdue invoices,
                losing jobs, and payouts owed. */}
            {!actionableLoading && priorities.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground mb-3">
                  <Flame className="size-4 text-primary" /> Today's Priority
                </h3>
                <div className="space-y-2">
                  {priorities.map((p) => (
                    <Link
                      key={`${p.kind}-${p.label}`}
                      href={p.href}
                      className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2.5 border border-border hover:border-primary/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-foreground truncate">{p.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{p.detail}</div>
                      </div>
                      <div className="text-[13px] font-semibold text-foreground shrink-0">{formatCurrency(p.amount)}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* The four questions — one card each, answered directly rather
                than as a number the reader has to interpret. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <QuestionCard
                icon={DollarSign}
                tone="emerald"
                question="How much came in today?"
                value={formatCurrency(moneyInToday)}
                sublabel={paymentsTodayCount === 0 ? "No payments recorded today" : `${paymentsTodayCount} payment${paymentsTodayCount === 1 ? "" : "s"} today`}
                loading={actionableLoading}
              />
              <QuestionCard
                icon={Users}
                tone="amber"
                question="Who needs to be paid?"
                value={payouts.length === 0 ? "No one" : formatCurrency(payouts.reduce((s, p) => s + p.remainingAmount, 0))}
                sublabel={payouts.length === 0 ? "All subs & agents settled" : `${payouts.length} subcontractor/agent${payouts.length === 1 ? "" : "s"} owed`}
                loading={actionableLoading}
                href="/pending-payouts"
              />
              <QuestionCard
                icon={TrendingDown}
                tone="rose"
                question="Jobs losing money?"
                value={losingJobs.length === 0 ? "None" : String(losingJobs.length)}
                sublabel={losingJobs.length === 0 ? "Every active job is profitable" : `Worst: ${formatCurrency(Math.abs(losingJobs[0].profit))} in the red`}
                loading={actionableLoading}
              />
              <QuestionCard
                icon={AlertTriangle}
                tone="rose"
                question="Invoices overdue?"
                value={overdueInvoices.length === 0 ? "None" : String(overdueInvoices.length)}
                sublabel={overdueInvoices.length === 0 ? "Nothing past due" : `${formatCurrency(overdueInvoices.reduce((s, i) => s + i.remaining_balance, 0))} outstanding`}
                loading={actionableLoading}
                href="/invoices"
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
              <Panel title="Who Needs to Be Paid" action={<Link href="/pending-payouts" className="text-xs font-medium text-gray-400 hover:text-gray-700">View all →</Link>}>
                {payouts.length === 0 ? (
                  <EmptyRow label="Everyone is paid up" />
                ) : (
                  <div className="divide-y divide-gray-100 -mx-1">
                    {payouts.slice(0, 5).map((p) => (
                      <Link
                        key={p.assignmentId}
                        href={`/expense?project=${p.estimateId}`}
                        className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-gray-800 truncate">{p.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {p.role === "agent" ? "Agent" : p.roleDetail || "Subcontractor"} · {p.projectTitle}
                          </div>
                        </div>
                        <div className="text-[13px] font-semibold text-amber-700 shrink-0">{formatCurrency(p.remainingAmount)}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Jobs Losing Money" accentDot="rose" action={losingJobs.length > 0 ? <span className="text-xs font-medium text-rose-600">{losingJobs.length}</span> : undefined}>
                {losingJobs.length === 0 ? (
                  <EmptyRow label="No job is currently in the red" />
                ) : (
                  <div className="divide-y divide-gray-100 -mx-1">
                    {losingJobs.slice(0, 5).map((job) => (
                      <Link
                        key={job.estimateId}
                        href={`/estimates/${job.estimateId}`}
                        className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-gray-800 truncate">{job.title || job.estimateNumber || "Untitled job"}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{job.clientName || "No client"} · {job.profitMargin.toFixed(1)}% margin</div>
                        </div>
                        <div className="text-[13px] font-semibold text-rose-600 shrink-0">{formatCurrency(job.profit)}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
              <Panel title="Overdue Invoices" accentDot="rose" action={overdueInvoices.length > 0 ? <span className="text-xs font-medium text-rose-600">{overdueInvoices.length}</span> : undefined}>
                {overdueInvoices.length === 0 ? (
                  <EmptyRow label="Nothing overdue" />
                ) : (
                  <div className="divide-y divide-gray-100 -mx-1">
                    {overdueInvoices.map((inv: any) => (
                      <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-gray-50 rounded-lg transition-colors">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-gray-800 truncate">{inv.clients?.name || "Client"}</div>
                          <div className="text-xs text-gray-400 mt-0.5">Inv. {inv.invoice_number} · Due {formatShortDate(inv.due_date)}</div>
                        </div>
                        <div className="text-[13px] font-semibold text-rose-600 shrink-0">{formatCurrency(inv.remaining_balance)}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Recent Estimates — kept as reference/navigation, not a
                  "question" card, since browsing recent activity is still
                  a real need even on an actionable dashboard. */}
              <Panel title="Recent Estimates" action={<Link href="/estimates" className="text-xs font-medium text-gray-400 hover:text-gray-700">View all →</Link>}>
                {loading ? (
                  <EmptyRow label="Loading…" />
                ) : recentEstimates.length === 0 ? (
                  <EmptyRow label="No estimates yet" />
                ) : (
                  <div className="divide-y divide-gray-100 -mx-1">
                    {recentEstimates.slice(0, 5).map((est: any) => {
                      const invoice = est.invoices?.[0];
                      const amountPaid = invoice?.amount_paid || 0;
                      const remainingBalance = Math.max(est.total - amountPaid, 0);
                      return (
                        <Link key={est.id} href={`/estimates/${est.id}`} className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-gray-50 rounded-lg transition-colors group">
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium text-gray-800 truncate">{est.clients?.name || "No client"}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              #{est.estimate_number || est.id.slice(0, 8)} · {formatShortDate(est.created_at)}
                            </div>
                            {invoice && (
                              <div className="mt-1">
                                <PaymentStatusDisplay
                                  total={est.total}
                                  amountPaid={amountPaid}
                                  remainingBalance={remainingBalance}
                                  isLocked={invoice.is_locked}
                                  status={invoice.status}
                                />
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[13px] font-semibold text-gray-900">{formatCurrency(est.total)}</div>
                            <StatusBadge good={!!est.signature} goodLabel="Signed" badLabel="Draft" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}

const TONE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-50/40 border-emerald-100/70 text-emerald-700",
  amber: "bg-amber-50/40 border-amber-100/70 text-amber-700",
  rose: "bg-rose-50/40 border-rose-100/70 text-rose-700",
};

function QuestionCard({
  icon: Icon,
  tone,
  question,
  value,
  sublabel,
  loading,
  href,
}: {
  icon: any;
  tone: keyof typeof TONE_CLASSES;
  question: string;
  value: string;
  sublabel: string;
  loading?: boolean;
  href?: string;
}) {
  const content = (
    <div className={`rounded-xl border p-4 ${TONE_CLASSES[tone]} h-full`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{question}</span>
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
  className,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  accentDot?: "rose";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 ${className ?? ""}`}>
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
