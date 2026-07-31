"use client";

/**
 * Orchestration only. "Cost tracking" (assigned vs. paid vs.
 * outstanding) is never computed here — it's
 * TransactionService.getAssignmentBalance via SubcontractorService.
 * getBalance, called on demand, not re-derived from a payments array
 * this hook happens to be holding.
 */
import { useCallback, useState } from "react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useRefreshableResource } from "./useAsyncResource";
import type { Subcontractor, SubcontractorAssignment } from "../services";

export function useSubcontractorAssignments(companyId: string, projectId: string) {
  const { subcontractorService } = useServices();
  const [roster, setRoster] = useState<Subcontractor[]>([]);
  const [assignments, setAssignments] = useState<Array<SubcontractorAssignment & { subcontractorName: string; trade: string | null }>>([]);
  const [balances, setBalances] = useState<Record<string, { assigned: number; paid: number; committed: number; outstanding: number }>>({});

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
    const balanceEntries = await Promise.all(assignmentList.map(async (a) => [a.id, await subcontractorService.getBalance(a.id)] as const));
    setBalances(Object.fromEntries(balanceEntries));
  }, [subcontractorService, companyId, projectId]);

  const assign = useCallback(
    async (subcontractorId: string, contractedAmount: number, notes?: string) => {
      await subcontractorService.assignToProject({ companyId, projectId, subcontractorId, contractedAmount, notes });
      await refresh();
    },
    [subcontractorService, companyId, projectId, refresh]
  );

  const recordPayment = useCallback(
    async (assignmentId: string, amount: number, paymentDate: string, paymentType: "payment" | "reimbursement" = "payment") => {
      await subcontractorService.recordPayment({ companyId, assignmentId, amount, paymentDate, paymentType });
      await refresh();
    },
    [subcontractorService, companyId, refresh]
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
