import { formatCurrency } from "@/lib/utils/formatting";
import type { FinancialSummaryData } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";

export default function CostBreakdownCard({ data }: { data: FinancialSummaryData }) {
  const lineItems = [
    { label: "Materials", value: data.materialCosts },
    { label: "Labor", value: data.laborCosts },
    { label: "Subcontractors", value: data.subcontractorCosts },
    { label: "Agent Commissions", value: data.agentCommissions },
    { label: "Other Expenses", value: data.otherExpenses },
  ];
  const total = lineItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <DashboardPanel title="Project Cost">
      <div className="space-y-2">
        {lineItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{item.label}</span>
            <span className="font-mono font-semibold text-slate-700">{formatCurrency(item.value)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 font-bold">
          <span className="text-slate-700">Total Project Cost</span>
          <span className="font-mono text-slate-900">{formatCurrency(total)}</span>
        </div>
      </div>
    </DashboardPanel>
  );
}
