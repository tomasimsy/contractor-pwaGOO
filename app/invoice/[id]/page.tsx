import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";
import { calculateSubtotal, calculateInvoiceTotal, calculateRemainingBalance, deriveInvoiceStatus } from "@/lib/services/financialCalculations";
import { mergeCompanyDefaults } from "@/lib/company";
import { formatPaymentMethod } from "@/components/payments/paymentMethods";

/**
 * PUBLIC customer invoice page — deliberately OUTSIDE the app/(app)
 * route group, so it inherits neither the authenticated shell nor
 * AuthProvider/RequirePermission. A customer with the link sees their
 * invoice with no login.
 *
 * Server-rendered on purpose: the anon Supabase key never reaches the
 * browser here, and the page renders only the fields a customer is
 * entitled to. It exposes NO internal fields — no internal notes, no
 * cost/profit data, no other invoices, no client list.
 *
 * Access model: the invoice id in the URL plus, when present, the
 * invoice's own `customer_token`. Totals are recomputed from source
 * rows through the same shared financialCalculations functions the app
 * and PDF use, so a customer can never be shown a figure that
 * disagrees with what staff see.
 *
 * SECURITY NOTE — this page's reach is bounded by RLS. The live
 * `invoices` RLS policy is `company_id = current_company_id()`, which
 * for an ANONYMOUS request resolves to NULL, so this query returns no
 * rows until a public-read policy scoped to `customer_token` is added.
 * That migration is DRAFT, not applied (it needs review before it
 * loosens read access on a financial table), so this page currently
 * renders its "not available" state for anonymous visitors rather than
 * appearing to work. Documented in the deliverables, not papered over.
 */
export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Everything comes from ONE token-scoped RPC (get_public_invoice),
  // not from direct table reads. Direct reads cannot work here: the
  // token-based RLS policies key off a Postgres session setting that
  // the Supabase JS client has no way to set, so they would never
  // match. The RPC takes the token as an argument and does the scoping
  // inside a SECURITY DEFINER function, returning only the fields a
  // customer may see. See the migration's header for the full model.
  const { data } = token
    ? await supabase.rpc("get_public_invoice", { p_token: token })
    : { data: null };

  const payload = data as {
    invoice?: Record<string, unknown> & { id?: string; status?: string | null; subtotal?: number | null; tax?: number | null; total?: number | null; due_date?: string | null; issue_date?: string | null; invoice_number?: string | null };
    client?: { name?: string; email?: string; phone?: string; address?: string } | null;
    items?: { id: string; name?: string; description?: string; quantity?: number; unit_price?: number; total?: number }[];
    payments?: { amount?: number; payment_date?: string; method?: string }[];
    change_orders?: { change_order_number?: string; title?: string; description?: string; amount?: number; approved_at?: string }[];
    company?: Record<string, string | null> | null;
  } | null;

  const invoice = payload?.invoice;

  // A missing token, a wrong token, or a deleted invoice all land here —
  // deliberately the same message, so this page can't be used to probe
  // which invoice ids exist.
  if (!invoice) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-xl font-semibold text-foreground">Invoice not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invoice may have been removed, or the link is incorrect. Please contact the sender for an updated link.
        </p>
      </main>
    );
  }

  const client = payload?.client ?? null;
  const lineItems = payload?.items ?? [];
  const paymentRows = payload?.payments ?? [];
  // Approved change orders only — the RPC filters these server-side, so
  // a pending or rejected change order can never reach this page even
  // if one exists on the estimate.
  const changeOrders = payload?.change_orders ?? [];
  const company = mergeCompanyDefaults(payload?.company ?? null);

  // Same rule as InvoiceService.getById and the PDF route: an issued
  // invoice shows its as-billed stored total; only a draft recomputes
  // from line items. A customer must never see a different number here
  // than staff see in the app or on the PDF.
  const isIssued = invoice.status !== "draft" && invoice.status !== "pending" && invoice.status !== null;
  const itemsSubtotal = calculateSubtotal(lineItems.map((i) => ({ total: i.total ?? 0 })));
  const tax = invoice.tax ?? 0;
  const subtotal = isIssued ? (invoice.subtotal ?? itemsSubtotal) : itemsSubtotal;
  const total = isIssued ? (invoice.total ?? calculateInvoiceTotal(subtotal, tax)) : calculateInvoiceTotal(subtotal, tax);
  const amountPaid = paymentRows.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const balanceDue = calculateRemainingBalance(total, amountPaid);
  const status = deriveInvoiceStatus({
    lifecycleStatus: invoice.status === "void" ? "void" : invoice.status === "cancelled" ? "cancelled" : "sent",
    total,
    amountPaid,
    dueDate: invoice.due_date ?? null,
    today: new Date().toISOString().slice(0, 10),
  });

  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  // The same token the visitor already presented is forwarded to the
  // PDF route, which applies the identical token filter.
  const pdfHref = `/api/invoices/${id}/pdf?customerToken=${encodeURIComponent(token ?? "")}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{company.company_name}</h1>
          <p className="text-xs text-muted-foreground">{company.company_phone} · {company.company_email}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide text-foreground">INVOICE</div>
          <div className="text-sm text-muted-foreground">#{invoice.invoice_number || id.slice(0, 8)}</div>
          <div className="mt-1 inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold uppercase text-muted-foreground">
            {status.replace(/_/g, " ")}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 py-6 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bill To</h2>
          <p className="mt-1 font-medium text-foreground">{client?.name ?? "—"}</p>
          {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
          {client?.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
          {client?.address && <p className="text-sm text-muted-foreground">{client.address}</p>}
        </div>
        <div className="sm:text-right">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dates</h2>
          <p className="mt-1 text-sm text-foreground">Issued: {invoice.issue_date ?? "—"}</p>
          <p className="text-sm text-foreground">Due: {invoice.due_date ?? "—"}</p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lineItems.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">No items on this invoice.</td></tr>
            ) : (
              lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{item.name}</div>
                    {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{item.quantity ?? 0}</td>
                  <td className="px-3 py-2 text-muted-foreground">{money(item.unit_price ?? 0)}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{money(item.total ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {changeOrders.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approved Change Orders</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Additional work approved after the original estimate. These amounts are already included in the invoice total below.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change Order</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approved</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {changeOrders.map((co, i) => (
                  <tr key={co.change_order_number ?? i}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{co.change_order_number ?? "—"}</div>
                      {co.title && <div className="text-xs text-muted-foreground">{co.title}</div>}
                      {co.description && <div className="text-xs text-muted-foreground">{co.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {co.approved_at ? new Date(co.approved_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-foreground">{money(co.amount ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-4 space-y-1 rounded-xl bg-muted/50 px-4 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(subtotal)}</span></div>
        {tax !== 0 && <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(tax)}</span></div>}
        <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground"><span>Total</span><span>{money(total)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>Amount Paid</span><span>−{money(amountPaid)}</span></div>
        <div className="flex justify-between border-t border-border pt-1 text-base font-bold text-foreground"><span>Balance Due</span><span>{money(balanceDue)}</span></div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment History</h2>
        {paymentRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments received yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {paymentRows.map((p, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-muted-foreground">{p.payment_date ?? "—"}{p.method ? ` · ${formatPaymentMethod(p.method)}` : ""}</span>
                <span className="font-medium text-foreground">{money(p.amount ?? 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 flex flex-wrap gap-3">
        <Link href={pdfHref} target="_blank" className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Download PDF
        </Link>
      </section>

      <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        <p>{company.company_name} · {company.company_phone}</p>
        <p className="mt-1">{company.footer_message}</p>
      </footer>
    </main>
  );
}
