"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, FolderPlus, Pencil } from "lucide-react";
import type { EstimateLineItem } from "@/lib/services/estimateService";
import { calculateLineItemTotal, calculateSubtotal } from "@/lib/services/financialCalculations";

export type DraftLineItem = Omit<EstimateLineItem, "id" | "total">;

const CATEGORIES: DraftLineItem["category"][] = ["material", "labor", "other"];
const UNITS: NonNullable<DraftLineItem["unit"]>[] = ["EA", "SF", "SQFT", "SQ", "LF", "FT", "HR", "DAY", "LS"];

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Entry = { item: DraftLineItem; index: number };

function blankItem(groupName: string | null = null): DraftLineItem {
  return { category: "material", name: "", description: null, quantity: 1, unitPrice: 0, unit: null, taxable: true, groupName };
}

/**
 * The shared line-item table for Create/Edit Estimate — the ONE place
 * this app edits estimate line items, matching contractor-pwa's single
 * unified estimate-form save path (lib/queries/estimates.ts) instead
 * of a parallel implementation. Every total shown here is derived via
 * financialCalculations.ts (calculateLineItemTotal/calculateSubtotal)
 * — this component never computes a total itself.
 *
 * Items with no `groupName` render as a flat list, exactly as every
 * estimate did before project grouping existed — including every
 * pre-existing estimate_items row, which has no groupName and needs
 * none. Items sharing a groupName render together under a collapsible
 * project header whose total is calculateSubtotal() over just that
 * group's items — never a separately stored/editable number, so it
 * can never drift from the items underneath it. `items` stays ONE
 * flat array throughout (same shape EstimateForm already saves) —
 * grouping is purely how this component chooses to render and edit
 * that array, not a different data structure.
 */
