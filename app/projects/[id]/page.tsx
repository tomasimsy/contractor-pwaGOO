"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import { LoadingState } from "@/components/ui/LoadingState";
import EmptyState from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/badge";
import { EstimateCamera } from "@/components/ui/EstimateCamera";
import { getProjectBundle } from "@/lib/queries/projects";
import { calculateProjectFinancials, derivePaymentStatus, type ProjectFinancials } from "@/lib/queries/financialCalculations";
import { getInvoicePayments, type CustomerPayment } from "@/lib/queries/customerPayments";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import type { ProjectBundle } from "@/lib/types";
import {
  LayoutDashboard,
  User,
  FileText,
  Receipt,
  DollarSign,
  Wallet,
  HardHat,
  Percent,
  Camera,
  FolderOpen,
  History,
  TrendingUp,
  FilePlus,
} from "lucide-react";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "customer", label: "Customer", icon: User },
  { id: "estimate", label: "Estimate", icon: FileText },
  { id: "invoice", label: "Invoice", icon: Receipt },
  { id: "payments", label: "Payments", icon: DollarSign },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "subcontractors", label: "Subcontractors", icon: HardHat },
  { id: "agents", label: "Agents", icon: Percent },
  { id: "photos", label: "Photos", icon: Camera },
  { id: "documents", label: "Documents", icon: FolderOpen },
  { id: "timeline", label: "Timeline", icon: History },
  { id: "profit", label: "Profit", icon: TrendingUp },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * "Mission control" for a single job — one workspace with tabs instead
 * of separate pages for the estimate/invoice/expenses/subcontractors/
 * etc. A "project" in this codebase's data model IS the estimate row
 * (see getProjectBundle, which queries the estimates table by id and
 * pulls every related table keyed by estimate_id) — this page is a new
 * consumer of that existing bundle, not a new data model. It links out
 * to the existing full Estimate edit page for actual line-item editing
 * rather than re-embedding EstimateForm (1000+ lines, already does a
 * lot) — this workspace is the at-a-glance + navigation layer on top.
 */
