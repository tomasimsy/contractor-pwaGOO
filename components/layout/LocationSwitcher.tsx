"use client";

import { useState } from "react";
import { MapPin, ChevronDown, Check } from "lucide-react";
import { useLocationContext } from "@/components/providers/LocationProvider";

/** Real, backed by LocationService.list() (LocationProvider) — not a
 * UI placeholder. Selecting a location persists to localStorage; no
 * page reads it yet (no business pages exist), but the state is real
 * and ready for a future report/filter to consume via
 * useLocationContext(). */
export function LocationSwitcher() {
  const { locations, currentLocationId, setCurrentLocationId, loading } = useLocationContext();
  const [open, setOpen] = useState(false);

  if (loading) return null;
  if (locations.length === 0) {
    return (
      <span className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground sm:flex">
        <MapPin className="size-3.5" aria-hidden="true" />
        No locations
      </span>
    );
  }

  const current = locations.find((l) => l.id === currentLocationId);

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
      >
        <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="max-w-[8rem] truncate">{current?.name ?? "Select location"}</span>
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute left-0 z-50 mt-1.5 w-56 rounded-xl border border-border bg-popover p-1 shadow-lg">
            {locations.map((location) => (
              <button
                key={location.id}
                type="button"
                role="option"
                aria-selected={location.id === currentLocationId}
                onClick={() => {
                  setCurrentLocationId(location.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-popover-foreground hover:bg-muted"
              >
                {location.name}
                {location.id === currentLocationId && <Check className="size-3.5 text-primary" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
