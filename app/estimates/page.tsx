"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import {
  getCompletedEstimates,
  estimateHasFinancialHistory
} from "@/lib/queries/estimates";
import { Estimate } from "@/types";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import DeleteModal from "@/components/ui/DeleteModal";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import ProjectFinancialPills from "@/components/shared/ProjectFinancialPills";
import { getCompanyProjectFinancialSummaries, type ProjectFinancialSummary } from "@/lib/queries/expenses";
import { Send, Trash2, MessageCircle, Link2, Plus, FilePlus, Eye, Search, ArrowRight, Receipt, Archive } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

type TabType = "all" | "completed";

interface DeleteModalState {
  isOpen: boolean;
  id: string;
  name: string;
  hasHistory: boolean;
}

export default function EstimatesPage() {
  const router = useRouter();

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabType>("all");
  const [financials, setFinancials] = useState<Map<string, ProjectFinancialSummary>>(new Map());
  const [companyId, setCompanyId] = useState<string>("");

  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    id: "",
    name: "",
    hasHistory: false,
  });
  const [deleting, setDeleting] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const cid = await getCompanyId();
        if (cid) {
          setCompanyId(cid);
          await loadEstimates(cid, "all");
          const finMap = await getCompanyProjectFinancialSummaries(cid);
          setFinancials(finMap);
        }
      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };
    init();
  }, []);

  const loadEstimates = useCallback(async (cid: string, selectedTab: TabType) => {
    try {
      setLoading(true);

      let response;
      if (selectedTab === "completed") {
        response = await getCompletedEstimates(cid);
      } else {
        // All estimates (default)
        response = await supabase
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
          .eq("company_id", cid)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
      }

      if (response.error) throw response.error;
      setEstimates(response.data || []);
    } catch (error) {
      console.error("Error loading estimates:", error);
      toast.error("Failed to load estimates");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTabChange = (newTab: TabType) => {
    setTab(newTab);
    loadEstimates(companyId, newTab);
  };

  // Client-side search matching
  const filteredEstimates = estimates.filter((est) => {
    const matchesSearch =
      !search ||
      est.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      est.title?.toLowerCase().includes(search.toLowerCase()) ||
      (est.estimate_number || est.id.slice(0, 8))
        .toString()
        .includes(search);

    return matchesSearch;
  });

  const handleDelete = async () => {
    const targetId = deleteModal.id;
    setDeleting(true);
    const previousEstimates = [...estimates];

    try {
      const response = await fetch(`/api/estimates/${targetId}/delete`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        // Has financial history - suggest archive
        if (data.hasFinancialHistory) {
          setDeleteModal({ isOpen: false, id: "", name: "", hasHistory: false });
          toast.error("Cannot delete estimate with financial records. Archive it instead?");
          return;
        }
        throw new Error(data.error || "Failed to delete estimate");
      }

      setEstimates((prev) => prev.filter((est) => est.id !== targetId));
      setDeleteModal({ isOpen: false, id: "", name: "", hasHistory: false });
      toast.success("Estimate deleted");
    } catch (error) {
      console.error("Deletion failed:", error);
      toast.error("Error deleting estimate");
      setEstimates(previousEstimates);
    } finally {
      setDeleting(false);
    }
  };

  const handleArchive = async (estimateId: string) => {
    try {
      const response = await fetch(`/api/estimates/${estimateId}/delete`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Failed to archive estimate");
      }

      setEstimates((prev) => prev.filter((est) => est.id !== estimateId));
      setDeleteModal({ isOpen: false, id: "", name: "", hasHistory: false });
      toast.success("Estimate archived");
    } catch (error) {
      console.error("Archive failed:", error);
      toast.error("Error archiving estimate");
    }
  };

  const openDeleteModal = async (estimate: Estimate) => {
    const hasHistory = await estimateHasFinancialHistory(estimate.id, companyId);

    setDeleteModal({
      isOpen: true,
      id: estimate.id,
      name: estimate.clients?.name || "this estimate",
      hasHistory,
    });
  };

  const getEstimateUrl = (id: string) => `${window.location.origin}/public/estimates/${id}`;

  const sendSMSLink = (estimate: Estimate) => {
    const phoneNumber = estimate.clients?.phone;

    if (!phoneNumber) {
      toast.error("No phone number on file. Please add a phone number to this client first.");
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
    });
  };

  const getStatusLabel = (est: Estimate) => {
    const status = est.status || "draft";

    const statusMap: Record<string, { label: string; className: string }> = {
      draft: { label: "Draft", className: "bg-slate-50 text-slate-700 border border-slate-100" },
      sent: { label: "Sent", className: "bg-blue-50 text-blue-700 border border-blue-100" },
      viewed: { label: "Viewed", className: "bg-purple-50 text-purple-700 border border-purple-100" },
      approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 border border-emerald-100" },
      converted_to_invoice: { label: "Converted", className: "bg-teal-50 text-teal-700 border border-teal-100" },
      project_in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-700 border border-amber-100" },
      completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border border-emerald-100" },
      archived: { label: "Archived", className: "bg-gray-50 text-gray-700 border border-gray-100" },
      cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 border border-rose-100" },
    };

    return statusMap[status] || { label: "Unknown", className: "bg-gray-50 text-gray-700 border border-gray-100" };
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/60 p-6 text-center text-xs font-medium text-slate-400 tracking-wide">
        Loading estimates system...
      </div>
    );
  }

  const tabLabels: Record<TabType, string> = {
    completed: "Completed",
    all: "All",
  };

  return (
    <ProtectedRoute>
      <DesktopShell
        title="Estimates"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search estimates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 transition-colors"
              />
            </div>
            <button
              onClick={() => router.push("/deleted")}
              className="h-8 px-3 rounded-lg text-[13px] font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Trash
            </button>
            <button
              onClick={() => router.push("/estimates/create")}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 text-white text-[13px] font-medium hover:bg-gray-800 transition-colors"
            >
              <Plus size={14} /> New Estimate
            </button>
          </div>
        }
      >
        <div className="min-h-screen md:min-h-0 bg-slate-50/50 md:bg-transparent pb-28 md:pb-0 relative font-sans antialiased">
          {/* Sticky Header */}
          <div className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-md md:hidden">
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

              <div className="relative flex-1 max-w-md">
                <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search estimates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs focus:bg-white focus:outline-hidden focus:border-[#05291e] transition-all"
                />
              </div>

              <div className="hidden md:flex items-center gap-2 shrink-0">
                <button
                  onClick={() => router.push("/deleted")}
                  className="text-xs font-medium text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  🗑️ Trash
                </button>
                <button
                  onClick={() => router.push("/estimates/create")}
                  className="flex h-8 px-3 items-center gap-1.5 rounded-lg bg-[#05291e] text-xs font-semibold text-white shadow-sm hover:bg-[#0b3c2d] transition"
                >
                  <Plus size={14} />
                  New
                </button>
              </div>
            </div>
          </div>

          {/* Main Layout */}
          <div className="mx-auto max-w-4xl md:max-w-none md:mx-0 p-4 md:p-0">

            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[16px] uppercase font-bold text-emerald-700 tracking-tight">{tabLabels[tab]} Estimates</div>
                <div className="text-xs text-slate-500">
                  {tab === "completed" && "Finished projects"}
                  {tab === "all" && "All estimates in progress and completed"}
                </div>
              </div>

              {!loading && filteredEstimates.length > 0 && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-1 text-center shadow-xs">
                  <div className="text-[9px] uppercase tracking-wider font-bold text-emerald-800">Total</div>
                  <div className="text-xs font-bold text-emerald-950">{filteredEstimates.length}</div>
                </div>
              )}
            </div>

            {/* Tab Navigation */}
            <div className="mb-4 flex flex-wrap gap-2">
              {(["all", "completed"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    tab === t
                      ? "bg-emerald-600 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tabLabels[t]}
                </button>
              ))}
            </div>

            {/* Empty State */}
            {!loading && filteredEstimates.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center shadow-sm max-w-md mx-auto mt-8 p-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-3">
                  <FilePlus size={22} />
                </div>
                <div className="text-sm font-semibold text-slate-800">No {tabLabels[tab].toLowerCase()} estimates found</div>
                <div className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">
                  {search ? "No records match your search criteria." : `Create estimates to get started.`}
                </div>
                {!search && tab === "all" && (
                  <button
                    onClick={() => router.push("/estimates/create")}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#05291e] px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#0b3c2d] transition"
                  >
                    <Plus size={14} /> Create Estimate
                  </button>
                )}
              </div>
            )}

            {/* Estimates List */}
            <div className="space-y-2">
              {filteredEstimates.map((estimate, index) => {
                const statusLabel = getStatusLabel(estimate);
                return (
                  <div
                    key={estimate.id}
                    className={`group rounded-xl border-l-4 border-emerald-500 p-2.5 py-1.5 shadow-2xs transition-all duration-150 flex items-start gap-2 ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                    } hover:bg-emerald-50 hover:border-emerald-200`}
                  >
                    <div className="flex h-full items-center text-emerald-700 group-hover:text-emerald-700 transition-colors">
                      <ArrowRight size={14} className="shrink-0" />
                    </div>

                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => router.push(`/estimates/${estimate.id}`)}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="truncate text-xs font-bold text-slate-800 group-hover:text-emerald-800 transition-colors tracking-tight">
                          {estimate.clients?.name || "No client"}
                        </div>
                        <span className="font-semibold text-emerald-600 px-1 rounded border border-slate-200 font-mono text-[9px]">
                          #{estimate.estimate_number || estimate.id.slice(0, 8)}
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-emerald-600 px-1 rounded border border-slate-200 font-mono text-[9px]">
                          {formatShortDate(estimate.created_at)}
                        </span>

                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase ${statusLabel.className}`}>
                          {statusLabel.label}
                        </span>
                      </div>

                      {estimate.title && (
                        <div className="truncate text-[11px] font-semibold text-slate-600 group-hover:text-slate-700 transition-colors normal-case">
                          {estimate.title}
                        </div>
                      )}

                      <div className="hidden md:block">
                        <ProjectFinancialPills estimateId={estimate.id} summary={financials.get(estimate.id)} />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
                      <div className="text-xs font-semibold text-slate-900">
                        {formatCurrency(estimate.total)}
                      </div>

                      <div className="flex items-center gap-1 mt-2">
                        <Link
                          href={`/expense?project=${estimate.id}`}
                          onClick={(e) => e.stopPropagation()}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
                          title="Expenses"
                        >
                          <Receipt size={12} />
                        </Link>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyLink(estimate);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
                          title="Copy Link"
                        >
                          <Link2 size={12} />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            sendSMSLink(estimate);
                          }}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
                          title="Send SMS"
                        >
                          <Send size={12} />
                        </button>

                        {deleteModal.hasHistory && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchive(estimate.id);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Archive"
                          >
                            <Archive size={12} />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteModal(estimate);
                          }}
className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-red-600 hover:text-red-700 hover:bg-slate-50 transition-colors"                          title={deleteModal.hasHistory ? "Cannot delete - archive instead" : "Delete"}
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

          {/* Floating Action Button */}
          <div className="fixed bottom-22 right-6 z-50 pointer-events-none">
            <div className={`absolute bottom-16 right-0 flex flex-col items-end gap-2 transition-all duration-200 origin-bottom ${
              isFabOpen
                ? "scale-100 opacity-100 pointer-events-auto translate-y-0"
                : "scale-90 opacity-0 pointer-events-none translate-y-4"
            }`}>

              <div
                className="flex items-center gap-2 group pointer-events-auto"
                onMouseEnter={() => setIsFabOpen(true)}
                onMouseLeave={() => setIsFabOpen(false)}
              >
                <span className="bg-emerald-700 backdrop-blur-xs text-white text-[10px] font-semibold tracking-wide uppercase px-2 py-1 rounded-md shadow-sm">
                  Trash
                </span>
                <button
                  onClick={() => router.push("/deleted")}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md border border-slate-200 hover:bg-emerald-500 transition"
                >
                  <Trash2 size={15} />
                </button>
              </div>

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

          {/* Delete Modal */}
          <DeleteModal
            isOpen={deleteModal.isOpen}
            onClose={() => setDeleteModal({ isOpen: false, id: "", name: "", hasHistory: false })}
            onConfirm={handleDelete}
            title={deleteModal.hasHistory ? "Archive Estimate" : "Delete Estimate"}
            message={
              deleteModal.hasHistory
                ? `"${deleteModal.name}" has financial records. Archive it instead of deleting?`
                : `Move "${deleteModal.name}" to trash? You can restore it later.`
            }
            deleting={deleting}
          />
        </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}
