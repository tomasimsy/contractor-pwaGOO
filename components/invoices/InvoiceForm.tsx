"use client";

/**
 * Invoice Create/Edit — line items only. Totals (subtotal/tax/total)
 * are whatever InvoiceService.createStandalone/updateLineItems return;
 * this component never adds them up itself. Editing is blocked once
 * `isLocked` is true — the button disables rather than the form
 * pretending edits still work.
 */
import { useState } from "react";
import { useServices } from "../../lib/services-context";
import type { Invoice, InvoiceLineItem } from "../../lib/services";

type DraftItem = Omit<InvoiceLineItem, "id" | "total">;

export function InvoiceForm({
  companyId,
  projectId,
  clientId,
  invoice,
  onSaved,
}: {
  companyId: string;
  projectId: string;
  clientId: string | null;
  invoice: (Invoice & { lineItems: InvoiceLineItem[] }) | null;
  onSaved: (invoice: Invoice) => void;
}) {
  const { invoiceService } = useServices();
  const [items, setItems] = useState<DraftItem[]>(invoice?.lineItems.map(({ id, total, ...rest }) => rest) ?? []);
  const [draft, setDraft] = useState<DraftItem>({ name: "", description: "", quantity: 1, unitPrice: 0 });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const locked = invoice?.isLocked ?? false;

  return (
    <div className="space-y-4 max-w-xl">
      <ul className="divide-y">
        {items.map((item, i) => (
          <li key={i} className="flex justify-between py-2">
            <span>{item.name} — {item.quantity} × ${item.unitPrice.toFixed(2)}</span>
            {!locked && (
              <button type="button" className="text-red-600" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {!locked && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input type="number" placeholder="Qty" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })} />
          <input type="number" placeholder="Unit price" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) })} />
          <button type="button" onClick={() => { setItems((prev) => [...prev, draft]); setDraft({ name: "", description: "", quantity: 1, unitPrice: 0 }); }}>
            Add item
          </button>
        </div>
      )}

      {locked && <p className="text-sm text-gray-500">This invoice is locked (signed) — create a new invoice for further billing.</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="button"
        disabled={saving || locked}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            if (invoice) {
              const result = await invoiceService.updateLineItems(invoice.id, items);
              if (!result.valid) {
                setError(result.issues.map((i) => i.message).join("; "));
                return;
              }
              if (result.invoice) onSaved(result.invoice);
            } else {
              const today = new Date().toISOString().slice(0, 10);
              const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
              const created = await invoiceService.createStandalone({ companyId, projectId, clientId, lineItems: items, issueDate: today, dueDate });
              onSaved(created);
            }
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving..." : invoice ? "Save changes" : "Create invoice"}
      </button>
    </div>
  );
}
