"use client";

/**
 * Estimate Create/Edit form — replaces an earlier draft of this same
 * file that was built against lib/services-context.tsx's standalone
 * <ServicesProvider>/useServices() (a separate, PROP-driven context,
 * never wired into app/layout.tsx or any real route — confirmed via a
 * repo-wide grep: nothing under app/(app) imports it). That version
 * was unreachable dead code, not "the existing system" to extend; the
 * real, live provider every other page (Clients, Projects) actually
 * uses is components/providers/ServicesProvider.tsx, which is what
 * this version reads from. Building on the orphaned one would have
 * been the parallel estimate system this module is explicitly not
 * supposed to create.
 *
 * This component's job is display + input collection ONLY — every
 * total shown comes back from financialCalculations.ts (the same
 * functions EstimateService itself delegates to), never computed
 * ad hoc here.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { LineItemEditor, type DraftLineItem } from "./LineItemEditor";
import { calculateSubtotal, calculateLineItemTotal, calculateDocumentTotal } from "@/lib/services/financialCalculations";
import type { Estimate, EstimateLineItem } from "@/lib/services/estimateService";
import type { Project } from "@/lib/services/projectService";

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function EstimateForm({ estimate, lineItems: initialLineItems }: { estimate?: Estimate; lineItems?: EstimateLineItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { estimateService, projectService } = useServices();
  const { profile } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(estimate?.projectId ?? searchParams.get("projectId") ?? "");
  const [title, setTitle] = useState(estimate?.title ?? "");
  const [description, setDescription] = useState(estimate?.description ?? "");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>(
    initialLineItems?.map((li) => ({ category: li.category, name: li.name, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, taxable: li.taxable })) ?? []
  );
  const [markup, setMarkup] = useState(estimate?.markup ?? 0);
  const [discount, setDiscount] = useState(estimate?.discount ?? 0);
  const [taxRate, setTaxRate] = useState(estimate?.taxRate ?? 0);
  const [depositAmount, setDepositAmount] = useState(estimate?.depositAmount ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    projectService.list({ companyId: profile.companyId }).then(setProjects);
  }, [projectService, profile?.companyId]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const subtotal = calculateSubtotal(lineItems.map((li) => ({ total: calculateLineItemTotal(li) })));
  const { total } = calculateDocumentTotal(subtotal, markup, discount, taxRate);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.companyId || !projectId) return;
    setSaving(true);
    setError(null);
    try {
      if (estimate) {
        await estimateService.update(estimate.id, {
          title: title || null,
          description: description || null,
          projectId,
          clientId: selectedProject?.clientId ?? null,
          markup,
          discount,
          taxRate,
          depositAmount,
        });
        await estimateService.updateLineItems(estimate.id, lineItems);
        router.push(`/estimates/${estimate.id}`);
      } else {
        const created = await estimateService.create({
          companyId: profile.companyId,
          projectId,
          clientId: selectedProject?.clientId ?? null,
          title: title || undefined,
          description: description || undefined,
          lineItems,
          markup,
          discount,
          taxRate,
          depositAmount,
        });
        router.push(`/estimates/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save estimate.");
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
            onChange={(e) => setProjectId(e.target.value)}
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="" disabled>Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {projects.length === 0 && <p className="text-xs text-muted-foreground">No projects yet — <Link href="/projects/new" className="text-primary hover:underline">create one first</Link>.</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Client</label>
          <div className="flex h-[34px] items-center rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground">
            {selectedProject?.clientId ? "Auto-loaded from project" : "No client on this project"}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional short title for this estimate"
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Project overview shown on the estimate and its PDF"
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">Line items</label>
        <LineItemEditor items={lineItems} onChange={setLineItems} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Markup ($)</label>
          <input type="number" step="any" value={markup} onChange={(e) => setMarkup(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Discount ($)</label>
          <input type="number" step="any" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Tax rate (%)</label>
          <input type="number" step="any" value={taxRate} onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Deposit ($)</label>
          <input type="number" step="any" value={depositAmount} onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 px-4 py-3 text-right text-sm">
        <span className="text-muted-foreground">Total: </span>
        <span className="font-semibold text-foreground">{formatMoney(total)}</span>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={saving || !projectId} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : estimate ? "Save changes" : "Create estimate"}
        </button>
      </div>
    </form>
  );
}
