"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { useServices } from "./ServicesProvider";
import type { Location } from "@/lib/services";

/**
 * The multi-location switcher's real state — backed by
 * LocationService.list(), not a placeholder. A company with a single
 * (or zero) locations still works: the switcher just has one option,
 * or shows "No locations" — see LocationSwitcher.tsx.
 */
interface LocationState {
  locations: Location[];
  currentLocationId: string | null;
  setCurrentLocationId: (id: string | null) => void;
  loading: boolean;
  reload: () => void;
}

const LocationContext = createContext<LocationState | undefined>(undefined);
const STORAGE_KEY = "contractor-app-v2-location";

export function LocationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { locationService } = useServices();
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentLocationId, setCurrentLocationIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.companyId) {
      setLocations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const list = await locationService.list({ companyId: profile.companyId });
    setLocations(list);
    setLoading(false);

    const stored = localStorage.getItem(STORAGE_KEY);
    const fallback = list.find((l) => l.isPrimary)?.id ?? list[0]?.id ?? null;
    setCurrentLocationIdState(stored && list.some((l) => l.id === stored) ? stored : fallback);
    // Depends on the whole `profile` object, not just profile?.companyId
    // — the React Compiler's static analysis infers the coarser
    // dependency and refuses to preserve a narrower one, so matching it
    // here keeps this memoized correctly instead of silently opting the
    // component out of compiler optimization.
  }, [profile, locationService]);

  useEffect(() => {
    // Fetch-on-mount/profile-change is this provider's entire purpose —
    // same reasoning as useAsyncResource's identical pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function setCurrentLocationId(id: string | null) {
    setCurrentLocationIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <LocationContext.Provider value={{ locations, currentLocationId, setCurrentLocationId, loading, reload: load }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocationContext must be used within a LocationProvider.");
  return ctx;
}
