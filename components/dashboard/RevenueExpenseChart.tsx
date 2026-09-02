"use client";

/**
 * Monthly revenue vs. expense chart — smooth SVG area/line curves, not
 * a bar chart. Still no charting library (confirmed: no recharts/
 * chart.js/d3 dependency in this repo) — plain SVG path math, same
 * "no new dependency for one widget" convention this file already
 * established. Every value plotted is still
 * FinancialEngine.getCompanyFinancials' own totalRevenue/totalExpenses
 * for that month; nothing computed here beyond curve/path geometry (a
 * rendering concern, not a financial calculation).
 */
export interface MonthlyPoint {
  label: string; // e.g. "Jan 2026"
  revenue: number;
  expenses: number;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const WIDTH = 600;
const HEIGHT = 180;
const PAD_Y = 12;

/** Catmull-Rom -> cubic Bezier smoothing, so the line reads as a
 * curve rather than a jagged polyline — a pure rendering choice, no
 * data smoothing/interpolation of the underlying figures themselves. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function RevenueExpenseChart({ data }: { data: MonthlyPoint[] }) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.flatMap((d) => [d.revenue, d.expenses]));
  const stepX = data.length > 1 ? WIDTH / (data.length - 1) : 0;
  const yFor = (v: number) => HEIGHT - PAD_Y - (v / max) * (HEIGHT - PAD_Y * 2);

  const revenuePoints = data.map((d, i) => ({ x: i * stepX, y: yFor(d.revenue) }));
  const expensePoints = data.map((d, i) => ({ x: i * stepX, y: yFor(d.expenses) }));
  const revenueLine = smoothPath(revenuePoints);
  const expenseLine = smoothPath(expensePoints);
  const revenueArea = `${revenueLine} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Monthly Revenue &amp; Expenses</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400" /> Revenue</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-900" /> Expenses</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-44 w-full overflow-visible">
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={revenueArea} fill="url(#revenueFill)" />
        <path d={revenueLine} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
        <path d={expenseLine} fill="none" stroke="#064e3b" strokeWidth="2.5" strokeLinecap="round" />
        {revenuePoints.map((p, i) => (
          <circle key={`r-${data[i].label}`} cx={p.x} cy={p.y} r="3" fill="#34d399">
            <title>{`Revenue (${data[i].label}): ${money(data[i].revenue)}`}</title>
          </circle>
        ))}
        {expensePoints.map((p, i) => (
          <circle key={`e-${data[i].label}`} cx={p.x} cy={p.y} r="3" fill="#064e3b">
            <title>{`Expenses (${data[i].label}): ${money(data[i].expenses)}`}</title>
          </circle>
        ))}
      </svg>

      <div className="mt-1 flex justify-between overflow-x-auto text-[10px] text-muted-foreground">
        {data.map((d) => (
          <span key={d.label} className="whitespace-nowrap px-0.5">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

export function RevenueExpenseChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-card p-4">
      <div className="mb-4 h-4 w-40 rounded bg-muted" />
      <div className="h-44 w-full rounded bg-muted" />
    </div>
  );
}
