"use client";

/**
 * The profit picture for one project, rendered from a ProjectFinancials
 * that FinancialEngine produced.
 *
 * It takes the whole object and renders it. It does not accept the
 * ingredients and add them up — that is the entire point. Every figure
 * here (contract amount, approved change orders, revenue, payments
 * received, outstanding balance, total expenses, estimated and actual
 * profit) is a field the engine already computed, so this card cannot
 * disagree with the Dashboard, a report, or the project page: they are
 * all displaying the same computed object.
 *
 * ESTIMATED vs ACTUAL PROFIT
 *   estimated = revised contract  −  costs
 *   actual    = cash collected    −  costs
 * They differ by exactly the outstanding receivable. Showing only one
 * of them is how a business mistakes "billed" for "banked".
 */
import { TrendingUp } from "lucide-react";
import type { ProjectFinancials } from "@/lib/services";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function Row({ label, value, tone, strong }: { label: string; value: number; tone?: "good" | "bad"; strong?: boolean }) {
  const toneClass = tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-foreground";
  return (
    <div className={`flex items-center justify-between gap-2 py-1 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={toneClass}>{money(value)}</span>
    </div>
  );
}

export function ProfitSummaryCard({ financials }: { financials: ProjectFinancials | null }) {
  if (!financials) return null;

  const f = financials;
  // Actual profit is cash-in minus cost. Derived here only for display
  // from two fields the engine already computed — not a new cost or
  // revenue rule.
  const actualProfit = f.amountPaid - f.totalExpenses;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <TrendingUp className="size-4 text-muted-foreground" /> Profit
      </h2>

      <p className="mb-3 text-xs text-muted-foreground">
        Every figure below comes from the shared financial engine — the same numbers the dashboard and reports use.
      </p>

      <div className="divide-y divide-border">
        <div className="pb-2">
          <Row label="Contract amount" value={f.invoicesTotal} />
          <Row label="Approved change orders" value={f.approvedChangeOrderTotal} />
          <Row label="Revenue (revised contract)" value={f.revisedTotal} strong />
        </div>

        <div className="py-2">
          <Row label="Payments received" value={f.amountPaid} />
          <Row label="Outstanding balance" value={f.remainingBalance} tone={f.remainingBalance > 0 ? "bad" : undefined} />
        </div>

        <div className="py-2">
          <Row label="Total expenses" value={f.totalExpenses} />
          {f.outstandingTotal > 0 && (
            <Row label="Still owed to agents/subs" value={f.outstandingTotal} tone="bad" />
          )}
        </div>

        <div className="pt-2">
          <Row
            label="Estimated profit"
            value={f.netProfit}
            tone={f.netProfit >= 0 ? "good" : "bad"}
            strong
          />
          <Row label="Actual profit (cash)" value={actualProfit} tone={actualProfit >= 0 ? "good" : "bad"} strong />
          <div className="flex items-center justify-between gap-2 py-1 text-sm">
            <span className="text-muted-foreground">Margin</span>
            <span className={f.profitMargin >= 0 ? "text-success" : "text-danger"}>{f.profitMargin.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
