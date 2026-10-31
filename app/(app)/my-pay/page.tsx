"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { createSupabasePayeePaymentService } from "@/lib/services/supabase/payeePaymentService";
import type { PayeeRow } from "@/lib/services/payeeOwed";
import { periodContaining, shiftPeriodDays, shortDate, type PeriodLength } from "@/lib/payPeriods";
import { Banknote } from "lucide-react";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** An employee's own pay: what is owed, how it is made up, and their payment history.
 * Read only. The same rules as the Payroll page, for this person alone. */
function MyPayContent() {
  const services = useServices();
  const { profile } = useAuth();
  const [rows, setRows] = useState<PayeeRow[]>([]);
  const [refDate, setRefDate] = useState(() => today());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const payService = useMemo(
    () =>
      profile?.companyId
        ? createSupabasePayeePaymentService(
            supabase,
            {
              employeeService: services.employeeService,
              timeEntryService: services.timeEntryService,
              estimateService: services.estimateService,
              projectService: services.projectService,
              expenseService: services.expenseService,
            },
            profile.companyId
          )
        : null,
    [profile?.companyId, services.employeeService, services.timeEntryService, services.estimateService, services.projectService, services.expenseService]
  );

  const me = rows.find((r) => r.kind === "employee") ?? null;
  const periodDays: PeriodLength = me?.payFrequency === "weekly" ? 7 : 14;
  const period = periodContaining(new Date(`${refDate}T00:00:00`), periodDays);
  const isCurrent = period.end === periodContaining(new Date(), periodDays).end;

  useEffect(() => {
    if (!payService) return;
    payService
      .load(period.end)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load your pay."))
      .finally(() => setLoading(false));
  }, [payService, period.end]);

  if (loading) return <PageContainer><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></PageContainer>;
  if (!me) {
    return (
      <PageContainer>
        <EmptyState icon={Banknote} title="No pay record yet" description="Your pay shows here once you have approved hours or a job pay." />
      </PageContainer>
    );
  }

  const paid = me.payments.filter((p) => p.paymentKind === "pay" && !p.reversedAt);
  const ytd = paid.filter((p) => p.paidOn.slice(0, 4) === period.end.slice(0, 4)).reduce((t, p) => t + p.amount, 0);

  return (
    <PageContainer>
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-lg font-medium text-foreground">My pay</div>
          <div className="flex items-center gap-1.5 text-sm">
            <button type="button" aria-label="Previous period" onClick={() => setRefDate(shiftPeriodDays(refDate, -periodDays))} className="rounded-md border border-border px-2 py-0.5 text-muted-foreground">←</button>
            <span className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1 font-semibold text-primary">
              {shortDate(period.start)} – {shortDate(period.end)}
            </span>
            <button type="button" aria-label="Next period" onClick={() => setRefDate(shiftPeriodDays(refDate, periodDays))} className="rounded-md border border-border px-2 py-0.5 text-muted-foreground">→</button>
            {!isCurrent && <button type="button" onClick={() => setRefDate(today())} className="text-xs text-primary hover:underline">This period</button>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-3">
            <div className="text-xs text-muted-foreground">Owed now</div>
            <div className="text-xl font-medium text-foreground">{money(me.owed)}</div>
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="text-xs text-muted-foreground">Paid this year</div>
            <div className="text-xl font-medium text-foreground">{money(ytd)}</div>
          </div>
        </div>

        <div className="flex flex-col">
          {me.lines.map((l, i) => (
            <div key={`${l.label}-${i}`} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{l.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {money(l.paid)} / {money(l.earned)} <span className="ml-2 font-medium text-foreground">{money(l.owed)} owed</span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">Payment history</div>
          {me.payments.length === 0 && <div className="text-sm text-muted-foreground">No payments yet.</div>}
          {me.payments.map((p) =>
            p.paymentKind === "adjustment" ? (
              <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm text-muted-foreground">
                <span className="min-w-0 truncate">{p.paidOn} · Correction</span>
                <span className="shrink-0">{money(p.amount)}</span>
              </div>
            ) : (
              /* Each payment opens its pay stub. */
              <Link
                key={p.id}
                href={`/my-pay/${p.id}`}
                className={`flex items-center justify-between gap-2 border-b border-border py-2 text-sm hover:bg-muted/40 ${p.reversedAt ? "text-muted-foreground line-through" : ""}`}
              >
                <span className="min-w-0 truncate">
                  {shortDate(p.paidOn)} · {p.periodStart && p.periodEnd ? `${shortDate(p.periodStart)} – ${shortDate(p.periodEnd)}` : p.paymentKind === "reimbursement" ? "Reimbursement" : "Pay"} · {p.method}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums">{money(p.amount)}</span>
                  <span className="text-xs font-medium text-primary">Pay stub →</span>
                </span>
              </Link>
            )
          )}
        </div>
      </div>
    </PageContainer>
  );
}

export default function MyPayPage() {
  return (
    <RequirePermission resource="time_entry" action="view">
      <MyPayContent />
    </RequirePermission>
  );
}
