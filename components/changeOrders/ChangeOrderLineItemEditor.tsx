"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ChangeOrderLineItem } from "@/lib/services/changeOrderService";

export type DraftChangeOrderLineItem = Omit<ChangeOrderLineItem, "id" | "total">;

/**
 * Change orders' line-item shape differs from an estimate's (addition/
 * deduction instead of material/labor/other, no taxable flag) — a
 * second small editor rather than forcing LineItemEditor to support
 * two incompatible item shapes. The signed-sum total math itself is
 * NOT duplicated here: this component only displays each row's own
 * quantity*unitPrice and lets the service (createChangeOrder/update)
 * derive the real totalAmount, matching how LineItemEditor never
 * computes an estimate's total either.
 */
export function ChangeOrderLineItemEditor({ items, onChange }: { items: DraftChangeOrderLineItem[]; onChange: (items: DraftChangeOrderLineItem[]) => void }) {
  function updateItem(index: number, changes: Partial<DraftChangeOrderLineItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  }

  function addItem() {
    onChange([...items, { description: "", quantity: 1, unitPrice: 0, type: "addition" }]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  const signedTotal = items.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return sum + (item.type === "addition" ? lineTotal : -lineTotal);
  }, 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
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
                    value={item.type}
                    onChange={(e) => updateItem(i, { type: e.target.value as DraftChangeOrderLineItem["type"] })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring"
                  >
                    <option value="addition">Addition</option>
                    <option value="deduction">Deduction</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    placeholder="Description"
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
                  {(item.type === "deduction" ? -1 : 1) * item.quantity * item.unitPrice < 0 ? "-" : ""}
                  {Math.abs(item.quantity * item.unitPrice).toLocaleString("en-US", { style: "currency", currency: "USD" })}
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
                <td colSpan={6} className="px-2 py-4 text-center text-xs text-muted-foreground">No line items — using flat amount below.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
            <Plus className="size-3.5" /> Add line item
          </button>
          <div className="text-sm text-muted-foreground">
            Signed total: <span className="font-semibold text-foreground">{signedTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
          </div>
        </div>
      )}
      {items.length === 0 && (
        <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
          <Plus className="size-3.5" /> Add line item
        </button>
      )}
    </div>
  );
}
