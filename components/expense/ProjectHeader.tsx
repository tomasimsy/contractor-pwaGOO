"use client";

import { User, Phone } from "lucide-react";
import type { ProjectBundle } from "@/lib/types";

export default function ProjectHeader({ bundle }: { bundle: ProjectBundle }) {
  const { project, client } = bundle;

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="text-[13px] text-gray-400">Estimate #{project.estimate_number ?? "—"}</div>
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight truncate mt-0.5">
          {project.title || "Untitled Estimate"}
        </h1>
        {client && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[13px] text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <User size={13} className="text-gray-400" />
              {client.name}
            </span>
            {client.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={13} className="text-gray-400" />
                {client.phone}
              </span>
            )}
          </div>
        )}
      </div>
      {project.status && (
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-500 border border-gray-200 rounded px-2 py-0.5">
          {project.status}
        </span>
      )}
    </div>
  );
}
