"use client";

import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useProjectSearch } from "@/lib/hooks/useProjectSearch";
import type { ProjectSummary } from "@/lib/types";

export default function ProjectCombobox({
  onSelect,
}: {
  onSelect: (project: ProjectSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const { results, isLoading } = useProjectSearch(query);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSelect(project: ProjectSummary) {
    setQuery("");
    setIsOpen(false);
    onSelect(project);
    inputRef.current?.blur();
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder="Search by estimate #, client, or project title"
          className="w-full h-11 pl-9 pr-9 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-300"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-20 mt-1.5 w-full max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {isLoading && results.length === 0 ? (
            <div className="p-3 text-xs text-slate-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-xs text-slate-400">
              {query ? `No projects match "${query}"` : "No projects found"}
            </div>
          ) : (
            <ul>
              {results.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(project)}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-bold text-slate-800">{project.projectName}</span>
                      <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">
                        #{project.estimateNumber}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">{project.clientName}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}