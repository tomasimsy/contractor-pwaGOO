"use client";

/**
 * /expense-v2 — a "who fronted the money?" entry point for recording an
 * expense, plus two read-only money-owed summaries.
 *
 * ============================================================
 * WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT
 * ============================================================
 * It adds exactly one thing: asking "did YOU pay, or did the company?"
 * BEFORE the form opens, instead of leaving `paidByType` buried among
 * the other fields where it is easy to miss. That single question is the
 * difference between an expense that creates a reimbursement debt and
 * one that does not, so it deserves to be the first decision rather
 * than the fifteenth.
 *
 * Everything after that choice is ExpenseFormV2, which collects the
 * same fields through the same shared pieces (the vendor/payee
 * directories, CreateOrSelect, PAYMENT_METHODS, EXPENSE_TYPES) and
 * writes through `ExpenseService.create` — the same call every other
 * entry point uses. ExpenseDialog is left completely untouched, and
 * ONE PAYMENT = ONE EXPENSE RECORD still holds: this page produces
 * ordinary `estimate_expenses` rows and nothing else.
 *
 * NO NEW CALCULATIONS. Both summary cards are renders of figures the
 * service layer already produces:
 *
 *   Pending reimbursements  ->  calculateExpenseTotals(all company
 *                               expenses).outstandingReimbursements
 *                               — the same function ExpenseService
 *                               .getTotalsForProject uses, just at
 *                               company scope. Its rule (reimbursable
 *                               && reimbursementStatus === "pending")
 *                               lives in financialCalculations.ts and
 *                               is not restated here.
 *
 *   Payee outstanding       ->  FinancialEngine.getPayeeBalances(scope,
 *                               role).outstanding, per payee, exactly
 *                               as /subcontractors, /agents and both
 *                               assignment panels already render it.
 *
 * The only arithmetic in this file is summing the per-payee `outstanding`
 * values the engine returned, for a single headline figure. That is
 * display aggregation of an already-computed field, not a cost model.
 *
 * DISPLAY ONLY — no payout, no settlement, no `markReimbursed`. Marking
 * a reimbursement paid remains where it already lives (the Agent and
 * Subcontractor modules); this page shows what is owed and links to
 * where it is handled. Adding a payment workflow here would be the
 * second implementation this codebase's whole service-layer design
 * exists to prevent.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Receipt, Users, HardHat, ArrowLeft, Home, HandCoins } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { ExpenseFormV2 } from "@/components/expenses/ExpenseFormV2";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { calculateExpenseTotals } from "@/lib/services/financialCalculations";
import type { ExpenseCreateInput, PaidByType } from "@/lib/services/expenseService";
import type { PayeeBalance } from "@/lib/services/types";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The two buttons on every job row. `paidByType` and `reimbursable`
 * are the real expense fields being seeded — no new concept, just the
 * two combinations that matter in practice. */
const ENTRY_CHOICES = [
  {
    id: "i_paid" as const,
    shortLabel: "I Paid",
    paidByType: "employee" as PaidByType,
    reimbursable: true,
  },
  {
    id: "company_paid" as const,
    shortLabel: "Company Paid",
    paidByType: "company" as PaidByType,
    reimbursable: false,
  },
];

type ChoiceId = (typeof ENTRY_CHOICES)[number]["id"];

