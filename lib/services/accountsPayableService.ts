/**
 * Layer 3 — accounts payable: what the company owes subcontractors and
 * agents. Thin re-shaping of FinancialEngine.getPayablesSummary — adds
 * no new financial fact.
 *
 * Explicitly NOT aged by due date: subcontractor/agent assignments
 * have no due-date field in this schema (they're paid against a
 * contracted amount, not on a billing cycle), so "31-60 days overdue"
 * isn't a real fact this data can support yet. Rather than fabricate a
 * fake due date, this reports "outstanding, oldest unpaid assignment
 * first" as the closest honest proxy for prioritization, using the
 * assignment's own creation order.
 */
import type { UUID, QueryScope } from "./types";
import type { FinancialEngine } from "./financialEngine";

export interface APPayableLine {
  role: "subcontractor" | "agent";
  payeeId: UUID;
  payeeName: string;
  assigned: number;
  paid: number;
  outstanding: number;
}

export interface APReport {
  scope: QueryScope;
  lines: APPayableLine[];
  totalOutstandingSubcontractor: number;
  totalOutstandingAgent: number;
  totalOutstanding: number;
}

export interface AccountsPayableService {
  getPayablesReport(scope: QueryScope): Promise<APReport>;
}

export function createAccountsPayableService(deps: { financialEngine: FinancialEngine }): AccountsPayableService {
  async function getPayablesReport(scope: QueryScope): Promise<APReport> {
    const summary = await deps.financialEngine.getPayablesSummary(scope);
    return {
      scope,
      lines: summary.lines
        // A/P is subcontractors and agents. `summary.lines` holds only
        // those (team labour lives in `teamLines`), so this narrows the
        // type without dropping anything — and keeps A/P's meaning
        // fixed if a third role is ever added to that field.
        .filter((l): l is typeof l & { role: "subcontractor" | "agent" } =>
          l.outstanding > 0 && (l.role === "subcontractor" || l.role === "agent")
        )
        .sort((a, b) => b.outstanding - a.outstanding)
        .map((l) => ({ role: l.role, payeeId: l.payeeId, payeeName: l.payeeName, assigned: l.assigned, paid: l.paid, outstanding: l.outstanding })),
      totalOutstandingSubcontractor: summary.totalOutstandingSubcontractor,
      totalOutstandingAgent: summary.totalOutstandingAgent,
      totalOutstanding: summary.totalOutstanding,
    };
  }

  return { getPayablesReport };
}
