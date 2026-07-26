"use client";

/**
 * Thin wrapper — the real implementation is components/shared/PayablesTable.tsx
 * (see its header for why this and AgentPayablesTable were merged).
 * Kept as its own file/export so nothing importing this component name
 * has to change.
 */
import { PayablesTable } from "../shared/PayablesTable";

export function SubcontractorPayablesTable({ companyId, projectId }: { companyId: string; projectId?: string }) {
  return <PayablesTable role="subcontractor" title="Subcontractor Payables" companyId={companyId} projectId={projectId} />;
}
