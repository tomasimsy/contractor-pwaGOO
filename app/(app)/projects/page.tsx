"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FolderKanban, Plus, Search, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { Estimate } from "@/lib/services/estimateService";
import type { Invoice } from "@/lib/services/invoiceService";
import type { ProjectStatus } from "@/lib/services";

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type SortKey = "name" | "createdAt" | "status";

const STATUS_TONE: Record<ProjectStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  active: "success",
  in_progress: "success",
  on_hold: "warning",
  completed: "success",
  cancelled: "danger",
  archived: "neutral",
};

function ProjectsListContent() {
  const { projectService, clientService, estimateService, invoiceService } = useServices();
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const clientIdFilter = searchParams.get("clientId");

  const [projects, setProjects] = useState<Project[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  // Company-wide, fetched once and grouped by projectId below — one
  // round trip each instead of one per row, and the actual counts/
  // totals this table always claimed to show but never fetched (see
  // estimatesByProject/invoicesByProject).
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [projectList, clientList, estimateList, invoiceList] = await Promise.all([
        projectService.list({ companyId: profile.companyId }),
        clientService.list({ companyId: profile.companyId }),
        estimateService.list({ companyId: profile.companyId }),
        invoiceService.listForCompany({ companyId: profile.companyId }),
      ]);
      setProjects(projectList);
      setClientsById(Object.fromEntries(clientList.map((c) => [c.id, c])));
      setEstimates(estimateList);
      setInvoices(invoiceList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    } finally {
      setLoading(false);
    }
    // Depends on the whole `profile` object — the React Compiler infers
    // that as the dependency regardless of the narrower `profile?.companyId`
    // written here, so matching it keeps this memoized correctly.
  }, [projectService, clientService, estimateService, invoiceService, profile]);

  const estimatesByProject = useMemo(() => {
    const map: Record<string, Estimate[]> = {};
    for (const e of estimates) (map[e.projectId] ??= []).push(e);
    return map;
  }, [estimates]);

  const invoicesByProject = useMemo(() => {
    const map: Record<string, Invoice[]> = {};
    for (const i of invoices) (map[i.projectId] ??= []).push(i);
    return map;
  }, [invoices]);

  useEffect(() => {
    // Fetch-on-mount is this effect's entire purpose — synchronizing
    // with the service layer, exactly what effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = projects;
    if (clientIdFilter) rows = rows.filter((p) => p.clientId === clientIdFilter);
    if (statusFilter !== "all") rows = rows.filter((p) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((p) => p.name.toLowerCase().includes(q) || (clientsById[p.clientId ?? ""]?.name.toLowerCase().includes(q) ?? false));
    }
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "status") return a.status.localeCompare(b.status);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [projects, clientIdFilter, statusFilter, search, sortKey, clientsById]);

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Every job, from kickoff to close-out."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/projects/trash" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <Trash2 className="size-3.5" /> Deleted Projects
            </Link>
            <Link href="/projects/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4" /> New Project
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
            placeholder="Search projects or clients…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | "all")}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="all">All statuses</option>
          {(["draft", "active", "in_progress", "on_hold", "completed", "cancelled", "archived"] as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="createdAt">Newest first</option>
          <option value="name">Name (A–Z)</option>
          <option value="status">Status</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={projects.length === 0 ? "No projects yet" : "No projects match your filters"}
          description={projects.length === 0 ? "Create your first project to start tracking estimates, invoices, and expenses." : "Try a different search or status filter."}
        />
      ) : (
        <>
          {/* Desktop/tablet table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Created</th>
                  <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Last Updated</th>
                  <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Estimates</th>
                  <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Invoices</th>
                  <th className="hidden px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Financials</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((project) => {
                  const projectEstimates = estimatesByProject[project.id] ?? [];
                  const projectInvoices = invoicesByProject[project.id] ?? [];
                  const invoicedTotal = projectInvoices.reduce((sum, i) => sum + i.total, 0);
                  return (
                  <tr key={project.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <Link href={`/projects/${project.id}`} className="font-medium text-foreground hover:text-primary">
                        {project.name}
                      </Link>
                      {project.address && <div className="text-xs text-muted-foreground">{project.address}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{project.clientId ? clientsById[project.clientId]?.name ?? "—" : "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATUS_TONE[project.status]}>{project.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground lg:table-cell">
                      {projectEstimates.length === 0
                        ? "No estimates"
                        : `${projectEstimates.length} estimate${projectEstimates.length === 1 ? "" : "s"}`}
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground lg:table-cell">
                      {projectInvoices.length === 0
                        ? "No invoices"
                        : `${projectInvoices.length} invoice${projectInvoices.length === 1 ? "" : "s"}`}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right text-xs text-muted-foreground lg:table-cell">
                      {formatMoney(invoicedTotal)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {filtered.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{project.name}</span>
                  <Badge tone={STATUS_TONE[project.status]}>{project.status.replace("_", " ")}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{project.clientId ? clientsById[project.clientId]?.name ?? "—" : "No client"}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Updated {new Date(project.updatedAt).toLocaleDateString()}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}

export default function ProjectsPage() {
  return (
    <RequirePermission resource="project" action="view">
      <ProjectsListContent />
    </RequirePermission>
  );
}
