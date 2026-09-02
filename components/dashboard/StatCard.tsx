"use client";

/**
 * Reusable stat tile — optimized for a 4-column ultra-dense mobile grid.
 *
 * Color-coded by `tone`: a colored left border + a tinted icon chip,
 * so the row of tiles reads at a glance (green = good/money in, red =
 * needs action, amber = money out, blue = collected/informational) —
 * not just the value text, which is all the previous version colored.
 */
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TONE_STYLES: Record<
  "neutral" | "success" | "danger" | "warning" | "info",
  { border: string; iconBg: string; iconText: string; valueText: string }
> = {
  neutral: { border: "border-l-border", iconBg: "bg-muted", iconText: "text-muted-foreground", valueText: "text-foreground" },
  success: { border: "border-l-emerald-500", iconBg: "bg-emerald-100", iconText: "text-emerald-700", valueText: "text-success" },
  danger: { border: "border-l-rose-500", iconBg: "bg-rose-100", iconText: "text-rose-700", valueText: "text-danger" },
  warning: { border: "border-l-amber-500", iconBg: "bg-amber-100", iconText: "text-amber-700", valueText: "text-warning-foreground" },
  info: { border: "border-l-blue-500", iconBg: "bg-blue-100", iconText: "text-blue-700", valueText: "text-foreground" },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  size = "sm",
  trendPercent,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
  hint?: string;
  size?: "sm" | "md";
  /** Optional period-over-period % change — renders as a small
   * up/down pill in the corner, matching the label's own tinted-chip
   * language. Omit entirely (not 0) when there's no real prior-period
   * figure to compare against; never pass a fabricated number. */
  trendPercent?: number | null;
}) {
  const t = TONE_STYLES[tone];
  const hasTrend = trendPercent !== undefined && trendPercent !== null;
  const trendUp = hasTrend && trendPercent >= 0;

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-md border border-l-4 ${t.border} border-border bg-card p-1 shadow-xs transition-all active:scale-[0.98]`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          {/* Header row: tinted icon chip + label */}
          <div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full ${t.iconBg}`}>
              <Icon className={`size-2 ${t.iconText}`} />
            </span>
            <span className="truncate">{label}</span>
          </div>

          {/* Value: Micro font size to prevent breaking into multiple lines */}
          <div
            className={`font-extrabold tracking-tight leading-tight mt-0.5 text-[11px] sm:text-base ${t.valueText}`}
          >
            {value}
          </div>
        </div>

        {hasTrend && (
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1 py-px text-[7px] font-bold sm:px-1.5 sm:text-[10px] ${
              trendUp ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}
          >
            {trendUp ? <TrendingUp className="size-2 sm:size-2.5" /> : <TrendingDown className="size-2 sm:size-2.5" />}
            {Math.abs(trendPercent).toFixed(1)}%
          </span>
        )}
      </div>

      {hint && (
        <div className="mt-0.5 text-[7px] sm:text-[10px] text-muted-foreground/80 truncate">
          {hint}
        </div>
      )}
    </div>
  );
}

export function StatCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col justify-between rounded-md border border-border bg-card p-1 shadow-xs ${className}`}
    >
      <div className="flex items-center gap-0.5">
        <div className="size-2.5 animate-pulse rounded bg-muted" />
        <div className="h-2 w-10 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-1 h-3 w-12 animate-pulse rounded bg-muted" />
    </div>
  );
}
