"use client";

import { User, Phone } from "lucide-react";
import type { ProjectBundle } from "@/lib/types";

export default function ProjectHeader({ bundle }: { bundle: ProjectBundle }) {
  const { project, client } = bundle;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Estimate #{project.estimate_number ?? "—"}
          </div>
          <div className="text-base font-black text-slate-800 truncate">
            {project.title || "Untitled Estimate"}
          </div>
        </div>
        {project.status && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 rounded-full px-2 py-1">
            {project.status}
          </span>
        )}
      </div>

      {client && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <User size={12} className="shrink-0" />
            <span className="truncate">{client.name}</span>
          </div>
          {client.phone && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Phone size={12} className="shrink-0" />
              <span className="truncate">{client.phone}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}