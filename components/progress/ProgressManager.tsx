"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { X } from "lucide-react";
import toast from "react-hot-toast";

interface ProgressManagerProps {
  estimateId: string;
  projectName: string;
  onRefresh: () => void;
}

export default function ProgressManager({ estimateId, projectName, onRefresh }: ProgressManagerProps) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    started_note: "",
    progress_note: "",
    completed_note: "",
  });

  useEffect(() => {
    if (showModal) loadExisting();
  }, [showModal]);

  async function loadExisting() {
    const { data } = await supabase
      .from("project_progress")
      .select("*")
      .eq("estimate_id", estimateId)
      .eq("project_name", projectName)
      .single();
    if (data) {
      setForm({
        started_note: data.started_note || "",
        progress_note: data.progress_note || "",
        completed_note: data.completed_note || "",
      });
    } else {
      setForm({ started_note: "", progress_note: "", completed_note: "" });
    }
  }

  async function saveProgress() {
    setLoading(true);
    const { error } = await supabase
      .from("project_progress")
      .upsert({
        estimate_id: estimateId,
        project_name: projectName,
        started_note: form.started_note,
        progress_note: form.progress_note,
        completed_note: form.completed_note,
        updated_at: new Date().toISOString(),
      }, { onConflict: "estimate_id, project_name" });
    setLoading(false);
    if (error) {
      toast.error("Failed to save progress");
    } else {
      toast.success("Progress saved");
      setShowModal(false);
      onRefresh();
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="ml-2 text-[9px] text-blue-500 underline hover:text-blue-700"
      >
        Track Progress
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800">Track Progress – {projectName}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Started (note)</label>
                <textarea
                  rows={2}
                  value={form.started_note}
                  onChange={(e) => setForm({ ...form, started_note: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm"
                  placeholder="What has started? (optional)"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">In Progress (note)</label>
                <textarea
                  rows={2}
                  value={form.progress_note}
                  onChange={(e) => setForm({ ...form, progress_note: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm"
                  placeholder="What is currently happening? (optional)"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Completed (note)</label>
                <textarea
                  rows={2}
                  value={form.completed_note}
                  onChange={(e) => setForm({ ...form, completed_note: e.target.value })}
                  className="w-full border rounded-lg p-2 text-sm"
                  placeholder="What has been completed? (optional)"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={saveProgress} disabled={loading} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-50">
                {loading ? "Saving..." : "Save Progress"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}