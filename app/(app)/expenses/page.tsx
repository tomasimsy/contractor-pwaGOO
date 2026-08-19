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
import { ReceiptText, Search, Trash2, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
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

const PAGE_SIZE = 30;
type SortKey = "newest" | "oldest";

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
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
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
    const rows = expenses.filter((e) => {
      if (typeFilter !== "all" && e.expenseType !== typeFilter) return false;
      if (!q) return true;
      return [e.vendor, e.description, e.notes].some((v) => v?.toLowerCase().includes(q));
    });
    return [...rows].sort((a, b) =>
      sortKey === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)
    );
  }, [expenses, query, typeFilter, sortKey]);

  // Same shared formula as the project panel — a filtered view must not
  // invent its own way of adding money up. Totals reflect every
  // matching row, not just the current page.
  const totals = useMemo(() => calculateExpenseTotals(filtered), [filtered]);

  // Any filter/sort change invalidates the current page — jump back to
  // 1 rather than risk landing on a now-nonexistent page.
  useEffect(() => {
    setPage(1);
  }, [query, typeFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const pageNumbers = (() => {
    const span = 5;
    let start = Math.max(1, page - Math.floor(span / 2));
    const end = Math.min(totalPages, start + span - 1);
    start = Math.max(1, end - span + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })();

  return (
    <PageContainer>
      <PageHeader title="Expenses" description="Every project cost across the company." />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {/* One tight row at every width — four 2-line stat tiles used to
          be a 2x2 grid on mobile (two full rows) with sm:p-3/text-lg
          sizing meant for desktop, eating a large chunk of a phone
          screen before any actual data appeared. */}
      <dl className="mb-3 grid grid-cols-4 gap-1.5 sm:gap-3">
        {[
          { label: "Total", value: totals.total },
          { label: "Company paid", value: totals.companyPaid },
          { label: "Owed back", value: totals.outstandingReimbursements },
          { label: "Unpaid bills", value: totals.unpaid },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border bg-card p-1.5 sm:rounded-xl sm:p-3">
            <dt className="truncate text-[9px] text-muted-foreground sm:text-xs">{tile.label}</dt>
            <dd className="mt-0.5 truncate text-xs font-semibold text-foreground sm:text-lg">{money(tile.value)}</dd>
          </div>
        ))}
      </dl>

      {/* Search + type + sort share ONE row at every width — was three
          full-width stacked rows on mobile (flex-col), each its own
          line, instead of the compact single-row bar the rest of the
          app's list pages already use (e.g. /estimates). */}
      <div className="mb-4 flex flex-nowrap items-center gap-1.5">
        <div className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-input bg-background px-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="min-w-0 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground sm:text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ExpenseType | "all")}
          className="h-9 shrink-0 rounded-lg border border-input bg-background px-1.5 text-[11px] outline-none focus-visible:border-ring sm:px-3 sm:text-sm"
        >
          <option value="all">All types</option>
          {EXPENSE_TYPES.map((t) => (
            <option key={t} value={t}>{EXPENSE_TYPE_LABEL[t]}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-9 shrink-0 rounded-lg border border-input bg-background px-1.5 text-[11px] outline-none focus-visible:border-ring sm:px-3 sm:text-sm"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
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
          {paged.map((e) => (
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

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 font-medium hover:bg-muted disabled:opacity-40 disabled:hover:bg-background"
            >
              <ChevronLeft className="size-3.5" /> Prev
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-semibold ${
                  n === page ? "bg-primary text-primary-foreground" : "border border-input bg-background hover:bg-muted"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 font-medium hover:bg-muted disabled:opacity-40 disabled:hover:bg-background"
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
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
