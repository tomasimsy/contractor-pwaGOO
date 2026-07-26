"use client";

import { Plus, Trash2 } from "lucide-react";
import type { EstimateLineItem } from "@/lib/services/estimateService";
import { calculateLineItemTotal, calculateSubtotal } from "@/lib/services/financialCalculations";

export type DraftLineItem = Omit<EstimateLineItem, "id" | "total">;

const CATEGORIES: DraftLineItem["category"][] = ["material", "labor", "other"];

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
    onChange([...items, { category: "material", name: "", description: null, quantity: 1, unitPrice: 0, taxable: true }]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  const subtotal = calculateSubtotal(items.map((item) => ({ total: calculateLineItemTotal(item) })));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item, i) => (
              <tr key={i}>
                <td className="px-2 py-1.5">
                  <select
                    value={item.category}
                    onChange={(e) => updateItem(i, { category: e.target.value as DraftLineItem["category"] })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                    placeholder="Item name"
                    className="w-full min-w-[140px] rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-20 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-24 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring"
                  />
                </td>
                <td className="px-2 py-1.5 text-right text-xs font-medium text-foreground">
                  {calculateLineItemTotal(item).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button type="button" onClick={() => removeItem(i)} aria-label="Remove line item" className="rounded-md p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-xs text-muted-foreground">No line items yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
          <Plus className="size-3.5" /> Add line item
        </button>
        <div className="text-sm text-muted-foreground">
          Subtotal: <span className="font-semibold text-foreground">{subtotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
        </div>
      </div>
    </div>
  );
}
