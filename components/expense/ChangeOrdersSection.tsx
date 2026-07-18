"use client";

import { formatCurrency } from "@/lib/utils/formatting";
import DashboardPanel, { EmptyState } from "./desktop/DashboardPanel";
import type { ProjectBundle } from "@/lib/types";

export default function ChangeOrdersSection({
  bundle,
  onOpenChangeOrderModal,
}: {
  bundle: ProjectBundle;
  onOpenChangeOrderModal?: () => void;
}) {
  // For now, this is a placeholder. Full Change Order management
  // (create, edit, submit, approve) is handled via app/estimates/[id]/page.tsx.
  // This section displays scope changes and their financial impact.

  return (
    <DashboardPanel
      title="Change Orders"
      accent="amber"
      action={
        onOpenChangeOrderModal ? (
          <button
            type="button"
            onClick={onOpenChangeOrderModal}
            className="text-[13px] font-medium text-amber-600 hover:text-amber-700"
          >
            + New
          </button>
        ) : undefined
      }
    >
      <EmptyState message="No change orders yet. Track scope changes and additional work on this project." />
    </DashboardPanel>
  );
}
