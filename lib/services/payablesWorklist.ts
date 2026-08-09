/**
 * "What should I act on today?" — the headline figures behind the
 * Dashboard tile and the /payments Needs Payment list.
 *
 * ============================================================
 * WHY THIS EXISTS AS ONE FUNCTION
 * ============================================================
 * The tile and the page must never disagree: a tile saying $2,708 that
 * links to a page showing something else is worse than no tile. Rather
 * than let two components each decide what "owed" means, the scope and
 * the rule live here once.
 *
 * It COMPUTES NO MONEY. Every figure is read from a service that
 * already owned it:
 *
 *   subcontractor / agent / team labour
 *        FinancialEngine.getPayeeBalances(scope, role) -> contracted,
 *        paid, outstanding. Classified by derivePayableState, which
 *        labels those numbers and does not recompute them.
 *
 *   bills               ExpenseService.listBills, unpaid ones
 *   reimbursements      ExpenseService.listPendingReimbursements
 *
 * ============================================================
 * WHY THIS DIFFERS FROM A/P — BOTH ARE CORRECT
 * ============================================================
 * A/P (getPayablesSummary, on /accounting) answers "what do we owe in
 * total?" — lifetime, and subcontractors + agents only.
 *
 * This answers "what should I act on?" and differs on two axes:
 *
 *   SCOPE  adds team labour, vendor bills and reimbursements, none of
 *          which getPayablesSummary knows about.
 *   STATE  drops assignments on jobs that have not been completed
 *          (nothing is owed yet) but KEEPS partially paid ones, because
 *          once real money has moved the remainder is a live debt
 *          whatever the job status.
 *
 * Measured on live data, the whole gap was scope: $695.20 A/P vs
 * $2,708.33 actionable = team labour 0.33 + bills 2,011.00 +
 * reimbursements 1.80.
 *
 * NO DOUBLE COUNTING — verified against the live table:
 *   * team labour (expense_type=labor, payee_type=employee) and
 *     reimbursements (reimbursable+pending, paid_by=employee) key on
 *     different fields and shared 0 rows;
 *   * a payee-expense row counts as `paid` against an assignment, so
 *     money attached to a bill leaves the assignment bucket rather than
 *     appearing in both.
 */
import { derivePayableState, isActionablePayable } from "./financialCalculations";
import type { FinancialEngine } from "./financialEngine";
import type { ExpenseService } from "./expenseService";
import type { TeamAssignmentService } from "./teamAssignmentService";
import type { EstimateService } from "./estimateService";
import type { ProjectService } from "./projectService";
import type { SubcontractorService } from "./subcontractorService";
import type { AgentCommissionService } from "./agentCommissionService";
import type { UUID } from "./types";

export interface ActionablePayables {
  /** Everything currently worth acting on, across every payee kind. */
  total: number;
  /** Assignments on completed jobs whose amount was never entered.
   * These contribute 0 to `total` — that is precisely why they need
   * their own count, or they would be invisible. */
  needsAmount: number;
  byKind: {
    subcontractor: number;
    agent: number;
    teamLabour: number;
    bills: number;
    reimbursements: number;
  };
}

export interface PayablesWorklistDeps {
  financialEngine: FinancialEngine;
  expenseService: ExpenseService;
  teamAssignmentService: TeamAssignmentService;
  subcontractorService: SubcontractorService;
  agentCommissionService: AgentCommissionService;
  estimateService: EstimateService;
  projectService: ProjectService;
}

/** Which jobs count as finished. Imported rather than restated so the
 * tile, the page and the classifier can never drift apart. */
import {
  JOB_COMPLETE_ESTIMATE_STATUSES,
  JOB_COMPLETE_PROJECT_STATUSES,
} from "./financialCalculations";