export function LineItemEditor({ items, onChange }: { items: DraftLineItem[]; onChange: (items: DraftLineItem[]) => void }) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  function updateItem(index: number, changes: Partial<DraftLineItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function addItem() {
    onChange([...items, blankItem()]);
  }

  function addProject() {
    const existingNames = new Set(items.filter((i) => i.groupName).map((i) => i.groupName));
    let name = "New Project";
    let n = 2;
    while (existingNames.has(name)) {
      name = `New Project ${n}`;
      n += 1;
    }
    onChange([...items, blankItem(name)]);
  }

  function addItemToGroup(groupName: string) {
    onChange([...items, blankItem(groupName)]);
  }

  function renameGroup(oldName: string, newName: string) {
    onChange(items.map((item) => (item.groupName === oldName ? { ...item, groupName: newName } : item)));
  }

  function removeGroup(groupName: string, count: number) {
    if (!window.confirm(`Remove project "${groupName}" and its ${count} item${count === 1 ? "" : "s"}?`)) return;
    onChange(items.filter((item) => item.groupName !== groupName));
  }

  const ungrouped: Entry[] = items.map((item, index) => ({ item, index })).filter((e) => !e.item.groupName);

  const groupOrder: string[] = [];
  for (const item of items) {
    if (item.groupName && !groupOrder.includes(item.groupName)) groupOrder.push(item.groupName);
  }
  const groups = groupOrder.map((name) => ({
    name,
    entries: items.map((item, index) => ({ item, index })).filter((e) => e.item.groupName === name),
  }));

  const subtotal = calculateSubtotal(items.map((item) => ({ total: calculateLineItemTotal(item) })));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <div className="text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border/40">
          Items: <span className="font-semibold text-foreground">{items.length}</span>
        </div>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-border/80 bg-background px-3 py-8 text-center text-xs text-muted-foreground">
          No line items yet. Click &quot;Add Item&quot; or &quot;Add Project&quot; below to start building your estimate.
        </div>
      )}

      {ungrouped.length > 0 && <ItemRows entries={ungrouped} onUpdate={updateItem} onRemove={removeItem} />}

      {groups.map((group, groupIndex) => {
        const groupTotal = calculateSubtotal(group.entries.map((e) => ({ total: calculateLineItemTotal(e.item) })));
        const isCollapsed = collapsed[groupIndex] ?? false;
        return (
          // Keyed by position, NOT group.name: the name is a live-edited
          // text field, and a key that changes on every keystroke makes
          // React unmount/remount this whole block each time — which is
          // exactly what made the input lose focus after one character.
          // Position stays stable while typing; only add/remove project
          // changes it, which already re-renders this list anyway.
          <div key={groupIndex} className="rounded-lg border border-border/70 bg-muted/20">
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [groupIndex]: !isCollapsed }))}
                aria-label={isCollapsed ? "Expand project" : "Collapse project"}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted/60"
              >
                <ChevronDown className={`size-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
              </button>
              {/* A visible border + pencil icon at rest — a borderless
                  field that only gained a border on hover/focus read as
                  plain text, not something you could click to rename. */}
              <div className="relative min-w-0 flex-1">
                <input
                  value={group.name}
                  onChange={(e) => renameGroup(group.name, e.target.value)}
                  placeholder="Project name"
                  className="w-full min-w-0 rounded-md border border-border/70 bg-background px-1.5 py-1 pr-6 text-xs font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
                <Pencil className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60" />
              </div>
              <span className="shrink-0 text-[10.5px] text-muted-foreground">
                {group.entries.length} item{group.entries.length === 1 ? "" : "s"}
              </span>
              <span className="shrink-0 text-xs font-semibold text-foreground tabular-nums">{formatMoney(groupTotal)}</span>
              <button
                type="button"
                onClick={() => removeGroup(group.name, group.entries.length)}
                aria-label="Remove project"
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {!isCollapsed && (
              <div className="space-y-2 border-t border-border/60 px-2 pb-2 pt-2">
                {group.entries.length > 0 && <ItemRows entries={group.entries} onUpdate={updateItem} onRemove={removeItem} />}
                <button
                  type="button"
                  onClick={() => addItemToGroup(group.name)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
                >
                  <Plus className="size-3" /> Add Item
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Footer Controls & Subtotal Breakdown */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/60">
        <div className="flex items-center gap-2">
          <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700 shadow-2xs transition-all">
            <Plus className="size-3.5 text-white" /> Add Item
          </button>
          <button type="button" onClick={addProject} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors">
            <FolderPlus className="size-3.5" /> Add Project
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 border border-border/50 text-xs">
          <span className="text-muted-foreground">Subtotal:</span>
          <span className="font-semibold text-foreground text-sm">{formatMoney(subtotal)}</span>
        </div>
      </div>
    </div>
  );
}

/** Renders one flat set of line-item rows (mobile cards + desktop
 * table) — shared by the ungrouped list and every project group, so
 * grouping never duplicates this markup. `entries` carry each item's
 * ORIGINAL index into the full flat array, so update/remove always
 * operate on the same single source of truth regardless of which
 * group (or no group) an item is currently rendered under. */
function ItemRows({ entries, onUpdate, onRemove }: { entries: Entry[]; onUpdate: (index: number, changes: Partial<DraftLineItem>) => void; onRemove: (index: number) => void }) {
  return (
    <>
      {/* ---------- MOBILE: one card per line item ----------
          The table below has seven columns and fixed-width inputs
          (`w-20`, `w-24`, `min-w-[140px]`), which together overflow any
          phone and force sideways scrolling. Below `sm` the same fields
          stack full-width; from `sm` up the table renders unchanged.
          Same state, same handlers — only the arrangement differs. */}
      <div className="space-y-2 sm:hidden">
        {entries.map(({ item, index }) => (
          <div key={index} className="space-y-2 rounded-lg border border-border/80 bg-background p-2.5 shadow-2xs">
            <div className="flex items-start gap-2">
              <input
                value={item.name}
                onChange={(e) => onUpdate(index, { name: e.target.value })}
                placeholder="Item name"
                className="w-full min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label="Remove line item"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <input
              value={item.description ?? ""}
              onChange={(e) => onUpdate(index, { description: e.target.value || null })}
              placeholder="Description (optional — shown on the PDF)"
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />

            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Category</span>
                <select
                  value={item.category}
                  onChange={(e) => onUpdate(index, { category: e.target.value as DraftLineItem["category"] })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium capitalize outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Qty</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={item.quantity}
                  onChange={(e) => onUpdate(index, { quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unit</span>
                <select
                  value={item.unit ?? ""}
                  onChange={(e) => onUpdate(index, { unit: (e.target.value || null) as DraftLineItem["unit"] })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
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
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={item.unitPrice}
                  onChange={(e) => onUpdate(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
              </label>
              <div className="text-right">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
                <span className="block py-1.5 text-xs font-semibold text-foreground">{formatMoney(calculateLineItemTotal(item))}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table Container with clear separation */}
      <div className="hidden overflow-x-auto rounded-lg border border-border/80 bg-background shadow-2xs sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 border-b border-border/80">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {entries.map(({ item, index }) => (
              <tr key={index} className="group hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2">
                  <select
                    value={item.category}
                    onChange={(e) => onUpdate(index, { category: e.target.value as DraftLineItem["category"] })}
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
                    onChange={(e) => onUpdate(index, { name: e.target.value })}
                    placeholder="Item name"
                    className="w-full min-w-[140px] rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={item.description ?? ""}
                    onChange={(e) => onUpdate(index, { description: e.target.value || null })}
                    placeholder="Optional — shown on the PDF"
                    className="w-full min-w-[160px] rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.quantity}
                    onChange={(e) => onUpdate(index, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-20 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={item.unit ?? ""}
                    onChange={(e) => onUpdate(index, { unit: (e.target.value || null) as DraftLineItem["unit"] })}
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
                    onChange={(e) => onUpdate(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-24 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </td>
                <td className="px-3 py-2 text-right text-xs font-semibold text-foreground">{formatMoney(calculateLineItemTotal(item))}</td>
                <td className="px-2 py-2 text-right">
                  <button type="button" onClick={() => onRemove(index)} aria-label="Remove line item" className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
