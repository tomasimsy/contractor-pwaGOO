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

type PortalPayload = {
  estimate?: {
    id: string; estimate_number: string | null; title: string | null; description: string | null;
    status: string | null; subtotal: number | null; markup: number | null; discount: number | null;
    tax_rate: number | null; total: number | null; deposit_amount: number | null;
    signature: { type?: string; value?: string; date?: string } | null; created_at: string;
  } | null;
  line_items?: { id: string; category?: string | null; name?: string; description?: string; quantity?: number; unit_price?: number; total?: number }[];
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
  await params;
  const { token } = await searchParams;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data } = token ? await supabase.rpc("get_customer_portal", { p_token: token }) : { data: null };
  const payload = data as PortalPayload | null;
  const estimate = payload?.estimate;

  const { data: allChangeOrdersData } = token && estimate
    ? await supabase.rpc("get_portal_change_orders", { p_token: token })
    : { data: null };
  const allChangeOrders = (allChangeOrdersData as PortalChangeOrder[] | null) ?? [];

  if (!estimate) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center bg-background">
        <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-foreground">This link isn&apos;t available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have expired or been removed. Please contact us for an updated link.
          </p>
        </div>
      </main>
    );
  }

  const company = mergeCompanyDefaults(payload?.company ?? null);
  const client = payload?.client ?? null;
  const lineItems = payload?.line_items ?? [];
  const changeOrders = payload?.change_orders ?? [];
  const invoices = payload?.invoices ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const itemsSubtotal = calculateSubtotal(lineItems.map((i) => ({ total: i.total ?? 0 })));
  const storedSubtotal = estimate.subtotal ?? itemsSubtotal;
  const { total: computedTotal } = calculateDocumentTotal(
    storedSubtotal, estimate.markup ?? 0, estimate.discount ?? 0, estimate.tax_rate ?? 0
  );
  const estimateTotal = estimate.total ?? computedTotal;

  const coShape = changeOrders.map((co) => ({
    status: "approved" as const, totalAmount: co.total_amount ?? 0, tax: co.tax ?? 0,
  }));
  const approvedChangeOrderRevenue = sumApprovedChangeOrderRevenue(coShape);
  const contractTotal = calculateRevisedEstimateTotal(estimateTotal, coShape);

  const isSigned = !!estimate.signature?.value;

  // ---------------------------------------------------------------
  // SCOPE SUMMARY — the estimate's OWN line items, grouped by their
  // existing `category` column (material | labor | other), plus one
  // group for approved change orders.
  //
  // Deliberately NOT project costs. This page is public and needs no
  // login, so what the company PAYS its vendors must never appear
  // here — only what the customer was quoted. No new table or column
  // is involved: `category` already exists on every line item.
  // ---------------------------------------------------------------
  const CATEGORY_LABELS: { key: string; label: string }[] = [
    { key: "material", label: "Materials" },
    { key: "labor", label: "Labor" },
    { key: "other", label: "Other" },
  ];

  // Does the payload actually carry categories? `get_customer_portal`
  // (a live DB function, not in this repo's migrations) currently
  // returns id/name/description/quantity/unit_price/total and NOT
  // `category`, even though the column exists on estimate_items.
  //
  // Without it every item would fall into the "other" bucket and the
  // page would confidently mislabel a material as "Other" — worse than
  // not grouping at all. So grouping switches itself on only when the
  // data supports it, and this page starts grouping automatically the
  // moment that function is updated to select `category`. No client
  // change needed then, and none of this needs a new table or column.
  const hasCategories = lineItems.some((i) => !!i.category);

  const scopeGroups = !hasCategories ? [] : CATEGORY_LABELS.map(({ key, label }) => {
    const items = lineItems.filter((i) => (i.category ?? "other") === key);
    return { label, items, subtotal: calculateSubtotal(items.map((i) => ({ total: i.total ?? 0 }))) };
  })
    // An estimate with nothing in a category shouldn't show an empty
    // heading — but any UNKNOWN/legacy category still has to appear
    // somewhere, which is why "other" is the fallback bucket above.
    .filter((g) => g.items.length > 0);

  const approvedChangeOrderItems = changeOrders.map((co, i) => ({
    id: `${co.change_order_number ?? "co"}-${i}`,
    name: co.change_order_number ? `${co.change_order_number} — ${co.title ?? "Change order"}` : (co.title ?? "Change order"),
    description: co.description ?? null,
    // The ONE change-order revenue formula, same as everywhere else.
    total: (co.total_amount ?? 0) + (co.tax ?? 0),
  }));

  // Are the line items actually what this estimate's total is built
  // from? For a ROOFING estimate they are not: its subtotal comes from
  // its roof AREAS (which the public payload doesn't return), and any
  // `line_items` rows are vestigial leftovers that were never counted.
  // Listing them as the scope shows the customer a breakdown that
  // doesn't add up to what they're signing — observed live: $10 of
  // items against a $224 total.
  const lineItemsTotal = calculateSubtotal(lineItems.map((i) => ({ total: i.total ?? 0 })));
  const lineItemsAreAuthoritative =
    lineItems.length > 0 && Math.abs(lineItemsTotal - storedSubtotal) <= 0.005;

  // The scope list describes work at SUBTOTAL level. Markup, discount
  // and tax are not scope — they belong in the financial summary, or
  // the groups would appear to under-sum by exactly those amounts.
  const adjustments = estimateTotal - storedSubtotal;
  const hasAdjustments = Math.abs(adjustments) > 0.005;

  const scopeItemCount =
    (lineItemsAreAuthoritative ? lineItems.length : 1) + approvedChangeOrderItems.length;

  // Ungrouped fallback: real items, correct amounts, no invented
  // category labels.
  const flatScopeItems = lineItemsAreAuthoritative && !hasCategories ? lineItems : [];

  return (
    <div className="min-h-screen bg-muted/20 pb-16">
      {/* ACTION BANNER — the one thing the customer must do, stated
          before anything else. Only while unsigned. */}
      {!isSigned && (
        <div className="bg-amber-500 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-amber-950">
          Review required — signature needed below
        </div>
      )}

      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8 space-y-5">

        {/* WHO / WHAT — company on the left, customer on the right. */}
        <header className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight text-foreground">{company.company_name}</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Issued: {new Date(estimate.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
            {client?.name && (
              <div className="min-w-0 sm:text-right">
                <p className="text-base font-bold text-foreground">{client.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{estimate.estimate_number ?? estimate.id.slice(0, 8)}</p>
              </div>
            )}
          </div>
        </header>

        {/* SCOPE & ESTIMATE — the document itself. */}
        <section className="overflow-hidden rounded-2xl border-2 border-primary bg-card shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 bg-primary px-5 py-4 text-primary-foreground">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Scope &amp; Estimate</p>
              <h2 className="text-lg font-bold leading-tight capitalize">{estimate.title || "Project Overview"}</h2>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Total</p>
              <p className="text-2xl font-bold leading-none">{money(contractTotal)}</p>
            </div>
          </div>

          <div className="space-y-5 p-5">
          {estimate.description && (
            <div className="rounded-r-lg border-l-4 border-amber-500 bg-amber-100/40 p-4 dark:bg-amber-200/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-800">
                Project Objective
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-amber-950 dark:text-amber-950">
                {estimate.description}
              </p>
            </div>
          )}

            <div>
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Scope Summary</h3>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {scopeItemCount} {scopeItemCount === 1 ? "item" : "items"}
                </span>
              </div>

              {scopeItemCount === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No itemised scope listed. See the PDF below for full details.
                </p>
              ) : (
                <div className="mt-4 space-y-5">
                  {!lineItemsAreAuthoritative && (
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Project Scope</h4>
                        <span className="text-xs font-semibold text-muted-foreground">{money(storedSubtotal)}</span>
                      </div>
                      <ul className="mt-1.5 space-y-1.5">
                        <li className="flex items-start justify-between gap-3 text-sm">
                          <span className="flex min-w-0 gap-2 text-foreground">
                            <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                            <span className="min-w-0">
                              Quoted work as specified
                              <span className="block text-xs text-muted-foreground">
                                Full itemisation is in the estimate PDF below.
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold text-foreground">{money(storedSubtotal)}</span>
                        </li>
                      </ul>
                    </div>
                  )}
                  {flatScopeItems.length > 0 && (
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Quoted Work</h4>
                        <span className="text-xs font-semibold text-muted-foreground">{money(storedSubtotal)}</span>
                      </div>
                      <ul className="mt-1.5 space-y-1.5">
                        {flatScopeItems.map((item) => (
                          <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                            <span className="flex min-w-0 gap-2 text-foreground">
                              <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                              <span className="min-w-0">
                                {item.name}
                                {(item.quantity ?? 0) > 1 && <span className="text-muted-foreground"> × {item.quantity}</span>}
                                {item.description && <span className="block text-xs text-muted-foreground">{item.description}</span>}
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold text-foreground">{money(item.total ?? 0)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {lineItemsAreAuthoritative && scopeGroups.map((group) => (
                    <div key={group.label}>
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary">{group.label}</h4>
                        <span className="text-xs font-semibold text-muted-foreground">{money(group.subtotal)}</span>
                      </div>
                      <ul className="mt-1.5 space-y-1.5">
                        {group.items.map((item) => (
                          <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                            <span className="flex min-w-0 gap-2 text-foreground">
                              <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                              <span className="min-w-0">
                                {item.name}
                                {(item.quantity ?? 0) > 1 && (
                                  <span className="text-muted-foreground"> × {item.quantity}</span>
                                )}
                                {item.description && (
                                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold text-foreground">{money(item.total ?? 0)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {/* Approved change orders are part of the agreed scope,
                      so they belong in this list — not hidden in a
                      footnote the customer has to reconcile themselves. */}
                  {approvedChangeOrderItems.length > 0 && (
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Approved Change Orders</h4>
                        <span className="text-xs font-semibold text-muted-foreground">{money(approvedChangeOrderRevenue)}</span>
                      </div>
                      <ul className="mt-1.5 space-y-1.5">
                        {approvedChangeOrderItems.map((item) => (
                          <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                            <span className="flex min-w-0 gap-2 text-foreground">
                              <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                              <span className="min-w-0">
                                {item.name}
                                {item.description && (
                                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold text-foreground">{money(item.total)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

{/* FINANCIAL SUMMARY — deliberately one dark, high-contrast
            block in both themes so the number the customer is agreeing
            to cannot be skimmed past. */}
        <section className="rounded-2xl bg-zinc-900 p-5 text-white shadow-sm">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Financial Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {hasAdjustments && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-zinc-300">Scope subtotal</dt>
                <dd className="font-semibold">{money(storedSubtotal)}</dd>
              </div>
            )}
            {/* Markup/discount/tax, shown as ONE net adjustment rather
                than three rows the customer has to reassemble. Present
                only when it is non-zero, so a clean estimate stays
                clean. */}
            {hasAdjustments && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-zinc-300">Adjustments &amp; tax</dt>
                <dd className="font-semibold">{adjustments < 0 ? `−${money(Math.abs(adjustments))}` : money(adjustments)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-zinc-300">Current estimate</dt>
              <dd className="font-semibold">{money(estimateTotal)}</dd>
            </div>
            {approvedChangeOrderRevenue !== 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-zinc-300">Approved change orders</dt>
                <dd className="font-semibold">{money(approvedChangeOrderRevenue)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-zinc-700 pt-2">
              <dt className="font-semibold">Contract total</dt>
              <dd className="text-xl font-bold">{money(contractTotal)}</dd>
            </div>
            {(() => {
              const totalPaid = invoices.reduce((sum, inv) => {
                const pays = inv.payments ?? [];
                return sum + pays.reduce((s, p) => s + (p.amount ?? 0), 0);
              }, 0);
              const totalBalance = Math.max(0, contractTotal - totalPaid);
              const isPaidInFull = totalBalance === 0;

              return (
                <div className="flex items-baseline justify-between gap-3 border-t border-zinc-700 pt-2 text-zinc-300">
                  <dt className="font-medium">Balance Due</dt>
                  <dd className={`font-bold ${isPaidInFull ? "text-emerald-400" : "text-amber-400"}`}>
                    {money(totalBalance)}
                  </dd>
                </div>
              );
            })()}
          </dl>
        </section>

        {/* Terms — collapsed by default so it never buries the action. */}
        {company.terms_conditions && (
          <details className="group rounded-2xl border border-border/60 bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-5 py-4 text-sm font-semibold text-foreground hover:bg-muted/40">
              Terms &amp; Conditions
              <span aria-hidden className="text-primary transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="border-t border-border/60 px-5 py-4">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{company.terms_conditions}</p>
            </div>
          </details>
        )}

        <Link
          href={`/api/estimates/${estimate.id}/pdf?customerToken=${encodeURIComponent(token ?? "")}`}
          target="_blank"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/80 bg-card px-4 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/50"
        >
          <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download estimate PDF
        </Link>

        {/* CHANGE ORDERS */}
        {allChangeOrders.length > 0 && (
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Change Orders</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Additional work proposed after the original estimate. Approved items update the contract total automatically.
              </p>
            </div>
            <div className="space-y-3 pt-1">
              {allChangeOrders.map((co) => (
                <ChangeOrderApprovalCard key={co.id} token={token ?? ""} changeOrder={co} />
              ))}
            </div>
          </section>
        )}

{/* INVOICES SECTION */}
        {invoices.length > 0 && (
          <section className="rounded-xl border border-border/60 bg-card p-3.5 shadow-sm space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Invoices</h2>
            <div className="space-y-2">
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
                
                const isPaidInFull = status === "paid";
                
                return (
                  <div key={inv.id} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono font-bold text-foreground">
                          #{inv.invoice_number ?? inv.id.slice(0, 8)}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {inv.issue_date ?? "—"} → {inv.due_date ?? "—"}
                        </span>
                      </div>
                      <span className={`rounded-full px-2 py-0.2 text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        isPaidInFull 
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-800 border border-emerald-500/20" 
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}>
                        {status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-card px-2.5 py-1.5 rounded border border-border/40 text-[11px]">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total:</span>
                        <span className="font-medium text-foreground">{money(invTotal)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Paid:</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-800">-{money(paid)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-foreground">
                        <span>Balance:</span>
                        <span className="text-primary">{money(balance)}</span>
                      </div>
                    </div>

                    {inv.customer_token && (
                      <div className="flex flex-wrap items-center gap-3 pt-0.5">
                        {/* <Link
                          href={`/invoice/${inv.id}?token=${encodeURIComponent(inv.customer_token)}`}
                          className="inline-flex items-center text-[11px] font-semibold text-primary hover:underline"
                        >
                          View invoice &rarr;
                        </Link>
                        <Link
                          href={`/api/invoices/${inv.id}/pdf?customerToken=${encodeURIComponent(inv.customer_token)}`}
                          target="_blank"
                          className="inline-flex items-center text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Download PDF
                        </Link> */}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* PAYMENT INSTRUCTIONS */}
        {company.payment_instructions && (
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Instructions</h2>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 p-3 rounded-xl border border-border/40">
              {company.payment_instructions}
            </p>
          </section>
        )}

        {/* SIGNATURE / APPROVAL SECTION */}
        <section className={`rounded-2xl border p-5 shadow-sm transition-colors ${
          isSigned 
            ? "border-emerald-500/30 bg-emerald-500/[0.02]" 
            : "border-border/60 bg-card"
        }`}>
          <div className="mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isSigned ? "Approval Status" : "Authorize Estimate"}
            </h2>
          </div>
          <SignEstimateForm
            token={token ?? ""}
            signedValue={estimate.signature?.value ?? null}
            signedDate={estimate.signature?.date ?? null}
          />
        </section>

        {/* FOOTER */}
        <footer className="pt-4 text-center text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">{company.company_name} {company.company_phone ? `· ${company.company_phone}` : ""}</p>
          {company.footer_message && <p className="text-[11px]">{company.footer_message}</p>}
        </footer>

      </main>
    </div>
  );
}