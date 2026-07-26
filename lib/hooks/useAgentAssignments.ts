"use client";

/**
 * Orchestration only. Commission vs. reimbursement is not a branch
 * this hook interprets — it's the `paymentType` passed straight to
 * AgentCommissionService.recordPayment, which is what decides the
 * ledger consequence ("agent_commission" cost vs.
 * "agent_reimbursement_paid" settling a liability — see
 * TRANSACTION_LEDGER.md). `reimbursesExpenseId` is required by that
 * service whenever paymentType is "reimbursement"; this hook just
 * passes through whatever the form collected.
 */
import { useCallback, useState } from "react";
import { useServices } from "../services-context";
import { useRefreshableResource } from "./useAsyncResource";
import type { Agent, AgentAssignment, Expense } from "../services";

export function useAgentAssignments(companyId: string, projectId: string) {
  const { agentCommissionService, expenseService } = useServices();
  const [roster, setRoster] = useState<Agent[]>([]);
  const [assignments, setAssignments] = useState<Array<AgentAssignment & { agentName: string }>>([]);
  const [balances, setBalances] = useState<Record<string, { assigned: number; paid: number; outstanding: number }>>({});
  const [pendingReimbursements, setPendingReimbursements] = useState<Record<string, Expense[]>>({});

  // Same gap as useSubcontractorAssignments had — no error handling at
  // all on the original bare useEffect. See useRefreshableResource's
  // doc comment for why this was found during the optimization pass.
  const { loading, error, refresh } = useRefreshableResource(async () => {
    const [rosterList, assignmentList] = await Promise.all([
      agentCommissionService.getRoster(companyId),
      agentCommissionService.listAssignments({ companyId, projectId }),
    ]);
    setRoster(rosterList);
    setAssignments(assignmentList);

    const balanceEntries = await Promise.all(assignmentList.map(async (a) => [a.id, await agentCommissionService.getBalance(a.id)] as const));
    setBalances(Object.fromEntries(balanceEntries));

    // Expenses this agent covered that are still owed back to them —
    // populates the reimbursement picker so a payment can be linked to
    // the expense it settles (required by recordPayment when
    // paymentType is "reimbursement").
    const reimbursementEntries = await Promise.all(
      rosterList.map(async (agent) => [agent.id, await expenseService.getPendingAgentReimbursements(agent.id)] as const)
    );
    setPendingReimbursements(Object.fromEntries(reimbursementEntries));
  }, [agentCommissionService, expenseService, companyId, projectId]);

  const assign = useCallback(
    async (agentId: string, assignedAmount: number, notes?: string) => {
      await agentCommissionService.assignToProject({ companyId, projectId, agentId, assignedAmount, notes });
      await refresh();
    },
    [agentCommissionService, companyId, projectId, refresh]
  );

  const recordCommissionPayment = useCallback(
    async (agentId: string, assignmentId: string, amount: number) => {
      await agentCommissionService.recordPayment({
        companyId,
        agentId,
        assignmentId,
        amount,
        paymentType: "commission",
        paymentDate: new Date().toISOString().slice(0, 10),
      });
      await refresh();
    },
    [agentCommissionService, companyId, refresh]
  );

  const recordReimbursementPayment = useCallback(
    async (agentId: string, amount: number, reimbursesExpenseId: string) => {
      await agentCommissionService.recordPayment({
        companyId,
        agentId,
        amount,
        paymentType: "reimbursement",
        paymentDate: new Date().toISOString().slice(0, 10),
        reimbursesExpenseId,
      });
      await refresh();
    },
    [agentCommissionService, companyId, refresh]
  );

  return { roster, assignments, balances, pendingReimbursements, loading, error, assign, recordCommissionPayment, recordReimbursementPayment, refresh };
}
