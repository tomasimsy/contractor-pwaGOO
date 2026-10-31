"use client";

/**
 * Estimates as a spreadsheet: every estimate in one table, with sortable
 * columns, a filter box under each text column, a totals footer, and CSV
 * export. Reads the same estimateService.list() data as the Estimate Roof
 * list; clicking a row opens the estimate's view page, which has the Edit
 * button.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Estimate } from "@/lib/services/estimateService";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { EstimateStatus } from "@/lib/services";

type SortKey = "createdAt" | "updatedAt" | "total" | "estimateNumber" | "title" | "project" | "client" | "status";
type TypeFilter = "all" | "standard" | "roofing";

const STATUS_STYLE: Record<EstimateStatus, string> = {
  draft: "bg-[#ECEAE6] text-[#4A4A4A]",
  sent: "bg-[#FCE8CC] text-[#7A4E12]",
  viewed: "bg-[#FCE8CC] text-[#7A4E12]",
  approved: "bg-[#DCE8F4] text-[#2A4F72]",
  rejected: "bg-[#F6DAD6] text-[#8A2B20]",
  converted_to_invoice: "bg-[#DDEBD9] text-[#2F5D2A]",
};

const STATUSES: EstimateStatus[] = ["draft", "sent", "viewed", "approved", "rejected", "converted_to_invoice"];

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const statusLabel = (s: EstimateStatus) => s.replace(/_/g, " ");

/** Where a row opens: roofing estimates open the new form (flat layout); standard estimates open their view page. */
const openHref = (e: Estimate) => (e.estimateType === "roofing" ? `/estimates-roof/${e.id}/edit` : `/estimates/${e.id}`);

const INPUT = "h-9 rounded-lg border border-[#B9A184] bg-white px-2.5 text-sm text-[#3B3228] outline-none focus-visible:border-[#A98E6B]";
const FILTER_INPUT = "h-7 w-full min-w-[80px] rounded border border-[#B9A184] bg-white px-2 text-xs font-normal text-[#3B3228] outline-none focus-visible:border-[#A98E6B]";

