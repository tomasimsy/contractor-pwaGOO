"use client";

/**
 * Deleted (soft-deleted) projects — the recovery view that didn't
 * exist before: ProjectService.restore() already existed, but nothing
 * in the UI ever called it, and the main /projects list's `list()`
 * call always excludes soft-deleted rows (deleted_at is null unless
 * `includeDeleted` is passed) with nowhere to flip that on. This page
 * is that missing "includeDeleted: true" call, filtered client-side to
 * the deleted rows — no new service method, same list() contract
 * every other project page already uses.
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
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";

function TrashedProjectsContent() {
  const { projectService, clientService } = useServices();
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [allProjects, clients] = await Promise.all([
        projectService.list({ companyId: profile.companyId, includeDeleted: true }),
        clientService.list({ companyId: profile.companyId }),
      ]);
      setProjects(allProjects.filter((p) => p.deletedAt != null));
      setClientsById(Object.fromEntries(clients.map((c) => [c.id, c])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deleted projects.");
    } finally {
      setLoading(false);
    }
  }, [projectService, clientService, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleRestore(project: Project) {
    setRestoringId(project.id);
    setError(null);
    try {
      await projectService.restore(project.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore project.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Deleted Projects"
        description="Soft-deleted projects — nothing here was permanently removed. Restore any of these to bring it back to the main Projects list."
        actions={
          <Link href="/projects" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
            <ArrowLeft className="size-3.5" /> Back to Projects
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Trash2} title="Nothing deleted" description="Deleted projects will show up here, with a one-click restore." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {projects.map((project) => (
            <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="font-medium text-foreground">{project.name}</div>
                <div className="text-xs text-muted-foreground">
                  {project.clientId ? clientsById[project.clientId]?.name ?? "Unknown client" : "No client"}
                  {" · "}Deleted {project.deletedAt ? new Date(project.deletedAt).toLocaleDateString() : "—"}
                </div>
                {project.deleteReason && <div className="mt-0.5 text-xs italic text-muted-foreground">"{project.deleteReason}"</div>}
              </div>
              <button
                type="button"
                disabled={restoringId === project.id}
                onClick={() => handleRestore(project)}
                className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {restoringId === project.id ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

export default function TrashedProjectsPage() {
  return (
    <RequirePermission resource="project" action="view">
      <TrashedProjectsContent />
    </RequirePermission>
  );
}
