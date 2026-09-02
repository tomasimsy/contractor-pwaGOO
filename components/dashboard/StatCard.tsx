"use client";

/**
 * Reusable stat tile — optimized for a 4-column ultra-dense mobile grid.
 *
 * Color-coded by `tone`: a colored left border + a tinted icon chip,
 * so the row of tiles reads at a glance (green = good/money in, red =
 * needs action, amber = money out, blue = collected/informational) —
 * not just the value text, which is all the previous version colored.
 */
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
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
  hint?: string;
  size?: "sm" | "md";
}) {
  const t = TONE_STYLES[tone];

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-md border border-l-4 ${t.border} border-border bg-card p-1 shadow-xs transition-all active:scale-[0.98]`}
    >
      <div>
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
