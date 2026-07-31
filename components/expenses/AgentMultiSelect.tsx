"use client";

/**
 * Agent multi-select for commission allocation.
 *
 * Allows searching and adding multiple agents to a commission pool.
 * Each agent receives an equal split of the total commission.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import type { DirectoryAdapter, DirectoryOption } from "@/components/shared/CreateOrSelect";

export function AgentMultiSelect({
  adapter,
  selectedAgents,
  onAddAgent,
  onRemoveAgent,
}: {
  adapter: DirectoryAdapter;
  selectedAgents: Array<{ id: string; label: string }>;
  onAddAgent: (agent: { id: string; label: string }) => void;
  onRemoveAgent: (agentId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search agents as the query changes
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    adapter
      .search(query)
      .then((res) => {
        setResults(res);
        setIsSearching(false);
      })
      .catch((err) => {
        console.error("Agent search error:", err);
        setIsSearching(false);
      });
  }, [query, adapter]);

  const selectedIds = useMemo(() => new Set(selectedAgents.map((a) => a.id)), [selectedAgents]);

  // Filter results to exclude already-selected agents
  const availableResults = useMemo(
    () => results.filter((r) => r.id && !selectedIds.has(r.id)),
    [results, selectedIds]
  );

  const handleAddAgent = useCallback(
    (option: DirectoryOption) => {
      if (option.id && !selectedIds.has(option.id)) {
        onAddAgent({ id: option.id, label: option.label });
        setQuery("");
        setResults([]);
        inputRef.current?.focus();
      }
    },
    [selectedIds, onAddAgent]
  );

  const handleCreateNew = useCallback(async () => {
    if (!query.trim()) return;

    try {
      setIsSearching(true);
      const newAgent = await adapter.create?.({ name: query.trim() });
      if (newAgent) {
        handleAddAgent(newAgent);
      }
    } catch (err) {
      console.error("Failed to create agent:", err);
    } finally {
      setIsSearching(false);
    }
  }, [query, adapter, handleAddAgent]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search agents or create new…"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
        />

        {isOpen && (query.trim() || availableResults.length > 0) && (
          <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border border-input bg-card shadow-lg">
            {isSearching ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
            ) : availableResults.length > 0 ? (
              <>
                <ul className="divide-y divide-border">
                  {availableResults.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => {
                          handleAddAgent(option);
                          setIsOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:bg-muted"
                      >
                        <div className="font-medium text-foreground">{option.label}</div>
                        {option.hint && <div className="text-xs text-muted-foreground">{option.hint}</div>}
                      </button>
                    </li>
                  ))}
                </ul>
                {query.trim() && adapter.create && (
                  <button
                    type="button"
                    onClick={() => {
                      handleCreateNew();
                      setIsOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted flex items-center gap-2"
                  >
                    <Plus className="size-3" />
                    Create "{query.trim()}"
                  </button>
                )}
              </>
            ) : query.trim() ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {adapter.create ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleCreateNew();
                      setIsOpen(false);
                    }}
                    className="text-primary font-medium hover:underline flex items-center gap-1"
                  >
                    <Plus className="size-3" />
                    Create "{query.trim()}"
                  </button>
                ) : (
                  "No agents found"
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Click outside to close dropdown */}
        {isOpen && (
          <div
            className="fixed inset-0 z-0"
            onClick={() => setIsOpen(false)}
          />
        )}
      </div>

      {/* Selected agents */}
      <div className="space-y-1.5">
        {selectedAgents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2 border border-primary/20"
          >
            <span className="text-sm font-medium text-foreground">{agent.label}</span>
            <button
              type="button"
              onClick={() => onRemoveAgent(agent.id)}
              aria-label={`Remove ${agent.label}`}
              className="rounded-lg p-1 text-muted-foreground hover:bg-primary/20 hover:text-primary"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {selectedAgents.length === 0 && (
        <p className="text-xs text-warning">No agents selected. Add agents to allocate commission.</p>
      )}
    </div>
  );
}
