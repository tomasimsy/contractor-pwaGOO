import { formatCurrency } from "@/lib/utils/formatting";
import DashboardPanel from "./DashboardPanel";

export default function RevenueCard({ contractAmount }: { contractAmount: number }) {
  return (
    <DashboardPanel title="Project Revenue">
      <div className="text-2xl sm:text-3xl font-black text-slate-800 truncate">{formatCurrency(contractAmount)}</div>
      <div className="text-xs text-slate-400 mt-1">Contract amount (estimate total)</div>
      <div className="text-[11px] text-slate-300 mt-3 leading-relaxed">
        Change orders aren't tracked in your current schema, so this reflects the estimate total only.
      </div>
    </DashboardPanel>
  );
}
