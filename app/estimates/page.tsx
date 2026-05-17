"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Estimate } from "@/types";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import DeleteModal from "@/components/ui/DeleteModal";
import { Trash2 } from "lucide-react";

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
  const { data } = await supabase
  .from("estimates")
  .select("*, clients(name)")
  .is("deleted_at", null)
  .order("created_at", { ascending: false });

  if (data) setEstimates(data as Estimate[]);
  setLoading(false);
  }

  async function handleDelete() {
  setDeleting(true);

  const { error } = await supabase
  .from("estimates")
  .delete()
  .eq("id", deleteModal.id);

  if (!error) {
  await loadEstimates();
  setDeleteModal({ isOpen: false, id: "", name: "" });
  } else {
  alert("Error deleting estimate");
  }

  setDeleting(false);
  }

const getStatus = (est: Estimate) => {
  if (est.signature)
    return {
      label: "Signed",
      className: "bg-primary text-secondary border-primary",
    };

  if (est.status === "converted")
    return {
      label: "Converted",
      className: "bg-purple-900/20 text-purple-400 border-purple-700/30",
    };

  return {
    label: "Pending",
    className: "bg-yellow-900/20 text-yellow-400 border-yellow-700/30",
  };
};

return (
  <div className="min-h-screen bg-[#f6f7f9] pb-24">

    {/* HEADER */}
    <Header
      title="Estimates"
      backLink="/"
      rightAction={
        <button
          onClick={() => router.push("/estimates/create")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-lg text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          +
        </button>
      }
    />

    {/* CONTENT */}
    <div className="mx-auto max-w-4xl p-4">

      {/* TOP SECTION */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">
            Estimates
          </div>

          <div className="text-sm text-gray-500">
            Manage customer estimates
          </div>
        </div>

        {!loading && estimates.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-400">
              Total
            </div>

            <div className="text-sm font-semibold text-gray-800">
              {estimates.length}
            </div>
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
          <div className="text-sm font-medium text-gray-700">
            No estimates yet
          </div>

          <div className="mt-1 text-xs text-gray-400">
            Create your first estimate to get started
          </div>

          <button
            onClick={() => router.push("/estimates/create")}
            className="mt-4 rounded-xl bg-gray-900 px-4 py-2 text-sm text-white transition hover:bg-black"
          >
            Create Estimate
          </button>
        </div>
      )}

      {/* LIST */}
      <div className="space-y-3">
        {estimates.map((estimate) => {
          const status = getStatus(estimate);

          return (
            <div
              key={estimate.id}
              className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">

                {/* LEFT */}
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => router.push(`/estimates/${estimate.id}`)}
                >
                  <div className="flex items-center gap-2">

                    <div className="truncate text-sm font-semibold text-gray-800">
                      {estimate.clients?.name || "No client"}
                    </div>

                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-gray-400">
                    {formatShortDate(estimate.created_at)}
                  </div>

                  {estimate.description && (
                    <div className="mt-2 line-clamp-1 text-xs leading-5 text-gray-500">
                      {estimate.description}
                    </div>
                  )}
                </div>

                {/* RIGHT */}
                <div className="flex shrink-0 flex-col items-end">

                  <div className="text-sm font-semibold text-gray-900">
                    {formatCurrency(estimate.total)}
                  </div>

                  <button
                    onClick={() =>
                      setDeleteModal({
                        isOpen: true,
                        id: estimate.id,
                        name: estimate.clients?.name || "this estimate",
                      })
                    }
                    className="mt-3 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* DELETE MODAL */}
    <DeleteModal
      isOpen={deleteModal.isOpen}
      onClose={() =>
        setDeleteModal({
          isOpen: false,
          id: "",
          name: "",
        })
      }
      onConfirm={handleDelete}
      title="Delete Estimate"
      message={`Delete ${deleteModal.name}?`}
      deleting={deleting}
      type="estimate"
      id={deleteModal.id}
    />
  </div>
);
  }