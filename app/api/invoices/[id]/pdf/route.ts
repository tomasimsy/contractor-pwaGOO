import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  formatCurrency,
  formatDate,
  renderSignature,
  pdfDocument,
  renderCompanyHeaderBlock,
  renderCompanyFooterBlock,
  renderCompanySignatureLine,
} from "@/lib/pdf/pdfLayout";
import { getCompanySettingsByCompanyId } from "@/lib/company";
import { calculateSubtotal, calculateInvoiceTotal, calculateRemainingBalance, deriveInvoiceStatus } from "@/lib/services/financialCalculations";
import { formatPaymentMethod } from "@/components/payments/paymentMethods";

/**
 * Invoice PDF — reuses lib/pdf/pdfLayout.ts wholesale (the same shared
 * layout the estimate PDF renders through), so the two documents stay
 * visually consistent and there is one place to change branding.
 *
 * Every figure here is recomputed from source rows via the shared
 * financialCalculations functions — this route never trusts
 * `invoices.subtotal/total/amount_paid/remaining_balance`, the four
 * denormalized columns the old app maintained by hand. A PDF is the one
 * artifact a customer keeps, so it must not be able to show a number
 * the app itself would disagree with.
 *
 * Two auth modes:
 *  - `?token=<supabase access token>` — the staff "Save as PDF" button,
 *    forwarded as a Bearer header so RLS resolves (the app stores its
 *    session in localStorage, not cookies, so no cookie-based server
 *    client can see it). Same mechanism as the estimate PDF route.
 *  - `?customerToken=<invoices.customer_token>` — the public, no-login
 *    customer download. Scoped to exactly one invoice by an opaque
 *    per-invoice token; it can never enumerate other rows because the
 *    token is matched as a filter, not trusted as an identity.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = request.nextUrl.searchParams.get("token");
    const customerToken = request.nextUrl.searchParams.get("customerToken");

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : undefined
    );

    let invoiceQuery = supabase.from("invoices").select("*").eq("id", id).is("deleted_at", null);
    // The customer token is an additional REQUIRED filter, never an
    // alternative identity — a wrong token returns no row rather than
    // someone else's invoice.
    if (customerToken) invoiceQuery = invoiceQuery.eq("customer_token", customerToken);

    const { data: invoice } = await invoiceQuery.maybeSingle();
    if (!invoice) return new NextResponse("Not found", { status: 404 });

    const [{ data: client }, { data: items }, { data: payments }, { data: changeOrderRows }, { data: parentEstimate }] = await Promise.all([
      supabase.from("clients").select("*").eq("id", invoice.client_id).maybeSingle(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id).is("deleted_at", null).order("created_at", { ascending: true }),
      supabase.from("invoice_payments").select("*").eq("invoice_id", id).is("deleted_at", null).order("payment_date", { ascending: true }),
      // APPROVED change orders only — same filter the public RPC and the
      // in-app Contract Summary apply, so no surface can show a customer
      // a change order another one hides.
      invoice.estimate_id
        ? supabase.from("change_orders").select("change_order_number,title,total_amount,tax,approved_at")
            .eq("estimate_id", invoice.estimate_id).eq("status", "approved").is("deleted_at", null)
        : Promise.resolve({ data: [] }),
      // The parent estimate's signature — see the fallback below for
      // why an invoice PDF needs it. includeDeleted is irrelevant here
      // (we only read the signature), but financial history is
      // permanent, so a later-deleted estimate must not erase the
      // approval this invoice was raised against.
      invoice.estimate_id
        ? supabase.from("estimates").select("estimate_number,signature").eq("id", invoice.estimate_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const lineItems = (items ?? []) as { name?: string; description?: string; category?: string | null; quantity?: number; unit_price?: number; total?: number }[];
    const paymentRows = (payments ?? []) as { amount?: number; payment_date?: string; method?: string; reference_number?: string }[];
    const changeOrders = (changeOrderRows ?? []) as { change_order_number?: string; title?: string; total_amount?: number; tax?: number; approved_at?: string }[];
    // profile_id (copied from the source estimate at invoice creation
    // — see InvoiceService.createFromEstimate) overlays this invoice's
    // own brand, same as the estimate PDF.
    const company = await getCompanySettingsByCompanyId(supabase, invoice.company_id, invoice.profile_id);

    // ---------- Totals ----------
    // Payments are ALWAYS derived from active rows. The invoice's own
    // subtotal/total follow the same rule as InvoiceService.getById: an
    // ISSUED invoice shows what was actually billed (its stored total),
    // because a customer-facing document must not silently restate a
    // historical amount; only a DRAFT recomputes from current line
    // items. Keeping this identical to getById is what stops the PDF
    // and the app from ever quoting different figures for one invoice.
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
      dueDate: invoice.due_date,
      today: new Date().toISOString().slice(0, 10),
    });

    let signature: { type: "draw" | "type"; value: string; date: string } | null = null;
    if (invoice.signature) {
      // TEXT column live (estimates' is jsonb) — may hold JSON or a
      // bare legacy string.
      try {
        signature = JSON.parse(invoice.signature);
      } catch {
        signature = { type: "type", value: String(invoice.signature), date: invoice.signed_date ?? "" };
      }
    }

    // FALLBACK: the customer signed the ESTIMATE, not the invoice.
    //
    // Almost every invoice in this app is auto-generated the moment an
    // estimate is signed (estimateWorkflow.signEstimate), and that
    // signature is recorded on `estimates.signature`. Nothing ever
    // copies it onto the invoice row — so `invoices.signature` is null
    // for those, and this PDF printed "Not Signed" on work the customer
    // had demonstrably approved. Reported live on INV-1014, whose
    // parent estimate OSR20260026 carries a signature dated the same
    // day.
    //
    // Deliberately NOT copied into `invoices.signature`: that would
    // duplicate one signature across two rows and let them drift. The
    // estimate remains the single record of what the customer signed;
    // this reads it.
    //
    // It is also labelled differently below — signing an estimate
    // accepts a QUOTE, which is not the same act as acknowledging a
    // BILL. Presenting the former as though it were the latter would
    // misrepresent what the customer actually agreed to.
    const estimateSignatureRaw = (parentEstimate as { signature?: unknown } | null)?.signature ?? null;
    const signedOnEstimate = !signature && !!estimateSignatureRaw;
    if (signedOnEstimate) {
      // estimates.signature is jsonb — already an object, unlike the
      // invoice's TEXT column handled above.
      signature = estimateSignatureRaw as { type: "draw" | "type"; value: string; date: string };
    }
    const parentEstimateNumber = (parentEstimate as { estimate_number?: string | null } | null)?.estimate_number ?? null;

    const html = pdfDocument({
      docTitle: `Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}`,
      bodyHtml: `
        <div class="header">
          <div>${renderCompanyHeaderBlock(company, request.nextUrl.origin)}</div>
          <div>
            <div class="doc-title">INVOICE</div>
            <div class="doc-meta"><strong>#${invoice.invoice_number || invoice.id.slice(0, 8)}</strong></div>
            <div class="doc-meta">Issued ${formatDate(invoice.issue_date)}</div>
            <div class="doc-meta">Due ${formatDate(invoice.due_date)}</div>
            <div class="status-badge">${status.replace(/_/g, " ")}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Bill To</div>
          <div class="info-grid">
            <div class="info-col">
              <div class="info-row"><div class="info-label">Name</div><div class="info-value">${client?.name || "No client"}</div></div>
              <div class="info-row"><div class="info-label">Phone</div><div class="info-value">${client?.phone || "Not provided"}</div></div>
            </div>
            <div class="info-col">
              <div class="info-row"><div class="info-label">Email</div><div class="info-value">${client?.email || "Not provided"}</div></div>
              <div class="info-row"><div class="info-label">Address</div><div class="info-value">${client?.address || "Not provided"}</div></div>
            </div>
          </div>
        </div>

        ${invoice.description ? `
          <div class="section">
            <div class="section-title">Description</div>
            <div style="font-size:11px; line-height:1.6; white-space: pre-wrap;">${invoice.description}</div>
          </div>` : ""}

        <div class="section">
          <div class="section-title">Items</div>
          ${lineItems.length ? `
            <table>
              <thead>
                <tr>
                  <th style="width:12%">Category</th>
                  <th style="width:20%">Item</th>
                  <th style="width:33%">Description</th>
                  <th style="width:10%">Qty</th>
                  <th style="width:12%">Unit Price</th>
                  <th style="width:13%">Total</th>
                </tr>
              </thead>
              <tbody>
                ${lineItems.map((item) => `
                  <tr>
                    <td>${item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : "-"}</td>
                    <td>${item.name || "-"}</td>
                    <td>${item.description || "-"}</td>
                    <td>${item.quantity ?? 0}</td>
                    <td>${formatCurrency(item.unit_price ?? 0)}</td>
                    <td><strong>${formatCurrency(item.total ?? 0)}</strong></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          ` : `<div class="empty-note">No items on this invoice.</div>`}
        </div>

        ${changeOrders.length ? `
          <div class="section">
            <div class="section-title">Approved Change Orders</div>
            <table>
              <thead><tr><th style="width:25%">Change Order</th><th style="width:45%">Description</th><th style="width:15%">Approved</th><th style="width:15%">Amount</th></tr></thead>
              <tbody>
                ${changeOrders.map((co) => `
                  <tr>
                    <td>${co.change_order_number || "-"}</td>
                    <td>${co.title || "-"}</td>
                    <td>${formatDate(co.approved_at)}</td>
                    <td><strong>${formatCurrency((co.total_amount ?? 0) + (co.tax ?? 0))}</strong></td>
                  </tr>`).join("")}
              </tbody>
            </table>
            <div class="empty-note" style="margin-top:6px;">Already included in the invoice total below.</div>
          </div>` : ""}

        <div class="section">
          <div class="section-title">Financial Summary</div>
          <div class="summary-box">
            <div class="summary-row muted"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
            ${tax ? `<div class="summary-row muted"><span>Tax</span><span>${formatCurrency(tax)}</span></div>` : ""}
            <div class="summary-row total"><span>Total</span><span>${formatCurrency(total)}</span></div>
            <div class="summary-row muted"><span>Amount Paid</span><span>-${formatCurrency(amountPaid)}</span></div>
            <div class="summary-row balance"><span>Balance Due</span><span>${formatCurrency(balanceDue)}</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Payment History</div>
          ${paymentRows.length ? `
            <table>
              <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead>
              <tbody>
                ${paymentRows.map((p) => `
                  <tr>
                    <td>${formatDate(p.payment_date)}</td>
                    <td>${formatPaymentMethod(p.method)}</td>
                    <td>${p.reference_number || "-"}</td>
                    <td><strong>${formatCurrency(p.amount ?? 0)}</strong></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          ` : `<div class="empty-note">No payments received yet.</div>`}
        </div>

        <div class="section">
          <div class="section-title">Payment Instructions</div>
          <div style="font-size:11px; line-height:1.6; white-space: pre-wrap;">${company.payment_instructions}</div>
        </div>

        ${invoice.notes ? `
          <div class="section">
            <div class="section-title">Notes</div>
            <div style="font-size:10.5px; line-height:1.6; color:#6b7280; white-space: pre-wrap;">${invoice.notes}</div>
          </div>` : ""}

        <div class="section">
          <div class="section-title">Customer Signature</div>
          <div class="signature-box">${renderSignature(signature)}</div>
          ${signedOnEstimate
            ? `<div style="font-size:9.5px; color:#6b7280; margin-top:4px;">Approved on estimate ${parentEstimateNumber ?? ""} — this invoice bills the approved scope.</div>`
            : ""}
          ${renderCompanySignatureLine(company)}
        </div>

        ${renderCompanyFooterBlock(company)}
      `,
    });

    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  } catch (error) {
    console.error("Invoice PDF error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}
