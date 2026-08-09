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

      const q = search
        .trim()
        .toLowerCase();

      rows = rows.filter((i) => {

        const project =
          projectsById[i.projectId];

        const client =
          i.clientId
            ? clientsById[i.clientId]
            : undefined;

        const estId = (i as any).estimateId;
        const estimate =
          estId
            ? estimatesById[estId]
            : undefined;


        return (
          i.invoiceNumber
            .toLowerCase()
            .includes(q) ||
          (project?.name ?? "")
            .toLowerCase()
            .includes(q) ||
          (client?.name ?? "")
            .toLowerCase()
            .includes(q) ||
          (estimate?.title ?? "")
            .toLowerCase()
            .includes(q)
        );
      });
    }


    return [...rows].sort((a,b)=>{

      if(sortKey==="total")
        return b.total-a.total;

      if(sortKey==="dueDate")
        return (a.dueDate ?? "")
          .localeCompare(b.dueDate ?? "");

      return b.createdAt
        .localeCompare(a.createdAt);

    });


  },[
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New Invoice
          </Link>
        }
      />


      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}


      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">

        <div className="relative flex-1 min-w-[180px] max-w-sm">

          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />

          <input
            type="search"
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            placeholder="Search invoice #, project, client..."
            className="
              h-9
              w-full
              rounded-lg
              border
              border-input
              bg-background
              pl-8
              pr-3
              text-sm
            "
          />

        </div>


        <select
          value={statusFilter}
          onChange={(e)=>setStatusFilter(e.target.value as StatusFilter)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="all">
            All statuses
          </option>

          {STATUS_OPTIONS.map((s)=>(
            <option key={s} value={s}>
              {s.replace(/_/g," ")}
            </option>
          ))}

        </select>


        <select
          value={sortKey}
          onChange={(e)=>setSortKey(e.target.value as SortKey)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="createdAt">
            Newest first
          </option>

          <option value="dueDate">
            Due date
          </option>

          <option value="total">
            Total (high-low)
          </option>

        </select>

      </div>



      {loading ? (

        <div className="py-12 text-center text-sm text-muted-foreground">
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
          <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">

            <table className="w-full text-sm">

              <thead className="bg-muted/50">

                <tr>

                  {[
                    "Invoice #",
                    "Project",
                    "Client",
                    "Status",
                    "Amount",
                    "Due",
                  ].map((title)=>(
                    <th
                      key={title}
                      className="
                        px-4
                        py-3
                        text-left
                        text-xs
                        font-semibold
                        uppercase
                        tracking-wide
                        text-muted-foreground
                      "
                    >
                      {title}
                    </th>
                  ))}

                </tr>

              </thead>



              <tbody className="divide-y divide-border">

                {sortedFilteredInvoices.map((invoice)=>{


                  const border =
                    invoice.status==="paid"
                      ? "border-l-emerald-500"
                      : invoice.status==="partially_paid"
                      ? "border-l-amber-500"
                      : invoice.status==="overdue"
                      ? "border-l-rose-500"
                      : "border-l-muted-foreground/30";

                  const estId = (invoice as any).estimateId;
                  const estimateTitle = estId ? estimatesById[estId]?.title : null;


                  return (

                    <tr
                      key={invoice.id}
                      className={`
                        border-l-4
                        ${border}
                        transition
                        hover:bg-muted/40
                      `}
                    >

                      <td className="px-4 py-3">

                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="
                            font-semibold
                            text-foreground
                            hover:text-primary
                          "
                        >
                          {invoice.invoiceNumber ||
                           invoice.id.slice(0,8)}
                        </Link>

                      </td>


                      <td className="px-4 py-3">
                        {estId ? (
                          <Link
                            href={`/estimates/${estId}`}
                            className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {estimateTitle ?? "Estimate"}
                          </Link>
                        ) : (
                          estimateTitle && (
                            <div className="text-sm font-semibold text-foreground">
                              {estimateTitle}
                            </div>
                          )
                        )}
                        <div className="text-xs text-muted-foreground">
                          {projectsById[invoice.projectId]?.name ?? "—"}
                        </div>
                      </td>


                      <td className="px-4 py-3 text-muted-foreground">
                        {
                          invoice.clientId
                            ? clientsById[invoice.clientId]?.name ?? "—"
                            : "—"
                        }
                      </td>


                      <td className="px-4 py-3">

                        <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>
                          {invoice.status.replace(/_/g," ")}
                        </Badge>

                      </td>


                      <td className="px-4 py-3 text-right font-bold">

                        {formatMoney(invoice.total)}

                      </td>


                      <td className="px-4 py-3 text-xs text-muted-foreground">

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

            {sortedFilteredInvoices.map((invoice)=>{

              const cardStyle =
                invoice.status === "paid"
                  ? "bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-500/10 dark:border-emerald-500/20 opacity-75 hover:opacity-100"
                  : invoice.status === "partially_paid"
                  ? "bg-amber-500/10 border-amber-500/30 dark:bg-amber-500/10 dark:border-amber-500/20"
                  : invoice.status === "overdue"
                  ? "bg-rose-500/10 border-rose-500/30 dark:bg-rose-500/10 dark:border-rose-500/20"
                  : "bg-card border-border";

              const estId = (invoice as any).estimateId;
              const estimateTitle = estId ? estimatesById[estId]?.title : null;
              const projectName = projectsById[invoice.projectId]?.name ?? "—";

              return (

                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className={`
                    block
                    rounded-xl
                    border
                    ${cardStyle}
                    p-4
                    shadow-sm
                    transition
                    hover:shadow-md
                  `}
                >

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        {invoice.invoiceNumber || invoice.id.slice(0,8)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {projectName}
                        {estimateTitle && ` • ${estimateTitle}`}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-foreground">
                        {formatMoney(invoice.total)}
                      </div>
                      <div className="mt-1">
                        <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>
                          {invoice.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <div>
                      {invoice.clientId ? clientsById[invoice.clientId]?.name ?? "—" : "—"}
                    </div>
                    {invoice.dueDate && (
                      <div>
                        Due: <span className="font-medium text-foreground">{invoice.dueDate}</span>
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



export default function InvoicesPage(){

  return (

    <RequirePermission resource="invoice" action="view">

      <InvoicesListContent />

    </RequirePermission>

  );

}