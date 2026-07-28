"use client";

/**
 * Expense history + record/edit/delete for one project (or estimate).
 *
 * Owns no arithmetic. Every figure shown comes from
 * ExpenseService.getTotalsForProject via useExpenses — the SAME call
 * FinancialEngine makes for `totalExpenses` — so the number on this
 * panel and the number in the profit calculation are not two
 * computations that agree, they are one computation rendered twice.
 *
 * `onChanged` lets the parent page re-read its own financials after any
 * mutation, so profit updates in the same interaction as the expense.
 */
import { useState } from "react";
import { Plus, Pencil, Trash2, Receipt, RotateCcw } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExpenseDialog } from "./ExpenseDialog";
import { useExpenses } from "@/lib/hooks/useExpenses";
import { formatPaymentMethod } from "@/components/payments/paymentMethods";
import { EXPENSE_TYPE_LABEL, PAID_BY_LABEL, type Expense } from "@/lib/services";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ProjectExpensesPanel({
  companyId,
  projectId,
  estimateId,
  canEdit,
  onChanged,
}: {
  companyId: string;
  projectId: string;
  /** When rendered on an Estimate page, new expenses are attached to
   * that estimate as well as the project. */
  estimateId?: string | null;
  canEdit: boolean;
  onChanged?: () => Promise<void> | void;
}) {
  const { expenses, totals, loading, error, create, update, remove, markReimbursed } = useExpenses(companyId, projectId);
  const [dialogFor, setDialogFor] = useState<Expense | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function afterChange(ok: boolean) {
    if (ok) {
      setDialogFor(null);
      await onChanged?.();
    }
    return ok;
  }

  async function handleDelete(expense: Expense) {
    const reason = window.prompt(`Why are you deleting this ${money(expense.amount)} expense?`);
    if (!reason) return;
    setActionError(null);
    try {
      await remove(expense.id, reason);
      await onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete this expense.");
    }
  }

  async function handleReimburse(expense: Expense) {
    setActionError(null);
    try {
      await markReimbursed(expense.id);
      await onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not mark this reimbursed.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Receipt className="size-4 text-muted-foreground" /> Expenses
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

      {loading ? (
        <p className="py-4 text-sm text-muted-foreground">Loading expenses…</p>
      ) : expenses.length === 0 ? (
        <EmptyState title="No expenses recorded" description="Materials, labor, permits and other project costs will appear here." />
      ) : (
        <ul className="divide-y divide-border">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">{money(e.amount)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {EXPENSE_TYPE_LABEL[e.expenseType]}
                  </span>
                  {e.reimbursable && e.reimbursementStatus === "pending" && (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-foreground">
                      Owed to {PAID_BY_LABEL[e.paidByType].toLowerCase()}
                    </span>
                  )}
                  {e.reimbursementStatus === "reimbursed" && (
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">Reimbursed</span>
                  )}
                  {!e.isPaid && (
                    <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">Unpaid</span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {e.expenseDate}
                  {e.vendor ? ` · ${e.vendor}` : ""}
                  {e.paymentMethod ? ` · ${formatPaymentMethod(e.paymentMethod)}` : ""}
                  {e.paidByType !== "company" ? ` · fronted by ${PAID_BY_LABEL[e.paidByType].toLowerCase()}` : ""}
                </div>
                {e.description && <div className="mt-0.5 text-xs text-muted-foreground">{e.description}</div>}
              </div>

              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  {e.reimbursable && e.reimbursementStatus === "pending" && (
                    <button
                      type="button"
                      onClick={() => handleReimburse(e)}
                      aria-label="Mark reimbursed"
                      title="Mark reimbursed"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => setDialogFor(e)} aria-label="Edit expense"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => handleDelete(e)} aria-label="Delete expense"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
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
