"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { X, CheckCircle, Circle } from "lucide-react";
import toast from "react-hot-toast";
import { getCompanyId } from "@/lib/supabase/getCompanyId"; // 👈 import

interface Milestone {
  id?: string;
  milestone_order: number;
  title: string;
  note: string;
  completed_at: string | null;
}

interface ProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimateId: string;
  projects: { name: string }[];
  onSaved: () => void;
}

const DEFAULT_MILESTONES = [
  { order: 1, title: "Started" },
  { order: 2, title: "In Progress" },
  { order: 3, title: "Completed" },
];

export default function ProgressModal({ isOpen, onClose, estimateId, projects, onSaved }: ProgressModalProps) {
  const [loading, setLoading] = useState(false);
  const [milestonesMap, setMilestonesMap] = useState<Record<string, Milestone[]>>({});
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Fetch company_id once when modal opens
  useEffect(() => {
    const fetchCompany = async () => {
      const cid = await getCompanyId();
      setCompanyId(cid);
    };
    if (isOpen) fetchCompany();
  }, [isOpen]);

  // Load milestones only when modal opens and we have companyId
  useEffect(() => {
    if (isOpen && companyId) {
      loadAllMilestones();
    }
  }, [isOpen, companyId]);

  async function loadAllMilestones() {
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    const { data, error } = await supabase
      .from("project_milestones")
      .select("*")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId) // 👈 filter by company
      .order("project_name")
      .order("milestone_order");

    if (error) {
      console.error("Error loading milestones:", error);
      toast.error("Failed to load milestones");
      return;
    }

    if (data) {
      const map: Record<string, Milestone[]> = {};
      data.forEach((m) => {
        if (!map[m.project_name]) map[m.project_name] = [];
        map[m.project_name].push(m);
      });
      setMilestonesMap(map);
    }
  }

  const getMilestonesForProject = (projectName: string): Milestone[] => {
    const existing = milestonesMap[projectName] || [];
    const result = DEFAULT_MILESTONES.map((def) => {
      const found = existing.find((m) => m.milestone_order === def.order);
      return found || {
        milestone_order: def.order,
        title: def.title,
        note: "",
        completed_at: null,
      };
    });
    return result;
  };

  const updateMilestone = (projectName: string, milestoneOrder: number, field: "note" | "completed_at", value: any) => {
    setMilestonesMap((prev) => {
      const newMap = { ...prev };
      const projectMilestones = [...(prev[projectName] || [])];
      const idx = projectMilestones.findIndex((m) => m.milestone_order === milestoneOrder);
      if (idx >= 0) {
        projectMilestones[idx] = { ...projectMilestones[idx], [field]: value };
      } else {
        const defaultMilestone = DEFAULT_MILESTONES.find((d) => d.order === milestoneOrder)!;
        projectMilestones.push({
          milestone_order: milestoneOrder,
          title: defaultMilestone.title,
          note: field === "note" ? value : "",
          completed_at: field === "completed_at" ? value : null,
        });
      }
      newMap[projectName] = projectMilestones;
      return newMap;
    });
  };

  const saveAll = async () => {
    if (!companyId) {
      toast.error("Company not found");
      return;
    }
    setLoading(true);
    const records = [];
    for (const [projectName, milestones] of Object.entries(milestonesMap)) {
      for (const m of milestones) {
        records.push({
          estimate_id: estimateId,
          project_name: projectName,
          milestone_order: m.milestone_order,
          title: m.title,
          note: m.note || null,
          completed_at: m.completed_at || null,
          updated_at: new Date().toISOString(),
          company_id: companyId, // 👈 add company_id
        });
      }
    }

    // Upsert all records
    for (const record of records) {
      const { error } = await supabase
        .from("project_milestones")
        .upsert(record, { onConflict: "estimate_id, project_name, milestone_order" });

      if (error) {
        console.error("Upsert error for", record.project_name, record.milestone_order, error);
        toast.error(`Failed to save ${record.project_name}: ${error.message}`);
        setLoading(false);
        return;
      }
    }
    toast.success("All progress saved");
    setLoading(false);
    onSaved();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Project Milestones</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-6">
          {projects.length === 0 ? (
            <div className="text-center text-gray-400">No projects found</div>
          ) : (
            projects.map((project) => {
              const milestones = getMilestonesForProject(project.name);
              return (
                <div key={project.name} className="border rounded-lg p-4">
                  <h4 className="font-semibold text-gray-800 mb-3">{project.name}</h4>
                  <div className="space-y-4">
                    {milestones.map((milestone) => (
                      <div key={milestone.milestone_order} className="border-l-2 border-slate-200 pl-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                updateMilestone(
                                  project.name,
                                  milestone.milestone_order,
                                  "completed_at",
                                  milestone.completed_at ? null : new Date().toISOString()
                                )
                              }
                              className="focus:outline-none"
                            >
                              {milestone.completed_at ? (
                                <CheckCircle size={16} className="text-emerald-600" />
                              ) : (
                                <Circle size={16} className="text-slate-400" />
                              )}
                            </button>
                            <span className="text-sm font-medium text-slate-800">{milestone.title}</span>
                          </div>
                        </div>
                        <textarea
                          rows={2}
                          value={milestone.note || ""}
                          onChange={(e) =>
                            updateMilestone(project.name, milestone.milestone_order, "note", e.target.value)
                          }
                          className="w-full border rounded-lg p-2 text-sm mt-1"
                          placeholder={`Notes for ${milestone.title} (optional)`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="sticky bottom-0 bg-white border-t px-5 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={saveAll} disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-50">
            {loading ? "Saving..." : "Save All Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}