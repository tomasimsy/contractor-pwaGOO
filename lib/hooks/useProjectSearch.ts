"use client";

import { useEffect, useRef, useState } from "react";
import { searchProjects } from "@/lib/queries/projects";
import type { ProjectSummary } from "@/lib/types";

const DEBOUNCE_MS = 200;

/** Debounces keystrokes and re-queries Supabase as the user types.
 * Requests are sequenced with a request id so a slow early response
 * can't clobber a faster later one. */
export function useProjectSearch(query: string) {
  const [results, setResults] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++latestRequestId.current;
    setIsLoading(true);

    const timeout = setTimeout(async () => {
      try {
        const data = await searchProjects(query);
        if (requestId === latestRequestId.current) {
          setResults(data);
        }
      } finally {
        if (requestId === latestRequestId.current) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  return { results, isLoading };
}