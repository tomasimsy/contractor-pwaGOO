"use client";

/**
 * Team Members on an estimate — assignment + a per-member money card.
 *
 * ============================================================
 * ADDITIVE. NOTHING EXISTING CHANGES.
 * ============================================================
 * The Assigned Agent section is untouched and this renders below it.
 * No agent, commission, payment, expense or FinancialEngine behaviour is
 * modified: assignments live in their own table that no financial
 * calculation reads, so adding one moves no total anywhere.
 *
 * ============================================================
 * WHERE EACH FIGURE COMES FROM
 * ============================================================
 * Only "Assigned Labor" is stored. The other three are derived from the
 * SAME expense rows the rest of the app already uses — a team member's
 * personally-paid costs are `estimate_expenses` rows with
 * `paid_by = 'employee'` and `paid_by_id` = that member:
 *
 *   Assigned Labor        assignment.amount        (the commitment)
 *   Personally Paid       sum of their expense rows on this estimate
 *   Reimbursed            those with reimbursementStatus "reimbursed"
 *   Pending Reimbursement calculateExpenseTotals(theirRows)
 *                           .outstandingReimbursements
 *
 * That last one is deliberately the shared function rather than a local
 * filter, so the rule for "outstanding" (reimbursable && pending) has
 * exactly one definition — the same one ExpenseService.getTotalsForProject
 * and the Team page use.
 *
 * "Personally Paid" and "Reimbursed" are plain sums over rows already
 * fetched. They are display aggregation of existing rows, not a new cost
 * model: none of these numbers feeds job cost or profit, which continue
 * to come from FinancialEngine exactly as before.
 *
 * ============================================================
 * MODULARITY
 * ============================================================
 * Paying a team member later is ONE EXPENSE RECORD (an
 * `estimate_expenses` row typed `labor`, tagged with the payee) —
 * the same shape a subcontractor payout already uses. When that lands,
 * "Reimbursed" and "Pending" here update on their own, because they are
 * reads of expense rows rather than stored balances. No redesign, no
 * schema change.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { UsersRound, Plus, Trash2, Lock } from "lucide-react";
import { CreateOrSelect, type DirectoryOption } from "@/components/shared/CreateOrSelect";
import { createCompanyUserDirectory } from "@/components/expenses/directories";
import { EmptyState } from "@/components/ui/EmptyState";
import { useServices } from "@/components/providers/ServicesProvider";
import { supabase } from "@/lib/supabase/client";
import { calculateExpenseTotals } from "@/lib/services/financialCalculations";
import type { Expense } from "@/lib/services/expenseService";
import type { TeamAssignmentWithName } from "@/lib/services/teamAssignmentService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export interface TeamMembersPanelRef {
  refresh: () => Promise<void>;
}

type MemberCard = TeamAssignmentWithName & {
  personallyPaid: number;
  reimbursed: number;
  pending: number;
  labourPaid: number;
};

export const TeamMembersPanel = forwardRef<
  TeamMembersPanelRef,
  {
    companyId: string;
    estimateId: string;
    projectId: string | null;
    onChanged?: () => Promise<void> | void;
    compact?: boolean;
  }
>(function TeamMembersPanel({ companyId, estimateId, projectId, onChanged, compact = false }, ref) {
  const { teamAssignmentService, expenseService } = useServices();

  const [cards, setCards] = useState<MemberCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberLabel, setMemberLabel] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const memberDir = useMemo(() => createCompanyUserDirectory(supabase), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assignments, expenses] = await Promise.all([
        teamAssignmentService.listForEstimate(estimateId),
        expenseService.listForEstimate(estimateId),
      ]);

      const byUser = new Map<string, Expense[]>();
      for (const e of expenses) {
        if (e.paidByType !== "employee" || !e.paidById) continue;
        const list = byUser.get(e.paidById) ?? [];
        list.push(e);
        byUser.set(e.paidById, list);
      }

      const labourByUser = new Map<string, number>();
      for (const e of expenses) {
        if (e.expenseType !== "labor" || e.payeeType !== "employee" || !e.payeeId || !e.isPaid) continue;
        labourByUser.set(e.payeeId, (labourByUser.get(e.payeeId) ?? 0) + e.amount);
      }

      setCards(
        assignments.map((a) => {
          const theirs = byUser.get(a.userId) ?? [];
          return {
            ...a,
            personallyPaid: theirs.reduce((sum, e) => sum + e.amount, 0),
            reimbursed: theirs
              .filter((e) => e.reimbursementStatus === "reimbursed")
              .reduce((sum, e) => sum + e.amount, 0),
            pending: calculateExpenseTotals(theirs).outstandingReimbursements,
            labourPaid: labourByUser.get(a.userId) ?? 0,
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team members.");
    } finally {
      setLoading(false);
    }
  }, [teamAssignmentService, expenseService, estimateId]);

  useEffect(() => {
    load();
  }, [load]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  async function handleAssign() {
    if (!memberId) {
      setError("Pick a team member.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await teamAssignmentService.assign({
        companyId,
        estimateId,
        projectId,
        userId: memberId,
        amount: parseFloat(amount) || 0,
        notes: notes.trim() || null,
      });
      setMemberId(null);
      setMemberLabel(null);
      setAmount("");
      setNotes("");
      setAdding(false);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign this team member.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(card: MemberCard) {
    if (card.labourPaid > 0) {
      setError(
        `${card.memberName} has already been paid ${money(card.labourPaid)} for this assignment. ` +
          `Reverse that payment first if it was recorded in error.`
      );
      return;
    }
    if (!window.confirm(`Remove ${card.memberName} from this estimate? Their recorded expenses are not affected.`)) return;
    setBusyId(card.id);
    setError(null);
    try {
      await teamAssignmentService.softDelete(card.id, "User removed assignment via UI");
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this assignment.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={compact ? "" : "rounded-lg border border-gray-200 bg-white p-3 shadow-sm"}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        {!compact ? (
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600">
            <UsersRound className="size-3.5 text-emerald-500" /> Team Members
          </h2>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">{cards.length}</span>
          {!adding && (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setError(null);
              }}
              className="inline-flex h-6 items-center gap-0.5 rounded border border-gray-200 px-2 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="size-3" /> Assign
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Assign Form - Compact */}
      {adding && (
        <div className="mb-2 space-y-1.5 rounded border border-emerald-200/50 bg-emerald-50/30 p-2">
          <CreateOrSelect
            adapter={memberDir}
            value={memberId}
            valueLabel={memberLabel}
            onChange={(opt: DirectoryOption | null) => {
              setMemberId(opt?.id ?? null);
              setMemberLabel(opt?.label ?? null);
            }}
            placeholder="Select team member"
          />

          <div className="flex flex-wrap items-center gap-1">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$"
              className="h-7 w-20 rounded border border-gray-200 bg-gray-50 px-1.5 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="h-7 flex-1 min-w-[80px] rounded border border-gray-200 bg-gray-50 px-1.5 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
            />
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="inline-flex h-6 items-center rounded border border-gray-200 px-2 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={saving}
              className="inline-flex h-6 items-center rounded bg-emerald-600 px-2.5 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "…" : "Assign"}
            </button>
          </div>
        </div>
      )}

      {/* Cards List - Compact */}
      {loading ? (
        <p className="py-3 text-center text-xs text-gray-400">Loading…</p>
      ) : cards.length === 0 ? (
        <div className="py-4 text-center">
          <UsersRound className="mx-auto size-6 text-gray-300" />
          <p className="mt-1 text-xs text-gray-400">No team members assigned</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {cards.map((c) => (
            <div key={c.id} className="rounded border border-gray-200 bg-gray-50/50 p-2">
              {/* Header Row */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-gray-800">{c.memberName}</span>
                    {c.notes && <span className="text-[9px] text-gray-400">· {c.notes}</span>}
                  </div>
                </div>

                {c.labourPaid > 0 ? (
                  <span className="flex shrink-0 items-center gap-0.5 rounded border border-gray-200 px-1.5 py-0.5 text-[9px] font-medium text-gray-500 bg-gray-100">
                    <Lock className="size-2.5" /> Paid
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRemove(c)}
                    disabled={busyId === c.id}
                    className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>

              {/* Stats - Label above value, 2-column grid */}
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                <div>
                  <div className="text-[9px] font-medium uppercase tracking-wider text-gray-400">
                    Assigned Labor
                  </div>
                  <div className="text-xs font-semibold text-gray-800">{money(c.amount)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-medium uppercase tracking-wider text-gray-400">
                    Personally Paid
                  </div>
                  <div className="text-xs font-semibold text-gray-800">{money(c.personallyPaid)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-medium uppercase tracking-wider text-gray-400">
                    Reimbursed
                  </div>
                  <div className="text-xs font-semibold text-emerald-600">{money(c.reimbursed)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-medium uppercase tracking-wider text-gray-400">
                    Pending Reimbursement
                  </div>
                  <div className={`text-xs font-semibold ${c.pending > 0 ? "text-amber-600" : "text-gray-400"}`}>
                    {money(c.pending)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});