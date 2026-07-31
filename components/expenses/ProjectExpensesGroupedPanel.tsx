"use client";

/**
 * Project expenses organized by estimate.
 *
 * Fetches all project expenses, groups by estimate_id, and renders
 * collapsible estimate sections plus a "Project-Level" section for
 * expenses with no estimate. Uses the same shared calculation
 * (calculateExpenseTotals) as the flat panel, so numbers never diverge.
 *
 * The estimate sections themselves are NOT interactive detail views —
 * those live at /estimates/[id]. This panel is about showing cost
 * structure at the project level and drilling down by estimate.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { ChevronDown, ReceiptText, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useServices } from "@/components/providers/ServicesProvider";
import { calculateExpenseTotals } from "@/lib/services/financialCalculations";
import { formatPaymentMethod } from "@/components/payments/paymentMethods";
import { EXPENSE_TYPE_LABEL, PAID_BY_LABEL, type Estimate, type Expense } from "@/lib/services";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const ProjectExpensesGroupedPanel = ({
  companyId,
  projectId,
  estimates,
  canEdit,
  onChanged,
}: {
  companyId: string;
  projectId: string;
  estimates: Estimate[];
  canEdit: boolean;
  onChanged?: () => Promise<void> | void;
}) => {
  const { expenseService } = useServices();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEstimates, setExpandedEstimates] = useState<Set<string>>(new Set());

  // Fetch all project expenses on mount
  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      setExpenses(await expenseService.listForProject(projectId));
    } catch (err) {
      console.error("Failed to load project expenses:", err);
    } finally {
      setLoading(false);
    }
  }, [expenseService, projectId]);

  // Load on mount
  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  // Group expenses by estimateId
  const groups = useMemo(() => {
    const estimateGroups = new Map<string, Expense[]>();
    let projectLevelExpenses: Expense[] = [];

    for (const expense of expenses) {
      if (expense.estimateId) {
        if (!estimateGroups.has(expense.estimateId)) {
          estimateGroups.set(expense.estimateId, []);
        }
        estimateGroups.get(expense.estimateId)!.push(expense);
      } else {
        projectLevelExpenses.push(expense);
      }
    }

    return { estimateGroups, projectLevelExpenses };
  }, [expenses]);

  const totals = useMemo(() => calculateExpenseTotals(expenses), [expenses]);

  const toggleEstimate = (estimateId: string) => {
    const next = new Set(expandedEstimates);
    if (next.has(estimateId)) {
      next.delete(estimateId);
    } else {
      next.add(estimateId);
    }
    setExpandedEstimates(next);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ReceiptText className="size-4 text-muted-foreground" /> Expenses by Estimate
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              /* TODO: open create dialog */
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-3.5" /> Record expense
          </button>
        )}
      </div>

      {/* Project-level summary */}
      <dl className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
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
        <div className="divide-y divide-border">
          {/* Estimate groups */}
          {Array.from(groups.estimateGroups.entries()).map(([estimateId, groupExpenses]) => {
            const estimate = estimates.find((e) => e.id === estimateId);
            const groupTotals = calculateExpenseTotals(groupExpenses);
            const isExpanded = expandedEstimates.has(estimateId);

            return (
              <div key={estimateId}>
                <button
                  type="button"
                  onClick={() => toggleEstimate(estimateId)}
                  className="flex w-full items-center justify-between gap-2 py-3 text-left hover:text-primary"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {estimate?.estimateNumber ?? "Estimate"}
                    </div>
                    <div className="text-xs text-muted-foreground">{groupTotals.total > 0 ? money(groupTotals.total) : "No expenses"}</div>
                  </div>
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isExpanded && (
                  <ul className="divide-y divide-border/50 bg-muted/20 py-2">
                    {groupExpenses.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-2 py-2 px-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{money(e.amount)}</div>
                          <div className="mt-0.5 text-muted-foreground">
                            {EXPENSE_TYPE_LABEL[e.expenseType]}
                            {e.vendor ? ` · ${e.vendor}` : ""}
                            {e.paymentMethod ? ` · ${formatPaymentMethod(e.paymentMethod)}` : ""}
                          </div>
                          {e.description && <div className="mt-0.5 text-muted-foreground">{e.description}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Project-level expenses */}
          {groups.projectLevelExpenses.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => toggleEstimate("_project-level")}
                className="flex w-full items-center justify-between gap-2 py-3 text-left hover:text-primary"
              >
                <div>
                  <div className="font-medium text-foreground">Project-Level Expenses</div>
                  <div className="text-xs text-muted-foreground">
                    {money(calculateExpenseTotals(groups.projectLevelExpenses).total)}
                  </div>
                </div>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                    expandedEstimates.has("_project-level") ? "rotate-180" : ""
                  }`}
                />
              </button>

              {expandedEstimates.has("_project-level") && (
                <ul className="divide-y divide-border/50 bg-muted/20 py-2">
                  {groups.projectLevelExpenses.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2 py-2 px-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{money(e.amount)}</div>
                        <div className="mt-0.5 text-muted-foreground">
                          {EXPENSE_TYPE_LABEL[e.expenseType]}
                          {e.vendor ? ` · ${e.vendor}` : ""}
                          {e.paymentMethod ? ` · ${formatPaymentMethod(e.paymentMethod)}` : ""}
                        </div>
                        {e.description && <div className="mt-0.5 text-muted-foreground">{e.description}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
