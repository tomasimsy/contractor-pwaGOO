"use client";

/**
 * Capturing a signature is pure input collection + a single service
 * call — no business logic (no status-transition rule, no "what
 * happens when signed" cascade) lives here. EstimateService.
 * recordSignature owns whatever else needs to happen when an estimate
 * is signed.
 */
import { useState } from "react";
import { useServices } from "../../lib/services-context";
import type { Estimate } from "../../lib/services";

export function SignaturePanel({ estimate, onSigned }: { estimate: Estimate; onSigned: (updated: Estimate) => void }) {
  const { estimateService } = useServices();
  const [typedName, setTypedName] = useState("");
  const [saving, setSaving] = useState(false);

  if (estimate.signature) {
    return <p className="text-sm text-green-700">Signed by &ldquo;{estimate.signature.value}&rdquo; on {estimate.signature.date}</p>;
  }

  return (
    <div className="space-y-2">
      <input placeholder="Type your name to sign" value={typedName} onChange={(e) => setTypedName(e.target.value)} />
      <button
        type="button"
        disabled={!typedName || saving}
        onClick={async () => {
          setSaving(true);
          try {
            const updated = await estimateService.recordSignature(estimate.id, {
              type: "type",
              value: typedName,
              date: new Date().toISOString(),
            });
            onSigned(updated);
          } finally {
            setSaving(false);
          }
        }}
      >
        Sign estimate
      </button>
    </div>
  );
}
