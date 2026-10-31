"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { createSupabasePayeePaymentService } from "@/lib/services/supabase/payeePaymentService";
import { loadContractRows } from "@/lib/services/subcontractorPayroll";
import type { Expense } from "@/lib/services/expenseService";
import type { PaymentAllocation, PayeeRow } from "@/lib/services/payeeOwed";
import { shortDate } from "@/lib/payPeriods";
import type { CompanySettings } from "@/lib/company";
import type { Employee } from "@/lib/services/employeeService";

const INPUT =
  "h-8 rounded-lg border border-input bg-background px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type View = "all" | "person" | "period";

/** One paid amount, from any source: employees, team members, subcontractors, agents. */
interface HistoryRow {
  id: string;
  kind: "employee" | "team" | "subcontractor" | "agent";
  /** The payee's key on the payroll page. */
  personKey: string | null;
  /** Identifies the payee across the page: the person's key, sub:<subcontractor id> or agent:<agent id>. */
  ownerKey: string;
  paymentKind: "pay" | "reimbursement";
  payee: string;
  paidOn: string;
  amount: number;
  method: string;
  reference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  reversed: boolean;
  reversalReason: string | null;
  jobLabel: string;
  parts: PaymentAllocation[] | null;
  /** Which payment this stored row belongs to; rows of one payee with the same value are one check. */
  group: string;
  /** When it was recorded; orders payments made on the same day. */
  savedAt: string;
}

function periodLabel(start: string | null, end: string | null): string {
  return start && end ? `${shortDate(start)} – ${shortDate(end)}` : "No period";
}

