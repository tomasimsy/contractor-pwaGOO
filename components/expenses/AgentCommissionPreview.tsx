"use client";

/**
 * Agent commission profit preview and allocation.
 *
 * PURE DISPLAY — computes no money of its own. Every figure below comes
 * from FinancialEngine via `calculateAgentCommissionSplit`
 * (financialCalculations.ts), the same Layer 0 function ExpenseDialog
 * calls to decide what to actually persist. Previously this component
 * re-derived `remainingProfit`/`totalCommission`/`perAgentCommission`
 * inline while ExpenseDialog derived them AGAIN before submitting —
 * two copies of the same formula that could disagree.
 *
 * The revenue basis is the ESTIMATE, not the project: a commission is
 * earned on the job that was sold, and a project can carry several
 * estimates (see EstimateService's header). `EstimateFinancials.netProfit`
 * is already "revised revenue − every cost recorded against this
 * estimate (materials, labor, subcontractors, change orders …)", which
 * is precisely the commissionable base — so it is read, never rebuilt.
 */
import { AlertCircle, Trash2 } from "lucide-react";
import type { AgentCommissionSplit } from "@/lib/services/financialCalculations";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function AgentCommissionPreview({
  estimateRevenue,
  estimateExpenses,
  split,
  selectedAgents,
  commissionPercent,
  onRemoveAgent,
}: {
  /** EstimateFinancials.revisedTotal — shown for context only. */
  estimateRevenue: number;
  /** EstimateFinancials.totalExpenses — shown for context only. */
  estimateExpenses: number;
  /** The one computed result, from FinancialEngine. */
  split: AgentCommissionSplit;
  selectedAgents: Array<{ id: string; label: string }>;
  commissionPercent: number | null;
  onRemoveAgent: (agentId: string) => void;
}) {
  const { remainingProfit, totalCommission, perAgentCommission, companyRemaining, exceedsRemainingProfit } = split;
  const isExceeded = exceedsRemainingProfit;

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-medium text-foreground">Commission Preview</legend>

      {/* Revenue breakdown */}
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Estimate Revenue</span>
          <span className="font-medium text-foreground">{money(estimateRevenue)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Estimate Expenses</span>
          <span className="font-medium text-foreground">−{money(estimateExpenses)}</span>
        </div>
        <div className="border-t border-border pt-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Remaining Profit</span>
            <span className={`font-semibold ${remainingProfit >= 0 ? "text-success" : "text-danger"}`}>
              {money(remainingProfit)}
            </span>
          </div>
        </div>
      </div>

      {/* Commission split */}
      {commissionPercent !== null && selectedAgents.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {commissionPercent}% commission ÷ {selectedAgents.length} agent{selectedAgents.length > 1 ? "s" : ""}
          </div>

          <div className="space-y-1">
            {selectedAgents.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1.5">
                <div className="text-xs font-medium text-foreground">{agent.label}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-success">{money(perAgentCommission)}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAgent(agent.id)}
                    aria-label={`Remove ${agent.label}`}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-danger"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Commission</span>
              <span className={`text-xs font-semibold ${isExceeded ? "text-danger" : "text-foreground"}`}>
                {money(totalCommission)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Company Remaining</span>
              <span className={`text-xs font-semibold ${companyRemaining >= 0 ? "text-foreground" : "text-danger"}`}>
                {money(companyRemaining)}
              </span>
            </div>
          </div>

          {isExceeded && (
            <div className="flex gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              <AlertCircle className="size-4 shrink-0" />
              <span>Commission exceeds remaining profit. Company will lose money on this project.</span>
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
