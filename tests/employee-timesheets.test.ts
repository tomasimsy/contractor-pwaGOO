import { describe, it, expect } from "vitest";
import { calculateShiftHours, calculateLaborCost, entryLaborCosts, type TimeEntry } from "@/lib/services/timeEntryService";
import { hasPermission, ROLES } from "@/lib/services/permissions";

describe("calculateShiftHours", () => {
  it("counts clock-in to clock-out, rounded to 0.01 hour", () => {
    expect(calculateShiftHours("2026-10-21T13:00:00Z", "2026-10-21T21:30:00Z")).toBe(8.5);
    expect(calculateShiftHours("2026-10-21T13:00:00Z", "2026-10-21T13:20:00Z")).toBe(0.33);
  });

  it("refuses clock-out before clock-in", () => {
    expect(() => calculateShiftHours("2026-10-21T13:00:00Z", "2026-10-21T12:00:00Z")).toThrow(/after clock-in/);
  });

  it("refuses a shift longer than 24 hours (almost always a forgotten clock-out)", () => {
    expect(() => calculateShiftHours("2026-10-21T08:00:00Z", "2026-10-22T09:00:00Z")).toThrow(/24 hours/);
  });
});

function entry(over: Partial<TimeEntry>): TimeEntry {
  return {
    id: "e", companyId: "c", employeeId: "a", estimateId: "est", workDate: "2026-10-21",
    startedAt: null, endedAt: null, hours: 8, rate: 25, payType: "hourly", notes: null, status: "approved",
    enteredBy: null, approvedBy: null, approvedAt: null,
    createdBy: null, createdAt: "", updatedBy: null, updatedAt: "", deletedBy: null, deletedAt: null, deleteReason: null,
    ...over,
  };
}

describe("calculateLaborCost", () => {
  it("counts approved hours × rate and ignores submitted entries", () => {
    const cost = calculateLaborCost([
      entry({ id: "1", hours: 8, rate: 25 }),
      entry({ id: "2", hours: 4.5, rate: 25 }),
      entry({ id: "3", hours: 10, rate: 25, status: "submitted" }),
    ]);
    expect(cost).toBe(312.5);
  });

  it("uses the rate stored on each entry, so a later raise does not change past cost", () => {
    expect(calculateLaborCost([entry({ hours: 8, rate: 20 })])).toBe(160);
  });

  it("a day rate counts once per day, not once per entry", () => {
    // One worker, one day, two jobs (6h and 2h), day rate $200: the day is paid once.
    const cost = calculateLaborCost([
      entry({ id: "1", payType: "daily", rate: 200, hours: 6, estimateId: "A" }),
      entry({ id: "2", payType: "daily", rate: 200, hours: 2, estimateId: "B" }),
    ]);
    expect(cost).toBe(200);
  });

  it("a day rate is shared between jobs by hours", () => {
    const costs = entryLaborCosts([
      entry({ id: "1", payType: "daily", rate: 200, hours: 6, estimateId: "A" }),
      entry({ id: "2", payType: "daily", rate: 200, hours: 2, estimateId: "B" }),
    ]);
    expect(costs.get("1")).toBe(150);
    expect(costs.get("2")).toBe(50);
  });

  it("a day rate on a day with no approved hours costs nothing", () => {
    expect(calculateLaborCost([entry({ payType: "daily", rate: 200, status: "submitted" })])).toBe(0);
  });
});

describe("employee role permissions", () => {
  it("is a known role", () => {
    expect(ROLES).toContain("employee");
  });

  it("can clock in and out and view its own timesheet", () => {
    expect(hasPermission("employee", "time_entry", "view")).toBe(true);
    expect(hasPermission("employee", "time_entry", "create")).toBe(true);
    expect(hasPermission("employee", "time_entry", "update")).toBe(true);
  });

  it("cannot approve time, delete time, or see the employee roster", () => {
    expect(hasPermission("employee", "time_entry", "approve")).toBe(false);
    expect(hasPermission("employee", "time_entry", "delete")).toBe(false);
    expect(hasPermission("employee", "employee", "view")).toBe(false);
  });

  it("cannot see the dashboard, financial reports, or the estimate page", () => {
    expect(hasPermission("employee", "dashboard", "view")).toBe(false);
    expect(hasPermission("employee", "financial_reports", "view")).toBe(false);
    expect(hasPermission("employee", "estimate", "view")).toBe(false);
  });

  it("office roles can clock in for others and approve time", () => {
    expect(hasPermission("office", "time_entry", "approve")).toBe(true);
    expect(hasPermission("admin", "employee", "create")).toBe(true);
    expect(hasPermission("project_manager", "time_entry", "approve")).toBe(true);
  });
});

import { calculateJobProfit } from "@/lib/services/financialCalculations";

describe("labor cost in job totals", () => {
  const base = { expenseItems: 1000, mileageCosts: 0, subcontractorCosts: 0, agentCosts: 0 };

  it("adds approved labor once to total expenses and net profit", () => {
    const profit = calculateJobProfit(5000, { ...base, laborCost: 320 });
    expect(profit.totalExpenses).toBe(1320);
    expect(profit.netProfit).toBe(3680);
  });

  it("leaves job totals unchanged when there is no labor", () => {
    const withoutLabor = calculateJobProfit(5000, base);
    const withZeroLabor = calculateJobProfit(5000, { ...base, laborCost: 0 });
    expect(withZeroLabor.totalExpenses).toBe(withoutLabor.totalExpenses);
  });

  it("labor is separate from expense rows, so the same money is never counted twice", () => {
    // A labor expense row is already inside expenseItems. Time-entry labor is
    // a separate source. Adding one must not change the other.
    const expensesOnly = calculateJobProfit(5000, base);
    const laborOnly = calculateJobProfit(5000, { ...base, expenseItems: 0, laborCost: 1000 });
    expect(laborOnly.totalExpenses).toBe(expensesOnly.totalExpenses);
  });
});
