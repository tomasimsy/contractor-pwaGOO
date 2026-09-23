/**
 * Internal "a customer just signed" email — goes to the company, never
 * the customer. A backup channel to the push notification in
 * app/api/portal/sign/route.ts: push only reaches devices that opted in,
 * and can be missed (phone offline, browser blocked), while this lands in
 * a mailbox regardless.
 *
 * Recipient is whatever email is configured on the estimate's own
 * profile/company (same resolution sendEstimateEmail.ts uses for From),
 * plus the company's optional bcc_email. Server-only; never throws — a
 * failed notification must never affect the customer's signing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient, getFromAddress } from "@/lib/email/resendClient";
import { getCompanySettingsByCompanyId } from "@/lib/company";
import { formatCurrency } from "@/lib/pdf/pdfLayout";
import type { Estimate } from "@/lib/services/estimateService";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function sendEstimateSignedNotification(
  supabase: SupabaseClient,
  estimate: Estimate,
  appOrigin: string
): Promise<void> {
  try {
    const company = await getCompanySettingsByCompanyId(supabase, estimate.companyId, estimate.profileId);

    const unlessPlaceholder = (value: string | null | undefined) => (value && !value.startsWith("Add your") ? value : null);
    const companyEmail = unlessPlaceholder(company.company_email);
    // No configured address means nowhere sensible to send — skip
    // rather than fall through to EMAIL_FROM_ADDRESS as a recipient.
    if (!companyEmail) return;

    const recipients = [companyEmail, company.bcc_email].filter((a, i, all): a is string => !!a && all.indexOf(a) === i);

    let clientName = "The customer";
    if (estimate.clientId) {
      const { data: client } = await supabase.from("clients").select("name").eq("id", estimate.clientId).maybeSingle();
      const name = (client as { name?: string } | null)?.name?.trim();
      if (name) clientName = name;
    }

    const label = estimate.title || "An estimate";
    const number = estimate.estimateNumber ?? estimate.id.slice(0, 8);
    const link = `${appOrigin}/estimates/${estimate.id}`;
    const subject = `Estimate signed: ${label} (#${number})`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0; padding:0; background:#f4f5f6; font-family: Helvetica, Arial, sans-serif;">
        <div style="max-width: 560px; margin: 0 auto; padding: 32px 24px;">
          <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius: 10px; padding: 32px;">
            <div style="font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 16px;">Estimate signed</div>
            <div style="font-size: 14px; line-height: 1.6; color: #1f2429;">
              <strong>${escapeHtml(clientName)}</strong> just signed <strong>${escapeHtml(label)}</strong> (#${escapeHtml(String(number))}).
            </div>
            <div style="margin-top: 12px; font-size: 14px; color: #1f2429;">Total: <strong>${formatCurrency(estimate.total)}</strong></div>
            <div style="margin: 24px 0 0;">
              <a href="${link}" style="display: inline-block; background:#111827; color:#ffffff; text-decoration:none; font-weight:600; font-size:13px; padding: 12px 22px; border-radius: 8px;">Open estimate</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // From the verified sending address, NOT the recipient's: the
    // company email is where this goes TO and may be on a domain Resend
    // can't send from (e.g. a plain Gmail address — Resend rejects
    // unverified domains). EMAIL_FROM_ADDRESS is the one address known
    // to be verified; getFromAddress is only the unconfigured fallback.
    const from = process.env.EMAIL_FROM_ADDRESS || `${company.company_name} <${getFromAddress(companyEmail)}>`;
    const result = await getResendClient().emails.send({
      from,
      to: recipients,
      subject,
      html,
    });
    if (result.error) console.error("Resend rejected the estimate-signed notification:", result.error);
  } catch (err) {
    console.error("sendEstimateSignedNotification failed:", err instanceof Error ? err.message : err);
  }
}
