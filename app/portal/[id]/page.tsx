import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";
import { mergeCompanyDefaults, mergeProfileOverrides, parseCompanyProfileRow } from "@/lib/company";
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
  line_items?: { id: string; category?: string | null; name?: string; description?: string; quantity?: number; unit_price?: number; total?: number; group_name?: string | null }[];
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
type PortalAreaLineItem = { id: string; name: string; quantity: number; unit_price: number; unit: string | null; total: number };
type PortalArea = {
  id: string; area_name: string | null; sequence_number: number; estimated_repair_cost: number | null;
  measurements: string | null; quantity: number | null; quantity_unit: string | null;
  defect: string | null; location: string | null; corrective_action: string | null;
  materials_included: string | null; scope_items: string | null;
  line_items: PortalAreaLineItem[];
};

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
  // Keyed by area id (not name — two areas can share a name) so each
  // Roofing Areas card below can pull just its own before/after
  // photos, same source as the generic areaPhotoGroups above.
  const areaPhotosById = photosPayload.area_photos.reduce<Record<string, { before: PortalAreaPhoto[]; after: PortalAreaPhoto[] }>>((acc, p) => {
    const bucket = (acc[p.area_id] ??= { before: [], after: [] });
    bucket[p.photo_type].push(p);
    return acc;
  }, {});

  // Which brand this estimate presents as — get_customer_portal can't
  // safely be rewritten to return profile_id itself (same "lives
  // outside this repo's tracked migrations" reasoning as
  // get_portal_change_orders), so a one-column read plus the profile
  // row itself, both via the same SECURITY DEFINER pattern.
  const { data: profileIdData } = token && estimate
    ? await supabase.rpc("get_portal_estimate_profile_id", { p_token: token })
    : { data: null };
  const { data: profileData } = profileIdData
    ? await supabase.rpc("get_company_profile", { p_profile_id: profileIdData })
    : { data: null };
  const profile = parseCompanyProfileRow(profileData as Record<string, unknown> | null);

  // Superset of get_customer_portal's line_items (adds group_name, the
  // estimate form/PDF's project grouping) — see get_portal_estimate_items's
  // own comment for why this is a second, narrowly-scoped function
  // rather than a rewrite of get_customer_portal. Falls back to
  // payload.line_items (still correct, just ungrouped) if this
  // migration hasn't run yet or the estimate has no items.
  const { data: portalItemsData } = token && estimate
    ? await supabase.rpc("get_portal_estimate_items", { p_token: token })
    : { data: null };
  const portalItems = portalItemsData as PortalPayload["line_items"] | null;

  // A roofing estimate's scope lives in estimate_areas, not
  // estimate_items (which get_customer_portal's line_items is always
  // empty for on this estimate type) — see get_portal_estimate_areas's
  // own comment for why this is a second function, not a rewrite of
  // get_customer_portal. Empty array for a standard estimate.
  const { data: portalAreasData } = token && estimate
    ? await supabase.rpc("get_portal_estimate_areas", { p_token: token })
    : { data: null };
  // line_items defaults to [] per area — get_portal_estimate_areas only
  // started returning it once its own migration ran; normalizing here
  // means this page never breaks on a deploy where the DB migration
  // and the code land at slightly different times.
  const portalAreas = ((portalAreasData as PortalArea[] | null) ?? []).map((a) => ({ ...a, line_items: a.line_items ?? [] }));

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

  const company = mergeProfileOverrides(mergeCompanyDefaults(payload?.company ?? null), profile);
  const client = payload?.client ?? null;
  const lineItems = portalItems && portalItems.length > 0 ? portalItems : (payload?.line_items ?? []);
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

  // Project grouping (estimate form's "+ Add Project") takes priority
  // over category grouping when present — it's the more specific,
  // customer-meaningful label. Items with no group_name (every
  // estimate created before grouping existed, or any ungrouped item
  // on a newer one) still render flat below the named projects,
  // exactly as this page always rendered them.
  const projectOrder: string[] = [];
  for (const i of lineItems) {
    if (i.group_name && !projectOrder.includes(i.group_name)) projectOrder.push(i.group_name);
  }
  const hasProjectGroups = projectOrder.length > 0;
  const projectGroups = projectOrder.map((name) => {
    const items = lineItems.filter((i) => i.group_name === name);
    return { name, items, subtotal: calculateSubtotal(items.map((i) => ({ total: i.total ?? 0 }))) };
  });
  const ungroupedItems = hasProjectGroups ? lineItems.filter((i) => !i.group_name) : [];

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

  // Roofing estimate: areas ARE the scope (estimate_items is always
  // empty for these), so they take priority over the generic "Quoted
  // work as specified" lumped-total fallback below — same parity fix
  // as the PDF's own "Detailed Areas & Scope of Work" section.
  const hasAreas = portalAreas.length > 0;
  // A roofing estimate's photos are already shown inline, per area, in
  // the "Detailed Areas & Scope of Work" section above — the generic
  // bottom Photos section would just repeat them (or, for any
  // estimate-level photos, show a redundant second photos block at the
  // very end), so it's skipped entirely for roofing. Standard
  // estimates (no areas) keep it as their only photos section.
  const hasAnyPhotos = !hasAreas && (beforePhotos.length > 0 || afterPhotos.length > 0 || areaPhotoGroups.length > 0);

  const scopeItemCount = hasAreas
    ? portalAreas.length + approvedChangeOrderItems.length
    : (lineItemsAreAuthoritative ? lineItems.length : 1) + approvedChangeOrderItems.length;

  const flatScopeItems = !hasAreas && lineItemsAreAuthoritative && !hasCategories && !hasProjectGroups ? lineItems : [];

  // Matches lib/pdf/pdfLayout.ts's .section-title exactly (border-bottom
  // rule, uppercase, same tracking) — one shared class string so every
  // section header here looks like a heading IN the same document
  // instead of a card title, which is what made this page read as a
  // different, unrelated piece of software from the PDF it's supposed
  // to mirror.
  const sectionTitle = "text-[11px] font-bold uppercase tracking-wider text-[#1f2429] border-b border-[#e2e5e8] pb-1.5 mb-2.5";
  const rowLabel = "text-[10px] font-bold uppercase tracking-wider text-gray-500";

  return (
    // #eef0f2 page backdrop + a single bordered white "document" —
    // the exact two-tone the PDF route itself renders in a browser
    // (PDF_STYLES' body/.document), so the portal and the PDF now look
    // like the same document instead of a phone-app UI next to a
    // printed page.
    <div className="min-h-screen bg-[#eef0f2] pb-16">
      {!isSigned && (
        <div className="bg-amber-500 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-amber-950">
          Review required — signature needed below
        </div>
      )}

      <main className="mx-auto max-w-xl px-3 py-6 sm:max-w-2xl sm:px-6 sm:py-8 lg:max-w-4xl">
        <div className="border border-[#e2e5e8] bg-white p-5 shadow-sm sm:p-8 lg:p-12">

          {/* HEADER — company on the left, doc title + estimate # on
              the right, separated by a 2px rule, same shape as the
              PDF's .header. */}
          <div className="flex items-start justify-between gap-4 border-b-2 border-[#1f2429] pb-5 mb-6">
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-[#1f2429]">{company.company_name}</h1>
              {company.dba && <p className="mt-0.5 text-[10.5px] text-gray-500">dba {company.dba}</p>}
              <p className="mt-0.5 text-[10.5px] text-gray-500 leading-relaxed">
                {[company.company_phone, company.company_email].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold uppercase tracking-wide text-[#1f2429]">Proposal</p>
              <p className="mt-0.5 text-[10.5px] text-gray-500">#{estimate.estimate_number ?? estimate.id.slice(0, 8)}</p>
              <p className="text-[10.5px] text-gray-500">
                Issued {new Date(estimate.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>

          {/* DOWNLOAD PDF — a RELATIVE link, deliberately: this page is
              already being viewed on the correctly-resolved brand domain
              (see the profile_id -> portal_domain lookup above), so a
              relative href automatically stays on that same domain
              rather than needing to re-resolve/hardcode it here.
              customerToken (not a staff session cookie) is what
              authorizes this — same public/token-based auth the PDF
              route already supports for the customer-token case. */}
          <div className="flex justify-end -mt-3 mb-5">
            <Link
              href={`/api/estimates/${estimate.id}/pdf?customerToken=${encodeURIComponent(token ?? "")}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#e2e5e8] px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Download PDF
            </Link>
          </div>

          {/* PREPARED FOR / PROJECT SCOPE — the PDF's own two-column
              info-grid: fixed-width label, value beside it. */}
          <div className="flex flex-col gap-6 text-[11.5px] text-gray-700 sm:flex-row mb-6">
            <div className="flex-1">
              <p className={sectionTitle}>Prepared For</p>
              <p className="text-[12.5px] font-bold text-[#1f2429] mb-0.5">{client?.name || "—"}</p>
              {client?.phone && <p>{client.phone}</p>}
              {client?.email && <p>{client.email}</p>}
              {client?.address && <p>{client.address}</p>}
            </div>
            <div className="flex-1">
              <p className={sectionTitle}>Project Scope</p>
              <p className="text-[12.5px] font-bold text-[#1f2429] mb-0.5 capitalize">{estimate.title || "Project Estimate"}</p>
              {estimate.description && (
                <p className="whitespace-pre-wrap leading-relaxed text-gray-600">{estimate.description}</p>
              )}
            </div>
          </div>

          {/* CONTRACT TOTAL — the PDF's minimal summary bar (light gray
              box, not a dark full-bleed banner). Roofing estimates show
              a flat "due within 30 days" payment term instead of a
              deposit split; standard estimates keep their existing
              deposit-amount display. */}
          <div className="flex items-center justify-between gap-4 rounded-md border border-[#e2e5e8] bg-[#f7f8f9] px-5 py-3.5 mb-6">
            <div>
              <p className={`${rowLabel} border-none pb-0 mb-0`}>Contract Total</p>
              <p className="text-lg font-extrabold text-[#1f2429] leading-tight">{money(contractTotal)}</p>
            </div>
            {hasAreas ? (
              <div className="text-right">
                <p className={`${rowLabel} border-none pb-0 mb-0`}>Payment Terms</p>
                <p className="text-[11px] font-bold text-[#1f2429] leading-tight">Due within 30 days</p>
              </div>
            ) : estimate.deposit_amount ? (
              <div className="text-right">
                <p className={`${rowLabel} border-none pb-0 mb-0`}>Deposit</p>
                <p className="text-sm font-bold text-emerald-700 leading-tight">{money(estimate.deposit_amount)}</p>
              </div>
            ) : null}
          </div>

          {/* ROOFING AREAS — a roofing estimate's real detail (defect,
              location, corrective action, materials, before/after
              photos, per-area line items) doesn't fit the compact
              Scope Items list above, so it gets its own section per
              area, matching the PDF's own "Detailed Areas & Scope of
              Work" cards — plain bordered box, no dark header bar.
              Nothing here for a standard estimate — hasAreas is only
              ever true for a roofing one. */}
          {hasAreas && (
            <div className="mb-6">
              <p className={sectionTitle}>Detailed Areas &amp; Scope of Work</p>
              <div className="space-y-4">
                {portalAreas.map((area) => {
                  const photos = areaPhotosById[area.id] ?? { before: [], after: [] };
                  // Quantity/Location/Measurements are short facts — one
                  // line each, not boxed grid cells. The narrative
                  // fields (scope → defect → corrective action →
                  // materials) are full-width instead, each through
                  // TermsBody so a "* " bullet list (like Corrective
                  // Action's step-by-step) renders as a real <ul>, not
                  // literal asterisks in a wall of text.
                  const quickFacts: { label: string; value: string }[] = [
                    area.quantity ? { label: "Quantity", value: `${area.quantity}${area.quantity_unit ? ` ${area.quantity_unit}` : ""}` } : null,
                    area.location ? { label: "Location", value: area.location } : null,
                    area.measurements ? { label: "Measurements", value: area.measurements } : null,
                  ].filter((r): r is { label: string; value: string } => r !== null);
                  const narrativeFields: { label: string; value: string }[] = [
                    area.scope_items ? { label: "Scope", value: area.scope_items } : null,
                    area.defect ? { label: "Defect", value: area.defect } : null,
                    area.corrective_action ? { label: "Corrective Action", value: area.corrective_action } : null,
                    area.materials_included ? { label: "Materials Included", value: area.materials_included } : null,
                  ].filter((r): r is { label: string; value: string } => r !== null);

                  return (
                    <div key={area.id} className="border border-[#e2e5e8] rounded-md">
                      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#e2e5e8] bg-[#f7f8f9]">
                        <span className="font-bold text-[12px] text-[#1f2429] truncate">{area.area_name || `Area ${area.sequence_number + 1}`}</span>
                        <span className="font-bold text-[12px] text-[#1f2429] shrink-0">{money(area.estimated_repair_cost ?? 0)}</span>
                      </div>

                      {(quickFacts.length > 0 || narrativeFields.length > 0) && (
                        <div className="p-4 text-[11px] space-y-3">
                          {quickFacts.map((row) => (
                            <p key={row.label} className="text-gray-700">
                              <span className="font-bold text-[#1f2429]">{row.label}:</span> {row.value}
                            </p>
                          ))}
                          {narrativeFields.map((row) => (
                            <div key={row.label}>
                              <p className="font-bold text-[#1f2429] mb-0.5">{row.label}</p>
                              <TermsBody className="leading-relaxed text-gray-700" body={row.value} />
                            </div>
                          ))}
                        </div>
                      )}

                      {area.line_items.length > 0 && (
                        <div className="space-y-1 border-t border-[#eef0f2] p-4 text-[11px]">
                          {area.line_items.map((li) => (
                            <div key={li.id} className="flex justify-between items-start gap-2 text-gray-700">
                              <span className="break-words">
                                {li.name || "—"}
                                {li.quantity > 1 && <span className="text-gray-400"> × {li.quantity}{li.unit ? ` ${li.unit}` : ""}</span>}
                              </span>
                              <span className="font-medium shrink-0">{money(li.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {(photos.before.length > 0 || photos.after.length > 0) && (
                        <div className="grid grid-cols-1 gap-3 border-t border-[#eef0f2] p-4 sm:grid-cols-2">
                          {photos.before.length > 0 && (
                            <div>
                              <p className={`${rowLabel} border-none pb-0 mb-1.5`}>Before</p>
                              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                                {photos.before.map((photo) => (
                                  <a key={photo.id} href={estimatePhotoUrl(photo.storage_path)} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={estimatePhotoUrl(photo.storage_path)}
                                      alt={`Before photo — ${area.area_name ?? ""}`}
                                      className="h-16 w-full rounded-sm border border-[#e2e5e8] object-cover"
                                    />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          {photos.after.length > 0 && (
                            <div>
                              <p className={`${rowLabel} border-none pb-0 mb-1.5`}>After</p>
                              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                                {photos.after.map((photo) => (
                                  <a key={photo.id} href={estimatePhotoUrl(photo.storage_path)} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={estimatePhotoUrl(photo.storage_path)}
                                      alt={`After photo — ${area.area_name ?? ""}`}
                                      className="h-16 w-full rounded-sm border border-[#e2e5e8] object-cover"
                                    />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {quickFacts.length === 0 && narrativeFields.length === 0 && area.line_items.length === 0 && photos.before.length === 0 && photos.after.length === 0 && (
                        <p className="p-4 text-[11px] text-gray-400 italic">No additional details recorded for this area.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SCOPE ITEMS — moved down next to the rest of the totals,
              not on the cover page — plain rows with a hairline bottom
              border, same as a PDF table row (td { border-bottom: 1px
              solid #eef0f2 }), no colored pills/accent rails. */}
          {scopeItemCount > 0 && (
            <div className="mb-6">
              <p className={sectionTitle}>Scope Items</p>
              <div className="text-[11.5px] text-gray-700">
                {hasAreas && portalAreas.map((area) => (
                  <div key={area.id} className="flex justify-between items-start gap-2 py-1.5 border-b border-[#eef0f2]">
                    <span className="break-words font-bold text-[#1f2429]">{area.area_name || `Area ${area.sequence_number + 1}`}</span>
                    <span className="font-semibold shrink-0 text-[#1f2429]">{money(area.estimated_repair_cost ?? 0)}</span>
                  </div>
                ))}
                {!hasAreas && !lineItemsAreAuthoritative && (
                  <div className="flex justify-between items-center py-1.5 border-b border-[#eef0f2]">
                    <span>Quoted work as specified</span>
                    <span className="font-medium">{money(storedSubtotal)}</span>
                  </div>
                )}
                {lineItemsAreAuthoritative && hasProjectGroups && projectGroups.map((group) => (
                  <div key={group.name} className="py-1.5 border-b border-[#eef0f2]">
                    <p className="font-bold text-[#1f2429] text-[11px] uppercase tracking-wide mb-1">{group.name}</p>
                    {group.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-start gap-2 py-0.5 pl-2 text-gray-600">
                        <span className="break-words">
                          {item.name} {(item.quantity ?? 0) > 1 && <span className="text-gray-400">× {item.quantity}</span>}
                        </span>
                        <span className="font-medium shrink-0">{money(item.total ?? 0)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-1 pl-2 text-[#1f2429] font-semibold">
                      <span>Project Total</span>
                      <span>{money(group.subtotal)}</span>
                    </div>
                  </div>
                ))}
                {lineItemsAreAuthoritative && hasProjectGroups && ungroupedItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-start gap-2 py-1.5 border-b border-[#eef0f2]">
                    <span className="break-words">
                      {item.name} {(item.quantity ?? 0) > 1 && <span className="text-gray-400">× {item.quantity}</span>}
                    </span>
                    <span className="font-medium shrink-0">{money(item.total ?? 0)}</span>
                  </div>
                ))}
                {flatScopeItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-start gap-2 py-1.5 border-b border-[#eef0f2]">
                    <span className="break-words">
                      {item.name} {(item.quantity ?? 0) > 1 && <span className="text-gray-400">× {item.quantity}</span>}
                    </span>
                    <span className="font-medium shrink-0">{money(item.total ?? 0)}</span>
                  </div>
                ))}
                {lineItemsAreAuthoritative && !hasProjectGroups && scopeGroups.flatMap(g => g.items).map((item) => (
                  <div key={item.id} className="flex justify-between items-start gap-2 py-1.5 border-b border-[#eef0f2]">
                    <span className="break-words">
                      {item.name} {(item.quantity ?? 0) > 1 && <span className="text-gray-400">× {item.quantity}</span>}
                    </span>
                    <span className="font-medium shrink-0">{money(item.total ?? 0)}</span>
                  </div>
                ))}
                {/* Change orders — still called out (amber label) since
                    it's genuinely a different kind of scope (added
                    after the original quote), just without the heavy
                    tinted-pill treatment the rest of this page no
                    longer uses either. */}
                {approvedChangeOrderItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-start gap-2 py-1.5 border-b border-[#eef0f2]">
                    <span className="break-words text-gray-700">
                      {item.name} <span className="text-amber-700 font-semibold text-[10px] uppercase tracking-wide">Change Order</span>
                    </span>
                    <span className="font-semibold shrink-0 text-[#1f2429]">{money(item.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FINANCIAL SUMMARY — matches the PDF's .summary-box: light
              gray box, muted rows, a ruled total, and (when there's a
              balance) a dark full-width bar at the bottom — the ONE
              place on this page that still gets a dark background,
              same as the PDF. */}
          <div className="rounded-md border border-[#e2e5e8] bg-[#f7f8f9] px-5 py-4 mb-6 text-[11px] overflow-hidden">
            {hasAdjustments && (
              <div className="flex justify-between py-1 text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium text-[#1f2429]">{money(storedSubtotal)}</span>
              </div>
            )}
            {hasAdjustments && (
              <div className="flex justify-between py-1 text-gray-600">
                <span>Adjustments &amp; tax</span>
                <span className="font-medium text-[#1f2429]">{adjustments < 0 ? `−${money(Math.abs(adjustments))}` : money(adjustments)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[#dfe2e5] mt-1.5 pt-2.5 text-[13px] font-bold text-[#1f2429]">
              <span>Total</span>
              <span>{money(contractTotal)}</span>
            </div>
            {hasAreas && (
              <div className="flex justify-between py-1 mt-1 text-gray-600">
                <span>Payment Terms</span>
                <span className="font-medium text-[#1f2429]">Due within 30 days</span>
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
                <div className={`flex justify-between items-center mt-3 -mx-5 -mb-4 px-5 py-3 text-[13px] font-bold ${
                  isPaidInFull ? "bg-emerald-700 text-white" : "bg-[#1f2429] text-white"
                }`}>
                  <span>Balance Due</span>
                  <span>{money(totalBalance)}</span>
                </div>
              );
            })()}
          </div>

          {/* PHOTOS — same photos the PDF already shows */}
          {hasAnyPhotos && (
            <div className="mb-6">
              <p className={sectionTitle}>Photos</p>
              {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
                <div className="space-y-2">
                  {beforePhotos.length > 0 && (
                    <div>
                      <p className={`${rowLabel} border-none pb-0 mb-1.5`}>Before</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                        {beforePhotos.map((photo) => (
                          <a key={photo.id} href={estimatePhotoUrl(photo.storage_path)} target="_blank" rel="noopener noreferrer">
                            <img
                              src={estimatePhotoUrl(photo.storage_path)}
                              alt="Before photo"
                              className="h-24 w-full rounded-sm border border-[#e2e5e8] object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {afterPhotos.length > 0 && (
                    <div>
                      <p className={`${rowLabel} border-none pb-0 mb-1.5`}>After</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                        {afterPhotos.map((photo) => (
                          <a key={photo.id} href={estimatePhotoUrl(photo.storage_path)} target="_blank" rel="noopener noreferrer">
                            <img
                              src={estimatePhotoUrl(photo.storage_path)}
                              alt="After photo"
                              className="h-24 w-full rounded-sm border border-[#e2e5e8] object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!hasAreas && areaPhotoGroups.map((group) => (
                <div key={group.areaName} className="border-t border-[#eef0f2] pt-3 mt-3">
                  <p className="mb-1.5 text-[11px] font-semibold text-gray-700">{group.areaName}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {group.photos.map((photo) => (
                      <a key={photo.id} href={estimatePhotoUrl(photo.storage_path)} target="_blank" rel="noopener noreferrer" className="relative">
                        <img
                          src={estimatePhotoUrl(photo.storage_path)}
                          alt={`${PHOTO_TYPE_LABEL[photo.photo_type]} photo — ${group.areaName}`}
                          className="h-24 w-full rounded-sm border border-[#e2e5e8] object-cover"
                        />
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                          {PHOTO_TYPE_LABEL[photo.photo_type]}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CHANGE ORDERS */}
          {allChangeOrders.length > 0 && (
            <div className="mb-6">
              <p className={sectionTitle}>Change Orders</p>
              <div>
                {allChangeOrders.map((co) => (
                  <ChangeOrderApprovalCard key={co.id} token={token ?? ""} changeOrder={co} />
                ))}
              </div>
            </div>
          )}

          {/* INVOICES */}
          {invoices.length > 0 && (
            <div className="mb-6">
              <p className={sectionTitle}>Invoices</p>
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
                    <div key={inv.id} className="rounded-md border border-[#e2e5e8] p-3 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono font-bold text-[#1f2429]">
                            #{inv.invoice_number ?? inv.id.slice(0, 8)}
                          </span>
                          <span className="text-gray-500 truncate">Due: {inv.due_date ?? "—"}</span>
                        </div>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                          isPaidInFull ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 bg-[#f7f8f9] px-2.5 py-1.5 rounded border border-[#e2e5e8]">
                        <div className="flex justify-between text-gray-500">
                          <span>Total:</span>
                          <span className="font-medium text-[#1f2429]">{money(invTotal)}</span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                          <span>Paid:</span>
                          <span className="font-medium text-emerald-600">-{money(paid)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-[#1f2429]">
                          <span>Balance:</span>
                          <span className="text-gray-700">{money(balance)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PAYMENT INSTRUCTIONS */}
          {company.payment_instructions && (
            <div className="mb-6">
              <p className={sectionTitle}>Payment Instructions</p>
              <p className="text-[11px] text-gray-600 whitespace-pre-wrap leading-relaxed bg-[#f7f8f9] p-3 rounded border border-[#e2e5e8]">
                {company.payment_instructions}
              </p>
            </div>
          )}

          {/* TERMS & CONDITIONS — collapsible for readability (this is
              a page, not paper), but the summary row uses the exact
              same section-title styling as everything else instead of
              a distinct "card header" look. */}
          {(() => {
            const terms = getEstimateTermsTemplate(termsPayload?.key ?? null, termsPayload?.override ?? null);
            return (
              <details className="group mb-6">
                <summary className={`${sectionTitle} cursor-pointer list-none flex items-center justify-between`}>
                  <span>Terms &amp; Conditions</span>
                  <span aria-hidden className="text-gray-400 transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="text-[11px] space-y-3">
                  <TermsBody className="leading-relaxed text-gray-600" body={terms.body} />
                  {company.terms_conditions && (
                    <div className="border-t border-[#eef0f2] pt-3">
                      <p className="whitespace-pre-wrap leading-relaxed text-gray-600">{company.terms_conditions}</p>
                    </div>
                  )}
                </div>
              </details>
            );
          })()}

          {/* SIGNATURE / APPROVAL — matches the PDF's .signature-box:
              a plain bordered box, centered content. Green border only
              once actually signed, same accent this page already used. */}
          <div className="mb-2">
            <p className={sectionTitle}>{isSigned ? "Approval Status" : "Authorize Estimate"}</p>
            <div className={`rounded-md border p-5 text-center ${isSigned ? "border-emerald-300 bg-emerald-50" : "border-[#e2e5e8]"}`}>
              <SignEstimateForm
                token={token ?? ""}
                signedValue={estimate.signature?.value ?? null}
                signedDate={estimate.signature?.date ?? null}
              />
            </div>
          </div>

          {/* FOOTER — same shape as the PDF's .footer */}
          <footer className="mt-10 pt-4 border-t border-[#e2e5e8] text-center text-[10px] text-gray-400 space-y-0.5">
            <p className="font-medium text-gray-600">{company.company_name} {company.company_phone ? `· ${company.company_phone}` : ""}</p>
            {company.footer_message && <p>{company.footer_message}</p>}
          </footer>

        </div>
      </main>
    </div>
  );
}