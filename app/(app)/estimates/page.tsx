"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Estimate } from "@/lib/services/estimateService";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { EstimateStatus } from "@/lib/services";

type SortKey = "createdAt" | "updatedAt" | "total" | "estimateNumber";

const STATUS_TONE: Record<EstimateStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "warning",
  viewed: "warning",
  approved: "success",
  rejected: "danger",
  converted_to_invoice: "success",
};

const STATUS_ROW_BG: Record<EstimateStatus, string> = {
  draft: "hover:bg-muted/40",
  sent: "bg-amber-500/[0.03] hover:bg-amber-500/[0.07]",
  viewed: "bg-amber-500/[0.03] hover:bg-amber-500/[0.07]",
  approved: "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]",
  rejected: "bg-rose-500/[0.03] hover:bg-rose-500/[0.07]",
  converted_to_invoice: "bg-emerald-500/[0.06] hover:bg-emerald-500/[0.10]",
};

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function EstimatesListContent() {
  const { estimateService, projectService, clientService } = useServices();
  const { profile } = useAuth();

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EstimateStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "standard" | "roofing">("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");

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
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = estimates;
    if (statusFilter !== "all") rows = rows.filter((e) => e.status === statusFilter);
    if (typeFilter !== "all") rows = rows.filter((e) => e.estimateType === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((e) => {
        const project = projectsById[e.projectId];
        const client = e.clientId ? clientsById[e.clientId] : undefined;
        return (
          (e.estimateNumber ?? "").toLowerCase().includes(q) ||
          (e.title ?? "").toLowerCase().includes(q) ||
          (project?.name ?? "").toLowerCase().includes(q) ||
          (client?.name ?? "").toLowerCase().includes(q)
        );
      });
    }
    return [...rows].sort((a, b) => {
      if (sortKey === "total") return b.total - a.total;
      if (sortKey === "estimateNumber") return (b.estimateNumber ?? "").localeCompare(a.estimateNumber ?? "");
      if (sortKey === "updatedAt") return b.updatedAt.localeCompare(a.updatedAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [estimates, statusFilter, typeFilter, search, sortKey, projectsById, clientsById]);

  return (
<PageContainer>
  <PageHeader
    title="Estimates"
    description="Every proposal, across every project."
    actions={
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link href="/estimates/trash" className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">
          <Trash2 className="size-3.5" /> <span className="hidden xs:inline">Deleted</span>
        </Link>
        <Link href="/estimates/new" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200 transition-all hover:shadow-md">
          <Plus className="size-4" /> New Estimate
        </Link>
      </div>
    }
  />

  {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs sm:text-sm text-rose-700 border border-rose-200">{error}</div>}

  <div className="mb-3 flex flex-nowrap items-center gap-1 sm:gap-2">
    {/* Search – takes flexible width, shrinks to fit */}
    <div className="relative flex-1 min-w-0">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-emerald-600" />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        className="h-7 w-full rounded-lg border border-emerald-200 bg-white pl-6 pr-1.5 text-[10px] sm:text-xs outline-none focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50 transition-all"
      />
    </div>

    {/* Type filter – flex-1 to share space */}
    <select
      value={typeFilter}
      onChange={(e) => setTypeFilter(e.target.value as "all" | "standard" | "roofing")}
      className="h-7 flex-1 min-w-0 rounded-lg border border-emerald-200 bg-white px-1 text-[10px] sm:text-xs outline-none focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50 transition-all text-emerald-900"
    >
      <option value="all">All Types</option>
      <option value="standard">Standard</option>
      <option value="roofing">Roofing</option>
    </select>

    {/* Status filter */}
    <select
      value={statusFilter}
      onChange={(e) => setStatusFilter(e.target.value as EstimateStatus | "all")}
      className="h-7 flex-1 min-w-0 rounded-lg border border-emerald-200 bg-white px-1 text-[10px] sm:text-xs outline-none focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50 transition-all text-emerald-900"
    >
      <option value="all">All Status</option>
      {(["draft", "sent", "viewed", "approved", "rejected", "converted_to_invoice"] as EstimateStatus[]).map((s) => (
        <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
      ))}
    </select>

    {/* Sort filter */}
    <select
      value={sortKey}
      onChange={(e) => setSortKey(e.target.value as SortKey)}
      className="h-7 flex-1 min-w-0 rounded-lg border border-emerald-200 bg-white px-1 text-[10px] sm:text-xs outline-none focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50 transition-all text-emerald-900"
    >
      <option value="createdAt">Newest</option>
      <option value="updatedAt">Updated</option>
      <option value="total">Total</option>
      <option value="estimateNumber">#</option>
    </select>
  </div>

  {loading ? (
    <div className="py-12 text-center text-xs sm:text-sm text-emerald-600/60">Loading…</div>
  ) : filtered.length === 0 ? (
    <EmptyState
      icon={FileText}
      title={estimates.length === 0 ? "No estimates yet" : "No estimates match your filters"}
      description={estimates.length === 0 ? "Create your first estimate from a project." : "Try a different search or status filter."}
    />
  ) : (
    <>
      {/* Desktop & Tablet Table with Green Header */}
      <div className="hidden overflow-x-auto rounded-xl border border-emerald-200/60 bg-white sm:block shadow-sm">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Estimate #</th>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Project</th>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Client</th>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Type</th>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider text-[11px]">Total</th>
              <th className="hidden px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px] md:table-cell">Created</th>
              <th className="hidden px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px] md:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100/60 capitalize">
            {filtered.map((estimate) => (
              <tr key={estimate.id} className={`transition-colors ${STATUS_ROW_BG[estimate.status] || "hover:bg-emerald-50/80"}`}>
                <td className="px-3 py-2.5 capitalize">
                  <Link
                    href={`/estimates/${estimate.id}`}
                    className="font-semibold text-emerald-900 hover:text-emerald-700 transition-colors capitalize "
                  >
                    {estimate.title?.trim() || "No Title"}
                  </Link>
                  {(estimate.estimateNumber || estimate.id) && (
                    <div className="text-[11px] text-emerald-600/60">
                      {estimate.estimateNumber ?? estimate.id.slice(0, 8)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-emerald-800 font-medium">
                  {projectsById[estimate.projectId]?.name ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-emerald-600/80">
                  {estimate.clientId ? clientsById[estimate.clientId]?.name ?? "—" : "—"}
                </td>
                <td className="px-3 py-2.5 text-emerald-600/80 capitalize">
                  {estimate.estimateType === "roofing" ? "Roofing" : "Standard"}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={STATUS_TONE[estimate.status]}>{estimate.status.replace(/_/g, " ")}</Badge>
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                  {formatMoney(estimate.total)}
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-emerald-600/60 md:table-cell">
                  {new Date(estimate.createdAt).toLocaleDateString()}
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-emerald-600/60 md:table-cell">
                  {new Date(estimate.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards with Consistent Color */}
      <div className="space-y-3 sm:hidden">
        {filtered.map((estimate) => {
          const status =
            estimate.status === "converted_to_invoice"
              ? {
                  badge: "bg-white/90 text-emerald-700",
                  label: "Invoiced",
                }
              : estimate.status === "approved"
              ? {
                  badge: "bg-emerald-100 text-emerald-800",
                  label: "Approved",
                }
              : estimate.status === "sent" || estimate.status === "viewed"
              ? {
                  badge: "bg-amber-100 text-amber-800",
                  label: estimate.status === "viewed" ? "Viewed" : "Sent",
                }
              : estimate.status === "rejected"
              ? {
                  badge: "bg-rose-100 text-rose-800",
                  label: "Rejected",
                }
              : {
                  badge: "bg-white/90 text-emerald-700",
                  label: "Draft",
                };

          return (
            <Link
              key={estimate.id}
              href={`/estimates/${estimate.id}`}
              className={`
                group relative flex flex-col gap-3
                rounded-xl
                bg-gradient-to-br from-emerald-600 to-emerald-700
                border border-emerald-500
                px-4 py-3.5
                shadow-sm
                transition-all
                hover:shadow-md hover:scale-[1.01] hover:from-emerald-700 hover:to-emerald-800
              `}
            >
              {/* Top Row: Title and Amount */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-white capitalize">
                    {estimate.title?.trim() || "Untitled"}
                  </h3>
                  
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-white/80">
                      {projectsById[estimate.projectId]?.name ?? "No project"}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-white/40" />
                    <span className="text-[10px] uppercase font-semibold text-white/70">
                      {estimate.estimateType === "roofing" ? "Roofing" : "Standard"}
                    </span>
                  </div>
                </div>

                {/* Amount */}
                <div className="shrink-0 text-right">
                  <div className="text-base font-bold text-white">
                    {formatMoney(estimate.total)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-white/60">
                    #{estimate.estimateNumber ?? estimate.id.slice(0, 6)}
                  </div>
                </div>
              </div>

              {/* Bottom Row: Date and Status Badge */}
              <div className="flex items-center justify-between border-t border-white/20 pt-2.5">
                <div className="text-[10px] text-white/70">
                  {new Date(estimate.createdAt).toLocaleDateString()}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/50">
                    {new Date(estimate.updatedAt).toLocaleDateString()}
                  </span>
                  <span
                    className={`
                      rounded-full
                      px-2.5 py-0.5
                      text-[10px]
                      font-bold
                      uppercase
                      tracking-wide
                      ${status.badge}
                    `}
                  >
                    {status.label}
                  </span>
                </div>
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

export default function EstimatesPage() {
  return (
    <RequirePermission resource="estimate" action="view">
      <EstimatesListContent />
    </RequirePermission>
  );
}