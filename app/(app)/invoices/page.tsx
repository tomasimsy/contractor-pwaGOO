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
    <PageContainer>
      <PageHeader
        title="Invoices"
        description="Bill clients and track what's owed."
        actions={
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:from-orange-600 hover:to-orange-700 shadow-sm shadow-orange-200/50 transition-all hover:shadow-md"
          >
            <Plus className="size-4" />
            New Invoice
          </Link>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg bg-rose-50/80 backdrop-blur-sm px-3 py-2 text-sm text-rose-700 border border-rose-200/40">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-orange-500/60" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, project, client..."
            className="
              h-9
              w-full
              rounded-lg
              border
              border-orange-200/40
              bg-white/80
              backdrop-blur-sm
              pl-8
              pr-3
              text-sm
              text-orange-900
              placeholder:text-orange-400/60
              focus:border-orange-400/60
              focus:ring-2
              focus:ring-orange-200/40
              transition-all
            "
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-9 rounded-lg border border-orange-200/40 bg-white/80 backdrop-blur-sm px-2 text-sm text-orange-900 focus:border-orange-400/60 focus:ring-2 focus:ring-orange-200/40 transition-all"
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
          className="h-9 rounded-lg border border-orange-200/40 bg-white/80 backdrop-blur-sm px-2 text-sm text-orange-900 focus:border-orange-400/60 focus:ring-2 focus:ring-orange-200/40 transition-all"
        >
          <option value="createdAt">Newest first</option>
          <option value="dueDate">Due date</option>
          <option value="total">Total (high-low)</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-orange-600/60">
          Loading...
        </div>
      ) : sortedFilteredInvoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            invoices.length === 0
              ? "No invoices yet"
              : "No invoices match your filters"
          }
          description="Create an invoice from an approved estimate."
        />
      ) : (
        <>
          {/* DESKTOP TABLE */}
          <div className="hidden overflow-x-auto rounded-xl border border-orange-200/40 bg-white/80 backdrop-blur-sm sm:block shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-orange-400/90 to-orange-500/90 text-white backdrop-blur-sm">
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
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/90"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-orange-100/40">
                {sortedFilteredInvoices.map((invoice, index) => {
                  const border =
                    invoice.status === "paid"
                      ? "border-l-emerald-500"
                      : invoice.status === "partially_paid"
                      ? "border-l-amber-500"
                      : invoice.status === "overdue"
                      ? "border-l-rose-500"
                      : "border-l-orange-300/60";

                  const estId = (invoice as any).estimateId;
                  const estimateTitle = estId ? estimatesById[estId]?.title : null;

                  const rowColors = [
                    "hover:bg-orange-50/40",
                    "hover:bg-amber-50/40",
                    "hover:bg-orange-50/40",
                    "hover:bg-amber-50/40",
                  ];
                  const rowColor = rowColors[index % rowColors.length];

                  return (
                    <tr
                      key={invoice.id}
                      className={`border-l-4 ${border} transition-colors ${rowColor}`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="font-semibold text-orange-900 hover:text-orange-600 transition-colors"
                        >
                          {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                        </Link>
                      </td>

                      <td className="px-4 py-3">
                        {estId ? (
                          <Link
                            href={`/estimates/${estId}`}
                            className="text-sm font-semibold text-orange-800 hover:text-orange-600 hover:underline transition-colors"
                          >
                            {estimateTitle ?? "Estimate"}
                          </Link>
                        ) : (
                          estimateTitle && (
                            <div className="text-sm font-semibold text-orange-800">
                              {estimateTitle}
                            </div>
                          )
                        )}
                        <div className="text-xs text-orange-600/60">
                          {projectsById[invoice.projectId]?.name ?? "—"}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-orange-700/70">
                        {invoice.clientId
                          ? clientsById[invoice.clientId]?.name ?? "—"
                          : "—"}
                      </td>

                      <td className="px-4 py-3">
                        <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>
                          {invoice.status.replace(/_/g, " ")}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-orange-700">
                        {formatMoney(invoice.total)}
                      </td>

                      <td className="px-4 py-3 text-xs text-orange-600/60">
                        {invoice.dueDate ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARDS */}
          <div className="space-y-3 sm:hidden">
            {sortedFilteredInvoices.map((invoice) => {
              const estId = (invoice as any).estimateId;
              const estimateTitle = estId ? estimatesById[estId]?.title : null;
              const projectName = projectsById[invoice.projectId]?.name ?? "—";

              let statusBadge = "bg-white/80 text-orange-700";
              let statusLabel = "Draft";
              
              if (invoice.status === "paid") {
                statusBadge = "bg-emerald-100/80 text-emerald-700";
                statusLabel = "Paid";
              } else if (invoice.status === "partially_paid") {
                statusBadge = "bg-amber-100/80 text-amber-800";
                statusLabel = "Partial";
              } else if (invoice.status === "overdue") {
                statusBadge = "bg-rose-100/80 text-rose-800";
                statusLabel = "Overdue";
              } else if (invoice.status === "sent") {
                statusBadge = "bg-white/80 text-orange-700";
                statusLabel = "Sent";
              }

              return (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="group relative flex flex-col gap-3 rounded-xl bg-gradient-to-br from-orange-400/20 to-orange-500/20 backdrop-blur-sm border border-orange-300/30 px-4 py-3.5 shadow-sm transition-all hover:shadow-md hover:scale-[1.01] hover:from-orange-400/30 hover:to-orange-500/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-orange-900">
                        {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                      </h3>
                      
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-orange-800/80">
                          {projectName}
                        </span>
                        {estimateTitle && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-orange-400/40" />
                            <span className="text-xs text-orange-700/80">
                              {estimateTitle}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-base font-bold text-orange-900">
                        {formatMoney(invoice.total)}
                      </div>
                      <div className="mt-0.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-orange-200/30 pt-2.5">
                    <div className="text-[10px] text-orange-700/70">
                      {invoice.clientId ? clientsById[invoice.clientId]?.name ?? "—" : "—"}
                    </div>
                    {invoice.dueDate && (
                      <div className="text-[10px] text-orange-700/70">
                        Due: <span className="font-medium text-orange-800">{invoice.dueDate}</span>
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
  );
}

export default function InvoicesPage() {
  return (
    <RequirePermission resource="invoice" action="view">
      <InvoicesListContent />
    </RequirePermission>
  );
}