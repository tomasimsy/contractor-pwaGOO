"use client";

/**
 * "Email Customer" — sends the estimate PDF via Resend, through
 * app/api/estimates/[id]/send-email/route.ts. Distinct from
 * SharePortalPanel's mailto "Email" button (components/portal/
 * SharePortalPanel.tsx), which just opens the staff member's own mail
 * client with no attachment — this is the real transactional send,
 * with a PDF attached and delivery reported back to the UI.
 *
 * Subject/message are always staff-edited before sending, never sent
 * verbatim from a hardcoded template — same discipline as the mailto
 * flow, just with an actual send button instead of a mail client
 * hand-off.
 */
import { useEffect, useState } from "react";
import { X, Mail, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export interface EmailCustomerModalProps {
  open: boolean;
  onClose: () => void;
  /** Called once the send actually succeeds — lets the parent refresh
   * the Email History panel without this modal knowing that panel
   * exists. */
  onSent?: () => void;
  estimateId: string;
  estimateNumber: string;
  clientName: string;
  clientEmail: string | null;
  companyName: string;
  hasPortalLink: boolean;
}

function buildDefaultMessage(clientName: string, companyName: string): string {
  return `Hi ${clientName || "there"},\n\nThank you for the opportunity to work with you. Please find
   your proposal attached, and you can also view it online using the button in this email.
   \n\nIf you have any questions or would like to move forward, just sign the proposal by clicking the link.
   \n\nBest regards,\n${companyName}`;
   
}

type SendState = { status: "idle" } | { status: "sending" } | { status: "success" } | { status: "error"; message: string };

export function EmailCustomerModal({
  open,
  onClose,
  onSent,
  estimateId,
  estimateNumber,
  clientName,
  clientEmail,
  companyName,
  hasPortalLink,
}: EmailCustomerModalProps) {
  const [to, setTo] = useState(clientEmail ?? "");
  const [subject, setSubject] = useState(`Your Proposal from ${companyName} — #${estimateNumber}`);
  const [message, setMessage] = useState(buildDefaultMessage(clientName, companyName));
  const [state, setState] = useState<SendState>({ status: "idle" });

  // Reset to fresh defaults every time the modal is (re)opened, so a
  // previous send's success/error state never lingers into the next one.
  useEffect(() => {
    if (open) {
      setTo(clientEmail ?? "");
      setSubject(`Your Proposal from ${companyName} — #${estimateNumber}`);
      setMessage(buildDefaultMessage(clientName, companyName));
      setState({ status: "idle" });
    }
  }, [open, clientEmail, companyName, estimateNumber, clientName]);

  if (!open) return null;

  const canSend = to.trim().length > 0 && subject.trim().length > 0 && message.trim().length > 0 && hasPortalLink && state.status !== "sending";

  async function handleSend() {
    setState({ status: "sending" });
    try {
      const res = await fetch(`/api/estimates/${estimateId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), message }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Unexpected response from the server." }));
      if (!res.ok || !data.ok) {
        setState({ status: "error", message: data.error || "Failed to send the email." });
        return;
      }
      setState({ status: "success" });
      onSent?.();
    } catch {
      setState({ status: "error", message: "Network error — the email was not sent. Check your connection and try again." });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Email customer">
      <div className="w-full max-w-lg rounded-xl bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Email Customer</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {!hasPortalLink && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              This estimate has no portal link yet. Re-save it, then try again.
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="email-to">
              To
            </label>
            <input
              id="email-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@example.com"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            {!clientEmail && <p className="mt-1 text-[11px] text-muted-foreground">No email on file for this client — enter one manually.</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="email-subject">
              Subject
            </label>
            <input
              id="email-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="email-message">
              Message
            </label>
            <textarea
              id="email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              The proposal PDF is attached automatically, and a link to view it online is added below your message.
            </p>
          </div>

          {state.status === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {state.message}
            </div>
          )}
          {state.status === "success" && (
            <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-xs text-green-800">
              <CheckCircle2 className="size-3.5 shrink-0" />
              Email sent to {to}.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
            {state.status === "success" ? "Close" : "Cancel"}
          </button>
          {state.status !== "success" && (
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {state.status === "sending" ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
              {state.status === "sending" ? "Sending…" : "Send Email"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
