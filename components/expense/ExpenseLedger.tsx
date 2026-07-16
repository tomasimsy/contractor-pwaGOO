"use client";

import { useState } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { LedgerEntry } from "@/lib/types";

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
  maxHeight,
}: {
  entries: LedgerEntry[];
  onDelete?: (entry: LedgerEntry) => void;
  /** Renders entries in "archived" mode with a Restore button instead
   * of Delete — same list UI, no separate component to keep in sync. */
  onRestore?: (entry: LedgerEntry) => void;
  emptyLabel?: string;
  emptyHint?: string;
  /** When set, the row list scrolls internally (e.g. "420px") instead of
   * growing the page — the header row stays pinned via sticky, so long
   * ledgers don't push everything else below the fold. */
  maxHeight?: string;
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="text-sm text-gray-500">{emptyLabel}</div>
        <div className="text-[13px] text-gray-400 mt-0.5">{emptyHint}</div>
      </div>
    );
  }

  return (
    <div className={maxHeight ? "overflow-y-auto -mx-1 px-1" : ""} style={maxHeight ? { maxHeight } : undefined}>
      <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-1 pb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 border-b border-gray-100 sticky top-0 bg-white z-10">
        <span>Payee</span>
        <span>Category</span>
        <span>Date</span>
        <span className="text-right">Amount</span>
      </div>
      <div className="divide-y divide-gray-100">
        {entries.map((entry) => {
          const isPendingDelete = pendingDeleteId === entry.id;

          return (
            <div
              key={`${entry.source}-${entry.id}`}
              className={`group grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto] items-center gap-2 sm:gap-4 px-1 py-2 ${onRestore ? "opacity-60" : ""}`}
            >
              <div className="min-w-0 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate text-[13px] text-gray-900">{entry.payeeLabel}</span>
                  {entry.changeOrderLabel && (
                    <span className="shrink-0 text-[11px] text-gray-400">{entry.changeOrderLabel}</span>
                  )}
                </div>
                <div className="text-[13px] text-gray-400 sm:hidden">
                  {entry.categoryLabel} · {formatDate(entry.date)}
                </div>
              </div>

              <span className="hidden sm:block text-[13px] text-gray-500 whitespace-nowrap">{entry.categoryLabel}</span>
              <span className="hidden sm:block text-[13px] text-gray-400 whitespace-nowrap">{formatDate(entry.date)}</span>

              <div className="flex items-center justify-end gap-3">
                <span className="text-[13px] tabular-nums text-gray-900 whitespace-nowrap">
                  {formatCurrency(entry.amount)}
                </span>

                {onRestore ? (
                  <button
                    type="button"
                    onClick={() => onRestore(entry)}
                    className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
                    aria-label="Restore entry"
                  >
                    <RotateCcw size={13} />
                  </button>
                ) : isPendingDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDelete?.(entry);
                      setPendingDeleteId(null);
                    }}
                    className="shrink-0 text-[12px] font-medium text-white bg-gray-900 rounded px-2 py-1"
                  >
                    Confirm
                  </button>
                ) : (
                  onDelete && (
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(entry.id)}
                      className="shrink-0 text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Delete entry"
                    >
                      <Trash2 size={13} />
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