export async function getActionablePayables(
  deps: PayablesWorklistDeps,
  companyId: UUID
): Promise<ActionablePayables> {
  const scope = { companyId };
  const [subs, agents, teamLabour, payablesSummary, bills, pending, subAssign, agentAssign, teamAssign, estimates, projects] =
    await Promise.all([
      deps.financialEngine.getPayeeBalances(scope, "subcontractor"),
      deps.financialEngine.getPayeeBalances(scope, "agent"),
      deps.financialEngine.getPayeeBalances(scope, "team_member"),
      // Per-ASSIGNMENT outstanding for sub/agent. Payee-level would
      // overstate: somebody with one finished job and one in progress
      // would have their WHOLE balance counted the moment any job
      // completed. Caught live — payee-level read $2,708.33 against the
      // page's $2,706.33, a $2.00 assignment sitting on an unfinished
      // job. The page classifies per assignment; so must this.
      deps.financialEngine.getPayablesSummary(scope),
      deps.expenseService.listBills(companyId),
      deps.expenseService.listPendingReimbursements(companyId),
      deps.subcontractorService.listAssignments(scope),
      deps.agentCommissionService.listAssignments(scope),
      deps.teamAssignmentService.listAssignments(scope),
      deps.estimateService.list(scope),
      deps.projectService.list(scope),
    ]);

  const estStatus = new Map(estimates.map((e) => [e.id, e.status as string]));
  const projStatus = new Map(projects.map((p) => [p.id, p.status as string]));
  const isDone = (estimateId: string | null, projectId: string | null): boolean => {
    const e = estimateId ? estStatus.get(estimateId) : undefined;
    if (e && (JOB_COMPLETE_ESTIMATE_STATUSES as readonly string[]).includes(e)) return true;
    const p = projectId ? projStatus.get(projectId) : undefined;
    return !!p && (JOB_COMPLETE_PROJECT_STATUSES as readonly string[]).includes(p);
  };

  /** Does this payee have ANY completed job? Assignments carry the job;
   * the balance does not, so the two are joined here. */
  function completionByPayee<T>(
    assignments: T[],
    payeeIdOf: (a: T) => string,
    estimateIdOf: (a: T) => string | null,
    projectIdOf: (a: T) => string | null
  ): Map<string, boolean> {
    const m = new Map<string, boolean>();
    for (const a of assignments) {
      const id = payeeIdOf(a);
      m.set(id, (m.get(id) ?? false) || isDone(estimateIdOf(a), projectIdOf(a)));
    }
    return m;
  }

  /* Only team labour needs payee-level completion: getPayablesSummary
   * builds no lines for it, so there is no per-assignment row to judge.
   * Sub/agent use rollLines below, which is finer and authoritative. */
  const teamDone = completionByPayee(teamAssign, (a) => a.userId, (a) => a.estimateId, (a) => a.projectId);

  let needsAmount = 0;

  /** assignmentId -> the job it belongs to, so a LINE can be judged. */
  const assignmentJob = new Map<string, { estimateId: string | null; projectId: string | null }>([
    ...subAssign.map((a) => [a.id, { estimateId: a.estimateId, projectId: a.projectId }] as const),
    ...agentAssign.map((a) => [a.id, { estimateId: a.estimateId, projectId: a.projectId }] as const),
  ]);

  /** Sub/agent: classify each assignment line the engine produced. */
  const rollLines = (role: "subcontractor" | "agent"): number => {
    let sum = 0;
    for (const l of payablesSummary.lines) {
      if (l.role !== role) continue;
      const job = assignmentJob.get(l.assignmentId);
      const state = derivePayableState({
        contracted: l.assigned,
        paid: l.paid,
        jobComplete: isDone(job?.estimateId ?? null, job?.projectId ?? null),
      });
      if (!isActionablePayable(state)) continue;
      if (state === "needs_amount") needsAmount += 1;
      sum += l.outstanding as number;
    }
    return sum;
  };

  const roll = (
    balances: Array<{ payeeId: string; contracted: number; paid: number; outstanding: number }>,
    done: Map<string, boolean>
  ): number => {
    let sum = 0;
    for (const b of balances) {
      const state = derivePayableState({
        contracted: b.contracted,
        paid: b.paid,
        jobComplete: done.get(b.payeeId) ?? false,
      });
      if (!isActionablePayable(state)) continue;
      if (state === "needs_amount") needsAmount += 1;
      sum += b.outstanding;
    }
    return sum;
  };

  const byKind = {
    subcontractor: rollLines("subcontractor"),
    agent: rollLines("agent"),
    teamLabour: roll(teamLabour, teamDone),
    // A bill is already an obligation with no assignment behind it —
    // unpaid is the whole condition.
    bills: bills.filter((b) => !b.isPaid).reduce((s, b) => s + b.amount, 0),
    reimbursements: pending.reduce((s, e) => s + e.amount, 0),
  };

  return {
    total: Object.values(byKind).reduce((s, v) => s + v, 0),
    needsAmount,
    byKind,
  };
}
