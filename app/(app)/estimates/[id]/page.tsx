"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Pencil, Trash2, FileText, GitPullRequest, Receipt, Wallet,
  FolderOpen, Camera, History, User, Download, Share2,
} from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { SignaturePad } from "@/components/estimates/SignaturePad";
import { SharePortalPanel } from "@/components/portal/SharePortalPanel";
import { ProjectExpensesPanel } from "@/components/expenses/ProjectExpensesPanel";
import { ProfitSummaryCard } from "@/components/shared/ProfitSummaryCard";
import { usePermission } from "@/lib/hooks/usePermission";
import { supabase } from "@/lib/supabase/client";
import { sumApprovedChangeOrderRevenue, calculateRevisedEstimateTotal, calculateChangeOrderRevenue } from "@/lib/services/financialCalculations";
import type { Estimate, EstimateLineItem } from "@/lib/services/estimateService";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { ChangeOrder } from "@/lib/services/changeOrderService";
import type { AuditLogEntry, EstimateStatus, ChangeOrderStatus, ProjectFinancials } from "@/lib/services";

const STATUS_TONE: Record<EstimateStatus, "neutral" | "success" | "warning" | "danger"> = {
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

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function EstimateDetailContent() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const { estimateService, projectService, clientService, changeOrderService, auditService, financialEngine } = useServices();
  const canEditExpenses = usePermission("expense", "create");

  const [estimate, setEstimate] = useState<(Estimate & { lineItems: EstimateLineItem[] }) | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [financials, setFinancials] = useState<ProjectFinancials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Re-reads the whole profit picture from FinancialEngine. Called
   * after any expense mutation so cost and profit update in the same
   * interaction — the page never adjusts a number locally. */
  const financialsProjectId = estimate?.projectId ?? null;
  const loadFinancials = useCallback(async () => {
    if (!financialsProjectId) return;
    try {
      setFinancials(await financialEngine.getProjectFinancials(financialsProjectId));
    } catch {
      // A missing financial figure must not blank out the estimate.
      setFinancials(null);
    }
  }, [financialEngine, financialsProjectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFinancials();
  }, [loadFinancials]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const e = await estimateService.getById(estimateId);
      setEstimate(e);

      if (e) {
        const p = await projectService.getById(e.projectId);
        setProject(p);
        if (e.clientId) setClient(await clientService.getById(e.clientId));
        setChangeOrders(await changeOrderService.listForEstimate(e.id));
        setActivity(await auditService.getHistory(e.companyId, "estimates", e.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load estimate.");
    } finally {
      setLoading(false);
    }
  }, [estimateService, projectService, clientService, changeOrderService, auditService, estimateId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete() {
    if (!estimate) return;
    const reason = window.prompt(`Why are you deleting estimate ${estimate.estimateNumber ?? estimate.id}?`);
    if (!reason) return;
    try {
      await estimateService.softDelete(estimate.id, reason);
      router.push("/estimates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete estimate.");
    }
  }

  async function handleSignature(signature: NonNullable<Estimate["signature"]>) {
    if (!estimate) return;
    try {
      const updated = await estimateService.recordSignature(estimate.id, signature);
      setEstimate({ ...estimate, ...updated });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save signature.");
    }
  }

  async function handleRemoveSignature() {
    if (!estimate) return;
    try {
      const updated = await estimateService.recordSignature(estimate.id, null);
      setEstimate({ ...estimate, ...updated });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove signature.");
    }
  }

  async function handleDownloadPdf() {
    if (!estimate) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    window.open(`/api/estimates/${estimate.id}/pdf${token ? `?token=${token}` : ""}`, "_blank");
  }

  if (loading) return <PageContainer><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></PageContainer>;
  if (error) return <PageContainer><div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div></PageContainer>;
  if (!estimate) return <PageContainer><EmptyState title="Estimate not found" description="It may have been deleted or the link is incorrect." /></PageContainer>;

  // Total must always match the estimate data — estimate.total comes
  // straight from EstimateService (never recomputed here). Revised
  // total is the ONE shared formula (financialCalculations.
  // calculateRevisedEstimateTotal) — the same function the Project
  // Detail page, the Change Order Detail page, and the estimate PDF
  // route all call, so this figure can never independently drift from
  // what those other surfaces show.
  // Absolute URL for sharing. Read from the browser rather than
  // hardcoded so the link is right in dev, preview, and production.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const hasApprovedChangeOrders = changeOrders.some((c) => c.status === "approved");
  const approvedChangeOrderRevenue = sumApprovedChangeOrderRevenue(changeOrders);
  const revisedTotal = calculateRevisedEstimateTotal(estimate.total, changeOrders);

  return (
    <PageContainer>
      <PageHeader
        title={estimate.estimateNumber ?? estimate.id.slice(0, 8)}
        description={estimate.title ?? "No title"}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[estimate.status]}>{estimate.status.replace(/_/g, " ")}</Badge>
            <button type="button" onClick={handleDownloadPdf} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <Download className="size-3.5" /> PDF
            </button>
            <Link href={`/estimates/${estimate.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <Pencil className="size-3.5" /> Edit
            </Link>
            <button type="button" onClick={handleDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10">
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4 text-muted-foreground" /> Estimate Summary
            </h2>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</dt>
                <dd className="mt-0.5 text-foreground">
                  {project ? <Link href={`/projects/${project.id}`} className="text-primary hover:underline">{project.name}</Link> : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</dt>
                <dd className="mt-0.5 text-foreground">
                  {client ? <Link href={`/clients/${client.id}`} className="text-primary hover:underline">{client.name}</Link> : "No client"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
                <dd className="mt-0.5 text-foreground">{estimate.status.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created</dt>
                <dd className="mt-0.5 text-foreground">{new Date(estimate.createdAt).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</dt>
                <dd className="mt-0.5 text-foreground">{estimate.title || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{estimate.description || "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Line Items</h2>
            {estimate.lineItems.length === 0 ? (
              <EmptyState title="No line items" description="Edit this estimate to add items." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {estimate.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{item.name}</div>
                          {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{item.quantity}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatMoney(item.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">{formatMoney(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 space-y-1 rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatMoney(estimate.subtotal)}</span></div>
              {estimate.markup !== 0 && <div className="flex justify-between text-muted-foreground"><span>Markup</span><span>{formatMoney(estimate.markup)}</span></div>}
              {estimate.discount !== 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>-{formatMoney(estimate.discount)}</span></div>}
              {estimate.taxRate !== 0 && <div className="flex justify-between text-muted-foreground"><span>Tax ({estimate.taxRate}%)</span></div>}
              <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground"><span>Total</span><span>{formatMoney(estimate.total)}</span></div>
              {estimate.depositAmount > 0 && <div className="flex justify-between text-muted-foreground"><span>Requested deposit</span><span>{formatMoney(estimate.depositAmount)}</span></div>}
              {hasApprovedChangeOrders && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Approved change orders</span>
                    <span>{formatMoney(approvedChangeOrderRevenue)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                    <span>Revised total</span>
                    <span>{formatMoney(revisedTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Customer Signature</h2>
            <SignaturePad existingSignature={estimate.signature} onSave={handleSignature} onRemove={handleRemoveSignature} />
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <GitPullRequest className="size-4 text-muted-foreground" /> Change Orders
              </h2>
              <Link href={`/change-orders/new?projectId=${estimate.projectId}&estimateId=${estimate.id}`} className="text-xs font-medium text-primary hover:underline">
                + New change order
              </Link>
            </div>
            {changeOrders.length === 0 ? (
              <EmptyState title="No change orders yet" description="Pending, approved, and rejected change orders on this estimate will appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {changeOrders.map((co) => (
                  <li key={co.id}>
                    <Link href={`/change-orders/${co.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-primary">
                      <div>
                        <div className="font-medium text-foreground">{co.changeOrderNumber}</div>
                        <div className="text-xs text-muted-foreground">{co.title}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{formatMoney(calculateChangeOrderRevenue(co.totalAmount, co.tax))}</span>
                        <Badge tone={CHANGE_ORDER_STATUS_TONE[co.status]}>{co.status}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Receipt className="size-4 text-muted-foreground" /> Invoice
            </h2>
            <EmptyState title="Not invoiced yet" description="Once this estimate is approved and converted, its invoice will appear here." />
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wallet className="size-4 text-muted-foreground" /> Payments
            </h2>
            <EmptyState title="No payments recorded" description="Payments collected against this estimate's invoice will appear here." />
          </section>

          {estimate.projectId && (
            <ProjectExpensesPanel
              companyId={estimate.companyId}
              projectId={estimate.projectId}
              estimateId={estimate.id}
              canEdit={canEditExpenses}
              onChanged={loadFinancials}
            />
          )}

          <ProfitSummaryCard financials={financials} />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <FolderOpen className="size-4 text-muted-foreground" /> Documents
              </h2>
              <EmptyState icon={FolderOpen} title="No documents yet" description="Documents attached to this estimate will appear here." />
            </section>
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Camera className="size-4 text-muted-foreground" /> Photos
              </h2>
              <EmptyState icon={Camera} title="No photos yet" description="Photos attached to this estimate will appear here." />
            </section>
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Share2 className="size-4 text-muted-foreground" /> Customer Portal
            </h2>
            {estimate.customerToken ? (
              <SharePortalPanel
                portalUrl={`${origin}/portal/${estimate.id}?token=${encodeURIComponent(estimate.customerToken)}`}
                clientName={client?.name ?? null}
                clientPhone={client?.phone ?? null}
                documentLabel="estimate"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No portal link yet — this estimate predates the sharing token. Re-save it, or run the customer-portal
                migration to backfill tokens.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <User className="size-4 text-muted-foreground" /> Client
            </h2>
            {client ? (
              <div className="space-y-1 text-sm">
                <div className="font-medium text-foreground">{client.name}</div>
                {client.email && <div className="text-muted-foreground">{client.email}</div>}
                {client.phone && <div className="text-muted-foreground">{client.phone}</div>}
              </div>
            ) : (
              <EmptyState title="No client" description="This estimate's project has no client attached." />
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="size-4 text-muted-foreground" /> Activity Timeline
            </h2>
            {activity.length === 0 ? (
              <EmptyState title="No activity recorded yet" description="Create/update/delete/status-change events for this estimate will appear here." />
            ) : (
              <ol className="space-y-3 border-l-2 border-border pl-4">
                {activity.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[21px] top-0.5 size-3 rounded-full bg-primary" />
                    <div className="text-sm font-medium capitalize text-foreground">{entry.action.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
  );
}

export default function EstimateDetailPage() {
  return (
    <RequirePermission resource="estimate" action="view">
      <EstimateDetailContent />
    </RequirePermission>
  );
}
