"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { ChangeOrderLineItemEditor, type DraftChangeOrderLineItem } from "./ChangeOrderLineItemEditor";
import type { ChangeOrder, ChangeOrderLineItem } from "@/lib/services/changeOrderService";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Shared by Create and Edit — all data access through
 * useServices().changeOrderService/projectService/estimateService, no
 * direct database calls here. Project -> Estimate is a real dependent
 * picker: choosing a project filters which estimates are selectable,
 * matching the Client -> Project -> Estimate -> Change Order hierarchy
 * (a change order cannot be created against an estimate belonging to a
 * different project — the service enforces this too, this is just the
 * UI not offering an invalid combination in the first place).
 */
export function ChangeOrderForm({ changeOrder, lineItems: initialLineItems }: { changeOrder?: ChangeOrder; lineItems?: ChangeOrderLineItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { changeOrderService, projectService, estimateService } = useServices();
  const { profile } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [projectId, setProjectId] = useState(changeOrder?.projectId ?? searchParams.get("projectId") ?? "");
  const [estimateId, setEstimateId] = useState(changeOrder?.estimateId ?? searchParams.get("estimateId") ?? "");
  const [title, setTitle] = useState(changeOrder?.title ?? "");
  const [description, setDescription] = useState(changeOrder?.description ?? "");
  const [tax, setTax] = useState(changeOrder?.tax ?? 0);
  const [totalAmount, setTotalAmount] = useState(changeOrder?.totalAmount ?? 0);
  const [lineItems, setLineItems] = useState<DraftChangeOrderLineItem[]>(
    initialLineItems?.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, type: li.type })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    projectService.list({ companyId: profile.companyId }).then(setProjects);
    estimateService.list({ companyId: profile.companyId }).then(setEstimates);
  }, [projectService, estimateService, profile?.companyId]);

  const estimatesForProject = estimates.filter((e) => e.projectId === projectId);
  const signedLineItemTotal = lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return sum + (item.type === "addition" ? lineTotal : -lineTotal);
  }, 0);
  const effectiveTotal = lineItems.length > 0 ? signedLineItemTotal : totalAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.companyId || !projectId || !estimateId) return;
    setSaving(true);
    setError(null);
    try {
      if (changeOrder) {
        await changeOrderService.update(changeOrder.id, {
          title,
          description: description || null,
          tax,
          totalAmount: lineItems.length > 0 ? undefined : totalAmount,
          lineItems: lineItems.length > 0 ? lineItems : undefined,
        });
        router.push(`/change-orders/${changeOrder.id}`);
      } else {
        const numberSeed = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
        const created = await changeOrderService.createChangeOrder({
          companyId: profile.companyId,
          projectId,
          estimateId,
          changeOrderNumber: `CO-${numberSeed}`,
          title,
          description: description || undefined,
          lineItems: lineItems.length > 0 ? lineItems : undefined,
          totalAmount,
          tax,
        });
        router.push(`/change-orders/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save change order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Project *</label>
          <select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setEstimateId(""); }}
            required
            disabled={!!changeOrder}
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
          >
            <option value="" disabled>Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Estimate *</label>
          <select
            value={estimateId}
            onChange={(e) => setEstimateId(e.target.value)}
            required
            disabled={!projectId || !!changeOrder}
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
          >
            <option value="" disabled>Select an estimate</option>
            {estimatesForProject.map((e) => (
              <option key={e.id} value={e.id}>{e.estimateNumber ?? e.id.slice(0, 8)}</option>
            ))}
          </select>
          {projectId && estimatesForProject.length === 0 && <p className="text-xs text-muted-foreground">No estimates on this project yet.</p>}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Title *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Add gutters to west elevation"
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Description</label>
        <textarea
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">Line items (optional — itemized breakdown)</label>
        <ChangeOrderLineItemEditor items={lineItems} onChange={setLineItems} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Flat amount ($)</label>
          <input
            type="number"
            step="any"
            value={totalAmount}
            onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
            disabled={lineItems.length > 0}
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
          />
          {lineItems.length > 0 && <p className="text-xs text-muted-foreground">Derived from line items above.</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Tax ($)</label>
          <input type="number" step="any" value={tax} onChange={(e) => setTax(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 px-4 py-3 text-right text-sm">
        <span className="text-muted-foreground">Amount + tax: </span>
        <span className="font-semibold text-foreground">{formatMoney(effectiveTotal + tax)}</span>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={saving || !projectId || !estimateId || !title} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : changeOrder ? "Save changes" : "Create change order"}
        </button>
      </div>
    </form>
  );
}
