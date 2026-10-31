"use client";

/**
 * Payments received — every customer payment across every invoice: the
 * money-in counterpart to Vendor bills and Payroll (money out). For
 * matching bank deposits and giving the bookkeeper one list.
 *
 * Reads through the same PaymentService every other surface uses, so a
 * figure here can never disagree with the invoice it belongs to.
 *
 * Uses PaymentService.listForCompany — ONE query. This previously
 * fanned out with listForInvoice per invoice (48 invoices meant 48
 * sequential round-trips, ~6s); `listForCompany` returns the same rows
 * with the same `deleted_at is null` filter in one request.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatPaymentMethod, PAYMENT_METHODS } from "@/components/payments/paymentMethods";
import type { CustomerPayment } from "@/lib/services/paymentService";
import type { Invoice } from "@/lib/services/invoiceService";
import type { Client } from "@/lib/services/clientService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

type Period = "all" | "this_month" | "last_month" | "last_30" | "this_year";
const PERIOD_LABEL: Record<Period, string> = {
  all: "All time",
  this_month: "This month",
  last_month: "Last month",
  last_30: "Last 30 days",
  this_year: "This year",
};

/** [from, to] inclusive, as yyyy-mm-dd; null = no bound. */
function periodRange(p: Period): [string | null, string | null] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === "this_month") return [isoDay(new Date(Date.UTC(y, m, 1))), null];
  if (p === "last_month") return [isoDay(new Date(Date.UTC(y, m - 1, 1))), isoDay(new Date(Date.UTC(y, m, 0)))];
  if (p === "last_30") return [isoDay(new Date(Date.now() - 29 * 86400000)), null];
  if (p === "this_year") return [`${y}-01-01`, null];
  return [null, null];
}

