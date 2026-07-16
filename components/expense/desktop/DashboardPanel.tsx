import type { ReactNode } from "react";

// Card shell — white surface, subtle border + shadow, rounded but not
// "bubble" (rounded-xl, not rounded-3xl). Spacious padding, clear title
// row. Each card gets a small colored accent dot next to its title
// instead of a colored background, so financial-status color stays
// meaningful (used on badges/buttons) rather than decorating every card.
const ACCENT_DOT: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  gray: "bg-gray-300",
};

export default function DashboardPanel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
  accent,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Escape hatch for panels that need their body to be a scroll
   * container (e.g. a sticky-header ledger) instead of the default
   * static flow. */
  bodyClassName?: string;
  accent?: "emerald" | "blue" | "amber" | "gray";
}) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 shrink-0">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
          {accent && <span className={`h-1.5 w-1.5 rounded-full ${ACCENT_DOT[accent]}`} />}
          {title}
        </h3>
        {action}
      </div>
      <div className={`px-4 sm:px-5 pb-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="text-[13px] text-gray-400 text-center py-6">{message}</div>;
}
