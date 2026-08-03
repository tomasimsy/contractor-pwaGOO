"use client";

/**
 * Agent roster management — company-wide, cross-project. Mirrors
 * app/(app)/subcontractors/page.tsx exactly; the Estimate Detail page's
 * AgentAssignmentPanel handles per-project assignment/commission/
 * reimbursement payments, this page is the roster + cross-project view.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Briefcase, Plus, Search, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { usePermission } from "@/lib/hooks/usePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Agent, AgentAssignment } from "@/lib/services/agentCommissionService";
import type { PayeeBalance } from "@/lib/services";
import type { Project } from "@/lib/services/projectService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type AssignmentRow = AgentAssignment & { agentName: string };

function AgentsContent() {
  const { agentCommissionService, projectService, financialEngine } = useServices();
  const { profile } = useAuth();

  const [roster, setRoster] = useState<Agent[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  /** Keyed by AGENT id — one payee, one balance. */
  const [balances, setBalances] = useState<Record<string, PayeeBalance>>({});
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      // ONE PAYMENT = ONE EXPENSE RECORD. A commission paid to an agent
      // is an expense row, so committed/paid/outstanding all come from
      // FinancialEngine.getPayeeBalances — the SAME records project and
      // estimate financials read.
      const [rosterList, assignmentList, projectList, payeeBalances] = await Promise.all([
        agentCommissionService.getRoster(profile.companyId),
        agentCommissionService.listAssignments({ companyId: profile.companyId }),
        projectService.list({ companyId: profile.companyId }),
        financialEngine.getPayeeBalances({ companyId: profile.companyId }, "agent"),
      ]);
      setRoster(rosterList);
      setAssignments(assignmentList);
      setProjectsById(Object.fromEntries(projectList.map((p) => [p.id, p])));
      setBalances(Object.fromEntries(payeeBalances.map((b) => [b.payeeId, b] as const)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents.");
    } finally {
      setLoading(false);
    }
  }, [agentCommissionService, projectService, financialEngine, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return roster;
    const q = search.trim().toLowerCase();
    return roster.filter((a) => a.name.toLowerCase().includes(q));
  }, [roster, search]);

  const assignmentsByAgent = useMemo(() => {
    const map: Record<string, AssignmentRow[]> = {};
    for (const a of assignments) {
      (map[a.agentId] ??= []).push(a);
    }
    return map;
  }, [assignments]);

  return (
    <PageContainer>
      <PageHeader
        title="Agents"
        description="Roster, project assignments, and outstanding commissions — across every project."
        actions={
          <button type="button" onClick={() => setShowNew((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> New Agent
          </button>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {showNew && (
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <input placeholder="Name *" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
          <input type="number" min="0" step="any" placeholder="Commission % (optional)" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">Cancel</button>
            <button
              type="button"
              disabled={!newName.trim() || !profile?.companyId}
              onClick={async () => {
                if (!profile?.companyId) return;
                await agentCommissionService.createAgent({ companyId: profile.companyId, name: newName.trim(), commissionRate: newRate ? parseFloat(newRate) : null });
                setNewName(""); setNewRate(""); setShowNew(false);
                await load();
              }}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Add agent
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name…"
          className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Briefcase} title={roster.length === 0 ? "No agents yet" : "No agents match your search"} description="Add an agent to start assigning them to projects." />
      ) : (
        <div className="space-y-3">
          {filtered.map((agent) => {
            const balance = balances[agent.id];
            const totalOutstanding = balance?.outstanding ?? 0;
            const relatedProjectIds = Array.from(
              new Set([...(assignmentsByAgent[agent.id] ?? []).map((a) => a.projectId), ...(balance?.projectIds ?? [])])
            );
            const isEditing = editingId === agent.id;
            return (
              <div key={agent.id} className="rounded-xl border border-border bg-card p-4">
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm" />
                    <input type="number" min="0" step="any" value={editRate} onChange={(e) => setEditRate(e.target.value)} placeholder="Commission %" className="h-9 rounded-lg border border-input bg-background px-2 text-sm" />
                    <div className="sm:col-span-2 flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Cancel</button>
                      <button
                        type="button"
                        onClick={async () => {
                          await agentCommissionService.updateAgent(agent.id, { name: editName, commissionRate: editRate ? parseFloat(editRate) : null });
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
                        <span className="font-medium text-foreground">{agent.name}</span>
                        {agent.commissionRate != null && <span className="text-xs text-muted-foreground">· {agent.commissionRate}% commission</span>}
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
                        onClick={() => { setEditingId(agent.id); setEditName(agent.name); setEditRate(agent.commissionRate?.toString() ?? ""); }}
                        className="rounded-lg border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        Edit
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

                {/* Commissions are expense rows now — managed on the
                    Expenses page, the one place a cost record lives. */}
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

export default function AgentsPage() {
  return (
    <RequirePermission resource="agent_assignment" action="view">
      <AgentsContent />
    </RequirePermission>
  );
}
