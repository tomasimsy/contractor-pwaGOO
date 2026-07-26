"use client";

/**
 * SubcontractorPayablesTable and AgentPayablesTable were the same
 * component twice — identical fetch, identical loading/empty
 * handling, identical row markup, differing only in which `role` to
 * filter `PayablesSummary.lines` by and which total field to read.
 * Found during the optimization pass ("reuse components" / "remove
 * duplicate code"). This is the one real implementation; both
 * original files now just call this with their role baked in, so
 * nothing importing them by name has to change.
 *
 * Reads FinancialEngine.getPayablesSummary — the SAME call Dashboard/
 * Reports use, not SubcontractorService/AgentCommissionService.getBalance
 * looped per assignment — so this table and the Dashboard's payables
 * tile can never disagree, because they're the same function call.
 */
import { useMemo } from "react";
import { useServices } from "../../lib/services-context";
import { useAsyncResource } from "../../lib/hooks/useAsyncResource";
import { LoadingState, ErrorState } from "./AsyncStates";
import type { PayablesSummary } from "../../lib/services";

export function PayablesTable({
  role,
  title,
  companyId,
  projectId,
}: {
  role: "subcontractor" | "agent";
  title: string;
  companyId: string;
  projectId?: string;
}) {
  const { financialEngine } = useServices();
  const { data: summary, loading, error, reload } = useAsyncResource<PayablesSummary>(
    () => financialEngine.getPayablesSummary({ companyId, projectId }),
    [financialEngine, companyId, projectId]
  );

  const lines = useMemo(() => summary?.lines.filter((l) => l.role === role) ?? [], [summary, role]);
  const totalOutstanding = role === "subcontractor" ? summary?.totalOutstandingSubcontractor : summary?.totalOutstandingAgent;

  if (loading) return <LoadingState label={`Loading ${title.toLowerCase()}...`} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!summary) return null;

  return (
    <div className="max-w-xl">
      <h3 className="font-semibold">{title}</h3>
      {lines.length === 0 ? (
        <p className="py-2 text-sm text-gray-500">Nothing outstanding.</p>
      ) : (
        <ul className="divide-y text-sm">
          {lines.map((line) => (
            <li key={line.assignmentId} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{line.payeeName}</span>
              <span className="text-gray-600">
                ${line.assigned.toFixed(2)} assigned / ${line.paid.toFixed(2)} paid / ${line.outstanding.toFixed(2)} owed
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="font-semibold pt-2">Total outstanding: ${(totalOutstanding ?? 0).toFixed(2)}</div>
    </div>
  );
}
