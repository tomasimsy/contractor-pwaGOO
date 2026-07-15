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
    <div className="relative w-full">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder="Search by estimate #, client, or project"
          className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 transition-colors"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-20 mt-1.5 w-full max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-md shadow-gray-200/50">
          {isLoading && results.length === 0 ? (
            <div className="p-3 text-xs text-gray-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-xs text-gray-400">
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
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px] font-medium text-gray-900">{project.projectName}</span>
                      <span className="text-xs text-gray-400 shrink-0">#{project.estimateNumber}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">{project.clientName}</div>
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