function EstimateSpreadsheetContent() {
  const { estimateService, projectService, clientService } = useServices();
  const { profile } = useAuth();

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("roofing");
  const [statusFilter, setStatusFilter] = useState<EstimateStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [colFilter, setColFilter] = useState({ number: "", title: "", project: "", client: "" });

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [estimateList, projectList, clientList] = await Promise.all([
        estimateService.list({ companyId: profile.companyId }),
        projectService.list({ companyId: profile.companyId }),
        clientService.list({ companyId: profile.companyId }),
      ]);
      setEstimates(estimateList);
      setProjectsById(Object.fromEntries(projectList.map((p) => [p.id, p])));
      setClientsById(Object.fromEntries(clientList.map((c) => [c.id, c])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load estimates.");
    } finally {
      setLoading(false);
    }
  }, [estimateService, projectService, clientService, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const projectName = (e: Estimate) => projectsById[e.projectId]?.name ?? "";
  const clientName = (e: Estimate) => (e.clientId ? clientsById[e.clientId]?.name ?? "" : "");

  const rows = useMemo(() => {
    let list = estimates;
    if (typeFilter !== "all") list = list.filter((e) => e.estimateType === typeFilter);
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          (e.estimateNumber ?? "").toLowerCase().includes(q) ||
          (e.title ?? "").toLowerCase().includes(q) ||
          projectName(e).toLowerCase().includes(q) ||
          clientName(e).toLowerCase().includes(q)
      );
    }
    const contains = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase());
    if (colFilter.number.trim()) list = list.filter((e) => contains(e.estimateNumber ?? "", colFilter.number));
    if (colFilter.title.trim()) list = list.filter((e) => contains(e.title ?? "", colFilter.title));
    if (colFilter.project.trim()) list = list.filter((e) => contains(projectName(e), colFilter.project));
    if (colFilter.client.trim()) list = list.filter((e) => contains(clientName(e), colFilter.client));

    const valueOf = (e: Estimate): string | number => {
      switch (sortKey) {
        case "total": return e.total;
        case "estimateNumber": return e.estimateNumber ?? "";
        case "updatedAt": return e.updatedAt;
        case "title": return e.title ?? "";
        case "project": return projectName(e);
        case "client": return clientName(e);
        case "status": return e.status;
        default: return e.createdAt;
      }
    };
    return [...list].sort((a, b) => {
      const x = valueOf(a);
      const y = valueOf(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sortDir === "asc" ? c : -c;
    });
  }, [estimates, typeFilter, statusFilter, search, sortKey, sortDir, colFilter, projectsById, clientsById]);

  const totalOfRows = rows.reduce((sum, e) => sum + e.total, 0);

  const sortHeader = (key: SortKey, label: string, align: "left" | "right" = "left") => (
    <th className={`px-2 py-1.5 text-[13px] font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => {
          if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else {
            setSortKey(key);
            setSortDir("asc");
          }
        }}
        className="inline-flex items-center gap-1 text-white hover:underline"
      >
        {label}
        <span aria-hidden="true" className="text-[10px]">{sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  const exportCsv = () => {
    const header = ["Estimate #", "Title", "Project", "Client", "Type", "Status", "Total", "Created", "Updated"];
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = rows.map((e) =>
      [
        e.estimateNumber ?? e.id.slice(0, 8),
        e.title ?? "",
        projectName(e),
        clientName(e),
        e.estimateType === "roofing" ? "Roofing" : "Standard",
        statusLabel(e.status),
        e.total.toFixed(2),
        e.createdAt.slice(0, 10),
        e.updatedAt.slice(0, 10),
      ].map(cell).join(",")
    );
    const blob = new Blob([[header.map(cell).join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "estimates.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-[#3B3228]">Estimates</h1>
            <p className="text-sm text-[#6B5B45]">Every estimate in one table. Click a row to open it.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="h-9 rounded-lg border border-[#A98E6B] bg-[#FFFBF3] px-3 text-sm text-[#3B3228] hover:bg-[#FDF6EA] disabled:opacity-50">
              Export CSV
            </button>
            <Link href="/estimates-roof/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#A98E6B] px-3 text-sm font-medium text-white hover:bg-[#8F7757]">
              <Plus className="size-4" aria-hidden="true" /> New estimate
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#D9C7AE] pb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, title, project, client"
            aria-label="Search estimates"
            className={`${INPUT} w-full sm:w-80`}
          />
          <div role="group" aria-label="Type" className="flex overflow-hidden rounded-lg border border-[#B9A184] text-sm">
            {(["roofing", "standard", "all"] as TypeFilter[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`h-9 px-3 ${typeFilter === t ? "bg-[#A98E6B] text-white" : "bg-[#FFFBF3] text-[#6B5B45] hover:bg-[#FDF6EA]"}`}
              >
                {t === "all" ? "All" : t === "roofing" ? "Roofing" : "Standard"}
              </button>
            ))}
          </div>
          <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as EstimateStatus | "all")} className={INPUT}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
          <span className="ml-auto text-xs text-[#6B5B45]">{rows.length} shown</span>
        </div>

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Plus}
            title={estimates.length === 0 ? "No estimates yet" : "No estimates match your filters"}
            description={estimates.length === 0 ? "Create your first estimate." : "Try a different search or filter."}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-lg border border-[#B9A184] bg-white font-sans sm:block">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[#A98E6B] text-white">
                  <tr>
                    {sortHeader("estimateNumber", "Estimate #")}
                    {sortHeader("title", "Title")}
                    {sortHeader("project", "Project")}
                    {sortHeader("client", "Client")}
                    <th className="px-2 py-1.5 text-[13px] text-left font-semibold">Type</th>
                    {sortHeader("status", "Status")}
                    {sortHeader("total", "Total", "right")}
                    {sortHeader("updatedAt", "Updated")}
                  </tr>
                  <tr className="bg-[#FDF6EA] text-[#3B3228]">
                    <th className="px-2 py-1.5">
                      <input aria-label="Filter estimate number" placeholder="Filter" value={colFilter.number} onChange={(e) => setColFilter({ ...colFilter, number: e.target.value })} className={FILTER_INPUT} />
                    </th>
                    <th className="px-2 py-1.5">
                      <input aria-label="Filter title" placeholder="Filter" value={colFilter.title} onChange={(e) => setColFilter({ ...colFilter, title: e.target.value })} className={FILTER_INPUT} />
                    </th>
                    <th className="px-2 py-1.5">
                      <input aria-label="Filter project" placeholder="Filter" value={colFilter.project} onChange={(e) => setColFilter({ ...colFilter, project: e.target.value })} className={FILTER_INPUT} />
                    </th>
                    <th className="px-2 py-1.5">
                      <input aria-label="Filter client" placeholder="Filter" value={colFilter.client} onChange={(e) => setColFilter({ ...colFilter, client: e.target.value })} className={FILTER_INPUT} />
                    </th>
                    <th className="px-2 py-1.5 text-xs font-normal text-[#6B5B45]">{typeFilter === "all" ? "All types" : typeFilter === "roofing" ? "Roofing" : "Standard"}</th>
                    <th className="px-2 py-1.5 text-xs font-normal text-[#6B5B45]">{statusFilter === "all" ? "All statuses" : statusLabel(statusFilter)}</th>
                    <th className="px-2 py-1.5"></th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => (
                    <tr key={e.id} className={`whitespace-nowrap border-t border-[#E6D9C6] hover:bg-[#FCE8CC]/60 ${i % 2 === 1 ? "bg-[#FDF6EA]" : "bg-white"}`}>
                      <td className="px-2 py-1 text-[13px] leading-5 font-semibold text-[#3B3228]">{e.estimateNumber ?? e.id.slice(0, 8)}</td>
                      <td className="px-2 py-1 text-[13px] leading-5">
                        <Link href={openHref(e)} title={e.title ?? ""} className="block max-w-[260px] truncate text-[#3B3228] hover:text-[#8F7757] hover:underline">
                          {e.title || "Untitled"}
                        </Link>
                      </td>
                      <td className="px-2 py-1 text-[13px] leading-5 text-[#6B5B45]">{projectName(e) || "—"}</td>
                      <td className="px-2 py-1 text-[13px] leading-5 text-[#6B5B45]">{clientName(e) || "—"}</td>
                      <td className="px-2 py-1 text-[13px] leading-5 text-[#6B5B45]">{e.estimateType === "roofing" ? "Roofing" : "Standard"}</td>
                      <td className="px-2 py-1 text-[13px] leading-5">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[e.status]}`}>{statusLabel(e.status)}</span>
                      </td>
                      <td className="px-2 py-1 text-[13px] leading-5 text-right font-medium tabular-nums text-[#3B3228]">{formatMoney(e.total)}</td>
                      <td className="px-2 py-1 text-[13px] leading-5 text-xs text-[#6B5B45]">{new Date(e.updatedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-[#A98E6B] bg-[#FCE8CC]">
                  <tr>
                    <td colSpan={6} className="px-2 py-1.5 text-[13px] text-[#3B3228]">{rows.length} shown</td>
                    <td className="px-2 py-1.5 text-[13px] text-right font-semibold tabular-nums text-[#3B3228]">{formatMoney(totalOfRows)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="space-y-2 sm:hidden">
              {rows.map((e) => (
                <Link key={e.id} href={openHref(e)} className="block rounded-lg border border-[#B9A184] bg-white p-3 hover:border-[#A98E6B]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#3B3228]">{e.estimateNumber ?? e.id.slice(0, 8)}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[e.status]}`}>{statusLabel(e.status)}</span>
                  </div>
                  <div className="mt-1 text-sm text-[#3B3228]">{e.title || "Untitled"}</div>
                  <div className="mt-1 text-xs text-[#6B5B45]">
                    {projectName(e) || "—"} · {clientName(e) || "No client"}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#3B3228]">{formatMoney(e.total)}</div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}

export default function EstimateSpreadsheetPage() {
  return (
    <RequirePermission resource="estimate" action="view">
      <EstimateSpreadsheetContent />
    </RequirePermission>
  );
}
