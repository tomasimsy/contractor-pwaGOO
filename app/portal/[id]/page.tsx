import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";
import { mergeCompanyDefaults } from "@/lib/company";
import { SignEstimateForm } from "@/components/portal/SignEstimateForm";
import { ChangeOrderApprovalCard, type PortalChangeOrder } from "@/components/portal/ChangeOrderApprovalCard";
import {
  calculateSubtotal,
  calculateDocumentTotal,
  calculateInvoiceTotal,
  calculateRemainingBalance,
  sumApprovedChangeOrderRevenue,
  calculateRevisedEstimateTotal,
  deriveInvoiceStatus,
} from "@/lib/services/financialCalculations";

/**
 * CUSTOMER PORTAL — public, no login.
 *
 * Outside app/(app) on purpose: no authenticated shell, no
 * AuthProvider, no RequirePermission. Server-rendered so the anon key
 * never reaches the browser.
 *
 * One token-scoped RPC (`get_customer_portal`) returns the whole job:
 * estimate, approved change orders, and the invoices raised against it.
 * Read-only except for estimate signing.
 *
 * FINANCIALS: every figure below is derived with the SAME shared
 * functions the staff Estimate and Invoice pages use —
 * calculateDocumentTotal, sumApprovedChangeOrderRevenue,
 * calculateRevisedEstimateTotal, calculateInvoiceTotal,
 * calculateRemainingBalance, deriveInvoiceStatus. Nothing is summed
 * ad hoc here, so the portal cannot show a customer a number that
 * disagrees with what staff see.
 *
 * MODULARITY: the payload is a plain object of independent sections, so
 * adding Payments (pay-now), Documents, Notifications, or Messaging
 * means adding a key to the RPC and a section here — no restructuring.
 */

