"use client";

/**
 * Team — the company's own users, and what each is owed back.
 *
 * ============================================================
 * WHY THIS IS NOT THE AGENTS PAGE
 * ============================================================
 * These are two different sets of people, and conflating them would
 * break real data:
 *
 *   /agents  — the SALES AGENT roster (`agents` table). Agents earn
 *              commissions. 43 estimate_agents assignments, 61
 *              agent_payments and 29 agent_commission expenses
 *              reference agent ids, and
 *              FinancialEngine.getPayeeBalances(scope, "agent") reads
 *              them to produce the Agents Outstanding figure.
 *
 *   /team    — the company's USERS (`profiles` — people who can log in).
 *              A user who fronts money for a job is owed it back; that
 *              debt is an `estimate_expenses` row whose `paid_by_id` is
 *              their id.
 *
 * An agent id and a user id are not interchangeable, so this page reads
 * users and never touches the agent roster.
 *
 * ============================================================
 * WHY THE RPC, NOT A `profiles` READ
 * ============================================================
 * RLS on `profiles` scopes a caller to their OWN row — verified live: a
 * direct select returns exactly one row, the caller's. Reading the table
 * here would show every user a team page containing only themselves.
 * `list_company_members` is SECURITY DEFINER, returns every member of
 * the caller's company, and includes the email, which `profiles` cannot
 * expose (email lives in `auth.users`).
 *
 * ============================================================
 * NO NEW CALCULATIONS
 * ============================================================
 * "Owed" is ExpenseService.listPendingReimbursements(companyId) —
 * already scoped to reimbursable + pending + not-deleted — grouped by
 * `paid_by_id` and summed with calculateExpenseTotals, the same function
 * ExpenseService.getTotalsForProject uses. One query for everyone,
 * rather than one per member.
 *
 * DISPLAY ONLY. Settling a reimbursement is ExpenseService.markReimbursed,
 * which lives in the modules that own payouts; a second payout path here
 * is exactly the duplication the service layer exists to prevent.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { UsersRound, HandCoins } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { calculateExpenseTotals } from "@/lib/services/financialCalculations";
import type { Expense } from "@/lib/services/expenseService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Member = { id: string; email: string | null; role: string | null; fullName: string | null };
type MemberRow = Member & { owed: number; count: number };

function TeamContent() {
  const { expenseService } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;

  const [rows, setRows] = useState<MemberRow[]>([]);
  /** Pending reimbursements whose payer is not a listed member — see
   * where this is rendered for why it is surfaced rather than dropped. */
  const [unattributed, setUnattributed] = useState<{ owed: number; count: number }>({ owed: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [membersResult, pending] = await Promise.all([
        supabase.rpc("list_company_members"),
        expenseService.listPendingReimbursements(companyId),
      ]);
      if (membersResult.error) throw new Error(membersResult.error.message);

      const members = ((membersResult.data ?? []) as Array<{
        id: string;
        email: string | null;
        role: string | null;
        full_name?: string | null;
      }>).map(
        (m): Member => ({
          id: m.id,
          email: m.email,
          role: m.role,
          fullName: m.full_name?.trim() || null,
        })
      );

      // Group ONE query's rows by payer rather than querying per member.
      const byPayer = new Map<string, Expense[]>();
      for (const e of pending) {
        if (!e.paidById) continue;
        const list = byPayer.get(e.paidById) ?? [];
        list.push(e);
        byPayer.set(e.paidById, list);
      }

      setRows(
        members
          .map((m) => {
            const mine = byPayer.get(m.id) ?? [];
            return {
              ...m,
              owed: calculateExpenseTotals(mine).outstandingReimbursements,
              count: mine.length,
            };
          })
          .sort((a, b) => b.owed - a.owed)
      );

      // Anything owed to somebody who is not a company user — an agent
      // or subcontractor who fronted money, or a row saved with no payer
      // id at all. Surfaced rather than silently dropped so this page's
      // numbers reconcile against the company-wide figure.
      const memberIds = new Set(members.map((m) => m.id));
      const others = pending.filter((e) => !e.paidById || !memberIds.has(e.paidById));
      setUnattributed({
        owed: calculateExpenseTotals(others).outstandingReimbursements,
        count: others.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the team.");
    } finally {
      setLoading(false);
    }
  }, [companyId, expenseService]);

  useEffect(() => {
    load();
  }, [load]);

  const totalOwed = useMemo(() => rows.reduce((sum, r) => sum + r.owed, 0), [rows]);

  return (
    <PageContainer>
      <PageHeader title="Team" description="Who belongs to this company, and what they're owed back." />

      {error && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger sm:text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => load()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Team Members" value={String(rows.length)} icon={UsersRound} />
            <StatCard
              label="Owed To Team"
              value={money(totalOwed)}
              icon={HandCoins}
              tone={totalOwed > 0 ? "warning" : "neutral"}
              hint="Unreimbursed expenses they fronted"
            />
          </>
        )}
      </div>

      <section className="rounded-xl border border-border bg-card p-3 shadow-xs sm:p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Members</h2>

        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No members found"
            description="Nobody else belongs to this company yet."
          />
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
            {rows.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-2.5 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground capitalize">
                      {m.fullName || m.email || "Unnamed user"}
                    </span>
                    {m.id === profile?.userId && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary">
                        You
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 capitalize text-xs text-muted-foreground">
                    {m.role && <Badge tone="neutral">{m.role}</Badge>}
                    {m.fullName && m.email && (
                      <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-right capitalize">
                  <div className={`text-sm font-semibold ${m.owed > 0 ? "text-warning" : "text-muted-foreground"}`}>
                    {money(m.owed)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {m.owed > 0 ? `${m.count} expense${m.count === 1 ? "" : "s"} owed` : "nothing owed"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && unattributed.count > 0 && (
          <p className="mt-3 rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
            A further <span className="font-semibold text-foreground">{money(unattributed.owed)}</span> across{" "}
            {unattributed.count} expense{unattributed.count === 1 ? " is" : "s are"}{" "}
            owed to someone
            who isn&apos;t a company user — an agent or subcontractor who fronted money, or a row saved without a
            payer. Those settle on the Agents and Subcontractors pages.
          </p>
        )}
      </section>
    </PageContainer>
  );
}

export default function TeamPage() {
  return (
    <RequirePermission resource="user_roles" action="view">
      <TeamContent />
    </RequirePermission>
  );
}
