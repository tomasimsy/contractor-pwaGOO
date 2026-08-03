"use client";

/**
 * Orchestration only. Nothing is computed here.
 *
 * ONE PAYMENT = ONE EXPENSE RECORD. Paying a subcontractor writes an
 * `estimate_expenses` row through ExpenseService — the exact record
 * ExpenseDialog creates, tagged with this subcontractor as payee — so
 * the payment shows up everywhere expenses do (Expenses page, estimate
 * and project financials, Dashboard, Reports) with no parallel payment
 * table to reconcile. Balances come from FinancialEngine.getPayeeBalances,
 * which reads those same expense rows.
 */
import { useCallback, useState } from "react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useRefreshableResource } from "./useAsyncResource";
import type { PayeeBalance, Subcontractor, SubcontractorAssignment } from "../services";

export function useSubcontractorAssignments(companyId: string, projectId: string) {
  const { subcontractorService, expenseService, financialEngine } = useServices();
  const [roster, setRoster] = useState<Subcontractor[]>([]);
  const [assignments, setAssignments] = useState<Array<SubcontractorAssignment & { subcontractorName: string; trade: string | null }>>([]);
  /** Keyed by SUBCONTRACTOR id (not assignment id) — a payee with two
   * assignments on one project has one running balance. */
  const [balances, setBalances] = useState<Record<string, PayeeBalance>>({});

  // Previously a bare useEffect with no error handling at all — a
  // failed refresh (e.g. the service call rejecting) was an uncaught
  // promise rejection, not something a user or this hook's caller
  // could ever see reported; the list would just silently stay empty.
  // useRefreshableResource (shared with useAgentAssignments/useExpenses/
  // useInvoicePayments) is what closes that gap.
  const { loading, error, refresh } = useRefreshableResource(async () => {
    const [rosterList, assignmentList] = await Promise.all([
      subcontractorService.getRoster(companyId),
      subcontractorService.listAssignments({ companyId, projectId }),
    ]);
    setRoster(rosterList);
    setAssignments(assignmentList);
    const payeeBalances = await financialEngine.getPayeeBalances({ companyId, projectId }, "subcontractor");
    setBalances(Object.fromEntries(payeeBalances.map((b) => [b.payeeId, b] as const)));
  }, [subcontractorService, financialEngine, companyId, projectId]);

  const assign = useCallback(
    async (subcontractorId: string, contractedAmount: number, notes?: string) => {
      await subcontractorService.assignToProject({ companyId, projectId, subcontractorId, contractedAmount, notes });
      await refresh();
    },
    [subcontractorService, companyId, projectId, refresh]
  );

  /** Records the payment as an EXPENSE — same record ExpenseDialog
   * writes, typed `subcontractor` and tagged with this payee. Takes the
   * subcontractor directly (not an assignment) because the expense row
   * is attributed to the person, and a payee may be paid without a
   * formal assignment. */
  const recordPayment = useCallback(
    async (subcontractorId: string, subcontractorName: string, amount: number, paymentDate: string, estimateId?: string | null) => {
      await expenseService.create({
        companyId,
        projectId,
        estimateId: estimateId ?? null,
        expenseType: "subcontractor",
        amount,
        expenseDate: paymentDate,
        vendor: subcontractorName,
        payeeType: "subcontractor",
        payeeId: subcontractorId,
        paidByType: "company",
        isPaid: true,
        reimbursable: false,
      });
      await refresh();
    },
    [expenseService, companyId, projectId, refresh]
  );

  const markFinal = useCallback(
    async (assignmentId: string) => {
      await subcontractorService.markAssignmentFinal(assignmentId);
      await refresh();
    },
    [subcontractorService, refresh]
  );

  const createSubcontractor = useCallback(
    async (name: string, trade?: string) => {
      const created = await subcontractorService.createSubcontractor({ companyId, name, trade: trade || null });
      await refresh();
      return created;
    },
    [subcontractorService, companyId, refresh]
  );

  return { roster, assignments, balances, loading, error, assign, recordPayment, markFinal, createSubcontractor, refresh };
}
