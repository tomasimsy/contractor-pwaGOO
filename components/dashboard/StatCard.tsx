"use client";

/**
 * Reusable stat tile — every dashboard number is a plain read of a
 * field FinancialEngine/EstimateService/ProjectService already
 * computed; this component only formats and displays it.
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
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning-foreground" : "text-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-bold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Loading placeholder matching StatCard's exact dimensions, so the
 * grid doesn't reflow once real data arrives. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="h-3 w-20 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
    </div>
  );
}
