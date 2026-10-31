import { describe, expect, it } from "vitest";
import { FROM_THE_START, nextPayPeriodStart, rateOn, rateTimeline, type PayRate } from "@/lib/payRates";

const r = (id: string, rate: number, effectiveDate: string): PayRate => ({ id, employeeId: "a", rate, payType: "hourly", effectiveDate, note: null, createdAt: "" });

describe("pay rate history", () => {
  const history = [r("start", 10, FROM_THE_START), r("raise", 20, "2026-11-02")];

  it("the rate on a day is the latest one that started on or before it", () => {
    expect(rateOn(history, "2026-10-30")?.rate).toBe(10);
    expect(rateOn(history, "2026-11-01")?.rate).toBe(10);
    expect(rateOn(history, "2026-11-02")?.rate).toBe(20);
    expect(rateOn(history, "2027-03-01")?.rate).toBe(20);
  });

  it("the timeline lists newest first with the day each rate ended", () => {
    expect(rateTimeline(history).map((x) => [x.rate, x.endsOn])).toEqual([
      [20, null],
      [10, "2026-11-01"],
    ]);
  });

  it("the default start is the first day of the next pay period", () => {
    // Periods start Monday 2026-10-05 and run 14 days: Oct 19 – Nov 1 contains Oct 29.
    expect(nextPayPeriodStart("biweekly", new Date("2026-10-29T12:00:00"))).toBe("2026-11-02");
    expect(nextPayPeriodStart("weekly", new Date("2026-10-29T12:00:00"))).toBe("2026-11-02");
  });
});
