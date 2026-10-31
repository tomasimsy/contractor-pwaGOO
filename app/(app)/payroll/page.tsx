"use client";

/**
 * Payroll: who is owed for the pay period, why, and paying them.
 *
 * One table lists employees, team members, subcontractors and agents. A row opens to
 * show the jobs behind the amount. Ticked rows are paid together: the review
 * step sets the date and method once and gives each person the next check
 * number, then records one payment per person. Past payments, reversals and
 * pay statements live on the payment history page.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { Modal } from "@/components/ui/Modal";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { createSupabasePayeePaymentService } from "@/lib/services/supabase/payeePaymentService";
import { contractPaymentExpense, loadContractRows, type SubRow } from "@/lib/services/subcontractorPayroll";
import { complianceWarning, subcontractorCompliance } from "@/lib/services/subcontractorDocumentService";
import type { PayeeRow, PaymentAllocation } from "@/lib/services/payeeOwed";
import type { UUID } from "@/lib/services/types";
import { periodContaining, shiftPeriodDays, shortDate, type PeriodLength } from "@/lib/payPeriods";

const INPUT =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
const METHODS = ["Check", "Direct deposit", "Cash", "Other"];

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

const cents = (n: number) => Math.round(n * 100) / 100;

type Kind = "employee" | "team" | "subcontractor" | "agent";
type Filter = "all" | Kind;

/** One line of the table: an employee, a team member, a subcontractor or an agent. */
interface Payee {
  key: string;
  name: string;
  kind: Kind;
  basis: string;
  owed: number;
  lines: Array<{ label: string; estimateId: string | null; projectId?: string | null; expenseIds?: string[]; earned: number; paid: number; owed: number }>;
  /** The latest payment in the period on screen, for the status column. */
  lastPaid: { date: string; reference: string | null; method: string } | null;
  person: PayeeRow | null;
  sub: SubRow | null;
}

/** Each payment's check number or reference: counts up from the first one when it is a number. */
function referenceFor(first: string, index: number): string | null {
  const value = first.trim();
  if (!value) return null;
  return /^\d+$/.test(value) ? String(Number(value) + index).padStart(value.length, "0") : value;
}

