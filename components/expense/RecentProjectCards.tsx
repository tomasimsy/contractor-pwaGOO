"use client";

import { Clock } from "lucide-react";
import type { ProjectSummary } from "@/lib/types";

export default function RecentProjectCards({
  projects,
  selectedProjectId,
  onSelect,
}: {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
        <Clock size={11} /> Recent
      </div>
      {/* Horizontal scroll on mobile so 5 cards never wrap or crowd a
          narrow screen; grid on wider viewports. */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:grid sm:grid-cols-5 sm:overflow-visible">
        {projects.map((project) => {
          const isSelected = project.id === selectedProjectId;
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelect(project.id)}
              className={`shrink-0 w-40 sm:w-auto text-left rounded-xl border p-3 min-h-[64px] active:scale-[0.98] transition ${
                isSelected
                  ? "bg-slate-800 border-slate-800 text-white"
                  : "bg-white border-slate-200/70 text-slate-700 hover:border-slate-300"
              }`}
            >
              <div
                className={`text-[10px] font-bold uppercase tracking-wide truncate ${
                  isSelected ? "text-slate-300" : "text-slate-400"
                }`}
              >
                #{project.estimateNumber}
              </div>
              <div className="text-sm font-bold truncate mt-0.5">{project.projectName}</div>
              <div className={`text-xs truncate ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                {project.clientName}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}