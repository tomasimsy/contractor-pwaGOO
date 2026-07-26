"use client";

/**
 * Thin wrapper — the real implementation is components/shared/PayablesTable.tsx
 * (see its header for why this and SubcontractorPayablesTable were
 * merged). Kept as its own file/export so nothing importing this
 * component name has to change.
 */
import { PayablesTable } from "../shared/PayablesTable";

export function AgentPayablesTable({ companyId, projectId }: { companyId: string; projectId?: string }) {
  return <PayablesTable role="agent" title="Agent Payables" companyId={companyId} projectId={projectId} />;
}
