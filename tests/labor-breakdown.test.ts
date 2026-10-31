import { describe, it, expect } from "vitest";
import { laborBreakdownByEmployee } from "@/lib/services/laborBreakdown";
import type { TimeEntry } from "@/lib/services/timeEntryService";

function entry(over: Partial<TimeEntry>): TimeEntry {
  return {
    id: "e", companyId: "c", employeeId: "a", estimateId: "est", workDate: "2026-10-21",
    startedAt: null, endedAt: null, hours: 8, rate: 25, payType: "hourly", notes: null, status: "approved",
    enteredBy: null, approvedBy: null, approvedAt: null,
    createdBy: null, createdAt: "", updatedBy: null, updatedAt: "", deletedBy: null, deletedAt: null, deleteReason: null,
    ...over,
  };
}

const names = new Map([["a", "Ana"], ["b", "Ben"]]);
const est = new Set(["est"]);

describe("laborBreakdownByEmployee", () => {
  it("names each employee and totals approved hourly cost, largest first", () => {
    const lines = laborBreakdownByEmployee({
      entries: [
        entry({ id: "1", employeeId: "a", hours: 8, rate: 25 }),
        entry({ id: "2", employeeId: "a", hours: 4, rate: 25 }),
        entry({ id: "3", employeeId: "b", hours: 6, rate: 30 }),
      ],
      nameById: names, estimateIds: est, jobPays: [], completedEstimateIds: new Set(),
    });
    expect(lines.map((l) => [l.name, l.hours, l.total])).toEqual([
      ["Ana", 12, 300],
      ["Ben", 6, 180],
    ]);
  });

  it("leaves out submitted entries", () => {
    const lines = laborBreakdownByEmployee({
      entries: [entry({ status: "submitted" })], nameById: names, estimateIds: est, jobPays: [], completedEstimateIds: new Set(),
    });
    expect(lines).toEqual([]);
  });

  it("keeps a name for a former employee", () => {
    const lines = laborBreakdownByEmployee({
      entries: [entry({ employeeId: "gone" })], nameById: names, estimateIds: est, jobPays: [], completedEstimateIds: new Set(),
    });
    expect(lines[0].name).toBe("Former employee");
  });

  it("replaces an employee's hourly cost with job pay, and counts the job pay only when complete", () => {
    const entries = [entry({ id: "1", employeeId: "a", hours: 8, rate: 10 })];
    const pays = [{ estimateId: "est", employeeId: "a", amount: 123 }];
    const notDone = laborBreakdownByEmployee({ entries, nameById: names, estimateIds: est, jobPays: pays, completedEstimateIds: new Set() });
    expect(notDone[0]).toMatchObject({ hourly: 0, jobPay: 123, jobPayEarned: false, total: 0 });
    const done = laborBreakdownByEmployee({ entries, nameById: names, estimateIds: est, jobPays: pays, completedEstimateIds: est });
    expect(done[0]).toMatchObject({ hourly: 0, jobPay: 123, jobPayEarned: true, total: 123 });
  });

  it("shares a split day by hours, so one job shows only its share", () => {
    const entries = [
      entry({ id: "1", employeeId: "a", payType: "daily", rate: 200, hours: 6, estimateId: "est" }),
      entry({ id: "2", employeeId: "a", payType: "daily", rate: 200, hours: 2, estimateId: "other" }),
    ];
    const lines = laborBreakdownByEmployee({ entries, nameById: names, estimateIds: est, jobPays: [], completedEstimateIds: new Set() });
    expect(lines[0]).toMatchObject({ hours: 6, total: 150 });
  });
});
