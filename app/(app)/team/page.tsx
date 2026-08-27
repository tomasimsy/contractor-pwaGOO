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
import { UsersRound, HandCoins, UserPlus, X } from "lucide-react";
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
import { ROLES, hasPermission } from "@/lib/services/permissions";
import type { Expense } from "@/lib/services/expenseService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const ROLE_LABEL = (r: string) => r.replace(/_/g, " ");

type Member = { id: string; email: string | null; role: string | null; fullName: string | null; disabledAt: string | null };
type MemberRow = Member & { owed: number; count: number };

function generatePassword(): string {
  // Not a security boundary of its own — just saves the admin from
  // typing one. 16 chars from a wide alphabet is far past this app's
  // own 8-char minimum.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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
        disabled_at?: string | null;
      }>).map(
        (m): Member => ({
          id: m.id,
          email: m.email,
          role: m.role,
          fullName: m.full_name?.trim() || null,
          disabledAt: m.disabled_at ?? null,
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

  // Both invite and manage (role change / disable) are admin-only —
  // gated on the SAME permission the page itself already requires to
  // view (user_roles), just the write-level actions instead of view.
  const canManage = !!profile?.role && hasPermission(profile.role, "user_roles", "update");
  const canInvite = !!profile?.role && hasPermission(profile.role, "user_roles", "create");

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState(generatePassword());
  const [inviteRole, setInviteRole] = useState<string>("field_lead");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleInvite = useCallback(async () => {
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), password: invitePassword, role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to add this team member.");
      setShowInvite(false);
      setInviteEmail("");
      setInvitePassword(generatePassword());
      setInviteRole("field_lead");
      await load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to add this team member.");
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, invitePassword, inviteRole, load]);

  const handleRoleChange = useCallback(
    async (userId: string, role: string) => {
      setUpdatingId(userId);
      try {
        const res = await fetch(`/api/team/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Failed to update role.");
        setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, role } : r)));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to update role.");
      } finally {
        setUpdatingId(null);
      }
    },
    []
  );

  const handleToggleDisabled = useCallback(
    async (userId: string, disable: boolean) => {
      if (disable && !confirm("Disable this user? They'll lose access immediately — this doesn't delete their account or history.")) return;
      setUpdatingId(userId);
      try {
        const res = await fetch(`/api/team/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disabled: disable }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Failed to update this user.");
        setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, disabledAt: disable ? new Date().toISOString() : null } : r)));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to update this user.");
      } finally {
        setUpdatingId(null);
      }
    },
    []
  );

  return (
    <PageContainer>
      <PageHeader
        title="Team"
        description="Who belongs to this company, and what they're owed back."
        actions={
          canInvite ? (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="size-4" /> Invite
            </button>
          ) : undefined
        }
      />

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
              <div key={m.id} className={`flex items-center justify-between gap-3 px-2.5 py-2.5 ${m.disabledAt ? "opacity-60" : ""}`}>
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
                    {m.disabledAt && <Badge tone="danger">Disabled</Badge>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 capitalize text-xs text-muted-foreground">
                    {canManage && m.id !== profile?.userId ? (
                      <select
                        value={m.role ?? ""}
                        disabled={updatingId === m.id}
                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        className="rounded-md border border-input bg-card px-1.5 py-0.5 text-[11px] capitalize disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL(r)}</option>
                        ))}
                      </select>
                    ) : (
                      m.role && <Badge tone="neutral">{ROLE_LABEL(m.role)}</Badge>
                    )}
                    {m.fullName && m.email && (
                      <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right capitalize">
                    <div className={`text-sm font-semibold ${m.owed > 0 ? "text-warning" : "text-muted-foreground"}`}>
                      {money(m.owed)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.owed > 0 ? `${m.count} expense${m.count === 1 ? "" : "s"} owed` : "nothing owed"}
                    </div>
                  </div>
                  {canManage && m.id !== profile?.userId && (
                    <button
                      type="button"
                      disabled={updatingId === m.id}
                      onClick={() => handleToggleDisabled(m.id, !m.disabledAt)}
                      className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {m.disabledAt ? "Enable" : "Disable"}
                    </button>
                  )}
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

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !inviting && setShowInvite(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Invite a team member</h3>
              <button type="button" onClick={() => setShowInvite(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm capitalize"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL(r)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Password</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setInvitePassword(generatePassword())}
                    className="shrink-0 rounded-lg border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    New
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No email is sent — copy this and share it with them yourself.
                </p>
              </div>

              {inviteError && <p className="text-xs text-danger">{inviteError}</p>}

              <button
                type="button"
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {inviting ? "Creating…" : "Create account"}
              </button>
            </div>
          </div>
        </div>
      )}
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
