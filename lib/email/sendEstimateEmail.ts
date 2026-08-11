import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEstimateProposalData, renderEstimateProposalHtml } from "@/lib/pdf/estimateProposal";
import { pdfDocument } from "@/lib/pdf/pdfLayout";
import { htmlToPdfBuffer } from "@/lib/pdf/htmlToPdfBuffer";
import { getResendClient, getFromAddress } from "@/lib/email/resendClient";
import { recordEmailSent } from "@/lib/email/emailTracking";

export interface SendEstimateEmailInput {
  supabase: SupabaseClient;
  estimateId: string;
  /** The app's own origin (e.g. https://app.example.com) — used both
   * to build absolute photo URLs inside the attached PDF and to build
   * the customer portal link. Never trusted from the request; the
   * caller (the API route) supplies it from a trusted source. */
  origin: string;
  /** Overrides the client's stored email — lets staff redirect a send
   * to a different address without editing the client record. */
  to?: string;
  subject: string;
  /** Plain text, staff-edited. Line breaks preserved when rendered
   * into the email HTML. */
  message: string;
  /** Who's sending — attributed on the estimate_emails row. Null is
   * fine (matches every other createdBy in this codebase's actor
   * model); tracking a send is not worth failing over a missing actor. */
  actorUserId: string | null;
}

export type SendEstimateEmailResult =
  | { ok: true; emailId: string | null }
  | { ok: false; error: string };

/** Simple, safe-enough HTML escaping for the one thing we interpolate
 * that's genuinely free text (the staff-edited message). Everything
 * else in this template is either static copy or already-trusted
 * server data (company name, client name). */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(opts: {
  companyName: string;
  clientName: string;
  message: string;
  portalUrl: string;
  estimateNumber: string;
  footerMessage: string;
}): string {
  const messageHtml = escapeHtml(opts.message).replace(/\n/g, "<br>");
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0; padding:0; background:#f4f5f6; font-family: Helvetica, Arial, sans-serif;">
      <div style="max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius: 10px; padding: 32px;">
          <div style="font-size: 13px; font-weight: 700; color: #111827; letter-spacing: 0.02em; margin-bottom: 24px;">
            ${opts.companyName}
          </div>
          <div style="font-size: 14px; line-height: 1.6; color: #1f2429; white-space: normal;">
            ${messageHtml}
          </div>
          <div style="margin: 28px 0;">
            <a href="${opts.portalUrl}" style="display: inline-block; background:#111827; color:#ffffff; text-decoration:none; font-weight:600; font-size:13px; padding: 12px 22px; border-radius: 8px;">
              View Proposal Online
            </a>
          </div>
          <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
            The full proposal (#${opts.estimateNumber}) is also attached to this email as a PDF.
          </div>
        </div>
        <div style="text-align:center; margin-top: 20px; font-size: 11px; color: #9ca3af;">
          ${opts.footerMessage}
        </div>
      </div>
    </body>
    </html>
  `;
}

/** Default message body, prefilled in the "Email Customer" modal and
 * editable by staff before sending — never sent verbatim without a
 * human seeing it, same discipline SharePortalPanel's mailto flow
 * already follows for SMS/email. */
export function buildDefaultEstimateMessage(clientName: string, companyName: string): string {
  return `Hi ${clientName || "there"},\n\nThank you for the opportunity to work with you. Please find your proposal attached, and you can also view it online using the button below.\n\nIf you have any questions or would like to move forward, just reply to this email.\n\nBest regards,\n${companyName}`;
}

/**
 * Loads the estimate, renders the SAME proposal HTML the "Save as
 * PDF" button and the browser preview use, converts it to a real PDF,
 * and sends it via Resend with the customer portal link in the body.
 *
 * Returns a result object rather than throwing for expected failure
 * modes (missing client email, Resend API error) so the API route can
 * report a clean success/failure message — throws only for genuinely
 * unexpected errors, which the route's own try/catch handles.
 */
export async function sendEstimateEmail(input: SendEstimateEmailInput): Promise<SendEstimateEmailResult> {
  const data = await loadEstimateProposalData(input.supabase, input.estimateId, { origin: input.origin });
  if (!data) {
    return { ok: false, error: "Estimate not found." };
  }

  const recipient = input.to || data.client?.email;
  if (!recipient) {
    return { ok: false, error: "This client has no email address on file. Add one, or enter a recipient manually." };
  }

  if (!data.estimate.customer_token) {
    return { ok: false, error: "This estimate has no portal link yet. Re-save the estimate to generate one, then try again." };
  }
  const portalUrl = `${input.origin}/portal/${data.estimate.customer_token}`;

  const { docTitle, bodyHtml } = renderEstimateProposalHtml(data);
  const proposalHtml = pdfDocument({ docTitle, bodyHtml });

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await htmlToPdfBuffer(proposalHtml);
  } catch (error) {
    console.error("Failed to render estimate PDF for email:", error);
    return { ok: false, error: "Failed to generate the PDF attachment. Nothing was sent." };
  }

  const estimateNumber = data.estimate.estimate_number || data.estimate.id.slice(0, 8);
  const emailHtml = buildEmailHtml({
    companyName: data.company.company_name,
    clientName: data.client?.name || "",
    message: input.message,
    portalUrl,
    estimateNumber,
    footerMessage: data.company.footer_message,
  });

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: `${data.company.company_name} <${getFromAddress()}>`,
      to: recipient,
      subject: input.subject,
      html: emailHtml,
      attachments: [
        {
          filename: `Proposal-${estimateNumber}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (result.error) {
      console.error("Resend rejected the estimate email:", result.error);
      return { ok: false, error: result.error.message || "The email provider rejected this message." };
    }

    const resendEmailId = result.data?.id ?? null;
    if (resendEmailId) {
      await recordEmailSent(input.supabase, {
        companyId: data.estimate.company_id,
        estimateId: input.estimateId,
        resendEmailId,
        toAddress: recipient,
        subject: input.subject,
        createdBy: input.actorUserId,
      });
    }

    return { ok: true, emailId: resendEmailId };
  } catch (error) {
    console.error("Failed to send estimate email:", error);
    const message = error instanceof Error ? error.message : "Unknown error while sending.";
    return { ok: false, error: message };
  }
}
