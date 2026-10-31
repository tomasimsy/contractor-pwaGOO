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
import { RequirePermission } from "@/components/layout/RequirePermission";
import type { Client } from "@/lib/services/clientService";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";
import { formatPropertyAddress, type Property } from "@/lib/services/propertyService";
import { Modal } from "@/components/ui/Modal";
import { PropertyForm } from "@/components/properties/PropertyForm";
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
function ClientDetailContent() {
  const params = useParams();
  const clientId = params.id as string;
  const { clientService, projectService, propertyService, estimateService } = useServices();
  const { profile } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  // undefined = closed; "new" = adding; a Property = editing that one.
  const [propertyModal, setPropertyModal] = useState<"new" | Property | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [c, allProjects, clientProperties, allEstimates] = await Promise.all([
        clientService.getById(clientId),
        projectService.list({ companyId: profile.companyId }),
        // Properties are additive. If the properties table is not there
        // yet, show the page with no properties rather than failing it.
        propertyService.list({ companyId: profile.companyId, clientId }).catch(() => [] as Property[]),
        estimateService.list({ companyId: profile.companyId }),
      ]);
      setClient(c);
      setProjects(allProjects.filter((p) => p.clientId === clientId));
      setProperties(clientProperties);
      // Only this client's estimates; they are shown under their project.
      const clientProjectIds = new Set(allProjects.filter((p) => p.clientId === clientId).map((p) => p.id));
      setEstimates(allEstimates.filter((e) => clientProjectIds.has(e.projectId) && !e.deletedAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load client.");
    } finally {
      setLoading(false);
    }
  }, [clientService, projectService, propertyService, estimateService, clientId, profile]);

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
                <MapPin className="size-4 text-muted-foreground" /> Properties
              </h2>
              <button
                type="button"
                onClick={() => setPropertyModal("new")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="size-4" /> Add Property
              </button>
            </div>

            {properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No properties yet. Add the addresses this client owns so each job can be tied to the right house.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {properties.map((property) => {
                  const jobCount = projects.filter((p) => p.propertyId === property.id).length;
                  return (
                    <li key={property.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{property.nickname || formatPropertyAddress(property) || "Unnamed property"}</div>
                        {property.nickname && <div className="text-xs text-muted-foreground">{formatPropertyAddress(property)}</div>}
                        <div className="text-xs text-muted-foreground">
                          {jobCount} job{jobCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPropertyModal(property)}
                        className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Edit
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

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
                {projects.map((project) => {
                  const projectEstimates = estimates.filter((e) => e.projectId === project.id);
                  return (
                    <li key={project.id} className="flex items-start justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/projects/${project.id}`} className="font-medium text-foreground hover:text-primary">
                          {project.name}
                        </Link>
                        {project.address && <div className="text-xs text-muted-foreground">{project.address}</div>}
                        {projectEstimates.map((estimate) => (
                          <Link
                            key={estimate.id}
                            href={`/estimates/${estimate.id}`}
                            className="mt-0.5 block text-xs text-primary hover:underline"
                          >
                            Estimate {estimate.estimateNumber ?? ""}{estimate.title ? ` · ${estimate.title}` : ""}
                          </Link>
                        ))}
                      </div>
                      <Badge tone={STATUS_TONE[project.status]}>{project.status.replace("_", " ")}</Badge>
                    </li>
                  );
                })}
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
      <Modal
        open={propertyModal !== undefined}
        onClose={() => setPropertyModal(undefined)}
        title={propertyModal && propertyModal !== "new" ? "Edit property" : "Add property"}
      >
        {propertyModal !== undefined && (
          <PropertyForm
            clientId={client.id}
            property={propertyModal === "new" ? undefined : propertyModal}
            onCancel={() => setPropertyModal(undefined)}
            onSaved={() => {
              setPropertyModal(undefined);
              load();
            }}
          />
        )}
      </Modal>
    </PageContainer>
  );
}

export default function ClientDetailPage() {
  return (
    <RequirePermission resource="workspace" action="view">
      <ClientDetailContent />
    </RequirePermission>
  );
}
