"use client";

import { useEffect, useState } from "react";
import type { FormCategory } from "@/components/expense/AddExpenseSheet";
import type { FinancialSummaryData, LedgerEntry, PaymentSummary, ProjectBundle, InvoicePaymentRow } from "@/lib/types";
import { getBudgetComparison, getBudgetAlerts } from "@/lib/queries/expenses";
import { getInvoicePayments } from "@/lib/queries/customerPayments";

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
  onRecordPayment,
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
  onRecordPayment?: () => void;
  onDeleteEntry: (entry: LedgerEntry) => void;
  onRefresh: () => Promise<void>;
  onGenerateInvoice?: () => void;
  canGenerateInvoice?: boolean;
}) {
  const [payments, setPayments] = useState<InvoicePaymentRow[]>([]);

  useEffect(() => {
    if (bundle.invoices.length === 0) {
      setPayments([]);
      return;
    }

    async function loadPayments() {
      try {
        const allPayments: InvoicePaymentRow[] = [];
        for (const invoice of bundle.invoices) {
          const invoicePayments = await getInvoicePayments(invoice.id);
          allPayments.push(...invoicePayments.filter(p => !p.deleted_at));
        }
        setPayments(allPayments);
      } catch (err) {
        console.error("Failed to load customer payments:", err);
      }
    }

    loadPayments();
  }, [bundle.invoices]);

  const budget = getBudgetComparison(bundle.estimateItems, bundle.expenses);
  const budgetAlerts = getBudgetAlerts(budget);

  return (
    <div className="flex flex-col gap-5 min-w-0">
      {/* Action Bar */}
      <ProjectActionsBar onOpenAddSheet={onOpenAddSheet} onRecordPayment={onRecordPayment} onGenerateInvoice={onGenerateInvoice} canGenerateInvoice={canGenerateInvoice} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 flex flex-col gap-5 min-w-0">
          {/* Project Summary (data only, no actions) */}
          <ProjectSummaryCard bundle={bundle} />

          {/* Customer Payments (combined summary + history) */}
          <CustomerPaymentsCard
            financials={financials}
            payment={payment}
            invoices={bundle.invoices}
            payments={payments}
            onPaymentDeleted={onRefresh}
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
