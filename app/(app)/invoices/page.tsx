"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Receipt, Plus, Search } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { INVOICE_STATUS_TONE, formatMoney } from "@/components/invoices/invoiceStatus";
import type { Invoice, InvoiceStatus } from "@/lib/services/invoiceService";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";

type SortKey = "createdAt" | "dueDate" | "total";
type StatusFilter = InvoiceStatus | "all";

const STATUS_OPTIONS: InvoiceStatus[] = ["draft", "sent", "viewed", "partially_paid", "paid", "overdue", "cancelled", "void"];

function InvoicesListContent() {
  const { invoiceService, projectService, clientService } = useServices();
  const { profile } = useAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [invoiceList, projectList, clientList] = await Promise.all([
        invoiceService.listForCompany({ companyId: profile.companyId }),
        projectService.list({ companyId: profile.companyId }),
        clientService.list({ companyId: profile.companyId }),
      ]);
      setInvoices(invoiceList);
      setProjectsById(Object.fromEntries(projectList.map((p) => [p.id, p])));
      setClientsById(Object.fromEntries(clientList.map((c) => [c.id, c])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [invoiceService, projectService, clientService, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = invoices;
    if (statusFilter !== "all") rows = rows.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((i) => {
        const project = projectsById[i.projectId];
        const client = i.clientId ? clientsById[i.clientId] : undefined;
        return (
          i.invoiceNumber.toLowerCase().includes(q) ||
          (project?.name ?? "").toLowerCase().includes(q) ||
          (client?.name ?? "").toLowerCase().includes(q)
        );
      });
    }
    return [...rows].sort((a, b) => {
      if (sortKey === "total") return b.total - a.total;
      if (sortKey === "dueDate") return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [invoices, statusFilter, search, sortKey, projectsById, clientsById]);

  return (
    <PageContainer>
      <PageHeader
        title="Invoices"
        description="Bill clients and track what's owed."
        actions={
          <Link href="/invoices/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> New Invoice
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, project, client…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="createdAt">Newest first</option>
          <option value="dueDate">Due date</option>
          <option value="total">Total (high–low)</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={invoices.length === 0 ? "No invoices yet" : "No invoices match your filters"}
          description={invoices.length === 0 ? "Create one from an approved estimate, or bill a project directly." : "Try a different search or status filter."}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice #</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                  <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <Link href={`/invoices/${invoice.id}`} className="font-medium text-foreground hover:text-primary">
                        {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{projectsById[invoice.projectId]?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{invoice.clientId ? clientsById[invoice.clientId]?.name ?? "—" : "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>{invoice.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-foreground">{formatMoney(invoice.total)}</td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">{invoice.dueDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 sm:hidden">
            {filtered.map((invoice) => (
              <Link key={invoice.id} href={`/invoices/${invoice.id}`} className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{invoice.invoiceNumber || invoice.id.slice(0, 8)}</span>
                  <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>{invoice.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {projectsById[invoice.projectId]?.name ?? "—"} · {invoice.clientId ? clientsById[invoice.clientId]?.name ?? "—" : "No client"}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">{formatMoney(invoice.total)}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}

export default function InvoicesPage() {
  return (
    <RequirePermission resource="invoice" action="view">
      <InvoicesListContent />
    </RequirePermission>
  );
}
