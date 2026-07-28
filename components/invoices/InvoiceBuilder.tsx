"use client";

/**
 * Invoice Create/Edit. Replaces the orphaned components/invoices/
 * InvoiceForm.tsx, which was built against lib/services-context.tsx —
 * a standalone prop-driven context never wired into app/layout.tsx or
 * any route (confirmed by grep: nothing under app/(app) imports it).
 * That file was unreachable dead scaffolding, same as the earlier
 * EstimateForm; this version reads from the real
 * components/providers/ServicesProvider every live page uses.
 *
 * Display + input collection ONLY. Every total shown comes from the
 * shared financialCalculations functions (the same ones InvoiceService
 * itself uses); this component never sums anything with its own
 * arithmetic, and never sets subtotal/tax/total — those are derived
 * server-side from the line items it submits.
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { calculateLineItemTotal, calculateSubtotal, calculateInvoiceTotal } from "@/lib/services/financialCalculations";
import { formatMoney } from "./invoiceStatus";
import type { Invoice, InvoiceLineItem } from "@/lib/services/invoiceService";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";

type DraftItem = Omit<InvoiceLineItem, "id" | "total">;

export function InvoiceBuilder({ invoice, lineItems: initialLineItems }: { invoice?: Invoice; lineItems?: InvoiceLineItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { invoiceService, projectService, estimateService } = useServices();
  const { profile } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [projectId, setProjectId] = useState(invoice?.projectId ?? searchParams.get("projectId") ?? "");
  const [sourceEstimateId, setSourceEstimateId] = useState(searchParams.get("estimateId") ?? "");
  // Lazy initializers — reading the clock during render is impure and
  // the React Compiler rejects it (a re-render would silently produce a
  // different default date). Computed once, on mount.
  const [issueDate, setIssueDate] = useState(() => invoice?.issueDate ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    () => invoice?.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [items, setItems] = useState<DraftItem[]>(
    initialLineItems?.map((li) => ({ name: li.name, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    projectService.list({ companyId: profile.companyId }).then(setProjects);
    estimateService.list({ companyId: profile.companyId }).then(setEstimates);
  }, [projectService, estimateService, profile?.companyId]);

  // Only APPROVED estimates on the selected project can be converted —
  // matching the lifecycle rule (an unapproved quote isn't billable).
  const convertibleEstimates = estimates.filter((e) => e.projectId === projectId && e.status === "approved");

  const subtotal = calculateSubtotal(items.map((li) => ({ total: calculateLineItemTotal(li) })));
  // Tax is carried by the service (from the source estimate) — a
  // manually built invoice has none, so total === subtotal here.
  const total = calculateInvoiceTotal(subtotal, invoice?.tax ?? 0);

  function updateItem(index: number, changes: Partial<DraftItem>) {
    setItems(items.map((it, i) => (i === index ? { ...it, ...changes } : it)));
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.companyId) return;
    setSaving(true);
    setError(null);
    try {
      if (invoice) {
        const result = await invoiceService.updateLineItems(invoice.id, items);
        if (!result.valid) {
          setError(result.issues.map((i) => i.message).join("; "));
          return;
        }
        router.push(`/invoices/${invoice.id}`);
      } else if (sourceEstimateId) {
        // Conversion path — the service snapshots line items and
        // approved change orders; this form doesn't assemble them.
        const created = await invoiceService.createFromEstimate(sourceEstimateId, { issueDate, dueDate });
        router.push(`/invoices/${created.id}`);
      } else {
        const project = projects.find((p) => p.id === projectId);
        const created = await invoiceService.createStandalone({
          companyId: profile.companyId,
          projectId,
          clientId: project?.clientId ?? null,
          lineItems: items,
          issueDate,
          dueDate,
        });
        router.push(`/invoices/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save invoice.");
    } finally {
      setSaving(false);
    }
  }

  const convertMode = !invoice && !!sourceEstimateId;
  const canSubmit = !!projectId && (convertMode || items.length > 0);

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Project *</label>
          <select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setSourceEstimateId(""); }}
            required
            disabled={!!invoice}
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
          >
            <option value="" disabled>Select a project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {!invoice && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Generate from approved estimate</label>
            <select
              value={sourceEstimateId}
              onChange={(e) => setSourceEstimateId(e.target.value)}
              disabled={!projectId}
              className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
            >
              <option value="">None — build manually below</option>
              {convertibleEstimates.map((e) => (
                <option key={e.id} value={e.id}>{e.estimateNumber ?? e.id.slice(0, 8)}</option>
              ))}
            </select>
            {projectId && convertibleEstimates.length === 0 && (
              <p className="text-xs text-muted-foreground">No approved estimates on this project.</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Issue date</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={!!invoice} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring disabled:opacity-60" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!!invoice} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring disabled:opacity-60" />
        </div>
      </div>

      {convertMode ? (
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Line items and any approved change orders will be copied from the estimate at creation, preserving the quoted pricing.
          They become a permanent snapshot — later estimate edits will not change this invoice.
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Line items</label>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input value={item.name} onChange={(e) => updateItem(i, { name: e.target.value })} placeholder="Item name" className="w-full min-w-[140px] rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="any" value={item.quantity} onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })} className="w-20 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" step="any" value={item.unitPrice} onChange={(e) => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })} className="w-24 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring" />
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs font-medium text-foreground">{formatMoney(calculateLineItemTotal(item))}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-0.5">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                        <button type="button" onClick={() => setItems(items.filter((_, x) => x !== i))} aria-label="Remove line item" className="rounded-md p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-4 text-center text-xs text-muted-foreground">No line items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setItems([...items, { name: "", description: null, quantity: 1, unitPrice: 0 }])} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
              <Plus className="size-3.5" /> Add line item
            </button>
            <div className="text-sm text-muted-foreground">
              Subtotal: <span className="font-semibold text-foreground">{formatMoney(subtotal)}</span>
            </div>
          </div>
        </div>
      )}

      {!convertMode && (
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-right text-sm">
          <span className="text-muted-foreground">Total: </span>
          <span className="font-semibold text-foreground">{formatMoney(total)}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">Cancel</button>
        <button type="submit" disabled={saving || !canSubmit} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : invoice ? "Save changes" : convertMode ? "Generate invoice" : "Create invoice"}
        </button>
      </div>
    </form>
  );
}
