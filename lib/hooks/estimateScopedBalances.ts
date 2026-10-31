import type { PayableLine, PayeeBalance, PayeeRole } from "../services";

/** Each payee's assigned / paid / owed on one estimate: the engine's per-assignment
 * payable lines for that estimate's assignments, added up per payee. Nothing new is
 * calculated; it only narrows getPayablesSummary to the assignments shown. */
export function balancesForAssignments(
  lines: PayableLine[],
  assignments: Array<{ id: string; payeeId: string; payeeName: string; projectId: string }>,
  role: PayeeRole
): Record<string, PayeeBalance> {
  const out: Record<string, PayeeBalance> = {};
  for (const a of assignments) {
    const line = lines.find((l) => l.assignmentId === a.id);
    const row = (out[a.payeeId] ??= { payeeId: a.payeeId, payeeName: a.payeeName, role, contracted: 0, paid: 0, outstanding: 0, projectIds: [a.projectId] });
    row.contracted += line?.assigned ?? 0;
    row.paid += line?.paid ?? 0;
    row.outstanding += line?.outstanding ?? 0;
  }
  return out;
}
