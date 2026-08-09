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
 */import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users, HardHat, ArrowLeft, Home, HandCoins, ArrowRight, Receipt } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
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

const ENTRY_CHOICES = [
  {
    id: "company_paid" as const,
    shortLabel: "Company Paid",
    paidByType: "company" as PaidByType,
    reimbursable: false,
  },
  {
    id: "i_paid" as const,
    shortLabel: "Pay by Me",
    paidByType: "employee" as PaidByType,
    reimbursable: true,
  },
];

type ChoiceId = (typeof ENTRY_CHOICES)[number]["id"];

function ExpenseV2Content() {
  const { expenseService, projectService, estimateService, financialEngine } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;
  const userId = profile?.userId ?? null;

  const [choice, setChoice] = useState<ChoiceId | null>(null);
  const [estimateId, setEstimateId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);

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
      const [projectList, estimateList, mine, subs, agents] = await Promise.all([
        projectService.list(scope),
        estimateService.list(scope),
        userId
          ? expenseService.listPendingReimbursements(companyId, userId)
          : Promise.resolve([]),
        financialEngine.getPayeeBalances(scope, "subcontractor"),
        financialEngine.getPayeeBalances(scope, "agent"),
      ]);
      setProjects(projectList);
      setEstimates(estimateList);
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

  const projectId = selectedEstimate?.projectId ?? "";

  const estimateLabel = useCallback(
    (e: Estimate) => e.title || e.estimateNumber || e.id.slice(0, 8),
    []
  );

  const recentJobs = useMemo(
    () => [...estimates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10),
    [estimates]
  );

  const selectedChoice = ENTRY_CHOICES.find((c) => c.id === choice) ?? null;

  async function handleSubmit(
    input: Omit<ExpenseCreateInput, "companyId" | "projectId">
  ): Promise<boolean> {
    if (!companyId) return false;
    try {
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
<div className="hidden sm:block">
  <PageHeader
    title="Record Expenses"
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
</div>

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

      {loading ? (
        <div className="m b-3 h-11 animate-pulse rounded-lg border border-border bg-card" />
      ) : (
        <div
          className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 ${
            owedToMe > 0 ? "border-warning/30 bg-warning/10" : "border-border bg-card"
          }`}
        >
          <HandCoins
            className={`size-4 shrink-0 ${owedToMe > 0 ? "text-warning" : "text-muted-foreground"}`}
            aria-hidden="true"
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Owed to you
          </span>
          <span
            className={`text-base font-bold tabular-nums ${
              owedToMe > 0 ? "text-warning" : "text-foreground"
            }`}
          >
            {money(owedToMe)}
          </span>
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {owedToMe > 0
              ? `${owedToMeCount} expense${owedToMeCount === 1 ? "" : "s"}`
              : "nothing outstanding"}
          </span>
        </div>
      )}

      <section className="mb-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
          <div className="space-y-3">
            {recentJobs.map((e) => {
              const project = e.projectId ? projectsById[e.projectId] : undefined;
              return (
                <div
                  key={e.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3.5"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Receipt className="size-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {profile?.fullName || "User"}
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground/60" />
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {project?.name ?? "No project"}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-2">
                        <Link
                          href={`/estimates/${e.id}`}
                          className="truncate text-sm font-bold text-foreground hover:underline capitalize sm:text-base"
                        >
                          {estimateLabel(e)}
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between border-t border-border/40 pt-3 sm:border-t-0 sm:pt-0 gap-3">
                    <span className="text-sm font-extrabold text-foreground sm:text-base">
                      {/* {money(0)} */}
                    </span>
                    <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
                      {ENTRY_CHOICES.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setEstimateId(e.id);
                            setChoice(c.id);
                            setSavedNote(null);
                            setDialogOpen(true);
                          }}
                          className={`h-11 px-3 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center text-center whitespace-nowrap ${
                            c.id === "i_paid"
                              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                              : "bg-warning/15 text-warning hover:bg-warning/25"
                          }`}
                        >
                          {c.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

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

      {dialogOpen && selectedChoice && (
        <ExpenseFormV2
          companyId={companyId}
          projectId={projectId || null}
          estimateId={estimateId || null}
          initialPaidByType={selectedChoice.paidByType}
          initialReimbursable={selectedChoice.reimbursable}
          initialPaidById={selectedChoice.id === "i_paid" ? profile?.userId ?? null : null}
          initialPaidByLabel={
            selectedChoice.id === "i_paid" ? profile?.fullName || "you" : null
          }
          onClose={() => setDialogOpen(false)}
          onSubmit={handleSubmit}
          onChanged={load}
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