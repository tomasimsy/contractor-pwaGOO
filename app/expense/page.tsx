"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import toast from "react-hot-toast";
import { getDeletedEntries, getProjectBundle, getProjectSummaries } from "@/lib/queries/projects";
import {
  addEntry,
  assignSubcontractorToProject,
  buildLedger,
  computePendingPayouts,
  deleteEntry,
  derivePaymentStatus,
  restoreEntry,
  summarizeFinancials,
  totalAmountPaid,
} from "@/lib/queries/expenses";
import {
  getLastSelectedProjectId,
  getRecentProjectIds,
  recordProjectAccess,
} from "@/lib/expense/recent-projects";
import type { LedgerEntry, NewEntryInput, ProjectBundle, ProjectSummary } from "@/lib/types";

import RecentProjectCards from "@/components/expense/RecentProjectCards";
import ProjectCombobox from "@/components/expense/ProjectCombobox";
import AddExpenseSheet, { type FormCategory } from "@/components/expense/AddExpenseSheet";
import CashStatusBar from "@/components/expense/CashStatusBar";
import PaymentActionCenter from "@/components/expense/PaymentActionCenter";
import QuickActionButtons from "@/components/expense/QuickActionButtons";
import AlertsAndFlags from "@/components/expense/AlertsAndFlags";
import ActiveProjects from "@/components/expense/ActiveProjects";
import ExpenseLedger from "@/components/expense/ExpenseLedger";
import DashboardPanel from "@/components/expense/desktop/DashboardPanel";
import DesktopShell from "@/components/layout/DesktopShell";

export default function ProjectExpensePage() {
  return (
    <Suspense fallback={null}>
      <ProjectExpenseContent />
    </Suspense>
  );
}

