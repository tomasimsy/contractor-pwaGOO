"use client";

/**
 * Date range picker for the Dashboard — presets map to a plain
 * `DateRange` ({start, end}), the exact type FinancialEngine's
 * `getCompanyFinancials`/`getTaxSummary` already accept. No new date
 * math beyond "what are the boundaries of this preset" — the
 * financial figures themselves are always computed by the engine, not
 * here.
 *
 * Company scoping needs no control here: this app's data model is one
 * profile -> one companyId (see CompanySwitcher's own doc comment) —
 * there is no multi-company membership to filter across yet, so
 * "company filter" is already satisfied by the authenticated user's
 * own profile.companyId, applied wherever this dashboard calls a
 * service.
 */
import type { DateRange } from "@/lib/services/types";

export type DateRangePreset = "this_month" | "last_30" | "last_90" | "this_year" | "last_year";

export const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_30", label: "Last 30 days" },
  { value: "last_90", label: "Last 90 days" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
];

export function resolveDateRangePreset(preset: DateRangePreset, now: Date = new Date()): DateRange {
  const year = now.getFullYear();
  const month = now.getMonth();
  switch (preset) {
    case "this_month":
      return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
    case "last_30": {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { start, end: now };
    }
    case "last_90": {
      const start = new Date(now);
      start.setDate(start.getDate() - 89);
      return { start, end: now };
    }
    case "this_year":
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
    case "last_year":
      return { start: new Date(year - 1, 0, 1), end: new Date(year - 1, 11, 31) };
  }
}

export function DateRangeFilter({ value, onChange }: { value: DateRangePreset; onChange: (preset: DateRangePreset) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as DateRangePreset)}
      className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      aria-label="Date range"
    >
      {DATE_RANGE_PRESETS.map((p) => (
        <option key={p.value} value={p.value}>{p.label}</option>
      ))}
    </select>
  );
}
