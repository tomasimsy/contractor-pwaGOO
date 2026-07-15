"use client";

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
    <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 sm:flex-wrap sm:overflow-visible">
      {projects.map((project) => {
        const isSelected = project.id === selectedProjectId;
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelect(project.id)}
            className={`shrink-0 text-left rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
              isSelected ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="font-medium">{project.projectName}</span>
            <span className={isSelected ? "text-gray-300" : "text-gray-400"}> · {project.clientName}</span>
          </button>
        );
      })}
    </div>
  );
}
