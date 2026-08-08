"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { GitPullRequest, Plus, Search } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { calculateChangeOrderRevenue } from "@/lib/services/financialCalculations";
import type { ChangeOrder } from "@/lib/services/changeOrderService";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";
import type { ChangeOrderStatus } from "@/lib/services";

type SortKey = "createdAt" | "updatedAt" | "totalAmount";
type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_TONE: Record<ChangeOrderStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  invoiced: "success",
};

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function ChangeOrdersListContent() {
  const { changeOrderService, projectService, estimateService } = useServices();
  const { profile } = useAuth();

  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [estimatesById, setEstimatesById] = useState<Record<string, Estimate>>({});
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
      const [projectList, estimateList] = await Promise.all([
        projectService.list({ companyId: profile.companyId }),
        estimateService.list({ companyId: profile.companyId }),
      ]);
      setProjectsById(Object.fromEntries(projectList.map((p) => [p.id, p])));
      setEstimatesById(Object.fromEntries(estimateList.map((e) => [e.id, e])));

      const perProject = await Promise.all(projectList.map((p) => changeOrderService.listForProject(p.id)));
      setChangeOrders(perProject.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load change orders.");
    } finally {
      setLoading(false);
    }
  }, [changeOrderService, projectService, estimateService, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = changeOrders;
    if (statusFilter !== "all") rows = rows.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((c) => {
        const project = projectsById[c.projectId];
        const estimate = estimatesById[c.estimateId];
        return (
          c.changeOrderNumber.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (project?.name ?? "").toLowerCase().includes(q) ||
          (estimate?.title ?? "").toLowerCase().includes(q)
        );
      });
    }
    return [...rows].sort((a, b) => {
      if (sortKey === "totalAmount") return b.totalAmount - a.totalAmount;
      if (sortKey === "updatedAt") return b.updatedAt.localeCompare(a.updatedAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [changeOrders, statusFilter, search, sortKey, projectsById, estimatesById]);

  return (
    <PageContainer>
      <PageHeader
        title="Change Orders"
        description="Review and approve scope changes against estimates."
        actions={
          <Link href="/change-orders/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> New Change Order
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
            placeholder="Search CO #, title, project, estimate…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="createdAt">Newest first</option>
          <option value="updatedAt">Recently updated</option>
          <option value="totalAmount">Amount (high–low)</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={GitPullRequest}
          title={changeOrders.length === 0 ? "No change orders yet" : "No change orders match your filters"}
          description={changeOrders.length === 0 ? "Create the first change order against an estimate." : "Try a different search or status filter."}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">CO #</th>
                  {/* <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</th> */}
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimate</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                  <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((co) => (
                  <tr key={co.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <Link href={`/change-orders/${co.id}`} className="font-medium text-foreground hover:text-primary">
                        {co.changeOrderNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">{co.title}</div>
                    </td>
                    {/* <td className="px-3 py-2.5 text-muted-foreground">{projectsById[co.projectId]?.name ?? "—"}</td> */}
                    <td className="px-3 py-2.5 text-muted-foreground">{estimatesById[co.estimateId]?.title ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATUS_TONE[co.status]}>{co.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-foreground">{formatMoney(calculateChangeOrderRevenue(co.totalAmount, co.tax))}</td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">{new Date(co.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 sm:hidden">
            {filtered.map((co) => (
              <Link key={co.id} href={`/change-orders/${co.id}`} className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{co.changeOrderNumber}</span>
                  <Badge tone={STATUS_TONE[co.status]}>{co.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{projectsById[co.projectId]?.name ?? "—"} · {estimatesById[co.estimateId]?.estimateNumber ?? "—"}</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{formatMoney(calculateChangeOrderRevenue(co.totalAmount, co.tax))}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}

export default function ChangeOrdersPage() {
  return (
    <RequirePermission resource="estimate" action="view">
      <ChangeOrdersListContent />
    </RequirePermission>
  );
}
