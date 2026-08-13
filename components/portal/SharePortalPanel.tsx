"use client";

import { useState } from "react";
import { Copy, Check, MessageSquare, ExternalLink } from "lucide-react";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.length > 4 ? digits : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 7 ? digits : null;
}

function buildSmsHref(phone: string, body: string): string {
  const isAppleDevice = typeof navigator !== "undefined" && /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent);
  return `sms:${phone}${isAppleDevice ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

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
      setError("Couldn't copy automatically. Use the link below.");
    }
  }

  return (
    <div className="space-y-1.5">
      {/* Action buttons - super compact */}
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-5 items-center justify-center gap-0.5 rounded border border-emerald-200 bg-white px-1.5 text-[9px] font-medium text-emerald-700 hover:bg-emerald-50"
        >
          {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>

        {phone ? (
          <a
            href={buildSmsHref(phone, smsBody)}
            className="inline-flex h-5 items-center justify-center gap-0.5 rounded bg-emerald-600 px-1.5 text-[9px] font-medium text-white hover:bg-emerald-700"
          >
            <MessageSquare className="size-2.5" /> SMS
          </a>
        ) : (
          <span
            className="inline-flex h-5 cursor-not-allowed items-center justify-center gap-0.5 rounded border border-emerald-200 bg-emerald-50/50 px-1.5 text-[9px] font-medium text-emerald-400"
            title="No phone number on file"
          >
            <MessageSquare className="size-2.5" /> SMS
          </span>
        )}

        <a
          href={portalUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-5 items-center justify-center gap-0.5 rounded border border-emerald-200 bg-white px-1.5 text-[9px] font-medium text-emerald-700 hover:bg-emerald-50"
        >
          <ExternalLink className="size-2.5" /> Preview
        </a>
      </div>

      {/* URL display - super compact */}
      <div className="rounded bg-emerald-50/70 px-1.5 py-0.5">
        <p
          className="truncate font-mono text-[9px] text-emerald-700"
          title={portalUrl}
        >
          {maskPortalUrl(portalUrl)}
        </p>
      </div>

      {error && (
        <p className="text-[9px] text-rose-600">{error}</p>
      )}
      
      {!phone && (
        <p className="text-[8px] text-emerald-600/50">
          No phone on file
        </p>
      )}
    </div>
  );
}