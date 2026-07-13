"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getProjectBundle, getProjectSummaries } from "@/lib/queries/projects";
import {
  addEntry,
  assignSubcontractorToProject,
  buildLedger,
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
import DesktopDashboard from "@/components/expense/desktop/DesktopDashboard";

export default function ProjectExpensePage() {
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [isLoadingBundle, setIsLoadingBundle] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [addSheetCategory, setAddSheetCategory] = useState<FormCategory | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const recentIds = getRecentProjectIds();
    if (recentIds.length > 0) {
      getProjectSummaries(recentIds).then(setRecentProjects).catch(() => {});
    }
    const lastSelected = getLastSelectedProjectId();
    if (lastSelected) setSelectedProjectId(lastSelected);
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

  async function handleAssignSubcontractor(subcontractorId: string, name: string, trade: string | null) {
    if (!bundle) throw new Error("No project selected");
    const assigned = await assignSubcontractorToProject(
      bundle.project.id,
      bundle.project.company_id,
      subcontractorId,
      name,
      trade
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
  const payment = bundle ? derivePaymentStatus(bundle.project.total, amountReceived) : null;

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 pb-28 lg:pb-10">
      <RecentProjectCards
        projects={recentProjects}
        selectedProjectId={selectedProjectId}
        onSelect={(id) => handleSelectProject(id)}
      />

      <ProjectCombobox onSelect={(project) => handleSelectProject(project.id, project)} />

      {error && (
        <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">
          {error}
        </div>
      )}

      {isLoadingBundle && <div className="text-xs text-slate-400 text-center py-8">Loading project…</div>}

      {!isLoadingBundle && !bundle && !error && (
        <div className="text-center py-16 text-sm text-slate-400">
          Search above or pick a recent project to get started.
        </div>
      )}

      {/* Full dashboard at every breakpoint — Revenue, Payment Status,
          Profit, Cost Breakdown, Expenses, Payment History,
          Subcontractors, Agents, Receipts are all here on mobile too,
          just stacked single-column; dense rows scroll horizontally
          instead of clipping. */}
      {!isLoadingBundle && bundle && financials && payment && (
        <DesktopDashboard
          bundle={bundle}
          ledger={ledger}
          financials={financials}
          payment={payment}
          onOpenAddSheet={openAddSheet}
          onDeleteEntry={handleDeleteEntry}
        />
      )}

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
  );
}
