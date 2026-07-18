"use client";

export default function QuickActionButtons({
  onAddExpense,
  onAssignSubcontractor,
}: {
  onAddExpense: () => void;
  onAssignSubcontractor: () => void;
}) {
  return (
    <div className="md:hidden grid grid-cols-2 gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onAddExpense}
        className="h-12 rounded-lg border border-gray-300 bg-white text-[13px] font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
      >
        + Add Expense
      </button>
      <button
        type="button"
        onClick={onAssignSubcontractor}
        className="h-12 rounded-lg border border-gray-300 bg-white text-[13px] font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
      >
        + Assign Sub
      </button>
    </div>
  );
}
