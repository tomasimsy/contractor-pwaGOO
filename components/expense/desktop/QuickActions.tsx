import { Plus, FileText } from "lucide-react";
import type { FormCategory } from "@/components/expense/AddExpenseSheet";

export default function QuickActions({
  onOpen,
  onGenerateInvoice,
  canGenerateInvoice = false,
}: {
  onOpen: (category?: FormCategory) => void;
  onGenerateInvoice?: () => void;
  canGenerateInvoice?: boolean;
}) {
  const secondary: { label: string; category: FormCategory }[] = [
    { label: "Subcontractor", category: "subcontractor" },
    { label: "Agent commission", category: "agent_commission" },
    { label: "Upload receipt", category: "other" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {secondary.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => onOpen(action.category)}
          className="flex items-center gap-1 h-8 px-4 rounded-full bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors shadow-sm"
        >
          {action.label}
        </button>
      ))}
      {canGenerateInvoice && onGenerateInvoice && (
        <button
          type="button"
          onClick={onGenerateInvoice}
          className="flex items-center gap-1 h-8 px-4 rounded-full bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <FileText size={13} className="shrink-0" /> Generate Invoice
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen("material")}
        className="flex items-center gap-1 h-8 px-4 rounded-full bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors shadow-sm"
      >
        <Plus size={13} className="shrink-0" /> Add expense
      </button>
    </div>
  );
}
