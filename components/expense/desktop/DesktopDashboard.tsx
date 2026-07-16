"use client";

import type { FormCategory } from "@/components/expense/AddExpenseSheet";
import type { FinancialSummaryData, LedgerEntry, PaymentSummary, ProjectBundle } from "@/lib/types";
import { getBudgetComparison } from "@/lib/queries/expenses";

import ProjectSummaryCard from "./ProjectSummaryCard";
import CustomerPaymentStatusCard from "./CustomerPaymentStatusCard";
import SubcontractorAssignmentsCard from "./SubcontractorAssignmentsCard";
import AgentCommissionCard from "./AgentCommissionCard";
import ChangeOrdersPanel from "./ChangeOrdersPanel";
import ExpenseSummaryCard from "./ExpenseSummaryCard";
import ExpenseListPanel from "./ExpenseListPanel";
import PaymentHistoryPanel from "./PaymentHistoryPanel";
import ReceiptsPanel from "./ReceiptsPanel";

// Desktop-first command center: a wide 12-column grid instead of one long
// single-column stack, so the page reads in two vertical "lanes" at once
// instead of forcing one continuous scroll. Left lane is the working set
// (project header, financial snapshot, the expense ledger someone is
// actively adding to); right lane is reference/status info (who's owed
// money, change orders, invoice + receipt history) — each of those panels
// caps its own list height and scrolls internally, so a long list never
// pushes the rest of the sidebar out of view. Below `xl` everything
// collapses back into a single natural-stacking column for tablet/mobile.
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
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      <div className="xl:col-span-8 flex flex-col gap-5 min-w-0">
        <ProjectSummaryCard bundle={bundle} onOpenAddSheet={onOpenAddSheet} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CustomerPaymentStatusCard financials={financials} payment={payment} />
          <ExpenseSummaryCard financials={financials} budget={budget} />
        </div>

        <ExpenseListPanel entries={ledger} onDelete={onDeleteEntry} />
      </div>

      <div className="xl:col-span-4 flex flex-col gap-5 min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 gap-5">
          <SubcontractorAssignmentsCard bundle={bundle} ledger={ledger} onDelete={onDeleteEntry} onRefresh={onRefresh} />
          <AgentCommissionCard bundle={bundle} ledger={ledger} onDelete={onDeleteEntry} onRefresh={onRefresh} />
        </div>

        <ChangeOrdersPanel bundle={bundle} ledger={ledger} onRefresh={onRefresh} />

        <PaymentHistoryPanel invoices={bundle.invoices} />

        <ReceiptsPanel expenses={bundle.expenses} />
      </div>
    </div>
  );
}
