"use client";

/**
 * Customer-portal sharing: Copy Link, Send via SMS, and Email Customer.
 *
 * EMAIL DELIVERY works exactly like SMS below, for exactly the same
 * reasons: a `mailto:` URI opens the staff member's own mail client
 * with recipient, subject and body pre-filled, and they press send. No
 * credentials, no sending domain to warm up, no deliverability
 * surprises, and the customer replies to a real human address. Swapping
 * in a transactional provider later means replacing `buildMailtoHref`
 * with a POST — the same narrow seam.
 *
 * SMS DELIVERY — read this before adding Twilio.
 * This uses the `sms:` URI scheme, which opens the staff member's own
 * messaging app with the recipient and body pre-filled; they press
 * send. That is a deliberate choice, not a placeholder:
 *   * It works today, on the device people actually carry, with no
 *     credentials, no per-message cost, and no new secret to leak.
 *   * Messages come from the contractor's real number, so replies land
 *     where the customer expects.
 *   * Nothing is sent without a human seeing it first.
 * A server-side gateway (Twilio et al.) is a strictly additive change:
 * swap `buildSmsHref` for a POST to an API route and keep this
 * component's shape. The seam is deliberately narrow so that swap
 * touches one function.
 */
import { useState } from "react";
import { Copy, Check, MessageSquare, ExternalLink, Mail } from "lucide-react";

/** E.164-ish normalisation for the `sms:` target. Strips formatting;
 * assumes +1 for bare 10-digit US numbers, which is what this CRM
 * holds. Returns null when there's nothing dialable, so the caller can
 * disable the control rather than open an empty compose window. */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.length > 4 ? digits : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 7 ? digits : null;
}

/** `sms:` body separator differs by platform: iOS wants `&`, everything
 * else `?`. Detected rather than guessed so the body isn't silently
 * dropped on one of them. */
function buildSmsHref(phone: string, body: string): string {
  const isAppleDevice = typeof navigator !== "undefined" && /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent);
  return `sms:${phone}${isAppleDevice ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

/** Same contract as normalizePhone: trim, sanity-check, and return null
 * when there is nothing usable, so the caller disables the control
 * instead of opening a mail window addressed to nobody. Deliberately
 * permissive — this only decides whether to offer the button, and the
 * mail client validates for real. Rejecting an unusual-but-valid
 * address here would strand the user with no way to send. */
function normalizeEmail(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

/** `mailto:` with subject and body. Both must be percent-encoded, and
 * the body's line breaks have to survive as %0D%0A — encodeURIComponent
 * handles both, which is why the string is built with real newlines
 * rather than pre-escaped ones. */
function buildMailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Presentational only — what the panel PRINTS, never what it links to
 * or copies.
 *
 * The real link carries a UUID plus a long opaque token and runs well
 * past 100 characters, which made the panel look like a wall of
 * gibberish and put a credential on screen for anyone standing nearby.
 * This shows `host/portal/…` instead. The href, the clipboard payload
 * and the SMS/email bodies all still use the full URL: shortening the
 * ACTUAL url would need a lookup table or a new short-code column, and
 * both are out of scope here. */
function maskPortalUrl(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname.replace(/\/[^/]*$/, "/…")}`;
  } catch {
    return url;
  }
}

export function SharePortalPanel({
  portalUrl,
  clientName,
  clientPhone,
  clientEmail,
  documentLabel,
  companyName,
}: {
  portalUrl: string;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  documentLabel: string;
  companyName?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phone = normalizePhone(clientPhone);
  const email = normalizeEmail(clientEmail);
  const greeting = clientName ? `Hi ${clientName.split(" ")[0]}, ` : "Hi, ";
  const from = companyName ? ` from ${companyName}` : "";
  const smsBody = `${greeting}here's your ${documentLabel}${from}. You can review, approve, and download it here: ${portalUrl}`;

  // Email gets its own subject and a multi-line body — an inbox affords
  // structure an SMS does not. The link sits alone on its own line so
  // mail clients auto-link it cleanly and nothing wraps into it.
  const emailSubject = companyName
    ? `Your ${documentLabel} from ${companyName}`
    : `Your ${documentLabel}`;
  const emailBody = [
    clientName ? `Hi ${clientName.split(" ")[0]},` : "Hi,",
    "",
    `Here's your ${documentLabel}${from}. You can review it, approve it, and download a PDF from the link below — no login needed.`,
    "",
    portalUrl,
    "",
    "Please don't forward this link; anyone who has it can view and approve.",
    "",
    companyName ? `Thanks,\n${companyName}` : "Thanks",
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setError(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context and can be blocked — say so
      // instead of showing a false "Copied".
      setError("Couldn't copy automatically. Use the link below.");
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        A public page where {clientName ?? "the customer"} can review this {documentLabel}, approve it, and download PDFs — no login.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>

        {phone ? (
          <a
            href={buildSmsHref(phone, smsBody)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <MessageSquare className="size-3.5" /> Send via SMS
          </a>
        ) : (
          <span
            className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-60"
            title="This client has no phone number on file. Add one in the CRM to enable SMS."
          >
            <MessageSquare className="size-3.5" /> Send via SMS
          </span>
        )}

        {email ? (
          <a
            href={buildMailtoHref(email, emailSubject, emailBody)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Mail className="size-3.5" /> Email customer
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-60"
            title="This client has no email address on file. Add one in the CRM to enable email."
          >
            <Mail className="size-3.5" /> Email customer
          </span>
        )}

        <a
          href={portalUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <ExternalLink className="size-3.5" /> Preview
        </a>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {!phone && (
        <p className="text-xs text-muted-foreground">
          No phone number on file for this client — add one in the CRM to enable SMS.
        </p>
      )}
      {!email && (
        <p className="text-xs text-muted-foreground">
          No email available for this client — add one in the CRM to enable email.
        </p>
      )}
      {/* Masked for display; `title` and every action still carry the
          full URL. See maskPortalUrl. */}
      <p
        className="truncate rounded-lg bg-muted/50 px-2 py-1.5 font-mono text-[11px] text-muted-foreground"
        title={portalUrl}
      >
        {maskPortalUrl(portalUrl)}
      </p>
      <p className="text-xs text-muted-foreground">
        Anyone with this link can view and approve. Treat it like a password.
      </p>
    </div>
  );
}
