/**
 * Loading placeholders.
 *
 * WHY THESE EXIST
 * A panel that renders its EMPTY state while its data is still in
 * flight tells the user something false: "No change orders recorded
 * yet" flashing before two change orders appear reads as a bug, not as
 * loading. Before this, EstimateDetail avoided that by blocking the
 * WHOLE page behind one loading flag — which cost ~3.7s of blank screen
 * (measured: the estimate itself resolved at 1,479ms, the page rendered
 * at 5,223ms). Skeletons are what let the header render immediately
 * while each panel honestly says "still loading" rather than "empty".
 *
 * Deliberately plain: a pulsing muted block. No layout of its own, so
 * a caller can size it to match whatever it stands in for.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-muted ${className}`} />;
}

/** A few stacked lines — the common case for a list or table body. */
export function SkeletonLines({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          // Varying widths so it reads as content rather than a bar
          // chart; the last line short, as real text tends to be.
          {...{ style: { width: i === rows - 1 ? "60%" : `${88 - i * 6}%` } }}
        />
      ))}
    </div>
  );
}