function ExpenseV2Content() {
  const { expenseService, projectService, estimateService, financialEngine } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;
  /** profiles.id IS the auth user id, and that is what `paid_by_id`
   * holds — so this is the key for "what am I owed". */
  const userId = profile?.userId ?? null;

  // Both are picked in ONE tap now (a job row's [I Paid] / [Company
  // Paid] button), so they are set together rather than in two steps.
  const [choice, setChoice] = useState<ChoiceId | null>(null);
  // Only the ESTIMATE is chosen. The project comes from that estimate —
  // asking for both was two pickers for one fact, and they could
  // disagree.
  const [estimateId, setEstimateId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);

  const [pendingReimbursementTotal, setPendingReimbursementTotal] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [owedToMe, setOwedToMe] = useState(0);
  const [owedToMeCount, setOwedToMeCount] = useState(0);
  const [subBalances, setSubBalances] = useState<PayeeBalance[]>([]);
  const [agentBalances, setAgentBalances] = useState<PayeeBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const scope = { companyId };
      const [projectList, estimateList, allExpenses, pending, mine, subs, agents] = await Promise.all([
        projectService.list(scope),
        estimateService.list(scope),
        // Company-wide cost rows, run through the SAME breakdown function
        // ExpenseService.getTotalsForProject uses. No local re-derivation
        // of what "outstanding reimbursement" means.
        expenseService.listForCompany(companyId),
        expenseService.listPendingReimbursements(companyId),
        // Same method, narrowed by payee — it filters on `paid_by_id`,
        // which is exactly the field "I Paid" now seeds with the
        // signed-in user. No new query and no new rule.
        userId
          ? expenseService.listPendingReimbursements(companyId, userId)
          : Promise.resolve([]),
        financialEngine.getPayeeBalances(scope, "subcontractor"),
        financialEngine.getPayeeBalances(scope, "agent"),
      ]);
      setProjects(projectList);
      setEstimates(estimateList);
      setPendingReimbursementTotal(calculateExpenseTotals(allExpenses).outstandingReimbursements);
      setPendingCount(pending.length);
      // Reuses the same breakdown function as the company-wide figure,
      // just over this person's rows.
      setOwedToMe(calculateExpenseTotals(mine).outstandingReimbursements);
      setOwedToMeCount(mine.length);
      setSubBalances(subs.filter((b) => b.outstanding > 0));
      setAgentBalances(agents.filter((b) => b.outstanding > 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expense data.");
    } finally {
      setLoading(false);
    }
  }, [companyId, userId, projectService, estimateService, expenseService, financialEngine]);

  useEffect(() => {
    load();
  }, [load]);

  const projectsById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );

  const selectedEstimate = useMemo(
    () => estimates.find((e) => e.id === estimateId) ?? null,
    [estimates, estimateId]
  );

  /** Derived, never picked. An estimate already knows its project, so
   * reading it here keeps the two in step by construction. */
  const projectId = selectedEstimate?.projectId ?? "";

  const estimateLabel = useCallback(
    (e: Estimate) => e.title || e.estimateNumber || e.id.slice(0, 8),
    []
  );

  /** The ten most recently WORKED-ON jobs — ordered by updatedAt, not
   * createdAt: an expense almost always belongs to whatever was touched
   * last, which is not the same as whatever was created last. */
  const recentJobs = useMemo(
    () => [...estimates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10),
    [estimates]
  );

  const selectedChoice = ENTRY_CHOICES.find((c) => c.id === choice) ?? null;

  // Summing an already-computed field for one headline number.
  const subOutstanding = subBalances.reduce((sum, b) => sum + b.outstanding, 0);
  const agentOutstanding = agentBalances.reduce((sum, b) => sum + b.outstanding, 0);

  async function handleSubmit(
    input: Omit<ExpenseCreateInput, "companyId" | "projectId">
  ): Promise<boolean> {
    if (!companyId) return false;
    try {
      // The one and only write path — same service call as every other
      // expense entry point in the app.
      await expenseService.create({
        ...input,
        companyId,
        projectId: projectId || null,
        estimateId: estimateId || input.estimateId || null,
      });
      setSavedNote("Expense recorded.");
      setDialogOpen(false);
      setChoice(null);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense.");
      return false;
    }
  }

  if (!companyId) return null;

  return (
    <PageContainer>
      <PageHeader
        title="Quick Expense"
        description="Tap a job, then say who paid."
        actions={
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted sm:text-sm"
          >
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
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
      {savedNote && (
        <div className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success sm:text-sm">
          {savedNote}
        </div>
      )}

      {/* ---------- SUMMARY (display only) ---------- */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            {/* Personal first — for whoever is looking at this page,
                "what am I owed" is the figure they came for. Same
                pending-reimbursement rule as the company card, just
                filtered to their own paid_by_id. */}
            <StatCard
              label="Owed To You"
              value={money(owedToMe)}
              icon={HandCoins}
              tone={owedToMe > 0 ? "warning" : "neutral"}
              hint={
                owedToMe > 0
                  ? `${owedToMeCount} expense${owedToMeCount === 1 ? "" : "s"} you fronted`
                  : "Nothing outstanding for you"
              }
            />
            <StatCard
              label="Pending Reimbursements"
              value={money(pendingReimbursementTotal ?? 0)}
              icon={Receipt}
              tone={(pendingReimbursementTotal ?? 0) > 0 ? "warning" : "neutral"}
              hint={`${pendingCount} expense${pendingCount === 1 ? "" : "s"} — everyone`}
            />
            <StatCard
              label="Subcontractors Outstanding"
              value={money(subOutstanding)}
              icon={HardHat}
              tone={subOutstanding > 0 ? "warning" : "neutral"}
              hint={`${subBalances.length} payee${subBalances.length === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Agents Outstanding"
              value={money(agentOutstanding)}
              icon={Users}
              tone={agentOutstanding > 0 ? "warning" : "neutral"}
              hint={`${agentBalances.length} payee${agentBalances.length === 1 ? "" : "s"}`}
            />
          </>
        )}
      </div>

      {/* ---------- ENTRY CHOICE ---------- */}
      {/* ---------- RECENT JOBS ----------
          One tap records the two facts that matter: WHICH job, and WHO
          fronted the money. The project is not asked for — the estimate
          already carries it (projectId is derived below), and the date
          is today. Everything else is optional and lives on the form. */}
      <section className="mb-5 rounded-xl border border-border bg-card p-3 shadow-xs sm:p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Recent jobs
        </h2>

        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : recentJobs.length === 0 ? (
          <EmptyState
            icon={Home}
            title="No jobs yet"
            description="Create an estimate first — expenses attach to a job."
          />
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
            {recentJobs.map((e) => {
              const project = e.projectId ? projectsById[e.projectId] : undefined;
              return (
                <div
                  key={e.id}
                  className="flex flex-col gap-2 px-2.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Home className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {estimateLabel(e)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {project?.name ?? "No project"}
                      </span>
                    </span>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {ENTRY_CHOICES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          // One tap sets the job AND who paid, then goes
                          // straight to the form.
                          setEstimateId(e.id);
                          setChoice(c.id);
                          setSavedNote(null);
                          setDialogOpen(true);
                        }}
                        className={`min-h-9 flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none ${
                          c.id === "i_paid"
                            ? "bg-warning/15 text-warning hover:bg-warning/25"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                      >
                        {c.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- WHO IS OWED (display only) ---------- */}
      <section className="rounded-xl border border-border bg-card p-3 shadow-xs sm:p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Outstanding balances
        </h2>

        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : subBalances.length === 0 && agentBalances.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nothing outstanding"
            description="No subcontractor or agent has an unpaid balance."
          />
        ) : (
          <div className="space-y-4">
            {[
              { rows: subBalances, label: "Subcontractors", href: "/subcontractors", icon: HardHat },
              { rows: agentBalances, label: "Agents", href: "/agents", icon: Users },
            ].map(({ rows, label, href, icon: Icon }) =>
              rows.length === 0 ? null : (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Icon className="size-3.5 text-primary" /> {label}
                    </span>
                    {/* Settlement lives in those modules, not here. */}
                    <Link href={href} className="text-xs font-medium text-primary hover:underline">
                      Manage
                    </Link>
                  </div>
                  <div className="divide-y divide-border/60 rounded-lg border border-border/60">
                    {rows.map((b) => (
                      <div key={b.payeeId} className="flex items-center justify-between gap-3 px-2.5 py-2">
                        <span className="min-w-0 truncate text-xs text-foreground">{b.payeeName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {money(b.paid)} of {money(b.contracted)} ·{" "}
                          <span className="font-semibold text-foreground">{money(b.outstanding)} left</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* Seeded with the answer already given above. */}
      {dialogOpen && selectedChoice && (
        <ExpenseFormV2
          companyId={companyId}
          projectId={projectId || null}
          estimateId={estimateId || null}
          initialPaidByType={selectedChoice.paidByType}
          initialReimbursable={selectedChoice.reimbursable}
          // "I Paid" means the signed-in user fronted it, so they are
          // who gets reimbursed. profiles.id IS the auth user id, which
          // is what paid_by_id holds.
          initialPaidById={selectedChoice.id === "i_paid" ? profile?.userId ?? null : null}
          initialPaidByLabel={
            selectedChoice.id === "i_paid" ? profile?.fullName || "you" : null
          }
          onClose={() => setDialogOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </PageContainer>
  );
}

export default function ExpenseV2Page() {
  return (
    <RequirePermission resource="expense" action="create">
      <ExpenseV2Content />
    </RequirePermission>
  );
}
