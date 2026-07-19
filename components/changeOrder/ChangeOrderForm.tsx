"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { X, Plus, Trash2 } from "lucide-react";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  type: "addition" | "deduction";
}

interface ChangeOrderFormProps {
  estimateId: string;
  estimateTotal: number;
  existingOrder: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ChangeOrderForm({
  estimateId,
  estimateTotal,
  existingOrder,
  onClose,
  onSaved,
}: ChangeOrderFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, total: 0, type: "addition" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingOrder) {
      setTitle(existingOrder.title);
      setDescription(existingOrder.description || "");
      loadLineItems(existingOrder.id);
    }
  }, [existingOrder]);

  async function loadLineItems(changeOrderId: string) {
    const { data } = await supabase
      .from("change_order_line_items")
      .select("*")
      .eq("change_order_id", changeOrderId);
    if (data) {
      const items = data.map((item: any) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        type: item.type,
      }));
      setLineItems(items);
    }
  }

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, total: 0, type: "addition" },
    ]);
  };

  const updateLineItem = (id: string, field: string, value: any) => {
    setLineItems((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "unit_price") {
          updated.total = updated.quantity * updated.unit_price;
        }
        return updated;
      })
    );
  };

  const removeLineItem = (id: string) => {
    setLineItems((items) => items.filter((item) => item.id !== id));
  };

  const calculateTotalChange = () => {
    return lineItems.reduce((sum, item) => {
      return sum + (item.type === "addition" ? item.total : -item.total);
    }, 0);
  };

  const revisedTotal = estimateTotal + calculateTotalChange();

  const handleSave = async () => {
    if (!title.trim()) {
      alert("Please enter a title");
      return;
    }
    if (lineItems.length === 0 || lineItems.every((i) => i.total === 0)) {
      alert("Add at least one line item with a value");
      return;
    }

    setSaving(true);
    const totalChange = calculateTotalChange();

    try {
      if (existingOrder) {
        // Update existing change order
        const { error: updateError } = await supabase
          .from("change_orders")
          .update({
            title,
            description,
            total_amount: totalChange,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingOrder.id);
        if (updateError) throw updateError;

        // Delete old line items
        await supabase.from("change_order_line_items").delete().eq("change_order_id", existingOrder.id);

        // Insert new line items
        const itemsToInsert = lineItems.map((item) => ({
          change_order_id: existingOrder.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.quantity * item.unit_price,
          type: item.type,
        }));
        if (itemsToInsert.length) {
          const { error: itemsError } = await supabase.from("change_order_line_items").insert(itemsToInsert);
          if (itemsError) throw itemsError;
        }
      } else {
        // Create new change order
        // 1. Get current estimate total
        const { data: estimate, error: estError } = await supabase
          .from("estimates")
          .select("total")
          .eq("id", estimateId)
          .single();
        if (estError) throw estError;

        // 2. Count existing change orders to generate number
        const { count, error: countError } = await supabase
          .from("change_orders")
          .select("id", { count: "exact", head: true })
          .eq("estimate_id", estimateId);
        const coNumber = `CO-${(count || 0) + 1}`;

        // 3. Insert the change order
        const { data: newCo, error: createError } = await supabase
          .from("change_orders")
          .insert({
            estimate_id: estimateId,
            change_order_number: coNumber,
            title,
            description: description || null,
            original_estimate_total: estimate.total,
            total_amount: totalChange,
            status: "draft",
          })
          .select()
          .single();
        if (createError) throw createError;

        // 4. Insert line items
        const itemsToInsert = lineItems.map((item) => ({
          change_order_id: newCo.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.quantity * item.unit_price,
          type: item.type,
        }));
        if (itemsToInsert.length) {
          const { error: itemsError } = await supabase.from("change_order_line_items").insert(itemsToInsert);
          if (itemsError) throw itemsError;
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error("Error saving change order:", err);
      alert(err.message || "Error saving change order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold">{existingOrder ? "Edit Change Order" : "New Change Order"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full border rounded-lg p-2 text-sm"
              placeholder="e.g., Additional framing work"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full border rounded-lg p-2 text-sm"
              placeholder="Optional details..."
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Line Items</label>
              <button onClick={addLineItem} className="text-xs text-green-600 flex items-center gap-1">
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item) => (
                <div key={item.id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between mb-2">
                    <select
                      value={item.type}
                      onChange={(e) => updateLineItem(item.id, "type", e.target.value)}
                      className="text-xs border rounded px-2 py-1"
                    >
                      <option value="addition">➕ Addition</option>
                      <option value="deduction">➖ Deduction</option>
                    </select>
                    <button onClick={() => removeLineItem(item.id)} className="text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                    className="w-full border rounded p-2 text-sm mb-2"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500">Quantity</label>
                      <input
                        type="number"
                        value={item.quantity === 0 ? "" : item.quantity}
                        onChange={(e) => updateLineItem(item.id, "quantity", Number(e.target.value) || 0)}
                        className="w-full border rounded p-2 text-sm"
                        step="1"
                        min="0"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500">Unit Price ($)</label>
                      <input
                        type="number"
                        value={item.unit_price === 0 ? "" : item.unit_price}
                        onChange={(e) => updateLineItem(item.id, "unit_price", Number(e.target.value) || 0)}
                        className="w-full border rounded p-2 text-sm"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <div className="flex-1 text-right">
                      <label className="text-[10px] text-gray-500">Total</label>
                      <div className="text-sm font-semibold mt-1">{formatCurrency(item.total)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex justify-between text-sm">
              <span>Original Estimate Total:</span>
              <span>{formatCurrency(estimateTotal)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>Total Change:</span>
              <span className={calculateTotalChange() >= 0 ? "text-green-600" : "text-red-600"}>
                {calculateTotalChange() >= 0 ? "+" : "-"}
                {formatCurrency(Math.abs(calculateTotalChange()))}
              </span>
            </div>
            <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
              <span>Revised Total:</span>
              <span>{formatCurrency(revisedTotal)}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button onClick={onClose} className="flex-1 py-2 border rounded-lg text-sm">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm"
            >
              {saving ? "Saving..." : existingOrder ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}