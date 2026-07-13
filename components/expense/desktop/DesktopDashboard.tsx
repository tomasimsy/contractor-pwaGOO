import type { FormCategory } from "@/components/expense/AddExpenseSheet";
import type { FinancialSummaryData, LedgerEntry, PaymentSummary, ProjectBundle } from "@/lib/types";
import ProjectHeader from "@/components/expense/ProjectHeader";

import QuickActions from "./QuickActions";
import RevenueCard from "./RevenueCard";
import PaymentStatusCard from "./PaymentStatusCard";
import ProfitCard from "./ProfitCard";
import CostBreakdownCard from "./CostBreakdownCard";
import ExpenseListPanel from "./ExpenseListPanel";
import PaymentHistoryPanel from "./PaymentHistoryPanel";
import SubcontractorsPanel from "./SubcontractorsPanel";
import AgentsPanel from "./AgentsPanel";
import ReceiptsPanel from "./ReceiptsPanel";

export default function DesktopDashboard({
  bundle,
  ledger,
  financials,
  payment,
  onOpenAddSheet,
  onDeleteEntry,
}: {
  bundle: ProjectBundle;
  ledger: LedgerEntry[];
  financials: FinancialSummaryData;
  payment: PaymentSummary;
  onOpenAddSheet: (category?: FormCategory) => void;
  onDeleteEntry: (entry: LedgerEntry) => void;
}) {
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header row: project info + quick actions — stacked on mobile, side by side from sm up */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <ProjectHeader bundle={bundle} />
        </div>
        <QuickActions onOpen={onOpenAddSheet} />
      </div>

      {/* Revenue / Payment / Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <RevenueCard contractAmount={financials.estimateTotal} />
        <PaymentStatusCard payment={payment} />
        <ProfitCard data={financials} />
      </div>

      {/* Project cost */}
      <CostBreakdownCard data={financials} />

      {/* Expenses / Payment history */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <ExpenseListPanel entries={ledger} onDelete={onDeleteEntry} />
        <PaymentHistoryPanel invoices={bundle.invoices} />
      </div>

      {/* Subcontractors / Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <SubcontractorsPanel bundle={bundle} ledger={ledger} onDelete={onDeleteEntry} />
        <AgentsPanel bundle={bundle} ledger={ledger} onDelete={onDeleteEntry} />
      </div>

      {/* Receipts */}
      <ReceiptsPanel expenses={bundle.expenses} />
    </div>
  );
}
