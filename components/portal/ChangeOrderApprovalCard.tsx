"use client";

/**
 * One Change Order card in the customer portal — separate cards, one
 * per change order, per the "keep the UI simple" requirement, rather
 * than a single table (this app's convention for anything a customer
 * needs to individually understand/act on — matches how invoices are
 * already rendered as separate cards on this same page).
 *
 * Pending: shows a Review & Approve control (reuses SignaturePad
 * wholesale, exactly like SignEstimateForm does for the estimate
 * itself). Approved/Rejected: read-only — no controls rendered at all,
 * so an approved change order cannot be re-submitted from here.
 *
 * The write goes through POST /api/portal/change-orders/[id]/approve —
 * a server-only route that validates the token itself and then runs
 * the exact same canonical approval workflow
 * (lib/services/changeOrderWorkflow.ts) staff use. See that route's
 * header for the full architecture.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignaturePad } from "@/components/estimates/SignaturePad";

export interface PortalChangeOrder {
  id: string;
  change_order_number?: string;
  title?: string;
  description?: string | null;
  status?: string;
  total_amount?: number;
  tax?: number;
  approved_at?: string | null;
  signature?: { type?: string; value?: string; date?: string } | null;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground",
  approved: "bg-success/15 text-success",
  rejected: "bg-danger/15 text-danger",
  cancelled: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  invoiced: "bg-success/15 text-success",
};

export function ChangeOrderApprovalCard({ token, changeOrder }: { token: string; changeOrder: PortalChangeOrder }) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Same reasoning as SignEstimateForm's justSigned — router.refresh()
  // doesn't resolve when its re-render actually lands. Without this,
  // a successful approval closed the signature modal but `reviewing`
  // was still true, so the card would show the blank "Review &
  // Approve" form again until the refresh caught up — looking exactly
  // like nothing had happened.
  const [justApproved, setJustApproved] = useState(false);

  const status = justApproved ? "approved" : changeOrder.status ?? "pending";
  const costImpact = (changeOrder.total_amount ?? 0) + (changeOrder.tax ?? 0);
  const isPending = status === "pending";

  async function handleApprove(signature: { type: "draw" | "type"; value: string; date: string }): Promise<{ ok: boolean; message?: string }> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/change-orders/${changeOrder.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signatureType: signature.type, signatureValue: signature.value }),
      });
      const result = await res.json();
      if (!result.ok) {
        const message = result.message ?? "This change order could not be approved.";
        setError(`${message} Refreshing…`);
        setTimeout(() => router.refresh(), 1500);
        return { ok: false, message };
      }
      setJustApproved(true);
      setReviewing(false);
      router.refresh();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save your approval. Please try again.";
      setError(message);
      return { ok: false, message };
    } finally {
      setSaving(false);
    }
  }

  return (
    // Flat row with a hairline bottom border — matches every other list
    // in the portal now (Scope Items, invoices) instead of its own
    // bordered/padded "card" look, which read as oversized next to the
    // rest of the page once that page switched to a document style.
    <div className="py-1.5 border-b border-[#eef0f2] text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-semibold text-[#1f2429]">{changeOrder.change_order_number}</span>
          {changeOrder.title && <span className="text-gray-500 truncate">· {changeOrder.title}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-semibold text-[#1f2429]">{money(costImpact)}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${STATUS_STYLE[status] ?? STATUS_STYLE.draft}`}>
            {status}
          </span>
        </div>
      </div>

      {changeOrder.description && (
        <p className="mt-0.5 text-gray-500 line-clamp-1">{changeOrder.description}</p>
      )}

      {status === "approved" && changeOrder.approved_at && (
        <div className="mt-0.5 text-gray-400">
          Approved {new Date(changeOrder.approved_at).toLocaleDateString()}
        </div>
      )}

      {isPending && (
        <div className="mt-1.5">
          {!reviewing ? (
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="inline-flex h-6 items-center rounded border border-[#1f2429] px-2 text-[10.5px] font-medium text-[#1f2429] hover:bg-gray-50"
            >
              Review &amp; Approve
            </button>
          ) : (
            <div className="space-y-1.5 pt-1">
              {error && <div className="rounded bg-red-50 px-2 py-1 text-[10.5px] text-red-700">{error}</div>}
              <p className="text-gray-500">
                Approve change order and {money(costImpact)} impact by signing below.
              </p>
              <SignaturePad
                onSave={handleApprove}
                existingSignature={null}
                showRemoveButton={false}
                buttonText={saving ? "Saving…" : "Sign & Approve"}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