const FIELD =
  "h-8 rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function PaymentsListContent() {
  const { paymentService, invoiceService, clientService } = useServices();
  const { profile } = useAuth();

  const [rows, setRows] = useState<{ payment: CustomerPayment; invoice: Invoice }[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [period, setPeriod] = useState<Period>("all");

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [invoices, clients, payments] = await Promise.all([
        invoiceService.listForCompany({ companyId: profile.companyId }),
        clientService.list({ companyId: profile.companyId }),
        paymentService.listForCompany({ companyId: profile.companyId }),
      ]);
      setClientsById(Object.fromEntries(clients.map((c) => [c.id, c])));
      // Joined in memory against the invoices already fetched above. A
      // payment whose invoice isn't in scope is dropped.
      const invoiceById = new Map(invoices.map((inv) => [inv.id, inv] as const));
      setRows(
        payments
          .flatMap((payment) => {
            const invoice = invoiceById.get(payment.invoiceId);
            return invoice ? [{ payment, invoice }] : [];
          })
          .sort((a, b) => b.payment.paymentDate.localeCompare(a.payment.paymentDate))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments.");
    } finally {
      setLoading(false);
    }
  }, [paymentService, invoiceService, clientService, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const clientName = (inv: Invoice) => (inv.clientId ? clientsById[inv.clientId]?.name ?? null : null);

  const filtered = useMemo(() => {
    const [from, to] = periodRange(period);
    const q = search.trim().toLowerCase();
    return rows.filter(({ payment, invoice }) => {
      if (methodFilter !== "all" && payment.method !== methodFilter) return false;
      if (from && payment.paymentDate < from) return false;
      if (to && payment.paymentDate > to) return false;
      if (!q) return true;
      return [invoice.invoiceNumber, clientName(invoice), payment.referenceNumber].some((v) => (v ?? "").toLowerCase().includes(q));
    });
    // clientName reads clientsById, listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, methodFilter, search, period, clientsById]);

  const sumOf = (p: Period) => {
    const [from, to] = periodRange(p);
    const inRange = rows.filter(({ payment }) => (!from || payment.paymentDate >= from) && (!to || payment.paymentDate <= to));
    return { total: inRange.reduce((s, r) => s + r.payment.amount, 0), count: inRange.length };
  };
  const filteredTotal = filtered.reduce((s, r) => s + r.payment.amount, 0);
  const isFiltered = methodFilter !== "all" || period !== "all" || !!search.trim();

  /** Money in by method for whatever is on screen, largest first. */
  const byMethod = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.payment.method ?? "", (m.get(r.payment.method ?? "") ?? 0) + r.payment.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const cell = (p: Period) => {
    const { total, count } = sumOf(p);
    return (
      <button
        type="button"
        onClick={() => setPeriod(period === p ? "all" : p)}
        aria-pressed={period === p}
        className={`border-b border-r border-border px-4 py-2.5 text-left hover:bg-muted/40 sm:border-b-0 ${period === p ? "bg-primary/5" : ""}`}
      >
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{PERIOD_LABEL[p]}</div>
        <div className={`mt-1 text-[15px] font-semibold tabular-nums ${total > 0 ? "text-success" : "text-foreground"}`}>
          {money(total)}
          <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">{count}</span>
        </div>
      </button>
    );
  };

  return (
    <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Payments received</h1>
          <p className="text-[12px] text-muted-foreground">
            Money in from customers, across every invoice. Money out is in{" "}
            <Link href="/payroll" className="text-primary hover:underline">Payroll</Link> and{" "}
            <Link href="/bills" className="text-primary hover:underline">Vendor bills</Link>.
          </p>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
          {cell("this_month")}
          {cell("last_month")}
          {cell("last_30")}
          {cell("this_year")}
        </div>

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice, client or reference"
            className={`${FIELD} w-full sm:w-64`}
          />
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={FIELD} aria-label="Period">
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
              <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
            ))}
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className={FIELD} aria-label="Method">
            <option value="all">All methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setMethodFilter("all");
                setPeriod("all");
              }}
              className="text-[13px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">
            {rows.length === 0 ? "No payments recorded yet. Record a payment from an invoice and it shows up here." : "No payments match."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th className="hidden sm:table-cell">Invoice</th>
                  <th className="hidden md:table-cell">Method</th>
                  <th className="hidden md:table-cell">Reference</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ payment, invoice }) => {
                  const invLabel = invoice.invoiceNumber || invoice.id.slice(0, 8);
                  return (
                    <tr key={payment.id} className="align-top hover:bg-muted/20">
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">{shortDate(payment.paymentDate)}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-foreground">{clientName(invoice) ?? "—"}</span>
                        {/* Phone: the hidden columns, folded into one line. */}
                        <div className="text-[11px] text-muted-foreground sm:hidden">
                          <Link href={`/invoices/${invoice.id}`} className="hover:underline">#{invLabel}</Link> · {formatPaymentMethod(payment.method)}
                        </div>
                        <div className="hidden text-[11px] text-muted-foreground sm:block md:hidden">{formatPaymentMethod(payment.method)}</div>
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <Link href={`/invoices/${invoice.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                          {invLabel}
                        </Link>
                      </td>
                      <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{formatPaymentMethod(payment.method)}</td>
                      <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{payment.referenceNumber || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">{money(payment.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-border bg-muted/30 text-[13px]">
                <tr>
                  <td colSpan={6} className="px-3 py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-[12px] text-muted-foreground">
                        {byMethod.map(([m, amt]) => `${formatPaymentMethod(m || null)} ${money(amt)}`).join(" · ")}
                      </span>
                      <span>
                        <span className="text-muted-foreground">
                          {isFiltered ? "Shown" : "Total"} · {filtered.length} {filtered.length === 1 ? "payment" : "payments"}{" "}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">{money(filteredTotal)}</span>
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

export default function PaymentsPage() {
  return (
    <RequirePermission resource="payment" action="view">
      <PaymentsListContent />
    </RequirePermission>
  );
}
