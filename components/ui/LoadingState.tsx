import { cn } from "@/lib/utils";

/** Skeleton block — the base primitive every loading state composes from. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** Full-section loading state: a spinner + label, for a page/panel that
 * has nothing to show yet. Use SkeletonList instead when the eventual
 * content is a list/table, so the loading state matches its shape. */
export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-12 text-center", className)}>
      <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Row-shaped skeletons for a list/table that's still loading — keeps
 * the loading state's footprint close to the real content's, so the
 * page doesn't jump when data arrives. */
export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
