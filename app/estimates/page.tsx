"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Estimate } from "@/types";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import DeleteModal from "@/components/ui/DeleteModal";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Send, Trash2, MessageCircle, Link2, Plus, FilePlus, Eye, Search, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

export default function EstimatesPage() {
  const router = useRouter();

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"all" | "signed" | "pending">("all");

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
    
    const { data, error } = await supabase
      .from("estimates")
      .select(`
        id,
        estimate_number,
        title,
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
    if (data) {
      // Sort: signed first (signature not null), then by created_at desc
      const sorted = [...data].sort((a, b) => {
        const aSigned = a.signature ? 1 : 0;
        const bSigned = b.signature ? 1 : 0;
        if (aSigned !== bSigned) return bSigned - aSigned; // signed first
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setEstimates(sorted as unknown as Estimate[]);
    }
  } catch (error) {
    console.error("Error loading estimates:", error);
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => {
    loadEstimates();
  }, [loadEstimates]);

  // Client-side search matching client name or estimate identifier number
const filteredEstimates = estimates.filter((est) => {
  const matchesSearch =
    est.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
    est.title?.toLowerCase().includes(search.toLowerCase()) ||
    (est.estimate_number || est.id.slice(0, 8))
      .toString()
      .includes(search);

  const matchesFilter =
    filter === "all"
      ? true
      : filter === "signed"
      ? !!est.signature
      : !est.signature;

  return matchesSearch && matchesFilter;
});

  
  // 2. Optimistic UI update during deletion
  async function handleSoftDelete() {
    const targetId = deleteModal.id;
    setDeleting(true);

    const previousEstimates = [...estimates];

    setEstimates((prev) => prev.filter((est) => est.id !== targetId));
    setDeleteModal({ isOpen: false, id: "", name: "" });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("estimates")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
          is_deleted: true,
        })
        .eq("id", targetId);

      if (error) throw error;
    } catch (error) {
      console.error("Deletion failed:", error);
      alert("Error deleting estimate. Restoring item.");
      setEstimates(previousEstimates);
    } finally {
      setDeleting(false);
    }
  }

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
  toast.success("Link copied to clipboard!", {
    duration: 2000,
    position: "top-right",
    icon: "🔗",
    style: {
      background: "#009966ee", // amber-50 (light amber background)
      color: "#ffffffff",       // amber-800 (dark amber text)
      // border: "1px solid #fbbf24", // amber-400 border
      fontWeight: "400",
          padding: "6px 12px",      // smaller padding
    fontSize: "12px",          // smaller text
    minWidth: "180px",  
    },
  });
};

  // 3. Branded luxury lookup maps to mirror the financial stats grid
  const getStatus = (est: Estimate) => {
    if (est.signature) {
      return { label: "Signed", className: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
    }
    if (est.status === "converted") {
      return { label: "Converted", className: "bg-teal-50 text-teal-700 border border-teal-100" };
    }
    return { label: "Pending", className: "bg-amber-50 text-amber-700 border border-amber-100/70" };
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/60 p-6 text-center text-xs font-medium text-slate-400 tracking-wide">
        Loading estimates system...
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50/50 pb-28 relative font-sans antialiased">
        
        {/* FIXED STICKY HEADER CONTAINER WITH INTEGRATED SEARCH BAR */}
        <div className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
          <div className="mx-auto max-w-4xl flex items-center justify-between px-4 py-2.5 gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-initial">
              <button 
                onClick={() => router.back()} 
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition text-sm font-medium"
              >
                ←
              </button>
              <h1 className="text-sm font-semibold text-slate-900 tracking-tight hidden sm:block shrink-0">Estimates</h1>
            </div>

            {/* NEW ADDED COMPACT SEARCH CONTROLLER PANEL */}
            <div className="relative flex-1 max-w-md">
              <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search active estimates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs focus:bg-white focus:outline-hidden focus:border-[#05291e] transition-all"
              />
            </div>
            
            {/* Desktop Quick Actions Group */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <button
                onClick={() => router.push("/deleted")}
                className="text-xs font-medium text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                🗑️ Trash Bin
              </button>
              <button
                onClick={() => router.push("/estimates/create")}
                className="flex h-8 px-3 items-center gap-1.5 rounded-lg bg-[#05291e] text-xs font-semibold text-white shadow-sm hover:bg-[#0b3c2d] transition"
              >
                <Plus size={14} />
                New Estimate
              </button>
            </div>
          </div>
        </div>

        {/* MAIN BODY LAYOUT */}
        <div className="mx-auto max-w-4xl p-4">
          
          {/* CONTROL META COMPONENT HEADLINE */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[16px] uppercase font-bold text-emerald-700 tracking-tight">Active Estimates</div>
              <div className="text-xs text-slate-500">Draft, send, track pipeline conversions</div>
            </div>

            {!loading && filteredEstimates.length > 0 && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-1 text-center shadow-xs">
                <div className="text-[9px] uppercase tracking-wider font-bold text-emerald-800"> Total</div>
                <div className="text-xs font-bold text-emerald-950">{filteredEstimates.length}</div>
              </div>
            )}
          </div>

          {/* EMPTY CONTENT STATE CONTAINER */}
          {!loading && filteredEstimates.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center shadow-sm max-w-md mx-auto mt-8 p-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-3">
                <FilePlus size={22} />
              </div>
              <div className="text-sm font-semibold text-slate-800">No active estimates found</div>
              <div className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">
                {search ? "No records match your active filtering queries criteria." : "Create records to track pipeline, secure signatures, and push jobs to your dashboard."}
              </div>
              {!search && (
                <button
                  onClick={() => router.push("/estimates/create")}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#05291e] px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#0b3c2d] transition"
                >
                  <Plus size={14} /> Create Estimate
                </button>
              )}
            </div>
          )}

          {/* ESTIMATES POPULATED ROW CONTENT LIST */}
          {/* Category Filter Buttons */}
<div className="mb-4 flex flex-wrap gap-2">
  <button
    onClick={() => setFilter("all")}
    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      filter === "all"
        ? "bg-emerald-600 text-white"
        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
    }`}
  >
    All ({estimates.length})
  </button>

  <button
    onClick={() => setFilter("signed")}
    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      filter === "signed"
        ? "bg-emerald-600 text-white"
        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
    }`}
  >
    Signed ({estimates.filter((e) => e.signature).length})
  </button>

  <button
    onClick={() => setFilter("pending")}
    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      filter === "pending"
        ? "bg-emerald-600 text-white"
        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
    }`}
  >
    Pending ({estimates.filter((e) => !e.signature).length})
  </button>
