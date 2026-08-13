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
  /** Assigned labour that has actually been PAID to them on this
   * estimate. Non-zero locks the assignment: see handleRemove. */
  labourPaid: number;
};

export const TeamMembersPanel = forwardRef<
  TeamMembersPanelRef,
  {
    companyId: string;
    estimateId: string;
    projectId: string | null;
    /** Same onChanged contract the Sub/Agent panels use. Nothing here
     * changes a total today, but a future labor payment will. */
    onChanged?: () => Promise<void> | void;
    /** Drops the outer border/heading — used when a parent (e.g.
     * SubAgentTabsPanel) already provides both, so they aren't
     * doubled. Same convention as SubcontractorAssignmentPanel/
     * AgentAssignmentPanel's own `compact` prop. */
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

      // Group this estimate's employee-paid costs by who fronted them.
      const byUser = new Map<string, Expense[]>();
      for (const e of expenses) {
        if (e.paidByType !== "employee" || !e.paidById) continue;
        const list = byUser.get(e.paidById) ?? [];
        list.push(e);
        byUser.set(e.paidById, list);
      }

      /* Labour PAID OUT to a member — the company paying them for
       * assigned work, which is the opposite direction to the
       * personally-paid rows above and so a separate grouping. Same
       * expense rows a labour payout writes, read back. */
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
            // The shared rule, not a local re-filter.
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
    /* Mirrors the guard in TeamAssignmentService.softDelete, which is
       the authoritative one. Repeated here only so the user gets a
       plain sentence instead of a thrown error after a confirm. */
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
      // Soft delete with a reason — same discipline as every other
      // record. Their EXPENSES are untouched: those are separate rows
      // owned by ExpenseService, and unassigning somebody must never
      // erase money they actually spent.
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
    <div className={compact ? "" : "rounded-xl border border-border bg-card p-3 shadow-xs sm:p-4"}>
      <div className="mb-3 flex items-center justify-between gap-2">
        {!compact && (
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <UsersRound className="size-4 text-primary" /> Team Members
          </h2>
        )}
        {compact && <span />}
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setError(null);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Plus className="size-3.5" /> Assign
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-2 rounded-lg bg-danger/10 px-2.5 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {adding && (
        <div className="mb-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <div>
            <span className="mb-1 block text-xs font-semibold text-foreground">Team member</span>
            <CreateOrSelect
              adapter={memberDir}
              value={memberId}
              valueLabel={memberLabel}
              onChange={(opt: DirectoryOption | null) => {
                setMemberId(opt?.id ?? null);
                setMemberLabel(opt?.label ?? null);
              }}
              placeholder="Select a team member"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-foreground">Assigned labor</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-foreground">Notes</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Assigning…" : "Assign"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No team members assigned"
          description="Assign someone to track their labor and any costs they front."
        />
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {cards.map((c) => (
            <div key={c.id} className="rounded-lg border border-border/70 bg-background p-2.5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{c.memberName}</div>
                  {c.notes && (
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.notes}</div>
                  )}
                </div>
                {/* Paid work is locked: the assignment is the only record
                    of what the labour payment was for, so it outlives the
                    ability to unassign. */}
                {c.labourPaid > 0 ? (
                  <span
                    title={`Paid ${money(c.labourPaid)} — reverse that payment before unassigning.`}
                    className="flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-1 text-[10px] font-semibold text-muted-foreground"
                  >
                    <Lock className="size-3" aria-hidden="true" /> Paid
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRemove(c)}
                    disabled={busyId === c.id}
                    aria-label={`Remove ${c.memberName}`}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {[
                  { label: "Assigned Labor", value: money(c.amount), tone: "text-foreground" },
                  { label: "Personally Paid", value: money(c.personallyPaid), tone: "text-foreground" },
                  { label: "Reimbursed", value: money(c.reimbursed), tone: "text-success" },
                  {
                    label: "Pending Reimbursement",
                    value: money(c.pending),
                    tone: c.pending > 0 ? "text-warning" : "text-muted-foreground",
                  },
                ].map((f) => (
                  <div key={f.label}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {f.label}
                    </div>
                    <div className={`text-sm font-semibold tabular-nums ${f.tone}`}>{f.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
