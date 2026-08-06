"use client";

/**
 * "Needs Payment" — one place to pay agents, subcontractors and team
 * member reimbursements.
 *
 * ============================================================
 * NO NEW TABLE, NO NEW SERVICE, NO NEW MATH
 * ============================================================
 * Everything shown is read from existing sources, and everything paid is
 * written through the existing paths:
 *
 *   READ  subcontractors  FinancialEngine.getPayeeBalances(scope, "subcontractor")
 *         agents          FinancialEngine.getPayeeBalances(scope, "agent")
 *         team members    ExpenseService.listPendingReimbursements(companyId)
 *
 *   PAY   subcontractor / agent   ExpenseService.create(...)  -- ONE PAYMENT
 *                                 = ONE EXPENSE RECORD, typed
 *                                 `subcontractor` / `agent_commission`
 *                                 and tagged with the payee. Exactly what
 *                                 SubcontractorAssignmentPanel's "Pay"
 *                                 already writes.
 *         team reimbursement      ExpenseService.markReimbursed(expenseId)
 *
 * WHY THIS AND NOT A `payments` TABLE. FinancialEngine derives what is
 * owed like this:
 *
 *     row.paid += e.amount;                       // EXPENSE rows only
 *     row.outstanding = calculateCommittedCostBalance(contracted, paid)
 *
 * A separate payments table would be invisible to that, so paying
 * somebody would not reduce their outstanding balance and they would sit
 * on this list forever — the "manual status syncing" this feature exists
 * to avoid. Writing the expense row instead means the balance moves on
 * its own, because the thing the engine reads is the thing we wrote.
 * Same for a reimbursement: `markReimbursed` flips the status the
 * pending-reimbursement query filters on.
 *
 * This component therefore computes NOTHING. Every figure it renders came
 * from FinancialEngine or ExpenseService, and every write is a call to a
 * method that already existed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { HandCoins, HardHat, Briefcase, UsersRound, X } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PAYMENT_METHODS } from "@/components/payments/paymentMethods";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { calculateExpenseTotals } from "@/lib/services/financialCalculations";
import type { Expense } from "@/lib/services/expenseService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type PayeeKind = "subcontractor" | "agent" | "team_member";

/** One row on the list. `expenses` is populated only for team members —
 * a reimbursement is settled by flipping specific expense rows, so the
 * rows themselves are what gets paid. */
type Payable = {
  kind: PayeeKind;
  payeeId: string;
  payeeName: string;
  outstanding: number;
  /** Which project to attach a payout expense to. Taken from the payee's
   * own assignments so the cost lands on a real job instead of becoming
   * an orphan with no project and no estimate. */
  projectId: string | null;
  expenses: Expense[];
};

const KIND_META: Record<PayeeKind, { label: string; icon: typeof HardHat }> = {
  subcontractor: { label: "Subcontractor", icon: HardHat },
  agent: { label: "Agent", icon: Briefcase },
  team_member: { label: "Team member", icon: UsersRound },
};

