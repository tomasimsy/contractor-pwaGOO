import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { FinancialSummaryData } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";

function profitTone(profitPercent: number) {
  if (profitPercent >= 20) return { text: "text-emerald-700", icon: TrendingUp };
  if (profitPercent >= 10) return { text: "text-amber-700", icon: Minus };
  return { text: "text-rose-700", icon: TrendingDown };
}

export default function ProfitCard({ data }: { data: FinancialSummaryData }) {
  // Includes mileageCosts (previously omitted here) and uses
  // revisedTotal (original + approved change orders) as the revenue
  // baseline — once change orders are approved, "profit" and "remaining
  // budget" are the same number: revised contract value minus total cost.
  const totalProjectCost =
    data.materialCosts +
    data.laborCosts +
    data.subcontractorCosts +
    data.agentCommissions +
    data.otherExpenses +
    data.mileageCosts;
  const profit = data.revisedTotal - totalProjectCost;
  const profitPercent = data.revisedTotal > 0 ? (profit / data.revisedTotal) * 100 : 0;
  const tone = profitTone(profitPercent);
  const ToneIcon = tone.icon;

  return (
    <DashboardPanel title="Profit Overview">
      <div className="space-y-2">
        <Row label="Revenue" value={formatCurrency(data.revisedTotal)} />
        <Row label="Project Cost" value={formatCurrency(totalProjectCost)} />
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className={`text-xs font-bold flex items-center gap-1 ${tone.text}`}>
            <ToneIcon size={13} /> Estimated Profit
          </span>
          <span className={`text-lg font-black ${tone.text}`}>{formatCurrency(profit)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Profit Margin</span>
          <span className={`text-xs font-bold ${tone.text}`}>{profitPercent.toFixed(0)}%</span>
        </div>
      </div>
    </DashboardPanel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-semibold text-slate-700">{value}</span>
    </div>
  );
}
