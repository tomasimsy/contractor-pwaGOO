"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import { LoadingState } from "@/components/ui/LoadingState";
import EmptyState from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import {
  getAccountsReceivable,
  getOverdueInvoices,
  getARAgingBuckets,
  getMonthlyRevenueTrend,
  getCompanyPaymentHistory,
  type ARAgingBuckets,
  type PaymentWithContext,
} from "@/lib/queries/customerPayments";
import { getClientDetail, type ClientDetail } from "@/lib/queries/clients";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import { LayoutDashboard, TrendingUp, AlertCircle, FileText, History } from "lucide-react";

const TABS = [
  { id: "ar", label: "AR Dashboard", icon: LayoutDashboard },
  { id: "timeline", label: "Payment Timeline", icon: TrendingUp },
  { id: "outstanding", label: "Outstanding Balances", icon: AlertCircle },
  { id: "statements", label: "Customer Statements", icon: FileText },
  { id: "history", label: "Payment History", icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];
type OverdueInvoice = Awaited<ReturnType<typeof getOverdueInvoices>>[number];
type ClientRow = { id: string; name: string };

/**
 * One control center for "get paid" — accounts receivable, aging,
 * outstanding balances, per-customer statements, and payment history.
 * Every number here comes from an existing query
 * (getAccountsReceivable/getARAgingBuckets/getOverdueInvoices/
 * getMonthlyRevenueTrend/getCompanyPaymentHistory/getClientDetail) —
 * this page is assembly + a tabbed UI, not new calculation logic.
 */
export default function ReceivablesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "ar";
  const [activeTab, setActiveTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? initialTab : "ar");

  const [loading, setLoading] = useState(true);
  const [totalAR, setTotalAR] = useState(0);
  const [aging, setAging] = useState<ARAgingBuckets | null>(null);
  const [overdue, setOverdue] = useState<OverdueInvoice[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<PaymentWithContext[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientDetail, setClientDetail] = useState<ClientDetail | null>(null);
  const [clientDetailLoading, setClientDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const companyId = await getCompanyId();
      const [ar, agingBuckets, overdueInvoices, trend, paymentHistory, clientsRes] = await Promise.all([
        getAccountsReceivable(companyId),
        getARAgingBuckets(companyId),
        getOverdueInvoices(companyId),
        getMonthlyRevenueTrend(companyId, 6),
        getCompanyPaymentHistory(companyId, 100),
        supabase.from("clients").select("id, name").eq("company_id", companyId).order("name"),
      ]);
      setTotalAR(ar);
      setAging(agingBuckets);
      setOverdue(overdueInvoices);
      setMonthlyTrend(trend);
      setHistory(paymentHistory);
      setClients(clientsRes.data || []);
    } catch (error) {
      console.error("Failed to load receivables workspace:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedClientId) {
      setClientDetail(null);
      return;
    }
    let cancelled = false;
    setClientDetailLoading(true);
    getCompanyId()
      .then((companyId) => getClientDetail(selectedClientId, companyId))
      .then((detail) => !cancelled && setClientDetail(detail))
      .catch((err) => console.error("Failed to load client statement:", err))
      .finally(() => !cancelled && setClientDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedClientId]);

  function selectTab(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/invoices/receivables?tab=${tab}`, { scroll: false });
  }

  return (
    <ProtectedRoute>
      <DesktopShell
        title="Accounts Receivable"
        breadcrumbs={[{ label: "Invoices", href: "/invoices" }, { label: "Receivables" }]}
      >
        <div className="px-4 py-4 md:px-0 md:py-0">
          {loading ? (
            <LoadingState label="Loading receivables…" />
          ) : (
            <>
              <div className="border-b border-border mb-5 overflow-x-auto">
                <div className="flex gap-1 min-w-max">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => selectTab(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                          isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="size-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeTab === "ar" && aging && <ARDashboardTab totalAR={totalAR} aging={aging} overdueCount={overdue.length} />}
              {activeTab === "timeline" && <PaymentTimelineTab monthlyTrend={monthlyTrend} />}
              {activeTab === "outstanding" && <OutstandingBalancesTab overdue={overdue} />}
              {activeTab === "statements" && (
                <CustomerStatementsTab
                  clients={clients}
                  selectedClientId={selectedClientId}
                  onSelect={setSelectedClientId}
                  detail={clientDetail}
                  detailLoading={clientDetailLoading}
                />
              )}
              {activeTab === "history" && <PaymentHistoryTab history={history} />}
            </>
          )}
        </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${className}`}>{children}</div>;
}

function ARDashboardTab({ totalAR, aging, overdueCount }: { totalAR: number; aging: ARAgingBuckets; overdueCount: number }) {
  const bucketMax = Math.max(aging.current, aging.days1to30, aging.days31to60, aging.days61to90, aging.days90plus, 1);
  const buckets: { label: string; value: number; tone: string }[] = [
    { label: "Current", value: aging.current, tone: "bg-emerald-500" },
    { label: "1–30 days", value: aging.days1to30, tone: "bg-amber-400" },
    { label: "31–60 days", value: aging.days31to60, tone: "bg-amber-500" },
    { label: "61–90 days", value: aging.days61to90, tone: "bg-rose-500" },
    { label: "90+ days", value: aging.days90plus, tone: "bg-rose-700" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total Receivable</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{formatCurrency(totalAR)}</div>
        </Card>
        <Card>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Overdue Invoices</div>
          <div className="text-2xl font-semibold text-rose-600 mt-1">{overdueCount}</div>
        </Card>
        <Card>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">90+ Days Past Due</div>
          <div className="text-2xl font-semibold text-rose-700 mt-1">{formatCurrency(aging.days90plus)}</div>
        </Card>
      </div>
      <Card>
        <div className="text-[13px] font-semibold text-gray-700 mb-4">Aging Breakdown</div>
        <div className="space-y-3">
          {buckets.map((b) => (
            <div key={b.label}>
              <div className="flex items-center justify-between text-[13px] mb-1">
                <span className="text-gray-600">{b.label}</span>
                <span className="font-medium text-gray-900">{formatCurrency(b.value)}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full ${b.tone}`} style={{ width: `${(b.value / bucketMax) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PaymentTimelineTab({ monthlyTrend }: { monthlyTrend: Record<string, number> }) {
  const entries = Object.entries(monthlyTrend).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <EmptyState title="No payments in the last 6 months" />;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <Card>
      <div className="text-[13px] font-semibold text-gray-700 mb-4">Payments Received — Last 6 Months</div>
      <div className="flex items-end gap-3 h-40">
        {entries.map(([month, amount]) => (
          <div key={month} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
            <div className="text-[11px] font-medium text-gray-700">{formatCurrency(amount)}</div>
            <div
              className="w-full rounded-t-md bg-primary/80"
              style={{ height: `${Math.max((amount / max) * 100, 3)}%` }}
            />
            <div className="text-[10px] text-gray-400">{month}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OutstandingBalancesTab({ overdue }: { overdue: OverdueInvoice[] }) {
  if (overdue.length === 0) return <EmptyState title="Nothing outstanding" description="Every invoice is either paid or not yet due." />;
  return (
    <Card>
      <div className="divide-y divide-gray-100">
        {overdue.map((inv: any) => (
          <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 py-2.5 text-[13px] hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors">
            <div>
              <div className="font-medium text-gray-800">{inv.clients?.name || "Client"}</div>
              <div className="text-xs text-gray-400">Inv. {inv.invoice_number} · Due {formatShortDate(inv.due_date)}</div>
            </div>
            <span className="font-semibold text-rose-600">{formatCurrency(inv.remaining_balance)}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function CustomerStatementsTab({
  clients,
  selectedClientId,
  onSelect,
  detail,
  detailLoading,
}: {
  clients: ClientRow[];
  selectedClientId: string;
  onSelect: (id: string) => void;
  detail: ClientDetail | null;
  detailLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card className="max-w-sm">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">Select Customer</label>
        <Select value={selectedClientId} onChange={(e) => onSelect(e.target.value)}>
          <option value="">Choose a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Card>

      {!selectedClientId ? (
        <EmptyState title="No customer selected" description="Choose a client above to view their statement." />
      ) : detailLoading || !detail ? (
        <LoadingState label="Loading statement…" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Total Invoiced" value={formatCurrency(detail.totals.totalInvoiced)} />
            <StatTile label="Total Paid" value={formatCurrency(detail.totals.totalPaid)} tone="success" />
            <StatTile label="Balance Due" value={formatCurrency(detail.totals.remainingBalance)} tone={detail.totals.remainingBalance > 0 ? "danger" : "neutral"} />
            <StatTile label="Estimated" value={formatCurrency(detail.totals.totalEstimated)} />
          </div>
          <Card>
            <div className="text-[13px] font-semibold text-gray-700 mb-2">Invoices</div>
            {detail.invoices.length === 0 ? (
              <EmptyRow label="No invoices" />
            ) : (
              <div className="divide-y divide-gray-100">
                {detail.invoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between py-2.5 text-[13px] hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors">
                    <div>
                      <div className="font-medium text-gray-800">Invoice #{inv.invoice_number}</div>
                      <div className="text-xs text-gray-400">{formatShortDate(inv.created_at)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">{formatCurrency(inv.total)}</div>
                      <Badge variant={inv.remaining_balance <= 0 ? "success" : "warning"}>
                        {inv.remaining_balance <= 0 ? "Paid" : formatCurrency(inv.remaining_balance) + " due"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <div className="text-[13px] font-semibold text-gray-700 mb-2">Payment History</div>
            {detail.payments.length === 0 ? (
              <EmptyRow label="No payments recorded" />
            ) : (
              <div className="divide-y divide-gray-100">
                {detail.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5 text-[13px]">
                    <div>
                      <div className="font-medium text-gray-800">{formatCurrency(p.amount)}</div>
                      <div className="text-xs text-gray-400 capitalize">{p.method} · Inv. {p.invoice_number} · {formatShortDate(p.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function PaymentHistoryTab({ history }: { history: PaymentWithContext[] }) {
  if (history.length === 0) return <EmptyState title="No payments recorded yet" />;
  return (
    <Card>
      <div className="divide-y divide-gray-100">
        {history.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2.5 text-[13px]">
            <div>
              <div className="font-medium text-gray-800">{p.clientName || "Client"}</div>
              <div className="text-xs text-gray-400 capitalize">{p.method} · Inv. {p.invoiceNumber || "—"} · {formatShortDate(p.payment_date)}</div>
            </div>
            <span className="font-semibold text-emerald-700">{formatCurrency(p.amount)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "danger" }) {
  const toneClass = tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-rose-600" : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="text-[13px] text-gray-400 text-center py-6">{label}</div>;
}
