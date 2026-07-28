"use client";

/**
 * The customer-portal signing control — the ONE interactive element in
 * an otherwise read-only portal.
 *
 * Reuses components/estimates/SignaturePad wholesale (the same draw/type
 * capture staff use); this file adds only the submit path. The write
 * itself goes through the token-scoped `sign_estimate_via_token` RPC,
 * never a direct table write: the database refuses to overwrite an
 * existing signature, so a forwarded link cannot be used to replace a
 * genuine agreement.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";
import { SignaturePad } from "@/components/estimates/SignaturePad";

export function SignEstimateForm({ token, signedValue, signedDate }: { token: string; signedValue: string | null; signedDate: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (signedValue) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed &amp; Approved</p>
        <p className="mt-2 text-xl font-semibold text-foreground">{signedValue.startsWith("data:image") ? "✓" : signedValue}</p>
        {signedValue.startsWith("data:image") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedValue} alt="Your signature" className="mx-auto mt-1 max-h-20" />
        )}
        {signedDate && <p className="mt-2 text-xs text-muted-foreground">Signed {new Date(signedDate).toLocaleDateString()}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Thank you. This estimate is approved — no further action is needed. Contact us if anything looks wrong.
        </p>
      </div>
    );
  }

  async function handleSign(signature: { type: "draw" | "type"; value: string; date: string }) {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error: rpcError } = await supabase.rpc("sign_estimate_via_token", {
        p_token: token,
        p_signature_type: signature.type,
        p_signature_value: signature.value,
      });
      if (rpcError) throw new Error(rpcError.message);
      if (!data) {
        // The RPC returns NULL for every rejection (bad token, already
        // signed, converted) without saying which — deliberately, so it
        // can't be used to probe. Reloading shows the true state.
        setError("This estimate could not be signed. It may already be signed or no longer be open. Refreshing…");
        setTimeout(() => router.refresh(), 1500);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your signature. Please try again.");
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
