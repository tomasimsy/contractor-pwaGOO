"use client";

import { useState } from "react";
import { Trash2, Wrench, HardHat, Users, Percent, Receipt, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { LedgerEntry } from "@/lib/types";

const CATEGORY_ICON: Record<string, typeof Wrench> = {
  Material: HardHat,
  Labor: Wrench,
  Subcontractor: Users,
  "Agent Commission": Percent,
  Other: Receipt,
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const date = iso.length <= 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ExpenseLedger({
  entries,
  onDelete,
  onRestore,
  emptyLabel = "No expenses logged yet",
  emptyHint = 'Tap "Add Expense" to log the first one.',
}: {
  entries: LedgerEntry[];
  onDelete?: (entry: LedgerEntry) => void;
  /** Renders entries in "archived" mode with a Restore button instead
   * of Delete — same list UI, no separate component to keep in sync. */
  onRestore?: (entry: LedgerEntry) => void;
  emptyLabel?: string;
  emptyHint?: string;
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-6 text-center">
        <div className="text-sm font-semibold text-slate-500">{emptyLabel}</div>
        <div className="text-xs text-slate-400 mt-0.5">{emptyHint}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      {entries.map((entry) => {
        const Icon = CATEGORY_ICON[entry.categoryLabel] ?? Receipt;
        const isPendingDelete = pendingDeleteId === entry.id;

        return (
          <div
            key={`${entry.source}-${entry.id}`}
            className={`flex items-center gap-3 p-3 ${onRestore ? "opacity-70" : ""}`}
          >
            <div className="shrink-0 w-9 h-9 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500">
              <Icon size={15} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-bold text-slate-800">{entry.payeeLabel}</span>
                <span className="text-sm font-mono font-bold text-slate-800 shrink-0">
                  {formatCurrency(entry.amount)}
                </span>
              </div>
              <div className="text-xs text-slate-400 truncate">
                {entry.categoryLabel} · {formatDate(entry.date)}
                {entry.paymentMethod ? ` · ${entry.paymentMethod.replace("_", " ")}` : ""}
              </div>
            </div>

            {onRestore ? (
              <button
                type="button"
                onClick={() => onRestore(entry)}
                className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-2"
              >
                <RotateCcw size={13} />
                Restore
              </button>
            ) : isPendingDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete?.(entry);
                  setPendingDeleteId(null);
                }}
                className="shrink-0 text-[11px] font-bold text-white bg-rose-600 rounded-lg px-2.5 py-2"
              >
                Confirm
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPendingDeleteId(entry.id)}
                className="shrink-0 p-2 text-slate-300 hover:text-rose-600"
                aria-label="Delete entry"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}