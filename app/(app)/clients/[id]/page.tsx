"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FolderKanban, Plus, Mail, Phone, MapPin } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Client } from "@/lib/services/clientService";
import type { Project } from "@/lib/services/projectService";
import type { ProjectStatus } from "@/lib/services";

const STATUS_TONE: Record<ProjectStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  active: "success",
  in_progress: "success",
  on_hold: "warning",
  completed: "success",
  cancelled: "danger",
  archived: "neutral",
};

/**
 * Client detail deliberately owns no operational data of its own — no
 * estimates/invoices/payments live on `Client`, only identity fields
 * (see lib/services/clientService.ts). Everything a client "has" is a
 * Project, fetched through ProjectService and merely aggregated here.
 * New work (estimates, invoices, expenses, schedules, documents,
 * payments) attaches to a Project going forward, never directly to a
 * Client — Projects are the operational hub, Clients are the CRM
 * record that owns them.
 */
export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;
  const { clientService, projectService } = useServices();
  const { profile } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [c, allProjects] = await Promise.all([
        clientService.getById(clientId),
        projectService.list({ companyId: profile.companyId }),
      ]);
      setClient(c);
      setProjects(allProjects.filter((p) => p.clientId === clientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load client.");
    } finally {
      setLoading(false);
    }
  }, [clientService, projectService, clientId, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) return <PageContainer><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></PageContainer>;
  if (error) return <PageContainer><div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div></PageContainer>;
  if (!client) return <PageContainer><EmptyState title="Client not found" description="It may have been deleted or the link is incorrect." /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader
        title={client.name}
        description="Client details and every project on record for them."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FolderKanban className="size-4 text-muted-foreground" /> Projects
              </h2>
              <Link
                href={`/projects/new?clientId=${client.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="size-4" /> New Project
              </Link>
            </div>

            {projects.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                title="No projects yet"
                description="Every estimate, invoice, expense, and payment for this client will live under a Project — create the first one to get started."
              />
            ) : (
              <ul className="divide-y divide-border">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link href={`/projects/${project.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-primary">
                      <div>
                        <div className="font-medium text-foreground">{project.name}</div>
                        {project.address && <div className="text-xs text-muted-foreground">{project.address}</div>}
                      </div>
                      <Badge tone={STATUS_TONE[project.status]}>{project.status.replace("_", " ")}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Contact</h2>
            <div className="space-y-2 text-sm">
              {client.email && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" /> {client.email}
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="size-3.5 shrink-0" /> {client.phone}
                </div>
              )}
              {client.address && (
                <div className="flex items-start gap-1.5 text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" /> {client.address}
                </div>
              )}
              {!client.email && !client.phone && !client.address && (
                <p className="text-muted-foreground">No contact details on file.</p>
              )}
              <div className="pt-2 text-xs text-muted-foreground">
                {projects.length} project{projects.length === 1 ? "" : "s"} on record
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  );
}
