"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, GitPullRequest, History, FileText } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { usePermission } from "@/lib/hooks/usePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { calculateChangeOrderRevenue, calculateRevisedEstimateTotal } from "@/lib/services/financialCalculations";
import type { ChangeOrder, ChangeOrderLineItem } from "@/lib/services/changeOrderService";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";
import type { AuditLogEntry, ChangeOrderStatus } from "@/lib/services";

const STATUS_TONE: Record<ChangeOrderStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  invoiced: "success",
};

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function ChangeOrderDetailContent() {
  const params = useParams();
  const router = useRouter();
  const changeOrderId = params.id as string;
  const { changeOrderService, projectService, estimateService, auditService, changeOrderWorkflow } = useServices();
  const canApprove = usePermission("estimate", "approve");

  const [changeOrder, setChangeOrder] = useState<(ChangeOrder & { lineItems: ChangeOrderLineItem[] }) | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [revisedEstimateTotal, setRevisedEstimateTotal] = useState<number | null>(null);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const co = await changeOrderService.getById(changeOrderId);
      setChangeOrder(co);

      if (co) {
        // includeDeleted: true on both — this change order's project/
        // estimate context must never disappear just because either
        // was later deleted; financial history is permanent.
        const [p, e, history, siblingChangeOrders] = await Promise.all([
          projectService.getById(co.projectId, true),
          estimateService.getById(co.estimateId, true),
          auditService.getHistory(co.companyId, "change_orders", co.id),
          changeOrderService.listForEstimate(co.estimateId),
        ]);
        setProject(p);
        setEstimate(e);
        setActivity(history);

        // Derived, not stored — the ONE shared formula
        // (financialCalculations.calculateRevisedEstimateTotal), the
        // same function the Estimate Detail page, the Project Detail
        // page, and the estimate PDF route all call, so this figure
        // can never independently drift from what those other
        // surfaces show. Never written back onto estimates.total (see
        // changeOrderService.ts's doc comment on why).
        if (e) {
          setRevisedEstimateTotal(calculateRevisedEstimateTotal(e.total, siblingChangeOrders));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load change order.");
    } finally {
      setLoading(false);
    }
  }, [changeOrderService, projectService, estimateService, auditService, changeOrderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleApprove() {
    if (!changeOrder) return;
    setActionError(null);
    try {
      // Routed through the same shared workflow the customer portal
      // uses (see lib/services/changeOrderWorkflow.ts) — staff approval
      // just passes no signature. One "what does approving mean" path
      // for both entry points, matching the estimate-signing pattern.
      const result = await changeOrderWorkflow.approveChangeOrder(changeOrder.id);
      if (!result.ok) {
        setActionError(result.message ?? "Failed to approve change order.");
        return;
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve change order.");
    }
  }

  async function handleReject() {
    if (!changeOrder) return;
    setActionError(null);
    try {
      const result = await changeOrderService.changeStatus(changeOrder.id, "rejected");
      if (!result.valid) {
        setActionError(result.issues.map((i) => i.message).join("; "));
        return;
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject change order.");
    }
  }

  async function handleDelete() {
    if (!changeOrder) return;
    const reason = window.prompt(`Why are you deleting change order ${changeOrder.changeOrderNumber}?`);
    if (!reason) return;
    try {
      await changeOrderService.softDelete(changeOrder.id, reason);
      router.push("/change-orders");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete change order.");
    }
  }

  if (loading) return <PageContainer><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></PageContainer>;
  if (error) return <PageContainer><div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div></PageContainer>;
  if (!changeOrder) return <PageContainer><EmptyState title="Change order not found" description="It may have been deleted or the link is incorrect." /></PageContainer>;

  const canEdit = changeOrder.status === "pending" || changeOrder.status === "rejected";

  return (
    <PageContainer>
      <PageHeader
        title={changeOrder.changeOrderNumber}
        description={changeOrder.title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[changeOrder.status]}>{changeOrder.status}</Badge>
            {canApprove && changeOrder.status === "pending" && (
              <>
                <button type="button" onClick={handleApprove} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <Check className="size-3.5" /> Approve
                </button>
                <button type="button" onClick={handleReject} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10">
                  <X className="size-3.5" /> Reject
                </button>
              </>
            )}
            {canEdit && (
              <Link href={`/change-orders/${changeOrder.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
                <Pencil className="size-3.5" /> Edit
              </Link>
            )}
            <button type="button" onClick={handleDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10">
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        }
      />

      {actionError && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{actionError}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <GitPullRequest className="size-4 text-muted-foreground" /> Change Order Summary
            </h2>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</dt>
                <dd className="mt-0.5 text-foreground">{project ? <Link href={`/projects/${project.id}`} className="text-primary hover:underline">{project.name}</Link> : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimate</dt>
                <dd className="mt-0.5 text-foreground">{estimate ? <Link href={`/estimates/${estimate.id}`} className="text-primary hover:underline">{estimate.estimateNumber ?? estimate.id.slice(0, 8)}</Link> : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
                <dd className="mt-0.5 text-foreground">{changeOrder.status}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approved</dt>
                <dd className="mt-0.5 text-foreground">{changeOrder.approvedAt ? new Date(changeOrder.approvedAt).toLocaleDateString() : "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{changeOrder.description || "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Line Items</h2>
            {changeOrder.lineItems.length === 0 ? (
              <EmptyState title="No itemized breakdown" description="This change order uses a flat amount." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {changeOrder.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-foreground">{item.description}</td>
                        <td className="px-3 py-2">
                          <Badge tone={item.type === "addition" ? "success" : "danger"}>{item.type}</Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{item.quantity}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatMoney(item.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">{item.type === "deduction" ? "-" : ""}{formatMoney(Math.abs(item.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 space-y-1 rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Amount</span><span>{formatMoney(changeOrder.totalAmount)}</span></div>
              {changeOrder.tax !== 0 && <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{formatMoney(changeOrder.tax)}</span></div>}
              <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground"><span>Total</span><span>{formatMoney(calculateChangeOrderRevenue(changeOrder.totalAmount, changeOrder.tax))}</span></div>
            </div>
          </section>

          {estimate && (
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="size-4 text-muted-foreground" /> Estimate Impact
              </h2>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Estimate total (own line items)</span><span>{formatMoney(estimate.total)}</span></div>
                <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                  <span>Revised total (with approved change orders)</span>
                  <span>{revisedEstimateTotal !== null ? formatMoney(revisedEstimateTotal) : "—"}</span>
                </div>
                {changeOrder.status !== "approved" && (
                  <p className="pt-1 text-xs text-muted-foreground">This change order is &ldquo;{changeOrder.status}&rdquo; and is not included in the revised total above until approved.</p>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="size-4 text-muted-foreground" /> Activity Timeline
            </h2>
            {activity.length === 0 ? (
              <EmptyState title="No activity recorded yet" description="Create/update/approve/reject events for this change order will appear here." />
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

export default function ChangeOrderDetailPage() {
  return (
    <RequirePermission resource="estimate" action="view">
      <ChangeOrderDetailContent />
    </RequirePermission>
  );
}