function ProjectExpenseContent() {
  const searchParams = useSearchParams();
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [isLoadingBundle, setIsLoadingBundle] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [addSheetCategory, setAddSheetCategory] = useState<FormCategory | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedLedger, setDeletedLedger] = useState<LedgerEntry[]>([]);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(false);

  useEffect(() => {
    const recentIds = getRecentProjectIds();
    if (recentIds.length > 0) {
      getProjectSummaries(recentIds).then(setRecentProjects).catch(() => {});
    }
    // A `?project=` param (e.g. from the Pending Payouts page's "View"
    // link) is an explicit deep-link intent, so it wins over whatever
    // project this browser last had open.
    const linkedProjectId = searchParams.get("project");
    const lastSelected = getLastSelectedProjectId();
    const initialProjectId = linkedProjectId || lastSelected;
    if (initialProjectId) setSelectedProjectId(initialProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBundle = useCallback(async (projectId: string) => {
    setIsLoadingBundle(true);
    setError(null);
    try {
      const data = await getProjectBundle(projectId);
      setBundle(data);
    } catch (err: any) {
      // PostgrestError fields (message/details/hint/code) are pulled
      // out explicitly and put in a plain object — logging the raw
      // error directly showed as `{}` because those fields aren't
      // enumerable own properties on the object as thrown.
      console.error("getProjectBundle failed:", {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
      });
      setError(`Couldn't load that project: ${err?.message ?? err?.hint ?? "unknown error"}`);
      setBundle(null);
    } finally {
      setIsLoadingBundle(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) loadBundle(selectedProjectId);
  }, [selectedProjectId, loadBundle]);

  // Reset the archived view whenever the selected project changes, so
  // stale deleted rows from a previous project can't linger on screen.
  useEffect(() => {
    setShowDeleted(false);
    setDeletedLedger([]);
  }, [selectedProjectId]);

  const loadDeleted = useCallback(async () => {
    if (!bundle) return;
    setIsLoadingDeleted(true);
    try {
      const deleted = await getDeletedEntries(bundle.project.id, bundle.project.company_id);
      // Reuses buildLedger as-is — it only reads expenses/subcontractorPayments/
      // agentPayments plus the name-lookup lists, which are unchanged here.
      setDeletedLedger(buildLedger({ ...bundle, ...deleted }));
    } catch (err) {
      console.error("getDeletedEntries failed:", err);
    } finally {
      setIsLoadingDeleted(false);
    }
  }, [bundle]);

  async function toggleShowDeleted() {
    const next = !showDeleted;
    setShowDeleted(next);
    if (next) await loadDeleted();
  }

  async function handleRestoreEntry(entry: LedgerEntry) {
    try {
      await restoreEntry(entry);
      toast.success(`${entry.payeeLabel} restored`);
      if (selectedProjectId) await loadBundle(selectedProjectId);
      await loadDeleted();
    } catch {
      toast.error("Couldn't restore that entry.");
    }
  }

  function handleSelectProject(projectId: string, summary?: ProjectSummary) {
    setSelectedProjectId(projectId);
    recordProjectAccess(projectId);
    if (summary) {
      setRecentProjects((prev) => [summary, ...prev.filter((p) => p.id !== projectId)].slice(0, 5));
    }
  }

  function openAddSheet(category?: FormCategory) {
    setAddSheetCategory(category);
    setIsAddSheetOpen(true);
  }

  async function handleAddEntry(input: NewEntryInput) {
    await addEntry(input);
    // Simplest correct way to reflect the new row across three
    // possible source tables plus (for a first-time subcontractor)
    // the assignment list — reload rather than hand-patch local state.
    if (selectedProjectId) await loadBundle(selectedProjectId);
  }

  async function handleAssignSubcontractor(
    subcontractorId: string,
    name: string,
    trade: string | null,
    amount = 0,
    notes: string | null = null
  ) {
    if (!bundle) throw new Error("No project selected");
    const assigned = await assignSubcontractorToProject(
      bundle.project.id,
      bundle.project.company_id,
      subcontractorId,
      name,
      trade,
      amount,
      notes
    );
    setBundle((prev) => (prev ? { ...prev, assignedSubcontractors: [...prev.assignedSubcontractors, assigned] } : prev));
    return assigned;
  }

  async function handleDeleteEntry(entry: LedgerEntry) {
    const previous = bundle;
    setBundle((prev) => {
      if (!prev) return prev;
      if (entry.source === "expense") return { ...prev, expenses: prev.expenses.filter((e) => e.id !== entry.id) };
      if (entry.source === "subcontractor_payment")
        return { ...prev, subcontractorPayments: prev.subcontractorPayments.filter((p) => p.id !== entry.id) };
      return { ...prev, agentPayments: prev.agentPayments.filter((p) => p.id !== entry.id) };
    });
    try {
      await deleteEntry(entry); // soft delete — row stays, just hidden from here on
      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            {entry.payeeLabel} removed
            <button
              onClick={async () => {
                toast.dismiss(t.id);
                await restoreEntry(entry);
                if (selectedProjectId) await loadBundle(selectedProjectId);
              }}
              className="font-bold text-emerald-700 underline shrink-0"
            >
              Undo
            </button>
          </span>
        ),
        { duration: 6000 } // longer than the default 4s — undo toasts need real reaction time
      );
    } catch {
      setBundle(previous); // roll back on failure
    }
  }

  const ledger = bundle ? buildLedger(bundle) : [];
  const amountReceived = bundle ? totalAmountPaid(bundle.invoices) : 0;
  const financials = bundle ? summarizeFinancials(bundle.project.total, bundle, amountReceived) : null;
  // Revised total (original + approved change orders), not the raw
  // estimate total, once change orders can affect the contract value —
  // same precedent as app/reports/expenses/[id]/page.tsx.
  const payment = financials ? derivePaymentStatus(financials.revisedTotal, amountReceived) : null;

  // Pending-payout queue only surfaces once the client has actually
  // started paying (or the project's marked complete) — showing it for
  // a project with $0 received yet would be noise, not a useful nudge.
  const projectComplete = ["completed", "complete"].includes((bundle?.project.status || "").toLowerCase());
  const showPendingPayouts = !!bundle && (amountReceived > 0 || projectComplete);
  const pendingPayouts = bundle && showPendingPayouts ? computePendingPayouts(bundle) : [];

  // For Change Order create/edit/submit/approve/reject actions, which
  // write straight to Supabase (like handleAddEntry) rather than
  // mutating local state — simplest correct way to reflect their
  // effect on totals/statuses is a full bundle reload, same reasoning
  // as handleAddEntry above.
  const refreshBundle = useCallback(async () => {
    if (selectedProjectId) await loadBundle(selectedProjectId);
  }, [selectedProjectId, loadBundle]);

  return (
    <DesktopShell>
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28 lg:pb-16">
        {/* Page header + project switcher share a row on wide screens so
            the whole top-of-page controls fit without their own scroll
            section before the actual dashboard appears. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-5">
          <div className="shrink-0">
            <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">Expenses</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">Track costs, payments, and profitability by project.</p>
            <Link
              href="/pending-payouts"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-gray-500 hover:text-gray-800 mt-1.5"
            >
              View all pending payouts <ArrowUpRight size={12} />
            </Link>
          </div>

          <div className="w-full lg:w-auto lg:min-w-[420px] space-y-2">
            <ProjectCombobox onSelect={(project) => handleSelectProject(project.id, project)} />
            <RecentProjectCards
              projects={recentProjects}
              selectedProjectId={selectedProjectId}
              onSelect={(id) => handleSelectProject(id)}
            />
          </div>
        </div>

        {error && (
          <div className="text-[13px] text-rose-600 bg-rose-50 rounded-lg p-3.5 mb-5">{error}</div>
        )}

        {isLoadingBundle && (
          <div className="text-[13px] text-gray-400 text-center py-24">Loading project…</div>
        )}

        {!isLoadingBundle && !bundle && !error && (
          <div className="text-center py-24">
            <div className="text-[13px] text-gray-500">No project selected</div>
            <div className="text-[13px] text-gray-400 mt-1">Search above or pick a recent project to get started.</div>
          </div>
        )}

        {!isLoadingBundle && bundle && financials && payment && (
          <>
            {/* Mobile-First Layout */}
            <CashStatusBar financials={financials} payment={payment} atRiskProjectCount={0} />

            <div className="px-4 md:px-6 space-y-5 py-4 md:py-6">
              {/* Core Action: Payment Center */}
              <PaymentActionCenter
                payouts={pendingPayouts}
                estimateId={bundle.project.id}
                onRefresh={refreshBundle}
              />

              {/* Quick Actions (Mobile Only) */}
              <QuickActionButtons
                onAddExpense={() => openAddSheet()}
                onAssignSubcontractor={() => {
                  /* TODO: Open assign modal */
                }}
              />

              {/* Alerts (Collapsible on Mobile) */}
              <AlertsAndFlags bundle={bundle} financials={financials} payment={payment} />

              {/* Project Overview */}
              <ActiveProjects
                projects={[
                  {
                    id: bundle.project.id,
                    name: bundle.project.title || "Project",
                    clientName: bundle.client?.name || "Unknown Client",
                    revenue: financials.revisedTotal,
                    expenses:
                      financials.materialCosts +
                      financials.laborCosts +
                      financials.subcontractorCosts +
                      financials.agentCommissions +
                      financials.otherExpenses +
                      financials.mileageCosts,
                    profit:
                      financials.revisedTotal -
                      (financials.materialCosts +
                        financials.laborCosts +
                        financials.subcontractorCosts +
                        financials.agentCommissions +
                        financials.otherExpenses +
                        financials.mileageCosts),
                    paymentPercent: payment.paymentPercentage,
                    status:
                      payment.paymentPercentage >= 80 ? "green" : payment.paymentPercentage >= 50 ? "yellow" : "red",
                  },
                ]}
              />

              {/* Transaction History */}
              <DashboardPanel
                title="Recent Transactions"
                accent="gray"
                action={
                  <button
                    type="button"
                    onClick={toggleShowDeleted}
                    className="text-[13px] text-gray-500 hover:text-gray-700 md:hidden"
                  >
                    History
                  </button>
                }
              >
                <ExpenseLedger
                  entries={ledger}
                  emptyLabel="No transactions yet"
                  emptyHint="Add an expense or payment to get started."
                  maxHeight="320px"
                />
              </DashboardPanel>

              {/* Archived */}
              <DashboardPanel
                title="Archived"
                accent="gray"
                action={
                  <button
                    type="button"
                    onClick={toggleShowDeleted}
                    className="text-[13px] text-gray-500 hover:text-gray-700"
                  >
                    {showDeleted ? "Hide" : "Show deleted"}
                  </button>
                }
              >
                {!showDeleted && (
                  <div className="text-[13px] text-gray-400">
                    Deleted expenses and payments for this project can be restored here.
                  </div>
                )}
                {showDeleted && isLoadingDeleted && (
                  <div className="text-[13px] text-gray-400 text-center py-6">Loading…</div>
                )}
                {showDeleted && !isLoadingDeleted && (
                  <ExpenseLedger
                    entries={deletedLedger}
                    onRestore={handleRestoreEntry}
                    emptyLabel="Nothing deleted"
                    emptyHint="Deleted expenses and payments will show up here."
                    maxHeight="320px"
                  />
                )}
              </DashboardPanel>
            </div>
          </>
        )}
      </div>

      {isAddSheetOpen && bundle && (
        <AddExpenseSheet
          bundle={bundle}
          initialCategory={addSheetCategory}
          onClose={() => setIsAddSheetOpen(false)}
          onSubmit={handleAddEntry}
          onAssignSubcontractor={handleAssignSubcontractor}
        />
      )}

    </div>
    </DesktopShell>
  );
}
