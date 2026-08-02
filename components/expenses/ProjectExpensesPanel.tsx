"use client";

/**
 * Unified cost history for one project (or estimate) — standard
 * expenses, subcontractor payments and agent payments in ONE
 * chronological list, plus record/edit/delete for the expense rows.
 *
 * Owns no arithmetic. The totals tiles come from
 * ExpenseService.getTotalsForProject via useExpenses (the SAME call
 * FinancialEngine makes for `totalExpenses`), and the LIST itself comes
 * from FinancialEngine.getEstimateCostEntries/getProjectCostEntries —
 * so what's listed and what's counted are one computation rendered
 * twice, never two that happen to agree.
 *
 * WHY THE LIST ISN'T SUMMED HERE
 * The three sources use two different cost models on purpose: an
 * expense row IS a cost, while a subcontractor/agent assignment is a
 * COMMITMENT already counted at `max(assigned, paid)` — so its payments
 * are cash movements, not additional cost, and an agent reimbursement
 * merely settles an expense already counted. Summing the rows would
 * double-count exactly the money FinancialEngine's committed-cost model
 * exists to count once. Each row therefore carries a `treatment` and
 * only cost-treated rows feed the totals above (which the engine, not
 * this component, computes).
 *
 * `onChanged` lets the parent page re-read its own financials after any
 * mutation, so profit updates in the same interaction as the expense.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Plus, Pencil, Trash2, Receipt, RotateCcw, HardHat, Briefcase } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExpenseDialog } from "./ExpenseDialog";
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

  async function handleDelete(expense: Expense) {
    if (!window.confirm(`Delete this ${money(expense.amount)} expense?`)) return;
    setActionError(null);
    try {
      await remove(expense.id, "User deleted via UI");
      await loadEntries();
      await onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete this expense.");
    }
  }

  async function handleReimburse(expense: Expense) {
    setActionError(null);
    try {
      await markReimbursed(expense.id);
      await loadEntries();
      await onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not mark this reimbursed.");
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
            // Only expense rows are editable here — a subcontractor or
            // agent payment is owned by its own assignment workflow
            // (with its own outstanding balance), and is shown read-only
            // so this list never becomes a second way to mutate it.
            const expense = entry.source === "expense" ? expenseById.get(entry.id) : undefined;

            return (
              <li key={`${entry.source}-${entry.id}`} className="flex items-start justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">{money(entry.amount)}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${meta.className}`}>
                      <SourceIcon className="size-3" /> {meta.label}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{entry.category}</span>
                    {/* Says plainly why a row that shows money is not
                        additional cost — the alternative is a reader
                        summing this list and disagreeing with profit. */}
                    {entry.treatment === "payment" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title="Cash paid against a commitment already counted as cost when it was assigned.">
                        Paid against commitment
                      </span>
                    )}
                    {entry.treatment === "settlement" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title="Repays someone who fronted an expense that is already counted — not an additional cost.">
                        Settles an expense
                      </span>
                    )}
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
                        aria-label="Mark reimbursed"
                        title="Mark reimbursed"
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => setDialogFor(expense)} aria-label="Edit expense"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(expense)} aria-label="Delete expense"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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