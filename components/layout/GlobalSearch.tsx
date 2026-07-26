"use client";

import { Search } from "lucide-react";

/**
 * UI placeholder, per this prompt's explicit scope — no search index
 * or query exists yet (there's no business data to search across
 * until the real modules are built). The input is real and focusable
 * (keyboard/a11y works), it just has nowhere to send a query yet.
 */
export function GlobalSearch() {
  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        placeholder="Search… (coming soon)"
        disabled
        aria-label="Global search (not yet available)"
        className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
