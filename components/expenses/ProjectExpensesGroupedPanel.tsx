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
      <ReceiptText className="size-4 text-muted-foreground" />
      Expenses by Estimate
    </h2>

    {canEdit && (
      <button
        type="button"
        onClick={() => {
          /* TODO: open create dialog */
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="size-3.5" />
        Record Expense
      </button>
    )}
  </div>

  {/* Summary */}
  <dl className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-4">
    <div>
      <dt className="text-xs text-muted-foreground">Total Expenses</dt>
      <dd className="font-semibold text-foreground">{money(totals.total)}</dd>
    </div>

    <div>
      <dt className="text-xs text-muted-foreground">Company Paid</dt>
      <dd className="text-foreground">{money(totals.companyPaid)}</dd>
    </div>

    <div>
      <dt className="text-xs text-muted-foreground">Owed Back</dt>
      <dd
        className={
          totals.outstandingReimbursements > 0
            ? "font-medium text-warning-foreground"
            : "text-foreground"
        }
      >
        {money(totals.outstandingReimbursements)}
      </dd>
    </div>

    <div>
      <dt className="text-xs text-muted-foreground">Unpaid Bills</dt>
      <dd
        className={
          totals.unpaid > 0
            ? "font-medium text-warning-foreground"
            : "text-foreground"
        }
      >
        {money(totals.unpaid)}
      </dd>
    </div>
  </dl>

  {loading ? (
    <p className="py-4 text-xs text-muted-foreground">
      Loading expenses…
    </p>
  ) : expenses.length === 0 ? (
    <EmptyState
      title="No expenses recorded"
      description="Materials, labor, permits and other project costs will appear here."
    />
  ) : (
    <div className="overflow-hidden rounded-lg border border-border text-xs">
      {/* Header */}
      <div className="grid grid-cols-[1fr_120px_120px] bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div>Estimate</div>
        <div className="text-right">Expenses</div>
        <div className="text-right">Expand</div>
      </div>

      {/* Estimate Groups */}
      {Array.from(groups.estimateGroups.entries()).map(
        ([estimateId, groupExpenses], index) => {
          const estimate = estimates.find((e) => e.id === estimateId);
          const groupTotals = calculateExpenseTotals(groupExpenses);
          const isExpanded = expandedEstimates.has(estimateId);

          return (
            <div
              key={estimateId}
              className={index !== 0 ? "border-t border-border" : ""}
            >
              <button
                type="button"
                onClick={() => toggleEstimate(estimateId)}
                className="grid w-full grid-cols-[1fr_120px_120px] items-center px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div>
                  <div className="font-medium text-foreground capitalize">
                    {estimate?.title || "Untitled Estimate"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {estimate?.estimateNumber ?? "Estimate"}
                  </div>
                </div>

                <div className="text-right font-medium text-foreground">
                  {money(groupTotals.total)}
                </div>

                <div className="flex justify-end">
                  <ChevronDown
                    className={`size-4 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border bg-muted/20">
                  <div className="grid grid-cols-[120px_1fr_120px_140px] bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <div>Amount</div>
                    <div>Description</div>
                    <div>Vendor</div>
                    <div>Payment</div>
                  </div>

                  {groupExpenses.map((e, i) => (
                    <div
                      key={e.id}
                      className={`grid grid-cols-[120px_1fr_120px_140px] items-start px-4 py-2 ${
                        i !== 0 ? "border-t border-border/50" : ""
                      }`}
                    >
                      <div className="font-medium text-foreground">
                        {money(e.amount)}
                      </div>

                      <div>
                        <div className="text-foreground">
                          {EXPENSE_TYPE_LABEL[e.expenseType]}
                        </div>

                        {e.description && (
                          <div className="text-muted-foreground">
                            {e.description}
                          </div>
                        )}
                      </div>

                      <div className="text-muted-foreground">
                        {e.vendor || "—"}
                      </div>

                      <div className="text-muted-foreground">
                        {e.paymentMethod
                          ? formatPaymentMethod(e.paymentMethod)
                          : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }
      )}

      {/* Project Level */}
      {groups.projectLevelExpenses.length > 0 && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => toggleEstimate("_project-level")}
            className="grid w-full grid-cols-[1fr_120px_120px] items-center px-4 py-3 text-left transition-colors hover:bg-muted/50"
          >
            <div className="font-medium text-foreground">
              Project-Level Expenses
            </div>

            <div className="text-right font-medium">
              {money(calculateExpenseTotals(groups.projectLevelExpenses).total)}
            </div>

            <div className="flex justify-end">
              <ChevronDown
                className={`size-4 transition-transform ${
                  expandedEstimates.has("_project-level")
                    ? "rotate-180"
                    : ""
                }`}
              />
            </div>
          </button>

          {expandedEstimates.has("_project-level") && (
            <div className="border-t border-border bg-muted/20">
              <div className="grid grid-cols-[120px_1fr_120px_140px] bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <div>Amount</div>
                <div>Description</div>
                <div>Vendor</div>
                <div>Payment</div>
              </div>

              {groups.projectLevelExpenses.map((e, i) => (
                <div
                  key={e.id}
                  className={`grid grid-cols-[120px_1fr_120px_140px] items-start px-4 py-2 ${
                    i !== 0 ? "border-t border-border/50" : ""
                  }`}
                >
                  <div className="font-medium text-foreground">
                    {money(e.amount)}
                  </div>

                  <div>
                    <div className="text-foreground">
                      {EXPENSE_TYPE_LABEL[e.expenseType]}
                    </div>

                    {e.description && (
                      <div className="text-muted-foreground">
                        {e.description}
                      </div>
                    )}
                  </div>

                  <div className="text-muted-foreground">
                    {e.vendor || "—"}
                  </div>

                  <div className="text-muted-foreground">
                    {e.paymentMethod
                      ? formatPaymentMethod(e.paymentMethod)
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )}
</section>
  );
};
