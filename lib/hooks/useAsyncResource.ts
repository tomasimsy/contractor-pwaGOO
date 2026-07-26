"use client";

/**
 * THE fetch/loading/error pattern every read-only component in this
 * app was re-implementing by hand: `useState(null) + useEffect(() =>
 * fetcher().then(setState))`, with no loading indicator and no error
 * handling at all if the promise rejected (ChangeOrdersPanel,
 * SubcontractorPayablesTable, AgentPayablesTable all had the exact
 * same shape — found during the optimization pass). One hook, reused
 * everywhere a component needs "fetch this from a service and show
 * it," instead of a fifth copy of the same six lines.
 *
 * Still just orchestration — no business logic. The fetcher passed in
 * is always a direct service call (e.g. `() =>
 * financialEngine.getPayablesSummary(...)`); this hook never touches
 * Supabase or a calculation itself.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAsyncResource<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  // Kept in sync via its own effect (runs after render, every render) —
  // not a plain top-level assignment, which the React Compiler's
  // linting correctly flags as a render-time ref mutation. Declared
  // BEFORE the fetch effect below so it's guaranteed to run first on
  // every render (React runs a component's effects in declaration
  // order), meaning the fetch effect always sees the latest fetcher.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    // Fetch-on-mount/deps-change is the entire point of this hook — this
    // effect IS the synchronization with an external system (a service
    // call) that react-hooks/set-state-in-effect's rule exists to
    // require, not the anti-pattern it usually flags.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  return { data, loading, error, reload };
}

/**
 * The complement to useAsyncResource, for the domain hooks
 * (useExpenses, useInvoicePayments, useSubcontractorAssignments,
 * useAgentAssignments) that populate SEVERAL pieces of state from one
 * refresh (roster + assignments + balances, in one case) rather than a
 * single fetched value — useAsyncResource's single `data` slot doesn't
 * fit that shape. Same loading/error discipline, but the caller's
 * `loader` does its own `setX(...)` calls internally; this hook only
 * wraps that loader with loading/error tracking and exposes `refresh`
 * (identical name/behavior to what all four hooks already called
 * `refresh`, so this is a pure extraction, not a renamed API).
 *
 * Found while auditing all four hooks for the optimization pass: two
 * of them (useSubcontractorAssignments, useAgentAssignments) had NO
 * error handling at all — a failed refresh() inside their `useEffect`
 * was an uncaught promise rejection, not a bug users would ever see
 * reported, just a silently-stuck-empty list. This hook is what closes
 * that gap for all four at once instead of patching two of them by hand.
 */
export function useRefreshableResource(loader: () => Promise<void>, deps: unknown[]) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  // See useAsyncResource's identical fetcherRef effect above for why
  // this is an effect, not a render-time assignment.
  useEffect(() => {
    loaderRef.current = loader;
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loaderRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Refresh-on-mount/deps-change is this hook's entire purpose — see
    // useAsyncResource's matching comment above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { loading, error, setError, refresh };
}
