import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";
import { calculateSubtotal, calculateInvoiceTotal, calculateRemainingBalance, deriveInvoiceStatus } from "@/lib/services/financialCalculations";
import { mergeCompanyDefaults, mergeProfileOverrides, parseCompanyProfileRow } from "@/lib/company";
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

/** Same orange as the staff invoice page, so a customer and staff see one invoice identity. */
const BAND = "bg-[#b4530e] text-white";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.08em] text-[#7a5238]";
const TABLE_HEAD = "px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#7a5238]";

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
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-foreground">Invoice not available</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
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
  // The job's scope, from the source estimate (see the job_description
  // field in get_public_invoice). Null when the invoice has no estimate.
  const jobDescription = typeof invoice.job_description === "string" && invoice.job_description.trim() ? invoice.job_description.trim() : null;

  // Which brand this invoice presents as — get_public_invoice can't
  // safely be rewritten to return profile_id itself (its body lives
  // outside this repo's tracked migrations), so a one-column read plus
  // the profile row itself, both via the same SECURITY DEFINER
  // functions the estimate portal uses.
  const { data: profileIdData } = token
    ? await supabase.rpc("get_portal_invoice_profile_id", { p_token: token })
    : { data: null };
  const { data: profileData } = profileIdData
    ? await supabase.rpc("get_company_profile", { p_profile_id: profileIdData })
    : { data: null };
  const profile = parseCompanyProfileRow(profileData as Record<string, unknown> | null);

  const company = mergeProfileOverrides(mergeCompanyDefaults(payload?.company ?? null), profile);

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
    <main className="mx-auto max-w-3xl px-4 py-6 text-[13px] text-foreground sm:px-6 sm:py-8">
      {/* Invoice band: sender, the invoice number and its status */}
      <header className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl px-4 py-3 sm:px-5 ${BAND}`}>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">{company.company_name}</div>
          <div className="text-[11px] text-[#fde3c8]">{[company.company_phone, company.company_email].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="flex items-center gap-2.5 text-right">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#fde3c8]">Invoice</div>
          <div className="text-[15px] font-bold">#{invoice.invoice_number || id.slice(0, 8)}</div>
          <span className="rounded-full bg-[#ffd98a] px-2 py-0.5 text-[11px] font-semibold capitalize text-[#2a1c10]">{status.replace(/_/g, " ")}</span>
        </div>
      </header>

      {/* Who it's for, and the key dates */}
      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className={LABEL}>Bill to</div>
          <div className="mt-0.5 font-semibold">{client?.name ?? "—"}</div>
          {client?.email && <div className="text-[12px] text-[#7a5238]">{client.email}</div>}
          {client?.phone && <div className="text-[12px] text-[#7a5238]">{client.phone}</div>}
          {client?.address && <div className="text-[12px] text-[#7a5238]">{client.address}</div>}
        </div>
        <div className="sm:text-right">
          <div className={LABEL}>Dates</div>
          <div className="mt-0.5 text-[12px]">Issued {invoice.issue_date ?? "—"}</div>
          <div className="text-[12px]">Due {invoice.due_date ?? "—"}</div>
        </div>
      </section>

      {/* The job, as described on the invoice */}
      {jobDescription && (
        <section className="mt-4">
          <div className={LABEL}>Job description</div>
          <p className="mt-1 whitespace-pre-line border-l-[3px] border-[#f0a866] pl-3 text-[12px] leading-relaxed text-[#2a1c10]">{jobDescription}</p>
        </section>
      )}

      {/* Line items */}
      <section className="mt-4">
        <div className="overflow-x-auto rounded-lg border border-[#f0d2b4]">
          <table className="w-full text-[12px]">
            <thead className="bg-[#fdf1e5]">
              <tr>
                <th className={`${TABLE_HEAD} text-left`}>Item</th>
                <th className={`${TABLE_HEAD} text-right`}>Qty</th>
                <th className={`${TABLE_HEAD} text-right`}>Unit price</th>
                <th className={`${TABLE_HEAD} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7e4cf]">
              {lineItems.length === 0 ? (
                <tr><td colSpan={4} className="px-2 py-4 text-center text-[12px] text-[#7a5238]">No items on this invoice.</td></tr>
              ) : (
                lineItems.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-2 py-1.5">
                      <div className="font-semibold">{item.name}</div>
                      {item.description && !item.description.startsWith("change-order:") && (
                        <div className="text-[11px] leading-snug text-[#7a5238]">{item.description}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[#7a5238]">{item.quantity ?? 0}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[#7a5238]">{money(item.unit_price ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{money(item.total ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Approved change orders, already counted in the total below */}
      {changeOrders.length > 0 && (
        <section className="mt-4">
          <div className={LABEL}>Approved change orders</div>
          <p className="mt-0.5 text-[11px] text-[#7a5238]">Included in the invoice total below.</p>
          <div className="mt-1.5 overflow-x-auto rounded-lg border border-[#f0d2b4]">
            <table className="w-full text-[12px]">
              <thead className="bg-[#fdf1e5]">
                <tr>
                  <th className={`${TABLE_HEAD} text-left`}>Change order</th>
                  <th className={`${TABLE_HEAD} text-left`}>Approved</th>
                  <th className={`${TABLE_HEAD} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f7e4cf]">
                {changeOrders.map((co, i) => (
                  <tr key={co.change_order_number ?? i} className="align-top">
                    <td className="px-2 py-1.5">
                      <div className="font-semibold">{co.change_order_number ?? "—"}</div>
                      {co.title && <div className="text-[11px] text-[#7a5238]">{co.title}</div>}
                      {co.description && <div className="text-[11px] text-[#7a5238]">{co.description}</div>}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-[#7a5238]">
                      {co.approved_at ? new Date(co.approved_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{money(co.amount ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Totals and balance */}
      <section className="mt-4 flex justify-end">
        <div className="w-full max-w-[260px] space-y-0.5 rounded-lg bg-[#fdf1e5] px-3 py-2.5 text-[12px] tabular-nums">
          <div className="flex justify-between text-[#7a5238]"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {tax !== 0 && <div className="flex justify-between text-[#7a5238]"><span>Tax</span><span>{money(tax)}</span></div>}
          <div className="flex justify-between border-t border-[#f0d2b4] pt-1 font-semibold"><span>Total</span><span>{money(total)}</span></div>
          <div className="flex justify-between text-[#7a5238]"><span>Amount paid</span><span>−{money(amountPaid)}</span></div>
          <div className="flex justify-between border-t-2 border-[#b4530e] pt-1 text-[14px] font-bold text-[#b4530e]"><span>Balance due</span><span>{money(balanceDue)}</span></div>
        </div>
      </section>

      {/* Payments received */}
      <section className="mt-4">
        <div className={LABEL}>Payments received</div>
        {paymentRows.length === 0 ? (
          <p className="mt-1 text-[12px] text-[#7a5238]">No payments received yet.</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-[#f7e4cf] rounded-lg border border-[#f0d2b4]">
            {paymentRows.map((p, i) => (
              <li key={i} className="flex items-center justify-between px-2.5 py-1.5 text-[12px]">
                <span className="text-[#7a5238]">{p.payment_date ?? "—"}{p.method ? ` · ${formatPaymentMethod(p.method)}` : ""}</span>
                <span className="font-semibold tabular-nums">{money(p.amount ?? 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5">
        <Link href={pdfHref} target="_blank" className="inline-flex items-center rounded-lg bg-[#b4530e] px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-[#9a460b]">
          Download PDF
        </Link>
      </section>

      <footer className="mt-8 border-t border-[#f0d2b4] pt-3 text-center text-[11px] text-[#7a5238]">
        <p>{company.company_name} · {company.company_phone}</p>
        <p className="mt-0.5">{company.footer_message}</p>
      </footer>
    </main>
  );
}
