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

  return (
    <div className="min-h-screen bg-muted/20 pb-16">
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 space-y-6">
        
        {/* HEADER / BRANDING (2 COLUMNS: COMPANY LEFT, CUSTOMER RIGHT) */}
        <header className="overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Portal Overview
            </span>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Customer Portal
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
            {/* COMPANY INFO (LEFT) */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Company
              </span>
              <h1 className="text-sm font-bold text-foreground">
                {company.company_name}
              </h1>
              {company.company_phone && (
                <p className="text-xs text-muted-foreground">{company.company_phone}</p>
              )}
              {company.company_email && (
                <p className="text-xs text-muted-foreground">{company.company_email}</p>
              )}
            </div>

            {/* CUSTOMER INFO (RIGHT) */}
            {client && (
              <div className="space-y-1 sm:border-l sm:border-border/60 sm:pl-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Prepared For
                </span>
                <p className="text-sm font-semibold text-foreground">
                  {client.name}
                </p>
                {client.phone && (
                  <p className="text-xs text-muted-foreground">{client.phone}</p>
                )}
                {client.email && (
                  <p className="text-xs text-muted-foreground">{client.email}</p>
                )}
                {client.address && (
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                    {client.address}
                  </p>
                )}
              </div>
            )}
          </div>
        </header>

        {/* ESTIMATE CARD */}
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Estimate</h2>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono font-semibold text-foreground">
                  #{estimate.estimate_number ?? "—"}
                </span>
              </div>
              {estimate.title && (
                <h3 className="mt-1 text-base font-semibold text-foreground">{estimate.title}</h3>
              )}
            </div>
            
            <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isSigned 
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            }`}>
              {isSigned ? (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  Approved
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Pending Approval
                </>
              )}
            </div>
          </div>

          {estimate.description && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 p-3 rounded-xl border border-border/40">
              {estimate.description}
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border/60">
                <tr>
                  <th className="px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qty</th>
                  <th className="px-3.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lineItems.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-xs text-muted-foreground">No items listed.</td></tr>
                ) : lineItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3.5 py-3">
                      <div className="font-medium text-foreground text-xs sm:text-sm">{item.name}</div>
                      {item.description && <div className="text-[11px] text-muted-foreground mt-0.5">{item.description}</div>}
                    </td>
                    <td className="px-3.5 py-3 text-right text-xs text-muted-foreground font-medium">{item.quantity ?? 0}</td>
                    <td className="px-3.5 py-3 text-right font-semibold text-foreground text-xs sm:text-sm">{money(item.total ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm border border-border/40">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Estimate total</span>
              <span className="font-medium text-foreground">{money(estimateTotal)}</span>
            </div>
            {approvedChangeOrderRevenue !== 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Approved change orders</span>
                <span className="font-medium text-foreground">{money(approvedChangeOrderRevenue)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-bold text-foreground">
              <span>Contract total</span>
              <span className="text-base text-primary">{money(contractTotal)}</span>
            </div>
          </div>

          <div>
            <Link
              href={`/api/estimates/${estimate.id}/pdf?customerToken=${encodeURIComponent(token ?? "")}`}
              target="_blank"
              className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl border border-border/80 bg-card px-4 text-xs font-semibold text-foreground shadow-xs hover:bg-muted/50 transition-colors"
            >
              <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download estimate PDF
            </Link>
          </div>
        </section>

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
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invoices</h2>
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
                
                const isPaidInFull = status === "paid";
                
                return (
                  <div key={inv.id} className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-foreground">
                        #{inv.invoice_number ?? inv.id.slice(0, 8)}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isPaidInFull 
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}>
                        {status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>Issued: {inv.issue_date ?? "—"}</span>
                      <span>·</span>
                      <span>Due: {inv.due_date ?? "—"}</span>
                    </div>

                    <div className="space-y-1 text-xs bg-card p-3 rounded-lg border border-border/40">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total</span>
                        <span className="font-medium text-foreground">{money(invTotal)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Paid</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">−{money(paid)}</span>
                      </div>
                      <div className="flex justify-between border-t border-border/60 pt-1.5 font-bold text-foreground text-sm">
                        <span>Balance due</span>
                        <span className="text-primary">{money(balance)}</span>
                      </div>
                    </div>

                    {inv.customer_token && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <Link
                          href={`/invoice/${inv.id}?token=${encodeURIComponent(inv.customer_token)}`}
                          className="inline-flex min-h-9 items-center text-xs font-semibold text-primary hover:underline"
                        >
                          View invoice &rarr;
                        </Link>
                        <Link
                          href={`/api/invoices/${inv.id}/pdf?customerToken=${encodeURIComponent(inv.customer_token)}`}
                          target="_blank"
                          className="inline-flex min-h-9 items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
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