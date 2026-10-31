import { describe, it, expect } from "vitest";
import { applyJobPay } from "@/lib/services/jobPay";
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

describe("job pay", () => {
  it("replaces the employee's hourly cost on that estimate, but keeps the hours", () => {
    const entries = [entry({ id: "1", employeeId: "a", hours: 8, rate: 25 })];
    const { entryCost } = applyJobPay(entries, [{ estimateId: "est", employeeId: "a", amount: 100 }], new Set());
    expect(entryCost.get("1")).toBe(0);
  });

  it("counts the job pay only once the estimate's project is completed", () => {
    const pays = [{ estimateId: "est", employeeId: "a", amount: 100 }];
    expect(applyJobPay([], pays, new Set()).jobPayCost.get("est")).toBeUndefined();
    expect(applyJobPay([], pays, new Set(["est"])).jobPayCost.get("est")).toBe(100);
  });

  it("leaves other employees on the same estimate paid by the hour", () => {
    const entries = [
      entry({ id: "1", employeeId: "a", hours: 8, rate: 25 }),
      entry({ id: "2", employeeId: "b", hours: 8, rate: 30 }),
    ];
    const { entryCost } = applyJobPay(entries, [{ estimateId: "est", employeeId: "a", amount: 100 }], new Set());
    expect(entryCost.get("1")).toBe(0);
    expect(entryCost.get("2")).toBe(240);
  });

  it("does not touch the employee's hours on a different estimate", () => {
    const entries = [entry({ id: "1", employeeId: "a", estimateId: "other", hours: 8, rate: 25 })];
    const { entryCost } = applyJobPay(entries, [{ estimateId: "est", employeeId: "a", amount: 100 }], new Set());
    expect(entryCost.get("1")).toBe(200);
  });

  it("an add-mode job pay keeps the hourly cost and adds the job pay on completion", () => {
    const entries = [entry({ id: "1", employeeId: "a", hours: 8, rate: 10 })];
    const pays = [{ estimateId: "est", employeeId: "a", amount: 100, mode: "add" as const }];
    const { entryCost, jobPayCost } = applyJobPay(entries, pays, new Set(["est"]));
    expect(entryCost.get("1")).toBe(80);
    expect(jobPayCost.get("est")).toBe(100);
  });
});