export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;

  const initialTab = (searchParams.get("tab") as TabId) || "overview";
  const [activeTab, setActiveTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? initialTab : "overview");
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [financials, setFinancials] = useState<ProjectFinancials | null>(null);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const b = await getProjectBundle(projectId);
      setBundle(b);
      setFinancials(calculateProjectFinancials(b));
      const allPayments = (
        await Promise.all(b.invoices.map((inv) => getInvoicePayments(inv.id)))
      ).flat();
      setPayments(allPayments);
    } catch (error) {
      console.error("Failed to load project workspace:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  function selectTab(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/projects/${projectId}?tab=${tab}`, { scroll: false });
  }

  return (
    <ProtectedRoute>
      <DesktopShell
        title={bundle?.project.title || "Project"}
        breadcrumbs={[
          { label: "Estimates", href: "/estimates" },
          { label: bundle?.project.title || "Project" },
        ]}
      >
        <div className="px-4 py-4 md:px-0 md:py-0">
          {loading || !bundle || !financials ? (
            <LoadingState label="Loading project workspace…" />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-[20px] font-semibold text-gray-900 tracking-tight">{bundle.project.title || "Untitled Project"}</h2>
                  <p className="text-[13px] text-gray-500 mt-0.5">
                    {bundle.client?.name || "No client"} · #{bundle.project.estimate_number || bundle.project.id.slice(0, 8)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={financials.isFullyPaid ? "success" : financials.isOverdue ? "danger" : "warning"}>
                    {financials.paymentStatus}
                  </Badge>
                  <Link href={`/estimates/${projectId}`} className="text-xs font-medium text-primary hover:text-primary/80">
                    Open full estimate editor →
                  </Link>
                </div>
              </div>

              {/* Tab bar */}
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

              {activeTab === "overview" && <OverviewTab bundle={bundle} financials={financials} />}
              {activeTab === "customer" && <CustomerTab bundle={bundle} />}
              {activeTab === "estimate" && <EstimateTab bundle={bundle} />}
              {activeTab === "invoice" && <InvoiceTab bundle={bundle} />}
              {activeTab === "payments" && <PaymentsTab payments={payments} />}
              {activeTab === "expenses" && <ExpensesTab bundle={bundle} />}
              {activeTab === "subcontractors" && <SubcontractorsTab bundle={bundle} />}
              {activeTab === "agents" && <AgentsTab bundle={bundle} />}
              {activeTab === "photos" && <EstimateCamera estimateId={projectId} onUploaded={load} />}
              {activeTab === "documents" && <DocumentsTab />}
              {activeTab === "timeline" && <TimelineTab bundle={bundle} payments={payments} />}
              {activeTab === "profit" && <ProfitTab financials={financials} />}
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

function StatTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "danger" }) {
  const toneClass = tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-rose-600" : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function OverviewTab({ bundle, financials }: { bundle: ProjectBundle; financials: ProjectFinancials }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Revised Total" value={formatCurrency(financials.revisedTotal)} />
        <StatTile label="Net Profit" value={formatCurrency(financials.netProfit)} tone={financials.netProfit >= 0 ? "success" : "danger"} />
        <StatTile label="Remaining Balance" value={formatCurrency(financials.remainingBalance)} />
        <StatTile label="Total Expenses" value={formatCurrency(financials.totalExpenses)} />
      </div>
      <Card>
        <div className="text-[13px] font-semibold text-gray-700 mb-2">At a glance</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[13px]">
          <div><span className="text-gray-400">Client:</span> <span className="font-medium text-gray-800">{bundle.client?.name || "—"}</span></div>
          <div><span className="text-gray-400">Change orders:</span> <span className="font-medium text-gray-800">{bundle.changeOrders.length}</span></div>
          <div><span className="text-gray-400">Invoices:</span> <span className="font-medium text-gray-800">{bundle.invoices.length}</span></div>
          <div><span className="text-gray-400">Subcontractors:</span> <span className="font-medium text-gray-800">{bundle.assignedSubcontractors.length}</span></div>
          <div><span className="text-gray-400">Agents:</span> <span className="font-medium text-gray-800">{bundle.assignedAgents.length}</span></div>
          <div><span className="text-gray-400">Signed:</span> <span className="font-medium text-gray-800">{bundle.project.signature ? "Yes" : "No"}</span></div>
        </div>
      </Card>
    </div>
  );
}

function CustomerTab({ bundle }: { bundle: ProjectBundle }) {
  if (!bundle.client) return <EmptyState title="No customer assigned" description="Assign a client from the full estimate editor." />;
  return (
    <Card className="max-w-md">
      <div className="text-[13px] font-semibold text-gray-700 mb-3">{bundle.client.name}</div>
      <div className="space-y-2 text-[13px]">
        <div><span className="text-gray-400">Email:</span> <span className="text-gray-800">{bundle.client.email || "—"}</span></div>
        <div><span className="text-gray-400">Phone:</span> <span className="text-gray-800">{bundle.client.phone || "—"}</span></div>
      </div>
      <Link href={`/clients/${bundle.client.id}`} className="inline-block mt-3 text-xs font-medium text-primary hover:text-primary/80">
        View full client record →
      </Link>
    </Card>
  );
}

function EstimateTab({ bundle }: { bundle: ProjectBundle }) {
  const grouped = bundle.estimateItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.total;
    return acc;
  }, {});
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold text-gray-700">Estimate #{bundle.project.estimate_number || bundle.project.id.slice(0, 8)}</div>
          <Link href={`/estimates/${bundle.project.id}`} className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1">
            <FilePlus className="size-3" /> Edit full estimate
          </Link>
        </div>
        {bundle.project.description && <p className="text-[13px] text-gray-600 mb-3">{bundle.project.description}</p>}
        {Object.keys(grouped).length === 0 ? (
          <EmptyRow label="No line items yet" />
        ) : (
          <div className="divide-y divide-gray-100">
            {Object.entries(grouped).map(([category, total]) => (
              <div key={category} className="flex items-center justify-between py-2 text-[13px]">
                <span className="capitalize text-gray-700">{category}</span>
                <span className="font-medium text-gray-900">{formatCurrency(total)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-100 text-[13px] font-semibold">
          <span>Total</span>
          <span>{formatCurrency(bundle.project.total)}</span>
        </div>
      </Card>
      {bundle.changeOrders.length > 0 && (
        <Card>
          <div className="text-[13px] font-semibold text-gray-700 mb-2">Change Orders</div>
          <div className="divide-y divide-gray-100">
            {bundle.changeOrders.map((co) => (
              <div key={co.id} className="flex items-center justify-between py-2 text-[13px]">
                <div>
                  <div className="font-medium text-gray-800">{co.title}</div>
                  <div className="text-xs text-gray-400">{co.change_order_number}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={co.status === "approved" ? "success" : co.status === "rejected" ? "danger" : "neutral"}>{co.status}</Badge>
                  <span className="font-medium text-gray-900">{formatCurrency(co.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function InvoiceTab({ bundle }: { bundle: ProjectBundle }) {
  if (bundle.invoices.length === 0) return <EmptyState title="No invoice yet" description="Convert this estimate to an invoice from the full editor once it's signed." />;
  return (
    <div className="space-y-3">
      {bundle.invoices.map((inv) => (
        <Link key={inv.id} href={`/invoices/${inv.id}`} className="block">
          <Card className="hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-gray-800">Invoice #{inv.invoice_number}</div>
                <div className="text-xs text-gray-400 mt-0.5">Paid {formatCurrency(inv.amount_paid)} of {formatCurrency(inv.total)}</div>
              </div>
              <Badge variant={derivePaymentStatus(inv.total, inv.amount_paid) === "paid" ? "success" : "warning"}>
                {derivePaymentStatus(inv.total, inv.amount_paid)}
              </Badge>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function PaymentsTab({ payments }: { payments: CustomerPayment[] }) {
  if (payments.length === 0) return <EmptyState title="No payments recorded" />;
  return (
    <Card>
      <div className="divide-y divide-gray-100">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2.5 text-[13px]">
            <div>
              <div className="font-medium text-gray-800">{formatCurrency(p.amount)}</div>
              <div className="text-xs text-gray-400 capitalize">{p.method} · {formatShortDate(p.payment_date)}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ExpensesTab({ bundle }: { bundle: ProjectBundle }) {
  if (bundle.expenses.length === 0) return <EmptyState title="No expenses logged" description="Log material, labor, or other costs from the Expense page." action={<Link href={`/expense?project=${bundle.project.id}`} className="text-xs font-medium text-primary">Go to Expense page →</Link>} />;
  return (
    <Card>
      <div className="divide-y divide-gray-100">
        {bundle.expenses.map((e) => (
          <div key={e.id} className="flex items-center justify-between py-2.5 text-[13px]">
            <div>
              <div className="font-medium text-gray-800 capitalize">{e.category}{e.vendor ? ` · ${e.vendor}` : ""}</div>
              <div className="text-xs text-gray-400">{e.expense_date ? formatShortDate(e.expense_date) : "—"}</div>
            </div>
            <span className="font-medium text-gray-900">{formatCurrency(e.amount)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SubcontractorsTab({ bundle }: { bundle: ProjectBundle }) {
  if (bundle.assignedSubcontractors.length === 0) return <EmptyState title="No subcontractors assigned" action={<Link href={`/expense?project=${bundle.project.id}`} className="text-xs font-medium text-primary">Assign from Expense page →</Link>} />;
  return (
    <Card>
      <div className="divide-y divide-gray-100">
        {bundle.assignedSubcontractors.map((s) => {
          const paid = bundle.subcontractorPayments
            .filter((p) => p.estimate_subcontractor_id === s.estimateSubcontractorId)
            .reduce((sum, p) => sum + p.amount, 0);
          return (
            <div key={s.estimateSubcontractorId} className="flex items-center justify-between py-2.5 text-[13px]">
              <div>
                <div className="font-medium text-gray-800">{s.name}</div>
                <div className="text-xs text-gray-400">{s.trade || "Subcontractor"}</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-gray-900">{formatCurrency(paid)} / {formatCurrency(s.contractedAmount)}</div>
                <div className="text-xs text-gray-400">paid / contracted</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AgentsTab({ bundle }: { bundle: ProjectBundle }) {
  if (bundle.assignedAgents.length === 0) return <EmptyState title="No agents assigned" action={<Link href={`/expense?project=${bundle.project.id}`} className="text-xs font-medium text-primary">Assign from Expense page →</Link>} />;
  return (
    <Card>
      <div className="divide-y divide-gray-100">
        {bundle.assignedAgents.map((a) => {
          const paid = bundle.agentPayments
            .filter((p) => p.agent_id === a.agentId)
            .reduce((sum, p) => sum + p.amount, 0);
          return (
            <div key={a.estimateAgentId} className="flex items-center justify-between py-2.5 text-[13px]">
              <div className="font-medium text-gray-800">{a.name}</div>
              <div className="text-right">
                <div className="font-medium text-gray-900">{formatCurrency(paid)} / {formatCurrency(a.assignedAmount)}</div>
                <div className="text-xs text-gray-400">paid / assigned</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DocumentsTab() {
  // No project-scoped documents table/query exists yet in this codebase
  // (the /documents page is company-wide, not per-project) — rather than
  // fabricate a project-filtered view that doesn't back onto real data,
  // this links out honestly until that query exists.
  return (
    <EmptyState
      title="Project-scoped documents aren't wired up yet"
      description="Documents today live on the company-wide Documents page, not filtered per project."
      action={<Link href="/documents" className="text-xs font-medium text-primary">Go to Documents →</Link>}
    />
  );
}

function TimelineTab({ bundle, payments }: { bundle: ProjectBundle; payments: CustomerPayment[] }) {
  type Event = { id: string; date: string; label: string; detail?: string; tone: "neutral" | "success" };
  const events: Event[] = [];

  bundle.changeOrders.forEach((co) => {
    events.push({ id: `${co.id}-c`, date: co.created_at || "", label: `Change order "${co.title}" created`, detail: formatCurrency(co.total_amount), tone: "neutral" });
    if (co.approved_at) events.push({ id: `${co.id}-a`, date: co.approved_at, label: `Change order "${co.title}" approved`, detail: formatCurrency(co.total_amount), tone: "success" });
  });
  payments.forEach((p) => events.push({ id: p.id, date: p.payment_date, label: "Payment received", detail: `${formatCurrency(p.amount)} · ${p.method}`, tone: "success" }));
  bundle.invoices.forEach((inv) => events.push({ id: `${inv.id}-inv`, date: inv.issue_date || "", label: `Invoice #${inv.invoice_number} issued`, tone: "neutral" }));

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (events.length === 0) return <EmptyState title="No activity yet" />;

  return (
    <Card>
      <ol className="space-y-3 border-l-2 border-gray-100 pl-4 ml-1.5">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span className={`absolute -left-[23px] top-0.5 size-3 rounded-full ${e.tone === "success" ? "bg-emerald-500" : "bg-gray-300"}`} />
            <div className="text-[13px] font-medium text-gray-800">{e.label}</div>
            <div className="text-xs text-gray-400">{e.date ? formatShortDate(e.date) : "—"}{e.detail && ` · ${e.detail}`}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ProfitTab({ financials }: { financials: ProjectFinancials }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card>
        <div className="text-[13px] font-semibold text-gray-700 mb-3">Revenue</div>
        <Row label="Original Estimate" value={financials.originalEstimateTotal} />
        <Row label="Approved Change Orders" value={financials.approvedChangeOrderTotal} />
        <Row label="Revised Total" value={financials.revisedTotal} bold />
      </Card>
      <Card>
        <div className="text-[13px] font-semibold text-gray-700 mb-3">Costs</div>
        <Row label="Subcontractors" value={financials.subcontractorCosts} />
        <Row label="Agents" value={financials.agentCosts} />
        <Row label="Expenses" value={financials.expenseItems} />
        <Row label="Mileage" value={financials.mileageCosts} />
        <Row label="Total Expenses" value={financials.totalExpenses} bold />
      </Card>
      <Card className="sm:col-span-2">
        <div className="text-[13px] font-semibold text-gray-700 mb-3">Profit</div>
        <Row label="Gross Profit" value={financials.grossProfit} />
        <Row label="Net Profit" value={financials.netProfit} bold tone={financials.netProfit >= 0 ? "success" : "danger"} />
        <div className="flex items-center justify-between text-[13px] mt-2 pt-2 border-t border-gray-100">
          <span className="text-gray-500">Margin</span>
          <span className="font-semibold">{financials.profitMargin.toFixed(1)}%</span>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: number; bold?: boolean; tone?: "success" | "danger" }) {
  const toneClass = tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-rose-600" : "text-gray-900";
  return (
    <div className={`flex items-center justify-between text-[13px] py-1 ${bold ? "font-semibold border-t border-gray-100 mt-1 pt-2" : ""}`}>
      <span className="text-gray-500">{label}</span>
      <span className={toneClass}>{formatCurrency(value)}</span>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="text-[13px] text-gray-400 text-center py-6">{label}</div>;
}
