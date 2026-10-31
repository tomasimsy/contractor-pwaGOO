import { describe, it, expect } from "vitest";
import { computePayees, type PaymentRecord } from "@/lib/services/payeeOwed";
import type { TimeEntry } from "@/lib/services/timeEntryService";

function entry(over: Partial<TimeEntry>): TimeEntry {
  return {
    id: "e", companyId: "c", employeeId: "a", estimateId: "est", workDate: "2026-10-21",
    startedAt: null, endedAt: null, hours: 8, rate: 10, payType: "hourly", notes: null, status: "approved",
    enteredBy: null, approvedBy: null, approvedAt: null,
    createdBy: null, createdAt: "", updatedBy: null, updatedAt: "", deletedBy: null, deletedAt: null, deleteReason: null,
    ...over,
  };
}
const label = () => "Job";
function pay(over: Partial<PaymentRecord>): PaymentRecord {
  return { id: "p", payeeKind: "employee", employeeId: "a", profileId: null, estimateId: null, expenseId: null, amount: 0, paymentKind: "pay", periodStart: null, periodEnd: null, paidOn: "2026-10-20", method: "Check", reference: null, reversedAt: null, reversalReason: null, ...over };
}
const base = { employees: [{ id: "a", name: "Hien", profileId: null, isActive: true }], teamAssignments: [], estimateLabel: label };

describe("computePayees", () => {
  it("an employee is owed hourly pay less what has been paid", () => {
    const [row] = computePayees({ ...base, entries: [entry({ hours: 8, rate: 10 })], jobPays: [], completedEstimateIds: new Set(), payments: [pay({ amount: 30 })] });
    expect(row).toMatchObject({ earned: 80, paid: 30, owed: 50 });
  });

  it("a reversed payment is not counted as paid", () => {
    const [row] = computePayees({ ...base, entries: [entry({ hours: 8, rate: 10 })], jobPays: [], completedEstimateIds: new Set(), payments: [pay({ amount: 30, reversedAt: "2026-10-21" })] });
    expect(row).toMatchObject({ paid: 0, owed: 80 });
  });

  it("job pay is owed only once its project is complete", () => {
    const jobPays = [{ estimateId: "est", employeeId: "a", amount: 100, mode: "replace" as const }];
    const notDone = computePayees({ ...base, entries: [], jobPays, completedEstimateIds: new Set(), payments: [] });
    expect(notDone).toEqual([]);
    const done = computePayees({ ...base, entries: [], jobPays, completedEstimateIds: new Set(["est"]), payments: [] });
    expect(done[0]).toMatchObject({ earned: 100, owed: 100 });
  });

  it("a team member is owed the fixed amount on completed jobs only, less what was paid on that job", () => {
    const team = [
      { profileId: "t1", estimateId: "done", amount: 400, name: "Ana" },
      { profileId: "t1", estimateId: "open", amount: 200, name: "Ana" },
    ];
    const payments = [pay({ payeeKind: "team", employeeId: null, profileId: "t1", estimateId: "done", amount: 100 })];
    const [row] = computePayees({ ...base, employees: [], entries: [], jobPays: [], completedEstimateIds: new Set(["done"]), teamAssignments: team, payments });
    expect(row).toMatchObject({ kind: "team", earned: 400, paid: 100, owed: 300 });
  });

  it("a team job paid outside Payroll (a labor expense only) counts as paid", () => {
    const team = [{ profileId: "t1", estimateId: "done", amount: 300, name: "Ana" }];
    // Paid 100 from an older page (expense only) and 50 by Payroll, which wrote expense e2.
    const payments = [pay({ payeeKind: "team", employeeId: null, profileId: "t1", estimateId: "done", amount: 50, expenseId: "e2" })];
    const teamPaidExpenses = [
      { profileId: "t1", estimateId: "done", amount: 100 },
      { profileId: "t1", estimateId: "done", amount: 50 },
    ];
    const [row] = computePayees({ ...base, employees: [], entries: [], jobPays: [], completedEstimateIds: new Set(["done"]), teamAssignments: team, payments, teamPaidExpenses });
    // Payroll's own 50 is counted once (by its expense), not twice.
    expect(row.lines[0]).toMatchObject({ earned: 300, paid: 150, owed: 150 });
  });

  it("a multi-job Payroll payment counts each job once, through the expense it wrote", () => {
    const team = [
      { profileId: "t1", estimateId: "a", amount: 40, name: "Ana" },
      { profileId: "t1", estimateId: "b", amount: 60, name: "Ana" },
    ];
    const payments = [
      pay({
        payeeKind: "team", employeeId: null, profileId: "t1", amount: 100,
        allocations: [
          { kind: "job", estimateId: "a", amount: 40, label: "A", expenseIds: ["ea"] },
          { kind: "job", estimateId: "b", amount: 60, label: "B", expenseIds: ["eb"] },
        ],
      }),
    ];
    const teamPaidExpenses = [
      { profileId: "t1", estimateId: "a", amount: 40 },
      { profileId: "t1", estimateId: "b", amount: 60 },
    ];
    const [row] = computePayees({ ...base, employees: [], entries: [], jobPays: [], completedEstimateIds: new Set(["a", "b"]), teamAssignments: team, payments, teamPaidExpenses });
    expect(row.owed).toBe(0);
    expect(row.lines.map((l) => l.paid)).toEqual([40, 60]);
  });

  it("a correction shows as its own line with what is still owed from it", () => {
    const payments = [
      pay({ id: "p1", amount: 80, estimateId: "est" }),
      pay({ id: "adj", amount: 45, paymentKind: "adjustment", notes: "Raise difference" }),
    ];
    const [row] = computePayees({ ...base, entries: [entry({ hours: 8, rate: 10 })], jobPays: [], completedEstimateIds: new Set(), payments });
    expect(row.owed).toBe(45);
    expect(row.lines.find((l) => l.kind === "adjustment")).toMatchObject({ label: "Correction · Raise difference", earned: 45, owed: 45 });
  });

  it("a pending reimbursement is owed on top of pay, and reimbursement payments do not reduce pay", () => {
    const reimbursements = [{ expenseId: "x1", profileId: "p1", payeeName: "Hien", amount: 45, label: "Materials" }];
    const employees = [{ id: "a", name: "Hien", profileId: "p1", isActive: true }];
    const payments = [pay({ paymentKind: "reimbursement", amount: 45, profileId: "p1", employeeId: null, payeeKind: "team" })];
    const [row] = computePayees({ ...base, employees, entries: [entry({ hours: 8, rate: 10 })], jobPays: [], completedEstimateIds: new Set(), reimbursements, payments });
    expect(row.owed).toBe(125);
    expect(row.paid).toBe(0);
  });

  it("a person who is both an employee and a team member gets one row with both amounts", () => {
    const employees = [{ id: "a", name: "Hien", profileId: "p1", isActive: true }];
    const team = [{ profileId: "p1", estimateId: "done", amount: 400, name: "Hien" }];
    const reimbursements = [{ expenseId: "x1", profileId: "p1", payeeName: "Hien", amount: 45, label: "Materials" }];
    const payments = [pay({ payeeKind: "team", employeeId: null, profileId: "p1", estimateId: "done", amount: 100 })];
    const rows = computePayees({
      ...base, employees, entries: [entry({ hours: 8, rate: 10 })], jobPays: [], completedEstimateIds: new Set(["done"]),
      teamAssignments: team, reimbursements, payments,
    });
    expect(rows).toHaveLength(1);
    // Hourly 80 + fixed 400 = 480 earned; 100 paid to the team job; 45 reimbursement owed once.
    expect(rows[0]).toMatchObject({ name: "Hien", earned: 480, paid: 100, owed: 425 });
    expect(rows[0].lines.filter((l) => l.kind === "reimbursement")).toHaveLength(1);
  });

  it("the pay period cut-off leaves out hours worked after it", () => {
    const entries = [entry({ id: "1", workDate: "2026-10-18", hours: 8, rate: 10 }), entry({ id: "2", workDate: "2026-10-25", hours: 8, rate: 10 })];
    const [row] = computePayees({ ...base, throughDate: "2026-10-19", entries, jobPays: [], completedEstimateIds: new Set(), payments: [] });
    expect(row.earned).toBe(80);
  });

  it("a correction adds to or takes away from what is owed, and is not counted as paid", () => {
    const adj = [pay({ paymentKind: "adjustment", amount: 25 }), pay({ id: "p2", paymentKind: "adjustment", amount: -10 })];
    const [row] = computePayees({ ...base, entries: [entry({ hours: 8, rate: 10 })], jobPays: [], completedEstimateIds: new Set(), payments: adj });
    expect(row.owed).toBe(95);
    expect(row.paid).toBe(0);
  });
});

