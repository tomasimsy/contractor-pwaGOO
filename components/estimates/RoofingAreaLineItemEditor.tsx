"use client";

/**
 * Line item editor scoped to a SINGLE roofing area (Estimate Roof V2).
 *
 * No longer has its own "Save Line Items" button — the parent
 * (RoofingAreasEditorV2) drives saving via the imperative `save()`
 * handle below, so a user hits ONE "Save Area" button per area that
 * saves both the area's own fields AND its line items together,
 * instead of two separate clicks. Independence is unaffected: `save()`
 * still only ever writes THIS area's line items — the parent just
 * chooses when to call it.
 *
 * Independence is enforced at two levels:
 * 1. Data: estimateAreaLineItemService.replaceForArea() only ever
 *    deletes/inserts rows WHERE estimate_area_id = this area's id — it
 *    is architecturally impossible for saving here to touch another
 *    area's line items.
 * 2. UI: every piece of state (items, loading, error) is local to this
 *    component instance — React mounts one instance per area (keyed by
 *    area.id in the parent), so there is no shared state across areas.
 *
 * Reuses financialCalculations.ts (calculateLineItemTotal/calculateSubtotal)
 * — the same primitives EstimateService/LineItemEditor use — so an area's
 * subtotal is computed with the exact same formula as the top-level estimate.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useServices } from "@/components/providers/ServicesProvider";
import { calculateLineItemTotal, calculateSubtotal } from "@/lib/services/financialCalculations";
import type { EstimateAreaLineItem, EstimateAreaLineItemCreateInput } from "@/lib/services/estimateAreaLineItemService";
import type { UUID } from "@/lib/services/types";

export interface RoofingAreaLineItemEditorHandle {
  /**
   * Saves this area's current line items. Accepts optional companyId/
   * areaId overrides for the moment right after a brand-new area's
   * first save: `roofingAreaService.create()` mints a brand-new
   * server-side UUID for the area, different from the client-side
   * draft id this component was mounted/keyed with (see
   * RoofingAreasEditorV2.handleAddArea) — and the `areaId`/`companyId`
   * PROPS won't reflect the real, saved values until the next render
   * commits. The parent already has both synchronously from the
   * create() response, so they're passed straight through here instead
   * of this component using its own stale props and inserting line
   * items against an `estimate_area_id` that was never actually
   * written to `estimate_areas` (the exact FK-violation bug this
   * override closes — found 2026-08-02, "Failed to save area line
   * items ... violates foreign key constraint
   * estimate_area_line_items_estimate_area_id_fkey" on a brand-new
   * area's first save).
   */
  save: (companyIdOverride?: UUID, areaIdOverride?: UUID) => Promise<void>;
}

export type DraftAreaLineItem = Omit<EstimateAreaLineItemCreateInput, "areaId" | "companyId">;

const CATEGORIES: DraftAreaLineItem["category"][] = ["material", "labor", "other"];
const UNITS: NonNullable<DraftAreaLineItem["unit"]>[] = ["EA", "SF", "SQFT", "SQ", "LF", "FT", "HR", "DAY", "LS"];

function toDraft(item: EstimateAreaLineItem): DraftAreaLineItem {
  return {
    category: item.category,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unit: item.unit,
    taxable: item.taxable,
    sequenceNumber: item.sequenceNumber,
  };
}

