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
import { HardHat, Plus, Trash2, Lock, ChevronDown, ChevronRight } from "lucide-react";
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
  estimateId?: string | null;
  onChanged?: () => void;
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (loading) return <div className="text-xs text-muted-foreground py-2">Loading subcontractors…</div>;

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
    <Wrapper className={compact ? "" : "rounded-lg border border-gray-200 bg-white p-3 shadow-sm"}>
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600">
            <HardHat className="size-3.5 text-emerald-500" /> Subcontractors
          </h2>
          <span className="text-[10px] text-gray-400">{assignments.length}</span>
        </div>
      )}

      {error && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
          <span>{error}</span>
          <button type="button" onClick={() => refresh()} className="font-medium underline">Retry</button>
        </div>
      )}

      {/* Assign Section - Compact */}
      <div className="mb-2 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <select
            value={subcontractorId}
            onChange={(e) => setSubcontractorId(e.target.value)}
            className="h-7 min-w-[100px] flex-1 rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
          >
            <option value="">Select sub…</option>
            {roster.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewSub((v) => !v)}
            className="inline-flex h-7 items-center gap-0.5 rounded border border-gray-200 px-2 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <Plus className="size-3" /> New
          </button>
          <input
            type="number" min="0" step="any" placeholder="$"
            value={contractedAmount || ""}
            onChange={(e) => setContractedAmount(parseFloat(e.target.value) || 0)}
            className="h-7 w-20 rounded border border-gray-200 bg-gray-50 px-1.5 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
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
                setAssignError(err instanceof Error ? err.message : "Could not assign.");
              }
            }}
            className="inline-flex h-7 items-center rounded bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Assign
          </button>
        </div>
        {assignError && <p className="text-[10px] text-red-500">{assignError}</p>}

        {showNewSub && (
          <div className="flex flex-wrap items-center gap-1 border-t border-gray-100 pt-1.5">
            <input
              placeholder="Name" value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
              className="h-7 flex-1 rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
            />
            <input
              placeholder="Trade" value={newSubTrade} onChange={(e) => setNewSubTrade(e.target.value)}
              className="h-7 w-20 rounded border border-gray-200 bg-gray-50 px-1.5 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
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
              className="inline-flex h-7 items-center rounded bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Assignments List - Compact */}
      {assignments.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-xs text-gray-400">No subcontractors assigned</p>
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto pr-0.5 space-y-1">
          {assignments.map((a) => {
            const balance = balances[a.subcontractorId];
            const isExpanded = expanded[a.id] || false;
            const hasPayments = (paidByAssignment[a.id] ?? 0) > 0;

            return (
              <div key={a.id} className="rounded border border-gray-200 bg-gray-50/50">
                {/* Header Row - Always Visible */}
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setExpanded({ ...expanded, [a.id]: !isExpanded })}
                    className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600"
                  >
                    {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-gray-800">{a.subcontractorName}</span>
                      {a.trade && <span className="text-[10px] text-gray-400">· {a.trade}</span>}
                      {a.isFinal && <span className="text-[9px] text-gray-400">(Final)</span>}
                    </div>
                  </div>

                  {balance && (
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] font-semibold text-gray-800">{money(balance.outstanding)}</div>
                      <div className="text-[9px] text-gray-400">owed</div>
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-0.5">
                    {hasPayments ? (
                      <span className="flex items-center gap-0.5 rounded border border-gray-200 px-1.5 py-0.5 text-[9px] font-medium text-gray-500 bg-gray-100">
                        <Lock className="size-2.5" /> Paid
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemove(a)}
                        disabled={busyId === a.id}
                        className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-200/60 px-2 py-1.5 space-y-1.5">
                    {balance && (
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span>Contracted: <span className="font-medium text-gray-700">{money(balance.contracted)}</span></span>
                        <span>Paid: <span className="font-medium text-gray-700">{money(balance.paid)}</span></span>
                        <span>Outstanding: <span className="font-medium text-emerald-600">{money(balance.outstanding)}</span></span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1">
                      <input
                        type="number" min="0" step="any" placeholder="$"
                        value={paymentAmounts[a.id] || ""}
                        onChange={(e) => setPaymentAmounts({ ...paymentAmounts, [a.id]: parseFloat(e.target.value) || 0 })}
                        className="h-6 w-24 rounded border border-gray-200 bg-white px-1.5 text-xs text-gray-700 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
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
                        className="inline-flex h-6 items-center rounded bg-emerald-600 px-2 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Pay
                      </button>
                      {!a.isFinal && (
                        <button
                          type="button"
                          onClick={() => { markFinal(a.id); onChanged?.(); }}
                          className="inline-flex h-6 items-center rounded border border-gray-200 px-2 text-[10px] font-medium text-gray-600 hover:bg-gray-100"
                        >
                          Final
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Wrapper>
  );
}