import { applyJobPay, type JobPay } from "./jobPay";
import type { TimeEntry } from "./timeEntryService";
import type { UUID } from "./types";

export interface LaborLine {
  employeeId: UUID;
  name: string;
  hours: number;
  /** Hourly labor counted (job-pay employees on these estimates are 0). */
  hourly: number;
  /** Agreed job pay on these estimates. */
  jobPay: number;
  /** True when the job pay counts: the estimate's project is completed. */
  jobPayEarned: boolean;
  /** What this person counts toward labor: hourly plus earned job pay. */
  total: number;
}

/** Labor cost split by employee for a set of estimates (a job, or a project's jobs).
 *
 * Uses the same rules as the engine: hourly entries are replaced by a job pay
 * on the same estimate, and a job pay counts once its project is completed.
 * Takes ALL company entries and job pays, because a day split across jobs must
 * be costed as a whole. */
export function laborBreakdownByEmployee(opts: {
  entries: TimeEntry[];
  nameById: Map<UUID, string>;
  estimateIds: Set<string>;
  jobPays: JobPay[];
  completedEstimateIds: Set<string>;
}): LaborLine[] {
  const { entries, nameById, estimateIds, jobPays, completedEstimateIds } = opts;
  const applied = applyJobPay(entries, jobPays, completedEstimateIds);
  const rows = new Map<UUID, { hours: number; hourly: number; jobPay: number; earned: number; jobPayAny: boolean }>();
  const row = (id: UUID) => {
    const r = rows.get(id) ?? { hours: 0, hourly: 0, jobPay: 0, earned: 0, jobPayAny: false };
    rows.set(id, r);
    return r;
  };

  for (const e of entries) {
    if (!e.estimateId || !estimateIds.has(e.estimateId) || e.status !== "approved") continue;
    const r = row(e.employeeId);
    r.hours += e.hours ?? 0;
    r.hourly += applied.entryCost.get(e.id) ?? 0;
  }
  for (const p of jobPays) {
    if (!estimateIds.has(p.estimateId)) continue;
    const r = row(p.employeeId as UUID);
    r.jobPay += p.amount;
    r.jobPayAny = true;
    if (completedEstimateIds.has(p.estimateId)) r.earned += p.amount;
  }

  return Array.from(rows, ([employeeId, r]) => {
    const hourly = Math.round(r.hourly * 100) / 100;
    const earned = Math.round(r.earned * 100) / 100;
    return {
      employeeId,
      name: nameById.get(employeeId) ?? "Former employee",
      hours: Math.round(r.hours * 100) / 100,
      hourly,
      jobPay: Math.round(r.jobPay * 100) / 100,
      jobPayEarned: r.jobPayAny && r.earned === r.jobPay,
      total: Math.round((hourly + earned) * 100) / 100,
    };
  })
    .filter((l) => l.hours > 0 || l.jobPay > 0)
    .sort((a, b) => b.total - a.total);
}
