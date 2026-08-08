"use client";

/**
 * Unified cost history for one project (or estimate) — every cost in
 * ONE chronological list, with record/edit/delete on all of them.
 *
 * ONE PAYMENT = ONE EXPENSE RECORD. Materials, labor, a subcontractor
 * payment and an agent commission are all rows in `estimate_expenses`,
 * distinguished by `expenseType` and labeled here by `source`. That is
 * why EVERY row in this list is editable and deletable: they are the
 * same kind of record, so treating a subcontractor payment as
 * read-only would leave real money with no way to correct it.
 *
 * (This panel previously showed subcontractor/agent rows read-only,
 * back when they were separate payment tables owned by their own
 * assignment workflows. They no longer are, but the guard survived the
 * model change — so those rows silently lost their action buttons.)
 *
 * Owns no arithmetic. The totals tiles come from
 * ExpenseService.getTotalsForProject via useExpenses (the SAME call
 * FinancialEngine makes for `totalExpenses`), and the LIST itself comes
 * from FinancialEngine.getEstimateCostEntries/getProjectCostEntries —
 * so what's listed and what's counted are one computation rendered
 * twice, never two that happen to agree. Deleting goes through
 * useExpenses.remove -> ExpenseService.softDelete: a soft delete with a
 * required reason, the same path every other financial record uses.
 *
 * `onChanged` lets the parent page re-read its own financials after any
 * mutation, so profit updates in the same interaction as the expense.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Plus, Pencil, Trash2, Receipt, RotateCcw, HardHat, Briefcase, FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExpenseDialog } from "./ExpenseDialog";
import { AttachBillDialog } from "./AttachBillDialog";
import { useExpenses } from "@/lib/hooks/useExpenses";
import { useServices } from "@/components/providers/ServicesProvider";
import { formatPaymentMethod } from "@/components/payments/paymentMethods";
import { PAID_BY_LABEL, type Expense, type CostEntry, type CostEntrySource } from "@/lib/services";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Source badge — makes "which domain model is this row?" unmissable,
 * since the three are deliberately NOT the same kind of record. */
const SOURCE_META: Record<CostEntrySource, { label: string; icon: typeof Receipt; className: string }> = {
  expense: { label: "Expense", icon: Receipt, className: "bg-muted text-muted-foreground" },
  subcontractor: { label: "Subcontractor", icon: HardHat, className: "bg-primary/10 text-primary" },
  agent: { label: "Agent", icon: Briefcase, className: "bg-success/15 text-success" },
};

export interface ProjectExpensesPanelRef {
  openNewExpense: () => void;
  /** Re-reads both the expense rows and the unified projection — used
   * by parents that mutate subcontractor/agent payments elsewhere on
   * the page and need this list to pick them up. */
  refresh: () => Promise<void>;
}