function PayrollContent() {
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

  const [rows, setRows] = useState<PayeeRow[]>([]);
  const [subRows, setSubRows] = useState<SubRow[]>([]);
  /** "sub:<id>" -> what paperwork is missing or expired. A warning only: paying is never blocked. */
  const [papers, setPapers] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  /** The table lists only people who are owed; this shows everyone else too. */
  const [showEveryone, setShowEveryone] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Ticked rows. Null means the default: everyone who is owed.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  // Amounts typed in the Pay column, by row. Missing means the amount owed.
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payDate, setPayDate] = useState(today());
  const [method, setMethod] = useState("Check");
  const [firstReference, setFirstReference] = useState("");
  const [correction, setCorrection] = useState({ amount: "", reason: "" });
  // The payments table: which row is open, which is being reversed, and the page.
  const [openPayment, setOpenPayment] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [paymentPage, setPaymentPage] = useState(0);

  // Every employee on weekly pay means weekly periods; otherwise every two weeks.
  const employeeRows = rows.filter((r) => r.kind === "employee");
  const periodDays: PeriodLength = employeeRows.length > 0 && employeeRows.every((r) => r.payFrequency === "weekly") ? 7 : 14;
  const [refDate, setRefDate] = useState(() => today());
  const period = useMemo(() => periodContaining(new Date(`${refDate}T00:00:00`), periodDays), [refDate, periodDays]);
  const isCurrentPeriod = period.end === periodContaining(new Date(), periodDays).end;
  const inPeriod = (d: string) => d >= period.start && d <= period.end;

  function movePeriod(n: number) {
    setRefDate(shiftPeriodDays(refDate, n * periodDays));
  }

  // Where each job's estimate opens, so job lines can link to it.
  const [estimateHref, setEstimateHref] = useState<Map<string, string>>(new Map());
  const [estimateLabel, setEstimateLabel] = useState<Map<string, string>>(new Map());
  // Each expense's description, amount and estimate, for the lines under a reimbursement.
  const [expenseInfo, setExpenseInfo] = useState<Map<string, { label: string; amount: number; estimateId: string | null }>>(new Map());

  async function reload() {
    if (!payService || !companyId) return;
    try {
      setRows(await payService.load(period.end));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payroll.");
    } finally {
      setLoading(false);
    }
    // Subcontractors and agents load on their own, so a problem with them does not hide employee pay.
    try {
      const estimates = await services.estimateService.list({ companyId });
      const labels = new Map(estimates.map((e) => [e.id, [e.estimateNumber, e.title].filter(Boolean).join(" · ") || "Job"]));
      setEstimateHref(new Map(estimates.map((e) => [e.id, `${e.estimateType === "roofing" ? "/estimates-roof" : "/estimates"}/${e.id}`])));
      setEstimateLabel(new Map(estimates.map((e) => [e.id, e.estimateNumber || e.title || "Estimate"])));
      const expenses = await services.expenseService.listForCompany(companyId);
      setExpenseInfo(new Map(expenses.map((x) => [x.id, { label: x.description || x.vendor || "Expense", amount: x.amount, estimateId: x.estimateId }])));
      const projects = await services.projectService.list({ companyId });
      const projectNames = new Map(projects.map((pr) => [pr.id, pr.name]));
      const labelFor = (id: string | null, projectId: string | null) =>
        id ? labels.get(id) ?? "Job" : projectId && projectNames.has(projectId) ? `Project · ${projectNames.get(projectId)}` : "Project";
      setSubRows(await loadContractRows(services, companyId, labelFor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subcontractors and agents.");
    }
    try {
      const [roster, docs] = await Promise.all([
        services.subcontractorService.getRoster(companyId, true),
        services.subcontractorDocumentService.listForCompany(companyId),
      ]);
      const warnings = new Map<string, string>();
      for (const sub of roster) {
        const warning = complianceWarning(subcontractorCompliance(sub, docs.filter((d) => d.subcontractorId === sub.id)));
        if (warning) warnings.set(`sub:${sub.id}`, warning);
      }
      setPapers(warnings);
    } catch {
      // Paperwork is advisory here; Payroll works without it.
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    // reload depends only on the payment service and the period on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payService, period.end]);


  const payees = useMemo<Payee[]>(() => {
    const people: Payee[] = rows.map((r) => {
      const latest = r.payments
        .filter((p) => !p.reversedAt && p.paymentKind !== "adjustment" && inPeriod(p.paidOn))
        .sort((a, b) => b.paidOn.localeCompare(a.paidOn))[0];
      const owedJobs = r.lines.filter((l) => l.kind !== "reimbursement" && l.kind !== "adjustment" && l.owed > 0.005).length;
      return {
        key: r.key,
        name: r.name,
        kind: r.kind,
        basis: [
          owedJobs > 0 ? `${owedJobs} ${owedJobs === 1 ? "job" : "jobs"} owed` : "No jobs owed",
          r.lines.some((l) => l.kind === "reimbursement" && l.owed > 0.005) ? "reimbursement" : null,
          r.lines.some((l) => l.kind === "adjustment" && l.owed > 0.005) ? "correction" : null,
          r.kind === "employee" ? (r.payFrequency === "weekly" ? "weekly" : "every two weeks") : "per job",
        ]
          .filter(Boolean)
          .join(" · "),
        owed: r.owed,
        lines: r.lines.map((l) => ({ label: l.label, estimateId: l.estimateId, expenseIds: l.expenseIds, earned: l.earned, paid: l.paid, owed: l.owed })),
        lastPaid: latest ? { date: latest.paidOn, reference: latest.reference, method: latest.method } : null,
        person: r,
        sub: null,
      };
    });
    const subs: Payee[] = subRows.map((s) => {
      const latest = s.payments
        .filter((p) => inPeriod(p.paymentDate.slice(0, 10)))
        .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0];
      return {
        key: s.key,
        name: s.name,
        kind: s.payeeType,
        // Only the jobs still owed; paid jobs are on the payment history page.
        basis:
          [
            ...s.lines.filter((l) => l.outstanding > 0.005).map((l) => l.label),
            ...(s.reimbursements.length ? [`${s.reimbursements.length} reimbursement${s.reimbursements.length === 1 ? "" : "s"}`] : []),
          ].join(", ") || "No jobs owed",
        owed: s.owed,
        lines: [
          ...s.lines.map((l) => ({ label: l.label, estimateId: l.estimateId, projectId: l.projectId, earned: l.contracted, paid: l.paid, owed: l.outstanding })),
          // Expenses they paid for, paid back in the same check (see recordAll).
          ...s.reimbursements.map((x) => ({ label: x.label, estimateId: x.estimateId, projectId: x.projectId, expenseIds: [x.expenseId], earned: x.amount, paid: 0, owed: x.amount })),
        ],
        lastPaid: latest ? { date: latest.paymentDate.slice(0, 10), reference: null, method: latest.paymentMethod ?? "—" } : null,
        person: null,
        sub: s,
      };
    });
    // Owed first, then by name.
    return [...people, ...subs].sort((a, b) => Number(b.owed > 0) - Number(a.owed > 0) || a.name.localeCompare(b.name));
    // inPeriod reads the period, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, subRows, period.start, period.end]);

  // Opened with ?person=<key> (from the history page or an estimate): open that row once it has loaded.
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  useEffect(() => {
    if (deepLinkDone || loading) return;
    const key = new URLSearchParams(window.location.search).get("person");
    const match = key ? payees.find((p) => p.key === key) : undefined;
    if (key && !match) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeepLinkDone(true);
    if (match) {
      setOpenKey(match.key);
      setFilter(match.kind);
    }
  }, [payees, loading, deepLinkDone]);

  // Only people who are owed, unless "Show everyone" is on. A person opened
  // from a link (?person=…) stays listed even when nothing is owed.
  const listed = payees.filter((p) => showEveryone || p.owed > 0.005 || p.key === openKey);
  const counts: Record<Filter, number> = {
    all: listed.length,
    employee: listed.filter((p) => p.kind === "employee").length,
    team: listed.filter((p) => p.kind === "team").length,
    subcontractor: listed.filter((p) => p.kind === "subcontractor").length,
    agent: listed.filter((p) => p.kind === "agent").length,
  };
  const visible = listed.filter((p) => filter === "all" || p.kind === filter);
  const notOwedCount = payees.filter((p) => p.owed <= 0.005).length;

  const owedTotal = cents(payees.reduce((s, p) => s + p.owed, 0));
  const owedCount = payees.filter((p) => p.owed > 0).length;
  const paidThisPeriod = cents(
    rows
      .flatMap((r) => r.payments)
      .filter((p) => !p.reversedAt && p.paymentKind !== "adjustment" && inPeriod(p.paidOn))
      .reduce((s, p) => s + p.amount, 0) +
      subRows
        .flatMap((s) => s.payments)
        .filter((p) => inPeriod(p.paymentDate.slice(0, 10)))
        .reduce((s, p) => s + p.amount, 0)
  );

  const periodPayments = useMemo(() => {
    const list: Array<{
      id: string;
      kind: Kind;
      payee: string;
      /** Which payment this stored row belongs to; rows with the same value are one check. */
      group: string;
      /** When it was recorded; orders payments made on the same day. */
      savedAt: string;
      paidOn: string;
      amount: number;
      method: string;
      reference: string | null;
      covers: string;
      estimateId: string | null;
      projectId: string | null;
      parts: PaymentAllocation[] | null;
      reversed: boolean;
      reversalReason: string | null;
    }> = [];
    const seen = new Set<string>();
    for (const r of rows) {
      for (const pay of r.payments) {
        if (pay.paymentKind === "adjustment" || seen.has(pay.id) || !inPeriod(pay.paidOn)) continue;
        seen.add(pay.id);
        const parts = pay.allocations && pay.allocations.length > 0 ? pay.allocations : null;
        list.push({
          id: pay.id,
          kind: r.kind,
          payee: r.name,
          // A payment with parts is already one stored row per check. Older rows were
          // stored one per job, so those are matched by date, method and reference.
          group: parts ? pay.id : `${pay.paidOn}|${pay.method}|${pay.reference ?? ""}`,
          savedAt: pay.createdAt ?? "",
          paidOn: pay.paidOn,
          amount: pay.amount,
          method: pay.method,
          reference: pay.reference,
          covers: parts
            ? `Full payment · ${parts.length} ${parts.length === 1 ? "part" : "parts"}`
            : pay.paymentKind === "reimbursement"
              ? "Reimbursement"
              : pay.estimateId
                ? (r.lines.find((l) => l.estimateId === pay.estimateId)?.label ?? "Job")
                : "Not tied to a job",
          estimateId: pay.estimateId ?? null,
          projectId: null,
          parts,
          reversed: !!pay.reversedAt,
          reversalReason: pay.reversalReason,
        });
      }
    }
    for (const s of subRows) {
      for (const pay of s.payments) {
        const paidOn = pay.paymentDate.slice(0, 10);
        if (!inPeriod(paidOn)) continue;
        list.push({
          id: pay.id,
          kind: s.payeeType,
          payee: s.name,
          group: pay.checkKey,
          savedAt: pay.savedAt,
          paidOn,
          amount: pay.amount,
          method: pay.paymentMethod ?? "—",
          reference: null,
          covers: pay.label,
          estimateId: pay.estimateId,
          projectId: pay.estimateId ? null : pay.projectId,
          parts: null,
          reversed: false,
          reversalReason: null,
        });
      }
    }
    // One row per payment made, not per person or per day: the parts of one payment
    // (several jobs paid together) are put back together here.
    const checks = new Map<string, typeof list>();
    for (const x of list) {
      const key = `${x.kind}|${x.payee}|${x.group}`;
      checks.set(key, [...(checks.get(key) ?? []), x]);
    }
    return [...checks.entries()]
      .map(([key, members]) => {
        const live = members.filter((m) => !m.reversed);
        const counted = live.length > 0 ? live : members;
        const parts: PaymentAllocation[] = members.flatMap((m) =>
          m.parts ?? [{ kind: m.covers.startsWith("Reimbursement") ? ("reimbursement" as const) : ("job" as const), estimateId: m.estimateId, projectId: m.projectId, amount: m.amount, label: m.covers, expenseIds: [] }]
        );
        return {
          id: key,
          savedAt: members.reduce((latest, m) => (m.savedAt > latest ? m.savedAt : latest), ""),
          liveIds: live.map((m) => m.id),
          kind: members[0].kind,
          payee: members[0].payee,
          paidOn: members[0].paidOn,
          amount: cents(counted.reduce((s, m) => s + m.amount, 0)),
          method: members[0].method,
          reference: members[0].reference,
          covers: parts.length > 1 ? `Full payment · ${parts.length} parts` : members[0].covers,
          parts: parts.length > 1 ? parts : members[0].parts,
          estimateId: members[0].estimateId,
          projectId: members[0].projectId,
          reversed: live.length === 0,
          reversalReason: members.find((m) => m.reversalReason)?.reversalReason ?? null,
        };
      })
      // Newest first: by pay date, then by when it was recorded.
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
    // inPeriod reads the period, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, subRows, period.start, period.end]);
  const PAYMENTS_PAGE = 50;
  const paymentPageCount = Math.max(1, Math.ceil(periodPayments.length / PAYMENTS_PAGE));
  const paymentPageIndex = Math.min(paymentPage, paymentPageCount - 1);
  const pagedPayments = periodPayments.slice(paymentPageIndex * PAYMENTS_PAGE, (paymentPageIndex + 1) * PAYMENTS_PAGE);

  /** Reverses a whole check: every stored payment it is made of, with one reason. */
  async function reverseCheck(ids: string[], kind: Kind) {
    if (!payService) return;
    const reason = reversalReason.trim();
    if (!reason) return setError("Enter a reason to reverse this payment.");
    setBusy(true);
    setError(null);
    setNotice(null);
    let done = 0;
    try {
      for (const id of ids) {
        // A subcontractor or agent payment is an expense row; reversing it removes that row.
        // A reimbursement paid back to them goes back to owed (the expense itself stays).
        if (id.startsWith("reimb:")) await services.expenseService.unmarkReimbursed(id.slice(6) as UUID);
        else if (kind === "subcontractor" || kind === "agent") await services.expenseService.softDelete(id as UUID, reason);
        else await payService.reversePayment(id, reason);
        done++;
      }
      setReversingId(null);
      setReversalReason("");
      setNotice("Payment reversed.");
    } catch (err) {
      setError(`Reversed ${done} of ${ids.length} parts before an error. ${err instanceof Error ? err.message : "The payment could not be reversed."}`);
    } finally {
      setBusy(false);
      await reload();
    }
  }

  /** Downloads the payments shown for this period. */
  function exportPayments() {
    const header = ["Date", "Paid to", "Type", "Covers", "Method", "Reference", "Amount", "Status"];
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = periodPayments.map((x) =>
      [x.paidOn, x.payee, kindLabel(x.kind), x.parts ? x.parts.map((part) => `${part.label} ${money(part.amount)}`).join("; ") : x.covers, x.method, x.reference, x.amount.toFixed(2), x.reversed ? "Reversed" : "Paid"]
        .map(esc)
        .join(",")
    );
    const link = document.createElement("a");
    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent([header.map(esc).join(","), ...lines].join("\n"))}`;
    link.download = `payments-${period.start}-to-${period.end}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const selectedKeys = picked ?? new Set(payees.filter((p) => p.owed > 0).map((p) => p.key));
  const amountOf = (p: Payee) => {
    const v = Number(amounts[p.key] ?? p.owed.toFixed(2));
    return Number.isFinite(v) && v > 0 ? cents(v) : 0;
  };
  const selected = payees.filter((p) => selectedKeys.has(p.key) && p.owed > 0);
  const selectedTotal = cents(selected.reduce((s, p) => s + amountOf(p), 0));
  const amountProblem = selected.find((p) => amountOf(p) <= 0 || amountOf(p) > p.owed + 0.005);

  function toggle(key: string) {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  }
  const owedVisible = visible.filter((p) => p.owed > 0);
  const allVisibleSelected = owedVisible.length > 0 && owedVisible.every((p) => selectedKeys.has(p.key));
  function toggleAll() {
    const next = new Set(selectedKeys);
    for (const p of owedVisible) {
      if (allVisibleSelected) next.delete(p.key);
      else next.add(p.key);
    }
    setPicked(next);
  }

  function openReview() {
    setError(null);
    setNotice(null);
    if (amountProblem) {
      setError(`${amountProblem.name}: enter an amount between $0.01 and ${money(amountProblem.owed)}.`);
      return;
    }
    setPayDate(today());
    setReviewing(true);
  }

  /** Records one payment per selected person, in table order, each with the next reference. */
  async function recordAll() {
    if (!payService || !companyId) return;
    setBusy(true);
    setError(null);
    let done = 0;
    try {
      for (const [index, p] of selected.entries()) {
        const amount = amountOf(p);
        const reference = referenceFor(firstReference, index);
        if (p.person) {
          await payService.recordFullPayment({
            payeeKey: p.key,
            paidOn: payDate,
            method,
            reference,
            periodStart: period.start,
            periodEnd: period.end,
            // The full balance goes as one check with every job and any reimbursement.
            amount: Math.abs(amount - p.owed) < 0.005 ? null : amount,
          });
        } else if (p.sub) {
          // Subcontractor and agent jobs are paid one assignment at a time, in the order listed.
          // Every part carries the same method and check number, so it shows as one check.
          const paymentMethod = reference ? `${method} ${reference}` : method;
          const checkId = crypto.randomUUID();
          let left = amount;
          for (const line of p.sub.lines.filter((l) => l.outstanding > 0)) {
            if (left <= 0.005) break;
            const take = cents(Math.min(left, line.outstanding));
            await services.expenseService.create(contractPaymentExpense(p.sub, line, { companyId, amount: take, paidOn: payDate, paymentMethod, checkId }));
            left = cents(left - take);
          }
          // Then the expenses they paid for, each paid back in full when the amount covers it.
          // Same check id, so the commission and the reimbursements show as one payment.
          for (const r of p.sub.reimbursements) {
            if (left + 0.005 < r.amount) break;
            await services.expenseService.markReimbursed(r.expenseId as UUID, { paidOn: payDate, method: paymentMethod, reference, checkId });
            left = cents(left - r.amount);
          }
        }
        done++;
      }
      setReviewing(false);
      setPicked(null);
      setAmounts({});
      setFirstReference("");
      setNotice(`Recorded ${done} ${done === 1 ? "payment" : "payments"}.`);
    } catch (err) {
      setError(`Recorded ${done} of ${selected.length} payments before an error. ${err instanceof Error ? err.message : "A payment could not be recorded."}`);
      setReviewing(false);
    } finally {
      setBusy(false);
      await reload();
    }
  }

  async function addCorrection(p: Payee) {
    if (!payService) return;
    const amount = Number(correction.amount);
    if (!amount || !correction.reason.trim()) return setError("Enter an amount and a reason for the correction.");
    setBusy(true);
    setError(null);
    try {
      await payService.recordAdjustment({ payeeKey: p.key, amount, reason: correction.reason.trim(), paidOn: today() });
      setCorrection({ amount: "", reason: "" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the correction.");
    } finally {
      setBusy(false);
    }
  }

  const kindLabel = (k: Payee["kind"]) => (k === "employee" ? "Employee" : k === "team" ? "Team member" : k === "agent" ? "Agent" : "Subcontractor");
  /** A job's name, linked to its estimate, or to its project when it has no estimate. */
  const jobLink = (estimateId: string | null | undefined, text: string, projectId?: string | null) => {
    const href = estimateId ? estimateHref.get(estimateId) : projectId ? `/projects/${projectId}` : undefined;
    return href ? (
      <Link href={href} className="text-primary hover:underline">
        {text}
      </Link>
    ) : (
      text
    );
  };
  /** The expenses behind a reimbursement, each with the estimate it was spent on. */
  const expenseList = (ids: string[] | undefined) =>
    ids && ids.length > 0 ? (
      <div className="mt-0.5 flex flex-col gap-0.5 pl-3 text-[11px] text-muted-foreground">
        {ids.map((id) => {
          const x = expenseInfo.get(id);
          if (!x) return null;
          return (
            <div key={id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {x.label}
                {x.estimateId && <> · {jobLink(x.estimateId, estimateLabel.get(x.estimateId) ?? "Estimate")}</>}
              </span>
              <span className="tabular-nums">{money(x.amount)}</span>
            </div>
          );
        })}
      </div>
    ) : null;

  const GRID = "grid grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_96px_116px_128px_24px] items-center gap-3";

  return (
    <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Payroll</h1>
            <p className="hidden text-[12px] text-muted-foreground sm:block">Employees, team members, subcontractors and agents</p>
          </div>
          <Link href="/payroll/history" className="whitespace-nowrap text-[13px] text-primary hover:underline">
            Payment history →
          </Link>
        </div>

        {/* Period and totals: one ruled strip, labelled cells. */}
        <div className="grid grid-cols-2 rounded-lg border border-border bg-card sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
          <div className="col-span-2 border-b border-border px-4 py-2.5 sm:col-span-1 sm:border-b-0 sm:border-r">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Pay period · {periodDays === 7 ? "Weekly" : "Every 2 weeks"}
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <button type="button" aria-label="Previous period" onClick={() => movePeriod(-1)} className="-ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <ChevronDown className="size-4 rotate-90" aria-hidden="true" />
              </button>
              <span className="text-[15px] font-semibold tabular-nums text-foreground">
                {shortDate(period.start)} – {shortDate(period.end)}
              </span>
              <button type="button" aria-label="Next period" onClick={() => movePeriod(1)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <ChevronDown className="size-4 -rotate-90" aria-hidden="true" />
              </button>
              {isCurrentPeriod ? (
                <span className="ml-1 text-[11px] text-muted-foreground">Current</span>
              ) : (
                <button type="button" onClick={() => setRefDate(today())} className="ml-1 text-[12px] text-primary hover:underline">
                  Back to current
                </button>
              )}
            </div>
          </div>
          <div className="border-r border-border px-4 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pay by</div>
            <div className="mt-1 text-[15px] font-semibold tabular-nums text-foreground">{shortDate(period.end)}</div>
          </div>
          <div className="px-4 py-2.5 sm:border-r sm:border-border">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Owed</div>
            <div className={`mt-1 text-[15px] font-semibold tabular-nums ${owedTotal > 0 ? "text-warning" : "text-foreground"}`}>
              {money(owedTotal)}
              <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
                {owedCount} {owedCount === 1 ? "person" : "people"}
              </span>
            </div>
          </div>
          <div className="col-span-2 border-t border-border px-4 py-2.5 sm:col-span-1 sm:border-t-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Paid this period</div>
            <div className="mt-1 text-[15px] font-semibold tabular-nums text-success">{money(paidThisPeriod)}</div>
          </div>
        </div>

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
        {notice && <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">{notice}</div>}

        <div className="flex flex-wrap gap-1 text-[13px]">
          {(["all", "employee", "team", "subcontractor", "agent"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f === "all" ? "All" : f === "employee" ? "Employees" : f === "team" ? "Team" : f === "agent" ? "Agents" : "Subcontractors"}{" "}
              <span className="font-normal text-muted-foreground">{counts[f]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">
            {showEveryone ? "No one in this view." : "No one is owed anything right now."}
            {!showEveryone && notOwedCount > 0 && (
              <button type="button" onClick={() => setShowEveryone(true)} className="ml-1.5 text-primary hover:underline">
                Show everyone
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <div className="min-w-[720px]">
              <div className={`${GRID} bg-primary/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-primary`}>
                <input type="checkbox" aria-label="Select everyone owed" checked={allVisibleSelected} onChange={toggleAll} disabled={owedVisible.length === 0} />
                <span>Name</span>
                <span>Basis</span>
                <span className="text-right">Owed</span>
                <span className="text-right">Pay</span>
                <span>Status</span>
                <span />
              </div>
              {visible.map((p) => {
                const isOpen = openKey === p.key;
                const owes = p.owed > 0;
                return (
                  <Fragment key={p.key}>
                    <div className={`${GRID} border-t border-border px-4 py-2.5 text-[13px] ${isOpen ? "bg-muted/40" : ""}`}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        checked={owes && selectedKeys.has(p.key)}
                        disabled={!owes}
                        onChange={() => toggle(p.key)}
                      />
                      <button type="button" onClick={() => setOpenKey(isOpen ? null : p.key)} className="min-w-0 text-left">
                        <span className="block truncate text-foreground">{p.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{kindLabel(p.kind)}</span>
                        {papers.has(p.key) && <span className="block truncate text-[11px] text-danger" title={papers.get(p.key)}>{papers.get(p.key)}</span>}
                      </button>
                      <span className="truncate text-muted-foreground">{p.basis}</span>
                      <span className={`text-right tabular-nums ${owes ? "text-foreground" : "text-muted-foreground"}`}>{money(p.owed)}</span>
                      {owes ? (
                        <input
                          inputMode="decimal"
                          aria-label={`Pay ${p.name}`}
                          value={amounts[p.key] ?? p.owed.toFixed(2)}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [p.key]: e.target.value }))}
                          className={`${INPUT} text-right tabular-nums`}
                        />
                      ) : (
                        <span className="text-right text-muted-foreground">—</span>
                      )}
                      <span className={`truncate text-[12px] ${owes ? "text-warning" : p.lastPaid ? "text-success" : "text-muted-foreground"}`}>
                        {owes ? "● Owed" : p.lastPaid ? `● Paid${p.lastPaid.reference ? ` · #${p.lastPaid.reference}` : ""}` : "No balance"}
                      </span>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Hide ${p.name}'s jobs` : `Show ${p.name}'s jobs`}
                        onClick={() => setOpenKey(isOpen ? null : p.key)}
                        className="justify-self-end rounded p-0.5 text-muted-foreground hover:bg-muted"
                      >
                        <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="border-t border-border bg-muted/40 px-4 pb-4 pl-14 pt-2 text-[12px]">
                        <div className={`grid grid-cols-[minmax(0,1fr)_96px_96px_96px] gap-3 pb-1 text-[11px] text-muted-foreground ${p.lines.some((l) => l.owed > 0.005) ? "" : "hidden"}`}>
                          <span>Job or item</span>
                          <span className="text-right">{p.kind === "subcontractor" ? "Contracted" : p.kind === "agent" ? "Commission" : "Earned"}</span>
                          <span className="text-right">Paid</span>
                          <span className="text-right">Owed</span>
                        </div>
                        {p.lines.every((l) => l.owed <= 0.005) && <div className="py-1 text-foreground">Nothing owed.</div>}
                        {/* Only what is still owed. Paid jobs are on the payment history page. */}
                        {p.lines.filter((l) => l.owed > 0.005).map((l, i) => (
                          <div key={`${l.label}-${i}`} className="grid grid-cols-[minmax(0,1fr)_96px_96px_96px] gap-3 border-t border-border py-1.5 text-foreground">
                            <span className="min-w-0">
                              {jobLink(l.estimateId, l.label, l.projectId)}
                              {expenseList(l.expenseIds)}
                            </span>
                            <span className="text-right tabular-nums">{money(l.earned)}</span>
                            <span className="text-right tabular-nums text-muted-foreground">{money(l.paid)}</span>
                            <span className={`text-right tabular-nums ${l.owed > 0 ? "text-warning" : ""}`}>{money(l.owed)}</span>
                          </div>
                        ))}
                        {p.kind === "employee" && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">Correction</span>
                            <input
                              inputMode="decimal"
                              aria-label="Correction amount"
                              placeholder="+25.00 or -10.00"
                              value={correction.amount}
                              onChange={(e) => setCorrection({ ...correction, amount: e.target.value })}
                              className={`${INPUT} w-32`}
                            />
                            <input
                              aria-label="Correction reason"
                              placeholder="Reason"
                              value={correction.reason}
                              onChange={(e) => setCorrection({ ...correction, reason: e.target.value })}
                              className={`${INPUT} w-56`}
                            />
                            <button
                              type="button"
                              disabled={busy || !correction.amount || !correction.reason.trim()}
                              onClick={() => addCorrection(p)}
                              className="h-8 rounded-md border border-border px-3 text-foreground disabled:opacity-40"
                            >
                              Add
                            </button>
                          </div>
                        )}
                        {(() => {
                          const paidJobs = p.lines.filter((l) => l.owed <= 0.005).length;
                          if (!p.lastPaid && paidJobs === 0) return null;
                          return (
                            <div className="mt-3 text-muted-foreground">
                              {p.lastPaid && (
                                <>
                                  Last paid {p.lastPaid.date} · {p.lastPaid.method}
                                  {p.lastPaid.reference ? ` · #${p.lastPaid.reference}` : ""} ·{" "}
                                </>
                              )}
                              {paidJobs > 0 && <>{paidJobs} paid {paidJobs === 1 ? "job" : "jobs"} not shown · </>}
                              <Link href="/payroll/history" className="text-primary hover:underline">
                                See history
                              </Link>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
        {!loading && visible.length > 0 && notOwedCount > 0 && (
          <div className="-mt-2 text-[12px] text-muted-foreground">
            {showEveryone ? (
              <button type="button" onClick={() => setShowEveryone(false)} className="text-primary hover:underline">
                Show only people who are owed
              </button>
            ) : (
              <>
                {notOwedCount} {notOwedCount === 1 ? "person has" : "people have"} nothing owed and {notOwedCount === 1 ? "isn't" : "aren't"} listed.{" "}
                <button type="button" onClick={() => setShowEveryone(true)} className="text-primary hover:underline">
                  Show everyone
                </button>
              </>
            )}
          </div>
        )}

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3">
            <span className="text-[13px] text-muted-foreground">
              {selected.length} selected · <span className="font-medium text-foreground">{money(selectedTotal)}</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={openReview}
              className="h-9 rounded-md bg-foreground px-4 text-[13px] font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
            >
              Review and pay
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-medium text-foreground">All payments</h2>
            <div className="flex items-center gap-3 text-[13px]">
              <span className="text-muted-foreground">
                {shortDate(period.start)} – {shortDate(period.end)}
              </span>
              {periodPayments.length > 0 && (
                <button type="button" onClick={exportPayments} className="h-8 rounded-md border border-border px-3 text-foreground">
                  Export CSV
                </button>
              )}
            </div>
          </div>
          {periodPayments.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">No payments in this period.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:font-semibold">
                  <tr>
                    <th className="w-8 py-2 pl-3 font-normal"><span className="sr-only">Details</span></th>
                    <th className="py-2 pr-3 font-normal">Date</th>
                    <th className="py-2 pr-3 font-normal">Paid to</th>
                    <th className="py-2 pr-3 font-normal">Covers</th>
                    <th className="py-2 pr-3 font-normal">Method</th>
                    <th className="py-2 pr-3 font-normal">Reference</th>
                    <th className="py-2 pr-3 text-right font-normal">Amount</th>
                    <th className="py-2 pr-3 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPayments.map((x) => {
                    const isOpen = openPayment === x.id;
                    const reversing = reversingId === x.id;
                    return (
                      <Fragment key={x.id}>
                        <tr className={`border-t border-border ${x.reversed ? "text-muted-foreground" : ""}`}>
                          <td className="py-2 pl-3">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-label={isOpen ? "Hide payment details" : "Show payment details"}
                              onClick={() => setOpenPayment(isOpen ? null : x.id)}
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                            >
                              <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                            </button>
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">{x.paidOn}</td>
                          <td className="py-2 pr-3">
                            {x.payee} <span className="text-[11px] text-muted-foreground">{kindLabel(x.kind)}</span>
                          </td>
                          <td className="py-2 pr-3">{x.covers}</td>
                          <td className="py-2 pr-3">{x.method}</td>
                          <td className="py-2 pr-3">{x.reference ?? "—"}</td>
                          <td className={`py-2 pr-3 text-right tabular-nums ${x.reversed ? "line-through" : ""}`}>{money(x.amount)}</td>
                          <td className={`py-2 pr-3 text-[12px] ${x.reversed ? "text-danger" : "text-success"}`}>{x.reversed ? "● Reversed" : "● Paid"}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-muted/40">
                            <td />
                            <td colSpan={7} className="py-3 pr-3 text-[12px]">
                              {x.parts ? (
                                <div className="flex max-w-md flex-col gap-1">
                                  {x.parts.map((part, i) => (
                                    <div key={`${part.kind}-${i}`} className="flex justify-between gap-3 text-foreground">
                                      <span className="min-w-0 flex-1">
                                        {jobLink(part.estimateId, part.label, part.projectId)}
                                        {part.kind === "reimbursement" && expenseList(part.expenseIds)}
                                      </span>
                                      <span className="tabular-nums">{money(part.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-foreground">{jobLink(x.estimateId, x.covers, x.projectId)}</div>
                              )}
                              {x.reversed && <div className="mt-2 text-muted-foreground">Reversed{x.reversalReason ? `: ${x.reversalReason}` : ""}</div>}
                              {!x.reversed && !reversing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReversingId(x.id);
                                    setReversalReason("");
                                  }}
                                  className="mt-2 h-7 rounded-md border border-danger/40 px-2.5 font-medium text-danger hover:bg-danger/10"
                                >
                                  Reverse payment
                                </button>
                              )}
                              {!x.reversed && reversing && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <input
                                    aria-label="Reason for reversing"
                                    placeholder="Reason for reversing"
                                    value={reversalReason}
                                    onChange={(e) => setReversalReason(e.target.value)}
                                    className={`${INPUT} min-w-[220px] max-w-sm flex-1`}
                                  />
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => reverseCheck(x.liveIds, x.kind)}
                                    className="h-8 rounded-md bg-danger px-3 font-medium text-danger-foreground hover:bg-danger/90 disabled:opacity-60"
                                  >
                                    Confirm reverse
                                  </button>
                                  <button type="button" onClick={() => setReversingId(null)} className="text-muted-foreground hover:underline">
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {paymentPageCount > 1 && (
                <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
                  <button type="button" disabled={paymentPageIndex === 0} onClick={() => setPaymentPage(paymentPageIndex - 1)} className="rounded-md border border-border px-3 py-1 text-foreground disabled:opacity-40">
                    Previous
                  </button>
                  <span>
                    Page {paymentPageIndex + 1} of {paymentPageCount} · {periodPayments.length} payments
                  </span>
                  <button
                    type="button"
                    disabled={paymentPageIndex >= paymentPageCount - 1}
                    onClick={() => setPaymentPage(paymentPageIndex + 1)}
                    className="rounded-md border border-border px-3 py-1 text-foreground disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal open={reviewing} onClose={() => !busy && setReviewing(false)} title={`Review ${selected.length} ${selected.length === 1 ? "payment" : "payments"}`}>
        <div className="flex flex-col gap-4 text-[13px]">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-muted-foreground">
              Pay date
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={`${INPUT} mt-1`} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Method
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${INPUT} mt-1`}>
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">
              {method === "Check" ? "First check #" : "Reference"}
              <input
                value={firstReference}
                onChange={(e) => setFirstReference(e.target.value)}
                placeholder={method === "Check" ? "1030" : "Optional"}
                className={`${INPUT} mt-1`}
              />
            </label>
          </div>
          <div className="flex flex-col">
            {selected.map((p, i) => (
              <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_80px_96px] gap-2 border-t border-border py-2">
                <span className="min-w-0 text-foreground">
                  <span className="block truncate">{p.name}</span>
                  {papers.has(p.key) && (
                    <Link href={`/subcontractors/${p.key.slice(4)}`} className="block truncate text-[11px] text-danger hover:underline">
                      {papers.get(p.key)}
                    </Link>
                  )}
                </span>
                <span className="text-muted-foreground">{referenceFor(firstReference, i) ? `#${referenceFor(firstReference, i)}` : "—"}</span>
                <span className="text-right tabular-nums text-foreground">{money(amountOf(p))}</span>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_80px_96px] gap-2 border-t border-border-strong py-2 font-medium">
              <span className="text-foreground">Total</span>
              <span />
              <span className="text-right tabular-nums text-foreground">{money(selectedTotal)}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Paying a person&apos;s full balance includes any reimbursement they are owed. A smaller amount pays wages only.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setReviewing(false)} className="h-9 rounded-md border border-border px-3 text-foreground disabled:opacity-60">
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={recordAll} className="h-9 rounded-md bg-foreground px-4 font-medium text-background disabled:opacity-60">
              {busy ? "Recording…" : `Record ${selected.length} ${selected.length === 1 ? "payment" : "payments"}`}
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}

export default function PayrollPage() {
  return (
    <RequirePermission resource="financial_reports" action="view">
      <PayrollContent />
    </RequirePermission>
  );
}
