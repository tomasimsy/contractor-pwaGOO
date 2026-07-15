"use client";

import type { FormCategory } from "@/components/expense/AddExpenseSheet";
import type { FinancialSummaryData, LedgerEntry, PaymentSummary, ProjectBundle } from "@/lib/types";
import { getBudgetComparison } from "@/lib/queries/expenses";

import ProjectSummaryCard from "./ProjectSummaryCard";
import CustomerPaymentStatusCard from "./CustomerPaymentStatusCard";
import PendingPayoutsCard from "./PendingPayoutsCard";
import SubcontractorAssignmentsCard from "./SubcontractorAssignmentsCard";
import AgentCommissionCard from "./AgentCommissionCard";
import ChangeOrdersPanel from "./ChangeOrdersPanel";
import ExpenseSummaryCard from "./ExpenseSummaryCard";
import ExpenseListPanel from "./ExpenseListPanel";
import PaymentHistoryPanel from "./PaymentHistoryPanel";
import ReceiptsPanel from "./ReceiptsPanel";

// Single-screen command center, card-based — no tabs, no menus. Every
// card has one clear purpose (project status, client payment, who's
// owed money, cost breakdown, records) and they all stay visible in one
// scroll, in the order someone actually works through them: what's the
// project, is the client paid, who still needs to be paid, then the
// supporting records underneath.
export default function DesktopDashboard({
  bundle,
  ledger,
  financials,
  payment,
  onOpenAddSheet,
  onDeleteEntry,
  onRefresh,
}: {
  bundle: ProjectBundle;
  ledger: LedgerEntry[];
  financials: FinancialSummaryData;
  payment: PaymentSummary;
  onOpenAddSheet: (category?: FormCategory) => void;
  onDeleteEntry: (entry: LedgerEntry) => void;
  onRefresh: () => Promise<void>;
}) {
  const budget = getBudgetComparison(bundle.estimateItems, bundle.expenses);

  return (
    <div className="space-y-5">
      <ProjectSummaryCard bundle={bundle} onOpenAddSheet={onOpenAddSheet} />

      <CustomerPaymentStatusCard financials={financials} payment={payment} />

      {/* <PendingPayoutsCard bundle={bundle} ledger={ledger} onDelete={onDeleteEntry} onRefresh={onRefresh} /> */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SubcontractorAssignmentsCard bundle={bundle} ledger={ledger} onDelete={onDeleteEntry} onRefresh={onRefresh} />
        <AgentCommissionCard bundle={bundle} ledger={ledger} onDelete={onDeleteEntry} onRefresh={onRefresh} />
      </div>

      <ChangeOrdersPanel bundle={bundle} ledger={ledger} onRefresh={onRefresh} />

      <ExpenseSummaryCard financials={financials} budget={budget} />

      <ExpenseListPanel entries={ledger} onDelete={onDeleteEntry} />

      <PaymentHistoryPanel invoices={bundle.invoices} />

      <ReceiptsPanel expenses={bundle.expenses} />
    </div>
  );
}
