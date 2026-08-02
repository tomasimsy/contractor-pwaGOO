"use client";

/**
 * Monthly revenue vs. expense bar chart — no charting library exists
 * in this repo yet (confirmed: no recharts/chart.js/d3 dependency), so
 * this is a plain CSS/flexbox bar chart rather than introducing a new
 * dependency for one widget. Every value plotted is
 * FinancialEngine.getCompanyFinancials' own totalRevenue/totalExpenses
 * for that month — nothing is computed here beyond bar-height scaling
 * (a rendering concern, not a financial calculation).
 */
export interface MonthlyPoint {
  label: string; // e.g. "Jan 2026"
  revenue: number;
  expenses: number;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function RevenueExpenseChart({ data }: { data: MonthlyPoint[] }) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.flatMap((d) => [d.revenue, d.expenses]));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Monthly Revenue &amp; Expenses</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" /> Revenue</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-muted-foreground/50" /> Expenses</span>
        </div>
      </div>

      <div className="flex h-48 items-end gap-2 overflow-x-auto sm:gap-3">
        {data.map((point) => (
          <div key={point.label} className="flex min-w-[44px] flex-1 flex-col items-center gap-1">
            <div className="flex h-40 w-full items-end justify-center gap-0.5">
              <div
                className="w-2.5 rounded-t bg-primary sm:w-3"
                style={{ height: `${(point.revenue / max) * 100}%` }}
                title={`Revenue: ${money(point.revenue)}`}
              />
              <div
                className="w-2.5 rounded-t bg-muted-foreground/50 sm:w-3"
                style={{ height: `${(point.expenses / max) * 100}%` }}
                title={`Expenses: ${money(point.expenses)}`}
              />
            </div>
            <span className="whitespace-nowrap text-[10px] text-muted-foreground">{point.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RevenueExpenseChartSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 h-4 w-56 animate-pulse rounded bg-muted" />
      <div className="flex h-48 items-end gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-full flex-1 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
