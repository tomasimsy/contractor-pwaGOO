"use client";

import { EmployeeNumber } from "@/components/employees/EmployeeNumber";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Plus } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { hasPermission } from "@/lib/services/permissions";
import type { AssignedJob, Employee } from "@/lib/services/employeeService";
import type { TimeEntry } from "@/lib/services/timeEntryService";
import { applyJobPay, type JobPay } from "@/lib/services/jobPay";
import { periodContaining, shortDate } from "@/lib/payPeriods";
import { supabase } from "@/lib/supabase/client";
import { createSupabasePayeePaymentService } from "@/lib/services/supabase/payeePaymentService";
import type { PaymentRecord } from "@/lib/services/payeeOwed";

const INPUT =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
const SELECT = "rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
const BUTTON = "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60";
const GHOST = "rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60";
const LABEL = "mb-1 block text-xs font-medium text-muted-foreground";

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

/** Moves a week start by a number of weeks (negative = back). */
function shiftWeek(monday: string, weeks: number): string {
  const start = new Date(`${monday}T00:00:00`);
  start.setDate(start.getDate() + weeks * 7);
  return localDate(start);
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function clockTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

/** A stored instant as a local "YYYY-MM-DDTHH:mm" value for a datetime-local input. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function jobLabel(job: AssignedJob | undefined | null): string {
  if (!job) return "Company time";
  return [job.estimateNumber, job.title].filter(Boolean).join(" · ") || "Untitled job";
}

const DAY_NAME = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: "short" });

/** "3h 12m" between an instant and now. */
function elapsed(fromIso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/** Opens turn-by-turn directions to an address in the phone's maps app. */
function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

/** Weekly hours above which an hourly worker is flagged for overtime. Flag only — pay is unchanged. */
const OVERTIME_HOURS = 40;

/** A break in progress: the shift was closed, and "Back to work" reopens it on
 * the same job. Kept on the device (a per-person convenience); the break
 * itself is simply the unpaid gap between the two entries. */
interface BreakInfo {
  estimateId: string | null;
  since: string;
  date: string;
}
const breakKey = (employeeId: string) => `osr-break:${employeeId}`;
function readBreak(employeeId: string): BreakInfo | null {
  try {
    const raw = localStorage.getItem(breakKey(employeeId));
    const info = raw ? (JSON.parse(raw) as BreakInfo) : null;
    // A break left over from another day is not a break any more.
    return info && info.date === localDate() ? info : null;
  } catch {
    return null;
  }
}
function writeBreak(employeeId: string, info: BreakInfo | null) {
  try {
    if (info) localStorage.setItem(breakKey(employeeId), JSON.stringify(info));
    else localStorage.removeItem(breakKey(employeeId));
  } catch {
    // Storage unavailable: the break still works, it just isn't remembered across reloads.
  }
}

/** One thing that looks wrong with an entry, and whose it is. */
interface ReviewIssue {
  employeeId: string;
  text: string;
}

/** One employee's row in the office week table. */
interface OfficeRow {
  id: string;
  name: string;
  /** EMP-0001, when assigned. */
  number: string | null;
  days: Map<string, number>;
  total: number;
  pendingHours: number;
  pendingCount: number;
  issues: number;
}

type OfficeFilter = "all" | "pending" | "review";
const OFFICE_FILTERS: Array<[OfficeFilter, string]> = [
  ["all", "All"],
  ["pending", "Awaiting approval"],
  ["review", "Needs review"],
];

function TimesheetsContent() {
  const { employeeService, timeEntryService, estimateService, projectService, expenseService } = useServices();
  const { profile } = useAuth();

  const isSelf = profile?.role === "employee";
  // Office roles (admin, office, project manager) act on any entry.
  const isOffice = !!profile?.role && hasPermission(profile.role, "time_entry", "approve");
  // Company time (no job) is for office roles and the employee's own login.
  const allowCompanyTime = isOffice || isSelf;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<AssignedJob[]>([]);
  // An employee's job pays, by estimate id: a fixed amount instead of hourly on that job.
  const [myJobPay, setMyJobPay] = useState<Map<string, { amount: number; completed: boolean; mode: "replace" | "add" }>>(new Map());
  // Office users: every job pay in the company (filtered to the selected employee when shown).
  const [companyJobPays, setCompanyJobPays] = useState<Array<{ estimateId: string; employeeId: string; amount: number; mode: "replace" | "add" }>>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [openShift, setOpenShift] = useState<TimeEntry | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const [selectedDay, setSelectedDay] = useState(() => localDate());
  // Office filters for the day list.
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterJob, setFilterJob] = useState("");
  const [clockJob, setClockJob] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<TimeEntry | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [draft, setDraft] = useState({ workDate: "", hours: "", estimateId: "", notes: "", startedAt: "", endedAt: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [addDraft, setAddDraft] = useState({ workDate: localDate(), hours: "", estimateId: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Clock extras (employee view).
  const [now, setNow] = useState(() => Date.now());
  const [onBreak, setOnBreak] = useState<BreakInfo | null>(null);
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [clockOutNote, setClockOutNote] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchJob, setSwitchJob] = useState("");
  const [staleEnd, setStaleEnd] = useState("");
  // The employee's own pay period: its entries and their payments.
  const [periodEntries, setPeriodEntries] = useState<TimeEntry[]>([]);
  const [myPayments, setMyPayments] = useState<PaymentRecord[]>([]);
  const [paymentsByEmployee, setPaymentsByEmployee] = useState<Map<string, PaymentRecord[]>>(new Map());

  const week = useMemo(() => weekDays(weekStart), [weekStart]);
  const isCurrentWeek = weekStart === mondayOf();
  const employee = useMemo(() => employees.find((e) => e.id === employeeId) ?? null, [employees, employeeId]);
  const nameById = useMemo(() => new Map(allEmployees.map((e) => [e.id, e.name])), [allEmployees]);
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  // Jobs this user supervises (team members). Office roles approve anything.
  const teamJobIds = useMemo(
    () => (isOffice || isSelf ? new Set<string>() : new Set(jobs.map((j) => j.id))),
    [jobs, isOffice, isSelf]
  );
  const canApprove = isOffice || teamJobIds.size > 0;
  const canApproveEntry = (e: TimeEntry) => isOffice || (!!e.estimateId && teamJobIds.has(e.estimateId));
  const canEditEntry = (e: TimeEntry) => (isSelf ? e.status === "submitted" : canApproveEntry(e));
  const isOpenShift = (e: TimeEntry) => !!e.startedAt && !e.endedAt;

  // An employee sees the pay basis for each of their jobs.
  useEffect(() => {
    if (!isSelf) return;
    employeeService
      .listMyJobPays()
      .then((rows) => setMyJobPay(new Map(rows.map((r) => [r.estimateId, { amount: r.amount, completed: r.completed, mode: r.mode }]))))
      .catch(() => setMyJobPay(new Map()));
  }, [employeeService, isSelf]);

  // Office users see each employee's job pays, so the hours and pay match the Payroll page.
  useEffect(() => {
    if (!isOffice || !profile?.companyId) return;
    employeeService
      .listJobPays(profile.companyId)
      .then(setCompanyJobPays)
      .catch(() => setCompanyJobPays([]));
  }, [employeeService, isOffice, profile?.companyId]);

  // Who and what this user can see.
  useEffect(() => {
    if (!profile?.companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list, jobList] = await Promise.all([
          employeeService.list({ companyId: profile.companyId! }),
          isSelf
            ? employeeService.listMyAssignedJobs()
            : isOffice
              ? Promise.all([estimateService.list({ companyId: profile.companyId! }), projectService.list({ companyId: profile.companyId! })]).then(
                  ([rows, projects]) => {
                    const completedProjects = new Set(projects.filter((p) => p.status === "completed").map((p) => p.id));
                    return rows
                      .filter((e) => !e.deletedAt)
                      .map((e) => ({ id: e.id, estimateNumber: e.estimateNumber, title: e.title, completed: completedProjects.has(e.projectId) }));
                  }
                )
              : employeeService.listMyTeamJobs(),
        ]);
        if (cancelled) return;
        setAllEmployees(list);
        setJobs(jobList);
        if (isSelf) {
          const mine = await employeeService.getForProfile(profile.userId);
          if (cancelled) return;
          setEmployees(mine ? [mine] : []);
          setEmployeeId(mine?.id ?? "");
        } else {
          const active = list.filter((e) => e.isActive);
          setEmployees(active);
          setEmployeeId((prev) => prev || active[0]?.id || "");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load timesheets.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeService, estimateService, profile, isSelf, isOffice]);

  const refresh = useCallback(async () => {
    if (!profile?.companyId) return;
    try {
      if (employeeId) setOpenShift(await timeEntryService.getOpenShift(employeeId));
      if (isSelf && employeeId) {
        const days = employees.find((e) => e.id === employeeId)?.payFrequency === "weekly" ? 7 : 14;
        const current = periodContaining(new Date(), days);
        setPeriodEntries(await timeEntryService.listForEmployee(employeeId, { from: current.start, to: current.end }));
        setOnBreak(readBreak(employeeId));
      }
      const range = { from: week[0], to: week[6] };
      setEntries(
        isSelf && employeeId
          ? await timeEntryService.listForEmployee(employeeId, range)
          : await timeEntryService.listForCompany({ companyId: profile.companyId }, range)
      );
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entries.");
    }
  }, [timeEntryService, profile, employeeId, isSelf, week, employees]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // The running timer ticks while a shift or a break is open.
  useEffect(() => {
    if (!openShift && !onBreak) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [openShift, onBreak]);

  // Every employee's payments: the employee sees their own paid status, and the
  // office sees which hours are locked by a paid pay period.
  useEffect(() => {
    if (!profile?.companyId) return;
    const payService = createSupabasePayeePaymentService(
      supabase,
      { employeeService, timeEntryService, estimateService, projectService, expenseService },
      profile.companyId
    );
    payService
      .load()
      .then((rows) => {
        const byEmployee = new Map<string, PaymentRecord[]>();
        for (const r of rows) {
          if (r.kind !== "employee") continue;
          byEmployee.set(r.key.replace("employee:", ""), r.payments);
        }
        setPaymentsByEmployee(byEmployee);
        setMyPayments(isSelf ? [...(rows.find((r) => r.kind === "employee")?.payments ?? [])] : []);
      })
      .catch(() => {
        setPaymentsByEmployee(new Map());
        setMyPayments([]);
      });
  }, [isSelf, profile?.companyId, employeeService, timeEntryService, estimateService, projectService, expenseService]);

  /** True when a live wage payment already covers this entry's work date: the hours are locked. */
  const isLocked = useCallback(
    (e: TimeEntry) =>
      (paymentsByEmployee.get(e.employeeId) ?? []).some(
        (p) => p.paymentKind === "pay" && !p.reversedAt && !!p.periodStart && !!p.periodEnd && p.periodStart <= e.workDate && e.workDate <= p.periodEnd
      ),
    [paymentsByEmployee]
  );

  // Keep the selected day inside the week on screen.
  useEffect(() => {
    if (!week.includes(selectedDay)) setSelectedDay(week[0]);
  }, [week, selectedDay]);

  // The week, narrowed by the office filters.
  const visibleEntries = useMemo(
    () => entries.filter((e) => (!filterEmployee || e.employeeId === filterEmployee) && (!filterJob || e.estimateId === filterJob)),
    [entries, filterEmployee, filterJob]
  );
  const dayEntries = useMemo(() => visibleEntries.filter((e) => e.workDate === selectedDay), [visibleEntries, selectedDay]);
  // Office review: entries in the week on screen that look wrong.
  const reviewIssues = useMemo(() => {
    if (!isOffice) return [] as ReviewIssue[];
    const todayStr = localDate();
    const issues: ReviewIssue[] = [];
    for (const e of visibleEntries) {
      const who = `${nameById.get(e.employeeId) ?? "Employee"} · ${e.workDate.slice(5)}`;
      if (isOpenShift(e) && e.workDate < todayStr) {
        issues.push({ employeeId: e.employeeId, text: `${who}: still clocked in from an earlier day` });
      } else if (e.endedAt && (e.hours ?? 0) <= 0) {
        issues.push({ employeeId: e.employeeId, text: `${who}: entry has 0.00 hours` });
      } else if ((e.hours ?? 0) > 12) {
        issues.push({ employeeId: e.employeeId, text: `${who}: ${(e.hours ?? 0).toFixed(1)} h in one entry, check the clock-out` });
      }
    }
    // Two timed entries for the same person on the same day that overlap.
    const timed = visibleEntries.filter((e) => e.startedAt && e.endedAt);
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        const a = timed[i];
        const b = timed[j];
        if (a.employeeId !== b.employeeId || a.workDate !== b.workDate) continue;
        const aStart = new Date(a.startedAt as string).getTime();
        const aEnd = new Date(a.endedAt as string).getTime();
        const bStart = new Date(b.startedAt as string).getTime();
        const bEnd = new Date(b.endedAt as string).getTime();
        if (aStart < bEnd && bStart < aEnd) {
          issues.push({ employeeId: a.employeeId, text: `${nameById.get(a.employeeId) ?? "Employee"} · ${a.workDate.slice(5)}: two entries overlap` });
        }
      }
    }
    // Hourly workers over 40 h in the week on screen (flag only; pay unchanged).
    const weekly = new Map<string, number>();
    for (const e of visibleEntries) weekly.set(e.employeeId, (weekly.get(e.employeeId) ?? 0) + (e.hours ?? 0));
    for (const [id, hours] of weekly) {
      const emp = allEmployees.find((x) => x.id === id);
      if (emp && emp.payType !== "daily" && hours > OVERTIME_HOURS) {
        issues.push({ employeeId: id, text: `${emp.name}: ${hours.toFixed(1)} h this week, over ${OVERTIME_HOURS}` });
      }
    }
    return issues;
  }, [isOffice, visibleEntries, nameById, allEmployees]);
  const hoursByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of visibleEntries) map.set(e.workDate, (map.get(e.workDate) ?? 0) + (e.hours ?? 0));
    return map;
  }, [visibleEntries]);
  const weekHours = useMemo(() => visibleEntries.reduce((sum, e) => sum + (e.hours ?? 0), 0), [visibleEntries]);
  const dayHours = useMemo(() => dayEntries.reduce((sum, e) => sum + (e.hours ?? 0), 0), [dayEntries]);

  // Money: approved labor for the week, with pay type and job pay applied (costed over all entries).
  // Same rules as the engine: a job pay replaces the hourly pay on its job, and counts once the project is complete.
  // The job pays that apply to the person whose hours are shown: the signed-in employee's own,
  // or, for an office user, the selected employee's.
  const payByJob = useMemo(() => {
    if (isSelf) return myJobPay;
    const map = new Map<string, { amount: number; completed: boolean; mode: "replace" | "add" }>();
    if (!employee) return map;
    const completedIds = new Set(jobs.filter((j) => j.completed).map((j) => j.id));
    for (const p of companyJobPays) {
      if (p.employeeId !== employee.id) continue;
      map.set(p.estimateId, { amount: p.amount, completed: completedIds.has(p.estimateId), mode: p.mode });
    }
    return map;
  }, [isSelf, myJobPay, employee, companyJobPays, jobs]);
  const jobPayList = useMemo<JobPay[]>(
    () => (employee ? Array.from(payByJob, ([estimateId, p]) => ({ estimateId, employeeId: employee.id, amount: p.amount, mode: p.mode })) : []),
    [employee, payByJob]
  );
  const completedJobs = useMemo(() => new Set(Array.from(payByJob).filter(([, p]) => p.completed).map(([id]) => id)), [payByJob]);
  const applied = useMemo(() => applyJobPay(entries, jobPayList, completedJobs), [entries, jobPayList, completedJobs]);
  const costById = applied.entryCost;
  const earnedByJob = applied.jobPayCost;
  const approvedAmount = useMemo(
    () =>
      visibleEntries.reduce((sum, e) => sum + (costById.get(e.id) ?? 0), 0) +
      Array.from(new Set(visibleEntries.map((e) => e.estimateId).filter((id): id is string => !!id))).reduce(
        (sum, id) => sum + (earnedByJob.get(id) ?? 0),
        0
      ),
    [visibleEntries, costById, earnedByJob]
  );
  const pendingHours = useMemo(
    () => visibleEntries.filter((e) => e.status === "submitted").reduce((sum, e) => sum + (e.hours ?? 0), 0),
    [visibleEntries]
  );

  // ---- Employee's own pay period (same periods as Payroll and My pay) ----
  const periodDays = employee?.payFrequency === "weekly" ? 7 : 14;
  const payPeriod = useMemo(() => periodContaining(new Date(), periodDays), [periodDays]);
  /** Live wage payments, newest first. */
  const wagePayments = useMemo(
    () => myPayments.filter((p) => p.paymentKind === "pay" && !p.reversedAt).sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
    [myPayments]
  );
  /** The payment that paid an approved entry: one for its pay period, made on or after the
   * day it was approved (an entry approved after the check went out is not paid yet). */
  const paymentFor = useCallback(
    (entry: TimeEntry) => {
      if (entry.status !== "approved") return null;
      const approvedOn = entry.approvedAt?.slice(0, 10) ?? "";
      return (
        wagePayments.find(
          (p) => p.periodStart && p.periodEnd && p.periodStart <= entry.workDate && entry.workDate <= p.periodEnd && p.paidOn >= approvedOn
        ) ?? null
      );
    },
    [wagePayments]
  );
  const periodSummary = useMemo(() => {
    const closed = periodEntries.filter((e) => !isOpenShift(e));
    const hours = closed.reduce((t, e) => t + (e.hours ?? 0), 0);
    const costs = applyJobPay(periodEntries, jobPayList, completedJobs).entryCost;
    const approved = closed.filter((e) => e.status === "approved").reduce((t, e) => t + (costs.get(e.id) ?? 0), 0);
    const pending = closed.filter((e) => e.status === "submitted");
    const pendingHrs = pending.reduce((t, e) => t + (e.hours ?? 0), 0);
    // An estimate only: what pending hours pay once approved. A day-rate worker
    // earns one day's pay per day with hours; a job paid by "replace" job pay earns no hourly.
    const replaced = new Set(jobPayList.filter((p) => (p.mode ?? "replace") === "replace").map((p) => p.estimateId));
    const approvedDays = new Set(closed.filter((e) => e.status === "approved" && e.payType === "daily").map((e) => e.workDate));
    const pendingDays = new Map<string, number>();
    let pendingPay = 0;
    for (const e of pending) {
      if (e.estimateId && replaced.has(e.estimateId)) continue;
      if (e.payType === "daily") {
        if (!approvedDays.has(e.workDate)) pendingDays.set(e.workDate, e.rate);
      } else pendingPay += (e.hours ?? 0) * e.rate;
    }
    for (const rate of pendingDays.values()) pendingPay += rate;
    // Payments made for this period so far (a period can be paid in more than one check).
    const paidForPeriod = wagePayments.filter((p) => p.periodEnd === payPeriod.end);
    const paidTotal = Math.round(paidForPeriod.reduce((t, p) => t + p.amount, 0) * 100) / 100;
    return { hours, approved, pendingHrs, pendingPay: Math.round(pendingPay * 100) / 100, paid: paidForPeriod[0] ?? null, paidTotal };
  }, [periodEntries, jobPayList, completedJobs, wagePayments, payPeriod.end]);

  /** Hourly workers past 40 h this week are flagged (display only). */
  const overtimeHours = isSelf && employee?.payType !== "daily" && isCurrentWeek ? Math.max(0, weekHours - OVERTIME_HOURS) : 0;
  /** Weekdays already past this week with nothing logged. */
  const missingDays = useMemo(() => {
    if (!isSelf || !isCurrentWeek) return [] as string[];
    const todayStr = localDate();
    return week.slice(0, 5).filter((d) => d < todayStr && !(hoursByDay.get(d) ?? 0));
  }, [isSelf, isCurrentWeek, week, hoursByDay]);

  // Per job: hours this week, and the pay basis for this employee.
  const jobRows = useMemo(
    () =>
      jobs
        .map((job) => {
          const mine = visibleEntries.filter((e) => e.estimateId === job.id);
          return {
            job,
            hours: mine.reduce((sum, e) => sum + (e.hours ?? 0), 0),
            amount: mine.reduce((sum, e) => sum + (costById.get(e.id) ?? 0), 0) + (earnedByJob.get(job.id) ?? 0),
            onClock: openShift?.estimateId === job.id,
          };
        })
        .sort((a, b) => Number(b.onClock) - Number(a.onClock) || b.hours - a.hours || jobLabel(a.job).localeCompare(jobLabel(b.job))),
    [jobs, visibleEntries, costById, earnedByJob, openShift]
  );
  // Active: not completed, with hours this week or on the clock. Completed: the project is done.
  const activeRows = jobRows.filter((r) => !r.job.completed && (r.hours > 0 || r.onClock));
  const completedRows = jobRows.filter((r) => r.job.completed && (r.hours > 0 || r.onClock || payByJob.has(r.job.id)));
  const otherRows = jobRows.filter((r) => !r.job.completed && !(r.hours > 0 || r.onClock));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  /** Opens a shift on a job (or company time) for the employee on screen. */
  function clockInTo(estimateId: string | null) {
    if (!profile?.companyId || !employee) throw new Error("No employee selected.");
    return timeEntryService.clockIn({
      companyId: profile.companyId,
      employeeId: employee.id,
      estimateId,
      workDate: localDate(),
      rate: employee.hourlyRate,
      payType: employee.payType,
      enteredBy: profile.userId,
    });
  }

  function clockIn() {
    if (!employee) return;
    run(async () => {
      await clockInTo(clockJob || null);
      writeBreak(employee.id, null);
      setOnBreak(null);
    });
  }

  /** Clock out, with an optional note about the work done. */
  function clockOut() {
    if (!openShift) return;
    const note = clockOutNote.trim();
    run(async () => {
      const closed = await timeEntryService.clockOut(openShift.id);
      if (note) await timeEntryService.updateEntry(closed.id, { notes: note });
      setClockOutOpen(false);
      setClockOutNote("");
    });
  }

  /** A break closes the shift; "Back to work" opens a new one on the same job. The gap is unpaid. */
  function startBreak() {
    if (!openShift || !employee) return;
    const info: BreakInfo = { estimateId: openShift.estimateId, since: new Date().toISOString(), date: localDate() };
    run(async () => {
      await timeEntryService.clockOut(openShift.id);
      writeBreak(employee.id, info);
      setOnBreak(info);
    });
  }

  function backFromBreak() {
    if (!onBreak || !employee) return;
    run(async () => {
      await clockInTo(onBreak.estimateId);
      writeBreak(employee.id, null);
      setOnBreak(null);
    });
  }

  function endBreakWithoutReturning() {
    if (!employee) return;
    writeBreak(employee.id, null);
    setOnBreak(null);
  }

  /** Moves straight to another job: closes this shift and opens the next at the same moment. */
  function switchToJob() {
    if (!openShift) return;
    if ((switchJob || null) === openShift.estimateId) return setError("That's the job you're already on.");
    run(async () => {
      await timeEntryService.clockOut(openShift.id);
      await clockInTo(switchJob || null);
      setSwitching(false);
    });
  }

  /** A shift left open from an earlier day: the employee says when they actually left. */
  function closeStaleShift() {
    if (!openShift?.startedAt) return;
    if (!staleEnd) return setError("Enter the time you left.");
    const end = new Date(staleEnd);
    const start = Date.parse(openShift.startedAt);
    if (end.getTime() <= start) return setError("The time you left must be after you clocked in.");
    if (end.getTime() - start > 24 * 3_600_000) return setError("That's more than 24 hours after you clocked in. Check the date.");
    run(async () => {
      await timeEntryService.clockOut(openShift.id, end.toISOString());
      setStaleEnd("");
    });
  }

  function openAdd() {
    setAddDraft({ workDate: selectedDay, hours: "", estimateId: "" });
    setError(null);
    setAddOpen(true);
  }

  function saveAdd() {
    if (!profile?.companyId || !employee) return;
    const hours = Number(addDraft.hours);
    if (!(hours > 0 && hours <= 24)) return setError("Hours must be more than 0 and at most 24.");
    if (!allowCompanyTime && !addDraft.estimateId) return setError("Choose a job.");
    run(async () => {
      await timeEntryService.addManualEntry({
        companyId: profile.companyId!,
        employeeId: employee.id,
        estimateId: addDraft.estimateId || null,
        workDate: addDraft.workDate,
        hours,
        rate: employee.hourlyRate,
        payType: employee.payType,
        enteredBy: profile.userId,
      });
      setAddOpen(false);
    });
  }

  function openDetail(entry: TimeEntry) {
    setDetail(entry);
    setDetailEditing(false);
    setError(null);
  }

  function startEdit(entry: TimeEntry) {
    setDraft({
      workDate: entry.workDate,
      hours: entry.hours !== null ? String(entry.hours) : "",
      estimateId: entry.estimateId ?? "",
      notes: entry.notes ?? "",
      startedAt: entry.startedAt ? toLocalInput(entry.startedAt) : "",
      endedAt: entry.endedAt ? toLocalInput(entry.endedAt) : "",
    });
    setDetailEditing(true);
  }

  function saveEdit(entry: TimeEntry) {
    const timed = !!entry.startedAt && !!entry.endedAt;
    if (!draft.workDate) return setError("Choose a date.");
    if (timed) {
      if (!draft.startedAt || !draft.endedAt) return setError("Both clock-in and clock-out are needed.");
    } else {
      const hours = Number(draft.hours);
      if (!(hours > 0 && hours <= 24)) return setError("Hours must be more than 0 and at most 24.");
    }
    run(async () => {
      await timeEntryService.updateEntry(
        entry.id,
        timed
          ? {
              estimateId: draft.estimateId || null,
              workDate: draft.workDate,
              notes: draft.notes.trim() || null,
              startedAt: new Date(draft.startedAt).toISOString(),
              endedAt: new Date(draft.endedAt).toISOString(),
            }
          : {
              estimateId: draft.estimateId || null,
              workDate: draft.workDate,
              notes: draft.notes.trim() || null,
              hours: Number(draft.hours),
            }
      );
      setDetail(null);
      setDetailEditing(false);
    });
  }

  /** Office only: deleting needs a reason, kept in the audit trail. The reason is typed in the detail pop-up. */
  function removeEntry(entry: TimeEntry) {
    const reason = deleteReason.trim();
    if (!reason) return setError("Enter a reason to delete this entry.");
    run(async () => {
      await timeEntryService.softDelete(entry.id, reason);
      setDetail(null);
      setDeleteReason("");
      setDeleting(false);
    });
  }

  function approveSelected() {
    if (!profile || selected.length === 0) return;
    run(() => timeEntryService.approve(selected, profile.userId));
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const [officeFilter, setOfficeFilter] = useState<OfficeFilter>("all");
  // The job filter lists open jobs only; a job already selected stays listed.
  const filterJobOptions = useMemo(() => jobs.filter((j) => !j.completed || j.id === filterJob), [jobs, filterJob]);
  // Office table: one row per active employee for the week on screen.
  const officeRows = useMemo<OfficeRow[]>(() => {
    const rows = new Map<string, OfficeRow>();
    for (const emp of employees) {
      if (filterEmployee && emp.id !== filterEmployee) continue;
      rows.set(emp.id, { id: emp.id, name: emp.name, number: emp.employeeNumber ?? null, days: new Map(), total: 0, pendingHours: 0, pendingCount: 0, issues: 0 });
    }
    for (const e of visibleEntries) {
      const row = rows.get(e.employeeId);
      if (!row) continue;
      const h = e.hours ?? 0;
      row.days.set(e.workDate, (row.days.get(e.workDate) ?? 0) + h);
      row.total += h;
      if (e.status === "submitted" && !isOpenShift(e)) {
        row.pendingHours += h;
        row.pendingCount += 1;
      }
    }
    for (const issue of reviewIssues) {
      const row = rows.get(issue.employeeId);
      if (row) row.issues += 1;
    }
    return Array.from(rows.values())
      .filter((r) => officeFilter === "all" || (officeFilter === "pending" ? r.pendingCount > 0 : r.issues > 0))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, filterEmployee, visibleEntries, reviewIssues, officeFilter]);

  const approvableSelected = selected.filter((id) =>
    visibleEntries.some((e) => e.id === id && e.status === "submitted" && !isOpenShift(e) && canApproveEntry(e))
  );

  const jobOptions = (
    <>
      {allowCompanyTime && <option value="">Company time</option>}
      {jobs.map((j) => (
        <option key={j.id} value={j.id}>
          {jobLabel(j)}
          {payByJob.has(j.id) ? ` · job pay ${money(payByJob.get(j.id)?.amount ?? 0)}` : ""}
        </option>
      ))}
    </>
  );

  const payBasis = employee
    ? employee.payType === "daily"
      ? `${money(employee.hourlyRate)} per day`
      : `${money(employee.hourlyRate)} per hour`
    : "";

  return (
    <PageContainer>
      {error && <div className="mx-auto mb-3 max-w-md rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={isSelf ? "No employee record for your login" : "No employees yet"}
          description={isSelf ? "Ask an admin to link your login to your employee record." : "Add employees on the Employees page first."}
        />
      ) : (
        <>
        {isOffice && (
          <div className="hidden md:block">
            <PageHeader
              title="Timesheets"
              description="Approve hours and fix entries for the week."
              actions={
                <button type="button" onClick={openAdd} disabled={!filterEmployee} className={BUTTON}>
                  <Plus className="mr-1 inline size-4" aria-hidden="true" />
                  Add hours
                </button>
              }
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <button type="button" aria-label="Previous week" onClick={() => setWeekStart((w) => shiftWeek(w, -1))} className={GHOST}>
                  ←
                </button>
                <span className="min-w-[9rem] text-center font-medium text-foreground">
                  {week[0].slice(5)} – {week[6].slice(5)}
                </span>
                <button type="button" aria-label="Next week" onClick={() => setWeekStart((w) => shiftWeek(w, 1))} className={GHOST}>
                  →
                </button>
                <button type="button" onClick={() => setWeekStart(mondayOf())} className="text-xs font-medium text-primary hover:underline">
                  This week
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterEmployee}
                  onChange={(e) => {
                    setFilterEmployee(e.target.value);
                    if (e.target.value) setEmployeeId(e.target.value);
                  }}
                  className={SELECT}
                  aria-label="Filter by employee"
                >
                  <option value="">All employees</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <select value={filterJob} onChange={(e) => setFilterJob(e.target.value)} className={SELECT} aria-label="Filter by job">
                  <option value="">All jobs</option>
                  {filterJobOptions.map((j) => (
                    <option key={j.id} value={j.id}>{jobLabel(j)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-3 text-sm">
              <span>
                <span className="font-semibold text-foreground">{weekHours.toFixed(1)}</span> <span className="text-muted-foreground">h this week</span>
              </span>
              <span>
                <span className="font-semibold text-foreground">{pendingHours.toFixed(1)}</span> <span className="text-muted-foreground">h awaiting approval</span>
              </span>
              <span>
                <span className="font-semibold text-foreground">{reviewIssues.length}</span> <span className="text-muted-foreground">to review</span>
              </span>
              <div className="ml-auto flex gap-1.5 text-xs">
                {OFFICE_FILTERS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOfficeFilter(key)}
                    className={`rounded-full px-3 py-1 ${officeFilter === key ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {reviewIssues.length > 0 && (
              <div className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs">
                <div className="mb-1 font-medium text-foreground">Needs review · {reviewIssues.length}</div>
                <ul className="grid gap-x-6 gap-y-0.5 text-muted-foreground sm:grid-cols-2">
                  {reviewIssues.slice(0, 10).map((issue, i) => (
                    <li key={i}>{issue.text}</li>
                  ))}
                </ul>
                {reviewIssues.length > 10 && <div className="mt-1 text-muted-foreground">and {reviewIssues.length - 10} more</div>}
              </div>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 font-normal">Employee</th>
                    {week.map((d) => (
                      <th key={d} className="py-2 text-right font-normal">
                        {DAY_NAME(d)} {Number(d.slice(8))}
                      </th>
                    ))}
                    <th className="py-2 text-right font-normal">Week</th>
                    <th className="py-2 text-right font-normal">Awaiting</th>
                  </tr>
                </thead>
                <tbody>
                  {officeRows.map((r) => (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterEmployee(r.id);
                            setEmployeeId(r.id);
                          }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {r.name}
                          <EmployeeNumber value={r.number} className="ml-1.5" />
                        </button>
                        {r.issues > 0 && <span className="ml-2 text-xs text-warning">{r.issues} to review</span>}
                      </td>
                      {week.map((d) => {
                        const h = r.days.get(d) ?? 0;
                        const active = d === selectedDay;
                        return (
                          <td key={d} className="py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedDay(d)}
                              className={`min-w-[2.75rem] rounded px-1.5 py-1 tabular-nums hover:bg-muted ${active ? "bg-primary/10 font-semibold text-primary" : "text-foreground"}`}
                            >
                              {h > 0 ? h.toFixed(1) : <span className="text-muted-foreground">–</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td className="py-2 text-right font-medium tabular-nums text-foreground">{r.total.toFixed(1)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {r.pendingHours > 0 ? <span className="font-medium text-warning">{r.pendingHours.toFixed(1)}</span> : <span className="text-muted-foreground">–</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {officeRows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No one matches this filter.</p>}
            </div>

            <div className="mt-6">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-semibold text-foreground">{DAY_NAME(selectedDay)} {selectedDay}</span>
                  <span className="text-muted-foreground">
                    {" "}· {dayHours.toFixed(2)} h · {filterEmployee ? (nameById.get(filterEmployee) ?? "Employee") : "all employees"}
                  </span>
                </div>
                {approvableSelected.length > 0 && (
                  <button type="button" disabled={busy} onClick={approveSelected} className={BUTTON}>
                    Approve {approvableSelected.length} selected
                  </button>
                )}
              </div>
              {dayEntries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">Nothing recorded for this day.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="w-8 py-2 font-normal"><span className="sr-only">Select</span></th>
                      <th className="py-2 font-normal">Employee</th>
                      <th className="py-2 font-normal">Job</th>
                      <th className="py-2 font-normal">Time</th>
                      <th className="py-2 text-right font-normal">Hours</th>
                      <th className="py-2 pl-6 font-normal">Status</th>
                      <th className="py-2 font-normal"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEntries.map((entry) => {
                      const selectable = canApproveEntry(entry) && entry.status === "submitted" && !isOpenShift(entry);
                      const approved = entry.status === "approved";
                      return (
                        <tr key={entry.id} className="border-b border-border/60">
                          <td className="py-2">
                            {selectable && <input type="checkbox" checked={selected.includes(entry.id)} onChange={() => toggle(entry.id)} aria-label="Select for approval" />}
                          </td>
                          <td className="py-2 text-foreground">{nameById.get(entry.employeeId) ?? "Employee"}</td>
                          <td className="py-2">
                            <div className="max-w-[260px] truncate">{jobLabel(entry.estimateId ? jobById.get(entry.estimateId) : null)}</div>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {entry.startedAt && entry.endedAt
                              ? `${clockTime(entry.startedAt)} – ${clockTime(entry.endedAt)}`
                              : isOpenShift(entry)
                                ? `In since ${clockTime(entry.startedAt)}`
                                : "Entered by hand"}
                          </td>
                          <td className="py-2 text-right tabular-nums">{entry.hours !== null ? entry.hours.toFixed(2) : "open"}</td>
                          <td className="py-2 pl-6">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${approved ? "bg-success/15 text-success" : "bg-warning/20 text-warning"}`}>
                              {approved ? "Approved" : "Pending"}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            <button type="button" onClick={() => openDetail(entry)} className="text-xs font-medium text-primary hover:underline">
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <div className={`mx-auto flex max-w-md flex-col gap-3${isOffice ? " md:hidden" : ""}`}>
          {isOffice ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">People</span>
                <button type="button" onClick={openAdd} disabled={!filterEmployee} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:opacity-50">
                  <Plus className="size-4" aria-hidden="true" /> Add hours
                </button>
              </div>
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {officeRows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterEmployee(r.id);
                        setEmployeeId(r.id);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ${r.id === filterEmployee ? "bg-primary/10" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {r.name}
                          <EmployeeNumber value={r.number} className="ml-1.5" />
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {r.total.toFixed(1)} h this week{r.issues > 0 ? ` · ${r.issues} to review` : ""}
                        </span>
                      </span>
                      {r.pendingHours > 0 && <span className="shrink-0 text-sm font-medium text-warning">{r.pendingHours.toFixed(1)} h to approve</span>}
                    </button>
                  </li>
                ))}
                {officeRows.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No one matches this filter.</li>}
              </ul>
            </div>
          ) : (
          /* Profile strip: a plain line, no card. */
          <div className="flex items-end justify-between border-b border-border pb-2.5">
            <div className="min-w-0">
              {isSelf ? (
                <>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">My time</h1>
                  <div className="truncate text-xs text-muted-foreground">
                    {new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} · {employee?.name}
                    <EmployeeNumber value={employee?.employeeNumber} className="ml-1.5" />
                  </div>
                </>
              ) : (
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-base font-medium text-foreground"
                  aria-label="Employee"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              )}
              <div className="text-xs text-muted-foreground">{payBasis}</div>
            </div>
            {/* Employees log time with the clock only; the office adds or fixes hours by hand. */}
            {!isSelf && (
              <button type="button" onClick={openAdd} disabled={!employee} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:opacity-50">
                <Plus className="size-4" aria-hidden="true" /> Add hours
              </button>
            )}
          </div>

          )}

          {isOffice && (
            <div className="-mt-1 text-xs text-muted-foreground">
              {pendingHours.toFixed(1)} h awaiting approval · {reviewIssues.length} to review
            </div>
          )}

          {/* Clock card: solid green while running, a bordered card when off. */}
          {isOffice ? null : openShift && openShift.workDate < localDate() ? (
            /* Forgot to clock out on an earlier day: ask when they left. */
            <div className="space-y-3 rounded-xl border-2 border-warning bg-warning/10 p-4">
              <div className="text-sm font-medium text-foreground">
                You&apos;re still clocked in from {DAY_NAME(openShift.workDate)} {shortDate(openShift.workDate)}, {clockTime(openShift.startedAt)}
              </div>
              <div className="text-xs text-muted-foreground">
                {jobLabel(openShift.estimateId ? jobById.get(openShift.estimateId) : null)}. What time did you leave?
              </div>
              <input
                type="datetime-local"
                value={staleEnd}
                min={openShift.startedAt ? toLocalInput(openShift.startedAt) : undefined}
                onChange={(e) => setStaleEnd(e.target.value)}
                className={INPUT}
                aria-label="Time you left"
              />
              <button type="button" disabled={busy || !staleEnd} onClick={closeStaleShift} className="w-full rounded-lg bg-success py-2.5 text-[15px] font-medium text-white disabled:opacity-60">
                Save clock-out
              </button>
            </div>
          ) : openShift ? (
            <div className="space-y-3 rounded-xl bg-success p-4 text-white shadow-md">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-xs font-medium uppercase tracking-wide opacity-90">On the clock</div>
                <div className="text-xs opacity-90">since {clockTime(openShift.startedAt)}</div>
              </div>
              {openShift.startedAt && <div className="text-3xl font-semibold tabular-nums">{elapsed(openShift.startedAt, now)}</div>}
              {(() => {
                const job = openShift.estimateId ? jobById.get(openShift.estimateId) : null;
                return (
                  <div>
                    <div className="truncate text-base font-medium">{jobLabel(job)}</div>
                    {job?.jobDetails && (
                      <details className="text-sm opacity-90">
                        <summary className="cursor-pointer select-none">Job details</summary>
                        <p className="mt-1 whitespace-pre-line">{job.jobDetails}</p>
                      </details>
                    )}
                    {job?.address && (
                      <a href={directionsUrl(job.address)} target="_blank" rel="noreferrer" className="block truncate text-sm underline decoration-white/50 underline-offset-2">
                        {job.address} · Directions
                      </a>
                    )}
                  </div>
                );
              })()}
              {clockOutOpen ? (
                <div className="space-y-2">
                  <textarea
                    value={clockOutNote}
                    onChange={(e) => setClockOutNote(e.target.value)}
                    rows={2}
                    placeholder="What did you get done? (optional)"
                    className="w-full rounded-lg border-0 bg-white/95 px-3 py-2 text-sm text-foreground outline-none"
                  />
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <button type="button" onClick={() => setClockOutOpen(false)} className="rounded-lg border border-white/60 px-3 py-2.5 text-sm font-medium">
                      Back
                    </button>
                    <button type="button" disabled={busy} onClick={clockOut} className="rounded-lg bg-white py-2.5 text-[15px] font-medium text-success disabled:opacity-60">
                      Clock out
                    </button>
                  </div>
                </div>
              ) : switching ? (
                <div className="space-y-2">
                  <select value={switchJob} onChange={(e) => setSwitchJob(e.target.value)} className={`${INPUT} text-foreground`} aria-label="Switch to job">
                    {jobOptions}
                  </select>
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <button type="button" onClick={() => setSwitching(false)} className="rounded-lg border border-white/60 px-3 py-2.5 text-sm font-medium">
                      Back
                    </button>
                    <button type="button" disabled={busy || (!allowCompanyTime && !switchJob)} onClick={switchToJob} className="rounded-lg bg-white py-2.5 text-[15px] font-medium text-success disabled:opacity-60">
                      Switch now
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" disabled={busy} onClick={startBreak} className="rounded-lg border border-white/60 py-2.5 text-sm font-medium disabled:opacity-60">
                    Break
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSwitchJob(jobs.find((j) => j.id !== openShift.estimateId && !j.completed)?.id ?? "");
                      setSwitching(true);
                    }}
                    className="rounded-lg border border-white/60 py-2.5 text-sm font-medium disabled:opacity-60"
                  >
                    Switch job
                  </button>
                  <button type="button" disabled={busy} onClick={() => setClockOutOpen(true)} className="rounded-lg bg-white py-2.5 text-sm font-semibold text-success disabled:opacity-60">
                    Clock out
                  </button>
                </div>
              )}
            </div>
          ) : onBreak ? (
            <div className="space-y-3 rounded-xl border-2 border-warning/60 bg-warning/10 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-warning">On break · unpaid</div>
                <div className="text-xs text-muted-foreground">since {clockTime(onBreak.since)}</div>
              </div>
              <div className="text-3xl font-semibold tabular-nums text-foreground">{elapsed(onBreak.since, now)}</div>
              <div className="truncate text-sm text-muted-foreground">{jobLabel(onBreak.estimateId ? jobById.get(onBreak.estimateId) : null)}</div>
              <button type="button" disabled={busy} onClick={backFromBreak} className="w-full rounded-lg bg-success py-2.5 text-[15px] font-medium text-white disabled:opacity-60">
                Back to work
              </button>
              <button type="button" onClick={endBreakWithoutReturning} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
                Done for the day
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border-2 border-success/50 bg-card p-4">
              <div className="text-xs text-muted-foreground">Off the clock</div>
              <select value={clockJob} onChange={(e) => setClockJob(e.target.value)} className={INPUT} aria-label="Job">
                {jobOptions}
              </select>
              {clockJob && jobById.get(clockJob)?.address && (
                <a href={directionsUrl(jobById.get(clockJob)!.address!)} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">
                  {jobById.get(clockJob)!.address} · Directions
                </a>
              )}
              <button
                type="button"
                disabled={busy || !employee || (!allowCompanyTime && !clockJob)}
                onClick={clockIn}
                className="w-full rounded-lg bg-success py-2.5 text-[15px] font-medium text-white disabled:opacity-60"
              >
                Clock in
              </button>
            </div>
          )}

          {overtimeHours > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              <span className="font-semibold text-warning">Over {OVERTIME_HOURS} h this week</span> · {weekHours.toFixed(1)} h logged,{" "}
              {overtimeHours.toFixed(1)} h over. This shows for the office to review.
            </div>
          )}
          {missingDays.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Nothing logged {missingDays.map((d) => DAY_NAME(d)).join(", ")}. If you worked, ask the office to add your hours.
            </div>
          )}

          {/* Week: seven chips, each with its hours. */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous week" onClick={() => setWeekStart((w) => shiftWeek(w, -1))} className="rounded-md border border-input px-2 py-0.5 text-sm">
                  ←
                </button>
                <span className="text-xs text-muted-foreground">{week[0].slice(5)} – {week[6].slice(5)}</span>
                <button type="button" aria-label="Next week" onClick={() => setWeekStart((w) => shiftWeek(w, 1))} className="rounded-md border border-input px-2 py-0.5 text-sm">
                  →
                </button>
              </div>
              <div className="text-sm font-medium text-foreground">{weekHours.toFixed(1)} h</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const hours = hoursByDay.get(day) ?? 0;
                const active = day === selectedDay;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`flex flex-col items-center rounded-lg border py-1.5 text-[11px] transition-colors ${
                      active ? "border-success bg-success text-white" : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    <span>{DAY_NAME(day)}</span>
                    <span className={`text-[13px] font-medium ${active ? "text-white" : "text-foreground"}`}>{day.slice(8)}</span>
                    <span className="text-[11px]">{hours ? hours.toFixed(1) : "–"}</span>
                  </button>
                );
              })}
            </div>
            {!isCurrentWeek && (
              <button type="button" onClick={() => setWeekStart(mondayOf())} className="mt-1.5 text-xs font-medium text-primary hover:underline">
                Back to this week
              </button>
            )}
          </div>

          {/* Jobs with hours this week. */}
          {activeRows.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Active jobs</div>
              <div className="flex flex-col gap-2">
                {activeRows.map((row) => (
                  <div
                    key={row.job.id}
                    className="flex items-center justify-between rounded-xl border border-border border-l-4 border-l-success bg-card px-3 py-2.5 shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{jobLabel(row.job)}</div>
                      {row.job.address && (
                        <a href={directionsUrl(row.job.address)} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">
                          {row.job.address} · Directions
                        </a>
                      )}
                      {row.job.jobDetails && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer select-none">Job details</summary>
                          <p className="mt-1 whitespace-pre-line text-foreground">{row.job.jobDetails}</p>
                        </details>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {payByJob.has(row.job.id)
                          ? `Job pay ${money(payByJob.get(row.job.id)?.amount ?? 0)} · ${payByJob.get(row.job.id)?.mode === "add" ? "plus hourly" : "replaces hourly"} · ${payByJob.get(row.job.id)?.completed ? "earned" : "counts when complete"}`
                          : `${row.hours.toFixed(2)} h this week`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-foreground">{money(row.amount)}</div>
                      {row.onClock && <div className="text-[11px] font-medium text-success">On the clock</div>}
                      {!isSelf && (
                        <Link href={`/estimates/${row.job.id}`} className="text-[11px] font-medium text-primary hover:underline">
                          Open estimate
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reviewIssues.length > 0 && (
            <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <div className="mb-1 font-medium text-foreground">Needs review · {reviewIssues.length}</div>
              <ul className="flex flex-col gap-0.5 text-muted-foreground">
                {reviewIssues.slice(0, 8).map((issue, i) => (
                  <li key={i}>{issue.text}</li>
                ))}
              </ul>
              {reviewIssues.length > 8 && <div className="mt-1 text-muted-foreground">and {reviewIssues.length - 8} more</div>}
            </div>
          )}

          {/* The selected day's entries. */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>{DAY_NAME(selectedDay)} {selectedDay.slice(5)}</span>
              <span>{dayHours.toFixed(2)} h</span>
            </div>
            {isOffice && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className={INPUT} aria-label="Filter by employee">
                  <option value="">All employees</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <select value={filterJob} onChange={(e) => setFilterJob(e.target.value)} className={INPUT} aria-label="Filter by job">
                  <option value="">All jobs</option>
                  {filterJobOptions.map((j) => (
                    <option key={j.id} value={j.id}>{jobLabel(j)}</option>
                  ))}
                </select>
              </div>
            )}
            {dayEntries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-4 text-center text-sm text-muted-foreground">Nothing recorded for this day.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dayEntries.map((entry) => {
                  const selectable = canApproveEntry(entry) && entry.status === "submitted" && !isOpenShift(entry);
                  const approved = entry.status === "approved";
                  return (
                    <li
                      key={entry.id}
                      className={`flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 ${approved ? "opacity-70" : "shadow-sm"}`}
                    >
                      {selectable && (
                        <input type="checkbox" checked={selected.includes(entry.id)} onChange={() => toggle(entry.id)} aria-label="Select for approval" />
                      )}
                      <button type="button" onClick={() => openDetail(entry)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-sm font-medium text-foreground">
                          {jobLabel(entry.estimateId ? jobById.get(entry.estimateId) : null)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {!isSelf && `${nameById.get(entry.employeeId) ?? "Employee"} · `}
                          {entry.startedAt && entry.endedAt
                            ? `${clockTime(entry.startedAt)} – ${clockTime(entry.endedAt)}`
                            : isOpenShift(entry)
                              ? `In since ${clockTime(entry.startedAt)}`
                              : "Entered by hand"}
                          {entry.notes ? ` · ${entry.notes}` : ""}
                        </div>
                      </button>
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">{entry.hours !== null ? `${entry.hours.toFixed(2)} h` : "open"}</div>
                        {!isSelf && entry.estimateId && (
                          <Link href={`/estimates/${entry.estimateId}`} className="block text-[11px] font-medium text-primary hover:underline">
                            Open estimate
                          </Link>
                        )}
                        {(() => {
                          // Pending → Approved → Paid (once Payroll pays that pay period).
                          const paidBy = isSelf ? paymentFor(entry) : null;
                          return (
                            <span
                              className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                paidBy ? "bg-primary/15 text-primary" : approved ? "bg-success/15 text-success" : "bg-warning/20 text-warning"
                              }`}
                            >
                              {paidBy ? "Paid" : approved ? "Approved" : isOpenShift(entry) ? "Open" : "Pending"}
                            </span>
                          );
                        })()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {canApprove && approvableSelected.length > 0 && (
              <div className="sticky bottom-20 mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 shadow-md">
                <span className="text-sm text-foreground">{approvableSelected.length} selected</span>
                <button type="button" disabled={busy} onClick={approveSelected} className={BUTTON}>
                  Approve
                </button>
              </div>
            )}
          </div>

          {isSelf ? (
            /* The pay period Payroll uses: hours, approved pay, what's pending, and whether it's paid. */
            <div className="rounded-xl border border-border-strong p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Pay period {shortDate(payPeriod.start)} – {shortDate(payPeriod.end)}
                </div>
                <Link href="/my-pay" className="text-xs font-medium text-primary hover:underline">My pay →</Link>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Hours</div>
                  <div className="text-lg font-medium tabular-nums text-foreground">{periodSummary.hours.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Approved</div>
                  <div className="text-lg font-medium tabular-nums text-success">{money(periodSummary.approved)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                  <div className="text-lg font-medium tabular-nums text-warning">{periodSummary.pendingHrs.toFixed(1)} h</div>
                  {periodSummary.pendingPay > 0 && <div className="text-[11px] text-muted-foreground">about {money(periodSummary.pendingPay)}</div>}
                </div>
              </div>
              <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                {periodSummary.paid && (
                  <div className="text-primary">
                    Paid {money(periodSummary.paidTotal)} so far · last {shortDate(periodSummary.paid.paidOn)} · {periodSummary.paid.method}
                    {periodSummary.paid.reference ? ` #${periodSummary.paid.reference}` : ""}
                  </div>
                )}
                {(!periodSummary.paid || periodSummary.pendingHrs > 0) && (
                  <div>Payday {shortDate(payPeriod.end)}. Pending hours are paid once the office approves them.</div>
                )}
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border-strong p-3">
            <div>
              <div className="text-xs text-muted-foreground">Approved this week</div>
              <div className="text-lg font-medium text-success">{money(approvedAmount)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pending</div>
              <div className="text-lg font-medium text-warning">{pendingHours.toFixed(2)} h</div>
            </div>
          </div>
          )}

          {completedRows.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Completed</div>
              <div className="flex flex-col gap-2">
                {completedRows.map((row) => (
                  <div key={row.job.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2.5 opacity-70">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-foreground">
                        <span aria-hidden="true" className="mr-1 text-success">✓</span>
                        {jobLabel(row.job)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {payByJob.has(row.job.id) ? `Job pay ${money(payByJob.get(row.job.id)?.amount ?? 0)}` : `${row.hours.toFixed(2)} h`}
                      </div>
                    </div>
                    <div className="text-sm text-foreground">{money(row.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {otherRows.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Assigned, no hours this week: {otherRows.map((r) => jobLabel(r.job)).join(" · ")}
            </div>
          )}
        </div>
        </>
      )}

      {/* Entry detail: view, edit, delete. */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail ? jobLabel(detail.estimateId ? jobById.get(detail.estimateId) : null) : ""}>
        {detail && !detailEditing && (
          <div className="space-y-4">
            {deleting && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <input className={INPUT} placeholder="Reason for deleting this entry" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setDeleting(false)} className={GHOST}>Cancel</button>
                  <button type="button" disabled={busy} onClick={() => removeEntry(detail)} className={BUTTON}>Confirm delete</button>
                </div>
              </div>
            )}
            <div className="space-y-1 text-sm">
              <div className="text-foreground">{detail.workDate}</div>
              {!isSelf && <div className="text-muted-foreground">{nameById.get(detail.employeeId) ?? "Employee"}</div>}
              <div className="text-muted-foreground">
                {detail.startedAt && detail.endedAt ? `${clockTime(detail.startedAt)} – ${clockTime(detail.endedAt)}` : "Entered by hand"}
                {" · "}
                {detail.hours !== null ? `${detail.hours.toFixed(2)} h` : "open"}
              </div>
              {detail.notes && <div className="text-muted-foreground">{detail.notes}</div>}
              <div className={detail.status === "approved" ? "text-success" : "text-warning"}>
                {detail.status === "approved"
                  ? `Approved${detail.approvedAt ? ` ${shortDate(detail.approvedAt.slice(0, 10))}` : ""}`
                  : "Pending approval"}
              </div>
              {isSelf && (() => {
                const paidBy = paymentFor(detail);
                return paidBy ? (
                  <div className="text-primary">
                    Paid {shortDate(paidBy.paidOn)} · {paidBy.method}
                    {paidBy.reference ? ` #${paidBy.reference}` : ""}
                  </div>
                ) : null;
              })()}
              {isSelf && detail.status === "approved" && (
                <div className="text-xs text-muted-foreground">Approved entries are locked. Ask the office if something needs fixing.</div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {!isSelf && detail.estimateId && (
                <Link href={`/estimates/${detail.estimateId}`} className={GHOST}>
                  Open estimate
                </Link>
              )}
              {isLocked(detail) && (
                <div className="w-full text-xs text-muted-foreground">
                  This day is in a pay period that has been paid, so its hours are locked. Add a correction in Payroll instead.
                </div>
              )}
              {isOffice && detail.status === "submitted" && !deleting && !isLocked(detail) && (
                <button type="button" onClick={() => { setDeleting(true); setDeleteReason(""); }} className={GHOST}>
                  Delete
                </button>
              )}
              {canEditEntry(detail) && !isOpenShift(detail) && !isLocked(detail) && (
                <button type="button" onClick={() => startEdit(detail)} className={GHOST}>
                  {detail.status === "approved" ? "Edit (needs approval again)" : "Edit"}
                </button>
              )}
            </div>
          </div>
        )}

        {detail && detailEditing && (
          <div className="space-y-3">
            <div>
              <label className={LABEL}>Date</label>
              <input type="date" value={draft.workDate} onChange={(e) => setDraft({ ...draft, workDate: e.target.value })} className={INPUT} />
            </div>
            {detail.startedAt && detail.endedAt ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={LABEL}>Clock in</label>
                  <input type="datetime-local" value={draft.startedAt} onChange={(e) => setDraft({ ...draft, startedAt: e.target.value })} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Clock out</label>
                  <input type="datetime-local" value={draft.endedAt} onChange={(e) => setDraft({ ...draft, endedAt: e.target.value })} className={INPUT} />
                </div>
              </div>
            ) : (
              <div>
                <label className={LABEL}>Hours</label>
                <input inputMode="decimal" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} className={INPUT} />
              </div>
            )}
            <div>
              <label className={LABEL}>Job</label>
              <select value={draft.estimateId} onChange={(e) => setDraft({ ...draft, estimateId: e.target.value })} className={INPUT}>
                {jobOptions}
              </select>
            </div>
            <div>
              <label className={LABEL}>Notes</label>
              <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={INPUT} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDetailEditing(false)} className={GHOST}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => saveEdit(detail)} className={BUTTON}>
                Save
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add hours for the selected day. */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add hours">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Date</label>
              <input type="date" value={addDraft.workDate} onChange={(e) => setAddDraft({ ...addDraft, workDate: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Hours</label>
              <input inputMode="decimal" placeholder="8" value={addDraft.hours} onChange={(e) => setAddDraft({ ...addDraft, hours: e.target.value })} className={INPUT} />
            </div>
          </div>
          <div>
            <label className={LABEL}>Job</label>
            <select value={addDraft.estimateId} onChange={(e) => setAddDraft({ ...addDraft, estimateId: e.target.value })} className={INPUT}>
              {jobOptions}
            </select>
          </div>
          {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className={GHOST}>
              Cancel
            </button>
            <button type="button" disabled={busy || !employee} onClick={saveAdd} className={BUTTON}>
              Add hours
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}

export default function TimesheetsPage() {
  return (
    <RequirePermission resource="time_entry" action="view">
      <TimesheetsContent />
    </RequirePermission>
  );
}
