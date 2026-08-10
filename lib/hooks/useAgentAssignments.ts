"use client";

/**
 * Orchestration only. Nothing is computed here.
 *
 * ONE PAYMENT = ONE EXPENSE RECORD. A COMMISSION payment writes an
 * `estimate_expenses` row through ExpenseService — the exact record
 * ExpenseDialog creates, typed `agent_commission` and tagged with this
 * agent — so it appears everywhere expenses do.
 *
 * A REIMBURSEMENT is deliberately NOT a new expense: it repays an
 * expense that already exists and is already counted. Settling one
 * therefore marks that original row reimbursed
 * (ExpenseService.markReimbursed) rather than writing a second record,
 * which is what keeps a fronted purchase from being counted twice.
 */
import { useCallback, useState } from "react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useRefreshableResource } from "./useAsyncResource";
import type { Agent, AgentAssignment, Expense, PayeeBalance } from "../services";

export function useAgentAssignments(companyId: string, projectId: string, estimateId?: string | null) {
  const { agentCommissionService, expenseService, financialEngine } = useServices();
  const [roster, setRoster] = useState<Agent[]>([]);
  const [assignments, setAssignments] = useState<Array<AgentAssignment & { agentName: string }>>([]);
  /** Keyed by AGENT id (not assignment id) — one payee, one balance.
   * Used for the balance breakdown, which is deliberately a payee-wide
   * figure. */
  const [balances, setBalances] = useState<Record<string, PayeeBalance>>({});
  /** Keyed by ASSIGNMENT id — what has been paid against THIS
   * assignment's own job. See the matching field on
   * useSubcontractorAssignments for why this must not be the payee-wide
   * balance when deciding if ONE assignment can be unassigned. */
  const [paidByAssignment, setPaidByAssignment] = useState<Record<string, number>>({});
  const [pendingReimbursements, setPendingReimbursements] = useState<Record<string, Expense[]>>({});
  /** Sum of each agent's pendingReimbursements — "Reimbursements Owed"
   * in the balance breakdown. Derived from the exact same ExpenseService
   * rows the picker below already fetches; never a second source. */
  const [reimbursementsOwedByAgent, setReimbursementsOwedByAgent] = useState<Record<string, number>>({});
  /** Lifetime commission/reimbursement totals per agent (see
   * AgentCommissionService.getCompensationSummary) — "Payments Made"
   * in the breakdown includes settled reimbursements, which
   * getBalance's per-assignment `paid` deliberately excludes. */
  const [compensationByAgent, setCompensationByAgent] = useState<Record<string, { totalCommissions: number; totalReimbursements: number; totalPaid: number }>>({});

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

    const payeeBalances = await financialEngine.getPayeeBalances({ companyId, projectId }, "agent");
    setBalances(Object.fromEntries(payeeBalances.map((b) => [b.payeeId, b] as const)));

    const payables = await financialEngine.getPayablesSummary({ companyId, projectId });
    setPaidByAssignment(
      Object.fromEntries(payables.lines.filter((l) => l.role === "agent").map((l) => [l.assignmentId, l.paid] as const))
    );

    // Expenses this agent covered that are still owed back to them —
    // populates the reimbursement picker so a payment can be linked to
    // the expense it settles (required by recordPayment when
    // paymentType is "reimbursement").
    const reimbursementEntries = await Promise.all(
      rosterList.map(async (agent) => [agent.id, await expenseService.listPendingReimbursements(companyId, agent.id)] as const)
    );
    const pending = Object.fromEntries(reimbursementEntries);
    setPendingReimbursements(pending);
    setReimbursementsOwedByAgent(
      Object.fromEntries(reimbursementEntries.map(([agentId, expenses]) => [agentId, expenses.reduce((sum, e) => sum + e.amount, 0)]))
    );

    const currentYear = new Date().getFullYear();
    const compensationEntries = await Promise.all(
      rosterList.map(async (agent) => [agent.id, await agentCommissionService.getCompensationSummary(agent.id, currentYear)] as const)
    );
    setCompensationByAgent(Object.fromEntries(compensationEntries));
  }, [agentCommissionService, expenseService, financialEngine, companyId, projectId]);

  const assign = useCallback(
    async (agentId: string, assignedAmount: number, notes?: string) => {
      await agentCommissionService.assignToProject({ companyId, projectId, estimateId: estimateId ?? null, agentId, assignedAmount, notes });
      await refresh();
    },
    [agentCommissionService, companyId, projectId, estimateId, refresh]
  );

  /** Commission = a real cost, so it becomes an expense row — the same
   * record ExpenseDialog writes, typed `agent_commission`. */
  const recordCommissionPayment = useCallback(
    async (agentId: string, agentName: string, amount: number, estimateId?: string | null) => {
      await expenseService.create({
        companyId,
        projectId,
        estimateId: estimateId ?? null,
        expenseType: "agent_commission",
        amount,
        expenseDate: new Date().toISOString().slice(0, 10),
        vendor: agentName,
        payeeType: "agent",
        payeeId: agentId,
        paidByType: "company",
        isPaid: true,
        reimbursable: false,
      });
      await refresh();
    },
    [expenseService, companyId, projectId, refresh]
  );

  /** Settles an EXISTING expense the agent fronted — marks that row
   * reimbursed rather than writing a second record. Writing a new
   * expense here would count the same purchase twice (see this file's
   * header, and FinancialEngine's own note on the $300-becomes-$600
   * double-count). */
  const recordReimbursementPayment = useCallback(
    async (_agentId: string, _amount: number, reimbursesExpenseId: string) => {
      await expenseService.markReimbursed(reimbursesExpenseId);
      await refresh();
    },
    [expenseService, refresh]
  );

  const createAgent = useCallback(
    async (name: string, commissionRate?: number) => {
      const created = await agentCommissionService.createAgent({ companyId, name, commissionRate: commissionRate ?? null });
      await refresh();
      return created;
    },
    [agentCommissionService, companyId, refresh]
  );

  /** Unassign — refused by the service itself when this specific
   * assignment has already been paid. See
   * AgentCommissionService.removeAssignment. */
  const removeAssignment = useCallback(
    async (assignmentId: string, reason: string) => {
      await agentCommissionService.removeAssignment(assignmentId, reason);
      await refresh();
    },
    [agentCommissionService, refresh]
  );

  return {
    roster, assignments, balances, paidByAssignment, pendingReimbursements, reimbursementsOwedByAgent, compensationByAgent,
    loading, error, assign, recordCommissionPayment, recordReimbursementPayment, removeAssignment, createAgent, refresh,
  };
}
