"use client";

/**
 * "Expense Breakdown" donut — real category totals, not decoration.
 * Uses the SAME calculateExpenseTotals(...).byType every other expense
 * surface in this app reads (Bills page, Expenses register), so this
 * can never disagree with what those pages show. No new charting
 * library — a plain multi-segment SVG ring, matching this codebase's
 * existing "no recharts/d3 dependency" convention
 * (see RevenueExpenseChart.tsx's own header).
 *
 * Dark forest-green surface — the ring track and segment colors are
 * chosen for contrast against a dark green field (light emerald/gray
 * tones), not the light-card palette the first version used.
 *
 * Capped at the top 3 categories by spend + one "Other" bucket for
 * everything else, so the ring and legend never get needlessly long.
 * Deliberately a restrained ramp (emerald shades + warm gray for
 * Other) rather than one hue per category — color marks rank, not an
 * arbitrary category identity.
 */
import { EXPENSE_TYPE_LABEL, type ExpenseType } from "@/lib/services/expenseService";

const SEGMENT_COLORS = ["#6ee7b7", "#34d399", "#0d9488", "#94a3b8"];

export interface ExpenseBreakdownDonutProps {
  byType: Record<string, number>;
  total: number;
}

export function ExpenseBreakdownDonut({ byType, total }: ExpenseBreakdownDonutProps) {
  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const sorted = Object.entries(byType)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3);
  const otherAmount = sorted.slice(3).reduce((sum, [, amount]) => sum + amount, 0);
  const segments = [
    ...top.map(([type, amount]) => ({ label: EXPENSE_TYPE_LABEL[type as ExpenseType] ?? type, amount })),
    ...(otherAmount > 0 ? [{ label: "Other", amount: otherAmount }] : []),
  ];

  if (total === 0 || segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-emerald-300/50">
        No expenses recorded for this period.
      </div>
    );
  }

  // Ring geometry — stroke-dasharray per segment, offset running total.
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let offsetSoFar = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <svg viewBox="0 0 180 180" className="size-40 shrink-0 -rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#ffffff0f" strokeWidth="18" />
        {segments.map((seg, i) => {
          const fraction = seg.amount / total;
          const dash = fraction * circumference;
          const el = (
            <circle
              key={seg.label}
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke={SEGMENT_COLORS[i] ?? SEGMENT_COLORS[SEGMENT_COLORS.length - 1]}
              strokeWidth="18"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offsetSoFar}
              strokeLinecap="butt"
            />
          );
          offsetSoFar += dash;
          return el;
        })}
      </svg>

      <div className="w-full min-w-0">
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300/60">Total Expense</div>
          <div className="text-xl font-bold text-emerald-50">{money(total)}</div>
        </div>
        <ul className="space-y-2">
          {segments.map((seg, i) => (
            <li key={seg.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: SEGMENT_COLORS[i] ?? SEGMENT_COLORS[SEGMENT_COLORS.length - 1] }}
                />
                <span className="truncate font-medium text-emerald-50">{seg.label}</span>
                <span className="shrink-0 text-emerald-300/50">{money(seg.amount)}</span>
              </span>
              <span className="shrink-0 font-semibold text-emerald-100">{Math.round((seg.amount / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
