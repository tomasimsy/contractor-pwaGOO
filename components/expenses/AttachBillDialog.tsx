"use client";

/**
 * Attach a vendor invoice to an expense that ALREADY EXISTS.
 *
 * ============================================================
 * THE WHOLE POINT: NO SECOND EXPENSE
 * ============================================================
 * A subcontractor is owed $4,000 and that obligation is already one
 * `estimate_expenses` row. If they later send an actual invoice, the
 * money has not changed — only our paperwork has. So this writes
 * `dueDate` and `billNumber` onto THAT ROW via ExpenseService.update.
 *
 * It never calls create(). There is no bill table, no link table, and no
 * second $4,000 anywhere, which is what makes double-counting
 * structurally impossible rather than merely avoided by discipline.
 *
 * Because "a bill is an expense with a due date", setting the due date
 * is exactly what promotes the existing payable into the Bills list —
 * where it can be paid through the same path as everything else.
 *
 * Detaching clears both fields: the cost stays, it simply stops being
 * tracked as a vendor bill.
 */
import { useState } from "react";
import { X, FileText } from "lucide-react";
import { useServices } from "@/components/providers/ServicesProvider";
import type { Expense } from "@/lib/services/expenseService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const FIELD =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const LABEL = "mb-1 block text-xs font-semibold text-foreground";

export function AttachBillDialog({
  expense,
  onClose,
  onSaved,
}: {
  expense: Expense;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
}) {
  const { expenseService } = useServices();
  const isAttached = !!expense.dueDate;

  const [dueDate, setDueDate] = useState(expense.dueDate ?? new Date().toISOString().slice(0, 10));
  const [billNumber, setBillNumber] = useState(expense.billNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(detach = false) {
    setSaving(true);
    setError(null);
    try {
      // UPDATE, never create. The amount is deliberately untouched — the
      // obligation was already recorded and must not be restated.
      await expenseService.update(expense.id, {
        dueDate: detach ? null : dueDate,
        billNumber: detach ? null : billNumber.trim() || null,
      });
      await onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this bill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="w-full overflow-hidden rounded-t-xl border border-border bg-card shadow-lg sm:max-w-sm sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
              <FileText className="size-4 text-primary" />
              {isAttached ? "Edit bill details" : "Attach invoice"}
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {expense.vendor || "Existing expense"} · {money(expense.amount)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3 p-3">
          {error && (
            <div role="alert" className="rounded-lg bg-danger/10 px-2.5 py-2 text-xs font-medium text-danger">
              {error}
            </div>
          )}

          <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
            This updates the existing {money(expense.amount)} expense — no second cost is created.
          </p>

          <label className="block">
            <span className={LABEL}>Due date</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD} />
          </label>

          <label className="block">
            <span className={LABEL}>Invoice / bill #</span>
            <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)}
              placeholder="Optional" className={FIELD} />
          </label>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
          {isAttached ? (
            <button type="button" onClick={() => save(true)} disabled={saving}
              className="text-xs font-medium text-danger hover:underline disabled:opacity-60">
              Detach bill
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              Cancel
            </button>
            <button type="button" onClick={() => save(false)} disabled={saving}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Saving…" : isAttached ? "Save" : "Attach"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