export function NeedsPaymentPanel() {
  const { financialEngine, expenseService } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;

  const [rows, setRows] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [paying, setPaying] = useState<Payable | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const scope = { companyId };
      const [subs, agents, pending, members] = await Promise.all([
        financialEngine.getPayeeBalances(scope, "subcontractor"),
        financialEngine.getPayeeBalances(scope, "agent"),
        expenseService.listPendingReimbursements(companyId),
        supabase.rpc("list_company_members"),
      ]);

      const memberNames = new Map(
        (((members.data ?? []) as Array<{ id: string; email: string | null; full_name?: string | null }>) || []).map(
          (m) => [m.id, m.full_name?.trim() || m.email || "Unnamed user"]
        )
      );

      // Team members: group their own pending reimbursements. The
      // outstanding figure is calculateExpenseTotals' — the same rule
      // every other pending-reimbursement number in the app uses.
      const byUser = new Map<string, Expense[]>();
      for (const e of pending) {
        if (e.paidByType !== "employee" || !e.paidById) continue;
        const list = byUser.get(e.paidById) ?? [];
        list.push(e);
        byUser.set(e.paidById, list);
      }

      const teamRows: Payable[] = [...byUser.entries()].map(([userId, theirs]) => ({
        kind: "team_member",
        payeeId: userId,
        payeeName: memberNames.get(userId) ?? "Unknown member",
        outstanding: calculateExpenseTotals(theirs).outstandingReimbursements,
        projectId: null,
        // Oldest first, so settling part of a balance clears the debts
        // that have been waiting longest.
        expenses: [...theirs].sort((a, b) => a.expenseDate.localeCompare(b.expenseDate)),
      }));

      const payeeRows: Payable[] = [...subs, ...agents]
        .filter((b) => b.outstanding > 0)
        .map((b) => ({
          kind: b.role as PayeeKind,
          payeeId: b.payeeId,
          payeeName: b.payeeName,
          outstanding: b.outstanding,
          projectId: b.projectIds[0] ?? null,
          expenses: [],
        }));

      setRows(
        [...payeeRows, ...teamRows]
          .filter((r) => r.outstanding > 0)
          .sort((a, b) => b.outstanding - a.outstanding)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payables.");
    } finally {
      setLoading(false);
    }
  }, [companyId, financialEngine, expenseService]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.outstanding, 0), [rows]);

  function openPay(row: Payable) {
    setPaying(row);
    // Pre-filled with what's owed — the common case is paying it in full.
    setAmount(row.outstanding.toFixed(2));
    setMethod("");
    setReference("");
    setNotes("");
    setNotice(null);
    setError(null);
  }

  /** For a team member, which whole expenses the entered amount settles.
   * A reimbursement is settled per EXPENSE ROW (markReimbursed flips a
   * row's status), so a part-payment clears the oldest rows that fit
   * rather than pretending a row can be half-settled. */
  const settlement = useMemo(() => {
    if (!paying || paying.kind !== "team_member") return null;
    const target = parseFloat(amount) || 0;
    let running = 0;
    const covered: Expense[] = [];
    for (const e of paying.expenses) {
      if (running + e.amount > target + 0.001) break;
      running += e.amount;
      covered.push(e);
    }
    return { covered, coveredTotal: running, of: paying.expenses.length };
  }, [paying, amount]);

  async function handlePay() {
    if (!paying || !companyId) return;
    const value = parseFloat(amount) || 0;
    if (value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (paying.kind === "team_member") {
        if (!settlement || settlement.covered.length === 0) {
          setError("That amount doesn't cover any single outstanding expense.");
          setSaving(false);
          return;
        }
        // Settle the debt on the rows themselves. No new record: the
        // expense already IS the cost, this only marks it repaid.
        for (const e of settlement.covered) {
          await expenseService.markReimbursed(e.id);
        }
        setNotice(
          `Reimbursed ${paying.payeeName} — ${settlement.covered.length} expense${
            settlement.covered.length === 1 ? "" : "s"
          }, ${money(settlement.coveredTotal)}.`
        );
      } else {
        // ONE PAYMENT = ONE EXPENSE RECORD. This is the same write
        // SubcontractorAssignmentPanel's "Pay" performs.
        await expenseService.create({
          companyId,
          projectId: paying.projectId,
          expenseType: paying.kind === "subcontractor" ? "subcontractor" : "agent_commission",
          amount: value,
          expenseDate: new Date().toISOString().slice(0, 10),
          vendor: paying.payeeName,
          payeeType: paying.kind,
          payeeId: paying.payeeId,
          paidByType: "company",
          paymentMethod: method || null,
          isPaid: true,
          // The company paid this out; nobody is owed a reimbursement
          // for it. Passing false explicitly rather than relying on the
          // derived default keeps the intent readable.
          reimbursable: false,
          notes: [reference && `Ref: ${reference}`, notes].filter(Boolean).join(" — ") || null,
        });
        setNotice(`Paid ${paying.payeeName} ${money(value)}.`);
      }

      setPaying(null);
      // Balances re-read from the engine, which now sees what we wrote.
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <HandCoins className={`size-4 shrink-0 ${total > 0 ? "text-warning" : "text-muted-foreground"}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Needs payment
        </span>
        <span className={`text-base font-bold tabular-nums ${total > 0 ? "text-warning" : "text-foreground"}`}>
          {money(total)}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {rows.length} {rows.length === 1 ? "payee" : "payees"}
        </span>
      </div>

      {error && !paying && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => load()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">{notice}</div>
      )}

      {loading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Nobody is owed money"
          description="Subcontractors, agents and team members are all settled up."
        />
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((r) => {
            const Icon = KIND_META[r.kind].icon;
            return (
              <div
                key={`${r.kind}:${r.payeeId}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{r.payeeName}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {KIND_META[r.kind].label}
                      {r.kind === "team_member" &&
                        ` · ${r.expenses.length} expense${r.expenses.length === 1 ? "" : "s"}`}
                    </span>
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-bold tabular-nums text-warning">{money(r.outstanding)}</span>
                  <button
                    type="button"
                    onClick={() => openPay(r)}
                    className="min-h-9 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Pay Now
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- PAY SHEET ---------- */}
      {paying && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-lg sm:max-w-md sm:rounded-xl">
            <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-foreground">Pay {paying.payeeName}</h2>
                <p className="text-[11px] text-muted-foreground">
                  {KIND_META[paying.kind].label} · owed {money(paying.outstanding)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaying(null)}
                aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
              {error && (
                <div role="alert" className="rounded-lg bg-danger/10 px-2.5 py-2 text-xs font-medium text-danger">
                  {error}
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-foreground">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  autoFocus
                />
              </label>

              {/* A reimbursement settles whole expense rows, so say
                  exactly which ones this amount clears rather than
                  implying a row can be part-settled. */}
              {paying.kind === "team_member" && settlement && (
                <p
                  className={`rounded-lg px-2.5 py-2 text-xs ${
                    settlement.covered.length === 0
                      ? "bg-danger/10 text-danger"
                      : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {settlement.covered.length === 0
                    ? "Too low to settle any single expense — reimbursements clear whole expenses."
                    : `Settles ${settlement.covered.length} of ${settlement.of} expense${
                        settlement.of === 1 ? "" : "s"
                      } (${money(settlement.coveredTotal)}), oldest first.`}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-foreground">Method</span>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-foreground">Reference</span>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Check #, txn id"
                    className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-foreground">Notes</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                  className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </label>

              {/* Method/reference/notes are captured on the expense row's
                  own fields for a payout. A reimbursement settles
                  existing rows, so there is nowhere to put them without
                  inventing a column — say so instead of dropping them
                  silently. */}
              {paying.kind === "team_member" && (
                <p className="text-[11px] text-muted-foreground">
                  Method and reference aren&apos;t stored for reimbursements — they settle existing
                  expense rows rather than creating a new one.
                </p>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border px-3 py-2.5 sm:px-4">
              <button
                type="button"
                onClick={() => setPaying(null)}
                className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePay}
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "Recording…" : "Record payment"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
