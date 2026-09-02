"use client";

/**
 * "Recent activity" — AuditService only exposes per-entity history
 * (getHistory(companyId, table, entityId)), no company-wide feed, so
 * inventing one would mean either a new service method or scanning
 * audit_logs directly from a page (both out of scope for this pass).
 * Reuses the projects/estimates/invoices already fetched for the stat
 * tiles instead: every one of them already carries updatedAt
 * (AuditedEntity) — sorting that union by updatedAt IS "what changed
 * most recently," with zero new queries or calculations.
 */
import Link from "next/link";
import { Activity, FileText, FolderKanban, Receipt } from "lucide-react";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";
import type { Invoice } from "@/lib/services/invoiceService";

type ActivityItem =
  | { kind: "project"; entity: Project }
  | { kind: "estimate"; entity: Estimate }
  | { kind: "invoice"; entity: Invoice };

const ICONS = { project: FolderKanban, estimate: FileText, invoice: Receipt } as const;

function describe(item: ActivityItem): { label: string; href: string } {
  switch (item.kind) {
    case "project":
      return { label: `Project "${item.entity.name}" updated — ${item.entity.status.replace(/_/g, " ")}`, href: `/projects/${item.entity.id}` };
    case "estimate":
      return { label: `Estimate ${item.entity.estimateNumber ?? item.entity.id.slice(0, 8)} — ${item.entity.status.replace(/_/g, " ")}`, href: `/estimates/${item.entity.id}` };
    case "invoice":
      return { label: `Invoice ${item.entity.invoiceNumber} — ${item.entity.status.replace(/_/g, " ")}`, href: `/invoices/${item.entity.id}` };
  }
}

export function RecentActivityFeed({ projects, estimates, invoices, limit = 8 }: { projects: Project[]; estimates: Estimate[]; invoices: Invoice[]; limit?: number }) {
  const items: ActivityItem[] = [
    ...projects.map((entity): ActivityItem => ({ kind: "project", entity })),
    ...estimates.map((entity): ActivityItem => ({ kind: "estimate", entity })),
    ...invoices.map((entity): ActivityItem => ({ kind: "invoice", entity })),
  ]
    .sort((a, b) => b.entity.updatedAt.localeCompare(a.entity.updatedAt))
    .slice(0, limit);

  return (
    <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/40 p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-50">
        <Activity className="size-3.5 text-emerald-400" /> Recent Activity
      </h2>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-800/50 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-emerald-100">No activity yet</p>
          <p className="max-w-sm text-xs text-emerald-300/60">Recent project, estimate, and invoice updates will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            const { label, href } = describe(item);
            return (
              <li key={`${item.kind}-${item.entity.id}`}>
                <Link href={href} className="flex items-center gap-2.5 py-2 text-sm text-emerald-100 hover:text-emerald-300">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15">
                    <Icon className="size-3 text-emerald-400" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="shrink-0 text-xs text-emerald-300/50">{new Date(item.entity.updatedAt).toLocaleDateString()}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
