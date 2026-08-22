import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";
import { mergeCompanyDefaults } from "@/lib/company";
import { getEstimateTermsTemplate } from "@/lib/estimateTerms";
import { TermsBody } from "@/components/shared/TermsBody";
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

type PortalPhoto = { id: string; photo_type: "before" | "after"; storage_path: string; display_order: number };
type PortalAreaPhoto = PortalPhoto & { area_id: string; area_name: string };
type PortalPhotosPayload = { estimate_photos: PortalPhoto[]; area_photos: PortalAreaPhoto[] };

const PHOTO_TYPE_LABEL: Record<PortalPhoto["photo_type"], string> = { before: "Before", after: "After" };

/** Same route the PDF already uses to serve these exact photos to a
 * customer (lib/pdf/estimateProposal.ts's `photoUrl`) — no auth check
 * of its own (see app/api/estimate-photos/download/route.ts), so
 * reachable the same way here. */
function estimatePhotoUrl(storagePath: string): string {
  return `/api/estimate-photos/download?path=${encodeURIComponent(storagePath)}`;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function CustomerPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token: queryToken } = await searchParams;
  const token = queryToken || id;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data } = token ? await supabase.rpc("get_customer_portal", { p_token: token }) : { data: null };
  const payload = data as PortalPayload | null;
  const estimate = payload?.estimate;

  const { data: allChangeOrdersData } = token && estimate
    ? await supabase.rpc("get_portal_change_orders", { p_token: token })
    : { data: null };
  const allChangeOrders = (allChangeOrdersData as PortalChangeOrder[] | null) ?? [];

  const { data: termsData } = token && estimate
    ? await supabase.rpc("get_estimate_terms_template", { p_token: token })
    : { data: null };
  const termsPayload = termsData as { key: string | null; override: string | null } | null;

  // Parity with the PDF (lib/pdf/estimateProposal.ts), which already
  // shows a customer these same photos — the portal page previously
  // showed none of them.
  const { data: photosData } = token && estimate
    ? await supabase.rpc("get_portal_estimate_photos", { p_token: token })
    : { data: null };
  const photosPayload = (photosData as PortalPhotosPayload | null) ?? { estimate_photos: [], area_photos: [] };
  const beforePhotos = photosPayload.estimate_photos.filter((p) => p.photo_type === "before");
  const afterPhotos = photosPayload.estimate_photos.filter((p) => p.photo_type === "after");
  const areaPhotoGroups = Object.values(
    photosPayload.area_photos.reduce<Record<string, { areaName: string; photos: PortalAreaPhoto[] }>>((acc, p) => {
      (acc[p.area_id] ??= { areaName: p.area_name, photos: [] }).photos.push(p);
      return acc;
    }, {})
  );
  const hasAnyPhotos = beforePhotos.length > 0 || afterPhotos.length > 0 || areaPhotoGroups.length > 0;

  if (!estimate) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center bg-gray-50">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">This link isn&apos;t available</h1>
          <p className="mt-2 text-sm text-gray-600">
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

  const CATEGORY_LABELS: { key: string; label: string }[] = [
    { key: "material", label: "Materials" },
    { key: "labor", label: "Labor" },
    { key: "other", label: "Other" },
  ];

  const hasCategories = lineItems.some((i) => !!i.category);

  const scopeGroups = !hasCategories ? [] : CATEGORY_LABELS.map(({ key, label }) => {
    const items = lineItems.filter((i) => (i.category ?? "other") === key);
    return { label, items, subtotal: calculateSubtotal(items.map((i) => ({ total: i.total ?? 0 }))) };
  }).filter((g) => g.items.length > 0);

  const approvedChangeOrderItems = changeOrders.map((co, i) => ({
    id: `${co.change_order_number ?? "co"}-${i}`,
    name: co.change_order_number ? `${co.change_order_number} — ${co.title ?? "Change order"}` : (co.title ?? "Change order"),
    description: co.description ?? null,
    total: (co.total_amount ?? 0) + (co.tax ?? 0),
  }));

  const lineItemsTotal = calculateSubtotal(lineItems.map((i) => ({ total: i.total ?? 0 })));
  const lineItemsAreAuthoritative =
    lineItems.length > 0 && Math.abs(lineItemsTotal - storedSubtotal) <= 0.005;

  const adjustments = estimateTotal - storedSubtotal;
  const hasAdjustments = Math.abs(adjustments) > 0.005;

  const scopeItemCount =
    (lineItemsAreAuthoritative ? lineItems.length : 1) + approvedChangeOrderItems.length;

  const flatScopeItems = lineItemsAreAuthoritative && !hasCategories ? lineItems : [];

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {!isSigned && (
        <div className="bg-amber-500 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-amber-950">
          Review required — signature needed below
        </div>
      )}

      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8 space-y-4">

        {/* HEADER / IDENTITY */}
        <header className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight text-gray-900">{company.company_name}</h1>
            {company.dba && (
              <p className="text-[11px] leading-tight text-gray-500">dba {company.dba}</p>
            )}
            <p className="text-[11px] text-gray-500">
              {new Date(estimate.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          {client?.name && (
            <div className="min-w-0 text-right">
              <p className="text-sm font-bold text-gray-900">{client.name}</p>
              {client.phone && <p className="text-[11px] text-gray-500">{client.phone}</p>}
              {client.email && <p className="truncate text-[11px] text-gray-500">{client.email}</p>}
              {client.address && <p className="text-[11px] text-gray-500">{client.address}</p>}
              <p className="font-mono text-[11px] text-gray-500">#{estimate.estimate_number ?? estimate.id.slice(0, 8)}</p>
            </div>
          )}
        </header>

        {/* STREAMLINED COMBINED FINANCIAL & SCOPE CARD */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Header Bar with Total Contract Price */}
          <div className="flex items-center justify-between bg-gray-900 px-4 py-3.5 text-white">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Project Overview</p>
              <h2 className="text-base font-bold leading-tight capitalize truncate">{estimate.title || "Project Estimate"}</h2>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Contract Total</p>
              <p className="text-xl font-bold leading-none">{money(contractTotal)}</p>
            </div>
          </div>

          <div className="p-4 space-y-4 text-xs">
            {estimate.description && (
              <div className="rounded-lg border-l-2 border-amber-500 bg-amber-50 p-3 text-amber-950">
                <p className="font-bold uppercase tracking-wider text-[10px] text-amber-700 mb-1">Objective</p>
                <p className="whitespace-pre-wrap leading-relaxed">{estimate.description}</p>
              </div>
            )}

            {/* Scope Items List (Compact) */}
            {scopeItemCount > 0 && (
              <div className="space-y-2 border-b border-gray-100 pb-3">
                <div className="flex items-center justify-between text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
                  <span>Scope Items ({scopeItemCount})</span>
                </div>
                <div className="space-y-1.5">
                  {!lineItemsAreAuthoritative && (
                    <div className="flex justify-between items-center text-gray-800">
                      <span>Quoted work as specified</span>
                      <span className="font-medium">{money(storedSubtotal)}</span>
                    </div>
                  )}
                  {flatScopeItems.map((item) => (
                    <div key={item.id} className="flex justify-between items-start gap-2 text-gray-800">
                      <span className="truncate">
                        {item.name} {(item.quantity ?? 0) > 1 && <span className="text-gray-500">× {item.quantity}</span>}
                      </span>
                      <span className="font-medium shrink-0">{money(item.total ?? 0)}</span>
                    </div>
                  ))}
                  {lineItemsAreAuthoritative && scopeGroups.flatMap(g => g.items).map((item) => (
                    <div key={item.id} className="flex justify-between items-start gap-2 text-gray-800">
                      <span className="truncate">
                        {item.name} {(item.quantity ?? 0) > 1 && <span className="text-gray-500">× {item.quantity}</span>}
                      </span>
                      <span className="font-medium shrink-0">{money(item.total ?? 0)}</span>
                    </div>
                  ))}
                  {approvedChangeOrderItems.map((item) => (
                    <div key={item.id} className="flex justify-between items-start gap-2 text-gray-800">
                      <span className="truncate">{item.name} <span className="text-amber-600 font-semibold">(Change Order)</span></span>
                      <span className="font-medium shrink-0">{money(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Financial Rollup Details */}
            <div className="space-y-1.5 text-gray-600 pt-1">
              {hasAdjustments && (
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-medium text-gray-900">{money(storedSubtotal)}</span>
                </div>
              )}
              {hasAdjustments && (
                <div className="flex justify-between">
                  <span>Adjustments &amp; tax</span>
                  <span className="font-medium text-gray-900">{adjustments < 0 ? `−${money(Math.abs(adjustments))}` : money(adjustments)}</span>
                </div>
              )}
              
              {(() => {
                const totalPaid = invoices.reduce((sum, inv) => {
                  const pays = inv.payments ?? [];
                  return sum + pays.reduce((s, p) => s + (p.amount ?? 0), 0);
                }, 0);
                const totalBalance = Math.max(0, contractTotal - totalPaid);
                const isPaidInFull = totalBalance === 0;

                return (
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100 font-semibold text-gray-900">
                    <span>Balance Due</span>
                    <span className={`text-sm font-bold ${isPaidInFull ? "text-emerald-600" : "text-amber-600"}`}>
                      {money(totalBalance)}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {/* PHOTOS SECTION — same photos the PDF already shows */}
        {hasAnyPhotos && (
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Photos</h2>

            {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
              <div className="space-y-2">
                {beforePhotos.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Before</p>
                    <div className="grid grid-cols-3 gap-2">
                      {beforePhotos.map((photo) => (
                        <a key={photo.id} href={estimatePhotoUrl(photo.storage_path)} target="_blank" rel="noopener noreferrer">
                          <img
                            src={estimatePhotoUrl(photo.storage_path)}
                            alt="Before photo"
                            className="h-24 w-full rounded-lg border border-gray-200 object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {afterPhotos.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">After</p>
                    <div className="grid grid-cols-3 gap-2">
                      {afterPhotos.map((photo) => (
                        <a key={photo.id} href={estimatePhotoUrl(photo.storage_path)} target="_blank" rel="noopener noreferrer">
                          <img
                            src={estimatePhotoUrl(photo.storage_path)}
                            alt="After photo"
                            className="h-24 w-full rounded-lg border border-gray-200 object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {areaPhotoGroups.map((group) => (
              <div key={group.areaName} className="border-t border-gray-100 pt-3">
                <p className="mb-1.5 text-xs font-semibold text-gray-800">{group.areaName}</p>
                <div className="grid grid-cols-3 gap-2">
                  {group.photos.map((photo) => (
                    <a key={photo.id} href={estimatePhotoUrl(photo.storage_path)} target="_blank" rel="noopener noreferrer" className="relative">
                      <img
                        src={estimatePhotoUrl(photo.storage_path)}
                        alt={`${PHOTO_TYPE_LABEL[photo.photo_type]} photo — ${group.areaName}`}
                        className="h-24 w-full rounded-lg border border-gray-200 object-cover"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        {PHOTO_TYPE_LABEL[photo.photo_type]}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* CHANGE ORDERS SECTION */}
        {allChangeOrders.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Change Orders</h2>
            <div className="space-y-2">
              {allChangeOrders.map((co) => (
                <ChangeOrderApprovalCard key={co.id} token={token ?? ""} changeOrder={co} />
              ))}
            </div>
          </section>
        )}

        {/* INVOICES SECTION */}
        {invoices.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Invoices</h2>
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
                  <div key={inv.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono font-bold text-gray-900">
                          #{inv.invoice_number ?? inv.id.slice(0, 8)}
                        </span>
                        <span className="text-[11px] text-gray-500 truncate">
                          Due: {inv.due_date ?? "—"}
                        </span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        isPaidInFull 
                          ? "bg-emerald-100 text-emerald-700" 
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-white px-2.5 py-1.5 rounded border border-gray-200 text-[11px]">
                      <div className="flex justify-between text-gray-500">
                        <span>Total:</span>
                        <span className="font-medium text-gray-900">{money(invTotal)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Paid:</span>
                        <span className="font-medium text-emerald-600">-{money(paid)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-gray-900">
                        <span>Balance:</span>
                        <span className="text-gray-700">{money(balance)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* PAYMENT INSTRUCTIONS */}
        {company.payment_instructions && (
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-1.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Payment Instructions</h2>
            <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-200">
              {company.payment_instructions}
            </p>
          </section>
        )}

        {/* TERMS & CONDITIONS ACCORDION */}
        {(() => {
          const terms = getEstimateTermsTemplate(termsPayload?.key ?? null, termsPayload?.override ?? null);
          return (
            <details className="group rounded-xl border border-gray-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50 rounded-xl">
                <span>Terms &amp; Conditions</span>
                <span aria-hidden className="text-gray-400 transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-3 border-t border-gray-100 px-4 py-3 text-xs">
                <TermsBody className="leading-relaxed text-gray-600" body={terms.body} />
                {company.terms_conditions && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="whitespace-pre-wrap leading-relaxed text-gray-600">{company.terms_conditions}</p>
                  </div>
                )}
              </div>
            </details>
          );
        })()}

        {/* SIGNATURE / APPROVAL SECTION */}
        <section className={`rounded-xl border p-4 shadow-sm ${
          isSigned 
            ? "border-emerald-300 bg-emerald-50" 
            : "border-gray-200 bg-white"
        }`}>
          <div className="mb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
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
        <footer className="pt-2 text-center text-xs text-gray-500 space-y-0.5">
          <p className="font-medium text-gray-800">{company.company_name} {company.company_phone ? `· ${company.company_phone}` : ""}</p>
          {company.footer_message && <p className="text-[11px]">{company.footer_message}</p>}
        </footer>

      </main>
    </div>
  );
}