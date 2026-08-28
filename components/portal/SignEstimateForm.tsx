"use client";

/**
 * The customer-portal signing control — the ONE interactive element in
 * an otherwise read-only portal.
 *
 * Reuses components/estimates/SignaturePad wholesale (the same draw/type
 * capture staff use); this file adds only the submit path. The write
 * goes through POST /api/portal/sign — a server-only route that
 * validates the token itself (same one-shot "refuses to overwrite an
 * existing signature" guard the old RPC had) and then runs the exact
 * same canonical signing workflow (lib/services/estimateWorkflow.ts)
 * staff use, instead of a second, SQL-only implementation of what
 * signing does. See that route's header for the full architecture.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignaturePad } from "@/components/estimates/SignaturePad";

export function SignEstimateForm({ token, signedValue, signedDate }: { token: string; signedValue: string | null; signedDate: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // router.refresh() doesn't resolve when the re-render actually
  // lands — it's fire-and-forget. Without this, there was a real gap
  // after a successful save where the modal had already closed but
  // the page hadn't yet re-fetched `signedValue`, so a customer could
  // briefly see the "Sign & Approve" button again right after signing
  // and reasonably wonder if it worked. This shows the confirmed
  // state immediately, from the same POST response, no round-trip wait.
  const [justSigned, setJustSigned] = useState(false);

  if (signedValue || justSigned) {
    // `signedValue` only exists once the server round-trip
    // (router.refresh()) has actually landed — until then, justSigned
    // alone is true and there's nothing to render a checkmark/image
    // from yet, so this shows a plain confirmation instead of guessing
    // at signature content that hasn't arrived.
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed &amp; Approved</p>
        <p className="mt-2 text-xl font-semibold text-foreground">{!signedValue ? "✓" : signedValue.startsWith("data:image") ? "✓" : signedValue}</p>
        {signedValue?.startsWith("data:image") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedValue} alt="Your signature" className="mx-auto mt-1 max-h-20" />
        )}
        {signedDate && <p className="mt-2 text-xs text-muted-foreground">Signed {new Date(signedDate).toLocaleDateString()}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          {/* Thank you. This estimate is approved — no further action is needed. Contact us if anything looks wrong. */}
        </p>
      </div>
    );
  }

  async function handleSign(signature: { type: "draw" | "type"; value: string; date: string }): Promise<{ ok: boolean; message?: string }> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signatureType: signature.type, signatureValue: signature.value }),
      });
      const result = await res.json();
      if (!result.ok) {
        // The route returns a generic rejection for every failure case
        // (bad token, already signed, no longer open) without saying
        // which — deliberately, so it can't be used to probe. Reloading
        // shows the true state.
        const message = result.message ?? "This estimate could not be signed.";
        setError(`${message} Refreshing…`);
        setTimeout(() => router.refresh(), 1500);
        return { ok: false, message };
      }
      // Immediate, local confirmation — see justSigned's own comment.
      // router.refresh() still runs to pull the real persisted
      // signature/date in behind it.
      setJustSigned(true);
      router.refresh();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save your signature. Please try again.";
      setError(message);
      return { ok: false, message };
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      <p className="text-xs text-muted-foreground">
        By signing you approve this estimate and the scope and pricing shown above.
      </p>
      <SignaturePad
        onSave={handleSign}
        existingSignature={null}
        showRemoveButton={false}
        buttonText={saving ? "Saving…" : "Sign & Approve"}
      />
    </div>
  );
}
