"use client";

/**
 * Assignment + cost tracking + payments for subcontractors on one
 * project. Every "assigned/paid/committed/outstanding" figure shown is
 * `balances[assignment.id]`, populated by SubcontractorService.
 * getBalance — computed directly from persisted assignment/payment
 * rows (never a running total kept in this component's own state).
 */
import { useState } from "react";
import { HardHat, Plus } from "lucide-react";
import { useSubcontractorAssignments } from "@/lib/hooks/useSubcontractorAssignments";
import { EmptyState } from "@/components/ui/EmptyState";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function SubcontractorAssignmentPanel({
  companyId,
  projectId,
  onChanged,
  compact = false,
}: {
  companyId: string;
  projectId: string;
  /** Called after any cost-affecting mutation (assign/payment/mark
   * final) so the parent can reload its own financial summary
   * (FinancialEngine.getEstimateFinancials) — same onChanged pattern
   * ProjectExpensesPanel/InvoicePaymentsPanel already use. */
  onChanged?: () => void;
  /** Drops the outer border/heading — used when a parent (e.g.
   * SubAgentTabsPanel) already provides both, so they aren't doubled. */
  compact?: boolean;
}) {
  const { roster, assignments, balances, loading, error, assign, recordPayment, markFinal, createSubcontractor, refresh } =
    useSubcontractorAssignments(companyId, projectId);
  const [subcontractorId, setSubcontractorId] = useState("");
  const [contractedAmount, setContractedAmount] = useState(0);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, number>>({});
  const [showNewSub, setShowNewSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [newSubTrade, setNewSubTrade] = useState("");

  if (loading) return <div className={compact ? "text-xs text-muted-foreground" : "rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground"}>Loading subcontractors…</div>;

  const Wrapper = compact ? "div" : "section";

  return (
    <Wrapper className={compact ? "" : "rounded-xl border border-border bg-card p-3 sm:p-4"}>
      {!compact && (
        <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <HardHat className="size-3.5" /> Subcontractors
        </h2>
      )}

      {error && (
        <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => refresh()} className="font-medium underline">Retry</button>
        </div>
      )}

      <div className="mb-3 space-y-2 rounded-lg border border-border p-2.5 bg-muted/20">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={subcontractorId}
            onChange={(e) => setSubcontractorId(e.target.value)}
            className="h-7 min-w-[120px] flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="">Select subcontractor…</option>
            {roster.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ""}</option>
            ))}
          </select>
          <button type="button" onClick={() => setShowNewSub((v) => !v)} className="inline-flex h-7 items-center gap-1 rounded-md border border-input px-2 text-xs font-medium text-foreground hover:bg-muted">
            <Plus className="size-3" /> New
          </button>
          <input
            type="number" min="0" step="any" placeholder="Amount"
            value={contractedAmount || ""}
            onChange={(e) => setContractedAmount(parseFloat(e.target.value) || 0)}
            className="h-7 w-28 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <button
            type="button"
            disabled={!subcontractorId || contractedAmount <= 0}
            onClick={async () => {
              await assign(subcontractorId, contractedAmount);
              onChanged?.();
              setSubcontractorId("");
              setContractedAmount(0);
            }}
            className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Assign
          </button>
        </div>

        {showNewSub && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
            <input
              placeholder="Subcontractor name" value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
              className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <input
              placeholder="Trade" value={newSubTrade} onChange={(e) => setNewSubTrade(e.target.value)}
              className="h-7 w-24 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <button
              type="button"
              disabled={!newSubName.trim()}
              onClick={async () => {
                const created = await createSubcontractor(newSubName.trim(), newSubTrade.trim() || undefined);
                setSubcontractorId(created.id);
                setNewSubName("");
                setNewSubTrade("");
                setShowNewSub(false);
              }}
              className="inline-flex h-7 items-center rounded-md border border-input px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {assignments.length === 0 ? (
        <EmptyState title="No subcontractors assigned" description="Assign a subcontractor to this project to start tracking cost." />
      ) : (
        <ul className="divide-y divide-border">
          {assignments.map((a) => {
            const balance = balances[a.id];
            return (
              <li key={a.id} className="space-y-2 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-foreground">{a.subcontractorName}{a.trade ? ` · ${a.trade}` : ""}</div>
                    {a.isFinal && <span className="text-[11px] text-muted-foreground">Final — amount locked</span>}
                  </div>
                  {balance && (
                    <div className="text-right text-[11px] text-muted-foreground">
                      Asg {money(balance.assigned)} · Paid {money(balance.paid)}
                      <div className="font-semibold text-foreground">Out {money(balance.outstanding)}</div>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="number" min="0" step="any" placeholder="Payment amount"
                    value={paymentAmounts[a.id] || ""}
                    onChange={(e) => setPaymentAmounts({ ...paymentAmounts, [a.id]: parseFloat(e.target.value) || 0 })}
                    className="h-7 flex-1 min-w-[120px] rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                  <button
                    type="button"
                    disabled={!paymentAmounts[a.id]}
                    onClick={async () => {
                      await recordPayment(a.id, paymentAmounts[a.id] ?? 0, new Date().toISOString().slice(0, 10));
                      onChanged?.();
                      setPaymentAmounts({ ...paymentAmounts, [a.id]: 0 });
                    }}
                    className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Pay
                  </button>
                  {!a.isFinal && (
                    <button type="button" onClick={() => { markFinal(a.id); onChanged?.(); }} className="inline-flex h-7 items-center rounded-md border border-input px-2.5 text-xs font-medium text-foreground hover:bg-muted">
                      Final
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Wrapper>
  );
}