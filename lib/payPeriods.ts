/** Pay periods start on a Monday and run for one or two weeks. Shared by Payroll and My pay. */
export type PeriodLength = 7 | 14;
export const DAY_MS = 86400000;
const PERIOD_ANCHOR = "2026-10-05";

// Dates are counted as CALENDAR DAYS in UTC, never as 24-hour blocks of
// local time: a day when clocks change is 23 or 25 hours long, which made
// "Nov 1 + 1 day" land on Nov 1 and shifted every period after it by a day.
const toDay = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS;
const fromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

export function periodContaining(date: Date, days: PeriodLength): { start: string; end: string } {
  const elapsed = toDay(date.toLocaleDateString("en-CA")) - toDay(PERIOD_ANCHOR);
  const offset = Math.floor(elapsed / days) * days;
  const start = toDay(PERIOD_ANCHOR) + offset;
  return { start: fromDay(start), end: fromDay(start + days - 1) };
}

/** A date (YYYY-MM-DD) moved by a number of days. */
export function shiftPeriodDays(date: string, days: number): string {
  return fromDay(toDay(date) + days);
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}
