"use client";

/**
 * Company-wide expense register.
 *
 * Summary figures come from the SAME calculateExpenseTotals the project
 * panel and FinancialEngine use — the filtered set changes, the formula
 * does not. Recording happens on a project (an expense with no project
 * isn't a project cost), so this page is a register and a drill-down,
 * not a second create surface.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ReceiptText, Search, Trash2, Image as ImageIcon } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { usePermission } from "@/lib/hooks/usePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatPaymentMethod } from "@/components/payments/paymentMethods";
import { calculateExpenseTotals } from "@/lib/services/financialCalculations";
import { EXPENSE_TYPES, EXPENSE_TYPE_LABEL, PAID_BY_LABEL, type Expense, type ExpenseType } from "@/lib/services";
import type { Estimate } from "@/lib/services/estimateService";
import type { ExpenseReceipt } from "@/lib/services/expenseReceiptService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function ExpensesContent() {
  const { expenseService, estimateService, expenseReceiptService } = useServices();
  const { profile } = useAuth();
  const canDelete = usePermission("expense", "delete");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [estimatesById, setEstimatesById] = useState<Record<string, Estimate>>({});
  /** expenseId -> its receipts — same bulk read ProjectExpensesPanel
   * uses, so "does this have a photo" shows up here too. */
  const [receiptsByExpense, setReceiptsByExpense] = useState<Record<string, ExpenseReceipt[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ExpenseType | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const companyId = profile?.companyId ?? null;
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [expenseList, estimateList] = await Promise.all([
        expenseService.listForCompany(companyId),
        estimateService.list({ companyId }),
      ]);
      setExpenses(expenseList);
      setEstimatesById(Object.fromEntries(estimateList.map((e) => [e.id, e])));
      // Best-effort — a failed lookup just means no photo indicator
      // shows, never blocks the register from loading.
      expenseReceiptService
        .listForExpenses(expenseList.map((e) => e.id))
        .then(setReceiptsByExpense)
        .catch(() => setReceiptsByExpense({}));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }, [expenseService, estimateService, expenseReceiptService, companyId]);

  async function handleDelete(expense: Expense) {
    const reason = window.prompt("Why are you deleting this expense?");
    if (!reason) return;
    setDeletingId(expense.id);
    setError(null);
    try {
      await expenseService.softDelete(expense.id, reason);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete expense.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (typeFilter !== "all" && e.expenseType !== typeFilter) return false;
      if (!q) return true;
      return [e.vendor, e.description, e.notes].some((v) => v?.toLowerCase().includes(q));
    });
  }, [expenses, query, typeFilter]);

  // Same shared formula as the project panel — a filtered view must not
  // invent its own way of adding money up.
  const totals = useMemo(() => calculateExpenseTotals(filtered), [filtered]);

  return (
    <PageContainer>
      <PageHeader title="Expenses" description="Every project cost across the company." />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: totals.total },
          { label: "Company paid", value: totals.companyPaid },
          { label: "Owed back", value: totals.outstandingReimbursements },
          { label: "Unpaid bills", value: totals.unpaid },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{tile.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-foreground">{money(tile.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendor, description or notes…"
            className="min-h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ExpenseType | "all")}
          className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring"
        >
          <option value="all">All types</option>
          {EXPENSE_TYPES.map((t) => (
            <option key={t} value={t}>{EXPENSE_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading expenses…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={expenses.length === 0 ? "No expenses yet" : "Nothing matches that filter"}
          description={
            expenses.length === 0
              ? "Record costs from a project or estimate and they'll appear here."
              : "Try a different search or type."
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 p-3 text-sm">
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
                  {!e.isPaid && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">Unpaid</span>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {e.expenseDate}
                  {e.vendor ? ` · ${e.vendor}` : ""}
                  {e.paymentMethod ? ` · ${formatPaymentMethod(e.paymentMethod)}` : ""}
                </div>
                {e.description && <div className="mt-0.5 text-xs text-muted-foreground">{e.description}</div>}
                {e.estimateId && estimatesById[e.estimateId] && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Estimate: {estimatesById[e.estimateId].estimateNumber ?? "—"}
                    {estimatesById[e.estimateId].title ? ` · ${estimatesById[e.estimateId].title}` : ""}
                  </div>
                )}
                {(receiptsByExpense[e.id]?.length ?? 0) > 0 ? (
                  <a
                    href={receiptsByExpense[e.id][0].receiptFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <ImageIcon className="size-3.5" /> View receipt
                  </a>
                ) : (
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/60">
                    <ImageIcon className="size-3.5" /> No receipt
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {e.projectId && (
                  <Link href={`/projects/${e.projectId}`} className="text-xs font-medium text-primary hover:underline">
                    Project →
                  </Link>
                )}
                {canDelete && (
                  <button
                    type="button"
                    disabled={deletingId === e.id}
                    onClick={() => handleDelete(e)}
                    aria-label="Delete expense"
                    className="rounded-md p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

export default function ExpensesPage() {
  return (
    <RequirePermission resource="expense">
      <ExpensesContent />
    </RequirePermission>
  );
}
