"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { Plus, Eye, Edit2, Trash2, Send, CheckCircle, XCircle, FileText } from "lucide-react";
import ChangeOrderForm from "@/components/changeOrder/ChangeOrderForm";
import SignaturePad from "../signature/SignaturePad";
import toast from "react-hot-toast";


interface ChangeOrder {
  id: string;
  change_order_number: string;
  title: string;
  description: string;
  status: string;
  total_amount: number;
  original_estimate_total: number;
  created_at: string;
  approved_at?: string;
  signed_signature?: string;
}

interface ChangeOrderTabProps {
  estimateId: string;
  estimateTotal: number;
  onRefresh: () => void; // refresh parent (ProjectFinancialsModal)
}

export default function ChangeOrderTab({ estimateId, estimateTotal, onRefresh }: ChangeOrderTabProps) {
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ChangeOrder | null>(null);

  useEffect(() => {
    loadChangeOrders();
  }, [estimateId]);

  async function loadChangeOrders() {
    const { data, error } = await supabase
      .from("change_orders")
      .select("*")
      .eq("estimate_id", estimateId)
      .order("created_at", { ascending: false });
    if (!error && data) setChangeOrders(data);
    setLoading(false);
  }

  async function deleteChangeOrder(id: string, status: string) {
    if (status !== "draft") {
      alert("Only draft change orders can be deleted.");
      return;
    }
    if (!confirm("Delete this change order permanently?")) return;
    const { error } = await supabase.from("change_orders").delete().eq("id", id);
    if (!error) {
      await loadChangeOrders();
      onRefresh();
    } else {
      alert("Error deleting");
    }
  }


async function submitForApproval(id: string) {
  const { error } = await supabase.from("change_orders").update({ status: "pending" }).eq("id", id);
  if (!error) {
    await loadChangeOrders();
    onRefresh();
    toast.success("Change order submitted for client approval.", {
      duration: 3000,
      position: "top-right",
      icon: "📨",
      style: {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fbbf24",
        padding: "6px 12px",
        fontSize: "12px",
      },
    });
  } else {
    toast.error("Error submitting change order.", {
      duration: 3000,
      position: "top-center",
    });
  }
}

  async function convertToInvoice(id: string) {
    const res = await fetch(`/api/change-orders/${id}/convert-to-invoice`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      alert(`Invoice created! ID: ${data.invoiceId}`);
      await loadChangeOrders();
      onRefresh();
    } else {
      alert("Error generating invoice");
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      invoiced: "bg-blue-100 text-blue-800",
    };
    return styles[status] || "bg-gray-100";
  };

  const getActions = (co: ChangeOrder) => {
    switch (co.status) {
      case "draft":
        return (
          <>
            <button onClick={() => { setEditingOrder(co); setShowForm(true); }} className="text-blue-600 hover:text-blue-800" title="Edit">
              <Edit2 size={14} />
            </button>
            <button onClick={() => deleteChangeOrder(co.id, co.status)} className="text-red-600 hover:text-red-800" title="Delete">
              <Trash2 size={14} />
            </button>
            <button onClick={() => submitForApproval(co.id)} className="text-green-600 hover:text-green-800" title="Submit for Approval">
              <Send size={14} />
            </button>
          </>
        );
      case "approved":
        return (
          <>
            <button onClick={() => convertToInvoice(co.id)} className="text-blue-600 hover:text-blue-800" title="Convert to Invoice">
              <FileText size={14} />
            </button>
          </>
        );
      case "rejected":
        return (
          <button onClick={() => { setEditingOrder(co); setShowForm(true); }} className="text-blue-600 hover:text-blue-800" title="Edit and Resubmit">
            <Edit2 size={14} />
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-gray-700">Change Orders</h4>
        <button
          onClick={() => { setEditingOrder(null); setShowForm(true); }}
          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
        >
          <Plus size={14} /> New Change Order
        </button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-gray-400">Loading...</div>
      ) : changeOrders.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">No change orders yet.</div>
      ) : (
        <div className="space-y-3">
          {changeOrders.map((co) => (
            <div key={co.id} className="border rounded-lg p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-gray-800">{co.title}</div>
                  <div className="text-xs text-gray-500">{co.change_order_number}</div>
                  {co.description && <div className="text-xs text-gray-500 mt-1">{co.description}</div>}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-green-700">{formatCurrency(co.total_amount)}</div>
                  <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusBadge(co.status)}`}>
                    {co.status}
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-2">
                {getActions(co)}
              </div>
              {co.status === "pending" && (
                <div className="mt-3 pt-2 border-t border-gray-100">
                  <p className="text-xs text-amber-600 mb-2">Awaiting client signature</p>
                  {/* You can show a "Sign & Approve" button if you want the client to sign directly from here */}
                </div>
              )}
              {co.status === "approved" && co.signed_signature && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500">Signed by client:</div>
                  <img src={co.signed_signature} alt="Signature" className="h-8 mt-1 object-contain" />
                  <div className="text-xs text-gray-400">{co.approved_at && new Date(co.approved_at).toLocaleDateString()}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal for creating/editing change order */}
      {showForm && (
        <ChangeOrderForm
          estimateId={estimateId}
          estimateTotal={estimateTotal}
          existingOrder={editingOrder}
          onClose={() => { setShowForm(false); setEditingOrder(null); }}
          onSaved={() => { loadChangeOrders(); onRefresh(); }}
        />
      )}
    </div>
  );
}