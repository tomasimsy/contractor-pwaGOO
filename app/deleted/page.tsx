"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";

export default function DeletedPage() {
  const [deletedEstimates, setDeletedEstimates] = useState<any[]>([]);
  const [deletedInvoices, setDeletedInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadDeleted();
  }, []);

  async function loadDeleted() {
    // Load soft-deleted estimates
    const { data: estimates } = await supabase
      .from("estimates")
      .select("*, clients(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    
    // Load soft-deleted invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select("*, clients(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    
    setDeletedEstimates(estimates || []);
    setDeletedInvoices(invoices || []);
    setLoading(false);
  }

  async function restoreEstimate(id: string) {
    setRestoring(true);
    const { error } = await supabase
      .from("estimates")
      .update({ deleted_at: null })
      .eq("id", id);
    
    if (error) {
      alert("Error restoring");
    } else {
      alert("Restored successfully!");
      loadDeleted();
    }
    setRestoring(false);
  }

  async function restoreInvoice(id: string) {
    setRestoring(true);
    const { error } = await supabase
      .from("invoices")
      .update({ deleted_at: null })
      .eq("id", id);
    
    if (error) {
      alert("Error restoring");
    } else {
      alert("Restored successfully!");
      loadDeleted();
    }
    setRestoring(false);
  }

  const totalDeleted = deletedEstimates.length + deletedInvoices.length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
       {/* Header */}
            <Header
              title="Delete Items"
              backLink="/"
              rightAction={
                <button
                  onClick={() => router.push("/estimates/create")}
                  className="text-white text-2xl"
                >
                  +
                </button>
              }
            />

      <div className="p-4 max-w-4xl mx-auto">
        {loading && <div className="text-center py-8">Loading...</div>}

        {!loading && totalDeleted === 0 && (
          <div className="bg-white rounded-xl p-8 text-center">
            <div className="text-5xl mb-3">🗑️</div>
            <div className="text-gray-500">No deleted items</div>
            <div className="text-xs text-gray-400 mt-1">
              Soft-deleted items will appear here
            </div>
          </div>
        )}

        {/* Deleted Estimates */}
        {deletedEstimates.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-navy mb-3 flex items-center gap-2">
              <span>📄</span> Deleted Estimates ({deletedEstimates.length})
            </h2>
            <div className="space-y-2">
              {deletedEstimates.map((est) => (
                <div key={est.id} className="bg-white rounded-xl p-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-navy">
                        {est.clients?.name || "No client"}
                      </div>
                      <div className="text-xs text-gray-400">
                        #{est.estimate_number || est.id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-red-500">
                        Deleted: {formatShortDate(est.deleted_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(est.total)}</div>
                      <button
                        onClick={() => restoreEstimate(est.id)}
                        disabled={restoring}
                        className="mt-1 px-3 py-1 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deleted Invoices */}
        {deletedInvoices.length > 0 && (
          <div>
            <h2 className="font-semibold text-navy mb-3 flex items-center gap-2">
              <span>💰</span> Deleted Invoices ({deletedInvoices.length})
            </h2>
            <div className="space-y-2">
              {deletedInvoices.map((inv) => (
                <div key={inv.id} className="bg-white rounded-xl p-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-navy">
                        {inv.clients?.name || "No client"}
                      </div>
                      <div className="text-xs text-gray-400">
                        {inv.invoice_number}
                      </div>
                      <div className="text-xs text-red-500">
                        Deleted: {formatShortDate(inv.deleted_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(inv.total)}</div>
                      <button
                        onClick={() => restoreInvoice(inv.id)}
                        disabled={restoring}
                        className="mt-1 px-3 py-1 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}