</div>
          <div className="space-y-2">
            {filteredEstimates.map((estimate, index) => {
              const status = getStatus(estimate);
              return (
<div
  key={estimate.id}
  className={`group rounded-xl border-l-4 border-b-1  border-emerald-500  px-3.5 py-2.5 shadow-2xs transition-all duration-150 capitalize flex items-start gap-3 ${
    index % 2 === 0 ? "bg-white" : "bg-slate-50/60"
  } hover:bg-emerald-50 hover:border-emerald-200`}
>
  {/* Arrow – will also change color on hover */}
  <div className="flex h-full items-center text-emerald-700 group-hover:text-emerald-700 transition-colors">
    <ArrowRight size={14} className="shrink-0" />
  </div>

  {/* Clickable content area – text colors change on hover */}
  <div
    className="min-w-0 flex-1 cursor-pointer"
    onClick={() => router.push(`/estimates/${estimate.id}`)}
  >
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="truncate text-xs font-bold text-slate-800 group-hover:text-emerald-800 transition-colors tracking-tight">
        {estimate.clients?.name || "No client specified"}
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase ${status.className}`}>
        {status.label}
      </span>
    </div>

    {estimate.title && (
      <div className="truncate text-[11px] font-semibold text-slate-600 group-hover:text-slate-700 transition-colors normal-case">
        {estimate.title}
      </div>
    )}

    {/* Subtitle meta strip */}
    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-slate-400 group-hover:text-slate-600 transition-colors">
      <span className="font-semibold text-emerald-600 px-1 rounded border border-slate-200 font-mono text-[9px]">
        #{estimate.estimate_number || estimate.id.slice(0, 8)}
      </span>
      <span>•</span>
      <span>{formatShortDate(estimate.created_at)}</span>
    </div>

    {/* Optional description */}
    {estimate.description && (
      <div className="mt-1.5 line-clamp-1 text-[11px] leading-relaxed text-slate-500 group-hover:text-slate-700 transition-colors normal-case">
        {estimate.description}
      </div>
    )}

    {/* Viewed metrics – optional */}
    {(estimate as any).opened_at && (
      <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-1.5 text-[10px] text-slate-500 border border-slate-100 normal-case group-hover:bg-emerald-100/50 group-hover:border-emerald-200 transition-colors">
        <Eye size={11} className="text-slate-400 group-hover:text-emerald-600" />
        <span className="font-medium group-hover:text-slate-700">
          Viewed: {new Date((estimate as any).opened_at).toLocaleDateString()}
        </span>
        {(estimate as any).opened_count > 1 && (
          <span className="bg-emerald-50 text-emerald-700 font-bold px-1 rounded text-[9px]">
            {(estimate as any).opened_count}x
          </span>
        )}
        {(estimate as any).opened_device && (
          <span className="text-slate-400 group-hover:text-slate-500 truncate max-w-[120px]">
            • {(estimate as any).opened_device}
          </span>
        )}
      </div>
    )}
  </div>

  {/* Right panel – amount + action buttons */}
  <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
    <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-800 transition-colors tracking-tight">
      {formatCurrency(estimate.total)}
    </div>
    <div className="flex gap-1 mt-2">
      {/* Copy link button */}
      <button
        onClick={(e) => { e.stopPropagation(); copyLink(estimate); }}
        className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100"
      >
        <Link2 size={12} />
      </button>
      {/* SMS button */}
      <button
        onClick={(e) => { e.stopPropagation(); sendSMSLink(estimate); }}
        className="p-1 rounded-md text-emerald-800 bg-emerald-100 hover:text-emerald-700 hover:bg-emerald-50 transition-colors border border-transparent hover:border-emerald-100"
      >
        <Send size={12} />
      </button>
      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, id: estimate.id, name: estimate.clients?.name || "this estimate" }); }}
        className="p-1 rounded-md text-rose-500 bg-rose-100 hover:text-rose-800 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-100"
      >
        <Trash2 size={12} />
      </button>
    </div>
  </div>
</div>
              );
            })}
          </div>
        </div>

{/* FLOATING ACTION BUTTON SPEED DIAL SYSTEM */}
<div className="fixed bottom-22 right-6 z-50 pointer-events-none">
  {/* Popout Speed Dial List Container */}
  <div className={`absolute bottom-16 right-0 flex flex-col items-end gap-2 transition-all duration-200 origin-bottom ${
    isFabOpen
      ? "scale-100 opacity-100 pointer-events-auto translate-y-0"
      : "scale-90 opacity-0 pointer-events-none translate-y-4"
  }`}>
    
    {/* Speed Dial Item: Trash Action */}
    <div
      className="flex items-center gap-2 group pointer-events-auto"
      onMouseEnter={() => setIsFabOpen(true)}
      onMouseLeave={() => setIsFabOpen(false)}
    >
      <span className="bg-emerald-700 backdrop-blur-xs text-white text-[10px] font-semibold tracking-wide uppercase px-2 py-1 rounded-md shadow-sm">
        Trash Bin
      </span>
      <button
        onClick={() => router.push("/deleted")}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md border border-slate-200 hover:bg-emerald-500 hover:text-white transition"
      >
        <Trash2 size={15} />
      </button>
    </div>

    {/* Speed Dial Item: Create Estimate Action */}
    <div
      className="flex items-center gap-2 group pointer-events-auto"
      onMouseEnter={() => setIsFabOpen(true)}
      onMouseLeave={() => setIsFabOpen(false)}
    >
      <span className="bg-emerald-700 backdrop-blur-xs text-white text-[10px] font-semibold tracking-wide uppercase px-2 py-1 rounded-md shadow-sm">
        New Estimate
      </span>
      <button
        onClick={() => router.push("/estimates/create")}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md hover:bg-emerald-500 transition"
      >
        <FilePlus size={15} />
      </button>
    </div>
  </div>

  {/* Main Fab Trigger Button Accent */}
  <button
    onClick={() => setIsFabOpen(!isFabOpen)}
    onMouseEnter={() => setIsFabOpen(true)}
    onMouseLeave={() => setIsFabOpen(false)}
    className={`flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-500 transition-all duration-300 pointer-events-auto ${
      isFabOpen ? "rotate-45" : "rotate-0"
    }`}
  >
    <Plus size={20} />
  </button>
</div>

        {/* DELETE MODAL UTILITY POPUP */}
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