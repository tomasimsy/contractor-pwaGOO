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
  accent,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: "emerald" | "blue" | "amber" | "gray";
}) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
          {accent && <span className={`h-1.5 w-1.5 rounded-full ${ACCENT_DOT[accent]}`} />}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="text-[13px] text-gray-400 text-center py-8">{message}</div>;
}
