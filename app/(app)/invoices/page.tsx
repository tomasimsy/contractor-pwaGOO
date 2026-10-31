"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Receipt, Plus, Search } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePermission } from "@/lib/hooks/usePermission";
import { RecordPaymentButton } from "@/components/payments/RecordPaymentButton";
import { formatMoney, isUnpaidInvoiceStatus, isOutstandingInvoiceStatus } from "@/components/invoices/invoiceStatus";
import { isBilledInvoice } from "@/lib/services/financialEngine";
import type { Invoice, InvoiceStatus } from "@/lib/services/invoiceService";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { Estimate } from "@/lib/services/estimateService";

type SortKey = "createdAt" | "dueDate" | "total";
/** "open" groups the statuses that still need collecting; "cancelled" and "void" sit behind More. */
type TabFilter = "open" | "draft" | "paid" | "all" | "cancelled" | "void";

const TABS: { key: TabFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "draft", label: "Drafts" },
  { key: "paid", label: "Paid" },
];
const MORE_TABS: { key: TabFilter; label: string }[] = [
  { key: "cancelled", label: "Cancelled" },
  { key: "void", label: "Void" },
];

interface PaymentSummary {
  totalPaid: number;
  remainingBalance: number;
}

function matchesTab(invoice: Invoice, tab: TabFilter): boolean {
  switch (tab) {
    case "open":
      return isUnpaidInvoiceStatus(invoice.status);
    case "draft":
      return invoice.status === "draft";
    case "paid":
      return invoice.status === "paid";
    case "all":
      return true;
    default:
      return invoice.status === tab;
  }
}

/** Whole days between a YYYY-MM-DD due date and today, never negative. */
function daysLate(dueDate: string): number {
  const [year, month, day] = dueDate.split("-").map(Number);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - Date.UTC(year, month - 1, day)) / 86_400_000));
}

/** The one status a row shows. Replaces the old separate Status and Payment columns. */
function statusView(invoice: Invoice, summary: PaymentSummary | undefined): { label: string; detail: string | null; tone: "danger" | "success" | "muted" | "default" } {
  const status: InvoiceStatus = invoice.status;
  if (status === "cancelled") return { label: "Cancelled", detail: null, tone: "muted" };
  if (status === "void") return { label: "Void", detail: null, tone: "muted" };
  if (invoice.total <= 0) return { label: "No charge", detail: null, tone: "muted" };
  switch (status) {
    case "draft":
      return { label: "Draft", detail: "Not sent", tone: "muted" };
    case "sent":
      return { label: "Sent", detail: null, tone: "default" };
    case "viewed":
      return { label: "Viewed", detail: null, tone: "default" };
    case "partially_paid":
      return { label: "Partially paid", detail: `${formatMoney(summary?.totalPaid ?? 0)} paid`, tone: "default" };
    case "overdue":
      return {
        label: "Overdue",
        detail: invoice.dueDate ? `${daysLate(invoice.dueDate)} days late` : null,
        tone: "danger",
      };
    case "paid":
      return { label: "Paid", detail: null, tone: "success" };
  }
}

const STATUS_TEXT: Record<"danger" | "success" | "muted" | "default", string> = {
  danger: "text-danger",
  success: "text-success",
  muted: "text-muted-foreground",
  default: "text-foreground",
};

