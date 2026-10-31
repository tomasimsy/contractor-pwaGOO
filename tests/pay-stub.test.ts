import { describe, expect, it } from "vitest";
import { buildPayStub } from "@/lib/payStub";
import type { PaymentRecord } from "@/lib/services/payeeOwed";
import type { TimeEntry } from "@/lib/services/timeEntryService";

function pay(over: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: "p", payeeKind: "employee", employeeId: "a", profileId: null, estimateId: null, expenseId: null, amount: 0,
    paymentKind: "pay", periodStart: "2026-10-19", periodEnd: "2026-11-01", paidOn: "2026-11-01", method: "Check",
    reference: "1042", reversedAt: null, reversalReason: null, createdAt: "2026-11-01T10:00:00Z", ...over,
  };
}
function entry(over: Partial<TimeEntry>): TimeEntry {
  return {
    id: "e", companyId: "c", employeeId: "a", estimateId: "job1", workDate: "2026-10-21", startedAt: null, endedAt: null,
    hours: 8, rate: 25, payType: "hourly", notes: null, status: "approved", enteredBy: null, approvedBy: null, approvedAt: null,
    createdBy: null, createdAt: "", updatedBy: null, updatedAt: "", deletedBy: null, deletedAt: null, deleteReason: null, ...over,
  };
}
const labelFor = () => "OSR1 · Kitchen";

describe("buildPayStub", () => {
  const payment = pay({
    id: "now",
    amount: 445,
    allocations: [
      { kind: "job", estimateId: "job1", amount: 400, label: "Hourly · OSR1 · Kitchen", expenseIds: [] },
      { kind: "reimbursement", estimateId: null, amount: 45, label: "Reimbursement · 1 expense", expenseIds: ["x"] },
    ],
  });
  const earlier = pay({ id: "before", amount: 300, paidOn: "2026-10-18", periodStart: "2026-10-05", periodEnd: "2026-10-18", createdAt: "2026-10-18T10:00:00Z", estimateId: "job1" });
  const reversed = pay({ id: "rev", amount: 999, paidOn: "2026-10-10", reversedAt: "2026-10-11" });
  const lastYear = pay({ id: "old", amount: 500, paidOn: "2025-12-20" });
  const entries = [entry({ id: "1", hours: 8 }), entry({ id: "2", hours: 8, workDate: "2026-10-22" }), entry({ id: "3", hours: 4, status: "submitted" }), entry({ id: "4", hours: 6, workDate: "2026-10-10" })];

  const stub = buildPayStub({ payment, allPayments: [payment, earlier, reversed, lastYear], entries, payType: "hourly", labelFor });

  it("lists wage earnings with the approved hours and rate behind them", () => {
    expect(stub.earnings).toEqual([{ kind: "Regular hours", description: "OSR1 · Kitchen", hours: 16, rate: 25, current: 400 }]);
  });
  it("keeps reimbursements out of gross pay", () => {
    expect(stub.current).toEqual({ hours: 16, gross: 400, deductions: 0, reimbursements: 45, net: 445 });
  });
  it("year to date counts this year's live payments up to this one only", () => {
    // 400 now + 300 earlier; the reversed and last-year payments are left out.
    expect(stub.ytd.gross).toBe(700);
    expect(stub.ytd.reimbursements).toBe(45);
    expect(stub.ytd.net).toBe(745);
  });
  it("records no withholding (the app does not calculate taxes)", () => {
    expect(stub.current.deductions).toBe(0);
    expect(stub.ytd.deductions).toBe(0);
  });
});

describe("a raise inside the pay period", () => {
  // $10/hr on days 1-5, $20/hr on days 6-10, 8 hours a day, all approved.
  const days = Array.from({ length: 10 }, (_, i) => `2026-10-${String(19 + i).padStart(2, "0")}`);
  const entries = days.map((d, i) => entry({ id: `d${i}`, workDate: d, hours: 8, rate: i < 5 ? 10 : 20 }));
  const payment = pay({
    id: "raise",
    amount: 1200,
    allocations: [{ kind: "job", estimateId: "job1", amount: 1200, label: "Hourly · OSR1 · Kitchen", expenseIds: [] }],
  });
  const stub = buildPayStub({ payment, allPayments: [payment], entries, payType: "hourly", labelFor });

  it("shows one earnings line per rate, each hours × its own rate", () => {
    expect(stub.earnings).toEqual([
      { kind: "Regular hours", description: "OSR1 · Kitchen", hours: 40, rate: 10, current: 400 },
      { kind: "Regular hours", description: "OSR1 · Kitchen", hours: 40, rate: 20, current: 800 },
    ]);
  });

  it("adds them up — the old days are not repaid at the new rate", () => {
    expect(stub.current.gross).toBe(1200);
    expect(stub.current.hours).toBe(80);
  });

  it("a part payment across two rates shows what was paid, without inventing a split", () => {
    const partial = pay({ id: "part", amount: 500, allocations: [{ kind: "job", estimateId: "job1", amount: 500, label: "Hourly · OSR1 · Kitchen", expenseIds: [] }] });
    const s2 = buildPayStub({ payment: partial, allPayments: [partial], entries, payType: "hourly", labelFor });
    // The amount paid, and what it is part of — not hours × rate that would not add up to $500.
    expect(s2.earnings).toEqual([
      { kind: "Regular hours", description: "OSR1 · Kitchen · part of $1200.00 (40.00 h × $10.00 + 40.00 h × $20.00)", hours: null, rate: null, current: 500 },
    ]);
  });
});

describe("a correction on the stub", () => {
  it("money paid without a job shows as an adjustment, not as plain pay", () => {
    const p = pay({ id: "c", amount: 45, allocations: [{ kind: "unassigned", estimateId: null, amount: 45, label: "Not tied to a job", expenseIds: [] }] });
    const stub = buildPayStub({ payment: p, allPayments: [p], entries: [], payType: "hourly", labelFor });
    expect(stub.earnings).toEqual([{ kind: "Adjustment", description: "Correction or other pay", hours: null, rate: null, current: 45 }]);
  });
});

