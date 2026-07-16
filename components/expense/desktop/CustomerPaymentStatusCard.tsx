import { formatCurrency } from "@/lib/utils/formatting";
import type { FinancialSummaryData, PaymentSummary } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";

const PAYMENT_LABEL: Record<PaymentSummary["status"], string> = {
  not_paid: "Not paid",
  partial: "Partial payment",
  fully_paid: "Fully paid",
};

// Same financial-status palette used everywhere on this page: not-started
// = amber, partial = blue, fully paid = green.
const PAYMENT_TONE: Record<PaymentSummary["status"], string> = {
  not_paid: "text-amber-600",
  partial: "text-blue-600",
  fully_paid: "text-emerald-600",
};
const PAYMENT_BAR: Record<PaymentSummary["status"], string> = {
  not_paid: "bg-amber-500",
  partial: "bg-blue-500",
  fully_paid: "bg-emerald-500",
};

function StatTile({ label, value, sublabel, valueClass = "" }: { label: string; value: string; sublabel?: string; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-gray-400">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight truncate mt-1.5 ${valueClass || "text-gray-900"}`}>{value}</div>
      {sublabel && <div className="text-[13px] text-gray-400 mt-1">{sublabel}</div>}
    </div>
  );
}

// What the client owes/has paid on this project — kept separate from
// project spend (ExpenseSummaryCard) since they answer different
// questions: "is the customer paid up" vs. "what did this project cost."
export default function CustomerPaymentStatusCard({
  financials,
  payment,
}: {
  financials: FinancialSummaryData;
  payment: PaymentSummary;
}) {
  return (
    <DashboardPanel title="Customer Payment Status" accent="emerald">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
        <StatTile
          label="Contract Value"
          value={formatCurrency(financials.revisedTotal)}
          sublabel={
            financials.approvedChangeOrderTotal !== 0
              ? `${formatCurrency(financials.estimateTotal)} + CO`
              : "Original estimate"
          }
        />
        <StatTile
          label="Received"
          value={formatCurrency(payment.amountReceived)}
          valueClass={PAYMENT_TONE[payment.status]}
          sublabel={`${payment.paymentPercentage.toFixed(0)}% · ${PAYMENT_LABEL[payment.status]}`}
        />
        <StatTile
          label="Balance Due"
          value={formatCurrency(payment.remainingBalance)}
          valueClass={payment.remainingBalance > 0 ? "text-amber-600" : "text-emerald-600"}
        />
      </div>

      <div className="mt-4">
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${PAYMENT_BAR[payment.status]}`} style={{ width: `${payment.paymentPercentage}%` }} />
        </div>
        <div className="text-[13px] text-gray-400 mt-2">
          {formatCurrency(payment.amountReceived)} of {formatCurrency(payment.totalContractAmount)} received across all invoices
        </div>
      </div>
    </DashboardPanel>
  );
}
