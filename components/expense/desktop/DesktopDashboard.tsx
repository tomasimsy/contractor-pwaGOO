"use client";

import type { FormCategory } from "@/components/expense/AddExpenseSheet";
import type { FinancialSummaryData, LedgerEntry, PaymentSummary, ProjectBundle } from "@/lib/types";
import { getBudgetComparison, getBudgetAlerts } from "@/lib/queries/expenses";

import ProjectSummaryCard from "./ProjectSummaryCard";
import ProjectActionsBar from "./ProjectActionsBar";
import CustomerPaymentsCard from "./CustomerPaymentsCard";
import SubcontractorAssignmentsCard from "./SubcontractorAssignmentsCard";
import AgentCommissionCard from "./AgentCommissionCard";
import ChangeOrdersPanel from "./ChangeOrdersPanel";
import ExpandableExpenseSummaryCard from "./ExpandableExpenseSummaryCard";
import ExpenseListPanel from "./ExpenseListPanel";
import ReceiptsPanel from "./ReceiptsPanel";
import BudgetStatusCard from "./BudgetStatusCard";

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
  onGenerateInvoice,
  canGenerateInvoice = false,
}: {
  bundle: ProjectBundle;
  ledger: LedgerEntry[];
  financials: FinancialSummaryData;
  payment: PaymentSummary;
  onOpenAddSheet: (category?: FormCategory) => void;
  onDeleteEntry: (entry: LedgerEntry) => void;
  onRefresh: () => Promise<void>;
  onGenerateInvoice?: () => void;
  canGenerateInvoice?: boolean;
}) {
  const budget = getBudgetComparison(bundle.estimateItems, bundle.expenses);
  const budgetAlerts = getBudgetAlerts(budget);

  return (
    <div className="flex flex-col gap-5 min-w-0">
      {/* Action Bar */}
      <ProjectActionsBar onOpenAddSheet={onOpenAddSheet} onGenerateInvoice={onGenerateInvoice} canGenerateInvoice={canGenerateInvoice} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 flex flex-col gap-5 min-w-0">
          {/* Project Summary (data only, no actions) */}
          <ProjectSummaryCard bundle={bundle} />

          {/* Customer Payments (combined summary + history) */}
          <CustomerPaymentsCard
            financials={financials}
            payment={payment}
            invoices={bundle.invoices}
          />

          {/* Expenses with expandable categories */}
          <ExpandableExpenseSummaryCard
            financials={financials}
            ledger={ledger}
            budget={budget}
          />

          {/* Transaction Ledger */}
          <ExpenseListPanel entries={ledger} onDelete={onDeleteEntry} />
        </div>

        <div className="xl:col-span-4 flex flex-col gap-5 min-w-0">
          <BudgetStatusCard alerts={budgetAlerts} />

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 gap-5">
            <SubcontractorAssignmentsCard bundle={bundle} ledger={ledger} onDelete={onDeleteEntry} onRefresh={onRefresh} />
            <AgentCommissionCard bundle={bundle} ledger={ledger} onDelete={onDeleteEntry} onRefresh={onRefresh} />
          </div>

          <ChangeOrdersPanel bundle={bundle} ledger={ledger} onRefresh={onRefresh} />

          <ReceiptsPanel expenses={bundle.expenses} />
        </div>
      </div>
    </div>
  );
}