export const RoofingAreaLineItemEditor = forwardRef<RoofingAreaLineItemEditorHandle, {
  areaId: UUID;
  companyId: UUID | null;
  disabled?: boolean;
  /**
   * Called after a successful save so the parent can recalculate the
   * estimate's subtotal/total (which is derived from every area's line
   * items — see EstimateService.recalculateTotal). This component only
   * owns its own area's line items; it never touches the estimate row
   * itself, keeping "which rows feed the subtotal" entirely in
   * EstimateService.
   */
  onSaved?: () => void;
}>(function RoofingAreaLineItemEditor({ areaId, companyId, disabled = false, onSaved }, ref) {
  const { estimateAreaLineItemService } = useServices();
  const [items, setItems] = useState<DraftAreaLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    estimateAreaLineItemService
      .listForArea(areaId)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows.map(toDraft));
      })
      .catch((err) => {
        console.error(`Failed to load line items for area ${areaId}:`, err);
        if (!cancelled) setError("Failed to load line items.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [areaId, estimateAreaLineItemService]);

  function updateItem(index: number, changes: Partial<DraftAreaLineItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { category: "material", name: "", description: null, quantity: 1, unitPrice: 0, unit: null, taxable: true, sequenceNumber: prev.length },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const handleSave = useCallback(async (companyIdOverride?: UUID, areaIdOverride?: UUID) => {
    const effectiveCompanyId = companyIdOverride ?? companyId;
    // The real, server-assigned area id — NOT the `areaId` prop when a
    // brand-new area was just created in this same "Save Area" click
    // (see the handle's own doc comment for why props lag one render
    // behind here).
    const effectiveAreaId = areaIdOverride ?? areaId;
    if (!effectiveCompanyId) {
      // Shouldn't happen through the normal "Save Area" path (the
      // parent always saves the area first and passes its companyId
      // through), but guards direct/future callers of this handle.
      throw new Error("Cannot save line items before the roof area itself has been saved.");
    }
    setError(null);
    try {
      const savedItems = await estimateAreaLineItemService.replaceForArea(
        effectiveAreaId,
        effectiveCompanyId,
        items.map((item, idx) => ({ ...item, areaId: effectiveAreaId, companyId: effectiveCompanyId, sequenceNumber: idx }))
      );
      setItems(savedItems.map(toDraft));
      onSaved?.();
    } catch (err) {
      // console.warn, not console.error: this is almost always an
      // expected, user-fixable validation failure (e.g. a blank line
      // item name) that's already surfaced inline below and via the
      // area-level alert in the parent — not a bug. Next's dev overlay
      // auto-triggers a full-page error screen for any console.error
      // call, even ones already caught and handled, which made a normal
      // "fill in this field" moment look like the app had crashed.
      console.warn(`Failed to save line items for area ${effectiveAreaId}:`, err);
      // Surface the real validation reason (e.g. "Line item name is
      // required") right here, at the point of saving — not as a
      // confusing failure the user sees for the first time after
      // signing, once InvoiceService tries to build an invoice from
      // whatever was actually persisted.
      setError(err instanceof Error ? err.message : "Failed to save line items. Please try again.");
      throw err;
    }
  }, [areaId, companyId, items, estimateAreaLineItemService, onSaved]);

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

  const subtotal = calculateSubtotal(items.map((item) => ({ total: calculateLineItemTotal(item) })));

  if (loading) {
    return <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500">Loading line items…</div>;
  }

  return (
    <div className="space-y-2">
      {error && <div className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}

      {/* ---------- MOBILE: one card per line item ----------
          A 7-column table cannot fit a phone. Measured at 375px wide
          this editor had 254px of usable width against 341px of table,
          so every row scrolled sideways. Below `sm` the same fields
          render stacked and full-width instead; from `sm` up the table
          below is unchanged. Identical state and handlers — this is
          purely how the same inputs are arranged. */}
      <div className="space-y-2 sm:hidden">
        {items.map((item, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-2.5">
            <div className="flex items-start gap-2">
              <input
                value={item.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                placeholder="Item name"
                className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label="Remove line item"
                className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Category</span>
                <select
                  value={item.category}
                  onChange={(e) => updateItem(i, { category: e.target.value as DraftAreaLineItem["category"] })}
                  className="w-full rounded-md border border-gray-300 bg-white px-1.5 py-1.5 text-xs outline-none focus:border-blue-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Qty</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-md border border-gray-300 px-1.5 py-1.5 text-xs outline-none focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Unit</span>
                <select
                  value={item.unit ?? ""}
                  onChange={(e) => updateItem(i, { unit: (e.target.value || null) as DraftAreaLineItem["unit"] })}
                  className="w-full rounded-md border border-gray-300 bg-white px-1.5 py-1.5 text-xs outline-none focus:border-blue-500"
                >
                  <option value="">—</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 items-end gap-2">
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Unit Price</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-md border border-gray-300 px-1.5 py-1.5 text-xs outline-none focus:border-blue-500"
                />
              </label>
              <div className="text-right">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Total</span>
                <span className="block py-1.5 text-xs font-semibold text-gray-900">
                  {calculateLineItemTotal(item).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </span>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-lg border border-gray-200 px-2 py-3 text-center text-xs text-gray-500">No line items yet.</div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 sm:block">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-gray-500">Category</th>
              <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-gray-500">Name</th>
              <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-gray-500">Qty</th>
              <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-gray-500">Unit</th>
              <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-gray-500">Unit Price</th>
              <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-gray-500">Total</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item, i) => (
              <tr key={i}>
                <td className="px-2 py-1">
                  <select
                    value={item.category}
                    onChange={(e) => updateItem(i, { category: e.target.value as DraftAreaLineItem["category"] })}
                    className="w-full rounded-md border border-gray-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                    placeholder="Item name"
                    className="w-full min-w-[110px] rounded-md border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-16 rounded-md border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    value={item.unit ?? ""}
                    onChange={(e) => updateItem(i, { unit: (e.target.value || null) as DraftAreaLineItem["unit"] })}
                    className="w-16 rounded-md border border-gray-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                  >
                    <option value="">—</option>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-20 rounded-md border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                  />
                </td>
                <td className="px-2 py-1 text-right font-medium text-gray-900">
                  {calculateLineItemTotal(item).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </td>
                <td className="px-2 py-1 text-right">
                  <button type="button" onClick={() => removeItem(i)} aria-label="Remove line item" className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-xs text-gray-500">No line items yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          <Plus className="size-3.5" /> Add line item
        </button>
        <div className="text-xs text-gray-600">
          Area subtotal: <span className="font-semibold text-gray-900">{subtotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
        </div>
      </div>
    </div>
  );
});
