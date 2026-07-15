import { Plus } from "lucide-react";
import type { FormCategory } from "@/components/expense/AddExpenseSheet";

export default function QuickActions({ onOpen }: { onOpen: (category?: FormCategory) => void }) {
  const secondary: { label: string; category: FormCategory }[] = [
    { label: "Subcontractor", category: "subcontractor" },
    { label: "Agent commission", category: "agent_commission" },
    { label: "Upload receipt", category: "other" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-d">
      {secondary.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => onOpen(action.category)}
        className="flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors"
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onOpen("material")}
        className="flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors"
      >
        <Plus size={13} className="shrink-0" /> Add expense
      </button>
    </div>
  );
}
