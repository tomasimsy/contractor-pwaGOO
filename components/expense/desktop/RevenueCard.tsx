import { formatCurrency } from "@/lib/utils/formatting";
import DashboardPanel from "./DashboardPanel";

export default function RevenueCard({
  estimateTotal,
  approvedChangeOrderTotal,
  revisedTotal,
}: {
  estimateTotal: number;
  approvedChangeOrderTotal: number;
  revisedTotal: number;
}) {
  return (
    <DashboardPanel title="Project Revenue">
      <div className="text-2xl sm:text-3xl font-black text-slate-800 truncate">{formatCurrency(revisedTotal)}</div>
      <div className="text-xs text-slate-400 mt-1">Revised Contract Value</div>

      <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Original Estimate</span>
          <span className="font-mono font-semibold text-slate-700">{formatCurrency(estimateTotal)}</span>
        </div>
        {approvedChangeOrderTotal !== 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Approved Change Orders</span>
            <span className="font-mono font-semibold text-emerald-700">
              +{formatCurrency(approvedChangeOrderTotal)}
            </span>
          </div>
        )}
      </div>
    </DashboardPanel>
  );
}