function InvoicesListContent() {
  const router = useRouter();
  const { invoiceService, projectService, clientService, estimateService, paymentService } = useServices();
  const { profile } = useAuth();
  const canRecordPayment = usePermission("payment", "create");

  const [estimatesById, setEstimatesById] = useState<Record<string, Estimate>>({});

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summaries, setSummaries] = useState<Record<string, PaymentSummary>>({});
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("open");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");

  /** Amount paid and still owed for each invoice, from the same payment rows the Dashboard reads. */
  const loadSummaries = useCallback(
    async (list: Invoice[]) => {
      const result = await paymentService.getSummariesForInvoices(list.map((i) => ({ id: i.id, total: i.total })));
      setSummaries(result);
    },
    [paymentService]
  );

  const load = useCallback(async () => {
    if (!profile?.companyId) return;

    setLoading(true);
    setError(null);

    try {
      const [invoiceList, projectList, clientList, estimateList] = await Promise.all([
        invoiceService.listForCompany({ companyId: profile.companyId }),
        projectService.list({ companyId: profile.companyId }),
        clientService.list({ companyId: profile.companyId }),
        estimateService.list({ companyId: profile.companyId }),
      ]);

      setInvoices(invoiceList);
      await loadSummaries(invoiceList);
      setEstimatesById(Object.fromEntries(estimateList.map((e) => [e.id, e])));
      setProjectsById(Object.fromEntries(projectList.map((p) => [p.id, p])));
      setClientsById(Object.fromEntries(clientList.map((c) => [c.id, c])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [invoiceService, projectService, clientService, estimateService, loadSummaries, profile]);

  useEffect(() => {
    load();
  }, [load]);

  /** Re-reads just the invoices and their balances after a payment is recorded from a row. Deliberately not `load()`, which blanks the whole table while it reloads. */
  const refreshInvoices = useCallback(async () => {
    if (!profile?.companyId) return;
    try {
      const list = await invoiceService.listForCompany({ companyId: profile.companyId });
      setInvoices(list);
      await loadSummaries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment saved, but the list could not refresh.");
    }
  }, [invoiceService, loadSummaries, profile]);

  /** Receive Payment is only offered where a balance is still owed, and only to users allowed to record payments. */
  const showReceivePayment = (invoice: Invoice) => canRecordPayment && isOutstandingInvoiceStatus(invoice.status);

  /** What is still owed on an invoice. Drafts and dead invoices owe nothing yet. */
  const balanceOf = (invoice: Invoice): number | null => {
    if (!isBilledInvoice(invoice) || !isOutstandingInvoiceStatus(invoice.status)) return null;
    return summaries[invoice.id]?.remainingBalance ?? invoice.total;
  };

  const counts = useMemo(() => {
    const count = (tab: TabFilter) => invoices.filter((i) => matchesTab(i, tab)).length;
    return {
      open: count("open"),
      draft: count("draft"),
      paid: count("paid"),
      all: invoices.length,
      cancelled: count("cancelled"),
      void: count("void"),
    };
  }, [invoices]);

  /** Company-wide figures for the strip. They ignore the tab and search, so they always show the whole picture. */
  const totals = useMemo(() => {
    const billedOpen = invoices.filter((i) => isBilledInvoice(i) && isOutstandingInvoiceStatus(i.status) && i.total > 0);
    const overdue = invoices.filter((i) => i.status === "overdue");
    const drafts = invoices.filter((i) => i.status === "draft");
    const paid = invoices.filter((i) => i.status === "paid");
    const sum = (rows: Invoice[], pick: (i: Invoice) => number) => rows.reduce((total, i) => total + pick(i), 0);
    return {
      outstanding: { amount: sum(billedOpen, (i) => summaries[i.id]?.remainingBalance ?? i.total), count: billedOpen.length },
      overdue: { amount: sum(overdue, (i) => summaries[i.id]?.remainingBalance ?? i.total), count: overdue.length },
      drafts: { amount: sum(drafts, (i) => i.total), count: drafts.length },
      paid: { amount: sum(paid, (i) => i.total), count: paid.length },
    };
  }, [invoices, summaries]);

  const filtered = useMemo(() => {
    let rows = invoices.filter((i) => matchesTab(i, tab));

    if (search.trim()) {
      const q = search.trim().toLowerCase();

      rows = rows.filter((i) => {
        const project = projectsById[i.projectId];
        const client = i.clientId ? clientsById[i.clientId] : undefined;
        const estimate = i.estimateId ? estimatesById[i.estimateId] : undefined;

        return (
          i.invoiceNumber.toLowerCase().includes(q) ||
          (project?.name ?? "").toLowerCase().includes(q) ||
          (client?.name ?? "").toLowerCase().includes(q) ||
          (estimate?.title ?? "").toLowerCase().includes(q)
        );
      });
    }

    const sorted = [...rows].sort((a, b) => {
      if (sortKey === "total") return b.total - a.total;
      if (sortKey === "dueDate") return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      return b.createdAt.localeCompare(a.createdAt);
    });

    // Paid invoices sink to the bottom, so what still needs action stays at the top.
    return sorted.sort((a, b) => Number(a.status === "paid") - Number(b.status === "paid"));
  }, [invoices, tab, search, sortKey, projectsById, clientsById, estimatesById]);

  const moreSelected = MORE_TABS.some((m) => m.key === tab);

  return (
    <PageContainer>
      <PageHeader
        title="Invoices"
        description="Bill clients and track what's owed."
        actions={
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> New Invoice
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {!loading && invoices.length > 0 && (
        <div className="mb-5 grid grid-cols-4 border-y border-border">
          <Figure label="Outstanding" amount={totals.outstanding.amount} count={totals.outstanding.count} />
          <Figure
            label="Overdue"
            amount={totals.overdue.amount}
            count={totals.overdue.count}
            tone={totals.overdue.count > 0 ? "danger" : undefined}
          />
          <Figure label="Drafts, not sent" amount={totals.drafts.amount} count={totals.drafts.count} />
          <Figure label="Paid in full" amount={totals.paid.amount} count={totals.paid.count} />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:flex-none">
          <div className="flex min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-card text-[13px] [scrollbar-width:none] sm:flex-none">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex-1 whitespace-nowrap px-2 py-1.5 first:rounded-l-lg last:rounded-r-lg sm:flex-none sm:px-3 ${
                  tab === t.key ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-muted"
                }`}
              >
                {t.label} <span className={tab === t.key ? "opacity-80" : "text-muted-foreground"}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <select
            value={moreSelected ? tab : ""}
            onChange={(e) => e.target.value && setTab(e.target.value as TabFilter)}
            aria-label="Other statuses"
            className={`h-[34px] shrink-0 rounded-lg border border-border bg-card px-2 text-[13px] ${moreSelected ? "font-semibold text-primary" : "text-muted-foreground"}`}
          >
            <option value="">More</option>
            {MORE_TABS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({counts[m.key]})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoices, clients, projects"
              className="h-[34px] w-full rounded-lg border border-border bg-card pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort invoices"
            className="h-[34px] shrink-0 rounded-lg border border-border bg-card px-2 text-[13px] text-foreground"
          >
            <option value="createdAt">Newest</option>
            <option value="dueDate">Due date</option>
            <option value="total">Total (high-low)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-[13px] text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <EmptyState
            icon={Receipt}
            title={invoices.length === 0 ? "No invoices yet" : "No invoices match your filters"}
            description="Create an invoice from an approved estimate."
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:px-4 [&_th]:py-2 [&_th]:font-semibold">
                <tr>
                  <th>Invoice</th>
                  <th>Client · project</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((invoice) => {
                  const view = statusView(invoice, summaries[invoice.id]);
                  const balance = balanceOf(invoice);
                  const overdue = invoice.status === "overdue";
                  const project = projectsById[invoice.projectId];
                  const client = invoice.clientId ? clientsById[invoice.clientId] : undefined;

                  return (
                    <tr key={invoice.id} className="align-top hover:bg-muted/30">
                      <td className={`px-4 py-2.5 ${overdue ? "shadow-[inset_3px_0_0_0_var(--color-danger)]" : ""}`}>
                        <Link href={`/invoices/${invoice.id}`} className="font-semibold text-foreground hover:text-primary hover:underline">
                          {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                        </Link>
                        <div className="text-[12px] text-muted-foreground">{invoice.issueDate ?? "—"}</div>
                      </td>

                      <td className="px-4 py-2.5">
                        {client ? (
                          <Link href={`/clients/${client.id}`} className="text-foreground hover:text-primary hover:underline">
                            {client.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">No client</span>
                        )}
                        <div className="text-[12px] text-muted-foreground">
                          {project ? (
                            <Link href={`/projects/${project.id}`} className="hover:text-foreground hover:underline">
                              {project.name}
                            </Link>
                          ) : (
                            "No project"
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-2.5">
                        <div className={`font-semibold ${STATUS_TEXT[view.tone]}`}>{view.label}</div>
                        {view.detail && <div className={`text-[12px] ${view.tone === "danger" ? "text-danger" : "text-muted-foreground"}`}>{view.detail}</div>}
                      </td>

                      <td className={`px-4 py-2.5 tabular-nums ${overdue ? "text-danger" : "text-muted-foreground"}`}>{invoice.dueDate ?? "—"}</td>

                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMoney(invoice.total)}</td>

                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${overdue ? "text-danger" : "text-foreground"}`}>
                        {balance !== null && balance > 0 ? formatMoney(balance) : <span className="font-normal text-muted-foreground">—</span>}
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        {showReceivePayment(invoice) && (
                          <RecordPaymentButton
                            variant="link"
                            invoiceId={invoice.id}
                            companyId={invoice.companyId}
                            invoiceTotal={invoice.total}
                            onRecorded={refreshInvoices}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card sm:hidden">
            {filtered.map((invoice) => {
              const view = statusView(invoice, summaries[invoice.id]);
              const balance = balanceOf(invoice);
              const overdue = invoice.status === "overdue";
              const client = invoice.clientId ? clientsById[invoice.clientId] : undefined;
              const project = projectsById[invoice.projectId];

              return (
                // Not a <Link>: the client and the payment button inside are their own interactive elements.
                <div
                  key={invoice.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/invoices/${invoice.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/invoices/${invoice.id}`);
                  }}
                  className={`cursor-pointer border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/30 ${overdue ? "shadow-[inset_3px_0_0_0_var(--color-danger)]" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">{invoice.invoiceNumber || invoice.id.slice(0, 8)}</div>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {client?.name ?? "No client"}
                        {project ? ` · ${project.name}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-semibold tabular-nums ${overdue ? "text-danger" : "text-foreground"}`}>
                        {balance !== null && balance > 0 ? formatMoney(balance) : formatMoney(invoice.total)}
                      </div>
                      {balance !== null && balance > 0 && <div className="text-[11px] text-muted-foreground">of {formatMoney(invoice.total)}</div>}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3 text-[12px]">
                    <div className="min-w-0">
                      <span className={`font-semibold ${STATUS_TEXT[view.tone]}`}>{view.label}</span>
                      {view.detail && <span className={`ml-1.5 ${view.tone === "danger" ? "text-danger" : "text-muted-foreground"}`}>{view.detail}</span>}
                      {invoice.dueDate && view.tone !== "muted" && (
                        <span className="ml-1.5 text-muted-foreground">· due {invoice.dueDate}</span>
                      )}
                    </div>
                    {showReceivePayment(invoice) && (
                      <RecordPaymentButton
                        variant="link"
                        invoiceId={invoice.id}
                        companyId={invoice.companyId}
                        invoiceTotal={invoice.total}
                        onRecorded={refreshInvoices}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[12px] text-muted-foreground">
            Showing {filtered.length} of {invoices.length}
          </div>
        </>
      )}
    </PageContainer>
  );
}

function Figure({ label, amount, count, tone }: { label: string; amount: number; count: number; tone?: "danger" }) {
  return (
    <div className="min-w-0 border-l border-border px-1.5 py-3 first:border-l-0 first:pl-0 sm:px-5 sm:py-4 sm:first:pl-0">
      <div className={`text-[11px] leading-tight sm:text-[12px] ${tone === "danger" ? "text-danger" : "text-muted-foreground"}`}>{label}</div>
      <div className={`mt-0.5 whitespace-nowrap text-[13px] font-bold tabular-nums sm:text-2xl ${tone === "danger" ? "text-danger" : "text-foreground"}`}>{formatMoney(amount)}</div>
      <div className="text-[11px] text-muted-foreground sm:text-[12px]">
        {count} {count === 1 ? "invoice" : "invoices"}
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <RequirePermission resource="invoice" action="view">
      <InvoicesListContent />
    </RequirePermission>
  );
}
