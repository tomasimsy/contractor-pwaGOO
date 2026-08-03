"use client";

/**
 * Subcontractor roster management — company-wide, cross-project. The
 * Estimate Detail page's SubcontractorAssignmentPanel handles per-
 * project assignment/payment; this page is where the roster itself
 * (add/edit/deactivate a subcontractor) and every assignment across
 * every project live, so a user without an open estimate in front of
 * them can still find "who do we owe and how much."
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { HardHat, Plus, Search, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { usePermission } from "@/lib/hooks/usePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Subcontractor, SubcontractorAssignment } from "@/lib/services/subcontractorService";
import type { PayeeBalance } from "@/lib/services";
import type { Project } from "@/lib/services/projectService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type AssignmentRow = SubcontractorAssignment & { subcontractorName: string; trade: string | null };

function SubcontractorsContent() {
  const { subcontractorService, projectService, financialEngine } = useServices();
  const { profile } = useAuth();

  const [roster, setRoster] = useState<Subcontractor[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  /** Keyed by SUBCONTRACTOR id — one payee, one balance. */
  const [balances, setBalances] = useState<Record<string, PayeeBalance>>({});
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newContactPerson, setNewContactPerson] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTrade, setEditTrade] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      // ONE PAYMENT = ONE EXPENSE RECORD. Money paid to a subcontractor
      // is an expense row, so committed/paid/outstanding all come from
      // FinancialEngine.getPayeeBalances — the SAME records project and
      // estimate financials read. No separate payment table is consulted.
      const [rosterList, assignmentList, projectList, payeeBalances] = await Promise.all([
        subcontractorService.getRoster(profile.companyId),
        subcontractorService.listAssignments({ companyId: profile.companyId }),
        projectService.list({ companyId: profile.companyId }),
        financialEngine.getPayeeBalances({ companyId: profile.companyId }, "subcontractor"),
      ]);
      setRoster(rosterList);
      setAssignments(assignmentList);
      setProjectsById(Object.fromEntries(projectList.map((p) => [p.id, p])));
      setBalances(Object.fromEntries(payeeBalances.map((b) => [b.payeeId, b] as const)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subcontractors.");
    } finally {
      setLoading(false);
    }
  }, [subcontractorService, projectService, financialEngine, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return roster;
    const q = search.trim().toLowerCase();
    return roster.filter((s) => s.name.toLowerCase().includes(q) || (s.trade ?? "").toLowerCase().includes(q));
  }, [roster, search]);

  const assignmentsBySub = useMemo(() => {
    const map: Record<string, AssignmentRow[]> = {};
    for (const a of assignments) {
      (map[a.subcontractorId] ??= []).push(a);
    }
    return map;
  }, [assignments]);

  return (
    <PageContainer>
      <PageHeader
        title="Subcontractors"
        description="Roster, project assignments, and outstanding balances — across every project."
        actions={
          <button type="button" onClick={() => setShowNew((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> New Subcontractor
          </button>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {showNew && (
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <input placeholder="Name *" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
          <input placeholder="Trade" value={newTrade} onChange={(e) => setNewTrade(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
          <input placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
          <input placeholder="Contact person" value={newContactPerson} onChange={(e) => setNewContactPerson(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">Cancel</button>
            <button
              type="button"
              disabled={!newName.trim() || !profile?.companyId}
              onClick={async () => {
                if (!profile?.companyId) return;
                await subcontractorService.createSubcontractor({
                  companyId: profile.companyId, name: newName.trim(), trade: newTrade.trim() || null,
                  phone: newPhone.trim() || null, contactPerson: newContactPerson.trim() || null,
                });
                setNewName(""); setNewTrade(""); setNewPhone(""); setNewContactPerson(""); setShowNew(false);
                await load();
              }}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Add subcontractor
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or trade…"
          className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={HardHat} title={roster.length === 0 ? "No subcontractors yet" : "No subcontractors match your search"} description="Add a subcontractor to start assigning them to projects." />
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const balance = balances[s.id];
            const totalOutstanding = balance?.outstanding ?? 0;
            const relatedProjectIds = Array.from(
              new Set([...(assignmentsBySub[s.id] ?? []).map((a) => a.projectId), ...(balance?.projectIds ?? [])])
            );
            const isEditing = editingId === s.id;
            return (
              <div key={s.id} className="rounded-xl border border-border bg-card p-4">
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm" />
                    <input value={editTrade} onChange={(e) => setEditTrade(e.target.value)} placeholder="Trade" className="h-9 rounded-lg border border-input bg-background px-2 text-sm" />
                    <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" className="h-9 rounded-lg border border-input bg-background px-2 text-sm" />
                    <input value={editContactPerson} onChange={(e) => setEditContactPerson(e.target.value)} placeholder="Contact person" className="h-9 rounded-lg border border-input bg-background px-2 text-sm" />
                    <div className="sm:col-span-2 flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Cancel</button>
                      <button
                        type="button"
                        onClick={async () => {
                          await subcontractorService.updateSubcontractor(s.id, { name: editName, trade: editTrade || null, phone: editPhone || null, contactPerson: editContactPerson || null });
                          setEditingId(null);
                          await load();
                        }}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{s.name}</span>
                        {s.trade && <span className="text-xs text-muted-foreground">· {s.trade}</span>}
                        {!s.isActive && <Badge tone="neutral">inactive</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {s.phone || "No phone"}{s.contactPerson ? ` · Contact: ${s.contactPerson}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {totalOutstanding > 0 && (
                        <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
                          {money(totalOutstanding)} owed
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(s.id);
                          setEditName(s.name); setEditTrade(s.trade ?? ""); setEditPhone(s.phone ?? ""); setEditContactPerson(s.contactPerson ?? "");
                        }}
                        className="rounded-lg border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await subcontractorService.updateSubcontractor(s.id, { isActive: !s.isActive });
                          await load();
                        }}
                        className="rounded-lg border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        {s.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </div>
                )}

                {balance && (
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Total committed</div>
                      <div className="font-semibold text-foreground">{money(balance.contracted)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total paid</div>
                      <div className="font-semibold text-foreground">{money(balance.paid)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Outstanding</div>
                      <div className={balance.outstanding > 0 ? "font-semibold text-warning-foreground" : "font-semibold text-foreground"}>
                        {money(balance.outstanding)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Related projects — from assignments AND from any
                    expense paid to this subcontractor, both already
                    resolved by getPayeeBalances. */}
                {relatedProjectIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Projects:</span>
                    {relatedProjectIds.map((pid) => (
                      <Link key={pid} href={`/projects/${pid}`} className="font-medium text-primary hover:underline">
                        {projectsById[pid]?.name ?? "Unknown project"}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Payments themselves are expense rows now — managed on
                    the Expenses page, which is the one place a cost
                    record is created, edited or deleted. */}
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

export default function SubcontractorsPage() {
  return (
    <RequirePermission resource="subcontractor_assignment" action="view">
      <SubcontractorsContent />
    </RequirePermission>
  );
}
