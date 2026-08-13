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
import type { Estimate } from "@/lib/services/estimateService";

type SortKey = "createdAt" | "dueDate" | "total";
type StatusFilter = InvoiceStatus | "all";

const STATUS_OPTIONS: InvoiceStatus[] = [
  "draft",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
  "void",
];

function InvoicesListContent() {
  const { invoiceService, projectService, clientService, estimateService } = useServices();
  const { profile } = useAuth();

  const [estimatesById, setEstimatesById] = useState<Record<string, Estimate>>({});

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
      const [
        invoiceList,
        projectList,
        clientList,
        estimateList,
      ] = await Promise.all([
        invoiceService.listForCompany({
          companyId: profile.companyId,
        }),
        projectService.list({
          companyId: profile.companyId,
        }),
        clientService.list({
          companyId: profile.companyId,
        }),
        estimateService.list({
          companyId: profile.companyId,
        }),
      ]);

      setInvoices(invoiceList);
      setEstimatesById(
        Object.fromEntries(
          estimateList.map((e) => [e.id, e])
        )
      );

      setProjectsById(
        Object.fromEntries(
          projectList.map((p) => [p.id, p])
        )
      );

      setClientsById(
        Object.fromEntries(
          clientList.map((c) => [c.id, c])
        )
      );

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load invoices."
      );
    } finally {
      setLoading(false);
    }

  }, [
    invoiceService,
    projectService,
    clientService,
    estimateService,
    profile,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = invoices;

    if (statusFilter !== "all") {
      rows = rows.filter(
        (i) => i.status === statusFilter
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();

      rows = rows.filter((i) => {
        const project = projectsById[i.projectId];
        const client = i.clientId ? clientsById[i.clientId] : undefined;
        const estId = (i as any).estimateId;
        const estimate = estId ? estimatesById[estId] : undefined;

        return (
          i.invoiceNumber.toLowerCase().includes(q) ||
          (project?.name ?? "").toLowerCase().includes(q) ||
          (client?.name ?? "").toLowerCase().includes(q) ||
          (estimate?.title ?? "").toLowerCase().includes(q)
        );
      });
    }

    return [...rows].sort((a,b) => {
      if(sortKey === "total")
        return b.total - a.total;
      if(sortKey === "dueDate")
        return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [
    invoices,
    statusFilter,
    search,
    sortKey,
    projectsById,
    clientsById,
    estimatesById,
  ]);

  const sortedFilteredInvoices = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aPaid = a.status === "paid" ? 1 : 0;
      const bPaid = b.status === "paid" ? 1 : 0;
      return aPaid - bPaid;
    });
  }, [filtered]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700">
      <PageContainer>
        <PageHeader
          title="Invoices"
          description="Bill clients and track what's owed."
          actions={
            <Link
              href="/invoices/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-600/40 hover:shadow-xl hover:shadow-emerald-600/50 hover:scale-105 transition-all duration-300"
            >
              <Plus className="size-4" />
              New Invoice
            </Link>
          }
        />

        {error && (
          <div className="mb-4 rounded-lg bg-gradient-to-r from-rose-50 to-rose-100 border border-rose-200 px-4 py-3 text-sm text-rose-700 shadow-lg shadow-rose-500/10">
            {error}
          </div>
        )}

        {/* Filters - Gradient Card */}
        <div className="mb-6 flex flex-wrap items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border border-white/30 shadow-xl shadow-black/20">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-emerald-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, project, client..."
              className="
                h-10
                w-full
                rounded-lg
                bg-white/80
                border
                border-emerald-200
                pl-9
                pr-3
                text-sm
                text-emerald-900
                placeholder:text-emerald-400
                focus:border-emerald-400
                focus:ring-2
                focus:ring-emerald-400/30
                focus:bg-white
                transition-all
              "
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-10 rounded-lg bg-white/80 border border-emerald-200 px-3 text-sm text-emerald-900 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 focus:bg-white transition-all"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-10 rounded-lg bg-white/80 border border-emerald-200 px-3 text-sm text-emerald-900 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 focus:bg-white transition-all"
          >
            <option value="createdAt">Newest first</option>
            <option value="dueDate">Due date</option>
            <option value="total">Total (high-low)</option>
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-white/80">
            Loading...
          </div>
        ) : sortedFilteredInvoices.length === 0 ? (
          <div className="rounded-lg bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border border-white/30 p-8 shadow-xl shadow-black/20">
            <EmptyState
              icon={Receipt}
              title={
                invoices.length === 0
                  ? "No invoices yet"
                  : "No invoices match your filters"
              }
              description="Create an invoice from an approved estimate."
            />
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE - Gradient Card */}
            <div className="hidden overflow-x-auto rounded-lg bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border border-white/30 shadow-xl shadow-black/20 sm:block">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-emerald-200/40 via-teal-200/40 to-cyan-200/40 border-b border-white/30">
                  <tr>
                    {[
                      "Invoice #",
                      "Project",
                      "Client",
                      "Status",
                      "Amount",
                      "Due",
                    ].map((title) => (
                      <th
                        key={title}
                        className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-emerald-800"
                      >
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/30">
                  {sortedFilteredInvoices.map((invoice) => {
                    const border =
                      invoice.status === "paid"
                        ? "border-l-4 border-l-emerald-500"
                        : invoice.status === "partially_paid"
                        ? "border-l-4 border-l-amber-500"
                        : invoice.status === "overdue"
                        ? "border-l-4 border-l-rose-500"
                        : "border-l-4 border-l-emerald-300";

                    const estId = (invoice as any).estimateId;
                    const estimateTitle = estId ? estimatesById[estId]?.title : null;

                    return (
                      <tr
                        key={invoice.id}
                        className={`${border} transition-colors hover:bg-white/40`}
                      >
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="font-semibold text-emerald-900 hover:text-emerald-600 transition-colors"
                          >
                            {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                          </Link>
                        </td>

                        <td className="px-4 py-3.5">
                          {estId ? (
                            <Link
                              href={`/estimates/${estId}`}
                              className="text-sm font-medium text-emerald-800 hover:text-emerald-600 hover:underline transition-colors"
                            >
                              {estimateTitle ?? "Estimate"}
                            </Link>
                          ) : (
                            estimateTitle && (
                              <div className="text-sm font-medium text-emerald-800">
                                {estimateTitle}
                              </div>
                            )
                          )}
                          <div className="text-xs text-emerald-600/60">
                            {projectsById[invoice.projectId]?.name ?? "—"}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-emerald-700/70">
                          {invoice.clientId
                            ? clientsById[invoice.clientId]?.name ?? "—"
                            : "—"}
                        </td>

                        <td className="px-4 py-3.5">
                          <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>
                            {invoice.status.replace(/_/g, " ")}
                          </Badge>
                        </td>

                        <td className="px-4 py-3.5 text-right font-bold text-emerald-900">
                          {formatMoney(invoice.total)}
                        </td>

                        <td className="px-4 py-3.5 text-xs text-emerald-600/60">
                          {invoice.dueDate ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS - Gradient Cards */}
            <div className="space-y-3 sm:hidden">
              {sortedFilteredInvoices.map((invoice) => {
                const estId = (invoice as any).estimateId;
                const estimateTitle = estId ? estimatesById[estId]?.title : null;
                const projectName = projectsById[invoice.projectId]?.name ?? "—";

                let statusBadge = "bg-gray-100 text-gray-600";
                let statusLabel = "Draft";
                
                if (invoice.status === "paid") {
                  statusBadge = "bg-emerald-100 text-emerald-700";
                  statusLabel = "Paid";
                } else if (invoice.status === "partially_paid") {
                  statusBadge = "bg-amber-100 text-amber-700";
                  statusLabel = "Partial";
                } else if (invoice.status === "overdue") {
                  statusBadge = "bg-rose-100 text-rose-700";
                  statusLabel = "Overdue";
                } else if (invoice.status === "sent") {
                  statusBadge = "bg-blue-100 text-blue-700";
                  statusLabel = "Sent";
                }

                // Random gradient for each card
                const gradients = [
                  "from-emerald-50 via-teal-50 to-cyan-50",
                  "from-emerald-100 via-teal-50 to-cyan-50",
                  "from-emerald-50 via-teal-100 to-cyan-50",
                  "from-emerald-50 via-teal-50 to-cyan-100",
                ];
                const gradient = gradients[Math.floor(Math.random() * gradients.length)];

                return (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    className={`group block rounded-lg bg-gradient-to-br ${gradient} border border-white/30 p-4 shadow-xl shadow-black/20 transition-all hover:shadow-2xl hover:shadow-black/30 hover:scale-[1.02]`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold text-emerald-900">
                          {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                        </h3>
                        
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-emerald-700/80">
                            {projectName}
                          </span>
                          {estimateTitle && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-emerald-300" />
                              <span className="text-xs text-emerald-600/70">
                                {estimateTitle}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-base font-bold text-emerald-900">
                          {formatMoney(invoice.total)}
                        </div>
                        <div className="mt-0.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${statusBadge}`}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between border-t border-white/30 pt-2.5">
                      <div className="text-xs text-emerald-600/70">
                        {invoice.clientId ? clientsById[invoice.clientId]?.name ?? "—" : "—"}
                      </div>
                      {invoice.dueDate && (
                        <div className="text-xs text-emerald-600/70">
                          Due: <span className="font-medium text-emerald-700">{invoice.dueDate}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </PageContainer>
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