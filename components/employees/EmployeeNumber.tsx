/** An employee number (EMP-0001) as a small, easy-to-read tag: fixed-width
 * digits, so numbers line up in lists. Renders nothing when there is none. */
export function EmployeeNumber({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  if (!value) return null;
  return (
    <span
      className={`inline-block rounded border border-border bg-muted/60 px-1.5 py-px align-middle font-mono text-[11px] font-semibold tracking-wide text-foreground/80 ${className}`}
    >
      {value}
    </span>
  );
}