function HistoryContent() {
  const services = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId;

  const payService = useMemo(
    () =>
      companyId
        ? createSupabasePayeePaymentService(
            supabase,
            {
              employeeService: services.employeeService,
              timeEntryService: services.timeEntryService,
              estimateService: services.estimateService,
              projectService: services.projectService,
              expenseService: services.expenseService,
            },
            companyId
          )
        : null,
    [companyId, services.employeeService, services.timeEntryService, services.estimateService, services.projectService, services.expenseService]
  );

  const [people, setPeople] = useState<PayeeRow[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [subs, setSubs] = useState<Awaited<ReturnType<typeof loadContractRows>>>([]);
  /** Team pay recorded only as a labor expense (not through Payroll), so it is still listed. */
  const [teamExpenses, setTeamExpenses] = useState<Expense[]>([]);
  const [jobLabels, setJobLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>("all");
  const [person, setPerson] = useState("all");
  const [period, setPeriod] = useState("all");
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");
  const [method, setMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"paidOn" | "payee" | "amount">("paidOn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!payService || !companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await payService.load();
        const estimates = await services.estimateService.list({ companyId });
        const labels = new Map(estimates.map((e) => [e.id, [e.estimateNumber, e.title].filter(Boolean).join(" · ") || "Job"]));
        const contractRows = await loadContractRows(services, companyId, (id) => (id ? labels.get(id) ?? "Job" : "Project"));
        const expenses = await services.expenseService.listForCompany(companyId);
        if (!cancelled) {
          setPeople(rows);
          setSubs(contractRows);
          setJobLabels(labels);
          setTeamExpenses(
            expenses.filter((x) => x.expenseType === "labor" && x.payeeType === "employee" && x.payeeId && x.isPaid && !x.deletedAt)
          );
        }
        // The pay statement uses these, but the history still works without them.
        try {
          const [settings, staff] = await Promise.all([services.companyService.getByCompanyId(companyId, null), services.employeeService.list({ companyId })]);
          if (!cancelled) {
            setCompany(settings);
            setEmployees(staff);
          }
        } catch {
          // Printed statements fall back to the minimum details.
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load payment history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Loaded once per company; the services are stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payService, companyId]);

  // Every paid amount, newest first. Corrections are not payments, so they are left out.
  const allRows = useMemo<HistoryRow[]>(() => {
    const out = new Map<string, HistoryRow>();
    for (const r of people) {
      for (const p of r.payments) {
        if (p.paymentKind === "adjustment" || out.has(p.id)) continue;
        const job = p.estimateId ? (r.lines.find((l) => l.estimateId === p.estimateId)?.label ?? "Job") : "Not tied to a job";
        out.set(p.id, {
          id: p.id,
          kind: r.kind,
          personKey: r.key,
          ownerKey: r.key,
          paymentKind: p.paymentKind === "reimbursement" ? "reimbursement" : "pay",
          payee: r.name,
          paidOn: p.paidOn,
          amount: p.amount,
          method: p.method,
          reference: p.reference,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          reversed: !!p.reversedAt,
          reversalReason: p.reversalReason,
          jobLabel: job,
          parts: p.allocations && p.allocations.length > 0 ? p.allocations : null,
          // A payment with parts is already one row per check; older per-job rows match on date, method and reference.
          group: p.allocations && p.allocations.length > 0 ? p.id : `${p.paidOn}|${p.method}|${p.reference ?? ""}`,
          savedAt: p.createdAt ?? "",
        });
      }
    }
    for (const s of subs) {
      for (const p of s.payments) {
        out.set(p.id, {
          id: p.id,
          kind: s.payeeType,
          personKey: s.key,
          ownerKey: s.key,
          paymentKind: p.kind === "reimbursement" ? "reimbursement" : "pay",
          payee: s.name,
          paidOn: p.paymentDate.slice(0, 10),
          amount: p.amount,
          method: p.paymentMethod ?? "—",
          reference: null,
          periodStart: null,
          periodEnd: null,
          reversed: false,
          reversalReason: null,
          jobLabel: p.label,
          parts: null,
          group: p.checkKey,
          savedAt: p.savedAt,
        });
      }
    }
    // Team pay recorded only as a labor expense (an older page, or a manual
    // expense) has no Payroll payment, so it is listed from the expense
    // itself — every dollar paid to a person shows here exactly once.
    const viaPayroll = new Set<string>();
    for (const r of people) {
      for (const p of r.payments) {
        if (p.expenseId) viaPayroll.add(p.expenseId);
        for (const a of p.allocations ?? []) a.expenseIds.forEach((id) => viaPayroll.add(id));
      }
    }
    for (const x of teamExpenses) {
      if (viaPayroll.has(x.id)) continue;
      const key = `team:${x.payeeId}`;
      const owner = people.find((r) => r.key === key);
      out.set(`exp:${x.id}`, {
        id: `exp:${x.id}`,
        kind: "team",
        personKey: key,
        ownerKey: key,
        paymentKind: "pay",
        payee: owner?.name ?? x.vendor ?? "Team member",
        paidOn: x.expenseDate,
        amount: x.amount,
        method: x.paymentMethod ?? "—",
        reference: null,
        periodStart: null,
        periodEnd: null,
        reversed: false,
        reversalReason: null,
        jobLabel: x.estimateId ? jobLabels.get(x.estimateId) ?? "Job" : "Not tied to a job",
        parts: null,
        group: `exp:${x.id}`,
        savedAt: x.createdAt,
      });
    }
    // One row per payment made, not per payee or per day: the parts of one payment are put back together.
    const checks = new Map<string, HistoryRow[]>();
    for (const r of out.values()) {
      const key = `${r.ownerKey}|${r.group}`;
      checks.set(key, [...(checks.get(key) ?? []), r]);
    }
    return [...checks.entries()]
      .map(([key, members]): HistoryRow => {
        if (members.length === 1) return members[0];
        const live = members.filter((m) => !m.reversed);
        const counted = live.length > 0 ? live : members;
        const parts = members.flatMap((m) =>
          m.parts ?? [{ kind: m.paymentKind === "reimbursement" ? ("reimbursement" as const) : ("job" as const), estimateId: null, amount: m.amount, label: m.jobLabel, expenseIds: [] }]
        );
        return {
          ...members[0],
          id: key,
          savedAt: members.reduce((latest, m) => (m.savedAt > latest ? m.savedAt : latest), ""),
          amount: Math.round(counted.reduce((s, m) => s + m.amount, 0) * 100) / 100,
          parts,
          reversed: live.length === 0,
          reversalReason: members.find((m) => m.reversalReason)?.reversalReason ?? null,
          paymentKind: members.every((m) => m.paymentKind === "reimbursement") ? "reimbursement" : "pay",
        };
      })
      // Newest first: by pay date, then by when it was recorded.
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
  }, [people, subs, teamExpenses, jobLabels]);

  const people_ = useMemo(() => [...new Set(allRows.map((r) => r.payee))].sort(), [allRows]);
  const methods = useMemo(() => [...new Set(allRows.map((r) => r.method))].sort(), [allRows]);
  const periods = useMemo(() => {
    const keys = new Map<string, string>();
    for (const r of allRows) keys.set(`${r.periodStart ?? ""}|${r.periodEnd ?? ""}`, periodLabel(r.periodStart, r.periodEnd));
    return [...keys.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [allRows]);

  const years = useMemo(() => [...new Set(allRows.map((r) => r.paidOn.slice(0, 4)))].sort().reverse(), [allRows]);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const filtered = useMemo(
    () =>
      allRows.filter((r) => {
        if (year !== "all" && r.paidOn.slice(0, 4) !== year) return false;
        if (month !== "all" && r.paidOn.slice(5, 7) !== month) return false;
        if (person !== "all" && r.payee !== person) return false;
        if (method !== "all" && r.method !== method) return false;
        if (period !== "all" && `${r.periodStart ?? ""}|${r.periodEnd ?? ""}` !== period) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          if (!(r.reference ?? "").toLowerCase().includes(q) && !r.payee.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [allRows, year, month, person, method, period, search]
  );

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    // By date, payments made on the same day follow the time they were recorded.
    const valueOf = (r: HistoryRow): string | number => (sortKey === "amount" ? r.amount : sortKey === "payee" ? r.payee : `${r.paidOn}|${r.savedAt}`);
    return [...filtered].sort((a, b) => {
      const x = valueOf(a);
      const y = valueOf(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return dir * c || a.id.localeCompare(b.id);
    });
  }, [filtered, sortKey, sortDir]);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  // Back to the first page whenever a filter or the sort changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [year, month, person, method, period, search, sortKey, sortDir]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);

  const live = filtered.filter((r) => !r.reversed);
  const totalPaid = Math.round(live.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const payeeCount = new Set(live.map((r) => r.payee)).size;
  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of live) map.set(r.method, Math.round(((map.get(r.method) ?? 0) + r.amount) * 100) / 100);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [live]);

  // The check shown in the printable record, if one was asked for.
  const [printId, setPrintId] = useState<string | null>(null);
  // The payee whose yearly statement is being printed (their ownerKey), for the year on screen.
  const [yearPrintOwner, setYearPrintOwner] = useState<string | null>(null);
  const yearRows = useMemo(
    () =>
      yearPrintOwner && year !== "all"
        ? allRows
            .filter((r) => r.ownerKey === yearPrintOwner && r.paidOn.slice(0, 4) === year && !r.reversed)
            .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.id.localeCompare(b.id))
        : [],
    [allRows, yearPrintOwner, year]
  );
  useEffect(() => {
    if (!yearPrintOwner) return;
    const timer = setTimeout(() => {
      window.print();
      setYearPrintOwner(null);
    }, 50);
    return () => clearTimeout(timer);
  }, [yearPrintOwner]);
  const ownerOfPerson = person === "all" ? undefined : allRows.find((r) => r.payee === person)?.ownerKey;
  const printRow = printId ? allRows.find((r) => r.id === printId) ?? null : null;
  useEffect(() => {
    if (!printId) return;
    const timer = setTimeout(() => {
      window.print();
      setPrintId(null);
    }, 50);
    return () => clearTimeout(timer);
  }, [printId]);

  const byPerson = useMemo(() => {
    const map = new Map<string, { payee: string; kind: string; count: number; total: number; last: string }>();
    for (const r of live) {
      const cur = map.get(r.payee) ?? { payee: r.payee, kind: r.kind, count: 0, total: 0, last: "" };
      cur.count += 1;
      cur.total = Math.round((cur.total + r.amount) * 100) / 100;
      if (r.paidOn > cur.last) cur.last = r.paidOn;
      map.set(r.payee, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [live]);

  const byPeriod = useMemo(() => {
    const map = new Map<string, { label: string; count: number; total: number; people: Set<string> }>();
    for (const r of live) {
      const key = `${r.periodStart ?? ""}|${r.periodEnd ?? ""}`;
      const cur = map.get(key) ?? { label: periodLabel(r.periodStart, r.periodEnd), count: 0, total: 0, people: new Set<string>() };
      cur.count += 1;
      cur.total = Math.round((cur.total + r.amount) * 100) / 100;
      cur.people.add(r.payee);
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, v]) => v);
  }, [live]);

  const applyPreset = (key: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    if (key === "all") {
      setYear("all");
      setMonth("all");
    } else if (key === "this_month") {
      setYear(String(now.getFullYear()));
      setMonth(pad(now.getMonth() + 1));
    } else if (key === "last_month") {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setYear(String(d.getFullYear()));
      setMonth(pad(d.getMonth() + 1));
    } else {
      setYear(String(now.getFullYear()));
      setMonth("all");
    }
  };

  /** Downloads the rows on screen, in the order shown. */
  const exportCsv = () => {
    const header = ["Paid on", "Paid to", "Type", "Covers", "Method", "Reference", "Period start", "Period end", "Amount", "Status"];
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = sorted.map((r) =>
      [
        r.paidOn,
        r.payee,
        kindLabel(r.kind),
        r.parts ? r.parts.map((p) => `${p.label} ${money(p.amount)}`).join("; ") : r.jobLabel,
        r.method,
        r.reference,
        r.periodStart,
        r.periodEnd,
        r.amount.toFixed(2),
        r.reversed ? "Reversed" : "Paid",
      ]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const link = document.createElement("a");
    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    link.download = `payment-history-${new Date().toLocaleDateString("en-CA")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const sortHeader = (key: "paidOn" | "payee" | "amount", label: string, align: "left" | "right" = "left") => (
    <th className={`py-2 pr-3 font-normal ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => {
          if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else {
            setSortKey(key);
            setSortDir("desc");
          }
        }}
        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
      >
        {label}
        <span aria-hidden="true">{sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  const kindLabel = (k: HistoryRow["kind"]) => (k === "employee" ? "Employee" : k === "team" ? "Team" : k === "agent" ? "Agent" : "Subcontractor");

  return (
    <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-medium text-foreground">Payment history</div>
            <div className="text-xs text-muted-foreground">Everything paid to employees, team members, subcontractors and agents</div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground disabled:opacity-40">
              Export CSV
            </button>
            <Link href="/payroll" className="text-xs text-primary hover:underline">Back to payroll</Link>
          </div>
        </div>

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Paid</div>
            <div className="text-xl font-medium tabular-nums text-foreground">{money(totalPaid)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {byMethod.map(([m, amount]) => `${m} ${money(amount)}`).join(" · ") || "No payments"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Payments</div>
            <div className="text-xl font-medium tabular-nums text-foreground">{live.length}</div>
            <div className="text-xs text-muted-foreground">{filtered.length - live.length} reversed</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Paid to</div>
            <div className="text-xl font-medium tabular-nums text-foreground">{payeeCount}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 text-xs">
          {[
            ["all", "All time"],
            ["this_month", "This month"],
            ["last_month", "Last month"],
            ["this_year", "This year"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => applyPreset(key)} className="rounded-full border border-border px-3 py-1 text-muted-foreground hover:bg-muted">
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Year" className={INPUT} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select aria-label="Month" className={INPUT} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All months</option>
            {monthNames.map((name, i) => (
              <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>
            ))}
          </select>
          <select aria-label="Person" className={INPUT} value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="all">All people</option>
            {people_.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select aria-label="Period" className={INPUT} value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="all">All periods</option>
            {periods.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select aria-label="Method" className={INPUT} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="all">All methods</option>
            {methods.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!ownerOfPerson || year === "all"}
            onClick={() => setYearPrintOwner(ownerOfPerson ?? null)}
            title={!ownerOfPerson ? "Choose a person" : year === "all" ? "Choose a year" : undefined}
            className="h-8 rounded-lg border border-border px-3 text-[13px] text-foreground disabled:opacity-40"
          >
            Yearly statement
          </button>
          <input
            type="search"
            aria-label="Search check or reference"
            placeholder="Check or reference"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT} w-44`}
          />
          <div className="ml-auto flex gap-1 text-xs">
            {(["all", "person", "period"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 ${view === v ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}
              >
                {v === "all" ? "All payments" : v === "person" ? "By person" : "By period"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No payments match these filters.</div>
        ) : view === "all" ? (
          <div className="flex flex-col gap-2">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:font-semibold">
                <tr>
                  <th className="w-8 py-2 pl-3 font-normal"><span className="sr-only">Details</span></th>
                  {sortHeader("paidOn", "Paid on")}
                  {sortHeader("payee", "Paid to")}
                  <th className="py-2 pr-3 font-normal">Covers</th>
                  <th className="py-2 pr-3 font-normal">Method</th>
                  <th className="py-2 pr-3 font-normal">Reference</th>
                  {sortHeader("amount", "Amount", "right")}
                  <th className="py-2 pr-3 font-normal">Status</th>
                  <th className="py-2 pr-3 font-normal"><span className="sr-only">Print</span></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, idx) => {
                  const open = openId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={`${idx % 2 === 1 ? "bg-muted/40" : ""} ${r.reversed ? "text-muted-foreground" : ""}`}>
                        <td className="py-2 pl-3">
                          <button type="button" aria-expanded={open} aria-label={open ? "Hide details" : "Show details"} onClick={() => setOpenId(open ? null : r.id)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                          </button>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.paidOn}</td>
                        <td className="py-2 pr-3">
                          {r.personKey ? (
                          <Link href={`/payroll?person=${encodeURIComponent(r.personKey)}`} className="text-foreground hover:text-primary hover:underline">
                            {r.payee}
                          </Link>
                        ) : (
                          r.payee
                        )}{" "}
                        <span className="text-xs text-muted-foreground">{kindLabel(r.kind)}</span>
                        </td>
                        <td className="py-2 pr-3">{r.parts ? `Full payment · ${r.parts.length} ${r.parts.length === 1 ? "part" : "parts"}` : r.jobLabel}</td>
                        <td className="py-2 pr-3">{r.method}</td>
                        <td className="py-2 pr-3">{r.reference ?? "—"}</td>
                        <td className={`py-2 pr-3 text-right tabular-nums ${r.reversed ? "line-through" : ""}`}>{money(r.amount)}</td>
                        <td className="py-2 pr-3 text-xs">{r.reversed ? <span title={r.reversalReason ?? ""}>Reversed</span> : <span className="text-foreground">Paid</span>}</td>
                        <td className="py-2 pr-3 text-right">
                          {r.kind === "employee" && !r.id.includes("|") ? (
                            // Employees get a full pay stub (hours, rate, year to date).
                            <Link href={`/my-pay/${r.id}`} className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-muted">
                              Pay stub
                            </Link>
                          ) : (
                            <button type="button" onClick={() => setPrintId(r.id)} className="h-7 whitespace-nowrap rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-muted">
                              Print
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-muted/60">
                          <td />
                          <td colSpan={8} className="py-3 pr-3">
                            {r.parts ? (
                              <div className="flex flex-col gap-1.5 text-xs">
                                {r.parts.map((part, i) => (
                                  <div key={`${part.kind}-${i}`} className="flex justify-between gap-3 text-foreground">
                                    <span>{part.label}</span>
                                    <span className="tabular-nums">{money(part.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-foreground">{r.jobLabel}</div>
                            )}
                            <div className="mt-2 text-xs text-muted-foreground">
                              {periodLabel(r.periodStart, r.periodEnd)} · {r.method}
                              {r.reference ? ` · ${r.reference}` : ""}
                            </div>
                            {r.reversed && <div className="mt-2 text-xs text-muted-foreground">Reversed{r.reversalReason ? `: ${r.reversalReason}` : ""}</div>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Showing {sorted.length === 0 ? 0 : pageIndex * PAGE_SIZE + 1}–{Math.min((pageIndex + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} · total {money(totalPaid)}
            </span>
            <span className="flex items-center gap-2">
              <button type="button" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)} className="rounded-lg border border-border px-3 py-1 text-foreground disabled:opacity-40">
                Previous
              </button>
              <span>Page {pageIndex + 1} of {pageCount}</span>
              <button type="button" disabled={pageIndex >= pageCount - 1} onClick={() => setPage(pageIndex + 1)} className="rounded-lg border border-border px-3 py-1 text-foreground disabled:opacity-40">
                Next
              </button>
            </span>
          </div>
          </div>
        ) : view === "person" ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:font-semibold">
                <tr>
                  <th className="py-2 px-3 font-normal">Paid to</th>
                  <th className="py-2 pr-3 font-normal">Type</th>
                  <th className="py-2 pr-3 text-right font-normal">Payments</th>
                  <th className="py-2 pr-3 text-right font-normal">Total paid</th>
                  <th className="py-2 pr-3 font-normal">Last paid</th>
                </tr>
              </thead>
              <tbody>
                {byPerson.map((p, idx) => (
                  <tr key={p.payee} className={idx % 2 === 1 ? "bg-muted/40" : ""}>
                    <td className="py-2 px-3">{p.payee}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.kind === "employee" ? "Employee" : p.kind === "team" ? "Team" : "Subcontractor"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(p.total)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{p.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:font-semibold">
                <tr>
                  <th className="py-2 px-3 font-normal">Pay period</th>
                  <th className="py-2 pr-3 text-right font-normal">People</th>
                  <th className="py-2 pr-3 text-right font-normal">Payments</th>
                  <th className="py-2 pr-3 text-right font-normal">Total paid</th>
                </tr>
              </thead>
              <tbody>
                {byPeriod.map((p, idx) => (
                  <tr key={p.label} className={idx % 2 === 1 ? "bg-muted/40" : ""}>
                    <td className="py-2 px-3">{p.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.people.size}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {printRow && (() => {
        const employee = printRow.personKey?.startsWith("employee:")
          ? employees.find((e) => e.id === printRow.personKey?.replace("employee:", "")) ?? null
          : null;
        const earnings = printRow.parts ? printRow.parts.filter((p) => p.kind !== "reimbursement") : [{ kind: "job" as const, estimateId: null, amount: printRow.amount, label: printRow.jobLabel, expenseIds: [] }];
        const reimbursements = printRow.parts ? printRow.parts.filter((p) => p.kind === "reimbursement") : [];
        const earningsTotal = Math.round(earnings.reduce((s, p) => s + p.amount, 0) * 100) / 100;
        const reimbursementTotal = Math.round(reimbursements.reduce((s, p) => s + p.amount, 0) * 100) / 100;
        const yearToDate =
          printRow.personKey === null
            ? null
            : Math.round(
                allRows
                  .filter((r) => r.personKey === printRow.personKey && !r.reversed && r.paidOn.slice(0, 4) === printRow.paidOn.slice(0, 4) && r.paidOn <= printRow.paidOn)
                  .reduce((s, r) => s + r.amount, 0) * 100
              ) / 100;
        const address = employee ? [employee.addressStreet, [employee.addressCity, employee.addressState].filter(Boolean).join(", "), employee.addressZip].filter(Boolean).join(" ") : "";
        return (
          <>
            <style>{`@media print { body * { visibility: hidden; } #check-print, #check-print * { visibility: visible; } #check-print { position: absolute; left: 0; top: 0; width: 100%; padding: 32px; color: #000; background: #fff; } }`}</style>
            <div id="check-print" className="hidden print:block">
              <div className="mx-auto max-w-[720px] text-[12px] leading-snug text-black">
                <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
                  <div>
                    <div className="text-[18px] font-semibold">{company?.company_name || "Company"}</div>
                    {company?.company_address && <div className="whitespace-pre-line">{company.company_address}</div>}
                    {(company?.company_phone || company?.company_email) && (
                      <div>{[company?.company_phone, company?.company_email].filter(Boolean).join(" · ")}</div>
                    )}
                    {company?.tax_id && <div>Tax ID: {company.tax_id}</div>}
                  </div>
                  <div className="text-right text-[16px] font-semibold uppercase tracking-wide">Pay statement</div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-8 border-b border-neutral-300 pb-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Paid to</div>
                    <div className="text-[13px] font-semibold">{printRow.payee}</div>
                    <div>{kindLabel(printRow.kind)}{employee?.jobTitle ? ` · ${employee.jobTitle}` : ""}</div>
                    {employee?.email && <div>{employee.email}</div>}
                    {employee?.phone && <div>{employee.phone}</div>}
                    {address && <div>{address}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Pay frequency</div>
                    <div>{printRow.kind === "team" ? "Per job" : employee?.payFrequency === "weekly" ? "Weekly" : employee ? "Every two weeks" : "—"}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-[1.2fr_1fr] gap-0 border border-black">
                  <div className="border-r border-black p-4">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Net pay</div>
                    <div className={`text-[26px] font-semibold tabular-nums ${printRow.reversed ? "line-through" : ""}`}>{money(printRow.amount)}</div>
                    {printRow.reversed && (
                      <div className="mt-1 text-[11px] font-semibold">REVERSED{printRow.reversalReason ? `: ${printRow.reversalReason}` : ""}</div>
                    )}
                    <div className="mt-3 text-[11px]">
                      Paid to <span className="font-semibold">{printRow.payee}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-[11px]">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">Pay date</div>
                      <div>{printRow.paidOn}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">Method</div>
                      <div>{printRow.method}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">Pay period</div>
                      <div>{periodLabel(printRow.periodStart, printRow.periodEnd)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">Reference</div>
                      <div>{printRow.reference ?? "—"}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">Year to date ({printRow.paidOn.slice(0, 4)})</div>
                      <div className="tabular-nums">{yearToDate !== null ? money(yearToDate) : "—"}</div>
                    </div>
                  </div>
                </div>

                <table className="mt-4 w-full">
                  <thead>
                    <tr className="border-b border-neutral-400 text-left text-[10px] uppercase tracking-wider text-neutral-500">
                      <th className="py-1.5 font-normal">Earnings</th>
                      <th className="py-1.5 text-right font-normal">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.map((p, i) => (
                      <tr key={`e-${i}`} className="border-b border-neutral-200">
                        <td className="py-1.5">{p.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(p.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1.5">Total earnings</td>
                      <td className="py-1.5 text-right tabular-nums">{money(earningsTotal)}</td>
                    </tr>
                  </tbody>
                </table>

                {reimbursements.length > 0 && (
                  <table className="mt-4 w-full">
                    <thead>
                      <tr className="border-b border-neutral-400 text-left text-[10px] uppercase tracking-wider text-neutral-500">
                        <th className="py-1.5 font-normal">Expense reimbursements</th>
                        <th className="py-1.5 text-right font-normal">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reimbursements.map((p, i) => (
                        <tr key={`r-${i}`} className="border-b border-neutral-200">
                          <td className="py-1.5">{p.label}</td>
                          <td className="py-1.5 text-right tabular-nums">{money(p.amount)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="py-1.5">Total reimbursements</td>
                        <td className="py-1.5 text-right tabular-nums">{money(reimbursementTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                <div className="mt-4 text-[11px] text-neutral-600">Deductions: none recorded</div>

                <div className="mt-8 text-[10px] text-neutral-500">
                  This statement records a payment made by {company?.company_name || "the company"}. It is not a tax form. Keep it with your payroll records.
                </div>
              </div>
            </div>
          </>
        );
      })()}
      {yearPrintOwner && year !== "all" && (() => {
        const isSub = yearPrintOwner.startsWith("sub:") || yearPrintOwner.startsWith("agent:");
        const employee = yearPrintOwner.startsWith("employee:") ? employees.find((e) => e.id === yearPrintOwner.replace("employee:", "")) ?? null : null;
        const sub = isSub ? subs.find((s) => s.key === yearPrintOwner) ?? null : null;
        const address = employee ? [employee.addressStreet, [employee.addressCity, employee.addressState].filter(Boolean).join(", "), employee.addressZip].filter(Boolean).join(" ") : "";
        const round = (n: number) => Math.round(n * 100) / 100;
        const split = (r: HistoryRow) => {
          if (r.parts) {
            return {
              earnings: round(r.parts.filter((p) => p.kind !== "reimbursement").reduce((s, p) => s + p.amount, 0)),
              reimbursements: round(r.parts.filter((p) => p.kind === "reimbursement").reduce((s, p) => s + p.amount, 0)),
            };
          }
          return r.paymentKind === "reimbursement" ? { earnings: 0, reimbursements: r.amount } : { earnings: r.amount, reimbursements: 0 };
        };
        const net = round(yearRows.reduce((s, r) => s + r.amount, 0));
        const earnings = round(yearRows.reduce((s, r) => s + split(r).earnings, 0));
        const reimbursements = round(yearRows.reduce((s, r) => s + split(r).reimbursements, 0));
        const months = Array.from({ length: 12 }, (_, i) => {
          const key = `${year}-${String(i + 1).padStart(2, "0")}`;
          const inMonth = yearRows.filter((r) => r.paidOn.slice(0, 7) === key);
          return {
            label: new Date(Number(year), i, 1).toLocaleDateString("en-US", { month: "long" }),
            count: inMonth.length,
            earnings: round(inMonth.reduce((s, r) => s + split(r).earnings, 0)),
            reimbursements: round(inMonth.reduce((s, r) => s + split(r).reimbursements, 0)),
            net: round(inMonth.reduce((s, r) => s + r.amount, 0)),
          };
        });
        return (
          <>
            <style>{`@media print { body * { visibility: hidden; } #check-print, #check-print * { visibility: visible; } #check-print { position: absolute; left: 0; top: 0; width: 100%; padding: 32px; color: #000; background: #fff; } }`}</style>
            <div id="check-print" className="hidden print:block">
              <div className="mx-auto max-w-[720px] text-[12px] leading-snug text-black">
                <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
                  <div>
                    <div className="text-[18px] font-semibold">{company?.company_name || "Company"}</div>
                    {company?.company_address && <div className="whitespace-pre-line">{company.company_address}</div>}
                    {(company?.company_phone || company?.company_email) && (
                      <div>{[company?.company_phone, company?.company_email].filter(Boolean).join(" · ")}</div>
                    )}
                    {company?.tax_id && <div>Tax ID: {company.tax_id}</div>}
                  </div>
                  <div className="text-right text-[16px] font-semibold uppercase tracking-wide">Yearly statement · {year}</div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-8 border-b border-neutral-300 pb-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Paid to</div>
                    <div className="text-[13px] font-semibold">{person}</div>
                    <div>{isSub ? (sub?.payeeType === "agent" ? "Agent" : "Subcontractor") : employee ? "Employee" : "Team member"}{employee?.jobTitle ? ` · ${employee.jobTitle}` : ""}{sub?.trade ? ` · ${sub.trade}` : ""}</div>
                    {employee?.email && <div>{employee.email}</div>}
                    {employee?.phone && <div>{employee.phone}</div>}
                    {address && <div>{address}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Period</div>
                    <div>January 1 – December 31, {year}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 border border-black text-center">
                  <div className="border-r border-black p-3">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Net paid</div>
                    <div className="text-[16px] font-semibold tabular-nums">{money(net)}</div>
                  </div>
                  <div className="border-r border-black p-3">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Earnings</div>
                    <div className="text-[16px] font-semibold tabular-nums">{money(earnings)}</div>
                  </div>
                  <div className="border-r border-black p-3">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Reimbursements</div>
                    <div className="text-[16px] font-semibold tabular-nums">{money(reimbursements)}</div>
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Payments</div>
                    <div className="text-[16px] font-semibold tabular-nums">{yearRows.length}</div>
                  </div>
                </div>

                <table className="mt-6 w-full">
                  <thead>
                    <tr className="border-b border-neutral-400 text-left text-[10px] uppercase tracking-wider text-neutral-500">
                      <th className="py-1.5 font-normal">Month</th>
                      <th className="py-1.5 text-right font-normal">Payments</th>
                      <th className="py-1.5 text-right font-normal">Earnings</th>
                      <th className="py-1.5 text-right font-normal">Reimbursements</th>
                      <th className="py-1.5 text-right font-normal">Net paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.label} className="border-b border-neutral-200">
                        <td className="py-1.5">{m.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{m.count}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(m.earnings)}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(m.reimbursements)}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(m.net)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1.5">Year total</td>
                      <td className="py-1.5 text-right tabular-nums">{yearRows.length}</td>
                      <td className="py-1.5 text-right tabular-nums">{money(earnings)}</td>
                      <td className="py-1.5 text-right tabular-nums">{money(reimbursements)}</td>
                      <td className="py-1.5 text-right tabular-nums">{money(net)}</td>
                    </tr>
                  </tbody>
                </table>

                <table className="mt-6 w-full">
                  <thead>
                    <tr className="border-b border-neutral-400 text-left text-[10px] uppercase tracking-wider text-neutral-500">
                      <th className="py-1.5 font-normal">Date</th>
                      <th className="py-1.5 font-normal">Period</th>
                      <th className="py-1.5 font-normal">Covers</th>
                      <th className="py-1.5 font-normal">Method</th>
                      <th className="py-1.5 font-normal">Reference</th>
                      <th className="py-1.5 text-right font-normal">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearRows.map((r) => (
                      <tr key={r.id} className="border-b border-neutral-200 align-top">
                        <td className="py-1.5 whitespace-nowrap">{r.paidOn}</td>
                        <td className="py-1.5 whitespace-nowrap">{periodLabel(r.periodStart, r.periodEnd)}</td>
                        <td className="py-1.5">{r.parts ? r.parts.map((p) => `${p.label} ${money(p.amount)}`).join("; ") : r.jobLabel}</td>
                        <td className="py-1.5">{r.method}</td>
                        <td className="py-1.5">{r.reference ?? "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-8 text-[10px] text-neutral-500">
                  This statement lists the payments made by {company?.company_name || "the company"} in {year}. Reversed payments are not included. It is not a tax form. Keep it with your payroll records.
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </PageContainer>
  );
}

export default function PaymentHistoryPage() {
  return (
    <RequirePermission resource="financial_reports" action="view">
      <HistoryContent />
    </RequirePermission>
  );
}
