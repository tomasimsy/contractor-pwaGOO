"use client";

/**
 * Vendor bills — invoices the business has RECEIVED from suppliers and
 * vendors (materials, dumpsters, rentals, insurance, utilities…).
 * People — crew, subs, agents — are paid on Payroll, not here.
 *
 * ============================================================
 * A BILL IS AN EXPENSE THAT HAS A DUE DATE
 * ============================================================
 * There is no bills table. A bill is an ordinary `estimate_expenses` row
 * whose `due_date` is set, so it was always part of job costing and every
 * financial total; nothing on this page adds to any total.
 *   - Unpaid      is `is_paid = false`
 *   - Paying      sets is_paid, paid_on, payment_method, paid_reference
 *                 (several bills from one vendor can be paid together,
 *                 sharing one date and check #)
 *   - Undo        clears them again
 * The only thing computed here is which bucket a due date falls into
 * (overdue / this week / later) — display only, no money is derived.
 *
 * Repeating bills are TEMPLATES in `bill_schedules`. `generateDue` turns
 * each due occurrence into one ordinary expense, then advances the
 * schedule; it runs on page load (there is no scheduler) and claims each
 * occurrence first, so two loads at once can't both create it.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { CreateOrSelect, type DirectoryOption } from "@/components/shared/CreateOrSelect";
import { createVendorDirectory } from "@/components/expenses/directories";
import { PAYMENT_METHODS, formatPaymentMethod } from "@/components/payments/paymentMethods";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { EXPENSE_TYPES, EXPENSE_TYPE_LABEL, isVendorBill, type Expense, type ExpenseType } from "@/lib/services/expenseService";
import { BILL_FREQUENCIES, BILL_FREQUENCY_LABEL, type BillFrequency, type BillSchedule } from "@/lib/services/billScheduleService";
import type { Project } from "@/lib/services/projectService";
import type { Estimate } from "@/lib/services/estimateService";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Days from today within which an unpaid bill counts as "due this week". */
const DUE_SOON_DAYS = 7;

type Filter = "unpaid" | "paid" | "repeating" | "all";

const FIELD =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const LABEL = "mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const HEAD = "bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold";

const blankForm = () => ({
  id: null as string | null,
  vendor: "",
  vendorId: null as string | null,
  billNumber: "",
  amount: "",
  billDate: today(),
  dueDate: today(),
  expenseType: "miscellaneous" as ExpenseType,
  job: "",
  notes: "",
  repeat: "none" as "none" | BillFrequency,
  endMode: "never" as "never" | "on" | "after",
  endDate: "",
  occurrences: "",
});

