import type { ReactNode } from "react";

export default function DashboardPanel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
