"use client";

/**
 * Assignment + cost tracking + payments for subcontractors on one
 * project.
 *
 * ONE PAYMENT = ONE EXPENSE RECORD. "Pay" here writes the same
 * `estimate_expenses` row ExpenseDialog writes — typed `subcontractor`
 * and tagged with this payee — so it appears on the Expenses page and in
 * estimate/project/dashboard financials automatically. There is no
 * separate subcontractor-payment cost source.
 *
 * Every contracted/paid/outstanding figure is
 * `balances[assignment.subcontractorId]`, from
 * FinancialEngine.getPayeeBalances, which reads those same expense rows.
 * Keyed by PAYEE (not assignment) because one payee has one balance.
 */
import { useState } from "react";
import { HardHat, Plus, Trash2, Lock } from "lucide-react";
import { useSubcontractorAssignments } from "@/lib/hooks/useSubcontractorAssignments";
import { EmptyState } from "@/components/ui/EmptyState";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function SubcontractorAssignmentPanel({
  companyId,
  projectId,
  estimateId,
  onChanged,
  compact = false,
}: {
  companyId: string;
  projectId: string;
  /** The estimate being viewed. A payment recorded here is tagged with
   * it, so the cost appears in that estimate's expenses like any other.
   * The assignment's OWN estimate wins when it has one; this is the
   * fallback for assignments made at project level. Omitted on project
   * pages, where no single estimate is implied. */
  estimateId?: string | null;

  /** Called after any cost-affecting mutation (assign/payment/mark
   * final) so the parent can reload its own financial summary
   * (FinancialEngine.getEstimateFinancials) — same onChanged pattern
   * ProjectExpensesPanel/InvoicePaymentsPanel already use. */
  onChanged?: () => void;
  /** Drops the outer border/heading — used when a parent (e.g.
   * SubAgentTabsPanel) already provides both, so they aren't doubled. */
  compact?: boolean;
}) {
  const { roster, assignments, balances, paidByAssignment, loading, error, assign, recordPayment, markFinal, removeAssignment, createSubcontractor, refresh } =
    useSubcontractorAssignments(companyId, projectId, estimateId);
  const [subcontractorId, setSubcontractorId] = useState("");
  const [contractedAmount, setContractedAmount] = useState(0);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [showNewSub, setShowNewSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [newSubTrade, setNewSubTrade] = useState("");

  if (loading) return <div className={compact ? "text-xs text-muted-foreground" : "rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground"}>Loading subcontractors…</div>;

  async function handleRemove(a: (typeof assignments)[number]) {
    if (!window.confirm(`Remove ${a.subcontractorName} from this estimate? Their recorded payments are not affected.`)) return;
    setBusyId(a.id);
    try {
      await removeAssignment(a.id, "User removed assignment via UI");
      onChanged?.();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not remove this assignment.");
    } finally {
      setBusyId(null);
    }
  }

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
              setAssignError(null);
              try {
                await assign(subcontractorId, contractedAmount);
                onChanged?.();
                setSubcontractorId("");
                setContractedAmount(0);
              } catch (err) {
                setAssignError(err instanceof Error ? err.message : "Could not assign this subcontractor.");
              }
            }}
            className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Assign
          </button>
        </div>
        {assignError && (
          <p role="alert" className="text-[11px] font-medium text-danger">{assignError}</p>
        )}

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
            const balance = balances[a.subcontractorId];
            return (
              <li key={a.id} className="space-y-2 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <div>
                      <div className="font-medium text-foreground">{a.subcontractorName}{a.trade ? ` · ${a.trade}` : ""}</div>
                      {a.isFinal && <span className="text-[11px] text-muted-foreground">Final — amount locked</span>}
                    </div>
                    {/* Money already paid against THIS assignment locks
                        it: the assignment is the only record of what
                        that payment was for. See removeAssignment. */}
                    {(paidByAssignment[a.id] ?? 0) > 0 ? (
                      <span
                        title={`Paid ${money(paidByAssignment[a.id] ?? 0)} on this job — reverse that payment before unassigning.`}
                        className="flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                      >
                        <Lock className="size-3" aria-hidden="true" /> Paid
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemove(a)}
                        disabled={busyId === a.id}
                        aria-label={`Remove ${a.subcontractorName}`}
                        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  {balance && (
                    <div className="text-right text-[11px] text-muted-foreground">
                      Contracted {money(balance.contracted)} · Paid {money(balance.paid)}
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
                      await recordPayment(
                        a.subcontractorId,
                        a.subcontractorName,
                        paymentAmounts[a.id] ?? 0,
                        new Date().toISOString().slice(0, 10),
                        a.estimateId ?? estimateId ?? null
                      );
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