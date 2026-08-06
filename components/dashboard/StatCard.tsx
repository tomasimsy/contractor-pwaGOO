"use type";

/**
 * Reusable stat tile — optimized for mobile touch targets, information hierarchy,
 * and tight viewports. Uses responsive padding, compact typography, and distinct 
 * visual indicators for scannability.
 */
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  size = "md",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "danger" | "warning";
  hint?: string;
  /** "sm" is a denser variant for pages that show four or more tiles
   * above the fold — smaller value type and tighter padding, same
   * structure. Defaults to "md" so every existing call site renders
   * exactly as before. */
  size?: "sm" | "md";
}) {
  const compact = size === "sm";
  const toneClass =
    tone === "success" 
      ? "text-success" 
      : tone === "danger" 
      ? "text-danger" 
      : tone === "warning" 
      ? "text-warning-foreground" 
      : "text-foreground";

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all active:scale-[0.98] ${
        compact ? "p-2.5" : "p-3 sm:p-4"
      }`}
    >
      <div>
        {/* Header row: Icon + Label scaled down for mobile screens to prevent ugly wrapping */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        
        {/* Value: Adjusted font size to fit large currency figures neatly on 2-column mobile grids */}
        <div
          className={`font-extrabold tracking-tight ${
            compact ? "mt-1 text-base" : "mt-1.5 text-xl sm:text-2xl"
          } ${toneClass}`}
        >
          {value}
        </div>
      </div>

      {hint && (
        <div
          className={`font-medium text-muted-foreground/80 ${
            compact ? "mt-1 text-[10px]" : "mt-2 text-[10px] sm:text-xs"
          }`}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/** Loading placeholder matching StatCard's exact mobile & desktop
 * dimensions. `className` is appended so a caller can pin a height and
 * stop the layout jumping when the real tiles arrive. */
export function StatCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col justify-between rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <div className="size-3.5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-16 animate-pulse rounded bg-muted sm:w-20" />
      </div>
      <div className="mt-2 h-6 w-20 animate-pulse rounded bg-muted sm:h-7 sm:w-24" />
      <div className="mt-2 h-2.5 w-12 animate-pulse rounded bg-muted" />
    </div>
  );
}