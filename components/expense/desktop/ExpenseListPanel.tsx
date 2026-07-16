import type { LedgerEntry } from "@/lib/types";
import ExpenseLedger from "@/components/expense/ExpenseLedger";
import DashboardPanel from "./DashboardPanel";

export default function ExpenseListPanel({
  entries,
  onDelete,
}: {
  entries: LedgerEntry[];
  onDelete: (entry: LedgerEntry) => void;
}) {
  const expenseEntries = entries.filter((e) => e.source === "expense");
  return (
    <DashboardPanel title="Expenses" accent="gray" className="flex-1 min-h-0">
      <ExpenseLedger entries={expenseEntries} onDelete={onDelete} maxHeight="420px" />
    </DashboardPanel>
  );
}
