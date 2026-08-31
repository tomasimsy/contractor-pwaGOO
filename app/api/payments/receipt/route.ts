import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getResendClient, getFromAddress } from "@/lib/email/resendClient";
import { resolvePortalOrigin } from "@/lib/portalDomain";
import { getCompanySettingsByCompanyId, getCompanyProfileById } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/pdf/pdfLayout";
import { recordEmailSent } from "@/lib/email/emailTracking";

/**
 * "Payment received" receipt email — sent automatically once an
 * invoice's balance actually reaches zero, not on every payment (a
 * partial payment sends nothing).
 *
 * Called by InvoicePaymentsPanel.tsx right after paymentService.record()
 * succeeds (that write stays exactly as it was — a plain client-side
 * call — this route only does the side effect afterward). Deliberately
 * NOT put inside paymentService.ts itself: that file is shared with the
 * browser bundle (ServicesProvider.tsx constructs it client-side), and
 * Resend's send path pulls in server-only code the same way web-push
 * did for the "estimate signed" push notification — see
 * lib/push/sendPush.ts's header for the exact class of bug this avoids
 * repeating.
 *
 * Best-effort: recomputes the balance itself (never trusts the
 * caller's word that the invoice is paid off) and silently no-ops if
 * it isn't, if the client has no email on file, or if sending fails —
 * a receipt email must never be able to make a real, already-recorded
 * payment look like it failed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : "";
    if (!invoiceId) return NextResponse.json({ ok: false, error: "Missing invoiceId." }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: callerProfile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    const callerCompanyId = callerProfile?.company_id as string | undefined;
    if (!callerCompanyId) return NextResponse.json({ ok: false, error: "User has no company." }, { status: 400 });

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, company_id, invoice_number, estimate_id, client_id, profile_id, customer_token, total")
      .eq("id", invoiceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (invoiceError) return NextResponse.json({ ok: false, error: invoiceError.message }, { status: 500 });
    if (!invoice) return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
    if (invoice.company_id !== callerCompanyId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // Recomputed from real payment rows — same "never trust a
    // denormalized column" discipline PaymentService.getSummaryForInvoice
    // already follows.
    const { data: payments, error: paymentsError } = await supabase
      .from("invoice_payments")
      .select("amount")
      .eq("invoice_id", invoiceId)
      .is("deleted_at", null);
    if (paymentsError) return NextResponse.json({ ok: false, error: paymentsError.message }, { status: 500 });

    const total = Number(invoice.total) || 0;
    const totalPaid = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const remainingBalance = Math.max(0, total - totalPaid);

    // Not fully paid (yet) — a normal, expected outcome for most
    // payments, not an error.
    if (remainingBalance > 0) {
      return NextResponse.json({ ok: true, sent: false, reason: "not_fully_paid" });
    }

    if (!invoice.client_id) return NextResponse.json({ ok: true, sent: false, reason: "no_client" });
    const { data: client } = await supabase.from("clients").select("name, email").eq("id", invoice.client_id).maybeSingle();
    const clientEmail = client?.email?.trim();
    if (!clientEmail) return NextResponse.json({ ok: true, sent: false, reason: "no_client_email" });

    // "Estimate Number" per the requested email copy — falls back to
    // the invoice number for a standalone invoice with no estimate
    // (estimate_id is nullable; invoices don't all come from one).
    let documentNumber = invoice.invoice_number as string;
    let estimateCustomerToken: string | null = null;
    if (invoice.estimate_id) {
      const { data: estimate } = await supabase
        .from("estimates")
        .select("estimate_number, customer_token")
        .eq("id", invoice.estimate_id)
        .maybeSingle();
      if (estimate?.estimate_number) documentNumber = estimate.estimate_number;
      estimateCustomerToken = estimate?.customer_token ?? null;
    }

    // Same per-profile brand resolution sendEstimateEmail.ts already
    // uses — a profile-A invoice sends from A's address, profile-B
    // from B's, automatically.
    const company = await getCompanySettingsByCompanyId(supabase, invoice.company_id, invoice.profile_id);
    const unlessPlaceholder = (value: string | null | undefined) => (value && !value.startsWith("Add your") ? value : null);
    const companyEmail = unlessPlaceholder(company.company_email);
    const fromEmail = getFromAddress(companyEmail);
    const fromAddress = `${company.company_name} <${fromEmail}>`;
    // Same two-reasons-for-Bcc split as sendEstimateEmail.ts: a copy
    // to the sending mailbox itself (Resend/SES never touches that
    // mailbox's own SMTP), plus a separately configured extra
    // recipient (company.bcc_email — e.g. an office/accounting inbox).
    const bccAddresses = [fromEmail, company.bcc_email].filter((addr): addr is string => !!addr);

    // Same origin resolution (by Business Profile) sendEstimateEmail.ts
    // already uses for its own portal link — profile-A sends a
    // profile-A-branded link, profile-B a profile-B one.
    const origin = await resolvePortalOrigin(supabase, invoice.profile_id);
    // Prefer the customer portal page (the same branded page the
    // "Text the estimate link" feature already sends — shows the
    // signed estimate, invoice, and payment history together, not
    // just a bare PDF) — falls back to the invoice PDF only when
    // there's no linked estimate to have a portal page for at all
    // (invoice.estimateId is nullable; not every invoice comes from one).
    const pdfUrl = estimateCustomerToken
      ? `${origin}/portal/${estimateCustomerToken}`
      : invoice.customer_token
        ? `${origin}/api/invoices/${invoice.id}/pdf?customerToken=${encodeURIComponent(invoice.customer_token)}`
        : null;

    const paymentDate = formatDate(new Date().toISOString());
    // Customizable per Business Profile (Settings > Business Profiles >
    // Payment Receipt Message) — same "profile-only template, falls
    // back to a built-in default" shape as email_message_template for
    // estimate sends. Placeholders substituted here since this send is
    // fully automatic (no staff review step to fill them in, unlike
    // the estimate email's EmailCustomerModal).
    const profile = await getCompanyProfileById(supabase, invoice.profile_id);
    const messageBody = profile?.paymentReceiptMessageTemplate
      ? profile.paymentReceiptMessageTemplate
          .replaceAll("{clientName}", client?.name ?? "")
          .replaceAll("{amount}", formatCurrency(totalPaid))
          .replaceAll("{documentNumber}", documentNumber)
          .replaceAll("{paymentDate}", paymentDate)
      : `A payment of ${formatCurrency(totalPaid)} was received on ${paymentDate} for ${client?.name ?? ""} ${documentNumber}.`;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0; padding:0; background:#f4f5f6; font-family: Helvetica, Arial, sans-serif;">
        <div style="max-width: 560px; margin: 0 auto; padding: 32px 24px;">
          <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius: 10px; padding: 32px;">
            <div style="font-size: 13px; font-weight: 700; color: #111827; letter-spacing: 0.02em; margin-bottom: 24px;">
              ${company.company_name}
            </div>
            <div style="font-size: 14px; line-height: 1.6; color: #1f2429; white-space: pre-wrap;">
              ${messageBody}
            </div>
            ${
              pdfUrl
                ? `<div style="margin: 28px 0;">
                    <a href="${pdfUrl}" style="display: inline-block; background:#111827; color:#ffffff; text-decoration:none; font-weight:600; font-size:13px; padding: 12px 22px; border-radius: 8px;">
                      View Payment
                    </a>
                  </div>`
                : ""
            }
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #1f2429; line-height: 1.6;">
              If you have any questions or need further assistance, please do not hesitate to contact our support team by replying to this email.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const resend = getResendClient();
      const result = await resend.emails.send({
        from: fromAddress,
        replyTo: fromEmail,
        ...(bccAddresses.length > 0 ? { bcc: bccAddresses } : {}),
        to: clientEmail,
        subject: "Payment received",
        html: emailHtml,
      });
      if (result.error) {
        console.error("Resend rejected the payment receipt email:", result.error);
        return NextResponse.json({ ok: true, sent: false, reason: "send_failed" });
      }
      // Same estimate_emails tracking sendEstimateEmail.ts already
      // writes to, so this shows up in the estimate's own Email
      // History panel alongside the proposal email — estimate_id is
      // NOT NULL on that table, so only possible (and only attempted)
      // when this invoice actually has a linked estimate, same
      // condition the portal-link fallback above already checks.
      const resendEmailId = result.data?.id;
      if (invoice.estimate_id && resendEmailId) {
        await recordEmailSent(supabase, {
          companyId: invoice.company_id,
          estimateId: invoice.estimate_id,
          resendEmailId,
          toAddress: clientEmail,
          subject: "Payment received",
          createdBy: user.id,
        });
      }
    } catch (error) {
      console.error("Failed to send payment receipt email:", error);
      return NextResponse.json({ ok: true, sent: false, reason: "send_failed" });
    }

    return NextResponse.json({ ok: true, sent: true });
  } catch (error) {
    console.error("Payment receipt route failed:", error);
    // Never surface as a hard failure — the payment itself already
    // succeeded before this route was ever called.
    return NextResponse.json({ ok: true, sent: false, reason: "error" });
  }
}
