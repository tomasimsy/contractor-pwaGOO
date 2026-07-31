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

  const status = changeOrder.status ?? "pending";
  const costImpact = (changeOrder.total_amount ?? 0) + (changeOrder.tax ?? 0);
  const isPending = status === "pending";

  async function handleApprove(signature: { type: "draw" | "type"; value: string; date: string }) {
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
        setError((result.message ?? "This change order could not be approved.") + " Refreshing…");
        setTimeout(() => router.refresh(), 1500);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your approval. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-foreground">{changeOrder.change_order_number}</div>
          {changeOrder.title && <div className="text-xs text-muted-foreground">{changeOrder.title}</div>}
        </div>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[status] ?? STATUS_STYLE.draft}`}>
          {status}
        </span>
      </div>

      {changeOrder.description && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{changeOrder.description}</p>
      )}

      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Cost impact</span>
        <span className="font-semibold text-foreground">{money(costImpact)}</span>
      </div>

      {status === "approved" && changeOrder.approved_at && (
        <p className="mt-2 text-xs text-muted-foreground">
          Approved {new Date(changeOrder.approved_at).toLocaleDateString()}
          {changeOrder.signature?.value ? " · signed by you" : ""}
        </p>
      )}

      {isPending && (
        <div className="mt-3 border-t border-border pt-3">
          {!reviewing ? (
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Review &amp; Approve
            </button>
          ) : (
            <div className="space-y-2">
              {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
              <p className="text-xs text-muted-foreground">
                By signing you approve this change order and its {money(costImpact)} cost impact.
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