describe("one check covering several jobs and a reimbursement", () => {
  it("reduces each job's balance and the reimbursement, and shows as one payment", () => {
    const estimateLabel = (id: string) => (id === "jobA" ? "Job A" : "Job B");
    const employees = [{ id: "a", name: "Hien", profileId: "p1", isActive: true }];
    // The reimbursement was paid in this check, so its expense is no longer pending.
    const reimbursements: Array<{ expenseId: string; profileId: string; payeeName: string; amount: number; label: string }> = [];
    const jobPays = [
      { estimateId: "jobA", employeeId: "a", amount: 60, mode: "replace" as const },
      { estimateId: "jobB", employeeId: "a", amount: 40, mode: "replace" as const },
    ];
    const check = pay({
      id: "check1",
      amount: 80,
      profileId: "p1",
      allocations: [
        { kind: "job", estimateId: "jobA", amount: 60, label: "Job A", expenseIds: [] },
        { kind: "job", estimateId: "jobB", amount: 20, label: "Job B", expenseIds: [] },
        { kind: "reimbursement", estimateId: null, amount: 20, label: "Reimbursement", expenseIds: ["x1"] },
      ],
    });
    const [row] = computePayees({
      ...base,
      employees,
      entries: [],
      jobPays,
      completedEstimateIds: new Set(["jobA", "jobB"]),
      estimateLabel,
      reimbursements,
      payments: [check],
    });
    // Job A is paid in full, Job B has 20 left, and the reimbursement is settled.
    expect(row.lines.find((l) => l.estimateId === "jobA")).toMatchObject({ owed: 0 });
    expect(row.lines.find((l) => l.estimateId === "jobB")).toMatchObject({ owed: 20 });
    expect(row.lines.find((l) => l.kind === "reimbursement")).toBeUndefined();
    expect(row.owed).toBe(20);
    // The check is shown once, not once per part.
    expect(row.payments.filter((p) => p.id === "check1")).toHaveLength(1);
  });
});
