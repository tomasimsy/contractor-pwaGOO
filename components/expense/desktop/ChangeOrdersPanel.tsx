"use client";

import { useState } from "react";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import DashboardPanel from "./DashboardPanel";
import ChangeOrderModal from "@/components/expense/ChangeOrderModal";
import { formatCurrency } from "@/lib/utils/formatting";
import type { ChangeOrderRow, LedgerEntry, ProjectBundle } from "@/lib/types";
import {
  approveChangeOrder,
  createChangeOrder,
  deleteChangeOrder,
  rejectChangeOrder,
  submitChangeOrder,
  updateChangeOrder,
  type NewChangeOrderInput,
} from "@/lib/queries/changeOrders";
import toast from "react-hot-toast";

const STATUS_STYLE: Record<ChangeOrderRow["status"], string> = {
  draft: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  invoiced: "bg-indigo-100 text-indigo-800",
};

const STATUS_OPTIONS: (ChangeOrderRow["status"] | "all")[] = [
  "all",
  "draft",
  "pending",
  "approved",
  "rejected",
  "invoiced",
];

export default function ChangeOrdersPanel({
  bundle,
  ledger,
  onRefresh,
}: {
  bundle: ProjectBundle;
  ledger: LedgerEntry[];
  onRefresh: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChangeOrderRow | null>(null);

  const filtered = bundle.changeOrders.filter((co) => {
    const matchesStatus = statusFilter === "all" || co.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || co.title.toLowerCase().includes(q) || co.change_order_number.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  function linkedSubtotal(changeOrderId: string) {
    const entries = ledger.filter((e) => e.changeOrderId === changeOrderId);
    return { count: entries.length, total: entries.reduce((sum, e) => sum + e.amount, 0) };
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(co: ChangeOrderRow) {
    setEditing(co);
    setModalOpen(true);
  }

  // Deliberately rethrows on failure — ChangeOrderModal only closes
  // itself after onSave resolves, so a real error needs to propagate
  // rather than being swallowed here, or the modal would close (and the
  // user's input would be lost) even though nothing was actually saved.
  async function handleSave(input: NewChangeOrderInput) {
    try {
      if (editing) {
        await updateChangeOrder(
          editing.id,
          bundle.project.company_id,
          input,
          editing.status as "draft" | "rejected"
        );
        toast.success(editing.status === "rejected" ? "Updated and moved back to draft." : "Change order updated.");
      } else {
        await createChangeOrder(bundle.project.id, bundle.project.company_id, input);
        toast.success("Change order created as a draft.");
      }
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't save the change order.");
      throw err;
    }
  }

  async function handleSubmit(co: ChangeOrderRow) {
    try {
      await submitChangeOrder(co.id, bundle.project.company_id);
      toast.success("Submitted for approval.");
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't submit.");
    }
  }

  async function handleApprove(co: ChangeOrderRow) {
    try {
      await approveChangeOrder(co.id, bundle.project.company_id, bundle.project.id);
      toast.success("Change order approved! Totals updated.");
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't approve.");
    }
  }

  async function handleReject(co: ChangeOrderRow) {
    try {
      await rejectChangeOrder(co.id, bundle.project.company_id);
      toast.success("Change order rejected.");
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't reject.");
    }
  }

  async function handleDelete(co: ChangeOrderRow) {
    if (!confirm(`Delete draft "${co.title}"?`)) return;
    try {
      await deleteChangeOrder(co.id, bundle.project.company_id);
      toast.success("Draft deleted.");
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't delete.");
    }
  }

  return (
    <DashboardPanel
      title="Change Orders"
      accent="amber"
      action={
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={13} />
          New
        </button>
      }
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or CO #"
            className="w-full h-8 pl-8 pr-2 rounded-lg border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-8 rounded-lg border border-gray-200 bg-white text-[13px] px-2 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 transition-colors capitalize"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-[13px] text-gray-400 text-center py-6">
          {bundle.changeOrders.length === 0 ? "No change orders yet." : "No change orders match your filters."}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto -mx-1 px-1">
          {filtered.map((co) => {
            const linked = linkedSubtotal(co.id);
            return (
              <div key={co.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-gray-400">{co.change_order_number}</span>
                      <span className={`text-[11px] font-medium uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[co.status]}`}>
                        {co.status}
                      </span>
                    </div>
                    <div className="text-[13px] text-gray-900 truncate">{co.title}</div>
                    {linked.count > 0 && (
                      <div className="text-xs text-gray-400">
                        {linked.count} linked entr{linked.count === 1 ? "y" : "ies"} · {formatCurrency(linked.total)}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[13px] tabular-nums text-gray-900">
                    {formatCurrency(co.total_amount)}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-2">
                  {co.status === "draft" && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(co)}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubmit(co)}
                        className="text-xs font-medium text-amber-700 hover:text-amber-800"
                      >
                        Submit for Approval
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(co)}
                        className="flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-600 ml-auto"
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </>
                  )}
                  {co.status === "pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApprove(co)}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(co)}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {co.status === "rejected" && (
                    <button
                      type="button"
                      onClick={() => openEdit(co)}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                      <Pencil size={11} /> Edit &amp; Resubmit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ChangeOrderModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        editing={editing}
      />
    </DashboardPanel>
  );
}
