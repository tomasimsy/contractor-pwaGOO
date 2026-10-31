"use client";

import { useEffect, useMemo, useState } from "react";
import { UsersRound } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { entryLaborCosts, type TimeEntry } from "@/lib/services/timeEntryService";
import type { AssignedJob, Employee } from "@/lib/services/employeeService";
import type { UUID } from "@/lib/services/types";

const BUTTON_GHOST = "rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted";

/** Local calendar date as YYYY-MM-DD. */
function localDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA");
}

/** The Monday (YYYY-MM-DD) of the week containing `d`. */
function mondayOf(d: Date = new Date()): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(monday);
}

/** The seven dates of the week starting on `monday`. */
function weekDays(monday: string): string[] {
  const start = new Date(`${monday}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return localDate(d);
  });
}

function shiftWeek(monday: string, weeks: number): string {
  const start = new Date(`${monday}T00:00:00`);
  start.setDate(start.getDate() + weeks * 7);
  return localDate(start);
}

function clockTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function jobName(job: AssignedJob | undefined): string {
  if (!job) return "Unknown job";
  return [job.estimateNumber, job.title].filter(Boolean).join(" · ") || "Untitled job";
}

type View = "person" | "job";

function CrewContent() {
  const { employeeService, timeEntryService, estimateService } = useServices();
  const { profile } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<AssignedJob[]>([]);
  const [assignments, setAssignments] = useState<Array<{ estimateId: UUID; employeeId: UUID }>>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const [view, setView] = useState<View>("person");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const week = useMemo(() => weekDays(weekStart), [weekStart]);
  const isCurrentWeek = weekStart === mondayOf();

  // Everything the page needs, loaded once for the company.
  useEffect(() => {
    if (!profile?.companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const companyId = profile.companyId!;
        const [people, estimateList, crew, all] = await Promise.all([
          employeeService.list({ companyId }),
          estimateService.list({ companyId }),
          employeeService.listAssignments(companyId),
          timeEntryService.listForCompany({ companyId }),
        ]);
        if (cancelled) return;
        setAllEmployees(people);
        setEmployees(people.filter((p) => p.isActive));
        setJobs(estimateList.filter((e) => !e.deletedAt).map((e) => ({ id: e.id, estimateNumber: e.estimateNumber, title: e.title })));
        setAssignments(crew);
        setEntries(all);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the crew.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeService, timeEntryService, estimateService, profile?.companyId]);

  const nameById = useMemo(() => new Map(allEmployees.map((e) => [e.id, e.name])), [allEmployees]);
  // Each entry's approved labor cost, pay type applied, costed over ALL entries so a split day is shared correctly.
  const costById = useMemo(() => entryLaborCosts(entries), [entries]);
  const costOf = (list: TimeEntry[]) => list.reduce((sum, e) => sum + (costById.get(e.id) ?? 0), 0);
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  // Open shifts are shown whatever the week; the rest follow the selected week.
  const openShifts = useMemo(() => entries.filter((e) => e.startedAt && !e.endedAt), [entries]);
  const weekEntries = useMemo(() => entries.filter((e) => week.includes(e.workDate) && e.hours !== null), [entries, week]);

  // Per person: what they're on, where they're assigned, and their week.
  const personRows = useMemo(
    () =>
      employees
        .map((person) => {
          const mine = weekEntries.filter((e) => e.employeeId === person.id);
          const onClock = openShifts.find((e) => e.employeeId === person.id) ?? null;
          const assignedJobs = assignments
            .filter((a) => a.employeeId === person.id)
            .map((a) => jobById.get(a.estimateId))
            .filter((j): j is AssignedJob => !!j);
          return {
            person,
            onClock,
            assignedJobs,
            hours: mine.reduce((sum, e) => sum + (e.hours ?? 0), 0),
            pending: mine.filter((e) => e.status === "submitted").reduce((sum, e) => sum + (e.hours ?? 0), 0),
            cost: costOf(mine),
          };
        })
        .sort((a, b) => Number(!!b.onClock) - Number(!!a.onClock) || a.person.name.localeCompare(b.person.name)),
    [employees, weekEntries, openShifts, assignments, jobById]
  );

  // Per job: the crew on it, who is clocked in there now, and its week.
  const jobRows = useMemo(() => {
    const ids = new Set<UUID>([...assignments.map((a) => a.estimateId), ...weekEntries.map((e) => e.estimateId ?? "").filter(Boolean)]);
    return Array.from(ids)
      .map((id) => jobById.get(id))
      .filter((j): j is AssignedJob => !!j)
      .map((job) => {
        const crew = assignments.filter((a) => a.estimateId === job.id).map((a) => nameById.get(a.employeeId) ?? "Former employee");
        const clockedIn = openShifts.filter((e) => e.estimateId === job.id).map((e) => nameById.get(e.employeeId) ?? "Employee");
        const mine = weekEntries.filter((e) => e.estimateId === job.id);
        return {
          job,
          crew,
          clockedIn,
          hours: mine.reduce((sum, e) => sum + (e.hours ?? 0), 0),
          pending: mine.filter((e) => e.status === "submitted").reduce((sum, e) => sum + (e.hours ?? 0), 0),
          cost: costOf(mine),
        };
      })
      .sort((a, b) => b.hours - a.hours || jobName(a.job).localeCompare(jobName(b.job)));
  }, [assignments, weekEntries, openShifts, jobById, nameById]);

  // Summary across the week.
  const summary = useMemo(() => {
    const hours = weekEntries.reduce((sum, e) => sum + (e.hours ?? 0), 0);
    const pending = weekEntries.filter((e) => e.status === "submitted").reduce((sum, e) => sum + (e.hours ?? 0), 0);
    return {
      onClock: openShifts.filter((e) => employees.some((p) => p.id === e.employeeId)).length,
      hours,
      pending,
      cost: costOf(weekEntries),
    };
  }, [weekEntries, openShifts, employees]);

  return (
    <PageContainer>
      <PageHeader title="Crew" description="Who is working where, and what it costs." />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : employees.length === 0 ? (
        <EmptyState icon={UsersRound} title="No crew yet" description="Add employees and assign them to estimates to see the crew here." />
      ) : (
        <div className="space-y-4">
          {/* Week */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous week" onClick={() => setWeekStart((w) => shiftWeek(w, -1))} className={BUTTON_GHOST}>
                ←
              </button>
              <span className="text-sm font-semibold text-foreground">
                {week[0]} – {week[6]}
              </span>
              <button type="button" aria-label="Next week" onClick={() => setWeekStart((w) => shiftWeek(w, 1))} className={BUTTON_GHOST}>
                →
              </button>
              {!isCurrentWeek && (
                <button type="button" onClick={() => setWeekStart(mondayOf())} className="text-xs font-medium text-primary hover:underline">
                  This week
                </button>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">On the clock now</div>
              <div className="text-xl font-semibold text-success">{summary.onClock}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Hours this week</div>
              <div className="text-xl font-semibold text-foreground">{summary.hours.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Pending approval</div>
              <div className="text-xl font-semibold text-warning">{summary.pending.toFixed(2)} h</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Approved labor</div>
              <div className="text-xl font-semibold text-foreground">{money(summary.cost)}</div>
            </div>
          </div>

          {/* Switch between the two views */}
          <div className="inline-flex rounded-lg border border-input p-0.5">
            {(["person", "job"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v === "person" ? "By person" : "By job"}
              </button>
            ))}
          </div>

          {view === "person" ? (
            <section className="rounded-xl border border-border bg-card">
              <ul className="divide-y divide-border">
                {personRows.map((row) => (
                  <li key={row.person.id} className="space-y-1 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{row.person.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {row.onClock
                            ? `On the clock since ${clockTime(row.onClock.startedAt)} · ${jobName(row.onClock.estimateId ? jobById.get(row.onClock.estimateId) : undefined)}`
                            : "Off the clock"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-foreground">{row.hours.toFixed(2)} h</div>
                        <div className="text-xs text-muted-foreground">{money(row.cost)} approved</div>
                      </div>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {row.assignedJobs.length === 0
                        ? "Not assigned to a job"
                        : `Jobs: ${row.assignedJobs.map(jobName).join(" · ")}`}
                      {row.pending > 0 ? ` · ${row.pending.toFixed(2)} h pending` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-xl border border-border bg-card">
              {jobRows.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No job has a crew or hours this week.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {jobRows.map((row) => (
                    <li key={row.job.id} className="space-y-1 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate text-sm font-semibold text-foreground">{jobName(row.job)}</div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-foreground">{row.hours.toFixed(2)} h</div>
                          <div className="text-xs text-muted-foreground">{money(row.cost)} approved</div>
                        </div>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        Crew: {row.crew.length ? row.crew.join(", ") : "none assigned"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.clockedIn.length ? (
                          <span className="font-medium text-success">On the clock: {row.clockedIn.join(", ")}</span>
                        ) : (
                          "Nobody on the clock"
                        )}
                        {row.pending > 0 ? ` · ${row.pending.toFixed(2)} h pending` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </PageContainer>
  );
}

export default function CrewPage() {
  // Office roles only: the people who approve and manage the crew.
  return (
    <RequirePermission resource="time_entry" action="approve">
      <CrewContent />
    </RequirePermission>
  );
}
