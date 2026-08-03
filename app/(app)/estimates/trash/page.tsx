"use client";

/**
 * Deleted (soft-deleted) estimates — high-density compact mobile-friendly list with green accents.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Estimate } from "@/lib/services/estimateService";
import type { Project } from "@/lib/services/projectService";

function TrashedEstimatesContent() {
  const { estimateService, projectService } = useServices();
  const { profile } = useAuth();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [allEstimates, projects] = await Promise.all([
        estimateService.list({ companyId: profile.companyId, includeDeleted: true }),
        projectService.list({ companyId: profile.companyId, includeDeleted: true }),
      ]);
      setEstimates(allEstimates.filter((e) => e.deletedAt != null));
      setProjectsById(Object.fromEntries(projects.map((p) => [p.id, p])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deleted estimates.");
    } finally {
      setLoading(false);
    }
  }, [estimateService, projectService, profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(estimate: Estimate) {
    setRestoringId(estimate.id);
    setError(null);
    try {
      await estimateService.restore(estimate.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore estimate.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Deleted Estimates"
        description="Soft-deleted estimates — restore any of these to bring it back to the main Estimates list."
        actions={
          <Link href="/estimates" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs hover:bg-emerald-700 transition-colors">
            <ArrowLeft className="size-3.5" /> <span className="hidden sm:inline">Back to Estimates</span>
          </Link>
        }
      />

      {error && <div className="mb-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">{error}</div>}

      {loading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
      ) : estimates.length === 0 ? (
        <EmptyState icon={Trash2} title="Nothing deleted" description="Deleted estimates will show up here, with a one-click restore." />
      ) : (
        <>
          {/* Desktop & Tablet High-Density Compact Table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card sm:block shadow-xs">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider text-[10px]">Estimate Name / #</th>
                  <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider text-[10px]">Project</th>
                  <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider text-[10px]">Deleted Date</th>
                  <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider text-[10px]">Reason</th>
                  <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider text-[10px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {estimates.map((estimate) => (
                  <tr key={estimate.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-3 py-1.5">
                      <span className="font-semibold text-foreground">
                        {estimate.title?.trim() || "Untitled"}
                      </span>
                      <span className="text-muted-foreground ml-1.5 text-[11px]">
                        ({estimate.estimateNumber ?? estimate.id.slice(0, 8)})
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-foreground font-medium">
                      {estimate.projectId ? projectsById[estimate.projectId]?.name ?? "Unknown project" : "No project"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                      {estimate.deletedAt ? new Date(estimate.deletedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground italic truncate max-w-[140px]">
                      {estimate.deleteReason ? `"${estimate.deleteReason}"` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={restoringId === estimate.id}
                        onClick={() => handleRestore(estimate)}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 text-[11px] font-medium shadow-xs disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw className={`size-3 ${restoringId === estimate.id ? "animate-spin" : ""}`} />
                        {restoringId === estimate.id ? "Restoring…" : "Restore"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Ultra-Compact List Layout */}
          <div className="space-y-1.5 sm:hidden">
            {estimates.map((estimate) => (
              <div key={estimate.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-xs">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-foreground truncate">
                      {estimate.title?.trim() || "Untitled"}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      ({estimate.estimateNumber ?? estimate.id.slice(0, 6)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="text-foreground font-medium truncate max-w-[120px]">
                      {estimate.projectId ? projectsById[estimate.projectId]?.name ?? "Unknown project" : "No project"}
                    </span>
                    <span>·</span>
                    <span>{estimate.deletedAt ? new Date(estimate.deletedAt).toLocaleDateString() : "—"}</span>
                    {estimate.deleteReason && (
                      <>
                        <span>·</span>
                        <span className="italic truncate max-w-[90px]">&ldquo;{estimate.deleteReason}&rdquo;</span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={restoringId === estimate.id}
                  onClick={() => handleRestore(estimate)}
                  className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 text-[11px] font-medium shadow-xs disabled:opacity-50 transition-colors shrink-0"
                >
                  <RotateCcw className={`size-3 ${restoringId === estimate.id ? "animate-spin" : ""}`} />
                  {restoringId === estimate.id ? "…" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}

export default function TrashedEstimatesPage() {
  return (
    <RequirePermission resource="estimate" action="view">
      <TrashedEstimatesContent />
    </RequirePermission>
  );
}