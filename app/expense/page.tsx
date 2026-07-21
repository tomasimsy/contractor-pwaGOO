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
  calculateApprovedChangeOrdersTotal,
  computePendingPayouts,
  deleteEntry,
  derivePaymentStatus,
  restoreEntry,
  summarizeFinancials,
  totalAmountPaid,
} from "@/lib/queries/expenses";
import { generateInvoiceFromEstimate, invoiceExistsForEstimate } from "@/lib/queries/invoices";
import {
  getLastSelectedProjectId,
  getRecentProjectIds,
  recordProjectAccess,
} from "@/lib/expense/recent-projects";
import type { LedgerEntry, NewEntryInput, ProjectBundle, ProjectSummary } from "@/lib/types";

import RecentProjectCards from "@/components/expense/RecentProjectCards";
import ProjectCombobox from "@/components/expense/ProjectCombobox";
import AddExpenseSheet, { type FormCategory } from "@/components/expense/AddExpenseSheet";
import ReceivedPaymentModal from "@/components/payments/ReceivedPaymentModal";
import DesktopDashboard from "@/components/expense/desktop/DesktopDashboard";
import ExpenseLedger from "@/components/expense/ExpenseLedger";
import DashboardPanel from "@/components/expense/desktop/DashboardPanel";
import PendingPayoutsBar from "@/components/expense/PendingPayoutsBar";
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
  const [isRecordPaymentModalOpen, setIsRecordPaymentModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    clientName: string;
    invoiceTotal: number;
    remainingBalance: number;
    revisedTotal: number;
    revisedRemainingBalance: number;
  } | null>(null);
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

  function openRecordPaymentModal() {
    if (!bundle) return;
    // Auto-select first invoice if only one exists
    if (bundle.invoices.length === 1) {
      const invoice = bundle.invoices[0];
      // Calculate revised total including approved change orders
      const approvedChangeOrdersTotal = calculateApprovedChangeOrdersTotal(bundle.changeOrders);
      const revisedTotal = invoice.total + approvedChangeOrdersTotal;
      const revisedRemainingBalance = (invoice.remaining_balance || 0) + approvedChangeOrdersTotal;

      setSelectedInvoiceForPayment({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number || "Invoice",
        clientName: bundle.client.name,
        invoiceTotal: revisedTotal,
        remainingBalance: invoice.remaining_balance,
        revisedTotal: revisedTotal,
        revisedRemainingBalance: revisedRemainingBalance,
      });
    }
    setIsRecordPaymentModalOpen(true);
  }

  async function handlePaymentRecorded() {
    if (selectedProjectId) await loadBundle(selectedProjectId);
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
    // Update local state immediately for responsive UI feedback
    setBundle((prev) => (prev ? { ...prev, assignedSubcontractors: [...prev.assignedSubcontractors, assigned] } : prev));
    // Reload bundle in background to ensure all dependent calculations (profit,
    // available payout amount, etc.) recalculate with the new assignment.
    // Subcontractors affect profit calculations the moment they're assigned.
    // Don't await this so the form response is immediate.
    if (selectedProjectId) {
      loadBundle(selectedProjectId).catch((err) => console.error("Failed to refresh bundle after assignment:", err));
    }
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
      if (selectedProjectId) await loadBundle(selectedProjectId);
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
  // Use invoice total if invoices exist (invoices may have different totals than estimate),
  // otherwise use estimate total
  const baseTotal = bundle && bundle.invoices.length > 0
    ? bundle.invoices[0].total
    : bundle?.project.total || 0;
  const financials = bundle ? summarizeFinancials(baseTotal, bundle, amountReceived) : null;
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

  // Check if an invoice can be generated for this project
  const canGenerateInvoice = !!(bundle && bundle.invoices.length === 0);

  async function handleGenerateInvoice() {
    if (!bundle || !financials) {
      toast.error("No project selected");
      return;
    }

    try {
      // Check if invoice already exists
      const exists = await invoiceExistsForEstimate(bundle.project.id);
      if (exists) {
        toast.error("An invoice already exists for this project");
        return;
      }

      // Generate invoice from estimate + approved change orders
      const invoiceId = await generateInvoiceFromEstimate({
        estimateId: bundle.project.id,
        companyId: bundle.project.company_id,
        clientId: bundle.client.id,
        estimateTotal: bundle.project.total,
        estimateItems: bundle.estimateItems,
        approvedChangeOrders: bundle.changeOrders.filter(co => co.status === "approved"),
        revisedTotal: financials.revisedTotal,
      });

      toast.success("Invoice generated successfully!");
      // Reload to show the new invoice in the invoices list
      await refreshBundle();
    } catch (err: any) {
      console.error("Failed to generate invoice:", err);
      toast.error(err?.message || "Failed to generate invoice");
    }
  }

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
          <div className="space-y-5">
            <DesktopDashboard
              bundle={bundle}
              ledger={ledger}
              financials={financials}
              payment={payment}
              onOpenAddSheet={openAddSheet}
              onRecordPayment={openRecordPaymentModal}
              onDeleteEntry={handleDeleteEntry}
              onRefresh={refreshBundle}
              onGenerateInvoice={handleGenerateInvoice}
              canGenerateInvoice={canGenerateInvoice}
            />

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
                <div className="text-[13px] text-gray-400">Deleted expenses and payments for this project can be restored here.</div>
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

      {selectedInvoiceForPayment && (
        <ReceivedPaymentModal
          isOpen={isRecordPaymentModalOpen}
          onClose={() => {
            setIsRecordPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
          }}
          invoiceId={selectedInvoiceForPayment.invoiceId}
          invoiceNumber={selectedInvoiceForPayment.invoiceNumber}
          clientName={selectedInvoiceForPayment.clientName}
          invoiceTotal={selectedInvoiceForPayment.revisedTotal}
          remainingBalance={selectedInvoiceForPayment.revisedRemainingBalance}
          onPaymentRecorded={handlePaymentRecorded}
        />
      )}

      {bundle && pendingPayouts.length > 0 && (
        <PendingPayoutsBar bundle={bundle} payouts={pendingPayouts} onRefresh={refreshBundle} />
      )}
    </div>
    </DesktopShell>
  );
}
