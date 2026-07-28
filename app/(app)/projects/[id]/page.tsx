"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Pencil, Trash2, FileText, GitPullRequest, Receipt, Wallet, ReceiptText,
  HardHat, FolderOpen, History, User, MapPin,
} from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { ProjectExpensesPanel } from "@/components/expenses/ProjectExpensesPanel";
import { ProfitSummaryCard } from "@/components/shared/ProfitSummaryCard";
import { usePermission } from "@/lib/hooks/usePermission";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { Estimate } from "@/lib/services/estimateService";
import type { ChangeOrder } from "@/lib/services/changeOrderService";
import { sumApprovedChangeOrderRevenue, calculateChangeOrderRevenue } from "@/lib/services/financialCalculations";
import type { AuditLogEntry, ProjectStatus, EstimateStatus, ChangeOrderStatus, ProjectFinancials } from "@/lib/services";

const STATUS_TONE: Record<ProjectStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  active: "success",
  in_progress: "success",
  on_hold: "warning",
  completed: "success",
  cancelled: "danger",
  archived: "neutral",
};

const ESTIMATE_STATUS_TONE: Record<EstimateStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "warning",
  viewed: "warning",
  approved: "success",
  rejected: "danger",
  converted_to_invoice: "success",
};

const CHANGE_ORDER_STATUS_TONE: Record<ChangeOrderStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  invoiced: "success",
};

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { projectService, clientService, estimateService, changeOrderService, auditService, financialEngine } = useServices();
  const canEditExpenses = usePermission("expense", "create");

  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clientProjectCount, setClientProjectCount] = useState<number | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [financials, setFinancials] = useState<ProjectFinancials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Re-reads the profit picture from FinancialEngine. Called after any
   * expense mutation so cost and profit move together. */
  const loadFinancials = useCallback(async () => {
    try {
      setFinancials(await financialEngine.getProjectFinancials(projectId));
    } catch {
      // A missing financial figure must not blank out the project page.
      setFinancials(null);
    }
  }, [financialEngine, projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFinancials();
  }, [loadFinancials]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await projectService.getById(projectId);
      setProject(p);

      if (p?.clientId) {
        const c = await clientService.getById(p.clientId);
        setClient(c);
        if (c) {
          const clientProjects = await projectService.list({ companyId: p.companyId });
          setClientProjectCount(clientProjects.filter((row) => row.clientId === c.id).length);
        }
      } else {
        setClient(null);
      }

      if (p) {
        const history = await auditService.getHistory(p.companyId, "projects", p.id);
        setActivity(history);
        setEstimates(await estimateService.listForProject(p.id));
        setChangeOrders(await changeOrderService.listForProject(p.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [projectService, clientService, estimateService, changeOrderService, auditService, projectId]);

  useEffect(() => {
    // Fetch-on-mount is this effect's entire purpose — synchronizing
    // with the service layer, exactly what effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete() {
    if (!project) return;
    const reason = window.prompt(`Why are you archiving "${project.name}"?`);
    if (!reason) return;
    try {
      await projectService.softDelete(project.id, reason);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive project.");
    }
  }

  if (loading) return <PageContainer><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></PageContainer>;
  if (error) return <PageContainer><div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div></PageContainer>;
  if (!project) return <PageContainer><EmptyState title="Project not found" description="It may have been archived or the link is incorrect." /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader
        title={project.name}
        description={client ? `For ${client.name}` : "No client assigned"}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[project.status]}>{project.status.replace("_", " ")}</Badge>
            <Link href={`/projects/${project.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <Pencil className="size-3.5" /> Edit
            </Link>
            <button type="button" onClick={handleDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10">
              <Trash2 className="size-3.5" /> Archive
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Section title="Project Information" icon={FileText}>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Row label="Address / Location" value={project.address ?? "—"} />
              <Row label="Status" value={project.status.replace("_", " ")} />
              <Row label="Start Date" value={project.startDate ?? "—"} />
              <Row label="End Date" value={project.endDate ?? "—"} />
              <Row label="Project Number" value={project.projectNumber ?? "—"} className="sm:col-span-2" />
              <Row label="Notes" value={project.description ?? "—"} className="sm:col-span-2" />
            </dl>
          </Section>

          <Section
            title="Estimates"
            icon={FileText}
            actions={
              <Link href={`/estimates/new?projectId=${project.id}`} className="text-xs font-medium text-primary hover:underline">
                + New estimate
              </Link>
            }
          >
            {estimates.length === 0 ? (
              <EmptyState title="No estimates yet" description="Create the first proposal for this project." />
            ) : (
              <ul className="divide-y divide-border">
                {estimates.map((estimate) => (
                  <li key={estimate.id}>
                    <Link href={`/estimates/${estimate.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-primary">
                      <div>
                        <div className="font-medium text-foreground">{estimate.estimateNumber ?? estimate.id.slice(0, 8)}</div>
                        {estimate.title && <div className="text-xs text-muted-foreground">{estimate.title}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{estimate.total.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                        <Badge tone={ESTIMATE_STATUS_TONE[estimate.status]}>{estimate.status.replace(/_/g, " ")}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Change Orders"
            icon={GitPullRequest}
            actions={
              <Link href={`/change-orders/new?projectId=${project.id}`} className="text-xs font-medium text-primary hover:underline">
                + New change order
              </Link>
            }
          >
            {changeOrders.length === 0 ? (
              <EmptyState title="No change orders yet" description="Pending, approved, and rejected change orders will appear here." />
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {changeOrders.map((co) => (
                    <li key={co.id}>
                      <Link href={`/change-orders/${co.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-primary">
                        <div>
                          <div className="font-medium text-foreground">{co.changeOrderNumber}</div>
                          <div className="text-xs text-muted-foreground">{co.title}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{calculateChangeOrderRevenue(co.totalAmount, co.tax).toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                          <Badge tone={CHANGE_ORDER_STATUS_TONE[co.status]}>{co.status}</Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                {changeOrders.some((c) => c.status === "approved") && (
                  <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm">
                    <span className="text-muted-foreground">Approved change order revenue</span>
                    <span className="font-semibold text-foreground">
                      {sumApprovedChangeOrderRevenue(changeOrders).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </span>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section title="Invoices" icon={Receipt}>
            <EmptyState title="No invoices yet" description="Invoice status and outstanding balances will appear here once an estimate is converted." />
          </Section>

          <Section title="Payments" icon={Wallet}>
            <EmptyState title="No payments recorded" description="Payment history, amount collected, and remaining balance will appear here." />
          </Section>

          <ProjectExpensesPanel
            companyId={project.companyId}
            projectId={project.id}
            canEdit={canEditExpenses}
            onChanged={loadFinancials}
          />

          <ProfitSummaryCard financials={financials} />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Section title="Subcontractors" icon={HardHat}>
              <EmptyState title="None assigned" description="Subcontractors assigned to this project and their payments will appear here." />
            </Section>
            <Section title="Agents" icon={HardHat}>
              <EmptyState title="None assigned" description="Agents assigned to this project and their commissions/reimbursements will appear here." />
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Section title="Documents" icon={FolderOpen}>
              <EmptyState icon={FolderOpen} title="No documents yet" description="Plans, permits, and other project documents will attach here, reusing the shared document/media architecture once connected." />
            </Section>
            <Section title="Photos" icon={FolderOpen}>
              <EmptyState icon={FolderOpen} title="No photos yet" description="Site photos will attach here, reusing the shared document/media architecture once connected." />
            </Section>
          </div>
        </div>

        <div className="space-y-5">
          <Section title="Related Client" icon={User}>
            {client ? (
              <div className="space-y-2 text-sm">
                <div className="font-medium text-foreground">{client.name}</div>
                {client.email && <div className="text-muted-foreground">{client.email}</div>}
                {client.phone && <div className="text-muted-foreground">{client.phone}</div>}
                {client.address && (
                  <div className="flex items-start gap-1 text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" /> {client.address}
                  </div>
                )}
                <div className="pt-2 text-xs text-muted-foreground">
                  {clientProjectCount ?? 1} project{(clientProjectCount ?? 1) === 1 ? "" : "s"} with this client
                </div>
                <Link href={`/projects?clientId=${client.id}`} className="inline-block text-xs font-medium text-primary hover:underline">
                  View all projects for this client →
                </Link>
              </div>
            ) : (
              <EmptyState title="No client assigned" description="Edit this project to attach a client." />
            )}
          </Section>

          <Section title="Activity Timeline" icon={History}>
            {activity.length === 0 ? (
              <EmptyState title="No activity recorded yet" description="Create/update/delete events for this project (and, once connected, its estimates/invoices/payments/expenses/documents) will appear here." />
            ) : (
              <ol className="space-y-3 border-l-2 border-border pl-4">
                {activity.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[21px] top-0.5 size-3 rounded-full bg-primary" />
                    <div className="text-sm font-medium text-foreground capitalize">{entry.action.replace("_", " ")}</div>
                    <div className="text-xs text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}

function Section({ title, icon: Icon, actions, children }: { title: string; icon: typeof FileText; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <RequirePermission resource="project" action="view">
      <ProjectDetailContent />
    </RequirePermission>
  );
}
