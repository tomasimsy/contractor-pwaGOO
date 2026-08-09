"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Wallet, Search } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { NeedsPaymentPanel } from "@/components/payments/NeedsPaymentPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatPaymentMethod, PAYMENT_METHODS } from "@/components/payments/paymentMethods";
import type { CustomerPayment } from "@/lib/services/paymentService";
import type { Invoice } from "@/lib/services/invoiceService";
import type { Client } from "@/lib/services/clientService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Company-wide payment history. Reads through the same PaymentService
 * every other surface uses, so a figure here can never disagree with
 * the invoice it belongs to.
 *
 * Uses PaymentService.listForCompany — ONE query. This previously
 * fanned out with listForInvoice per invoice, noted at the time as
 * "O(n) in invoices... when volume warrants it". It already did:
 * 48 invoices meant 48 sequential round-trips, and the measured
 * round-trip floor to hosted Supabase is ~130ms, so this page spent
 * ~6s fetching data one query at a time. `listForCompany` existed on
 * the interface the whole time; the comment claiming otherwise was
 * stale. Same `deleted_at is null` filter and payment_date ordering,
 * so the rows are identical — only the number of requests changed.
 */
function PaymentsListContent() {
  const { paymentService, invoiceService, clientService } = useServices();
  const { profile } = useAuth();

  const [rows, setRows] = useState<{ payment: CustomerPayment; invoice: Invoice }[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  /** "out" = money the company owes (default). "in" = the existing
   * received-payments history, untouched. */
  const [view, setView] = useState<"out" | "in">("out");

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
      // Joined in memory against the invoices already fetched above.
      // A payment whose invoice isn't in scope is dropped, exactly as
      // the per-invoice fan-out did (it only ever asked about invoices
      // in this company).
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

  const filtered = useMemo(() => {
    let out = rows;
    if (methodFilter !== "all") out = out.filter((r) => r.payment.method === methodFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => {
        const client = r.invoice.clientId ? clientsById[r.invoice.clientId] : undefined;
        return (
          r.invoice.invoiceNumber.toLowerCase().includes(q) ||
          (client?.name ?? "").toLowerCase().includes(q) ||
          (r.payment.referenceNumber ?? "").toLowerCase().includes(q)
        );
      });
    }
    return out;
  }, [rows, methodFilter, search, clientsById]);

  const totalCollected = filtered.reduce((sum, r) => sum + r.payment.amount, 0);

  return (
<PageContainer>
  <div className="flex items-center justify-between mb-3">
    <div>
      <h1 className="text-xl font-semibold text-foreground">Payments</h1>
      <p className="text-xs text-muted-foreground">
        {view === "out" ? "Who you owe & pay." : "Payments received."}
      </p>
    </div>

    {/* VIEW TOGGLE */}
    <div className="inline-flex rounded-md border border-border bg-card p-0.5">
      {[
        { id: "out" as const, label: "Needs Payment" },
        { id: "in" as const, label: "Received" },
      ].map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setView(t.id)}
          aria-pressed={view === t.id}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            view === t.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  </div>

  {view === "out" ? (
    <NeedsPaymentPanel />
  ) : (
    <>
      {error && (
        <div className="mb-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {error}
        </div>
      )}

      {/* SEARCH + FILTER */}
      <div className="mb-2 flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice, client…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs outline-none focus-visible:border-ring"
          />
        </div>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring"
        >
          <option value="all">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* LOADING / EMPTY */}
      {loading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={rows.length === 0 ? "No payments recorded yet" : "No payments match your filters"}
          description={
            rows.length === 0
              ? "Record a payment from any invoice to see it here."
              : "Try a different search or method."
          }
        />
      ) : (
        <>
          {/* SUMMARY — HIDDEN ON MOBILE */}
          <div className="mb-3 hidden rounded-xl bg-muted/50 px-4 py-3 text-sm sm:block">
            <span className="text-muted-foreground">
              Total collected{methodFilter !== "all" || search ? " (filtered)" : ""}:
            </span>{" "}
            <span className="font-semibold text-foreground">
              {money(totalCollected)}
            </span>{" "}
            <span className="text-muted-foreground">
              across {filtered.length} payment{filtered.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* DESKTOP TABLE */}
          <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Date
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Invoice
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Client
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Method
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ payment, invoice }) => (
                  <tr key={payment.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {payment.paymentDate}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                      </Link>
                      {payment.referenceNumber && (
                        <div className="text-xs text-muted-foreground">
                          {payment.referenceNumber}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {invoice.clientId
                        ? clientsById[invoice.clientId]?.name ?? "—"
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {formatPaymentMethod(payment.method)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-foreground">
                      {money(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MOBILE LIST — ULTRA COMPACT */}
          <div className="space-y-1 sm:hidden">
            {filtered.map(({ payment, invoice }) => {
              const clientName = invoice.clientId
                ? clientsById[invoice.clientId]?.name
                : null;
              const invLabel = invoice.invoiceNumber || invoice.id.slice(0, 8);

              return (
                <Link
                  key={payment.id}
                  href={`/invoices/${invoice.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 hover:border-primary/40"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="truncate text-xs font-medium text-foreground">
                      {clientName ? `${clientName} · ` : ""}
                      <span className="text-muted-foreground">#{invLabel}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {payment.paymentDate} ({formatPaymentMethod(payment.method)})
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-foreground">
                      {money(payment.amount)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  )}
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
