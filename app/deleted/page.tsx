"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import Header from "@/components/ui/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";

export default function DeletedEstimatesPage() {
  const router = useRouter();
  const [deletedEstimates, setDeletedEstimates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadDeleted();
  }, []);

  async function loadDeleted() {
    const companyId = await getCompanyId();
    const { data } = await supabase
      .from("estimates")
      .select("*, clients(name, phone)")
      .eq("company_id", companyId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (data) setDeletedEstimates(data);
    setLoading(false);
  }

  async function restoreEstimate(id: string) {
    setRestoring(id);
    const companyId = await getCompanyId();
    const { error } = await supabase
      .from("estimates")
      .update({ deleted_at: null, deleted_by: null, is_deleted: false })
      .eq("id", id)
      .eq("company_id", companyId);

    if (!error) {
      await loadDeleted();
      alert("Estimate restored!");
    } else {
      alert("Error restoring estimate");
    }
    setRestoring(null);
  }

  async function permanentDelete(id: string) {
    if (!confirm("Permanently delete this estimate? This action CANNOT be undone.")) return;

    setPermanentDeleting(id);
    const companyId = await getCompanyId();
    const { error } = await supabase
      .from("estimates")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (!error) {
      await loadDeleted();
      alert("Estimate permanently deleted");
    } else {
      alert("Error deleting estimate");
    }
    setPermanentDeleting(null);
  }

  async function deleteAllPermanently() {
    if (!confirm(`Permanently delete ALL ${deletedEstimates.length} estimates? This action CANNOT be undone.`)) return;

    const companyId = await getCompanyId();
    for (const est of deletedEstimates) {
      await supabase.from("estimates").delete().eq("id", est.id).eq("company_id", companyId);
    }
    await loadDeleted();
    alert("All estimates permanently deleted");
  }

  async function restoreAll() {
    if (!confirm(`Restore ALL ${deletedEstimates.length} estimates?`)) return;

    const companyId = await getCompanyId();
    for (const est of deletedEstimates) {
      await supabase
        .from("estimates")
        .update({ deleted_at: null, deleted_by: null, is_deleted: false })
        .eq("id", est.id)
        .eq("company_id", companyId);
    }
    await loadDeleted();
    alert("All estimates restored!");
  }

  const getStatusBadge = (est: any) => {
    if (est.signature) return "Signed";
    if (est.status === "converted") return "Converted";
    return "Pending";
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Header title="Trash" backLink="/estimates" />
          <div className="p-8 text-center">Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DesktopShell title="Trash">
      <div className="min-h-screen md:min-h-0 bg-gray-50 md:bg-transparent pb-24 md:pb-0">
        <Header title="Trash - Deleted Estimates" backLink="/estimates" mdHidden />

        <div className="max-w-4xl md:max-w-none mx-auto md:mx-0 p-4 md:p-0">
          {/* Batch Actions */}
          {deletedEstimates.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-600" />
                <span className="text-sm text-amber-800">
                  {deletedEstimates.length} estimate(s) in trash
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={restoreAll}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  Restore All
                </button>
                <button
                  onClick={deleteAllPermanently}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  Delete All Permanently
                </button>
              </div>
            </div>
          )}

          {/* Deleted List */}
          <div className="space-y-3">
            {deletedEstimates.length === 0 && (
              <div className="text-center py-16 bg-white rounded-xl">
                <div className="text-5xl mb-3">🗑️</div>
                <div className="text-gray-400">Trash is empty</div>
                <div className="text-xs text-gray-300 mt-1">Deleted estimates appear here</div>
              </div>
            )}

            {deletedEstimates.map((est) => (
              <div key={est.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-800">
                      {est.clients?.name || "No client"}
                    </div>
                    <div className="text-xs text-gray-400">
                      #{est.estimate_number || est.id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {getStatusBadge(est)}
                    </div>
                    <div className="text-xs text-red-500 mt-2 flex items-center gap-1">
                      <Trash2 size={12} />
                      Deleted: {formatShortDate(est.deleted_at)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-800">
                      {formatCurrency(est.total)}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => restoreEstimate(est.id)}
                        disabled={restoring === est.id}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-1"
                      >
                        <RotateCcw size={14} />
                        {restoring === est.id ? "..." : "Restore"}
                      </button>
                      <button
                        onClick={() => permanentDelete(est.id)}
                        disabled={permanentDeleting === est.id}
                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                      >
                        {permanentDeleting === est.id ? "..." : "Permanent Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}