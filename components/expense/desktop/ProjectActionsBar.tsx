"use client";

import type { FormCategory } from "@/components/expense/AddExpenseSheet";
import QuickActions from "./QuickActions";

export default function ProjectActionsBar({
  onOpenAddSheet,
}: {
  onOpenAddSheet: (category?: FormCategory) => void;
}) {
  return (
    <div className="mb-5 -mx-6 px-6 py-3 border-b border-gray-100 bg-gray-50/40">
      <QuickActions onOpen={onOpenAddSheet} />
    </div>
  );
}
