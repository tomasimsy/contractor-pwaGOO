"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { RotateCcw, Eye, Trash2 } from "lucide-react";

export default function CompletedEstimatesPage() {
  const router = useRouter();
  const [estimates, setEstimates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    loadCompleted();
  }, []);

  async function loadCompleted() {
    const { data } = await supabase
      .from("estimates")
      .select("*, clients(name, phone)")
      .eq("is_completed", true)
      .is("deleted_at", null)
      .order("completed_at", { ascending: false });

    if (data) setEstimates(data);
    setLoading(false);
  }

  async function restoreEstimate(id: string) {
    if (!confirm("Restore this estimate to active status?")) return;
    
    setRestoring(id);
    const { error } = await supabase
      .from("estimates")
      .update({ 
        completed_at: null, 
        is_completed: false,
        status: "approved"
      })
      .eq("id", id);
    
    if (!error) {
      await loadCompleted();
      alert("Estimate restored to active!");
    } else {
      alert("Error restoring estimate");
    }
    setRestoring(null);
  }

  const getStatus = (est: any) => {
    if (est.signature) return "Signed";
    if (est.status === "converted") return "Converted";
    return "Pending";
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Header title="Completed Estimates" backLink="/estimates" />
          <div className="p-8 text-center">Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 pb-24">
        <Header title="Completed Estimates" backLink="/estimates" />

        <div className="max-w-4xl mx-auto p-4">
          {estimates.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl">
              <div className="text-5xl mb-3">✅</div>
              <div className="text-gray-400">No completed estimates</div>
              <div className="text-xs text-gray-300 mt-1">Completed estimates appear here</div>
            </div>
          ) : (
            <div className="space-y-3">
              {estimates.map((est) => (
                <div key={est.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800">
                        {est.clients?.name || "No client"}
                      </div>
                      {est.title && (
                        <div className="text-xs font-medium text-gray-600">{est.title}</div>
                      )}
                      <div className="text-xs text-gray-400">
                        #{est.estimate_number || est.id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {getStatus(est)}
                      </div>
                      <div className="text-xs text-blue-500 mt-2 flex items-center gap-1">
                        <span>✅</span>
                        Completed: {formatShortDate(est.completed_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-800">
                        {formatCurrency(est.total)}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => router.push(`/estimates/${est.id}`)}
                          className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition flex items-center gap-1"
                        >
                          <Eye size={14} /> View
                        </button>
                        <button
                          onClick={() => restoreEstimate(est.id)}
                          disabled={restoring === est.id}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-1"
                        >
                          <RotateCcw size={14} />
                          {restoring === est.id ? "..." : "Restore"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}