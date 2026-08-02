"use client";

import { Plus, Trash2, Layers } from "lucide-react";
import type { EstimateLineItem } from "@/lib/services/estimateService";
import { calculateLineItemTotal, calculateSubtotal } from "@/lib/services/financialCalculations";

export type DraftLineItem = Omit<EstimateLineItem, "id" | "total">;

const CATEGORIES: DraftLineItem["category"][] = ["material", "labor", "other"];
const UNITS: NonNullable<DraftLineItem["unit"]>[] = ["EA", "SF", "SQFT", "SQ", "LF", "FT", "HR", "DAY", "LS"];

/**
 * The shared line-item table for Create/Edit Estimate — the ONE place
 * this app edits estimate line items, matching contractor-pwa's single
 * unified estimate-form save path (lib/queries/estimates.ts) instead
 * of a parallel implementation. Every total shown here is derived via
 * financialCalculations.ts (calculateLineItemTotal/calculateSubtotal)
 * — this component never computes a total itself.
 */
export function LineItemEditor({ items, onChange }: { items: DraftLineItem[]; onChange: (items: DraftLineItem[]) => void }) {
  function updateItem(index: number, changes: Partial<DraftLineItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  }

  function addItem() {
    onChange([...items, { category: "material", name: "", description: null, quantity: 1, unitPrice: 0, unit: null, taxable: true }]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  const subtotal = calculateSubtotal(items.map((item) => ({ total: calculateLineItemTotal(item) })));

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">Line Items</h3>
            <p className="text-[11px] text-muted-foreground">Manage project materials, labor, and additional costs</p>
          </div>
        </div>
        <div className="text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border/40">
          Items: <span className="font-semibold text-foreground">{items.length}</span>
        </div>
      </div>

      {/* Table Container with clear separation */}
      <div className="overflow-x-auto rounded-lg border border-border/80 bg-background shadow-2xs">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 border-b border-border/80">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {items.map((item, i) => (
              <tr key={i} className="group hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2">
                  <select
                    value={item.category}
                    onChange={(e) => updateItem(i, { category: e.target.value as DraftLineItem["category"] })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium capitalize outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                    placeholder="Item name"
                    className="w-full min-w-[140px] rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-20 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={item.unit ?? ""}
                    onChange={(e) => updateItem(i, { unit: (e.target.value || null) as DraftLineItem["unit"] })}
                    className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  >
                    <option value="">—</option>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-24 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </td>
                <td className="px-3 py-2 text-right text-xs font-semibold text-foreground">
                  {calculateLineItemTotal(item).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </td>
                <td className="px-2 py-2 text-right">
                  <button type="button" onClick={() => removeItem(i)} aria-label="Remove line item" className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No line items yet. Click &quot;Add line item&quot; below to start building your estimate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Controls & Subtotal Breakdown */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/60">
        <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700 shadow-2xs transition-all">
          <Plus className="size-3.5 text-white" /> Add line item
        </button>
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 border border-border/50 text-xs">
          <span className="text-muted-foreground">Subtotal:</span>
          <span className="font-semibold text-foreground text-sm">
            {subtotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </span>
        </div>
      </div>
    </div>
  );
}