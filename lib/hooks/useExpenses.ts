"use client";

/**
 * Orchestration only. Who paid, who was paid, and whether it's
 * reimbursable are not branches this hook decides financially — they are
 * fields on the create() call. ExpenseService owns what they mean, and
 * FinancialEngine costs from those rows. This hook collects input,
 * refreshes, and surfaces errors.
 *
 * `totals` comes back from ExpenseService.getTotalsForProject rather
 * than being reduced here, so a page showing "total expenses" and
 * FinancialEngine showing "total expenses" are literally the same
 * calculation.
 */
import { useCallback, useState } from "react";
// The app has TWO service contexts: lib/services-context.tsx (the
// original, still used by a handful of unmounted legacy components) and
// components/providers/ServicesProvider (the one app/layout.tsx
// actually renders, and the only one holding the real Supabase-backed
// services). This hook must read the live one — pointing it at the
// legacy context threw "useServices() called outside <ServicesProvider>"
// the moment it was mounted on a real page.
import { useServices } from "@/components/providers/ServicesProvider";
import { useRefreshableResource } from "./useAsyncResource";
import { calculateExpenseTotals } from "../services/financialCalculations";
import type { Expense, ExpenseCreateInput, ExpenseUpdateInput, ExpenseTotals } from "../services";

const EMPTY_TOTALS: ExpenseTotals = {
  total: 0,
  byType: {
    materials: 0, labor: 0, subcontractor: 0, agent_commission: 0,
    permit: 0, equipment: 0, reimbursement: 0, miscellaneous: 0,
  },
  companyPaid: 0,
  outstandingReimbursements: 0,
  unpaid: 0,
};

export function useExpenses(companyId: string, projectId: string, estimateId?: string | null) {
  const { expenseService } = useServices();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totals, setTotals] = useState<ExpenseTotals>(EMPTY_TOTALS);

  // When estimateId is provided, fetch only that estimate's expenses.
  // Otherwise fetch all project expenses.
  const { loading, error, setError, refresh } = useRefreshableResource(async () => {
    const rows = estimateId
      ? await expenseService.listForEstimate(estimateId)
      : await expenseService.listForProject(projectId);

    const sums = estimateId
      ? calculateExpenseTotals(rows)
      : await expenseService.getTotalsForProject(projectId);

    setExpenses(rows);
    setTotals(sums);
  }, [expenseService, projectId, estimateId]);

  const create = useCallback(
    async (input: Omit<ExpenseCreateInput, "companyId" | "projectId">) => {
      setError(null);
      try {
        await expenseService.create({ companyId, projectId, ...input });
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record expense.");
        return false;
      }
    },
    [expenseService, companyId, projectId, refresh, setError]
  );

  const update = useCallback(
    async (expenseId: string, changes: ExpenseUpdateInput) => {
      setError(null);
      try {
        await expenseService.update(expenseId, changes);
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update expense.");
        return false;
      }
    },
    [expenseService, refresh, setError]
  );

  /** `reason` required — see useInvoicePayments.deletePayment's
   * equivalent comment. */
  const remove = useCallback(
    async (expenseId: string, reason: string) => {
      await expenseService.softDelete(expenseId, reason);
      await refresh();
    },
    [expenseService, refresh]
  );

  const restore = useCallback(
    async (expenseId: string) => {
      await expenseService.restore(expenseId);
      await refresh();
    },
    [expenseService, refresh]
  );

  const markReimbursed = useCallback(
    async (expenseId: string) => {
      await expenseService.markReimbursed(expenseId);
      await refresh();
    },
    [expenseService, refresh]
  );

  return { expenses, totals, loading, error, create, update, remove, restore, markReimbursed, refresh };
}
