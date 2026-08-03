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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          <div className="flex items-center gap-2">
            <Link href="/estimates/trash" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <Trash2 className="size-3.5" /> Deleted Estimates
            </Link>
            <Link href="/estimates/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4" /> New Estimate
            </Link>
          </div>
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
            placeholder="Search estimate #, title, project, client…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | "standard" | "roofing")}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="all">All types</option>
          <option value="standard">Standard</option>
          <option value="roofing">Roofing</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EstimateStatus | "all")}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="all">All statuses</option>
          {(["draft", "sent", "viewed", "approved", "rejected", "converted_to_invoice"] as EstimateStatus[]).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="createdAt">Newest first</option>
          <option value="updatedAt">Recently updated</option>
          <option value="total">Total (high–low)</option>
          <option value="estimateNumber">Estimate #</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={estimates.length === 0 ? "No estimates yet" : "No estimates match your filters"}
          description={estimates.length === 0 ? "Create your first estimate from a project." : "Try a different search or status filter."}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimate #</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                  <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Created</th>
                  <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((estimate) => (
                  <tr key={estimate.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5 capitalize">
                     <Link
                      href={`/estimates/${estimate.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {estimate.title?.trim() || "No Title"}
                    </Link>
                    {(estimate.estimateNumber || estimate.id) && ( <div className="text-xs text-muted-foreground"> {estimate.estimateNumber ?? estimate.id.slice(0, 8)}  </div> )} </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{projectsById[estimate.projectId]?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{estimate.clientId ? clientsById[estimate.clientId]?.name ?? "—" : "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{estimate.estimateType === "roofing" ? "Roofing" : "Standard"}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATUS_TONE[estimate.status]}>{estimate.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-foreground">{formatMoney(estimate.total)}</td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">{new Date(estimate.createdAt).toLocaleDateString()}</td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">{new Date(estimate.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 sm:hidden">
            {filtered.map((estimate) => (
              <Link key={estimate.id} href={`/estimates/${estimate.id}`} className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{estimate.estimateNumber ?? estimate.id.slice(0, 8)}</span>
                  <Badge tone={STATUS_TONE[estimate.status]}>{estimate.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {projectsById[estimate.projectId]?.name ?? "—"} · {estimate.clientId ? clientsById[estimate.clientId]?.name ?? "—" : "No client"} · {estimate.estimateType === "roofing" ? "Roofing" : "Standard"}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">{formatMoney(estimate.total)}</div>
              </Link>
            ))}
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
