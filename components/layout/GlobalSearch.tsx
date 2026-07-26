"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Users, ClipboardList, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { cn } from "@/lib/utils";

type Result = { id: string; label: string; sublabel?: string; href: string; icon: typeof Users };

/**
 * The one global search entry point — searches clients (by name),
 * estimates (by number), and invoices (by number), company-scoped and
 * excluding soft-deleted rows. Debounced client-side query against
 * Supabase directly; no server route needed for this scale of lookup.
 */
export default function GlobalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const companyId = await getCompanyId();

        const [clients, estimates, invoices] = await Promise.all([
          supabase
            .from("clients")
            .select("id, name")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .ilike("name", `%${trimmed}%`)
            .limit(5),
          supabase
            .from("estimates")
            .select("id, estimate_number, title")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .ilike("estimate_number", `%${trimmed}%`)
            .limit(5),
          supabase
            .from("invoices")
            .select("id, invoice_number")
            .eq("company_id", companyId)
            .eq("is_deleted", false)
            .ilike("invoice_number", `%${trimmed}%`)
            .limit(5),
        ]);

        if (cancelled) return;

        const merged: Result[] = [
          ...(clients.data ?? []).map((c) => ({
            id: c.id,
            label: c.name,
            sublabel: "Client",
            href: `/clients/${c.id}`,
            icon: Users,
          })),
          ...(estimates.data ?? []).map((e) => ({
            id: e.id,
            label: e.estimate_number || e.title || "Estimate",
            sublabel: "Estimate",
            href: `/estimates/${e.id}`,
            icon: ClipboardList,
          })),
          ...(invoices.data ?? []).map((inv) => ({
            id: inv.id,
            label: inv.invoice_number || "Invoice",
            sublabel: "Invoice",
            href: `/invoices/${inv.id}`,
            icon: FileText,
          })),
        ];

        setResults(merged);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-sm", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search clients, estimates, invoices…"
          className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
          {results.length === 0 && !loading ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</div>
          ) : (
            results.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={`${r.sublabel}-${r.id}`}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                    router.push(r.href);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.sublabel}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
