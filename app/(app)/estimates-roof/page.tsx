"use client";

/**
 * Estimate Roof V2 — list page. Reads one page at a time from
 * estimateService.listSummaries(): the same `estimates` table V1 reads, with
 * search, status, sort and paging done on the server. Status tabs show a count
 * for each status. The only difference from /estimates is that this page
 * defaults its type filter to "All" and its "New" button opens the
 * roofing create route.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Home, Plus, Search } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { EstimateSummary, EstimateSummaryQuery } from "@/lib/services/estimateService";
import type { EstimateStatus } from "@/lib/services";

type SortKey = NonNullable<EstimateSummaryQuery["sortKey"]>;
type StatusTab = "all" | "draft" | "sent" | "approved" | "invoiced";

const PAGE_SIZE = 50;

const STATUS_TABS: { key: StatusTab; label: string; statuses?: EstimateStatus[] }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "sent", label: "Sent", statuses: ["sent", "viewed"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "invoiced", label: "Invoiced", statuses: ["converted_to_invoice"] },
];

const EMPTY_COUNTS: Record<EstimateStatus, number> = {
  draft: 0,
  sent: 0,
  viewed: 0,
  approved: 0,
  rejected: 0,
  converted_to_invoice: 0,
};

const STATUS_TONE: Record<EstimateStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "warning",
  viewed: "warning",
  approved: "success",
  rejected: "danger",
  converted_to_invoice: "success",
};

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function EstimateRoofListContent() {
  const { estimateService } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId;

  const [rows, setRows] = useState<EstimateSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<EstimateStatus, number>>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  // Defaults to "all" so roofing and standard estimates both show, each labelled by its Type column.
  const [typeFilter, setTypeFilter] = useState<"all" | "standard" | "roofing">("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filters = useMemo<EstimateSummaryQuery>(
    () => ({
      estimateType: typeFilter === "all" ? undefined : typeFilter,
      statuses: STATUS_TABS.find((t) => t.key === statusTab)?.statuses,
      search: search.trim() || undefined,
      sortKey,
      sortDir,
      pageSize: PAGE_SIZE,
    }),
    [typeFilter, statusTab, search, sortKey, sortDir]
  );
  const filtersActive = Boolean(filters.search || filters.statuses);

  // Each request gets an id; only the newest one may update the page, so a slow
  // earlier response cannot overwrite the results for the current filters.
  const requestId = useRef(0);

  const runQuery = useCallback(
    async (page: number, append: boolean) => {
      if (!companyId) return;
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await estimateService.listSummaries({ companyId }, { ...filters, page });
        if (id !== requestId.current) return;
        setRows((prev) => (append ? [...prev, ...result.rows] : result.rows));
        setTotal(result.total);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : "Failed to load roofing estimates.");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [estimateService, companyId, filters]
  );

  // Filter, sort and profile changes wait briefly, so typing does not send a
  // request for every keystroke. Changes restart from the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      void runQuery(1, false);
    }, 250);
    return () => clearTimeout(timer);
  }, [runQuery]);

  // Tab counts ignore the search, so they show how many estimates each status
  // has overall for this type.
  useEffect(() => {
    if (!companyId) return;
    const type = typeFilter === "all" ? undefined : typeFilter;
    estimateService
      .countsByStatus({ companyId }, type)
      .then(setCounts)
      .catch(() => setCounts(EMPTY_COUNTS));
  }, [estimateService, companyId, typeFilter]);

  const allCount = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const tabCount = (tab: StatusTab) => {
    if (tab === "all") return allCount;
    if (tab === "sent") return counts.sent + counts.viewed;
    if (tab === "draft") return counts.draft;
    if (tab === "approved") return counts.approved;
    return counts.converted_to_invoice;
  };
  const waitingOnSignature = counts.sent + counts.viewed;

  const hasMore = rows.length < total;
  const loadedPages = Math.ceil(rows.length / PAGE_SIZE);

  // Clicking a column header sorts by it; clicking the same header again flips the direction.
  const sortHeader = (key: SortKey, label: string, align: "left" | "right" = "left") => (
    <th className={`px-2 py-2 text-[11px] font-medium text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => {
          if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else {
            setSortKey(key);
            setSortDir("asc");
          }
        }}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <span aria-hidden="true">{sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  // Exports the rows loaded so far, not every match: a full export would need every page.
  const exportCsv = () => {
    const header = ["Estimate #", "Title", "Project", "Client", "Type", "Status", "Total", "Created", "Updated"];
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = rows.map((e) =>
      [
        e.estimateNumber ?? e.id.slice(0, 8),
        e.title ?? "",
        e.projectName,
        e.clientName,
        e.estimateType === "roofing" ? "Roofing" : "Standard",
        e.status.replace(/_/g, " "),
        e.total.toFixed(2),
        e.createdAt.slice(0, 10),
        e.updatedAt.slice(0, 10),
      ].map(cell).join(",")
    );
    const blob = new Blob([[header.map(cell).join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "estimates.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // A Standard estimate shown here (typeFilter = "all"/"standard") must
  // route to the V1 detail page, not the V2 roofing route — this list
  // can show both types, but each row's own type decides where it
  // links, never the page's default filter.
  const detailHref = (estimate: EstimateSummary) =>
    estimate.estimateType === "roofing" ? `/estimates-roof/${estimate.id}` : `/estimates/${estimate.id}`;

  return (
    <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
      <PageHeader
        title="Estimate Roof"
        description={`${allCount} estimates${waitingOnSignature > 0 ? ` · ${waitingOnSignature} waiting on a signature` : ""}`}
        actions={
          <Link href="/estimates-roof/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> New estimate
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}

      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-border">
        {STATUS_TABS.map((tab) => {
          const active = statusTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusTab(tab.key)}
              aria-pressed={active}
              className={`-mb-px whitespace-nowrap border-b-2 px-2.5 py-2 text-[13px] ${
                active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label} <span className="text-muted-foreground">{tabCount(tab.key)}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-nowrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm sm:flex-none sm:basis-auto sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | "standard" | "roofing")}
          aria-label="Estimate type"
          className="h-8 w-[92px] shrink-0 rounded-lg border border-input bg-background px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 sm:w-auto"
        >
          <option value="all">All types</option>
          <option value="standard">Standard</option>
          <option value="roofing">Roofing</option>
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Sort by"
          className="h-8 w-[118px] shrink-0 rounded-lg border border-input bg-background px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 sm:w-auto"
        >
          <option value="createdAt">Newest first</option>
          <option value="updatedAt">Recently updated</option>
          <option value="total">Total (high–low)</option>
          <option value="estimateNumber">Estimate #</option>
        </select>
        {rows.length > 0 && (
          <button type="button" onClick={exportCsv} className="ml-auto hidden text-[11px] font-medium text-primary hover:underline sm:block">
            Export loaded rows (CSV)
          </button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Home}
          title={filtersActive ? "No estimates match your filters" : "No estimates yet"}
          description={filtersActive ? "Try a different search or tab." : "Create your first roofing estimate."}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50">
                <tr>
                  {sortHeader("estimateNumber", "Estimate")}
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">Type</th>
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">Client and project</th>
                  {sortHeader("status", "Status")}
                  {sortHeader("total", "Total", "right")}
                  {sortHeader("updatedAt", "Updated", "right")}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((estimate) => (
                  <tr key={estimate.id} className="hover:bg-muted/40">
                    <td className="px-2 py-2">
                      <Link href={detailHref(estimate)} className="block font-medium text-foreground hover:text-primary">
                        {estimate.title || "Untitled"}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">{estimate.estimateNumber ?? estimate.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-2 py-2 text-[12px] text-foreground">{estimate.estimateType === "roofing" ? "Roofing" : "Standard"}</td>
                    <td className="px-2 py-2">
                      <div className="text-foreground">{estimate.clientName || "No client"}</div>
                      <div className="text-[11px] text-muted-foreground">{estimate.projectName || "No project"}</div>
                    </td>
                    <td className="px-2 py-2">
                      <Badge tone={STATUS_TONE[estimate.status]}>{estimate.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium text-foreground">{formatMoney(estimate.total)}</td>
                    <td className="px-2 py-2 text-right text-[11px] text-muted-foreground">{formatDate(estimate.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:hidden">
            {rows.map((estimate) => (
              <Link key={estimate.id} href={detailHref(estimate)} className="block px-3 py-2.5 hover:bg-muted/40">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{estimate.title || "Untitled"}</span>
                  <span className="shrink-0 tabular-nums text-[13px] font-medium text-foreground">{formatMoney(estimate.total)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {estimate.estimateNumber ?? estimate.id.slice(0, 8)} · {estimate.estimateType === "roofing" ? "Roofing" : "Standard"} · {estimate.clientName || "No client"}
                  </span>
                  <Badge tone={STATUS_TONE[estimate.status]}>{estimate.status.replace(/_/g, " ")}</Badge>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
            <span>
              Showing {rows.length} of {total}
              {loadedPages > 1 ? ` · ${loadedPages} pages loaded` : ""}
            </span>
            {hasMore && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void runQuery(loadedPages + 1, true)}
                className="h-8 rounded-lg border border-input bg-background px-3 text-[13px] font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : `Load more (${total - rows.length} left)`}
              </button>
            )}
          </div>
        </>
      )}
    </PageContainer>
  );
}

export default function EstimateRoofListPage() {
  return (
    <RequirePermission resource="estimate" action="view">
      <EstimateRoofListContent />
    </RequirePermission>
  );
}
