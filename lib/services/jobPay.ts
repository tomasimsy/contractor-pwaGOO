import { entryLaborCosts, type TimeEntry } from "./timeEntryService";

export type JobPayMode = "replace" | "add";

export interface JobPay {
  estimateId: string;
  employeeId: string;
  /** Fixed amount for finishing the estimate, in dollars. */
  amount: number;
  /** replace: the job pay is the employee's labor on this estimate (hourly is 0).
   *  add: the job pay is paid on top of the hourly pay. */
  mode?: JobPayMode;
}

export interface LaborWithJobPay {
  /** Approved labor per entry id, after replacement: 0 where a job pay replaces it. */
  entryCost: Map<string, number>;
  /** Job pay earned per estimate: only for estimates whose project is completed. */
  jobPayCost: Map<string, number>;
}

/** Applies job pay to the labor costs. A "replace" job pay removes the
 * employee's hourly cost on that estimate (hours tracked, cost 0). An "add"
 * job pay leaves the hourly cost alone. Either way the job pay itself counts
 * once the estimate's project is completed. Entries must be costed over all company entries first
 * (see entryLaborCosts), so day-rate sharing is unaffected. */
export function applyJobPay(
  entries: TimeEntry[],
  jobPays: JobPay[],
  completedEstimateIds: Set<string>
): LaborWithJobPay {
  const hourly = entryLaborCosts(entries);
  // Only "replace" pays remove the hourly cost; "add" pays keep it.
  const paid = new Set(jobPays.filter((p) => (p.mode ?? "replace") === "replace").map((p) => `${p.estimateId}|${p.employeeId}`));

  const entryCost = new Map<string, number>();
  for (const e of entries) {
    const cost = hourly.get(e.id);
    if (cost === undefined) continue;
    entryCost.set(e.id, paid.has(`${e.estimateId}|${e.employeeId}`) ? 0 : cost);
  }

  const jobPayCost = new Map<string, number>();
  for (const p of jobPays) {
    if (!completedEstimateIds.has(p.estimateId)) continue;
    jobPayCost.set(p.estimateId, (jobPayCost.get(p.estimateId) ?? 0) + p.amount);
  }
  return { entryCost, jobPayCost };
}
