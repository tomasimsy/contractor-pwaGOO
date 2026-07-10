"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId"; // 👈 import

interface Milestone {
  milestone_order: number;
  title: string;
  note: React.ReactNode;
  completed_at: string | null;
}

interface ProgressDisplayProps {
  estimateId: string;
  projects: { name: string; total: number }[];
  hasPayment?: boolean;
  paymentNote?: string;
  totalPaid?: number;
  overallTotal?: number;
  refreshKey?: number;
}

export default function ProgressDisplay({
  estimateId,
  projects,
  hasPayment = false,
  paymentNote = "",
  totalPaid = 0,
  overallTotal = 0,
  refreshKey = 0,
}: ProgressDisplayProps) {
  const [milestonesMap, setMilestonesMap] = useState<Record<string, Milestone[]>>({});

  const loadProgress = useCallback(async () => {
    // Get company_id once
    const companyId = await getCompanyId();
    if (!companyId) {
      console.warn("No company_id – skipping progress load");
      return;
    }

    const { data, error } = await supabase
      .from("project_milestones")
      .select("*")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId) // 👈 filter by company
      .order("milestone_order");

    if (error) {
      console.error("Error loading milestones:", error);
      return;
    }

    if (data) {
      const map: Record<string, Milestone[]> = {};
      data.forEach((m) => {
        if (!map[m.project_name]) map[m.project_name] = [];
        map[m.project_name].push({
          ...m,
          note: m.note,
        });
      });
      setMilestonesMap(map);
    }
  }, [estimateId]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress, refreshKey]);

  const getProgressWidth = (milestones: Milestone[]) => {
    const completed = milestones.filter((m) => m.completed_at).length;
    return (completed / milestones.length) * 100;
  };

  const renderedItems = useMemo(() => {
    return projects
      .map((project) => {
        let milestones = milestonesMap[project.name] || [];
        let paymentMilestone: Milestone | null = null;
        if (hasPayment && overallTotal > 0 && project.total > 0) {
          const projectPaid = (project.total / overallTotal) * totalPaid;
          const paidPercent = (projectPaid / project.total) * 100;
          paymentMilestone = {
            milestone_order: 0,
            title: "Payment",
            note: (
              <div className="space-y-1">
                <div className="text-[9px] text-emerald-700">Payment received: {paymentNote}</div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, paidPercent)}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-emerald-700 font-medium">{Math.round(paidPercent)}%</span>
                </div>
              </div>
            ),
            completed_at: new Date().toISOString(),
          };
        }
        const allMilestones = paymentMilestone ? [paymentMilestone, ...milestones] : milestones;
        if (allMilestones.length === 0) return null;

        const startedMilestone = milestones.find((m) => m.milestone_order === 1);
        const hasStarted = !!startedMilestone?.note && (typeof startedMilestone.note === 'string' ? startedMilestone.note.trim() !== '' : true);
        if (!hasStarted && !hasPayment) return null;

        const progressPercent = getProgressWidth(allMilestones);
        const lastCompleted = [...allMilestones].reverse().find(m => m.completed_at);
        const activeNote = lastCompleted?.note || null;

        return (
          <div key={project.name} className="border-b border-slate-100 last:border-0 pb-2">
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-[9px] text-slate-700 leading-none whitespace-nowrap flex items-center h-2">
                Project Progress:
              </span>
              <div className="relative flex-1 h-2 flex items-center">
                <div className="absolute left-0 right-0 h-px bg-slate-200" />
                <div
                  className="absolute left-0 h-px bg-emerald-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
                <div className="relative flex justify-between w-full">
                  {allMilestones.map((m, idx) => (
                    <div
                      key={m.milestone_order || idx}
                      className="flex flex-col items-center"
                      style={{ width: `${100 / allMilestones.length}%` }}
                    >
                      <div
                        className={`w-2 h-2 rounded-full transition-colors ${
                          m.completed_at ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <span className="font-bold text-emerald-600 whitespace-nowrap leading-none">
                {progressPercent}%
              </span>
            </div>
            <div className="flex justify-between -mt-1">
              {allMilestones.map((m, idx) => (
                <span
                  key={m.milestone_order || idx}
                  className={`text-[7px] text-center w-full px-[1px] truncate ${
                    m.completed_at
                      ? "text-emerald-700 font-medium"
                      : "text-slate-400"
                  }`}
                >
                  {m.title}
                </span>
              ))}
            </div>
            {activeNote && (
              <div className="text-[8px] text-amber-700 bg-amber-50/70 rounded px-1.5 py-0.5 italic truncate">
                {typeof activeNote === "string" ? activeNote : activeNote}
              </div>
            )}
          </div>
        );
      })
      .filter(Boolean);
  }, [projects, milestonesMap, hasPayment, paymentNote, totalPaid, overallTotal]);

  if (renderedItems.length === 0) return null;

  return <div className="space-y-2 mt-2">{renderedItems}</div>;
}