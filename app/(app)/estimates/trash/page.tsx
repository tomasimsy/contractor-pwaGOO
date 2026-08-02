"use client";

/**
 * Deleted (soft-deleted) estimates — recovery view mirroring
 * app/(app)/projects/trash/page.tsx exactly. EstimateService.restore()
 * existed at the interface level but nothing in the UI ever called
 * it, and the main /estimates list's list() call always excludes
 * soft-deleted rows unless `includeDeleted` is passed. No new service
 * method — same list() contract every other estimate page already
 * uses.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        description="Soft-deleted estimates — nothing here was permanently removed. Restore any of these to bring it back to the main Estimates list."
        actions={
          <Link href="/estimates" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
            <ArrowLeft className="size-3.5" /> Back to Estimates
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : estimates.length === 0 ? (
        <EmptyState icon={Trash2} title="Nothing deleted" description="Deleted estimates will show up here, with a one-click restore." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {estimates.map((estimate) => (
            <li key={estimate.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="font-medium text-foreground">{estimate.title || estimate.estimateNumber || "Untitled estimate"}</div>
                <div className="text-xs text-muted-foreground">
                  {estimate.projectId ? projectsById[estimate.projectId]?.name ?? "Unknown project" : "No project"}
                  {" · "}Deleted {estimate.deletedAt ? new Date(estimate.deletedAt).toLocaleDateString() : "—"}
                </div>
                {estimate.deleteReason && <div className="mt-0.5 text-xs italic text-muted-foreground">"{estimate.deleteReason}"</div>}
              </div>
              <button
                type="button"
                disabled={restoringId === estimate.id}
                onClick={() => handleRestore(estimate)}
                className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {restoringId === estimate.id ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
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
