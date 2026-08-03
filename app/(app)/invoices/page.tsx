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
      const [
        invoiceList,
        projectList,
        clientList,
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
      ]);

      setInvoices(invoiceList);

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


        return (
          i.invoiceNumber
            .toLowerCase()
            .includes(q) ||
          (project?.name ?? "")
            .toLowerCase()
            .includes(q) ||
          (client?.name ?? "")
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
  ]);

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
        <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
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


      ) : filtered.length === 0 ? (

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

                {filtered.map((invoice)=>{


                  const border =
                    invoice.status==="paid"
                      ? "border-l-emerald-800"
                      : invoice.status==="partially_paid"
                      ? "border-l-amber-700"
                      : invoice.status==="overdue"
                      ? "border-l-rose-700"
                      : "border-l-slate-700";


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


                      <td className="px-4 py-3 text-muted-foreground">
                        {projectsById[invoice.projectId]?.name ?? "—"}
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
          <div className="space-y-2 sm:hidden">

            {filtered.map((invoice)=>{


              const style =
                invoice.status==="paid"
                ? {
                    strip:"bg-emerald-800",
                    border:"border-emerald-800",
                    amount:"text-emerald-700 dark:text-emerald-400",
                    sub:"text-emerald-100",
                  }

                : invoice.status==="partially_paid"
                ? {
                    strip:"bg-amber-700",
                    border:"border-amber-700",
                    amount:"text-amber-700 dark:text-amber-400",
                    sub:"text-amber-100",
                  }

                : invoice.status==="overdue"
                ? {
                    strip:"bg-rose-700",
                    border:"border-rose-700",
                    amount:"text-rose-700 dark:text-rose-400",
                    sub:"text-rose-100",
                  }

                : {
                    strip:"bg-slate-700",
                    border:"border-slate-700",
                    amount:"text-foreground",
                    sub:"text-slate-200",
                  };



              return (

                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className={`
                    block
                    overflow-hidden
                    rounded-lg
                    border-2
                    ${style.border}
                    bg-card
                    shadow-sm
                    transition
                    hover:shadow-md
                  `}
                >


                  {/* Header */}

                  <div className={`${style.strip} px-3 py-2`}>

                    <div className="flex justify-between gap-3">


                      <div className="min-w-0">

                        <div className="truncate text-sm font-bold uppercase text-white">

                          {invoice.invoiceNumber ||
                           invoice.id.slice(0,8)}

                        </div>


                        <div className={`truncate text-[11px] uppercase ${style.sub}`}>

                          {projectsById[invoice.projectId]?.name ??
                           "NO PROJECT"}

                        </div>

                      </div>



                      <div className="text-right">

                        <div className="text-base font-bold text-white">

                          {formatMoney(invoice.total)}

                        </div>


                        <div className={`text-[10px] font-bold uppercase ${style.sub}`}>

                          {invoice.status.replace(/_/g," ")}

                        </div>

                      </div>


                    </div>

                  </div>





                  {/* Body */}

                  <div className="px-3 py-2">


                    <div className="flex justify-between gap-2">


                      <div className="truncate text-sm font-semibold uppercase">

                        {
                          invoice.clientId
                          ? clientsById[invoice.clientId]?.name ?? "NO CLIENT"
                          : "NO CLIENT"
                        }

                      </div>



                      <div className={`text-xs font-bold uppercase ${style.amount}`}>

                        {
                          invoice.status==="paid"
                          ? "PAID"
                          : invoice.status==="partially_paid"
                          ? "BALANCE DUE"
                          : invoice.status==="overdue"
                          ? "OVERDUE"
                          : "OPEN"
                        }

                      </div>


                    </div>



                    {invoice.dueDate && (

                      <div className="
                        mt-2
                        flex
                        justify-between
                        border-t
                        border-border
                        pt-2
                        text-[11px]
                        uppercase
                        text-muted-foreground
                      ">

                        <span>
                          Due Date
                        </span>

                        <span className="font-semibold text-foreground">
                          {invoice.dueDate}
                        </span>

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