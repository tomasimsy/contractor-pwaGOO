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
import { INVOICE_STATUS_TONE, formatMoney, isUnpaidInvoiceStatus, isOutstandingInvoiceStatus } from "@/components/invoices/invoiceStatus";
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-600/40 hover:shadow-xl hover:shadow-emerald-600/50 hover:scale-105 transition-all duration-300"
            >
              <Plus className="size-4" />
              New Invoice
            </Link>
          }
        />

        {error && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 space-y-3 p-3 sm:p-4 rounded-lg bg-white border border-emerald-200/60 shadow-sm">
          <div className="flex flex-nowrap items-center gap-1.5 sm:flex-wrap sm:gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-emerald-500 sm:left-3 sm:size-4" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="
                  h-9
                  sm:h-10
                  w-full
                  rounded-lg
                  bg-white/80
                  border
                  border-emerald-200
                  pl-8
                  sm:pl-9
                  pr-2
                  sm:pr-3
                  text-xs
                  sm:text-sm
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

            {/* Status — a compact select on mobile so it doesn't eat a
                whole row of pills; the full pill row below takes over
                at sm+ where there's room for it. */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-9 shrink-0 rounded-lg bg-white/80 border border-emerald-200 px-1.5 text-[11px] text-emerald-900 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 focus:bg-white transition-all sm:hidden"
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
              className="h-9 shrink-0 rounded-lg bg-white/80 border border-emerald-200 px-1.5 text-[11px] text-emerald-900 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 focus:bg-white transition-all sm:h-10 sm:px-3 sm:text-sm"
            >
              <option value="createdAt">Newest</option>
              <option value="dueDate">Due date</option>
              <option value="total">Total (high-low)</option>
            </select>
          </div>

          {/* Quick status filters — pills instead of a dropdown, so
              switching status is a single click/tap, matching the
              lifecycle-tab pattern already used on the Estimates list.
              Hidden on mobile (the select above covers it there) since
              a full row of pills ate half the screen on small phones. */}
          <div className="hidden flex-wrap gap-1.5 sm:flex">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === "all" ? "bg-emerald-600 text-white shadow-sm" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              All
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  statusFilter === s ? "bg-emerald-600 text-white shadow-sm" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                {s.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-emerald-600/60">
            Loading...
          </div>
        ) : sortedFilteredInvoices.length === 0 ? (
          <div className="rounded-lg bg-white border border-emerald-200/60 p-8 shadow-sm">
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
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-lg bg-white border border-emerald-200/60 shadow-sm sm:block">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
                  <tr>
                    {[
                      "Invoice #",
                      "Project",
                      "Client",
                      "Status",
                      "Payment",
                      "Amount",
                      "Due",
                    ].map((title) => (
                      <th
                        key={title}
                        className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider"
                      >
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-emerald-100/60">
                  {sortedFilteredInvoices.map((invoice) => {
                    const outstanding = isOutstandingInvoiceStatus(invoice.status);
                    const border =
                      invoice.status === "paid"
                        ? "border-l-4 border-l-emerald-500"
                        : invoice.status === "overdue"
                        ? "border-l-4 border-l-rose-500"
                        : isUnpaidInvoiceStatus(invoice.status)
                        ? "border-l-4 border-l-rose-400"
                        : outstanding
                        ? "border-l-4 border-l-rose-200"
                        : "border-l-4 border-l-emerald-300";

                    const estId = (invoice as any).estimateId;
                    const estimateTitle = estId ? estimatesById[estId]?.title : null;

                    return (
                      <tr
                        key={invoice.id}
                        className={`${border} transition-colors hover:bg-emerald-50/80`}
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

                        <td className="px-4 py-3.5">
                          {outstanding ? (
                            <span className="inline-flex items-center rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                              Unpaid
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                              Paid
                            </span>
                          )}
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

            {/* Mobile cards — solid dark emerald, same treatment the
                Estimates list mobile cards use, so the two lists read as
                one design language instead of two different apps. No
                per-render randomness: color is driven by invoice
                STATUS (a real fact), never Math.random(). */}
            <div className="space-y-3 sm:hidden">
              {sortedFilteredInvoices.map((invoice) => {
                const estId = (invoice as any).estimateId;
                const estimateTitle = estId ? estimatesById[estId]?.title : null;
                const projectName = projectsById[invoice.projectId]?.name ?? "—";

                let statusBadge = "bg-white/90 text-slate-700";
                let statusLabel = "Draft";

                if (invoice.status === "paid") {
                  statusBadge = "bg-emerald-100 text-emerald-800";
                  statusLabel = "Paid";
                } else if (invoice.status === "partially_paid") {
                  statusBadge = "bg-amber-100 text-amber-800";
                  statusLabel = "Partial";
                } else if (invoice.status === "overdue") {
                  statusBadge = "bg-rose-100 text-rose-800";
                  statusLabel = "Overdue";
                } else if (invoice.status === "sent") {
                  statusBadge = "bg-blue-100 text-blue-800";
                  statusLabel = "Sent";
                }

                return (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    className="group relative flex flex-col gap-3 rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-900 border border-emerald-600 px-4 py-3.5 shadow-sm transition-all hover:shadow-md hover:scale-[1.01] hover:from-emerald-800 hover:to-emerald-950"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold text-white">
                          {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                        </h3>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-white/80">
                            {projectName}
                          </span>
                          {estimateTitle && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-white/40" />
                              <span className="text-xs text-white/70">
                                {estimateTitle}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-base font-bold text-white">
                          {formatMoney(invoice.total)}
                        </div>
                        <div className="mt-0.5 flex items-center justify-end gap-1">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge}`}>
                            {statusLabel}
                          </span>
                          {isOutstandingInvoiceStatus(invoice.status) && (
                            <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              Unpaid
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/20 pt-2.5">
                      <div className="text-[10px] text-white/70">
                        {invoice.clientId ? clientsById[invoice.clientId]?.name ?? "—" : "—"}
                      </div>
                      {invoice.dueDate && (
                        <div className="text-[10px] text-white/70">
                          Due: <span className="font-medium text-white">{invoice.dueDate}</span>
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