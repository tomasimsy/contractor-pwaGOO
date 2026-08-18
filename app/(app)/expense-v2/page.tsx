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
} from "lucide-react";

import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { ExpenseFormV2, type ExpenseFormSubmitInput } from "@/components/expenses/ExpenseFormV2";
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
    expenseReceiptService,
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

  /** `silent`: skip the `loading` flip. Used for the refresh that runs
   * right after recording an expense — the initial page mount SHOULD
   * show the loading skeleton, but re-running the same full reload
   * after every submit must not blank the whole list back to
   * placeholders (that's what read as a "freeze": the toast says
   * saved, then everything you were just looking at disappears for a
   * few seconds while unrelated company-wide data re-fetches). */
  const load = useCallback(async (silent = false) => {
    if (!companyId) return;

    if (!silent) setLoading(true);
    setError(null);

    try {
      const scope = { companyId };

      // ONE company-wide expense fetch — was previously N (one
      // `listForEstimate` call per estimate, run in parallel but still
      // N round trips) every single time this ran, including after
      // every submit. Same call `/expenses` already uses.
      const [projectList, estimateList, allExpenses, mine, subs, agents] = await Promise.all([
        projectService.list(scope),
        estimateService.list(scope),
        expenseService.listForCompany(companyId),

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

      const totalsByEstimate: Record<string, number> = {};
      for (const expense of allExpenses) {
        if (!expense.estimateId) continue;
        totalsByEstimate[expense.estimateId] = (totalsByEstimate[expense.estimateId] ?? 0) + expense.amount;
      }

      setProjects(projectList);
      setEstimates(estimateList);
      setEstimateExpenseTotals(totalsByEstimate);

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
      if (!silent) setLoading(false);
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

  // "Active" vs "Completed" here checks the job's PROJECT status, not
  // the estimate's own status — completion is a fact about the
  // project, not the paperwork (see EstimateService.listPage's doc
  // comment for the same rule applied on the Estimates list's
  // lifecycle tabs).
  const [jobFilter, setJobFilter] = useState<"active" | "completed" | "all">("active");
  const isJobComplete = useCallback(
    (e: Estimate) => {
      const project = projectsById[e.projectId];
      return project?.status === "completed" || project?.status === "archived";
    },
    [projectsById]
  );

  const recentJobs = useMemo(
    () =>
      estimates
        // This page tracks expenses/receipts against a real bill — an
        // estimate that hasn't been signed into an invoice yet has
        // nothing to reconcile expenses against.
        .filter((e) => e.status === "converted_to_invoice")
        .filter((e) => {
          if (jobFilter === "active") return !isJobComplete(e);
          if (jobFilter === "completed") return isJobComplete(e);
          return true;
        })
        // Newest ESTIMATE first — createdAt, not the last-edited
        // updatedAt this used before.
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10),
    [estimates, jobFilter, isJobComplete]
  );

  const selectedChoice =
    ENTRY_CHOICES.find(
      (c) => c.id === choice
    ) ?? null;

  async function handleSubmit(
    input: ExpenseFormSubmitInput
  ): Promise<boolean> {
    if (!companyId) return false;

    // Client-only receipt fields — never part of ExpenseCreateInput/the
    // expense row itself. Stripped here so `expense` below is a real,
    // known ExpenseCreateInput passed to expenseService.create.
    const { receiptFile, receiptVendor, receiptAmount, receiptDate, ...expenseInput } = input;

    try {
      const expense = await expenseService.create({
        ...expenseInput,
        companyId,
        projectId: projectId || null,
        estimateId:
          estimateId ||
          expenseInput.estimateId ||
          null,
      });

      setDialogOpen(false);
      setChoice(null);

      // Receipt photo is attached AFTER the expense exists (needs its
      // real id for the storage path + the expense_receipts FK) — see
      // app/api/expense-receipts/upload/route.ts and
      // ExpenseReceiptService. A failure here must never make the
      // whole submission look like it failed: the expense itself is
      // already saved by this point, same partial-success discipline
      // signEstimate's invoice-creation catch block uses.
      //
      // The success message is set AFTER this block (not before it, as
      // it used to be) and names the receipt specifically — previously
      // it said "Expense recorded successfully" the instant the modal
      // closed, before the upload had even started, with no later
      // confirmation either way. That silence read as "did the photo
      // actually save?" even on a fully successful upload.
      if (receiptFile) {
        try {
          const formData = new FormData();
          formData.append("file", receiptFile);
          formData.append("expenseId", expense.id);
          // A dropped mobile connection otherwise hangs this fetch
          // indefinitely — the expense itself is already saved by this
          // point, but the "saved" toast (and the receipt) would never
          // resolve either way. Bound it so a bad connection surfaces
          // as a clear failure instead of an indefinite wait.
          const uploadController = new AbortController();
          const uploadTimeout = setTimeout(() => uploadController.abort(), 30_000);
          let res: Response;
          try {
            res = await fetch("/api/expense-receipts/upload", {
              method: "POST",
              body: formData,
              signal: uploadController.signal,
            });
          } finally {
            clearTimeout(uploadTimeout);
          }
          // A rejection before the route handler even runs (e.g. a
          // request-body-size limit) comes back as plain text/HTML, not
          // JSON — blindly calling res.json() on that produced a
          // cryptic "Unexpected token 'R'..." (the body literally
          // starting with "Request Entity Too Large"). Check the
          // content-type first so that case gets a readable message
          // instead of a JSON.parse crash.
          const isJson = res.headers.get("content-type")?.includes("application/json");
          const body = isJson ? await res.json() : null;
          if (!res.ok) {
            throw new Error(body?.error || `Upload rejected (HTTP ${res.status} ${res.statusText || ""}).`.trim());
          }
          if (!body) throw new Error("Upload succeeded but the server response wasn't understood.");

          await expenseReceiptService.create({
            expenseId: expense.id,
            companyId,
            receiptFileUrl: body.url,
            receiptDate: receiptDate ?? null,
            receiptAmount: receiptAmount ?? null,
            receiptVendor: receiptVendor ?? null,
            uploadedBy: profile?.userId ?? null,
          });
          setSavedNote("Expense and receipt photo saved successfully.");
        } catch (receiptErr) {
          const message =
            receiptErr instanceof Error
              ? receiptErr.name === "AbortError"
                ? "upload timed out — check your connection and try attaching it again"
                : receiptErr.message
              : "unknown error";
          setSavedNote(`Expense recorded, but the receipt photo failed to attach: ${message}`);
        }
      } else {
        setSavedNote("Expense recorded successfully.");
      }

      // Silent — the modal already closed and the toast already shows;
      // the list should just quietly update with fresh numbers, not
      // blank back to loading skeletons for a full company-wide reload.
      await load(true);

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
<div className="min-h-screen bg-gray-50/80 text-gray-900 pb-16">
  <PageContainer>
    {/* -------------------------------------------------------
        HEADER - COMPACT
    ------------------------------------------------------- */}
    <div className="mb-6 pt-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm border border-gray-200/60 sm:p-5">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-200">
            <Receipt className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-gray-900 sm:text-lg">
              Expense Center
            </h1>
            <p className="text-xs text-gray-500 truncate sm:text-sm">
              Track job expenditures & receipts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-1.5 border border-amber-200/50">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <HandCoins className="size-3.5" />
            </div>
            <div>
              <div className="text-[8px] font-bold uppercase tracking-wider text-amber-600/70">
                Owed
              </div>
              <div
                className={`text-xs font-bold tabular-nums ${
                  owedToMe > 0 ? "text-amber-600" : "text-gray-900"
                }`}
              >
                {money(owedToMe)}
              </div>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-gray-800 hover:shadow-md active:scale-[0.98]"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden xs:inline">Dashboard</span>
          </Link>
        </div>
      </div>
    </div>

    {/* -------------------------------------------------------
        ALERTS
    ------------------------------------------------------- */}
    {error && (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-rose-50/90 px-3 py-2.5 text-xs font-semibold text-rose-800 border border-rose-200/50">
        <span className="flex items-center gap-2">
          <span className="text-rose-500">⚠</span>
          {error}
        </span>
        <button
          type="button"
          onClick={() => load()}
          className="font-medium text-rose-700 underline-offset-2 hover:underline"
        >
          Retry
        </button>
      </div>
    )}

    {savedNote && (
      <div className="mb-4 rounded-xl bg-emerald-50/90 px-3 py-2.5 text-xs font-semibold text-emerald-800 border border-emerald-200/50">
        <span className="flex items-center gap-2">
          <span className="text-emerald-500">✓</span>
          {savedNote}
        </span>
      </div>
    )}

    {/* -------------------------------------------------------
        RECENT JOBS LIST
    ------------------------------------------------------- */}
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Projects & Estimates
        </h2>
        <div className="flex gap-1 rounded-full border border-gray-200 bg-gray-50 p-0.5">
          {(["active", "completed", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setJobFilter(f)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                jobFilter === f ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-gray-200/50"
            />
          ))}
        </div>
      ) : recentJobs.length === 0 ? (
        <EmptyState
          icon={Home}
          title={jobFilter === "completed" ? "No completed jobs yet" : "No invoiced jobs available"}
          description={
            jobFilter === "completed"
              ? "Jobs show up here once their project is marked complete or archived."
              : "Only jobs that have been signed into an invoice show up here — sign an estimate first to begin mapping expenses."
          }
        />
      ) : (
        <div className="space-y-3">
          {recentJobs.map((e, index) => {
            const project = e.projectId
              ? projectsById[e.projectId]
              : undefined;

            const total = estimateExpenseTotals[e.id] ?? 0;
            
            // Cycle through green variations
            const colors = [
              { bg: "from-emerald-500 to-emerald-600", light: "bg-emerald-50", border: "border-emerald-200", hover: "hover:border-emerald-300", icon: "text-emerald-600" },
              { bg: "from-green-500 to-green-600", light: "bg-green-50", border: "border-green-200", hover: "hover:border-green-300", icon: "text-green-600" },
              { bg: "from-teal-500 to-teal-600", light: "bg-teal-50", border: "border-teal-200", hover: "hover:border-teal-300", icon: "text-teal-600" },
              { bg: "from-emerald-600 to-emerald-700", light: "bg-emerald-50", border: "border-emerald-200", hover: "hover:border-emerald-300", icon: "text-emerald-600" },
              { bg: "from-green-600 to-green-700", light: "bg-green-50", border: "border-green-200", hover: "hover:border-green-300", icon: "text-green-600" },
              { bg: "from-teal-600 to-teal-700", light: "bg-teal-50", border: "border-teal-200", hover: "hover:border-teal-300", icon: "text-teal-600" },
            ];
            
            const color = colors[index % colors.length];

            return (
              <div
                key={e.id}
                className={`group relative flex flex-col justify-between gap-3 rounded-2xl bg-gradient-to-br ${color.bg} p-4 shadow-sm border ${color.border} transition-all hover:shadow-md ${color.hover} sm:flex-row sm:items-center`}
              >
                {/* Left Side: Info & Context */}
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color.light} text-white shadow-sm`}>
                    <Receipt className="size-5 text-gray-700" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-white/80">
                      <span className="inline-flex items-center gap-1.5 text-white font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
                        {profile?.fullName || "User"}
                      </span>
                      <span className="text-white/50">/</span>
                      <span className="truncate text-white/70">
                        {project?.name ?? "General Project"}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center gap-3">
                      <Link
                        href={`/estimates/${e.id}`}
                        className="truncate text-sm font-bold text-white transition-opacity hover:opacity-80"
                      >
                        {estimateLabel(e)}
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Right Side: Expense Total + Quick Record Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-white/20 pt-3 sm:border-t-0 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <div className="text-[8px] font-bold uppercase tracking-wider text-white/60">
                      Total Logged
                    </div>
                    <div className="text-sm font-bold tabular-nums text-white">
                      {money(total)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
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
                          className={`h-8 px-3 text-[10px] font-bold rounded-xl transition-all shadow-sm active:scale-95 ${
                            isPayByMe
                              ? "bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border border-white/30"
                              : "bg-white text-gray-900 hover:bg-white/90 hover:shadow-md border border-white/30"
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
    <section className="rounded-2xl bg-white p-5 shadow-sm border border-gray-200/60">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-gray-900">
            Outstanding Payee Balances
          </h2>
          <p className="text-xs text-gray-500">
            Pending obligations across partners
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-gray-400">
          Crunching numbers...
        </div>
      ) : subBalances.length === 0 && agentBalances.length === 0 ? (
        <div className="py-5 text-center text-xs text-gray-400 rounded-xl bg-gray-50/50 border border-gray-200/50">
          All accounts balanced. No active pending debts.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              rows: subBalances,
              label: "Subcontractors",
              href: "/subcontractors",
              icon: HardHat,
              color: "from-emerald-500 to-emerald-600",
              light: "bg-emerald-50",
            },
            {
              rows: agentBalances,
              label: "Agents",
              href: "/agents",
              icon: Users,
              color: "from-teal-500 to-teal-600",
              light: "bg-teal-50",
            },
          ].map(
            ({ rows, label, href, icon: Icon, color, light }) =>
              rows.length === 0 ? null : (
                <div key={label} className={`rounded-xl bg-gradient-to-br ${color} p-4 border border-white/20 shadow-sm`}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-bold text-white">
                      <Icon className="size-4" />
                      {label}
                    </span>

                    <Link
                      href={href}
                      className="text-xs font-semibold text-white/80 hover:text-white hover:underline transition-colors"
                    >
                      View all →
                    </Link>
                  </div>

                  <div className="divide-y divide-white/20 overflow-hidden rounded-lg bg-white/95 backdrop-blur-sm border border-white/30">
                    {rows.map((b) => (
                      <div
                        key={b.payeeId}
                        className="flex items-center justify-between px-3 py-2.5 text-xs hover:bg-white/50 transition-colors"
                      >
                        <span className="font-semibold text-gray-700 truncate">
                          {b.payeeName}
                        </span>
                        <span className="text-gray-500 shrink-0 tabular-nums">
                          {money(b.paid)} / {money(b.contracted)} ·{" "}
                          <span className="font-bold text-amber-600">
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