"use client";

/**
 * Agent commission profit preview and allocation.
 *
 * Shows: project revenue - other expenses = remaining profit
 * Then splits remaining profit among selected agents at a fixed %.
 *
 * Each agent gets an equal split of the commission percentage:
 * Example: $1000 remaining, 40% commission, 2 agents = $200 per agent.
 */
import { AlertCircle, Trash2 } from "lucide-react";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function AgentCommissionPreview({
  projectRevenue,
  otherExpenses,
  selectedAgents,
  commissionPercent,
  onRemoveAgent,
}: {
  projectRevenue: number;
  otherExpenses: number;
  selectedAgents: Array<{ id: string; label: string }>;
  commissionPercent: number | null;
  onRemoveAgent: (agentId: string) => void;
}) {
  const remainingProfit = projectRevenue - otherExpenses;
  const totalCommission = remainingProfit * (commissionPercent ?? 0) / 100;
  const perAgentCommission = selectedAgents.length > 0 ? totalCommission / selectedAgents.length : 0;
  const companyRemaining = remainingProfit - totalCommission;

  const isExceeded = totalCommission > remainingProfit;

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-medium text-foreground">Commission Preview</legend>

      {/* Revenue breakdown */}
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Project Revenue</span>
          <span className="font-medium text-foreground">{money(projectRevenue)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Other Expenses</span>
          <span className="font-medium text-foreground">−{money(otherExpenses)}</span>
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
