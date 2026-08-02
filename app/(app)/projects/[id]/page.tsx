"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Pencil, Trash2, Archive, FileText, GitPullRequest, Receipt, Wallet, ReceiptText,
  HardHat, FolderOpen, History, User, MapPin,
} from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { ProjectExpensesGroupedPanel } from "@/components/expenses/ProjectExpensesGroupedPanel";
import { ProfitSummaryCard } from "@/components/shared/ProfitSummaryCard";
import { INVOICE_STATUS_TONE } from "@/components/invoices/invoiceStatus";
import { usePermission } from "@/lib/hooks/usePermission";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { Estimate } from "@/lib/services/estimateService";
import type { ChangeOrder } from "@/lib/services/changeOrderService";
import type { Invoice } from "@/lib/services/invoiceService";
import type { CustomerPayment } from "@/lib/services/paymentService";
import type { SubcontractorAssignment } from "@/lib/services/subcontractorService";
import type { AgentAssignment } from "@/lib/services/agentCommissionService";
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

type Balance = { assigned: number; paid: number; committed: number; outstanding: number };
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { projectService, clientService, estimateService, changeOrderService, auditService, financialEngine, subcontractorService, agentCommissionService, invoiceService, paymentService } = useServices();
  const canEditExpenses = usePermission("expense", "create");

  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clientProjectCount, setClientProjectCount] = useState<number | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [financials, setFinancials] = useState<ProjectFinancials | null>(null);
  const [subAssignments, setSubAssignments] = useState<Array<SubcontractorAssignment & { subcontractorName: string; trade: string | null }>>([]);
  const [subBalances, setSubBalances] = useState<Record<string, Balance>>({});
  const [agentAssignments, setAgentAssignments] = useState<Array<AgentAssignment & { agentName: string }>>([]);
  const [agentBalances, setAgentBalances] = useState<Record<string, Balance>>({});
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, CustomerPayment[]>>({});
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

        const scope = { companyId: p.companyId, projectId: p.id };
        const [subs, agents] = await Promise.all([
          subcontractorService.listAssignments(scope),
          agentCommissionService.listAssignments(scope),
        ]);
        setSubAssignments(subs);
        setAgentAssignments(agents);

        const [subBalanceEntries, agentBalanceEntries] = await Promise.all([
          Promise.all(subs.map(async (a) => [a.id, await subcontractorService.getBalance(a.id)] as const)),
          Promise.all(agents.map(async (a) => [a.id, await agentCommissionService.getBalance(a.id)] as const)),
        ]);
        setSubBalances(Object.fromEntries(subBalanceEntries));
        setAgentBalances(Object.fromEntries(agentBalanceEntries));

        const projectInvoices = await invoiceService.listForProject(p.id);
        setInvoices(projectInvoices);
        const paymentEntries = await Promise.all(
          projectInvoices.map(async (inv) => [inv.id, await paymentService.listForInvoice(inv.id)] as const)
        );
        setPaymentsByInvoice(Object.fromEntries(paymentEntries));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [projectService, clientService, estimateService, changeOrderService, auditService, subcontractorService, agentCommissionService, invoiceService, paymentService, projectId]);

  useEffect(() => {
    // Fetch-on-mount is this effect's entire purpose — synchronizing
    // with the service layer, exactly what effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Soft-delete — a real delete (hidden from every list, recoverable
  // only via /projects/trash's Restore), NOT the same thing as the
  // "archived" status below. Previously this button was labeled
  // "Archive" while actually calling softDelete, which made deleted
  // projects look "archived" when there was no way to see them again.
  async function handleDelete() {
    if (!project) return;
    const reason = window.prompt(`Why are you deleting "${project.name}"? (This can be undone from Projects → Deleted.)`);
    if (!reason) return;
    try {
      await projectService.softDelete(project.id, reason);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
    }
  }

  // Real "archived" status — a non-destructive, reversible-by-status-
  // change marker for a job that's fully wrapped up, distinct from
  // deletion. ValidationService.PROJECT_TRANSITIONS only allows this
  // from "completed"/"cancelled" (archived has no further transitions
  // out), matching the button's disabled condition below.
  async function handleArchive() {
    if (!project) return;
    setError(null);
    try {
      await projectService.changeStatus(project.id, "archived");
      await load();
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
            {(project.status === "completed" || project.status === "cancelled") && (
              <button
                type="button"
                onClick={handleArchive}
                title="Mark this completed/cancelled job as archived — reversible only by changing status again, not a deletion."
                className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Archive className="size-3.5" /> Archive
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              title="Soft-delete — hides this project everywhere; recoverable from Projects → Deleted."
              className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10"
            >
              <Trash2 className="size-3.5" /> Delete
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
    <Link
      href={`/estimates/new?projectId=${project.id}`}
      className="text-xs font-medium text-primary hover:underline"
    >
      + New Estimate
    </Link>
  }
>
  {estimates.length === 0 ? (
    <EmptyState
      title="No estimates yet"
      description="Create the first proposal for this project."
    />
  ) : (
    <div className="overflow-hidden rounded-lg border border-border text-xs">
      {/* Header */}
      <div className="grid grid-cols-[1fr_140px_120px_120px] bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div>Estimate</div>
        <div>Number</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Status</div>
      </div>

      {/* Rows */}
      {estimates.map((estimate, index) => (
        <Link
          key={estimate.id}
          href={`/estimates/${estimate.id}`}
          className={`grid grid-cols-[1fr_140px_120px_120px] items-center px-4 py-3 transition-colors hover:bg-muted/50 ${
            index !== estimates.length - 1 ? "border-t border-border" : ""
          }`}
        >
          <div className="text-xs font-medium text-foreground">
            {estimate.title}
          </div>

          <div className="text-xs text-muted-foreground">
            {estimate.estimateNumber ?? estimate.id.slice(0, 8)}
          </div>

          <div className="text-right text-xs font-medium text-foreground">
            {estimate.total.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          </div>

          <div className="flex justify-end">
            <Badge
              className="text-xs"
              tone={ESTIMATE_STATUS_TONE[estimate.status]}
            >
              {estimate.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </Link>
      ))}
    </div>
  )}
</Section>

<Section
  title="Change Orders"
  icon={GitPullRequest}
  actions={
    <Link
      href={`/change-orders/new?projectId=${project.id}`}
      className="text-xs font-medium text-primary hover:underline"
    >
      + New Change Order
    </Link>
  }
>
  {changeOrders.length === 0 ? (
    <EmptyState
      title="No change orders yet"
      description="Pending, approved, and rejected change orders will appear here."
    />
  ) : (
    <>
      <div className="overflow-hidden rounded-lg border border-border text-xs">
        {/* Header */}
        <div className="grid grid-cols-[140px_1fr_120px_120px] bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <div>Number</div>
          <div>Title</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Status</div>
        </div>

        {/* Rows */}
        {changeOrders.map((co, index) => (
          <Link
            key={co.id}
            href={`/change-orders/${co.id}`}
            className={`grid grid-cols-[140px_1fr_120px_120px] items-center px-4 py-3 transition-colors hover:bg-muted/50 ${
              index !== changeOrders.length - 1 ? "border-t border-border" : ""
            }`}
          >
            <div className="text-xs font-medium text-foreground">
              {co.changeOrderNumber}
            </div>

            <div className="text-xs text-muted-foreground truncate">
              {co.title}
            </div>

            <div className="text-right text-xs font-medium text-foreground">
              {calculateChangeOrderRevenue(co.totalAmount, co.tax).toLocaleString(
                "en-US",
                {
                  style: "currency",
                  currency: "USD",
                }
              )}
            </div>

            <div className="flex justify-end">
              <Badge
                className="text-xs"
                tone={CHANGE_ORDER_STATUS_TONE[co.status]}
              >
                {co.status}
              </Badge>
            </div>
          </Link>
        ))}
      </div>

      {changeOrders.some((c) => c.status === "approved") && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs">
          <span className="font-medium text-muted-foreground">
            Approved Change Order Revenue
          </span>
          <span className="font-semibold text-foreground">
            {sumApprovedChangeOrderRevenue(changeOrders).toLocaleString(
              "en-US",
              {
                style: "currency",
                currency: "USD",
              }
            )}
          </span>
        </div>
      )}
    </>
  )}
</Section>

          <Section title="Invoices" icon={Receipt}>
            {invoices.length === 0 ? (
              <EmptyState title="No invoices yet" description="Invoice status and outstanding balances will appear here once an estimate is converted." />
            ) : (
              <ul className="divide-y divide-border">
                {invoices.map((inv) => {
                  const estimate = inv.estimateId ? estimates.find((e) => e.id === inv.estimateId) : null;
                  return (
                    <li key={inv.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-primary hover:underline">
                          {inv.invoiceNumber || inv.id.slice(0, 8)}
                        </Link>
                        {estimate && (
                          <div className="text-xs text-muted-foreground">
                            {estimate.estimateNumber ?? "—"}{estimate.title ? ` · ${estimate.title}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={INVOICE_STATUS_TONE[inv.status]}>{inv.status.replace(/_/g, " ")}</Badge>
                        <span className="font-medium text-foreground">{money(inv.total)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Payments" icon={Wallet}>
            {invoices.every((inv) => (paymentsByInvoice[inv.id] ?? []).length === 0) ? (
              <EmptyState title="No payments recorded" description="Payment history, amount collected, and remaining balance will appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {invoices.flatMap((inv) => {
                  const estimate = inv.estimateId ? estimates.find((e) => e.id === inv.estimateId) : null;
                  return (paymentsByInvoice[inv.id] ?? []).map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-primary hover:underline">
                          {inv.invoiceNumber || inv.id.slice(0, 8)}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {payment.paymentDate}
                          {estimate ? ` · ${estimate.estimateNumber ?? "—"}${estimate.title ? ` · ${estimate.title}` : ""}` : ""}
                        </div>
                      </div>
                      <span className="font-medium text-foreground">{money(payment.amount)}</span>
                    </li>
                  ));
                })}
              </ul>
            )}
          </Section>

          <ProjectExpensesGroupedPanel
            companyId={project.companyId}
            projectId={project.id}
            estimates={estimates}
            canEdit={canEditExpenses}
            onChanged={loadFinancials}
          />

          <ProfitSummaryCard financials={financials} />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Section title="Subcontractors" icon={HardHat}>
              {subAssignments.length === 0 ? (
                <EmptyState title="None assigned" description="Subcontractors assigned to this project and their payments will appear here." />
              ) : (
                <ul className="divide-y divide-border">
                  {subAssignments.map((a) => {
                    const b = subBalances[a.id];
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <div>
                          <div className="font-medium text-foreground">{a.subcontractorName}</div>
                          {a.trade && <div className="text-xs text-muted-foreground">{a.trade}</div>}
                        </div>
                        {b && (
                          <div className="text-right text-xs text-muted-foreground">
                            <div>Assigned {money(b.assigned)}</div>
                            <div>Paid {money(b.paid)} · Outstanding <span className="font-semibold text-foreground">{money(b.outstanding)}</span></div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
            <Section title="Agents" icon={HardHat}>
              {agentAssignments.length === 0 ? (
                <EmptyState title="None assigned" description="Agents assigned to this project and their commissions/reimbursements will appear here." />
              ) : (
                <ul className="divide-y divide-border">
                  {agentAssignments.map((a) => {
                    const b = agentBalances[a.id];
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <div className="font-medium text-foreground">{a.agentName}</div>
                        {b && (
                          <div className="text-right text-xs text-muted-foreground">
                            <div>Assigned {money(b.assigned)}</div>
                            <div>Paid {money(b.paid)} · Owed <span className="font-semibold text-foreground">{money(b.outstanding)}</span></div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
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
