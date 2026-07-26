"use client";

/**
 * Orchestration only. "Paid by agent" vs "paid by company" is not a
 * branch this hook decides how to handle financially — it's just
 * whether `paidByAgentId` is set on the create() call. ExpenseService
 * (and, underneath it, the ledger — see TRANSACTION_LEDGER.md) is what
 * turns that into a cost row plus a liability row. This hook only
 * collects which agent, if any, and passes it through.
 */
import { useCallback, useState } from "react";
import { useServices } from "../services-context";
import { useRefreshableResource } from "./useAsyncResource";
import type { Expense, ExpenseCategory, AuditedEntity } from "../services";

export function useExpenses(companyId: string, projectId: string) {
  const { expenseService } = useServices();
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const { loading, error, setError, refresh } = useRefreshableResource(async () => {
    setExpenses(await expenseService.listForProject(projectId));
  }, [expenseService, projectId]);

  const create = useCallback(
    async (input: {
      category: ExpenseCategory;
      amount: number;
      expenseDate: string;
      vendor?: string;
      paymentMethod?: string;
      paidByAgentId?: string | null; // set -> "paid by agent" (books a reimbursement liability); unset -> "paid by company"
      changeOrderId?: string | null;
      receiptUrl?: string;
    }) => {
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
    async (expenseId: string, changes: Partial<Omit<Expense, keyof AuditedEntity | "projectId">>) => {
      await expenseService.update(expenseId, changes);
      await refresh();
    },
    [expenseService, refresh]
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

  return { expenses, loading, error, create, update, remove, restore };
}
