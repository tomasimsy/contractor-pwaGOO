"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Estimate } from "@/types";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import DeleteModal from "@/components/ui/DeleteModal";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Send, Trash2, MessageCircle, Link2, Plus, FilePlus } from "lucide-react";

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
  const [isFabOpen, setIsFabOpen] = useState(false);

  // 1. Memoized data fetcher
  const loadEstimates = useCallback(async () => {
    try {
      setLoading(true);
      
      // Explicitly define columns instead of '*' to keep network payloads lightweight
      const { data, error } = await supabase
        .from("estimates")
        .select(`
          id, 
          estimate_number, 
          created_at, 
          total, 
          signature, 
          status,
          description,
          clients (name, phone)
        `)
        .is("deleted_at", null)
        .eq("is_completed", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setEstimates(data as unknown as Estimate[]);
    } catch (error) {
      console.error("Error loading estimates:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEstimates();
  }, [loadEstimates]);

  // 2. Optimistic UI update during deletion
  async function handleSoftDelete() {
    const targetId = deleteModal.id;
    setDeleting(true);

    // Capture current state in case we need to roll back on database error
    const previousEstimates = [...estimates];

    // Optimistically update local UI instantly before the server responds
    setEstimates((prev) => prev.filter((est) => est.id !== targetId));
    setDeleteModal({ isOpen: false, id: "", name: "" });

    try {
      const { error } = await supabase
        .from("estimates")
        .update({ 
          deleted_at: new Date().toISOString(),
          is_deleted: true 
        })
        .eq("id", targetId);

      if (error) throw error;
      alert("Estimate moved to trash");
    } catch (error) {
      console.error("Deletion failed:", error);
      alert("Error deleting estimate. Restoring item.");
      // Rollback UI state if database call fails
      setEstimates(previousEstimates);
    } finally {
      setDeleting(false);
    }
  }

  // 3. String concatenation and URL performance cleanup
  const getEstimateUrl = (id: string) => `${window.location.origin}/public/estimates/${id}`;

  const sendSMSLink = (estimate: Estimate) => {
    const phoneNumber = estimate.clients?.phone;

    if (!phoneNumber) {
      alert("No phone number on file. Please add a phone number to this client first.");
      return;
    }

    const documentUrl = getEstimateUrl(estimate.id);
    const estIdentifier = estimate.estimate_number || estimate.id.slice(0, 8);
    const totalAmount = estimate.total ? estimate.total.toFixed(2) : "0.00";

    const message = encodeURIComponent(
      `Hello ${estimate.clients?.name || "Customer"}! Please review and sign your estimate: ${documentUrl}\n\n` +
      `Estimate #${estIdentifier}\n` +
      `Total: $${totalAmount}\n\n` +
      `Click the link above to view and sign. Thank you!`
    );

    window.location.href = `sms:${phoneNumber}?body=${message}`;
  };

  const copyLink = (estimate: Estimate) => {
    const documentUrl = getEstimateUrl(estimate.id);
    navigator.clipboard.writeText(documentUrl);
    alert(`Link copied: ${documentUrl}`);
  };

  // 4. Static lookup map instead of continuous evaluation
  const getStatus = (est: Estimate) => {
    if (est.signature) {
      return { label: "Signed", className: "bg-green-100 text-green-700" };
    }
    if (est.status === "converted") {
      return { label: "Converted", className: "bg-purple-100 text-purple-700" };
    }
    return { label: "Pending", className: "bg-yellow-100 text-yellow-700" };
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading estimates...</div>;
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f6f7f9] pb-24 relative">
        {/* HEADER */}
        <div className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <button onClick={() => router.back()} className="text-gray-600 text-xl">
                ←
              </button>
              <h1 className="text-base font-semibold text-gray-800">Estimates</h1>
            </div>
            <div className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
              <div className="flex items-center justify-between px-4 py-2">
                 
                
                {/* This container will now be hidden on mobile, and display on desktop/tablet */}
                <div className="hidden md:flex gap-2">
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
              <div className="rounded-lg border border-gray-200 bg-green-600 text-white  px-2.5 py-1.5 shadow-sm">
                <div className="text-[10px] uppercase tracking-wide   leading-none">Total</div>
                <div className="text-xs font-semibold leading-tight">{estimates.length}</div>
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
                  className="group rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition hover:border-gray-300 hover:shadow-md capitalize cursor-pointer"
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

        {/* FLOATING ACTION BUTTON SPEED DIAL */}
        <div 
          className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 "
          onMouseEnter={() => setIsFabOpen(true)}
          onMouseLeave={() => setIsFabOpen(false)}
        >
          {/* Action List Container */}
          <div className={`flex flex-col items-end gap-2 transition-allbg-green-600 duration-300 transform origin-bottom ${
            isFabOpen ? "scale-100 opacity-100 translate-y-0" : "scale-75 opacity-0 translate-y-4 pointer-events-none"
          }`}>
            {/* Action: Trash */}
            <div className="flex items-center gap-2 group ">
              <span className="bg-gray-900/90 backdrop-blur-sm text-white text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-md whitespace-nowrap">
          Trash
      </span>
              <button
                onClick={() => router.push("/deleted")}

                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-600 shadow-lg border border-gray-100 hover:bg-gray-50 hover:text-red-500 transition-all"
                title="View Trash"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Action: New Estimate */}
            <div className="flex items-center gap-2 group">
              <span className="bg-gray-900/90 backdrop-blur-sm text-white text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-md whitespace-nowrap">
        New Estimate
      </span>
              <button
                onClick={() => router.push("/estimates/create")}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700 transition-all"
                title="New Estimate"
              >
                <FilePlus size={18} />
              </button>
            </div>
          </div>

          {/* Main Trigger Button */}
          {/* Main Trigger Button */}
          <button
            onClick={() => setIsFabOpen(!isFabOpen)}
            className={`flex h-14 w-14 mb-8 items-center justify-center rounded-full bg-green-600 text-white shadow-xl hover:bg-green-700 transition-all duration-300 ${
              isFabOpen ? "rotate-45" : "rotate-0"
            }`}
          >
            <Plus size={24} />
          </button>
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