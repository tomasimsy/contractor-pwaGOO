"use client";

/**
 * Customer-portal sharing: Copy Link and Send via SMS.
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
import { Copy, Check, MessageSquare, ExternalLink } from "lucide-react";

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

export function SharePortalPanel({
  portalUrl,
  clientName,
  clientPhone,
  documentLabel,
  companyName,
}: {
  portalUrl: string;
  clientName: string | null;
  clientPhone: string | null;
  documentLabel: string;
  companyName?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phone = normalizePhone(clientPhone);
  const greeting = clientName ? `Hi ${clientName.split(" ")[0]}, ` : "Hi, ";
  const from = companyName ? ` from ${companyName}` : "";
  const smsBody = `${greeting}here's your ${documentLabel}${from}. You can review, approve, and download it here: ${portalUrl}`;

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
      <p className="break-all rounded-lg bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">{portalUrl}</p>
      <p className="text-xs text-muted-foreground">
        Anyone with this link can view and approve. Treat it like a password.
      </p>
    </div>
  );
}
