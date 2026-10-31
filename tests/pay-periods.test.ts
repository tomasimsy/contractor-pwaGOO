import { describe, expect, it } from "vitest";
import { periodContaining, shiftPeriodDays } from "@/lib/payPeriods";

/** Clocks fall back on Nov 1, 2026 and spring forward on Mar 14, 2027 (US). */
describe("pay periods across daylight-saving changes", () => {
  it("adds calendar days, even over the 25-hour day", () => {
    expect(shiftPeriodDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(shiftPeriodDays("2027-03-14", 1)).toBe("2027-03-15");
    expect(shiftPeriodDays("2026-11-02", -1)).toBe("2026-11-01");
  });

  it("every-two-weeks periods stay Monday to Sunday after the clocks change", () => {
    expect(periodContaining(new Date("2026-10-29T12:00:00"), 14)).toEqual({ start: "2026-10-19", end: "2026-11-01" });
    expect(periodContaining(new Date("2026-11-05T12:00:00"), 14)).toEqual({ start: "2026-11-02", end: "2026-11-15" });
    expect(periodContaining(new Date("2027-03-20T12:00:00"), 14)).toEqual({ start: "2027-03-08", end: "2027-03-21" });
  });

  it("weekly periods too", () => {
    expect(periodContaining(new Date("2026-11-02T08:00:00"), 7)).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
});
