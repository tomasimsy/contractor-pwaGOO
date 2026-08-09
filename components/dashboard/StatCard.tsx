"use client";

/**
 * Reusable stat tile — optimized for a 4-column ultra-dense mobile grid.
 */
import type { LucideIcon } from "lucide-react";

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
  tone?: "neutral" | "success" | "danger" | "warning";
  hint?: string;
  size?: "sm" | "md";
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
    <div
      className="relative flex flex-col justify-between overflow-hidden rounded-md border border-border bg-card p-1 shadow-xs transition-all active:scale-[0.98]"
    >
      <div>
        {/* Header row: Tiny icon and label for 4-column fit */}
        <div className="flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="size-2.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        
        {/* Value: Micro font size to prevent breaking into multiple lines */}
        <div
          className={`font-extrabold tracking-tight leading-tight mt-0.5 text-[11px] sm:text-base ${toneClass}`}
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