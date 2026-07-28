"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Wallet, Search } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
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
 * every other surface uses (listForInvoice per invoice), so a figure
 * here can never disagree with the invoice it belongs to.
 *
 * There is no company-wide listPayments() on the interface yet, so this
 * fans out across the company's invoices. That is honest but O(n) in
 * invoices — see the note in the deliverables about adding a scoped
 * list method when volume warrants it.
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

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [invoices, clients] = await Promise.all([
        invoiceService.listForCompany({ companyId: profile.companyId }),
        clientService.list({ companyId: profile.companyId }),
      ]);
      setClientsById(Object.fromEntries(clients.map((c) => [c.id, c])));
      const perInvoice = await Promise.all(
        invoices.map(async (inv) => (await paymentService.listForInvoice(inv.id)).map((payment) => ({ payment, invoice: inv })))
      );
      setRows(perInvoice.flat().sort((a, b) => b.payment.paymentDate.localeCompare(a.payment.paymentDate)));
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
      <PageHeader title="Payments" description="Every payment received, across all invoices." />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, client, reference…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <select
          value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
        >
          <option value="all">All methods</option>
          {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={rows.length === 0 ? "No payments recorded yet" : "No payments match your filters"}
          description={rows.length === 0 ? "Record a payment from any invoice to see it here." : "Try a different search or method."}
        />
      ) : (
        <>
          <div className="mb-3 rounded-xl bg-muted/50 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Total collected{methodFilter !== "all" || search ? " (filtered)" : ""}: </span>
            <span className="font-semibold text-foreground">{money(totalCollected)}</span>
            <span className="text-muted-foreground"> across {filtered.length} payment{filtered.length === 1 ? "" : "s"}</span>
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Method</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ payment, invoice }) => (
                  <tr key={payment.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5 text-muted-foreground">{payment.paymentDate}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/invoices/${invoice.id}`} className="font-medium text-foreground hover:text-primary">
                        {invoice.invoiceNumber || invoice.id.slice(0, 8)}
                      </Link>
                      {payment.referenceNumber && <div className="text-xs text-muted-foreground">{payment.referenceNumber}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {invoice.clientId ? clientsById[invoice.clientId]?.name ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatPaymentMethod(payment.method)}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-foreground">{money(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 sm:hidden">
            {filtered.map(({ payment, invoice }) => (
              <Link key={payment.id} href={`/invoices/${invoice.id}`} className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{money(payment.amount)}</span>
                  <span className="text-xs text-muted-foreground">{payment.paymentDate}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {invoice.invoiceNumber || invoice.id.slice(0, 8)} · {invoice.clientId ? clientsById[invoice.clientId]?.name ?? "—" : "—"} · {formatPaymentMethod(payment.method)}
                </div>
              </Link>
            ))}
          </div>
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
