"use client";

/**
 * Estimates list — organized by LIFECYCLE (Drafts/Sent/Signed/Invoiced/
 * Completed/Archived/All), each tab its own server-side query via
 * EstimateService.listPage. Nothing here fetches a company's full
 * estimate set and filters/paginates in React: status filtering, type
 * filtering, search, sorting and pagination are all pushed to
 * listPage's Supabase query (see that method's doc comment in
 * lib/services/estimateService.ts for exactly what each lifecycle
 * means and why "completed"/"archived" read the estimate's PROJECT
 * status rather than a duplicated flag on the estimate itself).
 */
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { FileText, Plus, Search, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { EstimateStatus } from "@/lib/services";
import { supabase } from "@/lib/supabase/client";
import {
  getEmailStatusesForEstimates,
  EMAIL_STATUS_DOT_COLOR,
  EMAIL_STATUS_DOT_LABEL,
  type EstimateEmailStatus,
} from "@/lib/email/emailTracking";

type SortKey = "createdAt" | "updatedAt" | "total" | "estimateNumber";
type Lifecycle = "draft" | "sent" | "signed" | "invoiced" | "completed" | "archived" | "all";

type Row = Awaited<ReturnType<ReturnType<typeof useServices>["estimateService"]["listPage"]>>["rows"][number];

const LIFECYCLE_TABS: { key: Lifecycle; label: string }[] = [
  { key: "draft", label: "Drafts" },
  // { key: "sent", label: "Sent" },
  // { key: "signed", label: "Signed" },
  { key: "invoiced", label: "Invoiced" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

const STATUS_TONE: Record<EstimateStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "warning",
  viewed: "warning",
  approved: "success",
  rejected: "danger",
  converted_to_invoice: "success",
};

const STATUS_ROW_BG: Record<EstimateStatus, string> = {
  draft: "hover:bg-muted/40",
  sent: "bg-amber-500/[0.03] hover:bg-amber-500/[0.07]",
  viewed: "bg-amber-500/[0.03] hover:bg-amber-500/[0.07]",
  approved: "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]",
  rejected: "bg-rose-500/[0.03] hover:bg-rose-500/[0.07]",
  converted_to_invoice: "bg-emerald-500/[0.06] hover:bg-emerald-500/[0.10]",
};

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Desktop ~8-12 rows, mobile ~5-7 — matched to viewport, not a fixed
 * constant, since a phone screen genuinely can't show 10 rows without
 * turning into the giant scrolling list this page is replacing. */
function usePageSize(): number {
  const [size, setSize] = useState(10);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    const apply = () => setSize(mql.matches ? 10 : 6);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
  return size;
}

function EstimatesListContent() {
  const { estimateService } = useServices();
  const { profile } = useAuth();

  const [lifecycle, setLifecycle] = useState<Lifecycle>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "standard" | "roofing">("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced
  const [page, setPage] = useState(1);
  const pageSize = usePageSize();

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [emailStatusById, setEmailStatusById] = useState<Record<string, EstimateEmailStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box — every other filter/sort/page control
  // fires its own query immediately (they're discrete clicks), but
  // typing shouldn't issue a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter/sort/search/page-size change invalidates the current
  // page number — jumping back to 1 avoids landing on a now-nonexistent
  // page (e.g. "page 4" after switching to a tab with only 1 page).
  const filtersKey = `${lifecycle}|${typeFilter}|${sortKey}|${search}|${pageSize}`;
  const prevFiltersKey = useRef(filtersKey);
  if (prevFiltersKey.current !== filtersKey) {
    prevFiltersKey.current = filtersKey;
    if (page !== 1) setPage(1);
  }

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await estimateService.listPage({
        companyId: profile.companyId,
        lifecycle,
        estimateType: typeFilter,
        search: search || undefined,
        sortKey,
        sortDir: "desc",
        page,
        pageSize,
      });
      setRows(result.rows);
      setTotal(result.total);
      // Scoped to just this page's estimate ids — not the company's
      // whole email history (see getEmailStatusesForEstimates's doc
      // comment).
      getEmailStatusesForEstimates(supabase, result.rows.map((r) => r.id)).then(setEmailStatusById);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load estimates.");
    } finally {
      setLoading(false);
    }
  }, [estimateService, profile, lifecycle, typeFilter, sortKey, search, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Windowed page numbers (max 5) around the current page, so a company
  // with hundreds of estimates doesn't render hundreds of page buttons.
  const pageNumbers = (() => {
    const span = 5;
    let start = Math.max(1, page - Math.floor(span / 2));
    const end = Math.min(totalPages, start + span - 1);
    start = Math.max(1, end - span + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })();

  return (
<PageContainer>
  <PageHeader
    title="Estimates"
    description="Every proposal, across every project."
    actions={
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link href="/estimates/trash" className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">
          <Trash2 className="size-3.5" /> <span className="hidden xs:inline">Deleted</span>
        </Link>
        <Link href="/estimates/new" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200 transition-all hover:shadow-md">
          <Plus className="size-4" /> New Estimate
        </Link>
      </div>
    }
  />

  {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs sm:text-sm text-rose-700 border border-rose-200">{error}</div>}

  {/* Lifecycle tabs — each one is its own server-side query (see
      listPage's `lifecycle` param), not a client-side re-filter of
      one big fetched set. */}
  <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg border border-emerald-200/60 bg-white p-1">
    {LIFECYCLE_TABS.map((tab) => (
      <button
        key={tab.key}
        type="button"
        onClick={() => setLifecycle(tab.key)}
        className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors ${
          lifecycle === tab.key
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-emerald-700 hover:bg-emerald-50"
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>

  <div className="mb-3 flex flex-nowrap items-center gap-1 sm:gap-2">
    {/* Search – takes flexible width, shrinks to fit */}
    <div className="relative flex-1 min-w-0">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-emerald-600" />
      <input
        type="search"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search # or title…"
        className="h-7 w-full rounded-lg border border-emerald-200 bg-white pl-6 pr-1.5 text-[10px] sm:text-xs outline-none focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50 transition-all"
      />
    </div>

    {/* Type filter – flex-1 to share space */}
    <select
      value={typeFilter}
      onChange={(e) => setTypeFilter(e.target.value as "all" | "standard" | "roofing")}
      className="h-7 flex-1 min-w-0 rounded-lg border border-emerald-200 bg-white px-1 text-[10px] sm:text-xs outline-none focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50 transition-all text-emerald-900"
    >
      <option value="all">All Types</option>
      <option value="standard">Standard</option>
      <option value="roofing">Roofing</option>
    </select>

    {/* Sort filter */}
    <select
      value={sortKey}
      onChange={(e) => setSortKey(e.target.value as SortKey)}
      className="h-7 flex-1 min-w-0 rounded-lg border border-emerald-200 bg-white px-1 text-[10px] sm:text-xs outline-none focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50 transition-all text-emerald-900"
    >
      <option value="createdAt">Newest</option>
      <option value="updatedAt">Updated</option>
      <option value="total">Total</option>
      <option value="estimateNumber">#</option>
    </select>
  </div>

  {loading ? (
    <div className="py-12 text-center text-xs sm:text-sm text-emerald-600/60">Loading…</div>
  ) : rows.length === 0 ? (
    <EmptyState
      icon={FileText}
      title={total === 0 && !search && lifecycle === "all" ? "No estimates yet" : "No estimates match this view"}
      description={total === 0 && !search && lifecycle === "all" ? "Create your first estimate from a project." : "Try a different tab, search, or type filter."}
    />
  ) : (
    <>
      {/* Desktop & Tablet Table — one page of ~10 rows, no giant
          vertically scrolling list (see usePageSize/pagination below). */}
      <div className="hidden overflow-x-auto rounded-xl border border-emerald-200/60 bg-white sm:block shadow-sm">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Estimate #</th>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Project</th>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Client</th>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Type</th>
              <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider text-[11px]">Total</th>
              <th className="hidden px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px] md:table-cell">Created</th>
              <th className="hidden px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px] md:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100/60 capitalize">
            {rows.map((estimate) => {
              const emailStatus = emailStatusById[estimate.id];
              return (
              <tr key={estimate.id} className={`transition-colors ${STATUS_ROW_BG[estimate.status] || "hover:bg-emerald-50/80"}`}>
                <td className="px-3 py-2.5 capitalize">
                  <Link
                    href={`/estimates/${estimate.id}`}
                    className="inline-flex items-center gap-1.5 font-semibold text-emerald-900 hover:text-emerald-700 transition-colors capitalize "
                  >
                    {emailStatus && (
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${EMAIL_STATUS_DOT_COLOR[emailStatus]}`}
                        title={`Email ${EMAIL_STATUS_DOT_LABEL[emailStatus]}`}
                      />
                    )}
                    {estimate.title?.trim() || "No Title"}
                  </Link>
                  {(estimate.estimateNumber || estimate.id) && (
                    <div className="text-[11px] text-emerald-600/60">
                      {estimate.estimateNumber ?? estimate.id.slice(0, 8)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-emerald-800 font-medium">
                  {estimate.projectName ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-emerald-600/80">
                  {estimate.clientName ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-emerald-600/80 capitalize">
                  {estimate.estimateType === "roofing" ? "Roofing" : "Standard"}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={STATUS_TONE[estimate.status]}>{estimate.status.replace(/_/g, " ")}</Badge>
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                  {formatMoney(estimate.total)}
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-emerald-600/60 md:table-cell">
                  {new Date(estimate.createdAt).toLocaleDateString()}
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-emerald-600/60 md:table-cell">
                  {new Date(estimate.updatedAt).toLocaleDateString()}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards — one page of ~6 cards. */}
      <div className="space-y-3 sm:hidden">
        {rows.map((estimate) => {
          const emailStatus = emailStatusById[estimate.id];
          const status =
            estimate.status === "converted_to_invoice"
              ? { badge: "bg-white/90 text-emerald-700", label: "Invoiced" }
              : estimate.status === "approved"
              ? { badge: "bg-emerald-100 text-emerald-800", label: "Approved" }
              : estimate.status === "sent" || estimate.status === "viewed"
              ? { badge: "bg-amber-100 text-amber-800", label: estimate.status === "viewed" ? "Viewed" : "Sent" }
              : estimate.status === "rejected"
              ? { badge: "bg-rose-100 text-rose-800", label: "Rejected" }
              : { badge: "bg-white/90 text-emerald-700", label: "Draft" };

          return (
            <Link
              key={estimate.id}
              href={`/estimates/${estimate.id}`}
              className={`
                group relative flex flex-col gap-3
                rounded-xl
                bg-gradient-to-br from-emerald-600 to-emerald-700
                border border-emerald-500
                px-4 py-3.5
                shadow-sm
                transition-all
                hover:shadow-md hover:scale-[1.01] hover:from-emerald-700 hover:to-emerald-800
              `}
            >
              {/* Top Row: Title and Amount */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-1.5 truncate text-sm font-bold text-white capitalize">
                    {emailStatus && (
                      <span
                        className={`size-1.5 shrink-0 rounded-full ring-1 ring-white/40 ${EMAIL_STATUS_DOT_COLOR[emailStatus]}`}
                        title={`Email ${EMAIL_STATUS_DOT_LABEL[emailStatus]}`}
                      />
                    )}
                    {estimate.title?.trim() || "Untitled"}
                  </h3>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-white/80">
                      {estimate.projectName ?? "No project"}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-white/40" />
                    <span className="text-[10px] uppercase font-semibold text-white/70">
                      {estimate.estimateType === "roofing" ? "Roofing" : "Standard"}
                    </span>
                  </div>
                </div>

                {/* Amount */}
                <div className="shrink-0 text-right">
                  <div className="text-base font-bold text-white">
                    {formatMoney(estimate.total)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-white/60">
                    #{estimate.estimateNumber ?? estimate.id.slice(0, 6)}
                  </div>
                </div>
              </div>

              {/* Bottom Row: Date and Status Badge */}
              <div className="flex items-center justify-between border-t border-white/20 pt-2.5">
                <div className="text-[10px] text-white/70">
                  {new Date(estimate.createdAt).toLocaleDateString()}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/50">
                    {new Date(estimate.updatedAt).toLocaleDateString()}
                  </span>
                  <span
                    className={`
                      rounded-full
                      px-2.5 py-0.5
                      text-[10px]
                      font-bold
                      uppercase
                      tracking-wide
                      ${status.badge}
                    `}
                  >
                    {status.label}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Previous / page numbers / Next — real pagination against the
          server-reported total, not a client-side slice. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-700/70">
        <span>
          Showing {from}–{to} of {total}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-white"
          >
            <ChevronLeft className="size-3.5" /> Prev
          </button>
          {pageNumbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-semibold ${
                n === page ? "bg-emerald-600 text-white" : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-white"
          >
            Next <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </>
  )}
</PageContainer>
  );
}

export default function EstimatesPage() {
  return (
    <RequirePermission resource="estimate" action="view">
      <EstimatesListContent />
    </RequirePermission>
  );
}
