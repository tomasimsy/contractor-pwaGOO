"use client";

/**
 * /expense-v2
 *
 * Expense-focused entry point.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  HardHat,
  ArrowLeft,
  Home,
  HandCoins,
  ArrowRight,
  Receipt,
  PlusCircle,
  TrendingUp,
} from "lucide-react";

import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { ExpenseFormV2 } from "@/components/expenses/ExpenseFormV2";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { calculateExpenseTotals } from "@/lib/services/financialCalculations";

import type {
  ExpenseCreateInput,
  PaidByType,
} from "@/lib/services/expenseService";
import type { PayeeBalance } from "@/lib/services/types";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";

const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

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
  const {
    expenseService,
    projectService,
    estimateService,
    financialEngine,
  } = useServices();

  const { profile } = useAuth();

  const companyId = profile?.companyId ?? null;
  const userId = profile?.userId ?? null;

  const [estimateExpenseTotals, setEstimateExpenseTotals] = useState<
    Record<string, number>
  >({});

  const [choice, setChoice] = useState<ChoiceId | null>(null);
  const [estimateId, setEstimateId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);

  const [owedToMe, setOwedToMe] = useState(0);

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

      const [
        projectList,
        estimateList,
        mine,
        subs,
        agents,
      ] = await Promise.all([
        projectService.list(scope),
        estimateService.list(scope),

        userId
          ? expenseService.listPendingReimbursements(companyId, userId)
          : Promise.resolve([]),

        financialEngine.getPayeeBalances(
          scope,
          "subcontractor"
        ),

        financialEngine.getPayeeBalances(
          scope,
          "agent"
        ),
      ]);

      const expenseResults = await Promise.all(
        estimateList.map(async (estimate) => {
          try {
            const expenses = await expenseService.listForEstimate(
              estimate.id
            );

            const total = expenses.reduce(
              (sum, expense) => sum + expense.amount,
              0
            );

            return [estimate.id, total] as const;
          } catch {
            return [estimate.id, 0] as const;
          }
        })
      );

      setProjects(projectList);
      setEstimates(estimateList);

      setEstimateExpenseTotals(
        Object.fromEntries(expenseResults)
      );

      setOwedToMe(
        calculateExpenseTotals(mine).outstandingReimbursements
      );

      setSubBalances(
        subs.filter((b) => b.outstanding > 0)
      );

      setAgentBalances(
        agents.filter((b) => b.outstanding > 0)
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load expense data."
      );
    } finally {
      setLoading(false);
    }
  }, [
    companyId,
    userId,
    projectService,
    estimateService,
    expenseService,
    financialEngine,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const projectsById = useMemo(
    () =>
      Object.fromEntries(
        projects.map((p) => [p.id, p])
      ),
    [projects]
  );

  const selectedEstimate = useMemo(
    () =>
      estimates.find((e) => e.id === estimateId) ?? null,
    [estimates, estimateId]
  );

  const projectId = selectedEstimate?.projectId ?? "";

  const estimateLabel = useCallback(
    (e: Estimate) =>
      e.title ||
      e.estimateNumber ||
      e.id.slice(0, 8),
    []
  );

  const recentJobs = useMemo(
    () =>
      [...estimates]
        .sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        )
        .slice(0, 10),
    [estimates]
  );

  const selectedChoice =
    ENTRY_CHOICES.find(
      (c) => c.id === choice
    ) ?? null;

  async function handleSubmit(
    input: Omit<
      ExpenseCreateInput,
      "companyId" | "projectId"
    >
  ): Promise<boolean> {
    if (!companyId) return false;

    try {
      await expenseService.create({
        ...input,
        companyId,
        projectId: projectId || null,
        estimateId:
          estimateId ||
          input.estimateId ||
          null,
      });

      setSavedNote("Expense recorded successfully.");
      setDialogOpen(false);
      setChoice(null);

      await load();

      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save expense."
      );

      return false;
    }
  }

  if (!companyId) return null;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 pb-16">
      <PageContainer>
        {/* -------------------------------------------------------
            HEADER
        ------------------------------------------------------- */}
        <div className="mb-8 pt-6">
          <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-xs ring-1 ring-neutral-200/80 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100">
                <Receipt className="size-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-950">
                  Expense Center
                </h1>
                <p className="text-sm text-neutral-500">
                  Track job expenditures, process receipts, and audit balances.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-neutral-100 pt-4 sm:border-t-0 sm:pt-0">
              <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-4 py-2.5 ring-1 ring-neutral-200/60">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                  <HandCoins className="size-4" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Pending Owed
                  </div>
                  <div
                    className={`text-sm font-bold tabular-nums ${
                      owedToMe > 0 ? "text-red-600" : "text-neutral-900"
                    }`}
                  >
                    {money(owedToMe)}
                  </div>
                </div>
              </div>

              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-neutral-800 active:scale-[0.98]"
              >
                <ArrowLeft className="size-4" />
                <span>Dashboard</span>
              </Link>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------
            ALERTS
        ------------------------------------------------------- */}
        {error && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3.5 text-xs font-semibold text-red-800 ring-1 ring-red-200">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => load()}
              className="underline underline-offset-2 hover:text-red-950"
            >
              Retry
            </button>
          </div>
        )}

        {savedNote && (
          <div className="mb-6 rounded-xl bg-emerald-50 px-4 py-3.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            {savedNote}
          </div>
        )}

        {/* -------------------------------------------------------
            RECENT JOBS LIST
        ------------------------------------------------------- */}
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
                Active Projects & Estimates
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl bg-neutral-200/60"
                />
              ))}
            </div>
          ) : recentJobs.length === 0 ? (
            <EmptyState
              icon={Home}
              title="No jobs available"
              description="Create an active estimate first to begin mapping expenses."
            />
          ) : (
            <div className="space-y-3.5">
              {recentJobs.map((e) => {
                const project = e.projectId
                  ? projectsById[e.projectId]
                  : undefined;

                const total = estimateExpenseTotals[e.id] ?? 0;

                return (
                  <div
                    key={e.id}
                    className="group relative flex flex-col justify-between gap-4 rounded-2xl bg-white p-5 shadow-xs ring-1 ring-neutral-200/70 transition-all hover:shadow-md hover:ring-neutral-300 sm:flex-row sm:items-center"
                  >
                    {/* Left Side: Info & Context */}
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 transition-colors group-hover:bg-red-50 group-hover:text-red-600">
                        <Receipt className="size-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-400">
                          <span className="inline-flex items-center gap-1.5 text-neutral-600 font-semibold">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            {profile?.fullName || "User"}
                          </span>
                          <span>/</span>
                          <span className="truncate text-neutral-500">
                            {project?.name ?? "General Project"}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center gap-3">
                          <Link
                            href={`/estimates/${e.id}`}
                            className="truncate text-base font-bold text-neutral-900 transition-colors hover:text-red-600"
                          >
                            {estimateLabel(e)}
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Expense Total + Quick Record Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-5 border-t border-neutral-100 pt-3 sm:border-t-0 sm:pt-0">
                      <div className="text-left sm:text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                          Total Logged
                        </div>
                        <div className="text-base font-bold tabular-nums text-neutral-900">
                          {money(total)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {ENTRY_CHOICES.map((c) => {
                          const isPayByMe = c.id === "i_paid";

                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setEstimateId(e.id);
                                setChoice(c.id);
                                setSavedNote(null);
                                setDialogOpen(true);
                              }}
                              className={`h-9 px-3.5 text-xs font-bold rounded-xl transition-all shadow-2xs active:scale-95 ${
                                isPayByMe
                                  ? "bg-neutral-900 text-white hover:bg-neutral-800"
                                  : "bg-red-600 text-white hover:bg-red-700 shadow-xs"
                              }`}
                            >
                              {c.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* -------------------------------------------------------
            OUTSTANDING BALANCES SECTION
        ------------------------------------------------------- */}
        <section className="rounded-2xl bg-white p-6 shadow-xs ring-1 ring-neutral-200/80">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold tracking-tight text-neutral-900">
                Outstanding Payee Balances
              </h2>
              <p className="text-xs text-neutral-500">
                Pending obligations tracking across external partners.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              Crunching numbers...
            </div>
          ) : subBalances.length === 0 && agentBalances.length === 0 ? (
            <div className="py-6 text-center text-xs text-neutral-400 rounded-xl bg-neutral-50">
              All accounts balanced. No active pending debts.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  rows: subBalances,
                  label: "Subcontractors",
                  href: "/subcontractors",
                  icon: HardHat,
                },
                {
                  rows: agentBalances,
                  label: "Agents",
                  href: "/agents",
                  icon: Users,
                },
              ].map(
                ({ rows, label, href, icon: Icon }) =>
                  rows.length === 0 ? null : (
                    <div key={label} className="rounded-xl bg-neutral-50/60 p-4 ring-1 ring-neutral-200/60">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs font-bold text-neutral-800">
                          <Icon className="size-4 text-red-600" />
                          {label}
                        </span>

                        <Link
                          href={href}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          View all
                        </Link>
                      </div>

                      <div className="divide-y divide-neutral-200/60 overflow-hidden rounded-lg bg-white ring-1 ring-neutral-200/60">
                        {rows.map((b) => (
                          <div
                            key={b.payeeId}
                            className="flex items-center justify-between px-4 py-3 text-xs"
                          >
                            <span className="font-semibold text-neutral-900 truncate">
                              {b.payeeName}
                            </span>
                            <span className="text-neutral-500 shrink-0 tabular-nums">
                              {money(b.paid)} / {money(b.contracted)} ·{" "}
                              <span className="font-bold text-red-600">
                                {money(b.outstanding)} due
                              </span>
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

        {/* -------------------------------------------------------
            FORM DIALOG
        ------------------------------------------------------- */}
        {dialogOpen && selectedChoice && (
          <ExpenseFormV2
            companyId={companyId}
            projectId={projectId || null}
            estimateId={estimateId || null}
            initialPaidByType={selectedChoice.paidByType}
            initialReimbursable={selectedChoice.reimbursable}
            initialPaidById={
              selectedChoice.id === "i_paid" ? userId : null
            }
            initialPaidByLabel={
              selectedChoice.id === "i_paid"
                ? profile?.fullName || "you"
                : null
            }
            onClose={() => setDialogOpen(false)}
            onSubmit={handleSubmit}
            onChanged={load}
          />
        )}
      </PageContainer>
    </div>
  );
}

export default function ExpenseV2Page() {
  return (
    <RequirePermission resource="expense" action="create">
      <ExpenseV2Content />
    </RequirePermission>
  );
}