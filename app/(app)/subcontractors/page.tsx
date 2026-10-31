"use client";

/**
 * Subcontractor roster — who they are and whether their paperwork is in
 * order (W-9, insurance, license, agreement). Each name opens the sub's
 * own page (/subcontractors/[id]) with the documents and full profile.
 *
 * Money is not handled here. What a sub is owed comes from
 * FinancialEngine.getPayablesSummary — the same figure Payroll shows —
 * and paying happens on Payroll.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Subcontractor } from "@/lib/services/subcontractorService";
import { subcontractorCompliance, type SubcontractorDocument } from "@/lib/services/subcontractorDocumentService";
import { ComplianceMarks, complianceIssueLine } from "@/components/subcontractors/ComplianceMarks";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Filter = "active" | "attention" | "inactive" | "all";

const FIELD =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function SubcontractorsContent() {
  const { subcontractorService, subcontractorDocumentService, financialEngine } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;
  const router = useRouter();

  const [roster, setRoster] = useState<Subcontractor[]>([]);
  const [docs, setDocs] = useState<SubcontractorDocument[]>([]);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [owed, setOwed] = useState<Map<string, number>>(new Map());
  const [jobs, setJobs] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", trade: "", contactPerson: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [subs, payables, assignments] = await Promise.all([
        subcontractorService.getRoster(companyId, true),
        financialEngine.getPayablesSummary({ companyId }),
        subcontractorService.listAssignments({ companyId }),
      ]);
      setRoster(subs);
      const owedBy = new Map<string, number>();
      for (const l of payables.lines) {
        if (l.role === "subcontractor" && l.outstanding > 0.005) owedBy.set(l.payeeId, (owedBy.get(l.payeeId) ?? 0) + l.outstanding);
      }
      setOwed(owedBy);
      const jobsBy = new Map<string, number>();
      for (const a of assignments) jobsBy.set(a.subcontractorId, (jobsBy.get(a.subcontractorId) ?? 0) + 1);
      setJobs(jobsBy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subcontractors.");
    } finally {
      setLoading(false);
    }
    // Documents load on their own, so the roster still shows before the documents migration has run.
    try {
      setDocs(await subcontractorDocumentService.listForCompany(companyId));
      setDocsError(null);
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Failed to load documents.");
    }
  }, [companyId, subcontractorService, subcontractorDocumentService, financialEngine]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const compliance = useMemo(() => {
    const bySub = new Map<string, SubcontractorDocument[]>();
    for (const d of docs) (bySub.get(d.subcontractorId) ?? bySub.set(d.subcontractorId, []).get(d.subcontractorId)!).push(d);
    return new Map(roster.map((s) => [s.id, subcontractorCompliance(s, bySub.get(s.id) ?? [])]));
  }, [roster, docs]);

  const active = roster.filter((s) => s.isActive);
  const attention = active.filter((s) => compliance.get(s.id)?.worst === "problem");
  const expiring = active.filter((s) => compliance.get(s.id)?.issues.some((i) => i.state === "expiring"));
  const owedTotal = [...owed.values()].reduce((a, b) => a + b, 0);

  const counts: Record<Filter, number> = {
    active: active.length,
    attention: attention.length,
    inactive: roster.length - active.length,
    all: roster.length,
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster
      .filter((s) =>
        filter === "all" ? true
        : filter === "inactive" ? !s.isActive
        : filter === "attention" ? s.isActive && compliance.get(s.id)?.worst === "problem"
        : s.isActive
      )
      .filter((s) => !q || [s.name, s.trade, s.companyName, s.contactPerson].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [roster, filter, search, compliance]);

  async function addSub() {
    if (!companyId || !draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const sub = await subcontractorService.createSubcontractor({
        companyId,
        name: draft.name.trim(),
        trade: draft.trade.trim() || null,
        contactPerson: draft.contactPerson.trim() || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
      });
      // Straight to their page: the documents are the next thing to collect.
      router.push(`/subcontractors/${sub.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this subcontractor.");
      setSaving(false);
    }
  }

  return (
    <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Subcontractors</h1>
            <p className="text-[12px] text-muted-foreground">
              Contacts, W-9s and insurance. Pay them in{" "}
              <Link href="/payroll" className="text-primary hover:underline">Payroll</Link>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            {adding ? "Cancel" : "Add subcontractor"}
          </button>
        </div>

        <div className="grid grid-cols-2 rounded-lg border border-border bg-card sm:grid-cols-4">
          <div className="border-b border-r border-border px-4 py-2.5 sm:border-b-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Active</div>
            <div className="mt-1 text-[15px] font-semibold tabular-nums text-foreground">{active.length}</div>
          </div>
          <button type="button" onClick={() => setFilter("attention")} className="border-b border-border px-4 py-2.5 text-left hover:bg-muted/40 sm:border-b-0 sm:border-r">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Papers missing</div>
            <div className={`mt-1 text-[15px] font-semibold tabular-nums ${attention.length > 0 ? "text-danger" : "text-foreground"}`}>
              {attention.length}
            </div>
          </button>
          <div className="border-r border-border px-4 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Expiring in 30 days</div>
            <div className={`mt-1 text-[15px] font-semibold tabular-nums ${expiring.length > 0 ? "text-warning" : "text-foreground"}`}>
              {expiring.length}
            </div>
          </div>
          <Link href="/payroll" className="px-4 py-2.5 hover:bg-muted/40">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Owed · Payroll →</div>
            <div className={`mt-1 text-[15px] font-semibold tabular-nums ${owedTotal > 0.005 ? "text-warning" : "text-foreground"}`}>{money(owedTotal)}</div>
          </Link>
        </div>

        {adding && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr_auto]">
              <input autoFocus placeholder="Name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${FIELD} col-span-2 sm:col-span-1`} />
              <input placeholder="Trade" value={draft.trade} onChange={(e) => setDraft({ ...draft, trade: e.target.value })} className={FIELD} />
              <input placeholder="Contact person" value={draft.contactPerson} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} className={FIELD} />
              <input placeholder="Phone" inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className={FIELD} />
              <input placeholder="Email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={FIELD} />
              <button
                type="button"
                disabled={!draft.name.trim() || saving}
                onClick={addSub}
                className="col-span-2 h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:col-span-1"
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Next you&apos;ll upload their W-9, insurance and agreement.</p>
          </div>
        )}

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
        {docsError && (
          <div className="rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-warning">
            Documents aren&apos;t available yet: run migration 20261029020000_subcontractor_profile_and_documents.sql in Supabase.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 text-[13px]">
            {(["active", "attention", "inactive", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {f === "active" ? "Active" : f === "attention" ? "Needs papers" : f === "inactive" ? "Inactive" : "All"}{" "}
                <span className="font-normal text-muted-foreground">{counts[f]}</span>
              </button>
            ))}
          </div>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, trade or company" className={`${FIELD} max-w-64`} />
        </div>

        {loading ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">
            {roster.length === 0 ? "No subcontractors yet. Add one to start assigning them to estimates." : "No subcontractors in this view."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:px-4 [&_th]:py-2 [&_th]:font-semibold">
                <tr>
                  <th>Name</th>
                  <th className="hidden md:table-cell">Contact</th>
                  <th>Papers</th>
                  <th className="hidden text-right sm:table-cell">Jobs</th>
                  <th className="text-right">Owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((s) => {
                  const c = compliance.get(s.id)!;
                  const owedNow = owed.get(s.id) ?? 0;
                  return (
                    <tr key={s.id} className="align-top hover:bg-muted/30">
                      <td className="min-w-[7.5rem] px-4 py-2.5">
                        <Link href={`/subcontractors/${s.id}`} className="font-semibold text-foreground hover:text-primary hover:underline">
                          {s.name}
                        </Link>
                        {!s.isActive && <span className="ml-1.5 text-[11px] text-muted-foreground">Inactive</span>}
                        <div className="text-[12px] text-muted-foreground">
                          {[s.trade, s.companyName && s.companyName !== s.name ? s.companyName : null].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="hidden px-4 py-2.5 text-[12px] md:table-cell">
                        <div className="text-foreground">{s.contactPerson || "—"}</div>
                        <div className="text-muted-foreground">
                          {s.phone ? <a href={`tel:${s.phone}`} className="hover:underline">{s.phone}</a> : null}
                          {s.phone && s.email ? " · " : null}
                          {s.email ? <a href={`mailto:${s.email}`} className="hover:underline">{s.email}</a> : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {docsError ? (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        ) : (
                          <>
                            <ComplianceMarks summary={c} />
                            <div className={`text-[11px] ${c.worst === "problem" ? "text-danger" : c.worst === "expiring" ? "text-warning" : "text-muted-foreground"}`}>
                              {complianceIssueLine(c)}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">{jobs.get(s.id) ?? 0}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {owedNow > 0.005 ? (
                          <Link href={`/payroll?person=sub:${s.id}`} className="font-semibold text-warning hover:underline">
                            {money(owedNow)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!docsError && (
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-success">Green</span> on file ·{" "}
            <span className="font-semibold text-warning">amber</span> expires within 30 days ·{" "}
            <span className="font-semibold text-danger line-through">red</span>{" "}missing or expired. GL general liability, WC
            workers&apos; comp, Agmt signed agreement.
          </p>
        )}
      </div>
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
