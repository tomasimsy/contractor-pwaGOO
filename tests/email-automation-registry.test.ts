import { describe, test, expect } from "vitest";
import { AUTOMATION_META, computeDueDate, isDue } from "../lib/services/emailAutomationRegistry";

describe("AUTOMATION_META", () => {
  test("has exactly the 11 automations from the design spec, each with sane defaults", () => {
    const keys = AUTOMATION_META.map((a) => a.key).sort();
    expect(keys).toEqual([
      "estimate_followup_1", "estimate_followup_2", "estimate_followup_3",
      "future_project_checkin", "google_review",
      "invoice_due_reminder", "invoice_overdue_reminder",
      "job_completion_thankyou", "payment_receipt",
      "post_job_checkin", "warranty_checkin",
    ]);
    for (const meta of AUTOMATION_META) {
      expect(meta.defaultDelay.value).toBeGreaterThanOrEqual(0);
      expect(["hours", "days"]).toContain(meta.defaultDelay.unit);
    }
  });

  test("only payment_receipt supports a condition", () => {
    const supportsCondition = AUTOMATION_META.filter((a) => a.supportsCondition).map((a) => a.key);
    expect(supportsCondition).toEqual(["payment_receipt"]);
  });

  test("only invoice_due_reminder fires before its anchor", () => {
    const before = AUTOMATION_META.filter((a) => a.delayDirection === "before").map((a) => a.key);
    expect(before).toEqual(["invoice_due_reminder"]);
  });

  test("matches the design spec's default timing", () => {
    const byKey = Object.fromEntries(AUTOMATION_META.map((a) => [a.key, a]));
    expect(byKey.payment_receipt.defaultDelay).toEqual({ value: 0, unit: "hours" });
    expect(byKey.google_review.defaultDelay).toEqual({ value: 2, unit: "days" });
    expect(byKey.estimate_followup_1.defaultDelay).toEqual({ value: 3, unit: "days" });
    expect(byKey.estimate_followup_2.defaultDelay).toEqual({ value: 7, unit: "days" });
    expect(byKey.estimate_followup_3.defaultDelay).toEqual({ value: 14, unit: "days" });
    expect(byKey.invoice_due_reminder.defaultDelay).toEqual({ value: 3, unit: "days" });
    expect(byKey.invoice_overdue_reminder.defaultDelay).toEqual({ value: 7, unit: "days" });
    expect(byKey.job_completion_thankyou.defaultDelay).toEqual({ value: 0, unit: "hours" });
    expect(byKey.post_job_checkin.defaultDelay).toEqual({ value: 30, unit: "days" });
    expect(byKey.future_project_checkin.defaultDelay).toEqual({ value: 180, unit: "days" });
    expect(byKey.warranty_checkin.defaultDelay).toEqual({ value: 365, unit: "days" });
  });
});

describe("computeDueDate", () => {
  test("'after' adds the delay to the anchor", () => {
    const due = computeDueDate("2026-01-01T00:00:00Z", 7, "days", "after");
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-08");
  });

  test("'before' subtracts the delay from the anchor", () => {
    const due = computeDueDate("2026-01-10T00:00:00Z", 3, "days", "before");
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-07");
  });

  test("hours unit", () => {
    const due = computeDueDate("2026-01-01T00:00:00Z", 6, "hours", "after");
    expect(due.toISOString()).toBe("2026-01-01T06:00:00.000Z");
  });
});

describe("isDue", () => {
  test("true once now has reached or passed dueDate", () => {
    const due = new Date("2026-01-08T00:00:00Z");
    expect(isDue(due, new Date("2026-01-07T23:59:59Z"))).toBe(false);
    expect(isDue(due, new Date("2026-01-08T00:00:00Z"))).toBe(true);
    expect(isDue(due, new Date("2026-01-09T00:00:00Z"))).toBe(true);
  });
});