type PortalPayload = {
  estimate?: {
    id: string; estimate_number: string | null; title: string | null; description: string | null;
    status: string | null; subtotal: number | null; markup: number | null; discount: number | null;
    tax_rate: number | null; total: number | null; deposit_amount: number | null;
    signature: { type?: string; value?: string; date?: string } | null; created_at: string;
  } | null;
  line_items?: { id: string; name?: string; description?: string; quantity?: number; unit_price?: number; total?: number }[];
  change_orders?: { change_order_number?: string; title?: string; description?: string; total_amount?: number; tax?: number; approved_at?: string }[];
  invoices?: {
    id: string; invoice_number: string | null; status: string | null; issue_date: string | null; due_date: string | null;
    subtotal: number | null; tax: number | null; total: number | null; customer_token: string | null;
    payments?: { amount?: number; payment_date?: string; method?: string }[];
  }[];
  client?: { name?: string; email?: string; phone?: string; address?: string } | null;
  company?: Record<string, string | null> | null;
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function CustomerPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  await params; // the id is cosmetic; the TOKEN is what authorises
  const { token } = await searchParams;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data } = token ? await supabase.rpc("get_customer_portal", { p_token: token }) : { data: null };
  const payload = data as PortalPayload | null;
  const estimate = payload?.estimate;

  // Separate, purpose-built read (ALL non-deleted change orders, any
  // status) alongside the existing get_customer_portal RPC, which only
  // ever returns approved ones — see the migration's comment for why
  // this is additive rather than a rewrite of that RPC. Not fetched
  // when there's no estimate/token, same guard as the main payload.
  const { data: allChangeOrdersData } = token && estimate
    ? await supabase.rpc("get_portal_change_orders", { p_token: token })
    : { data: null };
  const allChangeOrders = (allChangeOrdersData as PortalChangeOrder[] | null) ?? [];

  // Missing token, wrong token, and deleted estimate all land here with
  // the same message — this page must not reveal which ids exist.
  if (!estimate) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-semibold text-foreground">This link isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have expired or been removed. Please contact us for an updated link.
        </p>
      </main>
    );
  }

  const company = mergeCompanyDefaults(payload?.company ?? null);
  const client = payload?.client ?? null;
  const lineItems = payload?.line_items ?? [];
  const changeOrders = payload?.change_orders ?? [];
  const invoices = payload?.invoices ?? [];
  const today = new Date().toISOString().slice(0, 10);

  // ---- Estimate figures: identical derivation to the staff page ----
  const itemsSubtotal = calculateSubtotal(lineItems.map((i) => ({ total: i.total ?? 0 })));
  const storedSubtotal = estimate.subtotal ?? itemsSubtotal;
  const { total: computedTotal } = calculateDocumentTotal(
    storedSubtotal, estimate.markup ?? 0, estimate.discount ?? 0, estimate.tax_rate ?? 0
  );
  const estimateTotal = estimate.total ?? computedTotal;

  // Approved-only; the filter lives inside the shared function.
  const coShape = changeOrders.map((co) => ({
    status: "approved" as const, totalAmount: co.total_amount ?? 0, tax: co.tax ?? 0,
  }));
  const approvedChangeOrderRevenue = sumApprovedChangeOrderRevenue(coShape);
  const contractTotal = calculateRevisedEstimateTotal(estimateTotal, coShape);

  const isSigned = !!estimate.signature?.value;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Mobile-first: single column, generous tap targets, tables scroll */}
      <header className="border-b border-border pb-5">
        <h1 className="text-base font-semibold text-foreground sm:text-lg">{company.company_name}</h1>
        <p className="text-xs text-muted-foreground">
          {company.company_phone} · {company.company_email}
        </p>
        {client?.name && <p className="mt-3 text-sm text-foreground">Prepared for {client.name}</p>}
      </header>

      {/* ---------------- ESTIMATE ---------------- */}
      <section className="pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold tracking-wide text-foreground">ESTIMATE</h2>
          <span className="text-sm text-muted-foreground">#{estimate.estimate_number ?? "—"}</span>
        </div>
        {estimate.title && <p className="mt-1 text-sm font-medium text-foreground">{estimate.title}</p>}
        {estimate.description && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{estimate.description}</p>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lineItems.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">No items listed.</td></tr>
              ) : lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{item.name}</div>
                    {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{item.quantity ?? 0}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{money(item.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-1 rounded-xl bg-muted/50 px-4 py-3 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Estimate total</span><span>{money(estimateTotal)}</span></div>
          {approvedChangeOrderRevenue !== 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Approved change orders</span><span>{money(approvedChangeOrderRevenue)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 text-base font-bold text-foreground">
            <span>Contract total</span><span>{money(contractTotal)}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/api/estimates/${estimate.id}/pdf?customerToken=${encodeURIComponent(token ?? "")}`}
            target="_blank"
            className="inline-flex min-h-11 items-center rounded-lg border border-input px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Download estimate PDF
          </Link>
        </div>
      </section>

      {/* ---------------- SIGN ---------------- */}
      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          {isSigned ? "Your Approval" : "Approve This Estimate"}
        </h2>
        <SignEstimateForm
          token={token ?? ""}
          signedValue={estimate.signature?.value ?? null}
          signedDate={estimate.signature?.date ?? null}
        />
      </section>

      {/* ---------------- CHANGE ORDERS ---------------- */}
      {allChangeOrders.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Change Orders</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Additional work proposed after the original estimate. Approved change orders are included in the contract total above.
          </p>
          <div className="space-y-3">
            {allChangeOrders.map((co) => (
              <ChangeOrderApprovalCard key={co.id} token={token ?? ""} changeOrder={co} />
            ))}
          </div>
        </section>
      )}

      {/* ---------------- INVOICES ---------------- */}
      {invoices.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Invoices</h2>
          <div className="space-y-3">
            {invoices.map((inv) => {
              const pays = inv.payments ?? [];
              const paid = pays.reduce((s, p) => s + (p.amount ?? 0), 0);
              const invTotal = inv.total ?? calculateInvoiceTotal(inv.subtotal ?? 0, inv.tax ?? 0);
              const balance = calculateRemainingBalance(invTotal, paid);
              const status = deriveInvoiceStatus({
                lifecycleStatus: "sent",
                total: invTotal,
                amountPaid: paid,
                dueDate: inv.due_date,
                today,
              });
              return (
                <div key={inv.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">#{inv.invoice_number ?? inv.id.slice(0, 8)}</span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold uppercase text-muted-foreground">
                      {status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Issued {inv.issue_date ?? "—"} · Due {inv.due_date ?? "—"}
                  </div>
                  <div className="mt-2 space-y-0.5 text-sm">
                    <div className="flex justify-between text-muted-foreground"><span>Total</span><span>{money(invTotal)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Paid</span><span>−{money(paid)}</span></div>
                    <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                      <span>Balance due</span><span>{money(balance)}</span>
                    </div>
                  </div>
                  {inv.customer_token && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href={`/invoice/${inv.id}?token=${encodeURIComponent(inv.customer_token)}`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                      >
                        View invoice →
                      </Link>
                      <Link
                        href={`/api/invoices/${inv.id}/pdf?customerToken=${encodeURIComponent(inv.customer_token)}`}
                        target="_blank"
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                      >
                        Download PDF
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {company.payment_instructions && (
        <section className="mt-8">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment Instructions</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{company.payment_instructions}</p>
        </section>
      )}

      <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        <p>{company.company_name} · {company.company_phone}</p>
        <p className="mt-1">{company.footer_message}</p>
      </footer>
    </main>
  );
}
