"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Estimate } from "@/types";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import DeleteModal from "@/components/ui/DeleteModal";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Send, Trash2, MessageCircle, Link2 } from "lucide-react";

export default function EstimatesPage() {
  const router = useRouter();

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    id: "",
    name: "",
  });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadEstimates();
  }, []);

  async function loadEstimates() {
    // Load only non-deleted estimates
    const { data } = await supabase
      .from("estimates")
      .select("*, clients(name, phone)")
      .is("deleted_at", null)
      .eq("is_completed", false)  // ← Exclude completed
      .order("created_at", { ascending: false });

    if (data) setEstimates(data as Estimate[]);
    setLoading(false);
  }

  async function handleSoftDelete() {
    setDeleting(true);

    // Soft delete - just mark as deleted
    const { error } = await supabase
      .from("estimates")
      .update({ 
        deleted_at: new Date().toISOString(),
        is_deleted: true 
      })
      .eq("id", deleteModal.id);

    if (!error) {
      await loadEstimates();
      setDeleteModal({ isOpen: false, id: "", name: "" });
      alert("Estimate moved to trash");
    } else {
      alert("Error deleting estimate");
    }

    setDeleting(false);
  }

  const sendSMSLink = (estimate: Estimate) => {
    const phoneNumber = estimate.clients?.phone;

    if (!phoneNumber) {
      alert("No phone number on file. Please add a phone number to this client first.");
      return;
    }

    const baseUrl = window.location.origin;
    const documentUrl = `${baseUrl}/public/estimates/${estimate.id}`;

    const message = encodeURIComponent(
      `Hello ${estimate.clients?.name || "Customer"}! Please review and sign your estimate: ${documentUrl}\n\n` +
      `Estimate #${estimate.estimate_number || estimate.id.slice(0, 8)}\n` +
      `Total: $${estimate.total?.toFixed(2) || "0.00"}\n\n` +
      `Click the link above to view and sign. Thank you!`
    );

    window.location.href = `sms:${phoneNumber}?body=${message}`;
  };

  const copyLink = (estimate: Estimate) => {
    const baseUrl = window.location.origin;
    const documentUrl = `${baseUrl}/public/estimates/${estimate.id}`;
    navigator.clipboard.writeText(documentUrl);
    alert(`Link copied: ${documentUrl}`);
  };

  const getStatus = (est: Estimate) => {
    if (est.signature)
      return {
        label: "Signed",
        className: "bg-green-100 text-green-700",
      };

    if (est.status === "converted")
      return {
        label: "Converted",
        className: "bg-purple-100 text-purple-700",
      };

    return {
      label: "Pending",
      className: "bg-yellow-100 text-yellow-700",
    };
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f6f7f9] pb-24">
        {/* HEADER */}
        <div className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <button onClick={() => router.back()} className="text-gray-600 text-xl">
                ←
              </button>
              <h1 className="text-base font-semibold text-gray-800">Estimates</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push("/deleted")}
                className="text-gray-500 text-sm px-2 py-1 rounded-lg hover:bg-gray-100"
              >
                🗑️ Trash
              </button>
              <button
                onClick={() => router.push("/estimates/create")}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-lg text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="mx-auto max-w-4xl p-4">
          {/* TOP SECTION */}
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-base font-semibold text-gray-900 leading-tight">Estimates</div>
              <div className="text-xs text-gray-500 leading-tight">Manage customer estimates</div>
            </div>

            {!loading && estimates.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 leading-none">Total</div>
                <div className="text-xs font-semibold text-gray-800 leading-tight">{estimates.length}</div>
              </div>
            )}
          </div>


          {/* LOADING */}
          {loading && (
            <div className="rounded-2xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-500 shadow-sm">
              Loading estimates...
            </div>
          )}

          {/* EMPTY */}
          {!loading && estimates.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-14 text-center shadow-sm">
              <div className="text-sm font-medium text-gray-700">No estimates yet</div>
              <div className="mt-1 text-xs text-gray-400">Create your first estimate to get started</div>
              <button
                onClick={() => router.push("/estimates/create")}
                className="mt-4 rounded-xl bg-gray-900 px-4 py-2 text-sm text-white transition hover:bg-black"
              >
                Create Estimate
              </button>
            </div>
          )}

          {/* LIST */}
<div className="space-y-2.5">
  {estimates.map((estimate) => {
    const status = getStatus(estimate);
    return (
      <div
        key={estimate.id}
        className="group rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition hover:border-gray-300 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          {/* LEFT */}
          <div
            className="min-w-0 flex-1 cursor-pointer"
            onClick={() => router.push(`/estimates/${estimate.id}`)}
          >
            <div className="flex items-center gap-1.5">
              <div className="truncate text-[13px] font-semibold text-gray-800">
                {estimate.clients?.name || "No client"}
              </div>
              <span
                className={`rounded-full px-1.5 py-[2px] text-[9px] font-medium ${status.className}`}
              >
                {status.label}
              </span>
            </div>

            <div className="mt-0.5 text-[11px] text-gray-400">
              #{estimate.estimate_number || estimate.id.slice(0, 8)}
            </div>
            <div className="mt-0.5 text-[11px] text-gray-400">
              {formatShortDate(estimate.created_at)}
            </div>

            {estimate.description && (
              <div className="mt-1 line-clamp-1 text-[11px] leading-4 text-gray-500">
                {estimate.description}
              </div>
            )}

            {(estimate as any).opened_at && (
              <div className="mt-1 text-[11px] text-gray-500">
                <span>👁️</span>{" "}
                {new Date((estimate as any).opened_at).toLocaleString()}
                {(estimate as any).opened_device && (
                  <span className="ml-1 text-gray-400">
                    • {(estimate as any).opened_device}
                  </span>
                )}
                {(estimate as any).opened_ip && (
                  <span className="ml-1 text-gray-400">
                    • IP: {(estimate as any).opened_ip}
                  </span>
                )}
                {(estimate as any).opened_count > 1 && (
                  <span className="ml-1 text-gray-400">
                    • {(estimate as any).opened_count} views
                  </span>
                )}
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div className="flex shrink-0 flex-col items-end">
            <div className="text-[13px] font-semibold text-gray-900">
              {formatCurrency(estimate.total)}
            </div>

            <div className="flex gap-1.5 mt-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copyLink(estimate);
                }}
                className="p-1.5 rounded-md text-gray-400 hover:text-gold hover:bg-gold/10 transition"
                title="Copy Link"
              >
                <Link2 size={13} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  sendSMSLink(estimate);
                }}
                className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition"
                title="Send SMS"
              >
                <Send size={13} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteModal({
                    isOpen: true,
                    id: estimate.id,
                    name: estimate.clients?.name || "this estimate",
                  });
                }}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  })}
</div>

        </div>

        {/* DELETE MODAL - Soft Delete */}
        <DeleteModal
          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal({ isOpen: false, id: "", name: "" })}
          onConfirm={handleSoftDelete}
          title="Delete Estimate"
          message={`Move "${deleteModal.name}" to trash? You can restore it later from the trash folder.`}
          deleting={deleting}
        />
      </div>
    </ProtectedRoute>
  );
}