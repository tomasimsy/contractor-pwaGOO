"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";

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
    const { data } = await supabase
      .from("project_milestones")
      .select("*")
      .eq("estimate_id", estimateId)
      .order("milestone_order");
    if (data) {
      const map: Record<string, Milestone[]> = {};
      data.forEach((m) => {
        if (!map[m.project_name]) map[m.project_name] = [];
        map[m.project_name].push({
          ...m,
          note: m.note, // note is string from DB, will be displayed as plain text
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
          <div key={project.name} className="bg-gradient-to-br from-amber-50 via-white to-amber-50/60 rounded-xl border border-amber-200/80 shadow-sm hover:shadow-md transition-shadow p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_3px_#10b981]" />
              <span className="text-[11px] font-bold text-emerald-800 truncate tracking-tight">Track Project Progress: {project.name}</span>
            </div>

            {/* Timeline dots */}
            <div className="relative mb-1.5">
              <div className="absolute top-1/2 left-0 w-full h-px border-t border-dotted border-amber-300/70 -translate-y-1/2" />
              <div
                className="absolute top-1/2 left-0 h-px bg-gradient-to-r from-emerald-500 to-emerald-400 -translate-y-1/2 transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
              <div className="relative flex justify-between items-center">
                {allMilestones.map((m, idx) => (
                  <div key={m.milestone_order || idx} className="flex flex-col items-center">
                    <div
                      className={`w-2.5 h-2.5 rounded-full z-10 transition-all ${
                        m.completed_at
                          ? 'bg-emerald-500 shadow-[0_0_6px_#10b981] ring-1 ring-emerald-300'
                          : 'bg-slate-300'
                      }`}
                    />
                    <span className={`text-[8px] mt-0.5 ${m.completed_at ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                      {m.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Active note (can be JSX, like the payment milestone) */}
            {activeNote && (
              <div className="mt-1">
                {typeof activeNote === 'string' ? (
                  <div className="text-[9px] text-amber-800 bg-amber-100/80 rounded-md px-1.5 py-0.5 italic shadow-inner">
                    {activeNote}
                  </div>
                ) : (
                  activeNote
                )}
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