function BillsContent() {
  const { expenseService, billScheduleService, projectService, estimateService } = useServices();
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;

  const [bills, setBills] = useState<Expense[]>([]);
  const [schedules, setSchedules] = useState<BillSchedule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("unpaid");
  const [vendorFilter, setVendorFilter] = useState("");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<ReturnType<typeof blankForm> | null>(null);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pay, setPay] = useState<{ ids: string[]; paidOn: string; method: string; reference: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: "undo" | "delete" | "stop" } | null>(null);
  const [editAmount, setEditAmount] = useState<{ id: string; value: string } | null>(null);

  const vendorDir = useMemo(() => (companyId ? createVendorDirectory(expenseService, companyId) : null), [expenseService, companyId]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      // Materialise anything that has come due, THEN read — so a bill
      // that fell due overnight is present in the same paint.
      const generated = await billScheduleService.generateDue(companyId);
      const [billRows, scheduleRows, projectRows, estimateRows] = await Promise.all([
        expenseService.listBills(companyId),
        billScheduleService.listForCompany(companyId),
        projectService.list({ companyId }),
        estimateService.list({ companyId }),
      ]);
      setBills(billRows.filter(isVendorBill));
      setSchedules(scheduleRows.filter((s) => !s.deletedAt));
      setProjects(projectRows);
      setEstimates(estimateRows);
      if (generated > 0) setNotice(`${generated} repeating bill${generated === 1 ? "" : "s"} added.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bills.");
    } finally {
      setLoading(false);
    }
  }, [companyId, expenseService, billScheduleService, projectService, estimateService]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // ---------------------------------------------------------------- labels
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const estimateById = useMemo(() => new Map(estimates.map((e) => [e.id, e])), [estimates]);
  const jobOf = (b: Pick<Expense, "estimateId" | "projectId">): { label: string; href: string } | null => {
    const est = b.estimateId ? estimateById.get(b.estimateId) : undefined;
    if (est) {
      return {
        label: [est.estimateNumber, est.title].filter(Boolean).join(" · ") || "Estimate",
        href: `${est.estimateType === "roofing" ? "/estimates-roof" : "/estimates"}/${est.id}`,
      };
    }
    if (b.projectId) return { label: projectName.get(b.projectId) ?? "Project", href: `/projects/${b.projectId}` };
    return null;
  };
  const vendorName = (b: Expense) => b.vendor || "No vendor";
  /** A bill that came from a repeating schedule (same vendor, amount and category). */
  const scheduleFor = (b: Expense) =>
    schedules.find((s) => (s.vendor ?? null) === (b.vendor ?? null) && s.amount === b.amount && s.expenseType === b.expenseType);

  // ---------------------------------------------------------------- buckets
  const now = today();
  const soon = new Date(Date.now() + DUE_SOON_DAYS * 86400000).toISOString().slice(0, 10);
  const monthStart = `${now.slice(0, 7)}-01`;
  const unpaid = useMemo(() => bills.filter((b) => !b.isPaid), [bills]);
  const overdue = unpaid.filter((b) => (b.dueDate ?? "") < now);
  const dueSoon = unpaid.filter((b) => (b.dueDate ?? "") >= now && (b.dueDate ?? "") <= soon);
  const later = unpaid.filter((b) => (b.dueDate ?? "") > soon);
  const paidThisMonth = bills.filter((b) => b.isPaid && (b.paidOn ?? "") >= monthStart);
  const sum = (rows: Expense[]) => rows.reduce((s, b) => s + b.amount, 0);

  const vendors = useMemo(() => [...new Set(bills.map(vendorName))].sort(), [bills]);

  const matches = (b: Expense) => {
    if (vendorFilter && vendorName(b) !== vendorFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [b.vendor, b.billNumber, b.notes, jobOf(b)?.label, EXPENSE_TYPE_LABEL[b.expenseType]].some((v) => (v ?? "").toLowerCase().includes(q));
  };

  const groups: Array<{ key: string; title: string; tone: string; rows: Expense[] }> =
    filter === "unpaid"
      ? [
          { key: "overdue", title: "Overdue", tone: "text-danger", rows: overdue.filter(matches) },
          { key: "soon", title: "Due this week", tone: "text-warning", rows: dueSoon.filter(matches) },
          { key: "later", title: "Later", tone: "text-muted-foreground", rows: later.filter(matches) },
        ]
      : filter === "paid"
        ? [
            {
              key: "paid",
              title: "",
              tone: "",
              rows: bills
                .filter((b) => b.isPaid && matches(b))
                .sort((a, b) => (b.paidOn ?? "").localeCompare(a.paidOn ?? "") || (b.dueDate ?? "").localeCompare(a.dueDate ?? "")),
            },
          ]
        : filter === "all"
          ? [{ key: "all", title: "", tone: "", rows: [...bills].filter(matches).sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? "")) }]
          : [];

  // ---------------------------------------------------------------- selection
  const selectedBills = bills.filter((b) => selected.has(b.id));
  const selectedVendor = selectedBills[0] ? vendorName(selectedBills[0]) : null;
  function toggle(b: Expense) {
    setSelected((prev) => {
      // Paying together means one vendor, one check: picking another
      // vendor's bill starts a new selection.
      const sameVendor = [...prev].every((id) => {
        const other = bills.find((x) => x.id === id);
        return other && vendorName(other) === vendorName(b);
      });
      const next = new Set(sameVendor ? prev : []);
      if (next.has(b.id)) next.delete(b.id);
      else next.add(b.id);
      return next;
    });
  }

  // ---------------------------------------------------------------- writes
  function openPay(ids: string[]) {
    setPay({ ids, paidOn: today(), method: "check", reference: "" });
    setNotice(null);
  }

  async function confirmPay() {
    if (!pay) return;
    setBusy(true);
    setError(null);
    try {
      for (const id of pay.ids) {
        await expenseService.update(id, {
          isPaid: true,
          paidOn: pay.paidOn,
          paymentMethod: pay.method,
          paidReference: pay.reference.trim() || null,
        });
      }
      const paidBills = bills.filter((b) => pay.ids.includes(b.id));
      setNotice(`Paid ${paidBills.length === 1 ? vendorName(paidBills[0]) : `${paidBills.length} bills to ${vendorName(paidBills[0])}`} · ${money(sum(paidBills))}.`);
      setPay(null);
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment.");
    } finally {
      setBusy(false);
    }
  }

  async function undoPay(b: Expense) {
    setBusy(true);
    setError(null);
    try {
      await expenseService.update(b.id, { isPaid: false, paidOn: null, paidReference: null, paymentMethod: null });
      setConfirm(null);
      setNotice(`${vendorName(b)} ${money(b.amount)} is unpaid again.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo the payment.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteBill(b: Expense) {
    setBusy(true);
    setError(null);
    try {
      await expenseService.softDelete(b.id, "Deleted from Vendor bills");
      setConfirm(null);
      setOpenId(null);
      setNotice("Bill deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this bill.");
    } finally {
      setBusy(false);
    }
  }

  function jobValue(b: Pick<Expense, "estimateId" | "projectId">) {
    return b.estimateId ? `est:${b.estimateId}` : b.projectId ? `proj:${b.projectId}` : "";
  }
  function jobIds(value: string): { estimateId: string | null; projectId: string | null } {
    if (value.startsWith("est:")) {
      const est = estimateById.get(value.slice(4));
      return { estimateId: est?.id ?? null, projectId: est?.projectId ?? null };
    }
    if (value.startsWith("proj:")) return { estimateId: null, projectId: value.slice(5) };
    return { estimateId: null, projectId: null };
  }

  function editBill(b: Expense) {
    setForm({
      ...blankForm(),
      id: b.id,
      vendor: b.vendor ?? "",
      vendorId: b.payeeType === "vendor" ? b.payeeId : null,
      billNumber: b.billNumber ?? "",
      amount: String(b.amount),
      billDate: b.expenseDate,
      dueDate: b.dueDate ?? b.expenseDate,
      expenseType: b.expenseType,
      job: jobValue(b),
      notes: b.notes ?? "",
    });
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveForm() {
    if (!companyId || !form) return;
    const value = parseFloat(form.amount) || 0;
    if (value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    const { estimateId, projectId } = jobIds(form.job);
    try {
      if (form.id) {
        await expenseService.update(form.id, {
          vendor: form.vendor.trim() || null,
          payeeType: form.vendor.trim() ? "vendor" : null,
          payeeId: form.vendorId,
          billNumber: form.billNumber.trim() || null,
          amount: value,
          expenseDate: form.billDate,
          dueDate: form.dueDate,
          expenseType: form.expenseType,
          estimateId,
          projectId,
          notes: form.notes.trim() || null,
        });
        setNotice("Bill updated.");
      } else if (form.repeat === "none") {
        // ONE expense row, with a due date. Nothing else.
        await expenseService.create({
          companyId,
          projectId,
          estimateId,
          expenseType: form.expenseType,
          amount: value,
          expenseDate: form.billDate,
          dueDate: form.dueDate,
          billNumber: form.billNumber.trim() || null,
          vendor: form.vendor.trim() || null,
          payeeType: form.vendor.trim() ? "vendor" : null,
          payeeId: form.vendorId,
          paidByType: "company",
          isPaid: false,
          reimbursable: false,
          notes: form.notes.trim() || null,
        });
        setNotice("Bill added.");
      } else {
        // A RULE, not a cost. generateDue turns each occurrence into an
        // ordinary expense; the first one appears on the next load.
        await billScheduleService.create({
          companyId,
          projectId,
          vendor: form.vendor.trim() || null,
          amount: value,
          expenseType: form.expenseType,
          notes: form.notes.trim() || null,
          frequency: form.repeat,
          startDate: form.dueDate,
          endDate: form.endMode === "on" && form.endDate ? form.endDate : null,
          maxOccurrences: form.endMode === "after" ? parseInt(form.occurrences, 10) || null : null,
        });
        setNotice("Repeating bill set up.");
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this bill.");
    } finally {
      setSaving(false);
    }
  }

  async function updateSchedule(s: BillSchedule, changes: Parameters<typeof billScheduleService.update>[1], message: string) {
    setBusy(true);
    setError(null);
    try {
      await billScheduleService.update(s.id, changes);
      setEditAmount(null);
      setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the repeating bill.");
    } finally {
      setBusy(false);
    }
  }

  async function stopSchedule(s: BillSchedule) {
    setBusy(true);
    setError(null);
    try {
      await billScheduleService.softDelete(s.id, "Stopped from Vendor bills");
      setConfirm(null);
      setNotice(`${s.vendor || "Repeating bill"} stopped. Bills already added stay.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop the repeating bill.");
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- render
  const payBills = pay ? bills.filter((b) => pay.ids.includes(b.id)) : [];
  const counts: Record<Filter, number> = {
    unpaid: unpaid.length,
    paid: bills.length - unpaid.length,
    repeating: schedules.length,
    all: bills.length,
  };

  const cell = (title: string, amount: number, n: number, tone: string, onClick?: () => void) => (
    <button type="button" onClick={onClick} className="border-b border-r border-border px-4 py-2.5 text-left hover:bg-muted/40 sm:border-b-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className={`mt-1 text-[15px] font-semibold tabular-nums ${amount > 0.005 ? tone : "text-foreground"}`}>
        {money(amount)}
        <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">{n}</span>
      </div>
    </button>
  );

  const jobOptions = (
    <>
      <option value="">No job</option>
      <optgroup label="Estimates">
        {estimates
          .filter((e) => !e.deletedAt)
          .map((e) => (
            <option key={e.id} value={`est:${e.id}`}>
              {[e.estimateNumber, e.title].filter(Boolean).join(" · ") || "Estimate"}
            </option>
          ))}
      </optgroup>
      <optgroup label="Projects">
        {projects.map((p) => (
          <option key={p.id} value={`proj:${p.id}`}>{p.name}</option>
        ))}
      </optgroup>
    </>
  );

  function BillRow({ b }: { b: Expense }) {
    const job = jobOf(b);
    const isOpen = openId === b.id;
    const late = !b.isPaid && b.dueDate ? daysBetween(b.dueDate, now) : 0;
    const schedule = scheduleFor(b);
    return (
      <>
        <tr className={`align-top ${isOpen ? "bg-muted/40" : "hover:bg-muted/20"}`}>
          <td className="w-8 py-2.5 pl-3">
            {!b.isPaid && (
              <input type="checkbox" aria-label={`Select ${vendorName(b)} ${money(b.amount)}`} checked={selected.has(b.id)} onChange={() => toggle(b)} />
            )}
          </td>
          <td className="px-3 py-2.5">
            <button type="button" onClick={() => setOpenId(isOpen ? null : b.id)} className="text-left">
              <span className={`font-semibold ${b.vendor ? "text-foreground" : "text-muted-foreground"}`}>{vendorName(b)}</span>
              {schedule && <span className="ml-1.5 text-[11px] text-muted-foreground">{BILL_FREQUENCY_LABEL[schedule.frequency]}</span>}
            </button>
            {/* Phone: the hidden columns, folded into one line. */}
            <div className="text-[11px] text-muted-foreground md:hidden">
              {b.isPaid ? `Paid ${shortDate(b.paidOn)}` : `Due ${shortDate(b.dueDate)}`}
              {late > 0 && <span className="text-danger"> · {late}d late</span>}
              {job && <> · {job.label}</>}
            </div>
          </td>
          <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{b.billNumber || "—"}</td>
          <td className="hidden max-w-[16rem] truncate px-3 py-2.5 md:table-cell">
            {job ? <Link href={job.href} className="text-foreground hover:text-primary hover:underline">{job.label}</Link> : <span className="text-muted-foreground">—</span>}
          </td>
          <td className="hidden px-3 py-2.5 text-muted-foreground lg:table-cell">{EXPENSE_TYPE_LABEL[b.expenseType]}</td>
          <td className="hidden whitespace-nowrap px-3 py-2.5 tabular-nums md:table-cell">
            {b.isPaid ? (
              <span className="text-muted-foreground">{shortDate(b.dueDate)}</span>
            ) : (
              <>
                {shortDate(b.dueDate)}
                {late > 0 && <div className="text-[11px] font-semibold text-danger">{late} {late === 1 ? "day" : "days"} late</div>}
              </>
            )}
          </td>
          {filter !== "unpaid" && (
            <td className="hidden whitespace-nowrap px-3 py-2.5 text-[12px] md:table-cell">
              {b.isPaid ? (
                <>
                  <div className="tabular-nums text-foreground">{shortDate(b.paidOn)}</div>
                  <div className="text-muted-foreground">
                    {formatPaymentMethod(b.paymentMethod)}
                    {b.paidReference && ` #${b.paidReference}`}
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">Unpaid</span>
              )}
            </td>
          )}
          <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${b.isPaid ? "text-muted-foreground" : late > 0 ? "text-danger" : "text-foreground"}`}>
            {money(b.amount)}
          </td>
          <td className="whitespace-nowrap py-2.5 pl-1 pr-3 text-right">
            {b.isPaid ? (
              confirm?.id === b.id && confirm.action === "undo" ? (
                <span className="inline-flex gap-1">
                  <button type="button" disabled={busy} onClick={() => undoPay(b)} className="rounded-md bg-danger px-2 py-1 text-[12px] font-medium text-danger-foreground disabled:opacity-50">
                    Confirm undo
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="px-1 text-[12px] text-muted-foreground hover:text-foreground">Keep</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirm({ id: b.id, action: "undo" })} className="rounded-md border border-danger/40 px-2 py-1 text-[12px] font-medium text-danger hover:bg-danger/5">
                  Undo payment
                </button>
              )
            ) : (
              <button type="button" onClick={() => openPay([b.id])} className="rounded-md bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90">
                Pay
              </button>
            )}
          </td>
        </tr>
        {isOpen && (
          <tr className="bg-muted/40">
            <td />
            <td colSpan={filter !== "unpaid" ? 8 : 7} className="px-3 pb-3 pt-0 text-[12px]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
                  <dt>Bill date</dt>
                  <dd className="text-foreground">{shortDate(b.expenseDate)}</dd>
                  <dt>Invoice #</dt>
                  <dd className="text-foreground">{b.billNumber || "—"}</dd>
                  <dt>Category</dt>
                  <dd className="text-foreground">{EXPENSE_TYPE_LABEL[b.expenseType]}</dd>
                  <dt>Job</dt>
                  <dd className="text-foreground">{job ? <Link href={job.href} className="hover:underline">{job.label}</Link> : "—"}</dd>
                  {b.notes && (
                    <>
                      <dt>Notes</dt>
                      <dd className="text-foreground">{b.notes}</dd>
                    </>
                  )}
                </dl>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => editBill(b)} className="font-medium text-primary hover:underline">Edit</button>
                  {confirm?.id === b.id && confirm.action === "delete" ? (
                    <span className="inline-flex gap-1">
                      <button type="button" disabled={busy} onClick={() => deleteBill(b)} className="rounded-md bg-danger px-2 py-1 font-medium text-danger-foreground disabled:opacity-50">
                        Delete bill
                      </button>
                      <button type="button" onClick={() => setConfirm(null)} className="px-1 text-muted-foreground hover:text-foreground">Keep</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirm({ id: b.id, action: "delete" })} className="text-muted-foreground hover:text-danger">Delete</button>
                  )}
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  return (
    <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Vendor bills</h1>
            <p className="text-[12px] text-muted-foreground">
              Invoices from suppliers and vendors. Crew, subs and agents are paid in{" "}
              <Link href="/payroll" className="text-primary hover:underline">Payroll</Link>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setForm(form ? null : blankForm());
              setError(null);
            }}
            className="whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            {form ? "Cancel" : "Add bill"}
          </button>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
          {cell("Overdue", sum(overdue), overdue.length, "text-danger", () => setFilter("unpaid"))}
          {cell(`Due in ${DUE_SOON_DAYS} days`, sum(dueSoon), dueSoon.length, "text-warning", () => setFilter("unpaid"))}
          {cell("Later", sum(later), later.length, "text-foreground", () => setFilter("unpaid"))}
          {cell("Paid this month", sum(paidThisMonth), paidThisMonth.length, "text-success", () => setFilter("paid"))}
        </div>

        {/* ---------- Add / edit ---------- */}
        {form && (
          <section className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="mb-2 text-[12px] font-semibold text-foreground">{form.id ? "Edit bill" : "New bill"}</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="col-span-2">
                <span className={LABEL}>Vendor</span>
                {vendorDir && (
                  <CreateOrSelect
                    adapter={vendorDir}
                    value={form.vendorId}
                    valueLabel={form.vendor || null}
                    onChange={(opt: DirectoryOption | null) => setForm({ ...form, vendorId: opt?.id ?? null, vendor: opt?.label ?? "" })}
                    placeholder="Search or add a vendor"
                  />
                )}
              </div>
              <label className="block">
                <span className={LABEL}>Amount</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className={FIELD} />
              </label>
              <label className="block">
                <span className={LABEL}>Invoice #</span>
                <input value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} placeholder="Optional" className={FIELD} />
              </label>
              {form.repeat === "none" && (
                <label className="block">
                  <span className={LABEL}>Bill date</span>
                  <input type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} className={FIELD} />
                </label>
              )}
              <label className="block">
                <span className={LABEL}>{form.repeat === "none" ? "Due date" : "First due"}</span>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={FIELD} />
              </label>
              <label className="block">
                <span className={LABEL}>Category</span>
                <select value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value as ExpenseType })} className={FIELD}>
                  {EXPENSE_TYPES.map((t) => (
                    <option key={t} value={t}>{EXPENSE_TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={LABEL}>Job</span>
                <select value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} className={FIELD}>
                  {jobOptions}
                </select>
              </label>
              {!form.id && (
                <label className="block">
                  <span className={LABEL}>Repeats</span>
                  <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value as "none" | BillFrequency })} className={FIELD}>
                    <option value="none">Does not repeat</option>
                    {BILL_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{BILL_FREQUENCY_LABEL[f]}</option>
                    ))}
                  </select>
                </label>
              )}
              {!form.id && form.repeat !== "none" && (
                <>
                  <label className="block">
                    <span className={LABEL}>Ends</span>
                    <select value={form.endMode} onChange={(e) => setForm({ ...form, endMode: e.target.value as "never" | "on" | "after" })} className={FIELD}>
                      <option value="never">Never</option>
                      <option value="on">On a date</option>
                      <option value="after">After a number of bills</option>
                    </select>
                  </label>
                  {form.endMode === "on" && (
                    <label className="block">
                      <span className={LABEL}>End date</span>
                      <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={FIELD} />
                    </label>
                  )}
                  {form.endMode === "after" && (
                    <label className="block">
                      <span className={LABEL}>Number of bills</span>
                      <input type="number" min="1" value={form.occurrences} onChange={(e) => setForm({ ...form, occurrences: e.target.value })} placeholder="12" className={FIELD} />
                    </label>
                  )}
                </>
              )}
              <label className="col-span-2 block md:col-span-4">
                <span className={LABEL}>Notes</span>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" className={FIELD} />
              </label>
            </div>
            {form.repeat !== "none" && !form.id && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                A bill is added automatically each time one comes due. A repeating bill is attached to the project, not a single estimate.
              </p>
            )}
            <div className="mt-2 flex justify-end gap-2 text-[13px]">
              <button type="button" onClick={() => setForm(null)} className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">Cancel</button>
              <button type="button" onClick={saveForm} disabled={saving} className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving…" : form.id ? "Save changes" : form.repeat === "none" ? "Add bill" : "Set up repeating bill"}
              </button>
            </div>
          </section>
        )}

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
        {notice && <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">{notice}</div>}

        {/* ---------- Pay panel: one payment, one date, one check # ---------- */}
        {pay && payBills.length > 0 && (
          <section className="rounded-lg border border-primary/30 bg-card p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[13px] font-semibold text-foreground">
                Pay {vendorName(payBills[0])} · {money(sum(payBills))}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {payBills.map((b) => b.billNumber ? `#${b.billNumber}` : `due ${shortDate(b.dueDate)}`).join(", ")}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="block">
                <span className={LABEL}>Paid on</span>
                <input type="date" value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} className={FIELD} />
              </label>
              <label className="block">
                <span className={LABEL}>Method</span>
                <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className={FIELD}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={LABEL}>{pay.method === "check" ? "Check #" : "Reference"}</span>
                <input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="Optional" className={FIELD} />
              </label>
              <div className="col-span-2 flex items-end justify-end gap-2 text-[13px] sm:col-span-1">
                <button type="button" onClick={() => setPay(null)} className="h-8 rounded-md px-3 text-muted-foreground hover:text-foreground">Cancel</button>
                <button type="button" disabled={busy} onClick={confirmPay} className="h-8 rounded-md bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {busy ? "Saving…" : `Record payment`}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ---------- Filters ---------- */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 text-[13px]">
            {(["unpaid", "paid", "repeating", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  setOpenId(null);
                  setConfirm(null);
                  setSelected(new Set());
                }}
                className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {f === "unpaid" ? "Unpaid" : f === "paid" ? "Paid" : f === "repeating" ? "Repeating" : "All"}{" "}
                <span className="font-normal text-muted-foreground">{counts[f]}</span>
              </button>
            ))}
          </div>
          {filter !== "repeating" && (
            <div className="flex gap-2">
              <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className={`${FIELD} w-40`} aria-label="Vendor">
                <option value="">All vendors</option>
                {vendors.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className={`${FIELD} w-40`} />
            </div>
          )}
        </div>

        {/* ---------- Table ---------- */}
        {loading ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : filter === "repeating" ? (
          schedules.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-muted-foreground">No repeating bills. Add a bill and choose how often it repeats.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className={HEAD}>
                  <tr>
                    <th>Vendor</th>
                    <th>How often</th>
                    <th>Next due</th>
                    <th>Ends</th>
                    <th className="text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schedules.map((s) => {
                    const left = s.maxOccurrences != null ? s.maxOccurrences - s.occurrencesGenerated : null;
                    const job = s.projectId ? { label: projectName.get(s.projectId) ?? "Project", href: `/projects/${s.projectId}` } : null;
                    return (
                      <tr key={s.id} className={`align-top ${s.isActive ? "" : "text-muted-foreground"}`}>
                        <td className="px-3 py-2.5">
                          <div className={`font-semibold ${s.vendor ? "" : "text-muted-foreground"}`}>{s.vendor || "No vendor"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {EXPENSE_TYPE_LABEL[s.expenseType]}
                            {job && <> · <Link href={job.href} className="hover:underline">{job.label}</Link></>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {s.intervalCount > 1 ? `Every ${s.intervalCount} ${s.frequency === "weekly" ? "weeks" : s.frequency === "monthly" ? "months" : "years"}` : BILL_FREQUENCY_LABEL[s.frequency]}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{s.isActive ? shortDate(s.nextDueDate) : <span className="text-[12px]">Paused</span>}</td>
                        <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                          {s.endDate ? shortDate(s.endDate) : left != null ? `After ${left} more` : "Never"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {editAmount?.id === s.id ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                autoFocus
                                type="number"
                                min="0"
                                step="0.01"
                                value={editAmount.value}
                                onChange={(e) => setEditAmount({ id: s.id, value: e.target.value })}
                                className={`${FIELD} w-24 text-right`}
                              />
                              <button
                                type="button"
                                disabled={busy || !(parseFloat(editAmount.value) > 0)}
                                onClick={() => updateSchedule(s, { amount: parseFloat(editAmount.value) }, "Amount updated for future bills.")}
                                className="rounded-md bg-primary px-2 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                              >
                                Save
                              </button>
                            </span>
                          ) : (
                            <button type="button" title="Change the amount of future bills" onClick={() => setEditAmount({ id: s.id, value: String(s.amount) })} className="font-semibold hover:text-primary hover:underline">
                              {money(s.amount)}
                            </button>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-[12px]">
                          {confirm?.id === s.id && confirm.action === "stop" ? (
                            <span className="inline-flex gap-1">
                              <button type="button" disabled={busy} onClick={() => stopSchedule(s)} className="rounded-md bg-danger px-2 py-1 font-medium text-danger-foreground disabled:opacity-50">
                                Stop for good
                              </button>
                              <button type="button" onClick={() => setConfirm(null)} className="px-1 text-muted-foreground hover:text-foreground">Keep</button>
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => updateSchedule(s, { isActive: !s.isActive }, s.isActive ? "Paused. No new bills until you resume." : "Resumed.")}
                                className="text-primary hover:underline"
                              >
                                {s.isActive ? "Pause" : "Resume"}
                              </button>
                              <button type="button" onClick={() => setConfirm({ id: s.id, action: "stop" })} className="ml-3 text-muted-foreground hover:text-danger">
                                Stop
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : groups.every((g) => g.rows.length === 0) ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">
            {filter === "unpaid" ? "No unpaid bills." : bills.length === 0 ? "No bills yet. Add one to start tracking what you owe vendors." : "No bills match."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-left text-[13px]">
              <thead className={HEAD}>
                <tr>
                  <th className="w-8 !pl-3 !pr-0" />
                  <th>Vendor</th>
                  <th className="hidden md:table-cell">Invoice #</th>
                  <th className="hidden md:table-cell">Job</th>
                  <th className="hidden lg:table-cell">Category</th>
                  <th className="hidden md:table-cell">Due</th>
                  {filter !== "unpaid" && <th className="hidden md:table-cell">Paid</th>}
                  <th className="text-right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map((g) =>
                  g.rows.length === 0 ? null : (
                    <Fragment key={g.key}>
                      {g.title && (
                        <tr className="bg-muted/30">
                          <td colSpan={filter !== "unpaid" ? 9 : 8} className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${g.tone}`}>
                            {g.title} · {money(sum(g.rows))}
                          </td>
                        </tr>
                      )}
                      {g.rows.map((b) => (
                        <BillRow key={b.id} b={b} />
                      ))}
                    </Fragment>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
        {/* Below the table and pinned to the bottom of the screen, so ticking a box never moves the rows. */}
        {selectedBills.length > 0 && !pay && (
          <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-card px-3 py-2 text-[13px] shadow-sm md:bottom-3">
            <span>
              <span className="font-semibold text-foreground">{selectedBills.length} {selectedBills.length === 1 ? "bill" : "bills"}</span>{" "}
              <span className="text-muted-foreground">from {selectedVendor} · </span>
              <span className="font-semibold tabular-nums text-foreground">{money(sum(selectedBills))}</span>
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setSelected(new Set())} className="px-2 text-muted-foreground hover:text-foreground">Clear</button>
              <button type="button" onClick={() => openPay([...selected])} className="rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground hover:bg-primary/90">
                Pay selected
              </button>
            </span>
          </div>
        )}

        {filter === "unpaid" && unpaid.length > 1 && (
          <p className="text-[11px] text-muted-foreground">Tick bills from the same vendor to pay them together with one check.</p>
        )}
      </div>
    </PageContainer>
  );
}

export default function BillsPage() {
  return (
    <RequirePermission resource="expense" action="view">
      <BillsContent />
    </RequirePermission>
  );
}
