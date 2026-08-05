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
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "danger" | "warning";
  hint?: string;
}) {
  const toneClass =
    tone === "success" 
      ? "text-success" 
      : tone === "danger" 
      ? "text-danger" 
      : tone === "warning" 
      ? "text-warning-foreground" 
      : "text-foreground";

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm transition-all active:scale-[0.98]">
      <div>
        {/* Header row: Icon + Label scaled down for mobile screens to prevent ugly wrapping */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        
        {/* Value: Adjusted font size to fit large currency figures neatly on 2-column mobile grids */}
        <div className={`mt-1.5 text-xl font-extrabold tracking-tight sm:text-2xl ${toneClass}`}>
          {value}
        </div>
      </div>

      {hint && (
        <div className="mt-2 text-[10px] font-medium text-muted-foreground/80 sm:text-xs">
          {hint}
        </div>
      )}
    </div>
  );
}

/** Loading placeholder matching StatCard's exact mobile & desktop dimensions */
export function StatCardSkeleton() {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        <div className="size-3.5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-16 animate-pulse rounded bg-muted sm:w-20" />
      </div>
      <div className="mt-2 h-6 w-20 animate-pulse rounded bg-muted sm:h-7 sm:w-24" />
      <div className="mt-2 h-2.5 w-12 animate-pulse rounded bg-muted" />
    </div>
  );
}