export const ProjectExpensesPanel = forwardRef<ProjectExpensesPanelRef, {
  companyId: string;
  projectId: string;
  estimateId?: string | null;
  canEdit: boolean;
  onChanged?: () => Promise<void> | void;
}>(function ProjectExpensesPanel({
  companyId,
  projectId,
  estimateId,
  canEdit,
  onChanged,
}, ref) {{
  const { expenses, totals, loading, error, create, update, remove, markReimbursed, refresh } = useExpenses(companyId, projectId, estimateId);
  const { financialEngine } = useServices();
  const [dialogFor, setDialogFor] = useState<Expense | "new" | null>(null);
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);

  /** The unified list — expenses + subcontractor payments + agent
   * payments, assembled by FinancialEngine so this panel and the profit
   * figures describe the same records. */
  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    try {
      setEntries(
        estimateId
          ? await financialEngine.getEstimateCostEntries(estimateId)
          : await financialEngine.getProjectCostEntries(projectId)
      );
    } catch {
      // A failed projection must not blank the panel — the expense
      // rows below still render from useExpenses.
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, [financialEngine, estimateId, projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEntries();
  }, [loadEntries]);

  useImperativeHandle(ref, () => ({
    openNewExpense() {
      setDialogFor("new");
    },
    async refresh() {
      await refresh();
      await loadEntries();
    },
  }));

  const [actionError, setActionError] = useState<string | null>(null);
  /** Expense whose vendor invoice is being attached/edited. */
  const [billFor, setBillFor] = useState<Expense | null>(null);
  /** Which row is mid-mutation — disables its buttons so a double
   * click can't fire two deletes, and shows the row as busy. Same
   * pattern as the payments panel. */
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Expense rows keep their edit/delete/reimburse actions, so the
   * projection is joined back to the real Expense objects by id. */
  const expenseById = new Map(expenses.map((e) => [e.id, e] as const));

  async function afterChange(ok: boolean) {
    if (ok) {
      setDialogFor(null);
      await loadEntries();
      await onChanged?.();
    }
    return ok;
  }

  async function handleDelete(expense: Expense, sourceLabel: string) {
    // Names what is actually being removed — "Delete this $2,000
    // Subcontractor cost?" rather than a generic "expense", since a
    // subcontractor payment and a bag of nails now look alike here.
    if (!window.confirm(`Delete this ${money(expense.amount)} ${sourceLabel.toLowerCase()} cost? This can be restored later.`)) return;
    setActionError(null);
    setBusyId(expense.id);
    try {
      // Soft delete with a reason, via the shared service — the same
      // path used everywhere else. `remove` re-reads both the rows and
      // the TOTALS, so the tiles above update from the service rather
      // than from any arithmetic done here.
      await remove(expense.id, "User deleted via UI");
      // The grouped/unified list…
      await loadEntries();
      // …and the parent's own financials (project + dashboard
      // summaries), so profit moves in the same interaction.
      await onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete this cost.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReimburse(expense: Expense) {
    setActionError(null);
    setBusyId(expense.id);
    try {
      await markReimbursed(expense.id);
      await loadEntries();
      await onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not mark this reimbursed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Receipt className="size-4 text-muted-foreground" /> Costs
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setDialogFor("new")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-3.5" /> Record expense
          </button>
        )}
      </div>

      {(error || actionError) && (
        <div className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error || actionError}</div>
      )}

      {/* Totals first — this is what the page is actually for. */}
      <dl className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Total expenses</dt>
          <dd className="font-semibold text-foreground">{money(totals.total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Company paid</dt>
          <dd className="text-foreground">{money(totals.companyPaid)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Owed back</dt>
          <dd className={totals.outstandingReimbursements > 0 ? "font-medium text-warning-foreground" : "text-foreground"}>
            {money(totals.outstandingReimbursements)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Unpaid bills</dt>
          <dd className={totals.unpaid > 0 ? "font-medium text-warning-foreground" : "text-foreground"}>
            {money(totals.unpaid)}
          </dd>
        </div>
      </dl>

      {loading || entriesLoading ? (
        <p className="py-4 text-sm text-muted-foreground">Loading costs…</p>
      ) : entries.length === 0 ? (
        <EmptyState title="No costs recorded" description="Expenses, subcontractor payments and agent payments for this job will appear here." />
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => {
            const meta = SOURCE_META[entry.source];
            const SourceIcon = meta.icon;
            // Every entry is an expense row — including subcontractor
            // and agent ones — so every entry resolves to a real
            // Expense and gets the same actions. Guarding on
            // `source === "expense"` here is what used to hide
            // edit/delete from subcontractor and agent costs.
            const expense = expenseById.get(entry.id);

            return (
              <li
                key={`${entry.source}-${entry.id}`}
                className={`flex items-start justify-between gap-2 py-2.5 text-sm ${busyId === entry.id ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">{money(entry.amount)}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${meta.className}`}>
                      <SourceIcon className="size-3" /> {meta.label}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{entry.category}</span>
                    {expense?.reimbursable && expense.reimbursementStatus === "pending" && (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-foreground">
                        Owed to {PAID_BY_LABEL[expense.paidByType].toLowerCase()}
                      </span>
                    )}
                    {expense?.reimbursementStatus === "reimbursed" && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">Reimbursed</span>
                    )}
                    {expense && !expense.isPaid && (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">Unpaid</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {entry.date}
                    {entry.label ? ` · ${entry.label}` : ""}
                    {expense?.paymentMethod ? ` · ${formatPaymentMethod(expense.paymentMethod)}` : ""}
                    {expense && expense.paidByType !== "company" ? ` · fronted by ${PAID_BY_LABEL[expense.paidByType].toLowerCase()}` : ""}
                  </div>
                  {entry.description && <div className="mt-0.5 text-xs text-muted-foreground">{entry.description}</div>}
                </div>

                {canEdit && expense && (
                  <div className="flex shrink-0 gap-1">
                    {expense.reimbursable && expense.reimbursementStatus === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleReimburse(expense)}
                        disabled={busyId === expense.id}
                        aria-label="Mark reimbursed"
                        title="Mark reimbursed"
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => setDialogFor(expense)}
                      disabled={busyId === expense.id}
                      aria-label={`Edit ${meta.label} cost`} title={`Edit ${meta.label} cost`}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                      <Pencil className="size-3.5" />
                    </button>
                    {/* ADDITIVE — attaching a vendor invoice UPDATES this
                        expense's due_date/bill_number. It never creates a
                        second cost. See AttachBillDialog. */}
                    <button type="button" onClick={() => setBillFor(expense)}
                      disabled={busyId === expense.id}
                      aria-label={expense.dueDate ? `Edit bill on ${meta.label} cost` : `Attach invoice to ${meta.label} cost`}
                      title={expense.dueDate ? "Bill attached — edit" : "Attach vendor invoice"}
                      className={`rounded-lg p-1.5 disabled:opacity-50 ${
                        expense.dueDate
                          ? "text-primary hover:bg-primary/10"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}>
                      <FileText className="size-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(expense, meta.label)}
                      disabled={busyId === expense.id}
                      aria-label={`Delete ${meta.label} cost`} title={`Delete ${meta.label} cost`}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-50">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {billFor && (

        <AttachBillDialog

          expense={billFor}

          onClose={() => setBillFor(null)}

          onSaved={async () => { await loadEntries(); await onChanged?.(); }}

        />

      )}


      {dialogFor && (
        <ExpenseDialog
          companyId={companyId}
          projectId={projectId}
          estimateId={estimateId}
          expense={dialogFor === "new" ? null : dialogFor}
          onClose={() => setDialogFor(null)}
          onSubmit={async (input) =>
            afterChange(
              dialogFor === "new" ? await create(input) : await update(dialogFor.id, input)
            )
          }
        />
      )}
    </section>
  );
}
});