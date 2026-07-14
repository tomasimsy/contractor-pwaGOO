import { Plus, HardHat, Users, Percent, Camera } from "lucide-react";
import type { FormCategory } from "@/components/expense/AddExpenseSheet";

export default function QuickActions({ onOpen }: { onOpen: (category?: FormCategory) => void }) {
  const actions: { label: string; category: FormCategory; icon: typeof Plus }[] = [
    { label: "Add Expense", category: "material", icon: HardHat },
    { label: "Add Subcontractor Payment", category: "subcontractor", icon: Users },
    { label: "Add Agent Commission", category: "agent_commission", icon: Percent },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:items-center sm:w-auto">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            type="button"
            onClick={() => onOpen(action.category)}
            className="flex items-center justify-center gap-1.5 min-h-[44px] sm:h-9 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] sm:text-xs font-bold leading-tight text-center hover:bg-emerald-700 transition-colors"
          >
            <Icon size={13} className="shrink-0" /> <span>{action.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onOpen("other")}
        className="col-span-2 sm:col-auto flex items-center justify-center gap-1.5 min-h-[44px] sm:h-9 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200/70 text-slate-600 text-[11px] sm:text-xs font-bold hover:bg-slate-50 transition-colors"
      >
        <Camera size={13} className="shrink-0" /> Upload Receipt
      </button>
    </div>
  );
}
