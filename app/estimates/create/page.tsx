"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Client, LineItem } from "@/types";
import Header from "@/components/ui/Header";
import Card from "@/components/ui/Card";
import ClientSelector from "@/components/forms/ClientSelector";
import LineItemsEditor from "@/components/forms/LineItemsEditor";
import { calculateSubtotal, calculateTax, calculateTotal } from "@/lib/utils/calculations";
import { formatCurrency } from "@/lib/utils/formatting";
import { generateDocumentNumber } from "@/lib/utils/documentNumber";


export default function CreateEstimate() {
  const [previewNumber, setPreviewNumber] = useState("");
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), category: "Material", name: "", description: "", quantity: 1, unit_price: 0, taxable: false, total: 0 }
  ]);
  const [saving, setSaving] = useState(false);

  const subtotal = calculateSubtotal(items);
  const tax = calculateTax(subtotal, 0);
  const total = calculateTotal(subtotal, 0, 0, tax);

  const generateInvoiceNumber = async () => {
  return `EST-${Date.now()}`;
};

  useEffect(() => {
  const getPreview = async () => {
    const preview = await generateInvoiceNumber();
    setPreviewNumber(preview);
  };
  getPreview();
}, []);

  const saveEstimate = async () => {
    if (!clientId) return alert("Select a client");
    if (items.some(i => !i.name.trim())) return alert("Name all line items");
    
    const documentNumber = await generateDocumentNumber();
    setSaving(true);

    const { data: estimate, error } = await supabase
      .from("estimates")
      .insert({
        client_id: clientId,
        estimate_number: documentNumber,  // ← Add this line
        description: description || null,
        notes: notes || null,
        subtotal,
        total,
        status: "pending"
      })
      .select()
      .single();

    if (error) {
      alert("Error: " + error.message);
      setSaving(false);
      return;
    }

    const itemsToInsert = items.map(item => ({
      estimate_id: estimate.id,
      category: item.category,
      name: item.name,
      description: item.description || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      taxable: item.taxable,
      total: item.quantity * item.unit_price
    }));

    const { error: itemsError } = await supabase.from("estimate_items").insert(itemsToInsert);

    if (itemsError) {
      alert("Error saving items");
    } else {
      router.push(`/estimates/${estimate.id}`);
    }
    setSaving(false);
  };

return (
  <div className="min-h-screen bg-[#f6f7f9] pb-10">

    {/* HEADER */}
    <div className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur">
      <Header
        title="New Estimate"
        backLink="/estimates"
        rightAction={
          <button
            onClick={saveEstimate}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        }
      />
    </div>

    {/* CONTENT */}
    <div className="mx-auto max-w-3xl space-y-4 p-4">

      {/* CLIENT */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <ClientSelector selectedId={clientId} onSelect={setClientId} />
      </div>

      {/* DESCRIPTION */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          Description
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full resize-none rounded-lg border border-gray-200 p-2 text-sm text-gray-700 focus:border-gray-300 focus:outline-none"
          rows={2}
          placeholder="Brief description of work..."
        />
      </div>

      {/* LINE ITEMS */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <LineItemsEditor items={items} onChange={setItems} />
      </div>

      {/* SUMMARY */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">

        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          Summary
        </div>

        <div className="space-y-2 text-sm">

          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span className="font-medium text-gray-900">
              {formatCurrency(subtotal)}
            </span>
          </div>

          <div className="border-t pt-2 flex justify-between text-gray-800">
            <span className="font-medium">Total</span>
            <span className="font-semibold">
              {formatCurrency(total)}
            </span>
          </div>

        </div>
      </div>

      {/* NOTES */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">

        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          Notes
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full resize-none rounded-lg border border-gray-200 p-2 text-xs text-gray-700 focus:border-gray-300 focus:outline-none"
          rows={2}
          placeholder="Additional notes for the client..."
        />

      </div>

    </div>
  </div>
);
}